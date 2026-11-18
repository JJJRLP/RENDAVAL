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
  const address = typeof wallet === 'string' ? wallet : wallet?.address ?? wallet?.publicKey ?? wallet?.stellarAddress;
  const lower = (value: unknown) => typeof value === 'string' ? value.toLowerCase() : undefined;
  // Observed shape: content.network = 'testnet'; content.wallet = { type, address, network: 'STELLAR' } (wallet.network is the chain).
  const network = lower(data?.content?.network);
  const chain = lower(wallet?.chain) ?? lower(wallet?.network);
  const failed = !response.ok || data?.code !== 'SERVER_TOKEN_VERIFIED' || data?.success === false ||
      typeof address !== 'string' || !StrKey.isValidEd25519PublicKey(address) ||
      network !== 'testnet' || (chain !== undefined && chain !== 'stellar');
  if (failed) {
    // Shape only (no token): needed to diagnose provider response changes.
    console.error('[pollar verify]', response.status, JSON.stringify({ code: data?.code, success: data?.success, network: data?.content?.network, walletKeys: wallet && typeof wallet === 'object' ? Object.keys(wallet) : typeof wallet }));
    throw new ApiError(401, 'No pudimos validar su sesión. Cierre sesión e ingrese nuevamente.');
  }
  return address;
}
