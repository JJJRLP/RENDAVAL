#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};
const TTL: u32 = 120 * 17280;
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub issuer: Address,
    pub book: Address,
    pub operator: Address,
}
#[contracttype]
#[derive(Clone)]
enum Key {
    Config,
    Live,
    Pledge(Address, Address),
}
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Pledged = 101,
    Nonempty = 102,
    Invalid = 103,
    Overflow = 104,
}
#[contractevent(topics = ["init"])]
pub struct Initialized {
    pub config: Config,
}
#[contractevent(topics = ["pledge"])]
pub struct PledgeChanged {
    #[topic]
    pub token: Address,
    #[topic]
    pub holder: Address,
    pub pledged: bool,
}
#[contractevent(topics = ["authorized"])]
pub struct AuthorizationChanged {
    #[topic]
    pub token: Address,
    #[topic]
    pub holder: Address,
    pub authorized: bool,
}
#[contractevent(topics = ["book"])]
pub struct BookChanged {
    pub previous: Address,
    pub book: Address,
}
#[contract]
pub struct BondRules;
fn config(e: &Env) -> Config {
    e.storage().instance().extend_ttl(TTL / 2, TTL);
    e.storage().instance().get(&Key::Config).unwrap()
}
#[contractimpl]
impl BondRules {
    pub fn __constructor(
        e: Env,
        issuer: Address,
        book: Address,
        operator: Address,
    ) -> Result<(), Error> {
        if book.to_string().to_bytes().get(0) != Some(b'C') {
            return Err(Error::Invalid);
        }
        let c = Config {
            issuer,
            book,
            operator,
        };
        e.storage().instance().set(&Key::Config, &c);
        e.storage().instance().extend_ttl(TTL / 2, TTL);
        Initialized { config: c }.publish(&e);
        Ok(())
    }
    pub fn get_config(e: Env) -> Config {
        config(&e)
    }
    pub fn live_pledges(e: Env) -> u64 {
        config(&e);
        e.storage().instance().get(&Key::Live).unwrap_or(0)
    }
    pub fn replace_book(e: Env, book: Address) -> Result<(), Error> {
        let mut c = config(&e);
        c.issuer.require_auth();
        c.operator.require_auth();
        if book.to_string().to_bytes().get(0) != Some(b'C') {
            return Err(Error::Invalid);
        }
        if Self::live_pledges(e.clone()) != 0 {
            return Err(Error::Pledged);
        }
        if c.book == book {
            return Ok(());
        }
        let previous = c.book;
        c.book = book.clone();
        e.storage().instance().set(&Key::Config, &c);
        BookChanged { previous, book }.publish(&e);
        Ok(())
    }
    pub fn pledged(e: Env, token: Address, holder: Address) -> bool {
        config(&e);
        let k = Key::Pledge(token, holder);
        if e.storage().persistent().has(&k) {
            e.storage().persistent().extend_ttl(&k, TTL / 2, TTL);
        }
        e.storage().persistent().get(&k).unwrap_or(false)
    }
    // Only the current book may create/remove marks. No account can sign as it.
    pub fn protect(e: Env, token: Address, holder: Address) -> Result<(), Error> {
        config(&e).book.require_auth();
        if holder.to_string().to_bytes().get(0) != Some(b'C') {
            return Err(Error::Invalid);
        }
        if Self::pledged(e.clone(), token.clone(), holder.clone()) {
            return Ok(());
        }
        let count = Self::live_pledges(e.clone())
            .checked_add(1)
            .ok_or(Error::Overflow)?;
        e.storage().instance().set(&Key::Live, &count);
        let k = Key::Pledge(token.clone(), holder.clone());
        e.storage().persistent().set(&k, &true);
        e.storage().persistent().extend_ttl(&k, TTL / 2, TTL);
        PledgeChanged {
            token,
            holder,
            pledged: true,
        }
        .publish(&e);
        Ok(())
    }
    pub fn release(e: Env, token: Address, holder: Address) -> Result<(), Error> {
        config(&e).book.require_auth();
        if !Self::pledged(e.clone(), token.clone(), holder.clone()) {
            return Ok(());
        }
        let count = Self::live_pledges(e.clone())
            .checked_sub(1)
            .ok_or(Error::Overflow)?;
        e.storage().instance().set(&Key::Live, &count);
        e.storage()
            .persistent()
            .remove(&Key::Pledge(token.clone(), holder.clone()));
        PledgeChanged {
            token,
            holder,
            pledged: false,
        }
        .publish(&e);
        Ok(())
    }
    pub fn set_authorized(
        e: Env,
        token: Address,
        holder: Address,
        authorized: bool,
    ) -> Result<(), Error> {
        config(&e).issuer.require_auth();
        if !authorized && Self::pledged(e.clone(), token.clone(), holder.clone()) {
            return Err(Error::Pledged);
        }
        let sac = token::StellarAssetClient::new(&e, &token);
        if sac.authorized(&holder) == authorized {
            return Ok(());
        }
        sac.set_authorized(&holder, &authorized);
        AuthorizationChanged {
            token,
            holder,
            authorized,
        }
        .publish(&e);
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, IssuerFlags};
    #[test]
    fn issuer_controls_ordinary_contracts_and_retries_emit_nothing() {
        let e = Env::default();
        e.mock_all_auths();
        let issuer = Address::generate(&e);
        let asset = e.register_stellar_asset_contract_v2(issuer.clone());
        asset.issuer().set_flag(IssuerFlags::RevocableFlag);
        let token = asset.address();
        let book = Address::generate(&e);
        let rules = e.register(BondRules, (issuer, book, Address::generate(&e)));
        token::StellarAssetClient::new(&e, &token).set_admin(&rules);
        let r = BondRulesClient::new(&e, &rules);
        let holder = Address::generate(&e);
        r.set_authorized(&token, &holder, &false);
        r.set_authorized(&token, &holder, &true);
        assert!(token::StellarAssetClient::new(&e, &token).authorized(&holder));
        r.set_authorized(&token, &holder, &true);
        assert_eq!(e.events().all().events().len(), 0);
        r.protect(&token, &holder);
        r.protect(&token, &holder);
        assert_eq!(e.events().all().events().len(), 0);
        assert_eq!(
            r.try_set_authorized(&token, &holder, &false),
            Err(Ok(Error::Pledged))
        );
        e.mock_auths(&[]);
        assert!(r.try_set_authorized(&token, &holder, &true).is_err());
        assert!(r.try_protect(&token, &holder).is_err());
        assert!(r.try_release(&token, &holder).is_err());
    }
}

