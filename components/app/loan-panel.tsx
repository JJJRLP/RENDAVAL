'use client';
import { useState, type ReactNode } from 'react';
import { EXAMPLE_ANNUAL_RATE, formatNumber } from '@/lib/format';
import { terms, type LoanState } from '@/lib/loan/model';
import { useLoan } from './use-loan';
import { BondForm } from './bond-form';
import { VerificationStages } from './verification-stages';

const DEPOSIT_STEPS = ['Preparando su garantía', 'Confirme el depósito', 'Garantía protegida', 'Dólares enviados'];
const REPAY_STEPS = ['Preparando el reembolso', 'Confirme el pago', 'Pago recibido', 'Bonos devueltos'];
const usdc = (value: number) => `${formatNumber(value, 2)} USDC`;
const day = (iso: string) => new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Progress of a running operation. Hidden until the person starts it. */
function Checklist({ steps, current, done }: { steps: string[]; current: number; done?: boolean }) {
  return (
    <ol aria-live="polite" className="mt-6 grid gap-2 text-sm sm:grid-cols-4">
      {steps.map((label, i) => (
        <li key={label} aria-current={i === current && !done ? 'step' : undefined} className={`border-t-2 pt-2 ${i <= current || done ? 'border-teal-bright text-white' : 'border-white/20 text-white/45'}`}>
          <span aria-hidden="true">{i < current || done ? '✓ ' : i === current ? '→ ' : ''}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-3 border-t border-white/20 pt-5 text-sm lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <dt className="text-white/65">{label}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Hero({ label, value, unit, note }: { label: string; value: string; unit: string; note: string }) {
  return (
    <div>
      <p className="text-sm text-white/70">{label}</p>
      <p className="mt-2 break-words font-serif text-5xl font-semibold sm:text-6xl">
        {value} <span className="font-sans text-lg text-teal-bright">{unit}</span>
      </p>
      <p className="mt-4 max-w-md text-sm leading-7 text-white/75">{note}</p>
    </div>
  );
}

export function LoanPanel({ address, onState }: { address: string; onState: (state: LoanState) => void }) {
  const [now] = useState(() => Date.now());
  const loan = useLoan(address, onState);
  const state = loan.state;
  const stage = loan.newLoan && state ? 'bond_registered' : state?.stage;
  const t = loan.newLoan && state ? terms(state.bonds) : state?.terms;
  const offer = stage === 'bond_registered' || stage === 'escrow_created' || stage === 'collateral_locked';
  const active = stage === 'active';
  const pendingRelease = stage === 'repaid_release_pending';
  const closed = stage === 'closed';
  const depositStep = Math.max(loan.step, stage === 'collateral_locked' ? 2 : stage === 'escrow_created' ? 1 : -1);
  const daysLeft = t ? Math.max(0, Math.ceil((Date.parse(t.dueDate) - now) / 86400000)) : 0;

  const eyebrow = closed ? 'Préstamo completado' : pendingRelease ? 'Su reembolso' : active ? 'Su préstamo' : offer ? 'Su oferta' : 'Su próximo paso';
  const title = !state ? 'Consultando su progreso…' : closed ? 'Préstamo cerrado' : pendingRelease ? 'Pago recibido' : active ? 'Préstamo activo' : offer ? 'Reciba dólares por sus bonos' : 'Registre su bono';

  return (
    <>
      <VerificationStages verified pending={false} stage={stage} />
      <section className="on-dark mt-4 bg-ink p-6 text-white md:p-10" aria-labelledby="next-step-title" aria-busy={loan.busy}>
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-bright">{eyebrow}</p>
        <h2 id="next-step-title" className="mt-4 font-serif text-3xl font-semibold">{title}</h2>
        {loan.bond && typeof loan.bond.issuer === 'string' && stage !== 'none' && (
          <p className="mt-2 text-sm text-white/65">
            Bono de {loan.bond.issuer} · Serie {loan.bond.series}
          </p>
        )}
        {loan.error && (
          <p role="alert" className="mt-5 border-l-2 border-teal-bright pl-4 leading-7">
            {loan.error}
          </p>
        )}

        {!state && (
          <button type="button" disabled={loan.busy} onClick={loan.retry} className="btn-primary mt-6 disabled:opacity-60">
            {loan.busy ? 'Consultando…' : 'Volver a consultar'}
          </button>
        )}

        {stage === 'none' && <BondForm busy={loan.busy} register={loan.register} />}

        {offer && t && (
          <>
            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <Hero label="Recibe hoy" value={formatNumber(t.loan, 2)} unit="USDC" note="Sus bonos quedan en garantía, siguen siendo suyos y conservan su cupón." />
              <Facts
                rows={[
                  ['Garantía', `Bs ${formatNumber(t.nominalBs, 2)} · USD ${formatNumber(t.collateral, 2)}`],
                  ['Financiamiento', '50 % del valor de sus bonos'],
                  ['Tasa anual', `${formatNumber(EXAMPLE_ANNUAL_RATE * 100)} % fija`],
                  ['Plazo', '30 días'],
                  ['Costo del préstamo', usdc(t.interest)],
                  ['Total a devolver', usdc(t.total)],
                ]}
              />
            </div>
            <button type="button" disabled={loan.busy} onClick={() => void loan.proceed()} className="btn-primary mt-8 w-full disabled:opacity-60 sm:w-auto">
              {loan.busy
                ? `${DEPOSIT_STEPS[Math.max(0, loan.step)]}…`
                : loan.error
                  ? 'Reintentar y continuar'
                  : stage === 'collateral_locked'
                    ? 'Continuar con el desembolso'
                    : stage === 'escrow_created'
                      ? 'Continuar con el depósito'
                      : 'Aceptar y depositar garantía'}
              <span aria-hidden="true" className="btn-arrow">
                →
              </span>
            </button>
            {depositStep >= 0 && <Checklist steps={DEPOSIT_STEPS} current={depositStep} />}
          </>
        )}

        {active && t && (
          <>
            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <Hero label="Recibió" value={formatNumber(t.loan, 2)} unit="USDC" note="Ya están en su cuenta. Al devolver el préstamo, sus bonos vuelven a usted." />
              <Facts
                rows={[
                  ['Bonos en garantía', `USD ${formatNumber(t.collateral, 2)}`],
                  ['Total a devolver', usdc(t.total)],
                  ['Vence', `${day(t.dueDate)} · ${daysLeft} días`],
                ]}
              />
            </div>
            <button type="button" disabled={loan.busy} onClick={loan.repay} className="btn-primary mt-8 w-full disabled:opacity-60 sm:w-auto">
              {loan.busy ? `${REPAY_STEPS[Math.max(0, loan.repayStep)]}…` : loan.error ? 'Reintentar el reembolso' : `Devolver ${usdc(t.total)}`}
              <span aria-hidden="true" className="btn-arrow">
                →
              </span>
            </button>
            {loan.repayStep >= 0 && <Checklist steps={REPAY_STEPS} current={loan.repayStep} />}
          </>
        )}

        {(pendingRelease || closed) && state?.repayment && (
          <div role="status">
            <p className="mt-5 max-w-2xl text-lg leading-8">
              {closed
                ? `Devolvió ${usdc(state.repayment.amount)} y sus bonos por USD ${formatNumber(state.bonds, 2)} ya están de vuelta en su cuenta.`
                : `Recibimos su pago de ${usdc(state.repayment.amount)} el ${day(state.repayment.at)}. Estamos devolviendo sus bonos a su cuenta; mientras tanto siguen protegidos.`}
            </p>
            <Checklist steps={REPAY_STEPS} current={closed ? 3 : 3} done={closed} />
            {closed ? (
              <button type="button" onClick={loan.requestNew} disabled={loan.busy} className="btn-primary mt-8 w-full sm:w-auto">
                Solicitar un nuevo préstamo
              </button>
            ) : (
              <button type="button" onClick={loan.settle} disabled={loan.busy} className="mt-8 min-h-12 cursor-pointer border border-white/40 px-6 py-3 font-semibold disabled:cursor-wait disabled:opacity-60">
                {loan.busy ? 'Comprobando…' : 'Comprobar de nuevo'}
              </button>
            )}
          </div>
        )}

        {state && (
          <details className="mt-8 border-t border-white/20 pt-3 text-sm text-white/65">
            <summary className="min-h-11 cursor-pointer py-3">Ver detalle técnico</summary>
            <p className="leading-6">
              Red de pruebas de Stellar. Cada bono digital (VBOND) representa USD 1 de garantía. La garantía se guarda en un contrato de
              escrow de Trustless Work.
            </p>
            {active && <p className="mt-2 leading-6">En esta versión de prueba añadimos a su cuenta los dólares del interés para que pueda completar el reembolso.</p>}
            {loan.providerMessage && <p className="mt-2 break-words">Respuesta del proveedor de custodia: {loan.providerMessage}</p>}
            <ul className="mt-2">
              <li>
                <a className="inline-block py-2 underline" href={state.verification.receiptUrl} target="_blank" rel="noreferrer">
                  Constancia de empresa ↗
                </a>
              </li>
              {state.escrow && (
                <li>
                  <a className="inline-block py-2 underline" href={state.escrow.url} target="_blank" rel="noreferrer">
                    Contrato de garantía ↗
                  </a>
                </li>
              )}
              {state.transactions.map((tx) => (
                <li key={tx.hash}>
                  <a className="inline-block py-2 underline" href={tx.url} target="_blank" rel="noreferrer">
                    {tx.label} ↗
                  </a>
                </li>
              ))}
              {state.repayment && (
                <li>
                  <a className="inline-block py-2 underline" href={state.repayment.url} target="_blank" rel="noreferrer">
                    Reembolso ↗
                  </a>
                </li>
              )}
            </ul>
          </details>
        )}
      </section>
    </>
  );
}
