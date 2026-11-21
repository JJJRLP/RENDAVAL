#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Bytes, BytesN, Env, Vec};
const TTL: u32 = 120 * 17280;
const MAX_BYTES: u32 = 16384;
#[contracttype]
#[derive(Clone)]
enum Key { Record(BytesN<32>), Slot(BytesN<32>, u32) }
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Record { pub version: u64, pub data: Bytes }
#[contracttype]
#[derive(Clone)]
pub struct Change { pub slot: u32, pub data: Bytes }
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error { Conflict = 1, Size = 2, Overflow = 3 }
#[contract]
pub struct AppRegistry;
fn operator(e: &Env) -> Address {
    e.storage().instance().extend_ttl(TTL / 2, TTL);
    e.storage().instance().get(&0u32).unwrap()
}
fn bump(e: &Env, k: &Key) { e.storage().persistent().extend_ttl(k, TTL / 2, TTL); }
#[contractimpl]
impl AppRegistry {
    pub fn __constructor(e: Env, writer: Address) {
        e.storage().instance().set(&0u32, &writer);
        operator(&e);
    }
    pub fn get_operator(e: Env) -> Address { operator(&e) }
    pub fn get(e: Env, key: BytesN<32>) -> Option<Record> {
        operator(&e);
        let k = Key::Record(key);
        let r = e.storage().persistent().get(&k);
        if r.is_some() { bump(&e, &k); }
        r
    }
    pub fn slot(e: Env, key: BytesN<32>, slot: u32) -> Option<Bytes> {
        operator(&e);
        let k = Key::Slot(key, slot);
        let r = e.storage().persistent().get(&k);
        if r.is_some() { bump(&e, &k); }
        r
    }
    // One version guards a document and its bounded batch of independent slots.
    // No global/company vector, enumeration, deletion or custody authority.
    pub fn put(e: Env, key: BytesN<32>, expected: u64, data: Bytes, changes: Vec<Change>) -> Result<u64, Error> {
        operator(&e).require_auth();
        if data.len() > MAX_BYTES || changes.len() > 16 { return Err(Error::Size); }
        let version = Self::get(e.clone(), key.clone()).map(|r| r.version).unwrap_or(0);
        if version != expected { return Err(Error::Conflict); }
        let next = version.checked_add(1).ok_or(Error::Overflow)?;
        for change in changes {
            if change.data.len() > MAX_BYTES { return Err(Error::Size); }
            let k = Key::Slot(key.clone(), change.slot);
            e.storage().persistent().set(&k, &change.data); bump(&e, &k);
        }
        let k = Key::Record(key);
        e.storage().persistent().set(&k, &Record { version: next, data }); bump(&e, &k);
        Ok(next)
    }
    // Anyone may submit these reads as transactions to renew the selected entries.
    pub fn keep_alive(e: Env, key: BytesN<32>, slots: Vec<u32>) -> Result<(), Error> {
        if slots.len() > 16 { return Err(Error::Size); }
        Self::get(e.clone(), key.clone());
        for slot in slots { Self::slot(e.clone(), key.clone(), slot); }
        Ok(())
    }
}
#[cfg(test)]
mod test {
    extern crate std;
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger, storage::Persistent as _};
    #[test]
    fn auth_cas_atomic_slots_and_ttl() {
        let e = Env::default(); e.mock_all_auths();
        e.ledger().with_mut(|l| l.max_entry_ttl = TTL + 100);
        let id = e.register(AppRegistry, (Address::generate(&e),));
        let c = AppRegistryClient::new(&e, &id);
        let k = BytesN::from_array(&e, &[1;32]); let data = Bytes::from_slice(&e, b"hello");
        let changes = soroban_sdk::vec![&e, Change { slot: 0, data: data.clone() }];
        assert_eq!(c.put(&k, &0, &data, &changes), 1);
        assert_eq!(c.try_put(&k, &0, &Bytes::new(&e), &changes), Err(Ok(Error::Conflict)));
        assert_eq!(c.slot(&k, &0), Some(data.clone()));
        e.mock_auths(&[]); assert!(c.try_put(&k, &1, &data, &changes).is_err());
        e.ledger().with_mut(|l| l.sequence_number += TTL / 2 + 1);
        c.keep_alive(&k, &soroban_sdk::vec![&e, 0]);
        e.as_contract(&id, || assert!(e.storage().persistent().get_ttl(&Key::Slot(k.clone(),0)) >= TTL-1));
        assert_eq!(c.get(&k).unwrap().version, 1);
    }
    #[test]
    fn entry_cost_does_not_grow_with_registry_or_company_history() {
        use std::string::ToString;
        let mut e = Env::default(); e.mock_all_auths();
        e.set_config(soroban_sdk::testutils::EnvTestConfig { capture_snapshot_at_drop: false });
        let writer = Address::generate(&e).to_string().to_string();
        let address = e.register(AppRegistry, (Address::from_str(&e,&writer),)).to_string().to_string();
        let mut baseline = None;
        for n in 0u32..=10_000 {
            // Fresh hosts model separate ledger transactions, without metering a
            // growing native test cache. Re-register only the native dispatch.
            if n % 100 == 0 {
                e = Env::from_snapshot(e.to_snapshot());
                let mut seed=[0u8;32];seed[..4].copy_from_slice(&(n+1).to_be_bytes());
                e.host().set_base_prng_seed(seed).unwrap();
                e.set_config(soroban_sdk::testutils::EnvTestConfig { capture_snapshot_at_drop: false });
                e.mock_all_auths();
                e.register_at(&Address::from_str(&e,&address),AppRegistry,(Address::from_str(&e,&writer),));
            }
            let id=Address::from_str(&e,&address);
            let c=AppRegistryClient::new(&e,&id);
            let company = BytesN::from_array(&e, &[0;32]); let data = Bytes::from_slice(&e, &[1;64]);
            let key = BytesN::from_array(&e, &{ let mut b=[0;32]; b[..4].copy_from_slice(&(n+1).to_be_bytes()); b });
            c.put(&key, &0, &data, &Vec::new(&e));
            c.put(&company, &(n as u64), &data, &soroban_sdk::vec![&e, Change { slot:n, data:data.clone() }]);
            let r = e.cost_estimate().resources();
            if n==100 { baseline=Some(r.clone()); }
            if n==1000 || n==10_000 {
                let b=baseline.as_ref().unwrap();
                assert_eq!(r.write_entries,b.write_entries); assert_eq!(r.write_bytes,b.write_bytes);
                assert_eq!(r.memory_read_entries,b.memory_read_entries); assert_eq!(r.disk_read_entries,b.disk_read_entries);
                assert_eq!(r.persistent_rent_ledger_bytes,b.persistent_rent_ledger_bytes);
                assert!(r.instructions.abs_diff(b.instructions) <= (b.instructions / 100) as u64);
                assert!(r.mem_bytes.abs_diff(b.mem_bytes) <= (b.mem_bytes / 100) as u64);
                std::println!("registry_existing={n}: {r:?}");
            }
        }
        let id=Address::from_str(&e,&address); let c=AppRegistryClient::new(&e,&id);
        let company=BytesN::from_array(&e,&[0;32]);
        assert_eq!(c.get(&company).unwrap().version,10_001);
        assert_eq!(c.slot(&company,&10_000),Some(Bytes::from_slice(&e,&[1;64])));
    }
}
