import 'server-only';
import { ApiError, diditEnv } from './env';
export function sessionId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new ApiError(400, 'La referencia de verificación no es válida. Inicie una nueva verificación.');
  return value;
}
async function call(path: string, body?: object) {
  const { key } = diditEnv();
  const response = await fetch(`https://verification.didit.me/v3/session/${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'x-api-key': key, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new ApiError(response.status === 404 ? 404 : 502, 'No pudimos consultar la verificación. Intente nuevamente o inicie una nueva.');
  return response.json();
}
export async function createSession(wallet: string, origin: string) {
  const data = await call('', { workflow_id: diditEnv().workflow, vendor_data: wallet,
    callback: `${origin}/app?verificacion=retorno`, expected_details: { registry_country: 'BO' } });
  const id = sessionId(data.session_id);
  const url = new URL(data.url);
  if (url.protocol !== 'https:') throw new ApiError(502, 'No recibimos un enlace de verificación válido. Reintente.');
  return { sessionId: id, url: url.href };
}
export async function decision(wallet: string, id: string) {
  const data = await call(`${sessionId(id)}/decision/`);
  if (data.vendor_data !== wallet || data.session_id !== id || data.session_kind !== 'business' || data.workflow_id !== diditEnv().workflow)
    throw new ApiError(403, 'Esta verificación no corresponde a su empresa. Inicie una nueva.');
  if (typeof data.status !== 'string') throw new ApiError(502, 'No recibimos el estado de su verificación. Reintente.');
  return data as { status: string };
}
export async function simulate(wallet: string, id: string) {
  const current = await decision(wallet, id);
  if (current.status !== 'Approved') await call(`${sessionId(id)}/simulate/`, { scenario: 'approve', new_status: 'Approved' });
}
