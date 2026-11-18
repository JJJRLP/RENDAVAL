'use client';
import { useState } from 'react';
import { EXAMPLE_ANNUAL_RATE, formatNumber } from '@/lib/format';
import { terms, type LoanState } from '@/lib/loan/model';
import { useLoan } from './use-loan';
import { BondForm } from './bond-form';
import { VerificationStages } from './verification-stages';
const progress = ['Preparando su garantía', 'Confirme el depósito', 'Garantía protegida', 'Dólares enviados'];
export function LoanPanel({ address, onState }: { address: string; onState: (state: LoanState) => void }) {
  const [now] = useState(() => Date.now());
  const loan = useLoan(address, onState), state = loan.state;
  const active = state?.stage === 'active';
  const pendingRelease = state?.stage === 'repaid_release_pending';
  const closed = state?.stage === 'closed' && !loan.newLoan;
  const repaymentFlow = active || pendingRelease || closed;
  const quote = state && state.stage !== 'none';
  const t = loan.newLoan && state ? terms(state.bonds) : state?.terms;
  return <>
    <section className="on-dark mt-10 bg-ink p-6 text-white md:p-10" aria-labelledby="next-step-title" aria-busy={loan.busy}>
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-bright">{closed ? 'Préstamo completado' : pendingRelease ? 'Su reembolso' : active ? 'Su financiamiento' : 'Su próximo paso'}</p>
      <h2 id="next-step-title" className="mt-4 font-serif text-3xl font-semibold">{!state ? 'Consultando su progreso…' : closed ? 'Préstamo cerrado' : pendingRelease ? 'Pago recibido' : active ? 'Préstamo activo' : state.stage === 'none' ? 'Registre su bono' : 'Su oferta de financiamiento'}</h2>
      {loan.error && <p role="alert" className="mt-5 border-l-2 border-teal-bright pl-4 leading-7">{loan.step >= 0 && !repaymentFlow ? `${progress[loan.step]}: ` : ''}{loan.error}</p>}
      {!state && <button disabled={loan.busy} onClick={loan.retry} className="btn-primary mt-6 disabled:opacity-60">{loan.busy ? 'Consultando…' : 'Volver a consultar'}</button>}
      {state?.stage === 'none' && <BondForm busy={loan.busy} register={loan.register} />}
      {quote && t && !pendingRelease && !closed && <>
        {loan.bond && typeof loan.bond.issuer === 'string' && <p className="mt-4 text-sm text-white/65">{loan.bond.issuer} · Serie {loan.bond.series}</p>}
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-sm text-white/70">{active ? 'Recibió dólares digitales' : 'Recibe dólares digitales'}</p>
            <p className="mt-2 break-words font-serif text-5xl font-semibold sm:text-6xl">{formatNumber(t.loan, 2)} <span className="font-sans text-lg text-teal-bright">USDC</span></p>
            <p className="mt-5 text-sm leading-7 text-white/75">Sus bonos siguen siendo suyos y conservan su cupón mientras respaldan el préstamo.</p>
            <p className="mt-3 text-xs leading-6 text-white/50">Condiciones fijadas por Vault. Esta versión usa fondos de prueba: garantía de USD 100 a USD 400 y préstamo de hasta 200 USDC.</p>
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
        {!repaymentFlow && (loan.step >= 0 || state.stage !== 'bond_registered') && <ol aria-live="polite" className="mt-7 grid gap-3 border-t border-white/20 pt-5 text-sm sm:grid-cols-2">
          {progress.map((label, i) => { const current = active ? 3 : Math.max(loan.step, state.stage === 'collateral_locked' ? 2 : state.stage === 'escrow_created' ? 1 : 0); return <li key={label} aria-current={i === current ? 'step' : undefined} className={i <= current ? 'text-teal-bright' : 'text-white/45'}>{i < current || active ? '✓' : i === current ? '→' : '○'} {label}</li>; })}
        </ol>}
        {active ? <>
          <p role="status" className="mt-6 text-teal-bright">Dólares enviados a su cuenta. {Math.max(0, Math.ceil((Date.parse(t.dueDate) - now) / 86400000))} días restantes.</p>
          <p className="mt-4 leading-7 text-white/75">Reembolsa {formatNumber(t.loan, 2)} USDC de capital y {formatNumber(t.interest, 2)} USDC de interés. Sus bonos se devuelven cuando el prestamista confirma el pago y el proveedor completa la liberación.</p>
          <p className="mt-3 text-xs leading-6 text-white/60">En esta versión de prueba añadimos los dólares del interés para que pueda completar el reembolso.</p>
          <button disabled={loan.busy} onClick={loan.repay} className="btn-primary mt-6 w-full disabled:opacity-60 sm:w-auto">{loan.busy ? 'Procesando su reembolso…' : `Reembolsar ${formatNumber(t.total, 2)} USDC`}</button>
        </> : <button disabled={loan.busy} onClick={() => void loan.proceed()} className="btn-primary mt-6 w-full disabled:opacity-60 sm:w-auto">{loan.busy ? `${progress[Math.max(0, loan.step)]}…` : loan.error ? 'Reintentar y continuar' : (state.stage === 'bond_registered' || loan.newLoan) ? 'Aceptar y depositar garantía' : state.stage === 'collateral_locked' ? 'Continuar con el desembolso' : 'Continuar con el depósito'}</button>}
      </>}
      {(pendingRelease || closed) && state?.repayment && <div className="mt-6" role="status">
        <p className="max-w-2xl leading-8">{closed ? `Recibimos su pago de ${formatNumber(state.repayment.amount, 2)} USDC y sus bonos fueron devueltos a su cuenta. Tiene USD ${formatNumber(state.bonds, 2)} en bonos disponibles.` : `Recibimos su pago de ${formatNumber(state.repayment.amount, 2)} USDC. La devolución de sus bonos está en proceso con nuestro proveedor de custodia. Sus bonos siguen protegidos.`}</p>
        <p className="mt-4 text-sm text-white/65">Pago recibido el {new Date(state.repayment.at).toLocaleDateString('es-BO', { timeZone: 'UTC' })}.</p>
        {closed ? <button onClick={loan.requestNew} disabled={loan.busy} className="btn-primary mt-6 w-full sm:w-auto">Solicitar un nuevo préstamo</button> : <button onClick={loan.settle} disabled={loan.busy} className="mt-6 min-h-12 border border-white/30 px-6 py-3 font-semibold disabled:opacity-60">{loan.busy ? 'Comprobando la devolución…' : 'Volver a intentar'}</button>}
      </div>}
      {repaymentFlow && <ol aria-live="polite" className="mt-7 grid gap-3 border-t border-white/20 pt-5 text-sm sm:grid-cols-2">
        {['Preparando el reembolso', 'Confirme el pago', 'Pago recibido', 'Bonos liberados'].map((label, i) => {
          const current = closed ? 3 : pendingRelease ? 2 : loan.repayStep;
          return <li key={label} aria-current={i === current ? 'step' : undefined} className={i <= current ? 'text-teal-bright' : 'text-white/45'}>{i < current || closed || (pendingRelease && i === 2) ? '✓' : i === current ? '→' : '○'} {label}{pendingRelease && i === 3 ? ' · En proceso' : ''}</li>;
        })}
      </ol>}
      {state && <details className="mt-6 border-t border-white/20 pt-3 text-sm text-white/65">
        <summary className="min-h-11 cursor-pointer py-3">Ver detalle técnico</summary>
        <p className="leading-6">Stellar testnet · 1 VBOND representa USD 1 de garantía simulada. La cuenta paga la comisión de depósito en XLM.</p>
        <a className="block py-3 underline" href={state.verification.receiptUrl} target="_blank" rel="noreferrer">Constancia de empresa ↗</a>
        {state.escrow && <><a className="block py-3 underline" href={state.escrow.url} target="_blank" rel="noreferrer">Contrato de garantía ↗</a><p className="break-words text-xs">{state.escrow.description}</p></>}
        {loan.providerMessage && <p className="mt-3 break-words">Respuesta del proveedor: {loan.providerMessage}</p>}
        {state.repayment && <a className="block py-3 underline" href={state.repayment.url} target="_blank" rel="noreferrer">Reembolso ↗</a>}
        {state.transactions.map(tx => <a key={tx.hash} className="block py-3 underline" href={tx.url} target="_blank" rel="noreferrer">{tx.label} ↗</a>)}
      </details>}
    </section>
    <VerificationStages verified pending={false} stage={loan.newLoan ? 'bond_registered' : state?.stage} />
  </>;
}
