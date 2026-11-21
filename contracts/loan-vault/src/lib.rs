#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};
const TTL: u32 = 120 * 17280;
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum State { Pending, Active, Closed }
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub book: Address,
    pub bond: Address,
    pub usdc: Address,
    pub borrower: Address,
    pub lender: Address,
    // None denotes the delivery contract, never a loan vault.
    pub delivery: Option<Address>,
    pub recipient: Address,
    pub state: State,
}
#[contract]
pub struct LoanVault;
fn config(e: &Env) -> Config {
    e.storage().instance().extend_ttl(TTL / 2, TTL);
    e.storage().instance().get(&0u32).unwrap()
}
fn save(e: &Env, c: &Config) { e.storage().instance().set(&0u32, c); e.storage().instance().extend_ttl(TTL / 2, TTL); }
fn send(e: &Env, token: &Address, recipient: &Address) {
    let t = token::Client::new(e, token);
    let amount = t.balance(&e.current_contract_address());
    if amount > 0 { t.transfer(&e.current_contract_address(), recipient, &amount); }
}
#[contractimpl]
impl LoanVault {
    pub fn __constructor(e: Env, c: Config) {
        assert!(c.state == State::Pending && c.borrower != c.lender && c.bond != c.usdc);
        assert!(c.recipient == c.borrower);
        save(&e, &c);
    }
    pub fn get_config(e: Env) -> Config { config(&e) }
    pub fn deposit(e: Env, amount: i128) {
        let c = config(&e);
        assert!(c.delivery.is_some() && c.state == State::Pending && amount > 0);
        c.borrower.require_auth();
        token::Client::new(&e, &c.bond).transfer(&c.borrower, &e.current_contract_address(), &amount);
    }
    pub fn activate(e: Env, net: i128) {
        let mut c = config(&e);
        c.book.require_auth();
        assert!(c.delivery.is_some() && c.state == State::Pending && net > 0);
        // Donations cannot prevent opening. Excess remains refundable to the lender.
        assert!(token::Client::new(&e, &c.usdc).balance(&e.current_contract_address()) >= net);
        c.state = State::Active; save(&e, &c);
        token::Client::new(&e, &c.usdc).transfer(&e.current_contract_address(), &c.borrower, &net);
    }
    // Delivery beneficiary is fixed once, by the original book. No owner sweep exists.
    pub fn assign(e: Env, recipient: Address) {
        let mut c = config(&e); c.book.require_auth();
        assert!(c.delivery.is_none());
        assert!(recipient == c.borrower || recipient == c.lender);
        if c.state == State::Closed { assert_eq!(c.recipient, recipient); return; }
        c.recipient = recipient; c.state = State::Closed; save(&e, &c);
    }
    pub fn finish(e: Env, recipient: Address, fallback: bool, pledged: i128) {
        let mut c = config(&e); c.book.require_auth();
        assert!(c.delivery.is_some() && c.state == State::Active);
        c.recipient = if fallback { recipient.clone() } else { c.borrower.clone() };
        c.state = State::Closed; save(&e, &c);
        let t = token::Client::new(&e, &c.bond);
        let amount = t.balance(&e.current_contract_address());
        if amount > 0 {
            if fallback {
                if t.try_transfer(&e.current_contract_address(), &c.recipient, &amount).is_err() {
                    t.transfer(&e.current_contract_address(), &c.delivery.unwrap(), &amount);
                }
            } else {
                assert!(pledged > 0);
                let sold = amount.min(pledged);
                t.transfer(&e.current_contract_address(), &recipient, &sold);
                let excess = amount - sold;
                if excess > 0 && t.try_transfer(&e.current_contract_address(), &c.borrower, &excess).is_err() {
                    t.transfer(&e.current_contract_address(), &c.delivery.unwrap(), &excess);
                }
            }
        }
    }
    pub fn cancel(e: Env, party: Address) {
        let mut c = config(&e);
        assert!(c.delivery.is_some() && (party == c.borrower || party == c.lender));
        party.require_auth();
        if c.state == State::Closed { return; }
        assert!(c.state == State::Pending);
        c.state = State::Closed; save(&e, &c);
    }
    // Independent methods: a blocked bond recipient cannot prevent a USDC refund.
    // Anyone may trigger delivery, never choose its destination or amount.
    pub fn refund_usdc(e: Env) {
        let c = config(&e); assert!(c.state == State::Closed);
        send(&e, &c.usdc, &c.lender);
    }
    pub fn collect_bonds(e: Env) {
        let c = config(&e); assert!(c.state == State::Closed);
        send(&e, &c.bond, &c.recipient);
    }
}
