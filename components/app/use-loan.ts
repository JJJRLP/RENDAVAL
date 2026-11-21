'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '@pollar/react';
import { normalizeBond, type Bond, type LoanState } from '@/lib/loan/model';
export function useLoan(address: string, onState: (state: LoanState) => void) {
  const { getClient, signTx } = usePollar();
  const [bond, setBond] = useState<Bond | null>(null);
  const [state, setState] = useState<LoanState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [step] = useState(-1);
  const [repayStep, setRepayStep] = useState(-1), [providerMessage] = useState('');
  const [operationId, setOperationId] = useState<string | null>(null);
  const lock = useRef(false), alive = useRef(true);
  const api = useCallback(async <T,>(action: string, body?: unknown): Promise<T> => {
    const client = getClient(), auth = client.getAuthState();
    if (auth.step !== 'authenticated' || !auth.verified || client.getWallet()?.address !== address) throw new Error('Su sesión cambió. Ingrese nuevamente.');
    const r = await fetch(`/api/loan/${action}`, { method: action === 'state' ? 'GET' : 'POST', headers: { Authorization: `Bearer ${auth.session.token.accessToken}`, 'Content-Type': 'application/json' }, ...(action === 'state' ? {} : { body: JSON.stringify(body ?? {}) }), signal: AbortSignal.timeout(125000) }).catch(() => { throw new Error('No pudimos confirmar la operación. Vuelva a intentar: comprobaremos su progreso antes de continuar.'); });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No pudimos completar este paso. Vuelva a intentar.');
    return data as T;
  }, [address, getClient]);
  const refresh = useCallback(async () => {
    const current = await api<LoanState>('state');
    if (alive.current) {
      setState(current); onState(current);
      try { setBond(normalizeBond(JSON.parse(current.setup?.escrow?.description ?? localStorage.getItem(`vault:bond:${address}`) ?? 'null'))); } catch { setBond(null); }
    }
    return current;
  }, [address, api, onState]);
  const run = useCallback(async (task: () => Promise<void>, contractId: string | null = null) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setOperationId(contractId);
    try { await task(); return true; }
    catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : 'No pudimos completar este paso. Reintente.');
      // A lost response may follow a committed transaction; recover before retrying.
      if (alive.current) await refresh().catch(() => undefined);
      return false;
    }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }, [refresh]);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => void run(async () => { await refresh(); }), 0);
    return () => { alive.current = false; clearTimeout(timer); };
  }, [refresh, run]);
  const register = (bond: Bond) => run(async () => { void bond; throw new Error('Registro con certificado y revisión disponible por API; pantalla pendiente de fase B2.'); });
  const proceed = () => run(async () => { throw new Error('La preparación C3b requiere dos firmas; pantalla pendiente de fase B2.'); });
  const repay = (contractId: string) => run(async () => {
    let current = (await refresh()).loans.find(l => l.escrow?.contractId === contractId);
    if (current?.stage === 'active') {
      setRepayStep(0); await api('repay/topup', { contractId });
      setRepayStep(1);
      const built = await api<{ repaid: boolean; unsignedTransaction?: string }>('repay/build', { contractId });
      if (!built.repaid && built.unsignedTransaction) {
        const signed = await signTx(built.unsignedTransaction);
        if (signed.status !== 'signed') throw new Error('El pago aún no fue confirmado. Puede volver a intentarlo.');
        await api('repay/submit', { contractId, signedXdr: signed.signedXdr });
      }
      current = (await refresh()).loans.find(l => l.escrow?.contractId === contractId);
    }
    if (current?.stage === 'closed') setRepayStep(3);
  }, contractId);
  const setPrice = (contractId: string, price: number) => run(async () => {
    setRepayStep(-1);
    await api('price', { contractId, price });
    await refresh();
  }, contractId);
  return { setPrice, state, bond, busy, error, step, repayStep, providerMessage, operationId, repay, settle: (contractId: string) => run(async () => { await refresh(); }, contractId), register, proceed, retry: () => run(async () => { await refresh(); }) };
}
