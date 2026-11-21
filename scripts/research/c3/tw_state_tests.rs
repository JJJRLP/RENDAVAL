extern crate std;
use crate::{contract::{EscrowContract, EscrowContractClient}, storage::types::*};
use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, Env, Map, String, vec};

fn setup() -> (Env, Address, Address, Address, Address, Address, Address, Escrow) {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().with_mut(|l| l.max_entry_ttl = 32_000_000);
    let lender = Address::generate(&e);
    let borrower = Address::generate(&e);
    let operator = Address::generate(&e);
    let fee = Address::generate(&e);
    let admin = Address::generate(&e);
    let token = e.register_stellar_asset_contract_v2(admin).address();
    let id = e.register(EscrowContract, ());
    let escrow = Escrow {
        engagement_id: String::from_str(&e, "loan"), title: String::from_str(&e, "loan"),
        description: String::from_str(&e, "loan"), amount: 200_000_000, platform_fee: 0,
        receiver_memo: 0, trustline: Trustline { address: token.clone() },
        roles: Roles { approver: lender.clone(), receiver: borrower.clone(), service_provider: operator.clone(),
            release_signer: operator.clone(), platform: operator.clone(), dispute_resolver: operator.clone() },
        milestones: vec![&e, Milestone { description: String::from_str(&e, "collateral"), status: String::from_str(&e, "pending"), evidence: String::from_str(&e, ""), approved: false }],
        flags: Flags { disputed: false, released: false, resolved: false },
    };
    EscrowContractClient::new(&e, &id).initialize_escrow(&escrow);
    token::StellarAssetClient::new(&e, &token).mint(&lender, &200_000_000);
    (e, id, token, lender, borrower, operator, fee, escrow)
}

#[test]
fn c3_resolution_state_does_not_identify_who_was_paid() {
    let mut states = std::vec::Vec::new();
    for split in [false, true] {
        let (e, id, token, lender, borrower, operator, fee, expected) = setup();
        let c = EscrowContractClient::new(&e, &id);
        c.fund_escrow(&lender, &expected, &200_000_000);
        c.dispute_escrow(&lender);
        let mut distributions = Map::new(&e);
        distributions.set(lender.clone(), if split {100_000_000} else {200_000_000});
        if split { distributions.set(borrower.clone(), 100_000_000); }
        c.resolve_dispute(&operator, &fee, &distributions);
        let t = token::Client::new(&e, &token);
        assert_eq!(t.balance(&id), 0);
        assert_eq!(t.balance(&fee), 600_000);
        assert_eq!(t.balance(&borrower), if split {99_700_000} else {0});
        // Serialize the complete public read, not just selected flags.
        use soroban_sdk::xdr::ToXdr;
        states.push(c.get_escrow().to_xdr(&e).iter().collect::<std::vec::Vec<_>>());
    }
    assert_eq!(states[0], states[1]);
}

#[test]
fn c3_release_does_not_require_a_loan_or_collateral() {
    let (e, id, token, lender, borrower, operator, fee, expected) = setup();
    let c = EscrowContractClient::new(&e, &id);
    c.fund_escrow(&lender, &expected, &200_000_000);
    c.change_milestone_status(&0, &String::from_str(&e, "completed"), &Some(String::from_str(&e, "claimed collateral")), &operator);
    c.approve_milestone(&0, &lender);
    c.release_funds(&operator, &fee);
    assert!(c.get_escrow().flags.released);
    assert_eq!(token::Client::new(&e, &token).balance(&borrower), 199_400_000);
    // No loan book or bond contract was created at all.
}

#[test]
fn c3_late_funding_is_accepted_after_resolution() {
    let (e, id, token, lender, _, operator, fee, expected) = setup();
    let c = EscrowContractClient::new(&e, &id);
    c.fund_escrow(&lender, &expected, &200_000_000);
    c.dispute_escrow(&lender);
    c.resolve_dispute(&operator, &fee, &Map::from_array(&e, [(lender.clone(), 200_000_000)]));
    let resolved = c.get_escrow();
    c.fund_escrow(&lender, &resolved, &100_000_000);
    assert!(c.get_escrow().flags.resolved);
    assert_eq!(token::Client::new(&e, &token).balance(&id), 100_000_000);
}

#[test]
fn c3_unapproved_resolved_escrow_can_be_reset_when_empty() {
    let (e, id, _, lender, _, operator, fee, expected) = setup();
    let c = EscrowContractClient::new(&e, &id);
    c.fund_escrow(&lender, &expected, &200_000_000);
    c.dispute_escrow(&lender);
    c.resolve_dispute(&operator, &fee, &Map::from_array(&e, [(lender.clone(), 200_000_000)]));
    assert!(c.get_escrow().flags.resolved);
    c.update_escrow(&operator, &expected);
    assert!(!c.get_escrow().flags.resolved);
    assert!(!c.get_escrow().flags.released);
}
