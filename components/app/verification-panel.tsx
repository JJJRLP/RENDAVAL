"use client";
import { useVerification } from './use-verification';
import { VerificationStages } from './verification-stages';
const quiet = 'inline-flex min-h-11 items-center text-sm underline underline-offset-4 cursor-pointer disabled:opacity-50';
export function VerificationPanel({ address }: { address: string }) {
  const { result, pending, busy, starting, error, storageWarning, start, refresh } = useVerification(address);
  const verified = result.status === 'verified';
  const review = result.state === 'review';
  const rejected = result.state === 'rejected';
  const title = verified ? 'Empresa verificada' : starting ? 'Preparando su verificación…' : busy ? (pending ? 'Estamos confirmando su verificación…' : 'Un momento…') : review ? 'Su empresa está en revisión' : rejected ? 'No se aprobó la verificación' : pending ? 'Su verificación está en curso' : 'Verifique su empresa';
  const message = verified ? 'La identidad legal de su empresa ha sido confirmada.' : review ? 'Estamos revisando la información recibida. Vuelva a comprobar más tarde o inicie una nueva verificación si necesita corregir sus datos.' : rejected ? 'Revise los datos y documentos de su empresa e inicie una nueva verificación.' : pending ? 'Puede continuar donde quedó. Si ya terminó, vuelva a comprobar el resultado en unos momentos.' : 'Confirmaremos la identidad legal de su empresa. Completar los datos toma unos minutos; la revisión puede tardar más.';
  return <>
    <section className="on-dark mt-10 bg-ink p-6 text-white md:p-10" aria-labelledby="next-step-title">
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-bright">{verified ? 'Primer paso completado' : 'Su próximo paso'}</p>
      <div aria-live="polite" aria-atomic="true">
        <h2 id="next-step-title" className="mt-4 font-serif text-3xl font-semibold">{verified && <span aria-hidden="true">✓ </span>}{title}</h2>
        <p className="mt-3 max-w-xl leading-7 text-white/75">{message}</p>
        {busy && pending && <p className="mt-4 text-sm text-teal-bright">Esto puede tardar unos segundos.</p>}
      </div>
      {verified ? <>
        <a href={result.receiptUrl} target="_blank" rel="noopener noreferrer" className={`${quiet} mt-2`}>Ver constancia<span className="sr-only"> (abre una pestaña nueva)</span> ↗</a>
        <div className="mt-6 border-t border-white/20 pt-6">
          <p className="text-xs uppercase tracking-widest text-teal-bright">Su próximo paso</p>
          <h3 className="mt-3 font-serif text-2xl font-semibold">Deposite sus bonos en garantía</h3>
          <p className="mt-3 text-white/75">Pronto podrá usar sus bonos para solicitar financiamiento.</p>
          <button disabled className="mt-6 min-h-12 cursor-not-allowed border border-white/40 px-6 py-3 font-semibold text-white/70">Disponible muy pronto</button>
        </div>
      </> : <div className="mt-6 flex flex-col items-start gap-2">
        {error && <p role="alert" className="mb-2 max-w-xl border-l-2 border-teal-bright pl-4 leading-7">{error}</p>}
        <button disabled={busy} onClick={pending && !rejected ? refresh : () => void start(false)} className="btn-primary w-full disabled:cursor-wait disabled:opacity-60 sm:w-auto">
          {starting ? 'Preparando verificación…' : busy ? 'Un momento…' : pending && !rejected ? 'Volver a comprobar' : rejected ? 'Iniciar nueva verificación' : error ? 'Reintentar' : 'Comenzar verificación'}
        </button>
        {pending && !rejected && <a href={pending.url} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} className={quiet}>Continuar verificación</a>}
        {review && <button disabled={busy} className={quiet} onClick={() => void start(false)}>Iniciar nueva verificación</button>}
        <button disabled={busy} className={`${quiet} text-white/65`} onClick={() => void start(true)}>Usar aprobación de prueba</button>
        <p className="text-xs text-white/50">Solo para esta versión de prueba.</p>
        {storageWarning && <p role="alert" className="mt-2 text-sm">{storageWarning}</p>}
      </div>}
    </section>
    <VerificationStages verified={verified} pending={!!pending} />
  </>;
}
