use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger, MockAuth, MockAuthInvoke},
    IntoVal,
};
struct Fixture {
    e: Env,
    book: Address,
    issuer: Address,
    token: Address,
    lender: Address,
    borrower: Address,
    buyer: Address,
    id: Address,
}
impl Fixture {
    fn new() -> Self {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().with_mut(|l| {
            l.timestamp = 1000;
            l.max_entry_ttl = TTL + 100;
        });
        let issuer = Address::generate(&e);
        let token = e
            .register_stellar_asset_contract_v2(issuer.clone())
            .address();
        let book = e.register(LoanBook, (issuer.clone(), token.clone(), 7000u32, 8500u32));
        let f = Self {
            lender: Address::generate(&e),
            borrower: Address::generate(&e),
            buyer: Address::generate(&e),
            id: Address::generate(&e),
            e,
            book,
            issuer,
            token,
        };
        token::StellarAssetClient::new(&f.e, &f.token).mint(&f.lender, &(1000 * SCALE));
        f
    }
    fn c(&self) -> LoanBookClient<'_> {
        LoanBookClient::new(&self.e, &self.book)
    }
    fn open(&self) {
        self.c().open(
            &self.id,
            &self.borrower,
            &self.lender,
            &(200 * SCALE),
            &(100 * SCALE),
        );
    }
    fn balance(&self, a: &Address) -> i128 {
        token::Client::new(&self.e, &self.token).balance(a)
    }
    fn mint(&self, a: &Address, n: i128) {
        token::StellarAssetClient::new(&self.e, &self.token).mint(a, &n);
    }
    fn default(&self, price: i128) {
        self.open();
        self.c().publish_price(&self.id, &price);
        self.c().mark_default(&self.id);
    }
}
#[test]
fn disbursement_atomic_and_unique() {
    let f = Fixture::new();
    let c = f.c();
    f.open();
    assert_eq!(f.balance(&f.borrower), 100 * SCALE);
    assert_eq!(
        c.try_open(
            &f.id,
            &f.borrower,
            &f.lender,
            &(200 * SCALE),
            &(100 * SCALE)
        ),
        Err(Ok(Error::Exists))
    );
    assert_eq!(f.balance(&f.borrower), 100 * SCALE);
    let other = Address::generate(&f.e);
    assert!(c
        .try_open(
            &other,
            &f.borrower,
            &f.lender,
            &(4000 * SCALE),
            &(2000 * SCALE)
        )
        .is_err());
    assert_eq!(c.try_get_loan(&other), Err(Ok(Error::Missing)));
    assert_eq!(f.balance(&f.borrower), 100 * SCALE);
}
#[test]
fn validates_amounts_and_cap() {
    let f = Fixture::new();
    let c = f.c();
    for (face, principal) in [
        (0, 1),
        (-1, 1),
        (200, 0),
        (200, -1),
        (200, 101),
        (i128::MAX, 1),
    ] {
        assert!(c
            .try_open(&f.id, &f.borrower, &f.lender, &face, &principal)
            .is_err());
    }
    c.open(&f.id, &f.borrower, &f.lender, &200, &100);
    assert_eq!(c.get_loan(&f.id).loan.interest, 1);
}
#[test]
fn thresholds_exact_and_recovery() {
    // principal 149 gives debt exactly 150; face 300, enabling exact rational boundaries.
    for (threshold, price) in [(7000u32, 5_000_000i128), (8500, 5_000_000)] {
        let f = Fixture::new();
        let c = f.c();
        // debt 150, value 150. Choose face to make debt/value equal requested threshold.
        let principal = if threshold == 7000 { 10430 } else { 12665 };
        // debt 10500 or 12750; collateral at price .5 is 15000.
        c.open(&f.id, &f.borrower, &f.lender, &30000, &principal);
        c.publish_price(&f.id, &(price + 1000));
        if threshold == 7000 {
            assert_eq!(c.try_flag_margin(&f.id), Err(Ok(Error::Healthy)));
        } else {
            assert_eq!(c.try_mark_default(&f.id), Err(Ok(Error::Healthy)));
        }
        c.publish_price(&f.id, &price);
        assert_eq!(c.get_loan(&f.id).health_bps, threshold as i128);
        if threshold == 7000 {
            c.flag_margin(&f.id);
            c.flag_margin(&f.id);
            c.publish_price(&f.id, &SCALE);
            assert_eq!(c.get_loan(&f.id).loan.status, Status::Active);
            c.publish_price(&f.id, &(price - 1000));
            c.flag_margin(&f.id);
        } else {
            c.mark_default(&f.id);
            c.mark_default(&f.id);
        }
    }
}
#[test]
fn healthy_and_overdue() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    assert_eq!(c.try_mark_default(&f.id), Err(Ok(Error::Healthy)));
    let due = c.get_loan(&f.id).loan.due;
    f.e.ledger().with_mut(|l| l.timestamp = due);
    assert_eq!(c.try_mark_default(&f.id), Err(Ok(Error::Healthy)));
    f.e.ledger().with_mut(|l| l.timestamp = due + 1);
    c.mark_default(&f.id);
    assert_eq!(c.get_loan(&f.id).loan.status, Status::Defaulted);
}
#[test]
fn repayment_and_failure_rollback() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    assert!(c.try_repay(&f.id).is_err());
    assert_eq!(c.get_loan(&f.id).loan.status, Status::Active);
    f.mint(&f.borrower, c.get_loan(&f.id).loan.interest);
    c.repay(&f.id);
    let b = f.balance(&f.lender);
    c.repay(&f.id);
    assert_eq!(f.balance(&f.lender), b);
    assert_eq!(f.balance(&f.borrower), 0);
    assert_eq!(c.try_mark_default(&f.id), Err(Ok(Error::State)));
    assert_eq!(c.try_publish_price(&f.id, &1), Err(Ok(Error::State)));
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &c.get_price(&f.id)),
        Err(Ok(Error::State))
    );
}
#[test]
fn liquidation_surplus_shortfall_and_atomicity() {
    for price in [5_500_000, 4_000_000] {
        let f = Fixture::new();
        f.default(price);
        let c = f.c();
        assert_eq!(
            c.try_liquidate(&f.id, &f.buyer, &c.get_price(&f.id)),
            Err(Ok(Error::Buyer))
        );
        c.set_buyer(&f.buyer, &true);
        let v = c.get_loan(&f.id);
        f.mint(&f.buyer, v.debt.min(v.value));
        if v.value > v.debt {
            assert!(c
                .try_liquidate(&f.id, &f.buyer, &c.get_price(&f.id))
                .is_err());
            assert_eq!(f.balance(&f.lender), 900 * SCALE);
            assert_eq!(c.get_loan(&f.id).loan.status, Status::Defaulted);
            f.mint(&f.buyer, v.value - v.debt);
        }
        c.liquidate(&f.id, &f.buyer, &c.get_price(&f.id));
        let l = c.get_loan(&f.id).loan;
        assert_eq!(l.loss, (v.debt - v.value).max(0));
        assert_eq!(l.surplus, (v.value - v.debt).max(0));
        assert_eq!(f.balance(&f.borrower), 100 * SCALE + l.surplus);
        assert_eq!(f.balance(&f.lender), 900 * SCALE + v.debt.min(v.value));
        assert_eq!(c.try_repay(&f.id), Err(Ok(Error::State)));
        assert_eq!(
            c.try_liquidate(&f.id, &f.buyer, &c.get_price(&f.id)),
            Err(Ok(Error::State))
        );
    }
}
#[test]
fn authorization_and_isolated_prices() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    let second = Address::generate(&f.e);
    c.open(
        &second,
        &f.borrower,
        &f.lender,
        &(200 * SCALE),
        &(100 * SCALE),
    );
    f.e.mock_auths(&[]);
    assert!(c.try_publish_price(&f.id, &6_500_000).is_err());
    assert!(c.try_set_buyer(&f.buyer, &true).is_err());
    assert!(c.try_repay(&f.id).is_err());
    assert!(c
        .try_open(&Address::generate(&f.e), &f.borrower, &f.lender, &200, &100)
        .is_err());
    c.mock_auths(&[MockAuth {
        address: &f.issuer,
        invoke: &MockAuthInvoke {
            contract: &f.book,
            fn_name: "publish_price",
            args: (f.id.clone(), 6_500_000i128).into_val(&f.e),
            sub_invokes: &[],
        },
    }])
    .publish_price(&f.id, &6_500_000);
    assert_eq!(c.get_price(&second), SCALE);
    f.e.mock_all_auths();
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &c.get_price(&f.id)),
        Err(Ok(Error::State))
    );
    c.publish_price(&f.id, &5_500_000);
    c.mark_default(&f.id);
    c.set_buyer(&f.buyer, &true);
    f.e.mock_auths(&[]);
    assert!(c
        .try_liquidate(&f.id, &f.buyer, &c.get_price(&f.id))
        .is_err());
}
#[test]
fn ttl_and_buyer_revocation() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    c.set_buyer(&f.buyer, &true);
    c.set_buyer(&f.buyer, &false);
    assert!(!c.is_buyer(&f.buyer));
    f.e.as_contract(&f.book, || {
        assert!(f.e.storage().persistent().get_ttl(&Key::Loan(f.id.clone())) >= 60 * 17280)
    });
    for p in [0, -1, SCALE + 1] {
        assert_eq!(c.try_publish_price(&f.id, &p), Err(Ok(Error::Invalid)));
    }
}

