'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '@pollar/react';
import type { Bond, LoanState } from '@/lib/loan/model';
import type { CompanyState } from '@/lib/loan/client-state';
export function useLoan(address: string, onState: (state: LoanState) => void) {
  const { getClient, signTx } = usePollar();
  const [state, setState] = useState<CompanyState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [waiting, setWaiting] = useState<{ id: string; price: number; until: number } | null>(null);
  const lock = useRef(false), alive = useRef(true);
  const api = useCallback(async <T,>(action: string, body?: unknown): Promise<T> => {
    const client = getClient(), auth = client.getAuthState();
    if (auth.step !== 'authenticated' || !auth.verified || client.getWallet()?.address !== address) throw new Error('Su sesión cambió. Ingrese nuevamente.');
    const r = await fetch(`/api/loan/${action}`, { method: action === 'state' ? 'GET' : 'POST', headers: { Authorization: `Bearer ${auth.session.token.accessToken}`, 'Content-Type': 'application/json' }, ...(action === 'state' ? {} : { body: JSON.stringify(body ?? {}) }), signal: AbortSignal.timeout(310000) }).catch(() => { throw new Error('No pudimos confirmar la operación. Consulte el estado y reintente; recuperaremos los pasos confirmados.'); });
    const data = await r.json();
    if (typeof data.error === 'string' && /El contrato no permite|Lectura .* no disponible/.test(data.error)) data.error = 'No se puede completar este paso con el estado actual. Consulte el estado, compruebe sus saldos y el precio vigente, y vuelva a intentar. Si continúa, contacte al equipo de Rendaval.';
    if (!r.ok || r.status === 202) throw new Error(r.status === 202 ? 'La transacción sigue confirmándose. Consulte de nuevo en 5 segundos antes de reintentar.' : data.error || 'No pudimos completar este paso. Reintente.');
    return data as T;
  }, [address, getClient]);
  const refresh = useCallback(async () => {
    const current = await api<CompanyState>('state');
    if (alive.current) { setState(current); onState(current); }
    return current;
  }, [api, onState]);
  const run = useCallback(async (task: () => Promise<void>) => {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setMessage('Confirmando en Stellar. Este paso puede tardar hasta 5 minutos; puede volver y recuperar su progreso.');
    try { await task(); await refresh(); if (alive.current) setMessage('Paso confirmado. Su estado está actualizado.'); return true; }
    catch (cause) { if (alive.current) { setError(cause instanceof Error ? cause.message : 'No se completó el paso. Puede reintentar.'); setMessage(''); await refresh().catch(() => undefined); } return false; }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }, [refresh]);
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => { setBusy(true); void refresh().catch(() => setError('No pudimos consultar su progreso. Vuelva a consultar.')).finally(() => { if (alive.current) setBusy(false); }); }, 0);
    return () => { alive.current = false; clearTimeout(timer); };
  }, [refresh]);
  const action = (name: string, body: unknown) => run(async () => { await api(name, body); });
  const sign = (name: string, contractId?: string) => run(async () => {
    const body = contractId ? { contractId } : {};
    const built = await api<{ completed?: boolean; unsignedTransaction?: string }>(`${name}/build`, body);
    if (built.completed) return;
    if (!built.unsignedTransaction) throw new Error('No se pudo preparar la firma. Reintente.');
    setMessage('Confirme la firma en su cuenta. Si la cancela, puede volver a intentar este mismo paso.');
    const signed = await signTx(built.unsignedTransaction);
    if (signed.status !== 'signed') throw new Error('Firma cancelada o no completada. Puede reintentar; comprobaremos antes su progreso.');
    setMessage('Firma recibida. Confirmando en Stellar; puede tardar hasta 5 minutos.');
    await api(`${name}/submit`, { ...body, signedXdr: signed.signedXdr });
  });
  const setPrice = (id: string, price: number) => run(async () => {
    const result = await api<{ status: string; nextChangeAt: number }>('price', { contractId: id, price });
    setWaiting(result.status === 'waiting' ? { id, price, until: result.nextChangeAt } : null);
  });
  return { state, busy, error, message, waiting, action, sign, setPrice, register: (bond: Bond, certificateHash: string) => action('register', { bond, certificateHash }), retry: () => run(async () => {}) };
}
