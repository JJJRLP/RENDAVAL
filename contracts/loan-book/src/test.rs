extern crate std;
use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger, MockAuth, MockAuthInvoke},
    IntoVal,
};
use std::string::ToString;
struct Fixture {
    e: Env,
    book: Address,
    rules: Address,
    issuer: Address,
    operator: Address,
    token: Address,
    lender: Address,
    borrower: Address,
    buyer: Address,
    id: Address,
    series: Symbol,
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
        let asset = e.register_stellar_asset_contract_v2(issuer.clone());
        asset
            .issuer()
            .set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
        asset
            .issuer()
            .set_flag(soroban_sdk::testutils::IssuerFlags::ClawbackEnabledFlag);
        let token = asset.address();
        let operator = Address::generate(&e);
        let book = Address::generate(&e);
        let rules = e.register(
            rendaval_bond_rules::BondRules,
            (issuer.clone(), book.clone()),
        );
        e.register_at(
            &book,
            LoanBook,
            (
                operator.clone(),
                issuer.clone(),
                token.clone(),
                rules.clone(),
                7000u32,
                8500u32,
                2500u32,
                86400u64,
                500u32,
            ),
        );
        let f = Self {
            lender: Address::generate(&e),
            borrower: Address::generate(&e),
            buyer: Address::generate(&e),
            id: Address::generate(&e),
            series: Symbol::new(&e, "BOND_A"),
            e,
            book,
            rules,
            issuer,
            operator,
            token,
        };
        token::StellarAssetClient::new(&f.e, &f.token).mint(&f.lender, &(1000 * SCALE));
        token::StellarAssetClient::new(&f.e, &f.token).set_admin(&f.rules);
        f.c().register_series(&f.series, &f.token);
        f.c().list_series(&f.series);
        f.mint(&f.id, 200 * SCALE);
        f
    }
    fn c(&self) -> LoanBookClient<'_> {
        LoanBookClient::new(&self.e, &self.book)
    }
    fn open(&self) {
        self.c().open(
            &self.id,
            &self.series,
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
    fn publish(&self, id: &Address, price: i128) {
        let c = self.c();
        let mut old = c.get_price(id);
        while (price - old).abs() * 10000 > old * 2500 {
            old = if price < old {
                old - old / 4
            } else {
                old + old / 4
            };
            c.publish_price(&c.get_loan(id).loan.asset, &old);
        }
        c.publish_price(&c.get_loan(id).loan.asset, &price);
    }
    fn default(&self, price: i128) {
        self.open();
        self.publish(&self.id, price);
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
            &f.series,
            &f.borrower,
            &f.lender,
            &(200 * SCALE),
            &(100 * SCALE)
        ),
        Err(Ok(Error::Exists))
    );
    assert_eq!(f.balance(&f.borrower), 100 * SCALE);
    let other = Address::generate(&f.e);
    f.mint(&other, 4000 * SCALE); // reach the payout and fail on lender funds
    assert!(c
        .try_open(
            &other,
            &f.series,
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
            .try_open(&f.id, &f.series, &f.borrower, &f.lender, &face, &principal)
            .is_err());
    }
    c.open(&f.id, &f.series, &f.borrower, &f.lender, &200, &100);
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
        c.open(&f.id, &f.series, &f.borrower, &f.lender, &30000, &principal);
        f.publish(&f.id, price + 1000);
        if threshold == 7000 {
            assert_eq!(c.try_flag_margin(&f.id), Err(Ok(Error::Healthy)));
        } else {
            assert_eq!(c.try_mark_default(&f.id), Err(Ok(Error::Healthy)));
        }
        f.publish(&f.id, price);
        assert_eq!(c.get_loan(&f.id).health_bps, threshold as i128);
        if threshold == 7000 {
            c.flag_margin(&f.id);
            c.flag_margin(&f.id);
            f.publish(&f.id, SCALE);
            assert_eq!(c.get_loan(&f.id).loan.status, Status::Active);
            f.publish(&f.id, price - 1000);
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
    assert_eq!(c.try_mark_default(&f.id), Err(Ok(Error::StalePrice)));
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
    // Series remains an independent feed after a holder repays.
    c.publish_price(&f.series, &SCALE);
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
        let mut v = c.get_loan(&f.id);
        v.value = v.value * 9500 / 10000;
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
    f.mint(&second, 200 * SCALE);
    let series2 = Symbol::new(&f.e, "BOND_B");
    c.register_series(&series2, &f.token);
    c.open(
        &second,
        &series2,
        &f.borrower,
        &f.lender,
        &(200 * SCALE),
        &(100 * SCALE),
    );
    f.e.mock_auths(&[]);
    assert!(c.try_publish_price(&f.series, &6_500_000).is_err());
    assert!(c.try_set_buyer(&f.buyer, &true).is_err());
    assert!(c.try_repay(&f.id).is_err());
    assert!(c
        .try_open(
            &Address::generate(&f.e),
            &f.series,
            &f.borrower,
            &f.lender,
            &200,
            &100
        )
        .is_err());
    c.mock_auths(&[MockAuth {
        address: &f.issuer,
        invoke: &MockAuthInvoke {
            contract: &f.book,
            fn_name: "publish_price",
            args: (f.series.clone(), 8_000_000i128).into_val(&f.e),
            sub_invokes: &[],
        },
    }])
    .publish_price(&f.series, &8_000_000);
    assert_eq!(c.get_price(&second), SCALE);
    f.e.mock_all_auths();
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &c.get_price(&f.id)),
        Err(Ok(Error::State))
    );
    f.publish(&f.id, 5_500_000);
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
        assert_eq!(c.try_publish_price(&f.series, &p), Err(Ok(Error::Invalid)));
    }
}

