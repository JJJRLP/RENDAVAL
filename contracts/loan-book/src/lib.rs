#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
    Symbol, Vec,
};

// Wire-only client avoids linking another contract's exported functions into this WASM.
#[contracttype]
#[derive(Clone)]
pub struct RulesConfig {
    pub issuer: Address,
    pub book: Address,
    pub operator: Address,
}
#[soroban_sdk::contractclient(name = "RulesClient")]
pub trait RulesInterface {
    fn get_config(e: Env) -> RulesConfig;
    fn pledged(e: Env, token: Address, holder: Address) -> bool;
    fn protect(e: Env, token: Address, holder: Address);
    fn release(e: Env, token: Address, holder: Address);
}

pub const SCALE: i128 = 10_000_000;
pub const MAX_LISTED_SERIES: u32 = 64;
const TERM: u64 = 30 * 86400;
pub const MIN_PRINCIPAL: i128 = SCALE;
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
    PriceStep = 9,
    StalePrice = 10,
    Capacity = 11,
    Collateral = 12,
    CollateralRead = 13,
    Rules = 14,
    Nonempty = 15,
    Payment = 16,
    PriceRate = 17,
    Cure = 18,
    Unpublished = 19,
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
    pub price_interval: u32,
    pub grace_period: u64,
    pub cure_period: u64,
    pub rules: Address,
    pub operator: Address,
    pub max_step_bps: u32,
    pub max_price_age: u64,
    pub discount_bps: u32,
    pub issuer: Address,
    pub usdc: Address,
    pub margin_bps: u32,
    pub default_bps: u32,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Series {
    pub token: Address,
    pub changed_at: u64,
    pub quote: PriceData,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Collateral {
    pub balance: i128,
    pub authorized: bool,
    pub known: bool,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Loan {
    pub defaulted_at: u64,
    pub recipient: Address,
    pub collateral: Collateral,
    pub asset: Symbol,
    pub price_time: u64,
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
    pub shortfall: Option<i128>,
}
#[contracttype]
#[derive(Clone)]
enum Key {
    Config,
    Assets,
    Series(Symbol),
    Loan(Address),
    Buyer(Address),
    Credit(Address),
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
#[contractevent(topics = ["series"])]
pub struct SeriesRegistered {
    pub token: Address,
    #[topic]
    pub series: Symbol,
    pub timestamp: u64,
}
#[contractevent(topics = ["listed"])]
pub struct SeriesListed {
    #[topic]
    pub series: Symbol,
}
#[contractevent(topics = ["price"])]
pub struct PriceChanged {
    pub timestamp: u64,
    #[topic]
    pub series: Symbol,
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
    pub loan: Loan,
}
#[contractevent(topics = ["liquidate"])]
pub struct Liquidated {
    #[topic]
    pub id: Address,
    pub buyer: Address,
    pub loan: Loan,
}
#[contractevent(topics = ["credit"])]
pub struct Credited {
    #[topic]
    pub recipient: Address,
    pub amount: i128,
}
#[contractevent(topics = ["claim"])]
pub struct Claimed {
    #[topic]
    pub recipient: Address,
    pub amount: i128,
}
// SEP-40 wire types; no external feed is consulted.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}
fn fresh(e: &Env, l: &Loan, c: &Config) -> Result<(), Error> {
    if l.price == 0 {
        return Err(Error::Unpublished);
    }
    if e.ledger()
        .timestamp()
        .checked_sub(l.price_time)
        .ok_or(Error::StalePrice)?
        > c.max_price_age
    {
        return Err(Error::StalePrice);
    }
    Ok(())
}
fn assets(e: &Env) -> Vec<Asset> {
    config(e);
    let k = Key::Assets;
    if e.storage().persistent().has(&k) {
        bump(e, &k);
    }
    e.storage().persistent().get(&k).unwrap_or(Vec::new(e))
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
    let mut l: Loan = e.storage().persistent().get(&k).ok_or(Error::Missing)?;
    if !closed(&l) {
        bump(e, &k);
        let series = series(e, &l.asset)?;
        let p = series.quote;
        l.collateral = collateral(e, &series.token, id);
        l.price = p.price;
        l.price_time = p.timestamp;
        // Reconcile this loan only, never walk the holders of a series.
        if l.status == Status::Margin
            && fresh(e, &l, &config(e)).is_ok()
            && !above(&l, config(e).margin_bps)?
        {
            l.status = Status::Active;
            save(e, id, &l);
            MarginChanged {
                id: id.clone(),
                flagged: false,
            }
            .publish(e);
        }
    }
    Ok(l)
}
fn save(e: &Env, id: &Address, l: &Loan) {
    let k = Key::Loan(id.clone());
    e.storage().persistent().set(&k, l);
    if !closed(l) {
        bump(e, &k);
    }
}
fn closed(l: &Loan) -> bool {
    l.status == Status::Repaid || l.status == Status::Liquidated
}
fn series(e: &Env, name: &Symbol) -> Result<Series, Error> {
    let k = Key::Series(name.clone());
    let p = e.storage().persistent().get(&k).ok_or(Error::Missing)?;
    bump(e, &k);
    Ok(p)
}
fn quote(e: &Env, name: &Symbol) -> Result<PriceData, Error> {
    Ok(series(e, name)?.quote)
}
// Only this loan's token is called. Recoverable invocation/type failures are
// unknown, never an invented balance. Host resource exhaustion still aborts
// this transaction, not independent transactions for other series.
fn collateral(e: &Env, token: &Address, id: &Address) -> Collateral {
    let balance = token::Client::new(e, token).try_balance(id);
    let authorized = token::StellarAssetClient::new(e, token).try_authorized(id);
    match (balance, authorized) {
        (Ok(Ok(balance)), Ok(Ok(authorized))) if balance >= 0 => Collateral {
            balance,
            authorized,
            known: true,
        },
        _ => Collateral {
            balance: 0,
            authorized: false,
            known: false,
        },
    }
}
fn impaired(l: &Loan) -> bool {
    l.collateral.known && (!l.collateral.authorized || l.collateral.balance < l.face)
}
fn debt(l: &Loan) -> Result<i128, Error> {
    add(l.principal, l.interest)
}
fn value(l: &Loan) -> Result<i128, Error> {
    Ok(mul(l.face.min(l.collateral.balance), l.price)? / SCALE)
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
// Incoming payment failures are book errors; recipient failures become durable credits.
fn pay(e: &Env, c: &Config, from: &Address, to: &Address, amount: i128) -> Result<(), Error> {
    if amount == 0 {
        return Ok(());
    }
    match token::Client::new(e, &c.usdc).try_transfer(from, to, &amount) {
        Ok(Ok(())) => Ok(()),
        _ => Err(Error::Payment),
    }
}
fn credit(e: &Env, c: &Config, to: &Address, amount: i128) -> Result<(), Error> {
    if amount == 0 {
        return Ok(());
    }
    if pay(e, c, &e.current_contract_address(), to, amount).is_err() {
        let k = Key::Credit(to.clone());
        let old: i128 = e.storage().persistent().get(&k).unwrap_or(0);
        e.storage().persistent().set(&k, &add(old, amount)?);
        bump(e, &k);
        Credited {
            recipient: to.clone(),
            amount,
        }
        .publish(e);
    }
    Ok(())
}
#[contractimpl]
impl LoanBook {
    // Constructor makes deployment and initialization atomic: no initializer front-running.
    pub fn __constructor(
        e: Env,
        operator: Address,
        issuer: Address,
        usdc: Address,
        rules: Address,
        margin_bps: u32,
        default_bps: u32,
        max_step_bps: u32,
        max_price_age: u64,
        discount_bps: u32,
        price_interval: u32,
        grace_period: u64,
        cure_period: u64,
    ) -> Result<(), Error> {
        if rules.to_string().to_bytes().get(0) != Some(b'C')
            || price_interval == 0
            || grace_period == 0
            || cure_period == 0
            || max_step_bps == 0
            || max_step_bps > 10000
            || max_price_age == 0
            || discount_bps >= 10000
            || margin_bps <= 5000
            || margin_bps >= default_bps
            || default_bps > 10000
        {
            return Err(Error::Invalid);
        }
        let c = Config {
            price_interval,
            grace_period,
            cure_period,
            rules,
            operator,
            max_step_bps,
            max_price_age,
            discount_bps,
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
    pub fn base(e: Env) -> Asset {
        Asset::Other(Symbol::new(&e, "USD"))
    }
    pub fn assets(e: Env) -> Vec<Asset> {
        assets(&e)
    }
    pub fn decimals(_e: Env) -> u32 {
        7
    }
    // Publications use ledger seconds, with no promise of periodic updates.
    pub fn resolution(e: Env) -> u32 {
        config(&e).price_interval
    }
    pub fn lastprice(e: Env, asset: Asset) -> Option<PriceData> {
        config(&e);
        let name = match asset {
            Asset::Other(name) => name,
            _ => return None,
        };
        quote(&e, &name).ok().filter(|p| p.price > 0)
    }

    // Retention is one record per asset, including after closing the loan.
    pub fn price(e: Env, asset: Asset, timestamp: u64) -> Option<PriceData> {
        Self::lastprice(e, asset).filter(|p| p.timestamp == timestamp)
    }
    pub fn prices(e: Env, asset: Asset, records: u32) -> Option<Vec<PriceData>> {
        if records == 0 {
            return None;
        }
        let p = Self::lastprice(e.clone(), asset)?;
        Some(soroban_sdk::vec![&e, p])
    }
    pub fn get_config(e: Env) -> Config {
        config(&e)
    }
    pub fn set_buyer(e: Env, buyer: Address, allowed: bool) {
        let c = config(&e);
        c.issuer.require_auth();
        let k = Key::Buyer(buyer.clone());
        let old: bool = e.storage().persistent().get(&k).unwrap_or(false);
        if allowed {
            e.storage().persistent().set(&k, &true);
            bump(&e, &k);
        } else {
            e.storage().persistent().remove(&k);
        }
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
        series: Symbol,
        borrower: Address,
        lender: Address,
        face: i128,
        principal: i128,
    ) -> Result<(), Error> {
        let c = config(&e);
        c.operator.require_auth();
        lender.require_auth();
        borrower.require_auth();
        if e.storage().persistent().has(&Key::Loan(id.clone())) {
            return Err(Error::Exists);
        }
        if id.to_string().to_bytes().get(0) != Some(b'C')
            || face <= 0
            || principal < MIN_PRINCIPAL
            || borrower == lender
            || principal > face / 2
        {
            return Err(Error::Invalid);
        }
        // 8% * 30/360 = 1/150, rounded up to the smallest USDC unit.
        let interest = add(principal, 149)? / 150;
        let registered = self::series(&e, &series)?;
        let p = registered.quote;
        let collateral = collateral(&e, &registered.token, &id);
        if !collateral.known {
            return Err(Error::CollateralRead);
        }
        if !collateral.authorized || collateral.balance < face {
            return Err(Error::Collateral);
        }
        let l = Loan {
            defaulted_at: 0,
            recipient: borrower.clone(),
            collateral,
            asset: series,
            price_time: p.timestamp,
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
            price: p.price,
            loss: 0,
            proceeds: 0,
            surplus: 0,
        };
        // Bound every subsequent product before transferring funds.
        mul(face, SCALE)?;
        mul(debt(&l)?, 10000)?;
        fresh(&e, &l, &c)?;
        // A shared series may already be below par at origination.
        if principal > value(&l)? / 2 {
            return Err(Error::Invalid);
        }
        match token::StellarAssetClient::new(&e, &registered.token).try_admin() {
            Ok(Ok(admin)) if admin == c.rules => (),
            _ => return Err(Error::Rules),
        }
        let rules = RulesClient::new(&e, &c.rules);
        if rules.get_config().book != e.current_contract_address() {
            return Err(Error::Rules);
        }
        save(&e, &id, &l);
        rules.protect(&registered.token, &id);
        pay(&e, &c, &l.lender, &l.borrower, principal)?;
        Opened { id, loan: l }.publish(&e);
        Ok(())
    }
    // Permissionless trigger, but only this book authorizes the nested rules call.
    // Read the final loan directly: do not reconcile or trust its closing balance.
    pub fn release_pledge(e: Env, id: Address) -> Result<(), Error> {
        let c = config(&e);
        let l: Loan = e
            .storage()
            .persistent()
            .get(&Key::Loan(id.clone()))
            .ok_or(Error::Missing)?;
        if !closed(&l) {
            return Err(Error::State);
        }
        let token = series(&e, &l.asset)?.token;
        let rules = RulesClient::new(&e, &c.rules);
        if !rules.pledged(&token, &id) {
            return Ok(());
        }
        match token::Client::new(&e, &token).try_balance(&id) {
            Ok(Ok(0)) => (),
            Ok(Ok(n)) if n > 0 => return Err(Error::Nonempty),
            _ => return Err(Error::CollateralRead),
        }
        rules.release(&token, &id);
        Ok(())
    }
    // The entitled recipient may acknowledge delivery or abandon residual dust.
    // Live debt can never be unprotected through this path.
    pub fn accept_collateral(e: Env, id: Address) -> Result<(), Error> {
        let c = config(&e);
        let l: Loan = e
            .storage()
            .persistent()
            .get(&Key::Loan(id.clone()))
            .ok_or(Error::Missing)?;
        if !closed(&l) {
            return Err(Error::State);
        }
        l.recipient.require_auth();
        RulesClient::new(&e, &c.rules).release(&series(&e, &l.asset)?.token, &id);
        Ok(())
    }
    pub fn claimable(e: Env, recipient: Address) -> i128 {
        config(&e);
        let k = Key::Credit(recipient);
        if e.storage().persistent().has(&k) {
            bump(&e, &k);
        }
        e.storage().persistent().get(&k).unwrap_or(0)
    }
    pub fn claim(e: Env, recipient: Address) -> Result<(), Error> {
        let c = config(&e);
        recipient.require_auth();
        let amount = Self::claimable(e.clone(), recipient.clone());
        if amount == 0 {
            return Ok(());
        }
        e.storage()
            .persistent()
            .remove(&Key::Credit(recipient.clone()));
        pay(&e, &c, &e.current_contract_address(), &recipient, amount)?;
        Claimed { recipient, amount }.publish(&e);
        Ok(())
    }
    // Registration never loads the catalogue; names and token bindings are permanent.
    pub fn register_series(e: Env, series: Symbol, token: Address) -> Result<(), Error> {
        config(&e).issuer.require_auth();
        if token.to_string().to_bytes().get(0) != Some(b'C') {
            return Err(Error::Invalid);
        }
        let k = Key::Series(series.clone());
        if e.storage().persistent().has(&k) {
            return Err(Error::Exists);
        }
        let timestamp = e.ledger().timestamp();
        e.storage().persistent().set(
            &k,
            &Series {
                token: token.clone(),
                changed_at: 0,
                quote: PriceData {
                    price: 0,
                    timestamp: 0,
                },
            },
        );
        bump(&e, &k);
        SeriesRegistered {
            series,
            token,
            timestamp,
        }
        .publish(&e);
        Ok(())
    }
    pub fn get_series(e: Env, name: Symbol) -> Result<Series, Error> {
        config(&e);
        series(&e, &name)
    }
    // Deliberate issuer publication, not an enumeration of all registered series.
    pub fn list_series(e: Env, series: Symbol) -> Result<(), Error> {
        config(&e).issuer.require_auth();
        quote(&e, &series)?;
        let mut list = assets(&e);
        let asset = Asset::Other(series.clone());
        if list.contains(&asset) {
            return Ok(());
        }
        if list.len() >= MAX_LISTED_SERIES {
            return Err(Error::Capacity);
        }
        list.push_back(asset);
        e.storage().persistent().set(&Key::Assets, &list);
        bump(&e, &Key::Assets);
        SeriesListed { series }.publish(&e);
        Ok(())
    }
    pub fn publish_price(e: Env, series: Symbol, price: i128) -> Result<(), Error> {
        let c = config(&e);
        c.issuer.require_auth();
        let old = quote(&e, &series)?;
        if price <= 0 || price > SCALE {
            return Err(Error::Invalid);
        }
        let delta = price
            .checked_sub(old.price)
            .ok_or(Error::Overflow)?
            .checked_abs()
            .ok_or(Error::Overflow)?;
        if old.price > 0 && delta > (mul(old.price, c.max_step_bps as i128)? / 10000).max(1) {
            return Err(Error::PriceStep);
        }
        let timestamp = e.ledger().timestamp();
        if old.price == price && old.timestamp == timestamp {
            return Ok(());
        }
        let mut registered = self::series(&e, &series)?;
        if old.price != price {
            if old.price > 0
                && timestamp
                    .checked_sub(registered.changed_at)
                    .ok_or(Error::PriceRate)?
                    < c.price_interval as u64
            {
                return Err(Error::PriceRate);
            }
            registered.changed_at = timestamp;
        }
        registered.quote = PriceData { price, timestamp };
        e.storage()
            .persistent()
            .set(&Key::Series(series.clone()), &registered);
        PriceChanged {
            series,
            price,
            timestamp,
        }
        .publish(&e);
        Ok(())
    }
    pub fn flag_margin(e: Env, id: Address) -> Result<(), Error> {
        let c = config(&e);
        let mut l = loan(&e, &id)?;
        live(&l)?;
        if !l.collateral.known {
            return Err(Error::CollateralRead);
        }
        fresh(&e, &l, &c)?;
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
        if !impaired(&l)
            && e.ledger().timestamp() <= l.due.checked_add(c.grace_period).ok_or(Error::Overflow)?
        {
            if !l.collateral.known {
                return Err(Error::CollateralRead);
            }
            fresh(&e, &l, &c)?;
            if !above(&l, c.default_bps)? {
                return Err(Error::Healthy);
            }
        }
        l.defaulted_at = e.ledger().timestamp();
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
        if l.status != Status::Defaulted {
            live(&l)?;
        }
        l.status = Status::Repaid;
        save(&e, &id, &l);
        pay(
            &e,
            &c,
            &l.borrower,
            &e.current_contract_address(),
            debt(&l)?,
        )?;
        credit(&e, &c, &l.lender, debt(&l)?)?;
        Repaid {
            id,
            amount: debt(&l)?,
            loan: l,
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
        if e.ledger().timestamp()
            < l.defaulted_at
                .checked_add(c.cure_period)
                .ok_or(Error::Overflow)?
        {
            return Err(Error::Cure);
        }
        let bond = series(&e, &l.asset)?.token;
        if !matches!(
            token::StellarAssetClient::new(&e, &bond).try_authorized(&buyer),
            Ok(Ok(true))
        ) {
            return Err(Error::Buyer);
        }
        if expected_price != l.price {
            return Err(Error::PriceChanged);
        }
        if !l.collateral.known {
            return Err(Error::CollateralRead);
        }
        if !l.collateral.authorized {
            return Err(Error::Collateral);
        }
        fresh(&e, &l, &c)?;
        let proceeds = mul(value(&l)?, (10000 - c.discount_bps) as i128)? / 10000;
        let debt = debt(&l)?;
        let paid = proceeds.min(debt);
        l.loss = debt.checked_sub(paid).ok_or(Error::Overflow)?;
        l.surplus = proceeds.checked_sub(paid).ok_or(Error::Overflow)?;
        l.proceeds = proceeds;
        l.recipient = buyer.clone();
        l.status = Status::Liquidated;
        save(&e, &id, &l);
        pay(&e, &c, &buyer, &e.current_contract_address(), proceeds)?;
        credit(&e, &c, &l.lender, paid)?;
        credit(&e, &c, &l.borrower, l.surplus)?;
        Liquidated { id, buyer, loan: l }.publish(&e);
        Ok(())
    }
    pub fn get_loan(e: Env, id: Address) -> Result<View, Error> {
        let l = loan(&e, &id)?;
        let d = debt(&l)?;
        let v = value(&l)?;
        Ok(View {
            shortfall: if l.collateral.known {
                Some((l.face - l.collateral.balance.min(l.face)).max(0))
            } else {
                None
            },
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
