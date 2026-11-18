import 'server-only';
import { StrKey } from '@stellar/stellar-sdk';
import { ApiError, pollarEnv } from './env';
export async function authenticate(request: Request): Promise<string> {
  const match = request.headers.get('authorization')?.match(/^Bearer (\S+)$/);
  if (!match) throw new ApiError(401, 'Ingrese nuevamente para continuar.');
  const response = await fetch('https://server.api.pollar.xyz/v3/tokens/verify', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-pollar-api-key': pollarEnv() },
    body: JSON.stringify({ token: match[1] }), cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (response.status >= 500) throw new ApiError(502, 'No pudimos validar su acceso. Intente nuevamente.');
  const data = await response.json().catch(() => null);
  // Successful payload has not been observed with an automated login: fail closed.
  const wallet = data?.content?.wallet;
  const address = typeof wallet === 'string' ? wallet : wallet?.address;
  if (!response.ok || data?.code !== 'SERVER_TOKEN_VERIFIED' || data?.success === false ||
      typeof address !== 'string' || !StrKey.isValidEd25519PublicKey(address) ||
      (wallet?.network && wallet.network !== 'testnet') || (wallet?.chain && wallet.chain !== 'STELLAR'))
    throw new ApiError(401, 'No pudimos validar su sesión. Cierre sesión e ingrese nuevamente.');
  return address;
}
