'use client';
import { useState } from 'react';
import { EXAMPLE_ANNUAL_RATE, formatNumber } from '@/lib/format';
import type { LoanState } from '@/lib/loan/model';
import { useLoan } from './use-loan';
import { BondForm } from './bond-form';
import { VerificationStages } from './verification-stages';
const progress = ['Preparando su garantía', 'Confirme el depósito', 'Garantía protegida', 'Dólares enviados'];
export function LoanPanel({ address, onState }: { address: string; onState: (state: LoanState) => void }) {
  const [now] = useState(() => Date.now());
  const loan = useLoan(address, onState), state = loan.state;
  const active = state?.stage === 'active';
  const quote = state && state.stage !== 'none';
  const t = state?.terms;
  return <>
    <section className="on-dark mt-10 bg-ink p-6 text-white md:p-10" aria-labelledby="next-step-title" aria-busy={loan.busy}>
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-bright">{active ? 'Su financiamiento' : 'Su próximo paso'}</p>
      <h2 id="next-step-title" className="mt-4 font-serif text-3xl font-semibold">{!state ? 'Consultando su progreso…' : active ? 'Préstamo activo' : state.stage === 'none' ? 'Registre su bono' : 'Sus bonos abren nuevas posibilidades'}</h2>
      {loan.error && <p role="alert" className="mt-5 border-l-2 border-teal-bright pl-4 leading-7">{loan.step >= 0 && !active ? `${progress[loan.step]}: ` : ''}{loan.error}</p>}
      {!state && <button disabled={loan.busy} onClick={loan.retry} className="btn-primary mt-6 disabled:opacity-60">{loan.busy ? 'Consultando…' : 'Volver a consultar'}</button>}
      {state?.stage === 'none' && <BondForm busy={loan.busy} register={loan.register} />}
      {quote && t && <>
        {loan.bond && typeof loan.bond.issuer === 'string' && <p className="mt-4 text-sm text-white/65">{loan.bond.issuer} · Serie {loan.bond.series}</p>}
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-sm text-white/70">{active ? 'Recibió dólares digitales' : 'Recibe dólares digitales'}</p>
            <p className="mt-2 break-words font-serif text-5xl font-semibold sm:text-6xl">{formatNumber(t.loan, 2)} <span className="font-sans text-lg text-teal-bright">USDC</span></p>
            <p className="mt-5 text-sm leading-7 text-white/75">Sus bonos siguen siendo suyos y conservan su cupón mientras respaldan el préstamo.</p>
            <p className="mt-3 text-xs leading-6 text-white/50">Condiciones fijadas por Vault. Esta versión usa fondos de prueba: garantía de USD 100 a USD 1.000 y préstamo de hasta 500 USDC.</p>
          </div>
          <dl className="grid gap-3 border-t border-white/20 pt-5 text-sm lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {[
              ['Garantía', `Bs ${formatNumber(t.nominalBs, 2)} · USD ${formatNumber(t.collateral, 2)}`],
              ['Financiamiento', '50 % del valor de sus bonos'],
              ['Tasa anual', `${formatNumber(EXAMPLE_ANNUAL_RATE * 100)} % fija`],
              ['Plazo', '30 días'],
              ['Costo por 30 días', `${formatNumber(t.interest, 2)} USDC`],
              ['Total a devolver', `${formatNumber(t.total, 2)} USDC`],
              [active ? 'Vencimiento' : 'Vencimiento estimado', new Date(t.dueDate).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })],
            ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-white/65">{label}</dt><dd className="font-semibold">{value}</dd></div>)}
          </dl>
        </div>
        <p className="mt-5 text-xs text-white/50">Referencia de prueba: Bs 6,96 por USD. Registro digital simulado, sin custodio real.{!active && ' El plazo empieza cuando se envían los dólares.'}</p>
        {(loan.step >= 0 || state.stage !== 'bond_registered') && <ol aria-live="polite" className="mt-7 grid gap-3 border-t border-white/20 pt-5 text-sm sm:grid-cols-2">
          {progress.map((label, i) => { const current = active ? 3 : Math.max(loan.step, state.stage === 'collateral_locked' ? 2 : state.stage === 'escrow_created' ? 1 : 0); return <li key={label} aria-current={i === current ? 'step' : undefined} className={i <= current ? 'text-teal-bright' : 'text-white/45'}>{i < current || active ? '✓' : i === current ? '→' : '○'} {label}</li>; })}
        </ol>}
        {active ? <>
          <p role="status" className="mt-6 text-teal-bright">Dólares enviados a su cuenta. {Math.max(0, Math.ceil((Date.parse(t.dueDate) - now) / 86400000))} días restantes.</p>
          <button disabled className="mt-6 min-h-12 w-full border border-white/30 px-6 py-3 font-semibold text-white/60 sm:w-auto">Reembolso disponible muy pronto</button>
        </> : <button disabled={loan.busy} onClick={() => void loan.proceed()} className="btn-primary mt-6 w-full disabled:opacity-60 sm:w-auto">{loan.busy ? `${progress[Math.max(0, loan.step)]}…` : loan.error ? 'Reintentar y continuar' : state.stage === 'bond_registered' ? 'Aceptar y depositar garantía' : state.stage === 'collateral_locked' ? 'Continuar con el desembolso' : 'Continuar con el depósito'}</button>}
      </>}
      {state && <details className="mt-6 border-t border-white/20 pt-3 text-sm text-white/65">
        <summary className="min-h-11 cursor-pointer py-3">Ver detalle técnico</summary>
        <p className="leading-6">Stellar testnet · 1 VBOND representa USD 1 de garantía simulada. La cuenta paga la comisión de depósito en XLM.</p>
        <a className="block py-3 underline" href={state.verification.receiptUrl} target="_blank" rel="noreferrer">Constancia de empresa ↗</a>
        {state.escrow && <><a className="block py-3 underline" href={state.escrow.url} target="_blank" rel="noreferrer">Contrato de garantía ↗</a><p className="break-words text-xs">{state.escrow.description}</p></>}
        {state.transactions.map(tx => <a key={tx.hash} className="block py-3 underline" href={tx.url} target="_blank" rel="noreferrer">{tx.label} ↗</a>)}
      </details>}
    </section>
    <VerificationStages verified pending={false} stage={state?.stage} />
  </>;
}
