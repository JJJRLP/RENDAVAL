import 'server-only';
import { Asset, Horizon, Keypair, Networks } from '@stellar/stellar-sdk';
import { ApiError, required } from '../env';
import { HORIZON_URL, USDC, RBOND } from '../../stellar/assets';
export const server = new Horizon.Server(HORIZON_URL);
export const networkPassphrase = Networks.TESTNET;
export const bondAsset = () => new Asset(RBOND.code, RBOND.issuer);
export const dollarAsset = () => new Asset(USDC.code, USDC.issuer);
export const lenderKey = () => Keypair.fromSecret(required('LENDER_SECRET_KEY'));
export const explorer = (kind: string, id: string) => `https://stellar.expert/explorer/testnet/${kind}/${id}`;
export class ProviderError extends ApiError {
  constructor(public providerStatus: number, public detail: string) {
    super(502, 'El servicio de garantía no pudo completar la operación. Su progreso está guardado; vuelva a intentar.');
  }
}
export async function tw<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://dev.api.trustlesswork.com${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'x-api-key': required('TRUSTLESS_WORK_API_KEY'), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', signal: AbortSignal.timeout(55000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.message === 'string' ? body.message : 'Sin detalle del proveedor';
    throw new ProviderError(response.status, detail.replace(/\bS[A-Z2-7]{55}\b/g, '[REDACTED]').split(required('TRUSTLESS_WORK_API_KEY')).join('[REDACTED]').slice(0, 1500));
  }
  return response.json() as Promise<T>;
}
export function badSequence(error: unknown) {
  return (error as { response?: { data?: { extras?: { result_codes?: { transaction?: string } } } } }).response?.data?.extras?.result_codes?.transaction === 'tx_bad_seq';
}
