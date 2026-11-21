"use client";
import { useState } from 'react';
import { countries, DEFAULT_COUNTRY, type CountryCode } from '@/lib/countries';
import { useVerification } from './use-verification';
import { LoanPanel } from './loan-panel';
import type { LoanState } from '@/lib/loan/model';
import { VerificationStages } from './verification-stages';
const quiet = 'inline-flex min-h-11 items-center text-sm underline underline-offset-4 cursor-pointer disabled:opacity-50';
export function VerificationPanel({ address, onLoanState }: { address: string; onLoanState: (state: LoanState) => void }) {
  const { result, pending, busy, starting, error, storageWarning, start, refresh } = useVerification(address);
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const verified = result.status === 'verified';
  const review = result.state === 'review';
  const rejected = result.state === 'rejected';
  const title = starting ? 'Preparando su verificación…' : busy ? (pending ? 'Estamos confirmando su verificación…' : 'Un momento…') : review ? 'Su empresa está en revisión' : rejected ? 'No se aprobó la verificación' : pending ? 'Su verificación está en curso' : 'Verifique su empresa';
  const message = review ? 'Estamos revisando la información recibida. Vuelva a comprobar más tarde o inicie una nueva verificación si necesita corregir sus datos.' : rejected ? 'Revise los datos y documentos de su empresa e inicie una nueva verificación.' : pending ? 'Puede continuar donde quedó. Si ya terminó, vuelva a comprobar el resultado en unos momentos.' : 'Confirmaremos la identidad legal de su empresa. Completar los datos toma unos minutos; la revisión puede tardar más.';
  if (verified) return <LoanPanel address={address} onState={onLoanState} />;
  return <>
    <VerificationStages verified={verified} pending={!!pending} />
    <section className="on-dark mt-4 bg-ink p-6 text-white md:p-10" aria-labelledby="next-step-title">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-bright">Su próximo paso</p>
      <div aria-live="polite" aria-atomic="true">
        <h2 id="next-step-title" className="mt-4 font-serif text-3xl font-semibold">{title}</h2>
        <p className="mt-3 max-w-xl leading-7 text-white/75">{message}</p>
        {busy && pending && <p className="mt-4 text-sm text-blue-bright">Esto puede tardar unos segundos.</p>}
      </div>
      <label className="mt-6 block max-w-xl text-sm">País de la empresa
        <select disabled={busy} value={country} onChange={e => setCountry(e.target.value as CountryCode)} className="mt-2 min-h-11 w-full border border-white/30 bg-ink px-3 py-2 text-white focus:outline-2 focus:outline-blue-bright">
          {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </label>
      <p className="mt-2 max-w-xl text-xs leading-6 text-white/60">Para empresas de cualquier país. Comenzamos en Bolivia. El país elegido se aplica al iniciar una nueva verificación; «Otro país» utiliza USD.</p>
      {pending && <p className="mt-2 text-sm text-white/75">Verificación en curso: {countries.find(c => c.code === (pending.country ?? DEFAULT_COUNTRY))?.name}.</p>}
      <div className="mt-6 flex flex-col items-start gap-2">
        {error && <p role="alert" className="mb-2 max-w-xl border-l-2 border-blue-bright pl-4 leading-7">{error}</p>}
        <button disabled={busy} onClick={pending && !rejected ? refresh : () => void start(false, country)} className="btn-primary w-full disabled:cursor-wait disabled:opacity-60 sm:w-auto">
          {starting ? 'Preparando verificación…' : busy ? 'Un momento…' : pending && !rejected ? 'Volver a comprobar' : rejected ? 'Iniciar nueva verificación' : error ? 'Reintentar' : 'Comenzar verificación'}
        </button>
        {pending && !rejected && <a href={pending.url} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} className={quiet}>Continuar verificación</a>}
        {review && <button disabled={busy} className={quiet} onClick={() => void start(false, country)}>Iniciar nueva verificación</button>}
        <button disabled={busy} className={`${quiet} text-white/65`} onClick={() => void start(true, country)}>Usar aprobación de prueba</button>
        <p className="text-xs text-white/50">Solo para esta versión de prueba.</p>
        {storageWarning && <p role="alert" className="mt-2 text-sm">{storageWarning}</p>}
      </div>
    </section>
  </>;
}