#[test]
fn terminal_default_and_quote_protection() {
    let f = Fixture::new();
    f.default(5_500_000);
    let c = f.c();
    c.set_buyer(&f.buyer, &true);
    assert_eq!(c.try_repay(&f.id), Err(Ok(Error::State)));
    assert_eq!(c.try_flag_margin(&f.id), Err(Ok(Error::State)));
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &5_400_000),
        Err(Ok(Error::PriceChanged))
    );
    c.publish_price(&f.id, &SCALE);
    assert_eq!(c.get_loan(&f.id).loan.status, Status::Defaulted);
    c.set_buyer(&f.buyer, &false);
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &SCALE),
        Err(Ok(Error::Buyer))
    );
}

#[test]
fn lender_can_be_buyer_and_margin_can_be_repaid() {
    let f = Fixture::new();
    f.default(5_500_000);
    let c = f.c();
    c.set_buyer(&f.lender, &true);
    let before = f.balance(&f.lender);
    c.liquidate(&f.id, &f.lender, &5_500_000);
    let l = c.get_loan(&f.id).loan;
    assert_eq!(f.balance(&f.lender), before - l.surplus);
    let g = Fixture::new();
    g.open();
    let c = g.c();
    c.publish_price(&g.id, &6_500_000);
    c.flag_margin(&g.id);
    g.mint(&g.borrower, c.get_loan(&g.id).loan.interest);
    c.repay(&g.id);
    assert_eq!(c.get_loan(&g.id).loan.status, Status::Repaid);
}

#[test]
fn events_and_retries() {
    use soroban_sdk::testutils::Events;
    let f = Fixture::new();
    f.open();
    let c = f.c();
    c.publish_price(&f.id, &6_500_000);
    assert_eq!(f.e.events().all().events().len(), 1);
    c.flag_margin(&f.id);
    assert_eq!(f.e.events().all().events().len(), 1);
    c.flag_margin(&f.id);
    assert_eq!(f.e.events().all().events().len(), 0);
    c.publish_price(&f.id, &SCALE);
    assert_eq!(f.e.events().all().events().len(), 2);
    c.publish_price(&f.id, &SCALE);
    assert_eq!(f.e.events().all().events().len(), 0);
}
