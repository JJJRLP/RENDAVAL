'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '@pollar/react';
import { bondUsd, normalizeBond, type Bond, type LoanState } from '@/lib/loan/model';
export function useLoan(address: string, onState: (state: LoanState) => void) {
  const { getClient, signTx } = usePollar();
  const [bond, setBond] = useState<Bond | null>(null);
  const [state, setState] = useState<LoanState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [step, setStep] = useState(-1);
  const [repayStep, setRepayStep] = useState(-1), [providerMessage, setProviderMessage] = useState('');
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
  const release = useCallback(async (contractId: string) => {
    setRepayStep(2);
    const result = await api<{ status: string; providerMessage?: string }>('settle', { contractId });
    if (alive.current) setProviderMessage(result.providerMessage ?? '');
    const current = await refresh();
    if (current.loans.find(l => l.escrow?.contractId === contractId)?.stage === 'closed') setRepayStep(3);
  }, [api, refresh]);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => void run(async () => { await refresh(); }), 0);
    return () => { alive.current = false; clearTimeout(timer); };
  }, [refresh, run]);
  const register = (bond: Bond) => run(async () => {
    setStep(-1);
    try { localStorage.setItem(`vault:bond:${address}`, JSON.stringify(bond)); } catch { /* Escrow can resume with the on-chain balance and issuance memo. */ }
    await api('register', bond);
    await refresh();
  });
  const proceed = () => run(async () => {
    let current = await refresh();
    if (!current.setup) { setStep(3); return; }
    if (current.setup.stage === 'bond_registered') {
      setStep(0);
      let bond: Bond | undefined;
      try { bond = normalizeBond(JSON.parse(localStorage.getItem(`vault:bond:${address}`) || 'null')) ?? undefined; } catch { /* Optional metadata. */ }
      // Returned collateral can differ from the original nominal after provider fees.
      if (bond && Math.abs(bondUsd(bond) - current.bonds) > 0.000001) bond = undefined;
      await api('accept', { bond }); current = await refresh();
    }
    const contractId = current.setup?.escrow?.contractId;
    if (!contractId) throw new Error('Estamos confirmando su garantía. Vuelva a continuar.');
    if (current.setup?.stage === 'escrow_created') {
      setStep(1);
      const built = await api<{ unsignedTransaction: string }>('deposit/build', { contractId });
      const signed = await signTx(built.unsignedTransaction);
      if (signed.status !== 'signed') throw new Error('El depósito no fue confirmado. Puede volver a intentarlo.');
      await api('deposit/submit', { contractId, signedXdr: signed.signedXdr });
      current = await refresh();
    }
    setStep(2);
    for (let i = 0; current.setup?.stage === 'escrow_created' && i < 4; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); current = await refresh();
    }
    if (current.setup?.stage !== 'collateral_locked') throw new Error('Estamos confirmando su garantía. Vuelva a continuar en unos segundos.');
    await api('disburse', { contractId }); await refresh(); setStep(3);
  });
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
    if (current?.stage === 'repaid_release_pending') await release(contractId);
    else if (current?.stage === 'closed') setRepayStep(3);
  }, contractId);
  return { state, bond, busy, error, step, repayStep, providerMessage, operationId, repay, settle: (contractId: string) => run(() => release(contractId), contractId), register, proceed, retry: () => run(async () => { await refresh(); }) };
}
