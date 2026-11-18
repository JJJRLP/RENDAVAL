"use client";
import { useVerification } from './use-verification';
import { LoanPanel } from './loan-panel';
import type { LoanState } from '@/lib/loan/model';
import { VerificationStages } from './verification-stages';
const quiet = 'inline-flex min-h-11 items-center text-sm underline underline-offset-4 cursor-pointer disabled:opacity-50';
export function VerificationPanel({ address, onLoanState }: { address: string; onLoanState: (state: LoanState) => void }) {
  const { result, pending, busy, starting, error, storageWarning, start, refresh } = useVerification(address);
  const verified = result.status === 'verified';
  const review = result.state === 'review';
  const rejected = result.state === 'rejected';
  const title = starting ? 'Preparando su verificación…' : busy ? (pending ? 'Estamos confirmando su verificación…' : 'Un momento…') : review ? 'Su empresa está en revisión' : rejected ? 'No se aprobó la verificación' : pending ? 'Su verificación está en curso' : 'Verifique su empresa';
  const message = review ? 'Estamos revisando la información recibida. Vuelva a comprobar más tarde o inicie una nueva verificación si necesita corregir sus datos.' : rejected ? 'Revise los datos y documentos de su empresa e inicie una nueva verificación.' : pending ? 'Puede continuar donde quedó. Si ya terminó, vuelva a comprobar el resultado en unos momentos.' : 'Confirmaremos la identidad legal de su empresa. Completar los datos toma unos minutos; la revisión puede tardar más.';
  if (verified) return <LoanPanel address={address} onState={onLoanState} />;
  return <>
    <VerificationStages verified={verified} pending={!!pending} />
    <section className="on-dark mt-4 bg-ink p-6 text-white md:p-10" aria-labelledby="next-step-title">
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-bright">Su próximo paso</p>
      <div aria-live="polite" aria-atomic="true">
        <h2 id="next-step-title" className="mt-4 font-serif text-3xl font-semibold">{title}</h2>
        <p className="mt-3 max-w-xl leading-7 text-white/75">{message}</p>
        {busy && pending && <p className="mt-4 text-sm text-teal-bright">Esto puede tardar unos segundos.</p>}
      </div>
      <div className="mt-6 flex flex-col items-start gap-2">
        {error && <p role="alert" className="mb-2 max-w-xl border-l-2 border-teal-bright pl-4 leading-7">{error}</p>}
        <button disabled={busy} onClick={pending && !rejected ? refresh : () => void start(false)} className="btn-primary w-full disabled:cursor-wait disabled:opacity-60 sm:w-auto">
          {starting ? 'Preparando verificación…' : busy ? 'Un momento…' : pending && !rejected ? 'Volver a comprobar' : rejected ? 'Iniciar nueva verificación' : error ? 'Reintentar' : 'Comenzar verificación'}
        </button>
        {pending && !rejected && <a href={pending.url} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} className={quiet}>Continuar verificación</a>}
        {review && <button disabled={busy} className={quiet} onClick={() => void start(false)}>Iniciar nueva verificación</button>}
        <button disabled={busy} className={`${quiet} text-white/65`} onClick={() => void start(true)}>Usar aprobación de prueba</button>
        <p className="text-xs text-white/50">Solo para esta versión de prueba.</p>
        {storageWarning && <p role="alert" className="mt-2 text-sm">{storageWarning}</p>}
      </div>
    </section>
  </>;
}