#[test]
fn terminal_default_and_quote_protection() {
    let f = Fixture::new();
    f.default(5_500_000);
    let c = f.c();
    c.set_buyer(&f.buyer, &true);
    assert!(c.try_repay(&f.id).is_err()); // insufficient interest, still curable
    assert_eq!(c.try_flag_margin(&f.id), Err(Ok(Error::State)));
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &5_400_000),
        Err(Ok(Error::PriceChanged))
    );
    f.publish(&f.id, SCALE);
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
    g.publish(&g.id, 6_500_000);
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
    f.publish(&f.id, 6_500_000);
    assert_eq!(f.e.events().all().events().len(), 1);
    c.flag_margin(&f.id);
    assert_eq!(f.e.events().all().events().len(), 1);
    c.flag_margin(&f.id);
    assert_eq!(f.e.events().all().events().len(), 0);
    f.publish(&f.id, SCALE);
    assert_eq!(f.e.events().all().events().len(), 1);
    f.publish(&f.id, SCALE);
    assert_eq!(f.e.events().all().events().len(), 0);
}

#[test]
fn operator_required_even_with_lender_signature() {
    let f = Fixture::new();
    let c = f.c();
    f.e.mock_auths(&[]);
    assert!(c
        .mock_auths(&[MockAuth {
            address: &f.lender,
            invoke: &MockAuthInvoke {
                contract: &f.book,
                fn_name: "open",
                args: (
                    f.id.clone(),
                    f.series.clone(),
                    f.borrower.clone(),
                    f.lender.clone(),
                    200i128,
                    100i128
                )
                    .into_val(&f.e),
                sub_invokes: &[],
            },
        }])
        .try_open(&f.id, &f.series, &f.borrower, &f.lender, &200, &100)
        .is_err());
    assert_eq!(c.try_get_loan(&f.id), Err(Ok(Error::Missing)));
    assert_eq!(f.balance(&f.borrower), 0);
    f.e.mock_all_auths();
    f.open();
    assert_eq!(c.get_config().operator, f.operator);
}
#[test]
fn step_boundaries_and_demo_path() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    assert_eq!(
        c.try_publish_price(&f.series, &7_499_999),
        Err(Ok(Error::PriceStep))
    );
    c.publish_price(&f.series, &7_500_000);
    assert_eq!(
        c.try_publish_price(&f.series, &9_375_001),
        Err(Ok(Error::PriceStep))
    );
    c.publish_price(&f.series, &9_375_000);
    c.publish_price(&f.series, &SCALE);
    for p in [8_000_000, 6_500_000, 5_000_000] {
        c.publish_price(&f.series, &p);
    }
    assert_eq!(
        c.try_publish_price(&f.series, &SCALE),
        Err(Ok(Error::PriceStep))
    );
    f.publish(&f.id, SCALE);
}
#[test]
fn freshness_refresh_and_overdue_liquidation() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    f.publish(&f.id, 5_500_000);
    f.e.ledger().with_mut(|l| l.timestamp = 1000 + 86401);
    assert_eq!(c.try_mark_default(&f.id), Err(Ok(Error::StalePrice)));
    assert_eq!(c.try_flag_margin(&f.id), Err(Ok(Error::StalePrice)));
    c.publish_price(&f.series, &5_500_000);
    assert_eq!(c.get_loan(&f.id).loan.price_time, 87401);
    f.e.ledger().with_mut(|l| l.timestamp += 86400);
    c.mark_default(&f.id); // age equal to max is accepted
    c.set_buyer(&f.buyer, &true);
    f.mint(&f.buyer, 200 * SCALE);
    f.e.ledger().with_mut(|l| l.timestamp += 1);
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &5_500_000),
        Err(Ok(Error::StalePrice))
    );
    c.publish_price(&f.series, &5_500_000);
    f.e.ledger().with_mut(|l| l.timestamp += 86400);
    c.liquidate(&f.id, &f.buyer, &5_500_000);
    let g = Fixture::new();
    g.open();
    let c = g.c();
    g.e.ledger().with_mut(|l| l.timestamp += TERM + 1);
    c.mark_default(&g.id);
    c.set_buyer(&g.buyer, &true);
    assert_eq!(
        c.try_liquidate(&g.id, &g.buyer, &SCALE),
        Err(Ok(Error::StalePrice))
    );
}
#[test]
fn cure_is_full_atomic_and_retry_safe() {
    let f = Fixture::new();
    f.default(5_500_000);
    let c = f.c();
    assert!(c.try_repay(&f.id).is_err());
    assert_eq!(c.get_loan(&f.id).loan.status, Status::Defaulted);
    f.mint(&f.borrower, c.get_loan(&f.id).loan.interest);
    c.repay(&f.id);
    let balance = f.balance(&f.lender);
    c.repay(&f.id);
    assert_eq!(f.balance(&f.lender), balance);
    assert_eq!(c.get_loan(&f.id).loan.status, Status::Repaid);
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &5_500_000),
        Err(Ok(Error::State))
    );
}
#[test]
fn sep40_reads_and_retention() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    let asset = Asset::Other(c.get_loan(&f.id).loan.asset);
    assert_eq!(c.base(), Asset::Other(Symbol::new(&f.e, "USD")));
    assert_eq!(c.decimals(), 7);
    assert_eq!(c.resolution(), 1);
    assert_eq!(c.assets(), soroban_sdk::vec![&f.e, asset.clone()]);
    let p = PriceData {
        price: SCALE,
        timestamp: 1000,
    };
    assert_eq!(c.lastprice(&asset), Some(p.clone()));
    assert_eq!(c.price(&asset, &1000), Some(p.clone()));
    assert_eq!(c.prices(&asset, &1), Some(soroban_sdk::vec![&f.e, p]));
    assert_eq!(c.prices(&asset, &0), None);
    assert_eq!(c.prices(&asset, &2), None);
    assert_eq!(c.price(&asset, &999), None);
    assert_eq!(c.lastprice(&Asset::Stellar(f.id.clone())), None);
    assert_eq!(
        c.lastprice(&Asset::Other(Symbol::new(&f.e, "unknown"))),
        None
    );
    f.e.ledger().with_mut(|l| l.timestamp += 1);
    c.publish_price(&f.series, &SCALE);
    assert_eq!(c.price(&asset, &1000), None);
    assert_eq!(c.lastprice(&asset).unwrap().timestamp, 1001);
}

