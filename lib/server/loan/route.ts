import 'server-only';
import { authenticate } from '../pollar';
import { ApiError } from '../env';
import { verified } from './records';
import { state } from './state';
import { register, approve } from './register';
import { accept, fund } from './setup';
import { build, submit } from './signing';
import { topup, setPrice, markDefault, liquidate } from './operations';
import { json } from './store';
export type Action = 'state' | 'register' | 'approve' | 'accept' | 'fund' | 'price' | 'default' | 'liquidate' | 'deposit/build' | 'deposit/submit' | 'open/build' | 'open/submit' | 'repay/build' | 'repay/submit' | 'repay/topup' | 'claim/build' | 'claim/submit';
export async function dispatch(wallet: string, action: Action, input: Record<string, unknown> = {}) {
  await verified(wallet);
  const id = typeof input.contractId === 'string' ? input.contractId : '', bondId = typeof input.bondId === 'string' ? input.bondId : '';
  switch (action) {
    case 'state': return state(wallet);
    case 'register': return register(wallet, input);
    case 'approve': return approve(wallet, bondId);
    case 'accept': return accept(wallet, bondId);
    case 'fund': return fund(wallet, id);
    case 'price': return setPrice(wallet, id, input.price, bondId);
    case 'default': return markDefault(wallet, id);
    case 'liquidate': return liquidate(wallet, id);
    case 'repay/topup': return topup(wallet, id);
    case 'deposit/build': return build(wallet, id, 'deposit');
    case 'deposit/submit': return submit(wallet, id, 'deposit', input.signedXdr);
    case 'open/build': return build(wallet, id, 'open');
    case 'open/submit': return submit(wallet, id, 'open', input.signedXdr);
    case 'repay/build': return build(wallet, id, 'repay');
    case 'repay/submit': return submit(wallet, id, 'repay', input.signedXdr);
    case 'claim/build': return build(wallet, wallet, 'claim');
    case 'claim/submit': return submit(wallet, wallet, 'claim', input.signedXdr);
  }
}
export async function handle(request: Request, action: Action) {
  try {
    const wallet = await authenticate(request);
    let input: Record<string, unknown> = {};
    if (action !== 'state') {
      try { input = await request.json(); if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error(); }
      catch { throw new ApiError(400, 'JSON inválido.'); }
    }
    const result = await dispatch(wallet, action, input);
    return new Response(json(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof ApiError ? error.message : 'No pudimos confirmar la operación. Consulte su estado antes de reintentar.' }, { status: error instanceof ApiError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
