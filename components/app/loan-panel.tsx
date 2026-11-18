'use client';
import { useState, type ReactNode } from 'react';
import { EXAMPLE_ANNUAL_RATE, formatNumber } from '@/lib/format';
import { LIMIT_MESSAGE, type LoanState } from '@/lib/loan/model';
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
  const [showForm, setShowForm] = useState(false);
  const stage = state?.setup?.stage ?? 'none';
  const t = state?.setup?.terms;
  const offer = stage === 'bond_registered' || stage === 'escrow_created' || stage === 'collateral_locked';
  const depositStep = Math.max(loan.step, stage === 'collateral_locked' ? 2 : stage === 'escrow_created' ? 1 : -1);
  const idle = !!state && !state.setup && state.loans.length > 0;
  const eyebrow = offer ? 'Su oferta' : idle ? (state.limitReached ? 'Sus préstamos' : 'Nuevo préstamo') : 'Su próximo paso';
  const title = !state ? 'Consultando su progreso…' : offer ? 'Reciba dólares por sus bonos' : state.limitReached ? 'Sus préstamos en curso' : state.loans.length ? 'Registre otro bono' : 'Registre su bono';
  const nearest = state?.loans.filter(l => l.stage === 'active').sort((a, b) => a.terms.dueDate.localeCompare(b.terms.dueDate))[0]?.escrow?.contractId;

  return (
    <>
      {/* The bar describes the set-up in progress; each finished set-up shows its own status in the list. */}
      {!idle && <VerificationStages verified pending={false} stage={state?.setup?.stage} />}
      <section className={`on-dark ${idle ? "mt-10" : "mt-4"} bg-ink p-6 text-white md:p-10`} aria-labelledby="next-step-title" aria-busy={loan.busy}>
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-bright">{eyebrow}</p>
        <h2 id="next-step-title" className="mt-4 font-serif text-3xl font-semibold">{title}</h2>
        {loan.bond && typeof loan.bond.issuer === 'string' && stage !== 'none' && (
          <p className="mt-2 text-sm text-white/65">
            Bono de {loan.bond.issuer} · Serie {loan.bond.series}
          </p>
        )}
        {loan.error && !loan.operationId && (
          <p role="alert" className="mt-5 border-l-2 border-teal-bright pl-4 leading-7">
            {loan.error}
          </p>
        )}

        {!state && (
          <button type="button" disabled={loan.busy} onClick={loan.retry} className="btn-primary mt-6 disabled:opacity-60">
            {loan.busy ? 'Consultando…' : 'Volver a consultar'}
          </button>
        )}

        {state && !state.setup && (state.limitReached ? <p className="mt-5 max-w-xl leading-7 text-white/75">{LIMIT_MESSAGE} <a className="underline" href="#loans-title">Ver sus préstamos</a></p> : state.loans.length && !showForm ? <>
          <p className="mt-5 max-w-xl leading-7 text-white/75">Obtenga dólares con otro bono mientras sus préstamos siguen su curso.</p>
          <button disabled={loan.busy} className="btn-primary mt-6 disabled:opacity-60" onClick={() => setShowForm(true)}>Registrar otro bono</button>
        </> : <BondForm key={state.loans.length} exampleIndex={state.loans.length} busy={loan.busy} register={bond => { void loan.register(bond).then(success => { if (success) setShowForm(false); }); }} />)}

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

        {state?.setup && (
          <details className="mt-8 border-t border-white/20 pt-3 text-sm text-white/65">
            <summary className="min-h-11 cursor-pointer py-3">Ver detalle técnico</summary>
            <p className="leading-6">
              Red de pruebas de Stellar. Cada bono digital (VBOND) representa USD 1 de garantía. La garantía se guarda en un contrato de
              escrow de Trustless Work.
            </p>
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
      {!!state?.loans.length && <section className="mt-8" aria-labelledby="loans-title">
        <h2 id="loans-title" className="font-serif text-2xl font-semibold">Sus préstamos</h2>
        <div className="mt-4 divide-y divide-line border border-line bg-white">
          {state.loans.map(item => {
            const id = item.escrow!.contractId, running = loan.operationId === id;
            const active = item.stage === 'active', closed = item.stage === 'closed';
            const days = Math.ceil((Date.parse(item.terms.dueDate) - now) / 86400000);
            return <article key={id} className="min-w-0 p-6 md:p-8" aria-busy={running && loan.busy}>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_17rem] lg:items-center">
                <div className="min-w-0"><h3 className="break-words font-serif text-xl font-semibold">{item.bond?.issuer ?? 'Bono registrado'}</h3><p className="mt-1 text-sm text-ink/65">Serie {item.bond?.series ?? 'histórica'}</p><p className="mt-3 text-sm text-teal"><span aria-hidden="true">{closed ? '✓' : active ? '●' : '◷'} </span>{closed ? 'Cerrado' : active ? 'Activo' : 'Pago recibido · bonos en devolución'}</p></div>
                <div className="text-sm"><p className="text-ink/65">Recibió</p><p className="font-serif text-2xl">{usdc(item.terms.loan)}</p></div>
                <div className="text-sm">
                  {active ? <><p className="text-ink/65">Devuelve {usdc(item.terms.total)}</p><p className="font-semibold">{days >= 0 ? `Vence el ${day(item.terms.dueDate)} · ${days} días` : `Venció el ${day(item.terms.dueDate)}`}</p></>
                    : <><p className="text-ink/65">Devolvió {usdc(item.repayment?.amount ?? item.terms.total)}</p>{item.repayment && <p className="font-semibold">Pagado el {day(item.repayment.at)}</p>}</>}
                </div>
                <div>{!closed && <button disabled={loan.busy} onClick={() => active ? void loan.repay(id) : void loan.settle(id)} className={`${active && nearest === id ? 'btn-primary' : 'min-h-12 cursor-pointer border border-line px-5 py-3 text-sm font-semibold'} w-full disabled:opacity-60`}>{running && loan.busy ? 'Comprobando…' : active ? `Devolver ${usdc(item.terms.total)}` : 'Comprobar devolución'}</button>}</div>
              </div>
              {running && loan.repayStep >= 0 && <div className="on-dark mt-5 bg-ink p-4 text-white"><Checklist steps={REPAY_STEPS} current={loan.repayStep} done={closed} /></div>}
              {running && loan.error && <p role="alert" className="mt-4 border-l-2 border-teal pl-4">{loan.error} Use el botón del préstamo para reintentar.</p>}
              <details className="mt-4 border-t border-line pt-2 text-sm text-ink/65"><summary className="min-h-11 cursor-pointer py-3">Ver detalle técnico</summary><ul><li><a className="inline-block py-2 underline" href={item.escrow!.url} target="_blank" rel="noreferrer">Contrato de garantía ↗</a></li>{[...item.transactions, ...(item.repayment ? [{ ...item.repayment, label: 'Reembolso' }] : [])].map(tx => <li key={tx.hash}><a className="inline-block py-2 underline" href={tx.url} target="_blank" rel="noreferrer">{tx.label} ↗</a></li>)}</ul>{running && loan.providerMessage && <p className="break-words">{loan.providerMessage}</p>}</details>
            </article>;
          })}
        </div>
      </section>}
    </>
  );
}