#[test]
fn constructor_guard_boundaries() {
    for (step, age, discount, valid) in [
        (0u32, 1u64, 0u32, false),
        (10001, 1, 0, false),
        (1, 0, 0, false),
        (1, 1, 10000, false),
        (1, 1, 0, true),
        (10000, 1, 9999, true),
    ] {
        let f = Fixture::new();
        let e = f.e.clone();
        e.as_contract(&f.book, || {
            let result = LoanBook::__constructor(
                e.clone(),
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                f.rules.clone(),
                7000,
                8500,
                step,
                age,
                discount,
            );
            assert_eq!(result.is_ok(), valid);
        });
    }
}

#[test]
fn opening_cost_is_independent_of_ten_thousand_existing_loans() {
    let mut f = Fixture::new();
    f.e.set_config(soroban_sdk::testutils::EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    let mut baseline = None;
    for n in 0u32..=10_000 {
        // A real transaction has a fresh host and loads only its footprint.
        // Reusing one SDK host meters its ever-growing cached test state too.
        if n == 10 || n % 100 == 0 {
            let mut e = Env::from_snapshot(f.e.to_snapshot());
            e.set_config(soroban_sdk::testutils::EnvTestConfig {
                capture_snapshot_at_drop: false,
            });
            let mut seed = [0u8; 32];
            seed[..4].copy_from_slice(&(n + 1).to_be_bytes());
            e.host().set_base_prng_seed(seed).unwrap();
            e.mock_all_auths();
            let rebind = |a: &Address| Address::from_str(&e, &a.to_string().to_string());
            f.book = rebind(&f.book);
            f.rules = rebind(&f.rules);
            e.register_at(
                &f.rules,
                rendaval_bond_rules::BondRules,
                (rebind(&f.issuer), f.book.clone()),
            );
            f.operator = rebind(&f.operator);
            f.issuer = rebind(&f.issuer);
            f.token = rebind(&f.token);
            f.borrower = rebind(&f.borrower);
            f.lender = rebind(&f.lender);
            f.buyer = rebind(&f.buyer);
            f.id = rebind(&f.id);
            f.series = Symbol::new(&e, "BOND_A");
            e.register_at(
                &f.book,
                LoanBook,
                (
                    f.operator.clone(),
                    f.issuer.clone(),
                    f.token.clone(),
                    f.rules.clone(),
                    7000u32,
                    8500u32,
                    2500u32,
                    86400u64,
                    500u32,
                ),
            );
            f.e = e;
        }
        let id = Address::generate(&f.e);
        f.mint(&id, 200);
        f.c()
            .open(&id, &f.series, &f.borrower, &f.lender, &200, &100);
        let r = f.e.cost_estimate().resources();
        if n == 10 {
            baseline = Some(r.clone());
        }
        if n == 100 || n == 1000 || n == 10_000 {
            let b = baseline.as_ref().unwrap();
            // Includes token transfer, entry writes, events and TTL rent; native SDK
            // metering excludes Wasm VM overhead, tested separately on testnet.
            assert_eq!(r.write_entries, b.write_entries);
            assert_eq!(r.write_bytes, b.write_bytes);
            assert_eq!(r.memory_read_entries, b.memory_read_entries);
            assert_eq!(r.disk_read_entries, b.disk_read_entries);
            assert_eq!(
                r.persistent_rent_ledger_bytes,
                b.persistent_rent_ledger_bytes
            );
            assert_eq!(r.contract_events_size_bytes, b.contract_events_size_bytes);
            assert_eq!(r.instructions, b.instructions);
            assert_eq!(r.mem_bytes, b.mem_bytes);
            std::println!("existing={n}: {r:?}");
        }
    }
    assert_eq!(f.c().assets().len(), 1);
    // Inspect the backing ledger too: persistent().all() only sees the host cache.
    let snapshot = f.e.to_ledger_snapshot();
    let contract: soroban_sdk::xdr::ScAddress = (&f.book).try_into().unwrap();
    let entries = snapshot
        .ledger_entries
        .iter()
        .filter(|(key, _)| {
            matches!(key.as_ref(), soroban_sdk::xdr::LedgerKey::ContractData(d)
            if d.contract == contract
            && d.durability == soroban_sdk::xdr::ContractDataDurability::Persistent
            && d.key != soroban_sdk::xdr::ScVal::LedgerKeyContractInstance)
        })
        .count();
    // Loan x 10,001 + Series + Assets, including those not touched by the last call.
    assert_eq!(entries, 10_003);
    assert_eq!(f.balance(&f.borrower), 1_000_100);
}

#[test]
fn series_capacity_and_shared_price() {
    let f = Fixture::new();
    let c = f.c();
    f.open();
    let second = Address::generate(&f.e);
    f.mint(&second, 200 * SCALE);
    c.open(
        &second,
        &f.series,
        &f.borrower,
        &f.lender,
        &(200 * SCALE),
        &(100 * SCALE),
    );
    c.publish_price(&f.series, &8_000_000);
    assert_eq!(c.get_price(&f.id), 8_000_000);
    assert_eq!(c.get_price(&second), 8_000_000);
    assert_eq!(
        c.try_register_series(&f.series, &f.token),
        Err(Ok(Error::Exists))
    );
    for n in 1..MAX_LISTED_SERIES {
        let name = Symbol::new(&f.e, &std::format!("SERIES_{n:025}"));
        c.register_series(&name, &f.token);
        c.list_series(&name);
    }
    assert_eq!(c.assets().len(), MAX_LISTED_SERIES);
    use soroban_sdk::xdr::ToXdr;
    assert!(c.assets().to_xdr(&f.e).len() < 5000);
    c.register_series(&Symbol::new(&f.e, "FULL"), &f.token);
    assert_eq!(
        c.try_list_series(&Symbol::new(&f.e, "FULL")),
        Err(Ok(Error::Capacity))
    );
    // Full catalogue does not prevent more loans in an existing series.
    let extra = Address::generate(&f.e);
    f.mint(&extra, 200);
    c.open(&extra, &f.series, &f.borrower, &f.lender, &200, &80);
    assert!(c
        .try_open(
            &Address::generate(&f.e),
            &f.series,
            &f.borrower,
            &f.lender,
            &200,
            &81
        )
        .is_err());
    let stale_id = Address::generate(&f.e);
    f.mint(&stale_id, 200);
    f.e.ledger().with_mut(|l| l.timestamp += 86401);
    assert_eq!(
        c.try_open(&stale_id, &f.series, &f.borrower, &f.lender, &200, &80),
        Err(Ok(Error::StalePrice))
    );
}

#[test]
fn closed_loans_keep_snapshot_and_do_not_renew_rent() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    f.mint(&f.borrower, c.get_loan(&f.id).loan.interest);
    c.repay(&f.id);
    let initial = c.get_loan(&f.id);
    let elapsed = TTL / 2 + 10;
    f.e.ledger().with_mut(|l| l.sequence_number += elapsed);
    let before = f.e.as_contract(&f.book, || {
        f.e.storage().persistent().get_ttl(&Key::Loan(f.id.clone()))
    });
    c.publish_price(&f.series, &8_000_000);
    assert_eq!(c.get_loan(&f.id), initial);
    c.repay(&f.id);
    let after = f.e.as_contract(&f.book, || {
        f.e.storage().persistent().get_ttl(&Key::Loan(f.id.clone()))
    });
    assert_eq!(before, after);
    assert!(after < TTL / 2);
    assert_eq!(
        c.try_open(&f.id, &f.series, &f.borrower, &f.lender, &200, &80),
        Err(Ok(Error::Exists))
    );
    c.set_buyer(&f.buyer, &true);
    c.set_buyer(&f.buyer, &false);
    f.e.as_contract(&f.book, || {
        assert!(!f.e.storage().persistent().has(&Key::Buyer(f.buyer.clone())))
    });
}

