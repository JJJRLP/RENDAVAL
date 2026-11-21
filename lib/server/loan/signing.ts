import 'server-only';
import { Networks, Transaction, TransactionBuilder, type xdr } from '@stellar/stellar-sdk';
import { ApiError } from '../env';
import { a, balance, BOND, BOOK, i, once, prepare, sym, validateSigned, read } from './chain';
import { ownLoan, verified } from './records';
import { get, update } from './store';
import { loanView } from './setup';
import type { VaultConfig } from './types';
export type SignedAction = 'deposit' | 'open' | 'repay' | 'claim' | 'collect';
async function invocation(wallet: string, id: string, action: SignedAction): Promise<{ contract: string; method: string; args: xdr.ScVal[]; done?: boolean }> {
  if (action === 'claim') return { contract: BOOK, method: 'claim', args: [a(wallet)] };
  const { spec } = await ownLoan(wallet, id);
  if (action === 'collect') {
    const config = await read<VaultConfig>(spec.delivery, 'get_config');
    if (config.recipient !== wallet) throw new ApiError(403, 'Los bonos no corresponden a su empresa.');
    return { contract: spec.delivery, method: 'collect_bonds', args: [], done: await balance(BOND, spec.delivery) === 0n };
  }
  if (action === 'deposit') return { contract: id, method: 'deposit', args: [i(spec.face)], done: await balance(BOND, id) >= spec.face };
  if (action === 'open' && !await get(`released:${id}`)) throw new ApiError(409, 'Complete el release USDC por Trustless Work antes de abrir.');
  if (action === 'open') return { contract: BOOK, method: 'open', args: [a(id), sym(spec.series), a(wallet), a(spec.lender), i(spec.face), i(spec.principal)] };
  return { contract: BOOK, method: 'repay', args: [a(id)], done: (await loanView(id)).loan.status[0] === 'Repaid' };
}
const key = (wallet: string, id: string, action: SignedAction) => `sign:${wallet}:${id}:${action}`;
export async function build(wallet: string, id: string, action: SignedAction) {
  await verified(wallet);
  const call = await invocation(wallet, id, action);
  if (call.done) return { completed: true, repaid: action === 'repay' };
  const tx = await prepare(wallet, call.contract, call.method, call.args);
  // Persist the exact challenge. New challenges use the same source sequence; the
  // chain permits only one to commit. A stale tab must fetch the current challenge.
  const saved = await update<{ xdr: string }>(key(wallet, id, action), () => ({ xdr: tx.toXDR() }));
  return { unsignedTransaction: saved.xdr, repaid: false, contractId: id, action };
}
export async function submit(wallet: string, id: string, action: SignedAction, signed: unknown) {
  await verified(wallet);
  await invocation(wallet, id, action); // Ownership checked even for replayed transactions.
  const saved = await get<{ xdr: string }>(key(wallet, id, action));
  if (!saved) throw new ApiError(409, 'Prepare la operación antes de firmar.');
  const expected = TransactionBuilder.fromXDR(saved.xdr, Networks.TESTNET);
  if (!(expected instanceof Transaction)) throw new ApiError(409, 'Operación inválida.');
  const envelope = await validateSigned(signed, wallet, expected);
  const result = await once(`browser:${action}:${id}:${Buffer.from(expected.hash()).toString('hex')}`, wallet, async () => envelope);
  await update<{ hashes: string[] }>(`transactions:${wallet}:${id}`, old => ({ hashes: [...new Set([...(old?.hashes ?? []), result.hash])] }));
  return { hash: result.hash, action };
}
