import 'server-only';
import { Asset, Horizon, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError, required } from '../env';
import { HORIZON_URL, USDC, VBOND } from '../../stellar/assets';
export const server = new Horizon.Server(HORIZON_URL);
export const networkPassphrase = Networks.TESTNET;
export const bondAsset = () => new Asset(VBOND.code, VBOND.issuer);
export const dollarAsset = () => new Asset(USDC.code, USDC.issuer);
export const lenderKey = () => Keypair.fromSecret(required('LENDER_SECRET_KEY'));
export const explorer = (kind: string, id: string) => `https://stellar.expert/explorer/testnet/${kind}/${id}`;
export async function tw<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://dev.api.trustlesswork.com${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'x-api-key': required('TRUSTLESS_WORK_API_KEY'), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) throw new ApiError(502, 'El servicio de garantía no pudo completar la operación. Su progreso está guardado; vuelva a intentar.');
  return response.json() as Promise<T>;
}
export async function send(signedXdr: string) {
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const result = await tw<{ contractId?: string }>('/helper/send-transaction', { signedXdr });
  return { ...result, hash: Buffer.from(tx.hash()).toString('hex') };
}
export function badSequence(error: unknown) {
  return (error as { response?: { data?: { extras?: { result_codes?: { transaction?: string } } } } }).response?.data?.extras?.result_codes?.transaction === 'tx_bad_seq';
}