#[cfg(test)]
mod account_test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, IssuerFlags};
    #[test]
    fn issuer_approves_and_revokes_classic_account_trustline() {
        let e = Env::default();
        e.mock_all_auths();
        let issuer = Address::generate(&e);
        let asset = e.register_stellar_asset_contract_v2(issuer.clone());
        asset.issuer().set_flag(IssuerFlags::RevocableFlag);
        asset.issuer().set_flag(IssuerFlags::RequiredFlag);
        // SDK creates a funded classic issuer account; use that unrelated account
        // as the ordinary holder, then create its trustline using the SAC.
        let other = e.register_stellar_asset_contract_v2(Address::generate(&e));
        let holder = other.issuer().address();
        let sac = token::StellarAssetClient::new(&e, &asset.address());
        sac.trust(&holder);
        let rules = e.register(
            BondRules,
            (issuer, Address::generate(&e), Address::generate(&e)),
        );
        sac.set_admin(&rules);
        let r = BondRulesClient::new(&e, &rules);
        assert!(!sac.authorized(&holder));
        r.set_authorized(&asset.address(), &holder, &true);
        assert!(sac.authorized(&holder));
        r.set_authorized(&asset.address(), &holder, &false);
        assert!(!sac.authorized(&holder));
        assert_eq!(
            r.try_protect(&asset.address(), &holder),
            Err(Ok(Error::Invalid))
        );
    }
}

#[cfg(test)]
mod surface_test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, IntoVal, Symbol, Val, Vec};
    #[test]
    fn no_holder_spending_or_admin_escape_functions() {
        let e = Env::default();
        e.mock_all_auths();
        let issuer = Address::generate(&e);
        let holder = Address::generate(&e);
        let asset = e.register_stellar_asset_contract_v2(issuer.clone());
        let sac = token::StellarAssetClient::new(&e, &asset.address());
        sac.mint(&holder, &100);
        let rules = e.register(
            BondRules,
            (issuer.clone(), Address::generate(&e), Address::generate(&e)),
        );
        sac.set_admin(&rules);
        for name in [
            "transfer",
            "transfer_from",
            "burn",
            "burn_from",
            "clawback",
            "mint",
            "set_admin",
            "upgrade",
            "pause",
            "invoke",
        ] {
            let args: Vec<Val> = (holder.clone(), issuer.clone(), 1i128).into_val(&e);
            assert!(e
                .try_invoke_contract::<(), soroban_sdk::Error>(&rules, &Symbol::new(&e, name), args)
                .is_err());
        }
        assert_eq!(
            token::Client::new(&e, &asset.address()).balance(&holder),
            100
        );
        assert_eq!(sac.admin(), rules);
    }
}