#[test]
fn opening_requires_real_authorized_collateral() {
    let f = Fixture::new();
    let c = f.c();
    let id = Address::generate(&f.e);
    assert_eq!(
        c.try_open(&id, &f.series, &f.borrower, &f.lender, &200, &100),
        Err(Ok(Error::Collateral))
    );
    f.mint(&id, 199);
    assert_eq!(
        c.try_open(&id, &f.series, &f.borrower, &f.lender, &200, &100),
        Err(Ok(Error::Collateral))
    );
    f.mint(&id, 1);
    let sac = token::StellarAssetClient::new(&f.e, &f.token);
    sac.set_authorized(&id, &false);
    assert_eq!(
        c.try_open(&id, &f.series, &f.borrower, &f.lender, &200, &100),
        Err(Ok(Error::Collateral))
    );
    assert_eq!(f.balance(&f.borrower), 0);
    assert_eq!(c.try_get_loan(&id), Err(Ok(Error::Missing)));
    sac.set_authorized(&id, &true);
    c.open(&id, &f.series, &f.borrower, &f.lender, &200, &100);
}

#[test]
fn shortfall_changes_health_and_defaults_without_price_or_auth() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    let sac = token::StellarAssetClient::new(&f.e, &f.token);
    sac.clawback(&f.id, &(10 * SCALE));
    let v = c.get_loan(&f.id);
    assert_eq!(v.value, 190 * SCALE);
    assert_eq!(v.shortfall, Some(10 * SCALE));
    assert_eq!(v.health_bps, v.debt * 10000 / v.value);
    assert!(v.health_bps < 7000); // default is not caused by the price ratio
    f.e.ledger().with_mut(|l| l.timestamp += 86401);
    f.e.mock_auths(&[]);
    c.mark_default(&f.id);
    assert_eq!(c.get_loan(&f.id).loan.status, Status::Defaulted);
    c.mark_default(&f.id);
    f.e.mock_all_auths();
    f.mint(&f.borrower, v.loan.interest);
    c.repay(&f.id);
    let closed = c.get_loan(&f.id);
    assert_eq!(closed.loan.status, Status::Repaid);
    assert_eq!(closed.shortfall, Some(10 * SCALE));
    assert_eq!(closed.loan.surplus, 0); // no compensation or bond-return obligation
    sac.clawback(&f.id, &(190 * SCALE));
    assert_eq!(c.get_loan(&f.id), closed); // closing snapshot, no further token reads
}

