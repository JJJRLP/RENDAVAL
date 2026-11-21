import 'server-only';
import { countryFor, DEFAULT_COUNTRY, type CountryCode } from '../countries';
import { Horizon, Networks, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { ApiError, vaultKey } from './env';
const horizon = 'https://horizon-testnet.stellar.org';
function dataKey(wallet: string) {
  if (!StrKey.isValidEd25519PublicKey(wallet)) throw new ApiError(400, 'Dirección de empresa inválida.');
  return `kyb:${wallet}`;
}
export async function readAttestation(wallet: string) {
  const vault = vaultKey().publicKey();
  const response = await fetch(`${horizon}/accounts/${vault}/data/${dataKey(wallet)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(502, 'No pudimos consultar la constancia. Intente nuevamente.');
  const data = await response.json();
  const value = Buffer.from(data.value, 'base64').toString('utf8');
  const parts = value.split(':');
  const country = parts.length === 1 ? DEFAULT_COUNTRY : countryFor(parts[1])?.code;
  if (!country || (parts.length !== 1 && (parts.length !== 3 || parts[0] !== '1'))) throw new ApiError(502, 'La constancia no es válida.');
  // Legacy values (no country) are any non-empty reference, including the ones written by test scripts.
  const sessionId = parts.length === 1 ? value : parts[2];
  if (!sessionId) throw new ApiError(502, 'La constancia no contiene una referencia válida.');
  return { sessionId, country, receiptUrl: `https://stellar.expert/explorer/testnet/account/${vault}?filter=data`, dataKey: dataKey(wallet) };
}
export async function attest(wallet: string, id: string, country: CountryCode = DEFAULT_COUNTRY) {
  const value = `1:${country}:${id}`;
  if (!id || id.includes(':') || !countryFor(country) || Buffer.byteLength(value) > 64) throw new ApiError(400, 'La referencia de verificación no es válida.');
  const server = new Horizon.Server(horizon);
  for (let attempt = 0; attempt < 4; attempt++) {
    const existing = await readAttestation(wallet);
    if (existing) return existing;
    const signer = vaultKey();
    const account = await server.loadAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.manageData({ name: dataKey(wallet), value })).setTimeout(60).build();
    tx.sign(signer);
    try {
      const result = await server.submitTransaction(tx);
      return { sessionId: id, country, txHash: result.hash, receiptUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`, dataKey: dataKey(wallet) };
    } catch (error) {
      const code = (error as { response?: { data?: { extras?: { result_codes?: { transaction?: string } } } } }).response?.data?.extras?.result_codes?.transaction;
      if (code !== 'tx_bad_seq' || attempt === 3) throw new ApiError(502, 'Su aprobación está lista, pero no pudimos guardar la constancia. Vuelva a comprobar.');
      await new Promise(resolve => setTimeout(resolve, 200 + attempt * 250));
    }
  }
  throw new ApiError(502, 'Vuelva a comprobar para guardar la constancia.');
}