#[cfg(test)]
mod indirect_call_test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, MockAuth, MockAuthInvoke},
        IntoVal,
    };
    #[contract]
    struct HostileToken;
    #[contractimpl]
    impl HostileToken {
        pub fn __constructor(e: Env, real: Address, victim: Address) {
            e.storage().instance().set(&0u32, &real);
            e.storage().instance().set(&1u32, &victim);
        }
        pub fn authorized(_e: Env, _holder: Address) -> bool {
            true
        }
        pub fn set_authorized(e: Env, _holder: Address, _authorized: bool) {
            let real: Address = e.storage().instance().get(&0u32).unwrap();
            let victim: Address = e.storage().instance().get(&1u32).unwrap();
            token::StellarAssetClient::new(&e, &real).set_authorized(&victim, &false);
        }
    }
    #[test]
    fn arbitrary_token_cannot_forward_rules_authority_to_real_sac() {
        let e = Env::default();
        e.mock_all_auths();
        let issuer = Address::generate(&e);
        let book = Address::generate(&e);
        let victim = Address::generate(&e);
        let asset = e.register_stellar_asset_contract_v2(issuer.clone());
        asset
            .issuer()
            .set_flag(soroban_sdk::testutils::IssuerFlags::RevocableFlag);
        let rules = e.register(BondRules, (issuer.clone(), book, Address::generate(&e)));
        let sac = token::StellarAssetClient::new(&e, &asset.address());
        sac.set_admin(&rules);
        let r = BondRulesClient::new(&e, &rules);
        r.protect(&asset.address(), &victim);
        let hostile = e.register(HostileToken, (asset.address(), victim.clone()));
        e.mock_auths(&[MockAuth {
            address: &issuer,
            invoke: &MockAuthInvoke {
                contract: &rules,
                fn_name: "set_authorized",
                args: (hostile.clone(), victim.clone(), false).into_val(&e),
                sub_invokes: &[],
            },
        }]);
        assert!(r.try_set_authorized(&hostile, &victim, &false).is_err());
        assert!(sac.authorized(&victim));
        assert!(r.pledged(&asset.address(), &victim));
    }
}

#[cfg(test)]
mod replacement_tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, MockAuth, MockAuthInvoke},
        IntoVal,
    };
    #[test]
    fn replacement_requires_both_signers_and_zero_marks() {
        let e = Env::default();
        e.mock_all_auths();
        let issuer = Address::generate(&e);
        let operator = Address::generate(&e);
        let old = Address::generate(&e);
        let next = Address::generate(&e);
        let id = e.register(BondRules, (issuer.clone(), old.clone(), operator.clone()));
        let c = BondRulesClient::new(&e, &id);
        let token = Address::generate(&e);
        let holder = Address::generate(&e);
        c.protect(&token, &holder);
        c.protect(&token, &holder);
        assert_eq!(c.live_pledges(), 1);
        assert_eq!(c.try_replace_book(&next), Err(Ok(Error::Pledged)));
        c.release(&token, &holder);
        c.release(&token, &holder);
        assert_eq!(c.live_pledges(), 0);
        e.mock_auths(&[]);
        for signer in [&issuer, &operator] {
            assert!(c
                .mock_auths(&[MockAuth {
                    address: signer,
                    invoke: &MockAuthInvoke {
                        contract: &id,
                        fn_name: "replace_book",
                        args: (next.clone(),).into_val(&e),
                        sub_invokes: &[]
                    }
                }])
                .try_replace_book(&next)
                .is_err());
        }
        c.mock_auths(&[
            MockAuth {
                address: &issuer,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "replace_book",
                    args: (next.clone(),).into_val(&e),
                    sub_invokes: &[],
                },
            },
            MockAuth {
                address: &operator,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "replace_book",
                    args: (next.clone(),).into_val(&e),
                    sub_invokes: &[],
                },
            },
        ])
        .replace_book(&next);
        assert_eq!(c.get_config().book, next);
        assert!(c
            .mock_auths(&[MockAuth {
                address: &old,
                invoke: &MockAuthInvoke {
                    contract: &id,
                    fn_name: "protect",
                    args: (token.clone(), holder.clone()).into_val(&e),
                    sub_invokes: &[]
                }
            }])
            .try_protect(&token, &holder)
            .is_err());
    }
}