#[test]
fn frozen_collateral_defaults_but_cannot_be_sold_until_authorized() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    let sac = token::StellarAssetClient::new(&f.e, &f.token);
    sac.set_authorized(&f.id, &false);
    f.e.ledger().with_mut(|l| l.timestamp += 86401);
    f.e.mock_auths(&[]);
    c.mark_default(&f.id);
    let v = c.get_loan(&f.id);
    assert!(!v.loan.collateral.authorized);
    assert_eq!(v.shortfall, Some(0));
    f.e.mock_all_auths();
    c.set_buyer(&f.buyer, &true);
    c.publish_price(&f.series, &SCALE);
    assert_eq!(
        c.try_liquidate(&f.id, &f.buyer, &SCALE),
        Err(Ok(Error::Collateral))
    );
    sac.set_authorized(&f.id, &true);
    assert_eq!(c.get_loan(&f.id).loan.status, Status::Defaulted);
    // Buyer pays only remaining bonds; excess above face never increases payment.
    sac.clawback(&f.id, &(150 * SCALE));
    f.mint(&f.buyer, 100 * SCALE);
    c.liquidate(&f.id, &f.buyer, &SCALE);
    let v = c.get_loan(&f.id);
    assert_eq!(v.loan.proceeds, 475_000_000);
    assert_eq!(v.loan.loss, v.debt - 475_000_000);
    assert_eq!(v.shortfall, Some(150 * SCALE));
}

