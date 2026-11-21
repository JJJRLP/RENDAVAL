import 'server-only';
import { authenticate } from '../pollar';
import { ApiError } from '../env';
import { state, verified } from './state';
import { register } from './register';
import { accept } from './accept';
import { buildDeposit, submitDeposit } from './deposit';
import { disburse } from './disburse';
import { topup, buildRepayment, submitRepayment } from './repayment';
import { setPrice } from './price';
import { settle } from './settle';
export async function handle(request: Request, action: 'price' | 'state' | 'register' | 'accept' | 'deposit/build' | 'deposit/submit' | 'disburse' | 'repay/topup' | 'repay/build' | 'repay/submit' | 'settle') {
  try {
    const wallet = await authenticate(request);
    await verified(wallet);
    let input: Record<string, unknown> = {};
    if (action !== 'state') {
      try { input = await request.json(); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); }
      catch { throw new ApiError(400, 'La solicitud no es válida. Reintente.'); }
    }
    const contractId = typeof input.contractId === 'string' ? input.contractId : '';
    const result = action === 'price' ? await setPrice(wallet, contractId, input.price) : action === 'state' ? await state(wallet) : action === 'register' ? await register(wallet, input) : action === 'accept' ? await accept(wallet, input.bond) : action === 'deposit/build' ? await buildDeposit(wallet, contractId) : action === 'deposit/submit' ? await submitDeposit(wallet, input.signedXdr, contractId) : action === 'repay/topup' ? await topup(wallet, contractId) : action === 'repay/build' ? await buildRepayment(wallet, contractId) : action === 'repay/submit' ? await submitRepayment(wallet, input.signedXdr, contractId) : action === 'settle' ? await settle(wallet, contractId) : await disburse(wallet, contractId);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof ApiError ? error.message : 'No pudimos conectar con el servicio. Su progreso está guardado; intente nuevamente.' }, { status: error instanceof ApiError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
