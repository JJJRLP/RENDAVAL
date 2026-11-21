#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

pub const SCALE: i128 = 10_000_000;
const TERM: u64 = 30 * 86400;
// 120 days at five seconds per ledger. Persistent entries can be restored, never recreated.
const TTL: u32 = 120 * 17280;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Invalid = 1,
    Overflow = 2,
    Exists = 3,
    Missing = 4,
    State = 5,
    Healthy = 6,
    Buyer = 7,
    PriceChanged = 8,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Status {
    Active,
    Margin,
    Defaulted,
    Repaid,
    Liquidated,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub issuer: Address,
    pub usdc: Address,
    pub margin_bps: u32,
    pub default_bps: u32,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Loan {
    pub borrower: Address,
    pub lender: Address,
    pub face: i128,
    pub principal: i128,
    pub interest: i128,
    pub due: u64,
    pub status: Status,
    pub price: i128,
    pub loss: i128,
    pub proceeds: i128,
    pub surplus: i128,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct View {
    pub loan: Loan,
    pub debt: i128,
    pub value: i128,
    pub health_bps: i128,
    pub overdue: bool,
}
#[contracttype]
#[derive(Clone)]
enum Key {
    Config,
    Loan(Address),
    Buyer(Address),
}
#[contractevent(topics = ["init"])]
pub struct Initialized {
    pub config: Config,
}
#[contractevent(topics = ["buyer"])]
pub struct BuyerChanged {
    #[topic]
    pub buyer: Address,
    pub allowed: bool,
}
#[contractevent(topics = ["open"])]
pub struct Opened {
    #[topic]
    pub id: Address,
    pub loan: Loan,
}
#[contractevent(topics = ["margin"])]
pub struct MarginChanged {
    #[topic]
    pub id: Address,
    pub flagged: bool,
}
#[contractevent(topics = ["price"])]
pub struct PriceChanged {
    #[topic]
    pub id: Address,
    pub price: i128,
}
#[contractevent(topics = ["default"])]
pub struct Defaulted {
    #[topic]
    pub id: Address,
    pub loan: Loan,
}
#[contractevent(topics = ["repay"])]
pub struct Repaid {
    #[topic]
    pub id: Address,
    pub amount: i128,
}
#[contractevent(topics = ["liquidate"])]
pub struct Liquidated {
    #[topic]
    pub id: Address,
    pub buyer: Address,
    pub loan: Loan,
}
#[contract]
pub struct LoanBook;
fn mul(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_mul(b).ok_or(Error::Overflow)
}
fn add(a: i128, b: i128) -> Result<i128, Error> {
    a.checked_add(b).ok_or(Error::Overflow)
}
fn bump(e: &Env, k: &Key) {
    e.storage().persistent().extend_ttl(k, TTL / 2, TTL);
}
fn config(e: &Env) -> Config {
    e.storage().instance().extend_ttl(TTL / 2, TTL);
    e.storage().instance().get(&Key::Config).unwrap()
}
fn loan(e: &Env, id: &Address) -> Result<Loan, Error> {
    config(e);
    let k = Key::Loan(id.clone());
    let l = e.storage().persistent().get(&k).ok_or(Error::Missing)?;
    bump(e, &k);
    Ok(l)
}
fn save(e: &Env, id: &Address, l: &Loan) {
    let k = Key::Loan(id.clone());
    e.storage().persistent().set(&k, l);
    bump(e, &k);
}
fn debt(l: &Loan) -> Result<i128, Error> {
    add(l.principal, l.interest)
}
fn value(l: &Loan) -> Result<i128, Error> {
    Ok(mul(l.face, l.price)? / SCALE)
}
fn above(l: &Loan, bps: u32) -> Result<bool, Error> {
    Ok(mul(debt(l)?, 10000)? >= mul(value(l)?, bps as i128)?)
}
fn live(l: &Loan) -> Result<(), Error> {
    if l.status == Status::Active || l.status == Status::Margin {
        Ok(())
    } else {
        Err(Error::State)
    }
}
#[contractimpl]
impl LoanBook {
    // Constructor makes deployment and initialization atomic: no initializer front-running.
    pub fn __constructor(
        e: Env,
        issuer: Address,
        usdc: Address,
        margin_bps: u32,
        default_bps: u32,
    ) -> Result<(), Error> {
        if margin_bps <= 5000 || margin_bps >= default_bps || default_bps > 10000 {
            return Err(Error::Invalid);
        }
        let c = Config {
            issuer,
            usdc,
            margin_bps,
            default_bps,
        };
        e.storage().instance().set(&Key::Config, &c);
        e.storage().instance().extend_ttl(TTL / 2, TTL);
        Initialized { config: c }.publish(&e);
        Ok(())
    }
    pub fn get_config(e: Env) -> Config {
        config(&e)
    }
    pub fn set_buyer(e: Env, buyer: Address, allowed: bool) {
        let c = config(&e);
        c.issuer.require_auth();
        let k = Key::Buyer(buyer.clone());
        let old: bool = e.storage().persistent().get(&k).unwrap_or(false);
        e.storage().persistent().set(&k, &allowed);
        bump(&e, &k);
        if old != allowed {
            BuyerChanged { buyer, allowed }.publish(&e);
        }
    }
    pub fn is_buyer(e: Env, buyer: Address) -> bool {
        config(&e);
        let k = Key::Buyer(buyer);
        if e.storage().persistent().has(&k) {
            bump(&e, &k);
        }
        e.storage().persistent().get(&k).unwrap_or(false)
    }
    pub fn open(
        e: Env,
        id: Address,
        borrower: Address,
        lender: Address,
        face: i128,
        principal: i128,
    ) -> Result<(), Error> {
        let c = config(&e);
        lender.require_auth();
        if e.storage().persistent().has(&Key::Loan(id.clone())) {
            return Err(Error::Exists);
        }
        if id.to_string().to_bytes().get(0) != Some(b'C')
            || face <= 0
            || principal <= 0
            || borrower == lender
            || principal > face / 2
        {
            return Err(Error::Invalid);
        }
        // 8% * 30/360 = 1/150, rounded up to the smallest USDC unit.
        let interest = add(principal, 149)? / 150;
        let l = Loan {
            borrower,
            lender,
            face,
            principal,
            interest,
            due: e
                .ledger()
                .timestamp()
                .checked_add(TERM)
                .ok_or(Error::Overflow)?,
            status: Status::Active,
            price: SCALE,
            loss: 0,
            proceeds: 0,
            surplus: 0,
        };
        // Bound every subsequent product before transferring funds.
        mul(face, SCALE)?;
        mul(debt(&l)?, 10000)?;
        save(&e, &id, &l);
        token::Client::new(&e, &c.usdc).transfer(&l.lender, &l.borrower, &principal);
        Opened { id, loan: l }.publish(&e);
        Ok(())
    }
    pub fn publish_price(e: Env, id: Address, price: i128) -> Result<(), Error> {
        let c = config(&e);
        c.issuer.require_auth();
        let mut l = loan(&e, &id)?;
        if l.status == Status::Repaid || l.status == Status::Liquidated {
            return Err(Error::State);
        }
        if price <= 0 || price > SCALE {
            return Err(Error::Invalid);
        }
        if l.price == price {
            return Ok(());
        }
        l.price = price;
        if l.status == Status::Margin && !above(&l, c.margin_bps)? {
            l.status = Status::Active;
            MarginChanged {
                id: id.clone(),
                flagged: false,
            }
            .publish(&e);
        }
        save(&e, &id, &l);
        PriceChanged { id, price }.publish(&e);
        Ok(())
    }
    pub fn flag_margin(e: Env, id: Address) -> Result<(), Error> {
        let c = config(&e);
        let mut l = loan(&e, &id)?;
        live(&l)?;
        if !above(&l, c.margin_bps)? {
            return Err(Error::Healthy);
        }
        if l.status == Status::Margin {
            return Ok(());
        }
        l.status = Status::Margin;
        save(&e, &id, &l);
        MarginChanged { id, flagged: true }.publish(&e);
        Ok(())
    }
    pub fn mark_default(e: Env, id: Address) -> Result<(), Error> {
        let c = config(&e);
        let mut l = loan(&e, &id)?;
        if l.status == Status::Defaulted {
            return Ok(());
        }
        live(&l)?;
        if e.ledger().timestamp() <= l.due && !above(&l, c.default_bps)? {
            return Err(Error::Healthy);
        }
        l.status = Status::Defaulted;
        save(&e, &id, &l);
        Defaulted { id, loan: l }.publish(&e);
        Ok(())
    }
    pub fn repay(e: Env, id: Address) -> Result<(), Error> {
        let c = config(&e);
        let mut l = loan(&e, &id)?;
        l.borrower.require_auth();
        if l.status == Status::Repaid {
            return Ok(());
        }
        live(&l)?;
        l.status = Status::Repaid;
        save(&e, &id, &l);
        token::Client::new(&e, &c.usdc).transfer(&l.borrower, &l.lender, &debt(&l)?);
        Repaid {
            id,
            amount: debt(&l)?,
        }
        .publish(&e);
        Ok(())
    }
    pub fn liquidate(
        e: Env,
        id: Address,
        buyer: Address,
        expected_price: i128,
    ) -> Result<(), Error> {
        let c = config(&e);
        buyer.require_auth();
        let mut l = loan(&e, &id)?;
        if l.status != Status::Defaulted {
            return Err(Error::State);
        }
        if !Self::is_buyer(e.clone(), buyer.clone()) {
            return Err(Error::Buyer);
        }
        if expected_price != l.price {
            return Err(Error::PriceChanged);
        }
        let proceeds = value(&l)?;
        let debt = debt(&l)?;
        let paid = proceeds.min(debt);
        l.loss = debt.checked_sub(paid).ok_or(Error::Overflow)?;
        l.surplus = proceeds.checked_sub(paid).ok_or(Error::Overflow)?;
        l.proceeds = proceeds;
        l.status = Status::Liquidated;
        save(&e, &id, &l);
        let t = token::Client::new(&e, &c.usdc);
        if paid > 0 {
            t.transfer(&buyer, &l.lender, &paid);
        }
        if l.surplus > 0 {
            t.transfer(&buyer, &l.borrower, &l.surplus);
        }
        Liquidated { id, buyer, loan: l }.publish(&e);
        Ok(())
    }
    pub fn get_loan(e: Env, id: Address) -> Result<View, Error> {
        let l = loan(&e, &id)?;
        let d = debt(&l)?;
        let v = value(&l)?;
        Ok(View {
            debt: d,
            value: v,
            health_bps: if v == 0 {
                i128::MAX
            } else {
                mul(d, 10000)? / v
            },
            overdue: e.ledger().timestamp() > l.due,
            loan: l,
        })
    }
    pub fn get_price(e: Env, id: Address) -> Result<i128, Error> {
        Ok(loan(&e, &id)?.price)
    }
}
#[cfg(test)]
mod test;