#[contract]
struct BrokenToken;
#[contractimpl]
impl BrokenToken {
    pub fn __constructor(e: Env, admin: Address) {
        e.storage().instance().set(&1u32, &admin);
    }
    pub fn admin(e: Env) -> Address {
        e.storage().instance().get(&1u32).unwrap()
    }
    pub fn balance(e: Env, _id: Address) -> i128 {
        match e.storage().instance().get::<_, u32>(&0u32).unwrap_or(0) {
            0 => 200 * SCALE,
            1 => -1,
            _ => soroban_sdk::panic_with_error!(&e, Error::Invalid),
        }
    }
    pub fn authorized(_e: Env, _id: Address) -> bool {
        true
    }
    pub fn break_token(e: Env, mode: u32) {
        e.storage().instance().set(&0u32, &mode);
    }
}

#[test]
fn broken_token_is_unknown_and_does_not_affect_other_series_or_repayment() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    let broken = f.e.register(BrokenToken, (f.rules.clone(),));
    let name = Symbol::new(&f.e, "BROKEN");
    c.register_series(&name, &broken);
    let id = Address::generate(&f.e);
    c.open(
        &id,
        &name,
        &f.borrower,
        &f.lender,
        &(200 * SCALE),
        &(100 * SCALE),
    );
    for mode in [1, 2] {
        BrokenTokenClient::new(&f.e, &broken).break_token(&mode);
        let v = c.get_loan(&id);
        assert!(!v.loan.collateral.known);
        assert_eq!(v.shortfall, None);
        assert_eq!(c.try_mark_default(&id), Err(Ok(Error::CollateralRead)));
        assert_eq!(
            c.try_open(
                &Address::generate(&f.e),
                &name,
                &f.borrower,
                &f.lender,
                &200,
                &100
            ),
            Err(Ok(Error::CollateralRead))
        );
        assert_eq!(c.try_mark_default(&f.id), Err(Ok(Error::Healthy)));
        assert_eq!(c.get_loan(&f.id).value, 200 * SCALE);
        assert!(c.lastprice(&Asset::Other(name.clone())).is_some());
        c.publish_price(&f.series, &SCALE);
    }
    f.e.ledger().with_mut(|l| l.timestamp += TERM + 1);
    c.mark_default(&id); // overdue does not need a working token
    c.set_buyer(&f.buyer, &true);
    assert_eq!(
        c.try_liquidate(&id, &f.buyer, &SCALE),
        Err(Ok(Error::CollateralRead))
    );
    f.mint(&f.borrower, c.get_loan(&id).loan.interest);
    c.repay(&id);
    assert!(!c.get_loan(&id).loan.collateral.known);
    assert_eq!(c.try_release_pledge(&id), Err(Ok(Error::CollateralRead)));
    BrokenTokenClient::new(&f.e, &broken).break_token(&1);
    assert_eq!(c.try_release_pledge(&id), Err(Ok(Error::CollateralRead)));
    f.mint(&f.borrower, c.get_loan(&f.id).loan.interest);
    c.repay(&f.id);
    assert_eq!(c.get_loan(&f.id).loan.status, Status::Repaid);
}

