import 'server-only';
import { countryFor } from '../countries';
import { authenticate } from './pollar';
import { ApiError } from './env';
import { createSession, sessionId, simulate } from './didit';
import { status } from './kyb';
export async function handle(request: Request, action: 'status' | 'start' | 'check' | 'simulate') {
  try {
    const wallet = await authenticate(request);
    const url = new URL(request.url);
    let result;
    if (action === 'status') {
      const id = url.searchParams.get('sessionId');
      result = await status(wallet, id ? sessionId(id) : undefined);
    } else if (action === 'start') {
      const body = await request.json().catch(() => null);
      const country = countryFor(body?.country);
      if (!country) throw new ApiError(400, 'Seleccione el país de su empresa.');
      result = await createSession(wallet, url.origin, country.code);
    } else {
      const body = await request.json().catch(() => { throw new ApiError(400, 'La solicitud no es válida. Reintente.'); });
      const id = sessionId(body?.sessionId);
      if (action === 'simulate') await simulate(wallet, id);
      result = await status(wallet, id, true);
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof ApiError ? error.message : 'No pudimos conectar con el servicio. Intente nuevamente.' },
      { status: error instanceof ApiError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
