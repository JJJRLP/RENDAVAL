import 'server-only';
import { readBalances, assetBalance } from '../../stellar/horizon';
import { RBOND, USDC } from '../../stellar/assets';
import { vaultKey } from '../env';
import { terms, loanHealth, type LoanView } from '../../loan/model';
import { a, balance, BOND, BOOK, issuerKey, read, rpcServer, RULES, sym, units } from './chain';
import { explorer } from './network';
import { get } from './store';
import { index, ownBond, verified } from './records';
import { loanView } from './setup';
import { type Config, type Series, type Spec, type VaultConfig } from './types';
export { verified } from './records';
export async function state(wallet: string) {
  const walletBalances = readBalances(wallet);
  const [verification, idx, bondBalance, dollars, config, ledger, credits] = await Promise.all([verified(wallet), index(wallet), walletBalances.then(rows => units(assetBalance(rows, RBOND)?.balance ?? '0')), walletBalances.then(rows => units(assetBalance(rows, USDC)?.balance ?? '0')), read<Config>(BOOK, 'get_config'), rpcServer.getLatestLedger(), read<bigint>(BOOK, 'claimable', [a(wallet)])]);
  const bonds = await Promise.all(idx.bonds.map(async id => {
    const record = await ownBond(wallet, id), approval = await get<{ hashes: string[] }>(`approved:${id}`);
    return { ...record, status: approval ? 'approved' : 'under_review', approval, certificateStored: false };
  }));
  const loans = await Promise.all(idx.loans.filter(l => l.id).map(async item => {
    const id = item.id!, spec = await read<Spec>(BOOK, 'get_vault', [a(id)]), vault = await read<VaultConfig>(id, 'get_config');
    const view = vault.state[0] === 'Pending' ? null : await loanView(id);
    const [series, escrow, txs, held, deliveryBalance] = await Promise.all([read<Series>(BOOK, 'get_series', [sym(spec.series)]), get<{ id: string; hash: string }>(`escrow:${id}`), get<{ hashes: string[] }>(`transactions:${wallet}:${id}`), balance(BOND, id), balance(BOND, spec.delivery)]);
    const status = view?.loan.status[0] ?? vault.state[0];
    const stage = status === 'Pending' ? held >= spec.face ? 'collateral_locked' : 'escrow_created' : status === 'Repaid' ? 'closed' : status === 'Liquidated' || status === 'WrittenOff' ? 'liquidated' : 'active';
    const bond = bonds.find(b => b.id === item.bondId)!;
    const t = terms(Number(spec.face) / 1e7);
    const activity = (await Promise.all([id, spec.delivery, item.ref, item.bondId, spec.series].map(target => get<{ hash: string; label: string }[]>(`activity:${target}`)))).flatMap(rows => rows ?? []);
    // Known operation keys also recover links if the response/optional activity
    // append was lost after the receipt committed. Only this loan's keys are read.
    const operatorLabels = [`create:${item.ref}`, `tw-deploy:${id}`, `tw-change-milestone-status:${id}`, `tw-release-funds:${id}`, `default:${id}`];
    const otherLabels = [`approve-holder:${item.bondId}`, `series:${item.bondId}`, `initial-price:${item.bondId}`, `issue:${item.bondId}`, `authorize:${id}`, `authorize:${spec.delivery}`, `tw-fund:${id}`, `tw-approve-milestone:${id}`, `topup:${id}`, `buyer-holder:${id}`, `buyer-permit:${id}`, `liquidate:${id}`];
    const receipts = await Promise.all([...operatorLabels, ...otherLabels].map(async label => {
      const record = await get<{ receipt?: { hash: string } }>(`outbox:${BOOK}:${label}`, operatorLabels.includes(label) ? issuerKey() : vaultKey());
      return record?.receipt ? [{ label, hash: record.receipt.hash }] : [];
    }));
    activity.push(...receipts.flat());
    const transactions = [...new Map([...activity, ...(txs?.hashes ?? []).map(hash => ({ hash, label: 'Firma empresa' }))].map(row => [row.hash, { ...row, url: explorer('tx', row.hash), at: '' }])).values()];
    const compat: LoanView = { bond: bond.bond, stage, price: Number(series.quote.price) / 1e7, collateralValue: view ? Number(view.value) / 1e7 : Number(spec.face * series.quote.price / 10000000n) / 1e7, health: view && view.health_bps === null ? { ratio: null, level: 'unknown' } : loanHealth(view ? Number(view.debt) / 1e7 : t.total, view ? Number(view.value) / 1e7 : t.collateral), locked: Number(held) / 1e7, terms: { ...t, ...(view ? { loan: Number(view.loan.principal) / 1e7, interest: Number(view.loan.interest) / 1e7, total: Number(view.debt) / 1e7, custodyFee: Number(view.loan.escrow_fee) / 1e7, dueDate: new Date(Number(view.loan.due) * 1000).toISOString() } : {}) }, escrow: { contractId: id, description: JSON.stringify(bond.bond), url: explorer('contract', id) }, repayment: null, transactions };
    return { ...compat, id, bondId: item.bondId, status, spec, vault, book: BOOK, view, series, priceAge: Number(ledger.closeTime) - Number(series.quote.timestamp), priceFresh: BigInt(ledger.closeTime) <= series.quote.timestamp + config.max_price_age, healthBps: view?.health_bps ?? null, margin: status === 'Margin', cureDeadline: view?.loan.defaulted_at ? Number(view.loan.defaulted_at + config.cure_period) : null, deliveryBalance, escrowId: escrow?.id ?? null, links: { book: explorer('contract', BOOK), rules: explorer('contract', RULES), vault: explorer('contract', id), delivery: explorer('contract', spec.delivery), escrow: escrow ? explorer('contract', escrow.id) : null }, amounts: { principal: spec.principal, fee: spec.principal * 30n / 10000n, net: spec.principal - spec.principal * 30n / 10000n, debt: view?.debt ?? spec.principal + (spec.principal + 149n) / 150n } };
  }));
  const bondRecords = await Promise.all(bonds.map(async bond => {
    const latest = loans.filter(l => l.bondId === bond.id).at(-1);
    const availability = bond.status === 'under_review' ? 'under_review' : idx.loans.some(l => l.bondId === bond.id && !l.id) || latest?.status === 'Pending' ? 'reserved' : latest && ['Active', 'Margin', 'Defaulted'].includes(latest.status) ? 'pledged' : latest && ['Liquidated', 'WrittenOff'].includes(latest.status) ? 'sold' : latest && latest.deliveryBalance > 0n ? 'awaiting_delivery' : 'available';
    const series = bond.status === 'approved' ? await read<Series>(BOOK, 'get_series', [sym(bond.series)]) : null;
    return { ...bond, availability, seriesState: series, priceAge: series ? Number(ledger.closeTime) - Number(series.quote.timestamp) : null, transactions: (bond.approval?.hashes ?? []).map(hash => ({ hash, url: explorer('tx', hash) })), links: { book: explorer('contract', BOOK), token: explorer('contract', BOND), declaration: explorer('account', vaultKey().publicKey()) + '?filter=data' } };
  }));
  const openLoans = loans.filter(l => ['Pending', 'Active', 'Margin', 'Defaulted'].includes(l.status)).length + idx.loans.filter(l => !l.id).length;
  const setup = loans.find(l => l.status === 'Pending') ?? null;
  const focal = setup ?? loans.at(-1);
  return { ...(focal ?? { stage: 'none', terms: terms(0), escrow: null, repayment: null, transactions: [] }), wallet, verification, bonds: Number(bondBalance) / 1e7, usdc: Number(dollars) / 1e7, locked: loans.reduce((n, l) => n + l.locked, 0), setup, loans: loans.filter(l => l.status !== 'Pending'), allLoans: loans, bondRecords, preparations: idx.loans.filter(l => !l.id), openLoans, limitReached: openLoans >= 3, canRegister: openLoans < 3, claimable: credits, book: BOOK, network: 'TESTNET', units: 'All raw contract amounts are integer strings with seven decimals', ledgerTime: Number(ledger.closeTime) };
}