#[test]
fn series_registration_cost_is_constant_and_unlisted_quotes_work() {
    let mut f = Fixture::new();
    let mut baseline = None;
    for n in 0u32..=1024 {
        if n % 64 == 0 {
            let mut e = Env::from_snapshot(f.e.to_snapshot());
            let mut seed = [0u8; 32];
            seed[..4].copy_from_slice(&(n + 1).to_be_bytes());
            e.host().set_base_prng_seed(seed).unwrap();
            e.set_config(soroban_sdk::testutils::EnvTestConfig {
                capture_snapshot_at_drop: false,
            });
            e.mock_all_auths();
            let rebind = |a: &Address| Address::from_str(&e, &a.to_string().to_string());
            f.book = rebind(&f.book);
            f.rules = rebind(&f.rules);
            e.register_at(
                &f.rules,
                rendaval_bond_rules::BondRules,
                (rebind(&f.issuer), f.book.clone()),
            );
            f.issuer = rebind(&f.issuer);
            f.operator = rebind(&f.operator);
            f.token = rebind(&f.token);
            e.register_at(
                &f.book,
                LoanBook,
                (
                    f.operator.clone(),
                    f.issuer.clone(),
                    f.token.clone(),
                    f.rules.clone(),
                    7000u32,
                    8500u32,
                    2500u32,
                    86400u64,
                    500u32,
                ),
            );
            f.e = e;
        }
        let name = Symbol::new(&f.e, &std::format!("DEMO_{n:027}"));
        f.c().register_series(&name, &f.token);
        let r = f.e.cost_estimate().resources();
        if n == 64 {
            baseline = Some(r.clone());
        }
        if n == 128 || n == 1024 {
            let b = baseline.as_ref().unwrap();
            assert_eq!(r.instructions, b.instructions);
            assert_eq!(r.mem_bytes, b.mem_bytes);
            assert_eq!(r.write_entries, b.write_entries);
            assert_eq!(r.write_bytes, b.write_bytes);
            assert_eq!(r.memory_read_entries, b.memory_read_entries);
            assert_eq!(r.disk_read_entries, b.disk_read_entries);
            assert_eq!(
                r.persistent_rent_ledger_bytes,
                b.persistent_rent_ledger_bytes
            );
            assert_eq!(r.contract_events_size_bytes, b.contract_events_size_bytes);
            std::println!("series_existing={n}: {r:?}");
        }
    }
    let c = f.c();
    assert_eq!(c.assets().len(), 1);
    let name = Symbol::new(&f.e, "DEMO_000000000000000000000001024");
    let asset = Asset::Other(name.clone());
    assert!(!c.assets().contains(&asset));
    assert_eq!(c.lastprice(&asset).unwrap().price, SCALE);
    assert!(c.price(&asset, &1000).is_some());
    assert!(c.prices(&asset, &1).is_some());
    f.e.mock_auths(&[]);
    assert!(c.try_list_series(&name).is_err());
    assert!(c
        .try_register_series(&Symbol::new(&f.e, "NO_AUTH"), &f.token)
        .is_err());
    f.e.mock_all_auths();
    c.list_series(&name);
    c.list_series(&name);
    assert_eq!(c.assets().len(), 2);
}

#[test]
fn excess_collateral_is_capped_and_total_clawback_records_full_loss() {
    let f = Fixture::new();
    f.mint(&f.id, 200 * SCALE);
    f.open();
    let c = f.c();
    assert_eq!(c.get_loan(&f.id).loan.collateral.balance, 400 * SCALE);
    assert_eq!(c.get_loan(&f.id).value, 200 * SCALE);
    assert_eq!(c.get_loan(&f.id).shortfall, Some(0));
    token::StellarAssetClient::new(&f.e, &f.token).clawback(&f.id, &(400 * SCALE));
    c.mark_default(&f.id);
    c.set_buyer(&f.buyer, &true);
    c.liquidate(&f.id, &f.buyer, &SCALE);
    let v = c.get_loan(&f.id);
    assert_eq!(v.value, 0);
    assert_eq!(v.loan.loss, v.debt);
    assert_eq!(v.loan.proceeds, 0);
    assert_eq!(v.loan.surplus, 0);
    assert_eq!(f.balance(&f.buyer), 0);
}

#[test]
fn frozen_loan_can_be_repaid_without_thawing() {
    let f = Fixture::new();
    f.open();
    let c = f.c();
    token::StellarAssetClient::new(&f.e, &f.token).set_authorized(&f.id, &false);
    c.mark_default(&f.id);
    f.mint(&f.borrower, c.get_loan(&f.id).loan.interest);
    c.repay(&f.id);
    let v = c.get_loan(&f.id);
    assert_eq!(v.loan.status, Status::Repaid);
    assert!(!v.loan.collateral.authorized);
    assert_eq!(v.shortfall, Some(0));
}

