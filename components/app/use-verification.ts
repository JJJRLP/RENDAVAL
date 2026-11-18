"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePollar } from '@pollar/react';
type Pending = { sessionId: string; url: string };
type Result = { status: 'none' | 'pending' | 'verified'; state?: 'review' | 'rejected' | 'in_progress'; receiptUrl?: string };
export function useVerification(address: string) {
  const { getClient } = usePollar();
  const [result, setResult] = useState<Result>({ status: 'none' });
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const generation = useRef(0);
  const key = `vault:verification:${address}`;
  const api = useCallback(async (action: string, session?: Pending) => {
    const client = getClient();
    const auth = client.getAuthState();
    if (auth.step !== 'authenticated' || !auth.verified || client.getWallet()?.address !== address)
      throw new Error('Su sesión cambió. Cierre sesión e ingrese nuevamente.');
    const response = await fetch(`/api/kyb/${action}`, {
      method: action === 'status' ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${auth.session.token.accessToken}`, 'Content-Type': 'application/json' },
      ...(action !== 'status' ? { body: JSON.stringify({ sessionId: session?.sessionId }) } : {}),
      signal: AbortSignal.timeout(45000),
    }).catch(() => { throw new Error('No pudimos conectar con el servicio. Compruebe su conexión y vuelva a intentar.'); });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No pudimos completar la verificación. Intente nuevamente.');
    return data;
  }, [address, getClient]);
  const save = useCallback((session: Pending | null) => {
    setPending(session);
    try { if (session) localStorage.setItem(key, JSON.stringify(session)); else localStorage.removeItem(key); }
    catch { setStorageWarning('Su navegador no permite guardar el progreso. Habilite el almacenamiento antes de salir o use la aprobación de prueba.'); }
  }, [key]);
  const check = useCallback(async (session: Pending | null, poll = true) => {
    const run = ++generation.current;
    setBusy(true); setError('');
    try {
      for (let i = 0; i < (poll && session ? 5 : 1); i++) {
        const data: Result = await api(session ? 'check' : 'status', session ?? undefined);
        if (run !== generation.current) return;
        setResult(data);
        if (data.status === 'verified') { save(null); break; }
        if (data.status !== 'pending' || data.state !== 'in_progress' || i === 4) break;
        await new Promise(resolve => setTimeout(resolve, Math.min(2000 * 2 ** i, 16000)));
        if (run !== generation.current) return;
      }
    } catch (cause) {
      if (run === generation.current) setError(cause instanceof Error ? cause.message : 'No pudimos comprobar su verificación. Reintente.');
    } finally { if (run === generation.current) setBusy(false); }
  }, [api, save]);
  useEffect(() => {
    const lifecycle = generation;
    const timer = setTimeout(() => {
      let session: Pending | null = null;
      try {
        const stored = JSON.parse(localStorage.getItem(key) || 'null');
        if (typeof stored?.sessionId === 'string' && typeof stored?.url === 'string' && new URL(stored.url).protocol === 'https:') session = stored;
      } catch { /* An absent or stale pointer never grants verification. */ }
      setPending(session);
      const url = new URL(window.location.href);
      if (url.searchParams.has('verificacion')) {
        url.searchParams.delete('verificacion');
        window.history.replaceState(window.history.state, '', url);
      }
      void check(session);
    }, 0);
    return () => { clearTimeout(timer); lifecycle.current++; };
  }, [key, check]);
  async function start(test: boolean) {
    const run = ++generation.current;
    setBusy(true); setStarting(true); setError('');
    try {
      const session: Pending = test && pending ? pending : await api('start');
      if (run !== generation.current) return;
      save(session);
      setResult({ status: 'pending', state: 'in_progress' });
      if (test) {
        const data = await api('simulate', session);
        if (run !== generation.current) return;
        setResult(data);
        if (data.status === 'verified') save(null);
      } else {
        // Require durable pointer before leaving the page.
        try { localStorage.setItem(key, JSON.stringify(session)); }
        catch { throw new Error('Habilite el almacenamiento del navegador para continuar o use la aprobación de prueba.'); }
        window.location.assign(session.url);
      }
    } catch (cause) {
      if (run === generation.current) setError(cause instanceof Error ? cause.message : 'No pudimos iniciar la verificación. Reintente.');
    } finally { if (run === generation.current) { setBusy(false); setStarting(false); } }
  }
  return { result, pending, busy, starting, error, storageWarning, start, refresh: () => void check(pending) };
}
