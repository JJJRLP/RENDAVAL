#![no_std]
// TESTNET FIXTURE ONLY. Not a lending escrow: its owner may withdraw at any time.
use soroban_sdk::{contract, contractimpl, token, Address, Env};
#[contract]
pub struct TestEscrow;
#[contractimpl]
impl TestEscrow {
    pub fn __constructor(e: Env, owner: Address) {
        e.storage().instance().set(&0u32, &owner);
    }
    // Sending the entire current balance makes a retry harmless.
    pub fn withdraw(e: Env, token: Address) {
        let owner: Address = e.storage().instance().get(&0u32).unwrap();
        owner.require_auth();
        let t = token::Client::new(&e, &token);
        let amount = t.balance(&e.current_contract_address());
        if amount > 0 {
            t.transfer(&e.current_contract_address(), &owner, &amount);
        }
    }
}