#[test]
fn pledge_is_atomic_and_only_terminal_empty_loans_can_release() {
    let f = Fixture::new();
    let r = rendaval_bond_rules::BondRulesClient::new(&f.e, &f.rules);
    // Failure in payout must roll back the mark as well as the loan.
    token::Client::new(&f.e, &f.token).transfer(&f.lender, &f.buyer, &(1000 * SCALE));
    assert!(f
        .c()
        .try_open(
            &f.id,
            &f.series,
            &f.borrower,
            &f.lender,
            &(200 * SCALE),
            &(100 * SCALE)
        )
        .is_err());
    assert!(!r.pledged(&f.token, &f.id));
    f.mint(&f.lender, 1000 * SCALE);
    f.open();
    assert!(r.pledged(&f.token, &f.id));
    assert_eq!(
        r.try_set_authorized(&f.token, &f.id, &false),
        Err(Ok(rendaval_bond_rules::Error::Pledged))
    );
    assert_eq!(f.c().try_release_pledge(&f.id), Err(Ok(Error::State)));
    // Empty but active still cannot release. Mock the holder's own transfer only.
    token::Client::new(&f.e, &f.token).transfer(&f.id, &f.buyer, &(200 * SCALE));
    f.e.mock_auths(&[]);
    assert_eq!(f.c().try_release_pledge(&f.id), Err(Ok(Error::State)));
    // No account (including operator and issuer) can authorize as the book.
    assert!(r.try_release(&f.token, &f.id).is_err());
    assert!(r.try_protect(&f.token, &Address::generate(&f.e)).is_err());
    assert!(r.try_set_authorized(&f.token, &f.id, &false).is_err());
    f.e.mock_all_auths();
    f.mint(&f.id, 200 * SCALE);
    f.mint(&f.borrower, f.c().get_loan(&f.id).loan.interest);
    f.c().repay(&f.id);
    f.e.mock_auths(&[]);
    assert_eq!(f.c().try_release_pledge(&f.id), Err(Ok(Error::Nonempty)));
    assert!(r.pledged(&f.token, &f.id));
    f.e.mock_all_auths();
    token::Client::new(&f.e, &f.token).transfer(&f.id, &f.buyer, &(200 * SCALE));
    f.e.mock_auths(&[]);
    // No mocks: book's direct invocation supplies contract authorization.
    f.c().release_pledge(&f.id);
    f.c().release_pledge(&f.id);
    assert!(!r.pledged(&f.token, &f.id));
    f.e.mock_all_auths();
    r.set_authorized(&f.token, &f.id, &false);
    assert!(!token::StellarAssetClient::new(&f.e, &f.token).authorized(&f.id));
}

#[test]
fn opening_requires_rules_admin_and_correct_book_binding() {
    let f = Fixture::new();
    token::StellarAssetClient::new(&f.e, &f.token).set_admin(&f.issuer);
    assert_eq!(
        f.c().try_open(
            &f.id,
            &f.series,
            &f.borrower,
            &f.lender,
            &(200 * SCALE),
            &(100 * SCALE)
        ),
        Err(Ok(Error::Rules))
    );
    assert_eq!(f.balance(&f.borrower), 0);
    token::StellarAssetClient::new(&f.e, &f.token).set_admin(&f.rules);
    f.e.register_at(
        &f.rules,
        rendaval_bond_rules::BondRules,
        (f.issuer.clone(), Address::generate(&f.e)),
    );
    assert_eq!(
        f.c().try_open(
            &f.id,
            &f.series,
            &f.borrower,
            &f.lender,
            &(200 * SCALE),
            &(100 * SCALE)
        ),
        Err(Ok(Error::Rules))
    );
}

#[test]
fn liquidated_collateral_stays_protected_until_empty() {
    let f = Fixture::new();
    f.default(5_500_000);
    f.c().set_buyer(&f.buyer, &true);
    f.mint(&f.buyer, 200 * SCALE);
    f.c().liquidate(&f.id, &f.buyer, &5_500_000);
    assert_eq!(f.c().try_release_pledge(&f.id), Err(Ok(Error::Nonempty)));
    token::Client::new(&f.e, &f.token).transfer(&f.id, &f.buyer, &(200 * SCALE));
    f.e.mock_auths(&[]);
    f.c().release_pledge(&f.id);
}
