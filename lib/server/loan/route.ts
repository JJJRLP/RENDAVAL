import 'server-only';
import { authenticate } from '../pollar';
import { ApiError } from '../env';
import { state, verified } from './state';
import { register } from './register';
import { accept } from './accept';
import { buildDeposit, submitDeposit } from './deposit';
import { disburse } from './disburse';
export async function handle(request: Request, action: 'state' | 'register' | 'accept' | 'deposit/build' | 'deposit/submit' | 'disburse') {
  try {
    const wallet = await authenticate(request);
    await verified(wallet);
    let input: Record<string, unknown> = {};
    if (['register', 'accept', 'deposit/submit'].includes(action)) {
      try { input = await request.json(); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); }
      catch { throw new ApiError(400, 'La solicitud no es válida. Reintente.'); }
    }
    const result = action === 'state' ? await state(wallet) : action === 'register' ? await register(wallet, input) : action === 'accept' ? await accept(wallet, input.bond) : action === 'deposit/build' ? await buildDeposit(wallet) : action === 'deposit/submit' ? await submitDeposit(wallet, input.signedXdr) : await disburse(wallet);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof ApiError ? error.message : 'No pudimos conectar con el servicio. Su progreso está guardado; intente nuevamente.' }, { status: error instanceof ApiError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
