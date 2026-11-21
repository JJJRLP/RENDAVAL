'use client';
import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/format';
import { terms, type LoanState } from '@/lib/loan/model';
import { amount, type CompanyLoan } from '@/lib/loan/client-state';
import { RISK_RULES } from '@/lib/loan/risk-copy';
import { useLoan } from './use-loan';
import { BondForm } from './bond-form';
import { VerificationStages } from './verification-stages';
import { LoanHealth } from './loan-health';
const money = (n: number) => `${formatNumber(n, 2)} USDC`;
const button = 'btn-primary min-h-11 disabled:opacity-50';
function Technical({ item }: { item: CompanyLoan }) {
  const contracts: Record<string, string> = { book: 'Libro de préstamos Rendaval', vault: 'Bóveda de garantía de este préstamo', delivery: 'Custodia auxiliar de entrega', escrow: 'Desembolso protegido por Trustless Work', rules: 'Reglas de recepción de RBOND' };
  const describe = (label: string) => {
    if (label.startsWith('approve-holder:')) return ['Preparación', 'El emisor autorizó a la empresa a recibir los bonos'];
    if (label.startsWith('series:')) return ['Preparación', 'Se registró la serie del bono'];
    if (label.startsWith('initial-price:')) return ['Preparación', 'Se publicó el precio inicial del bono'];
    if (label.startsWith('issue:')) return ['Preparación', 'Se emitieron los bonos de prueba'];
    if (label.startsWith('create:')) return ['Preparación', 'Se creó la bóveda de garantía'];
    if (label.startsWith('authorize:')) return ['Preparación', 'El emisor autorizó la bóveda para recibir bonos'];
    if (label.includes('deposit')) return ['Depósito y desembolso', 'La empresa depositó los bonos como garantía'];
    if (label === 'Firma empresa') return ['Depósito y desembolso', 'Firma confirmada de la empresa'];
    if (label.startsWith('tw-deploy:')) return ['Depósito y desembolso', 'Se creó el desembolso protegido'];
    if (label.startsWith('tw-fund:')) return ['Depósito y desembolso', 'El prestamista aportó los dólares de prueba'];
    if (label.startsWith('tw-change-milestone-status:')) return ['Depósito y desembolso', 'Se verificó la garantía del desembolso'];
    if (label.startsWith('tw-approve-milestone:')) return ['Depósito y desembolso', 'El prestamista aprobó el desembolso'];
    if (label.startsWith('tw-release-funds:')) return ['Depósito y desembolso', 'Los dólares quedaron listos en la bóveda'];
    if (label.includes('open')) return ['Depósito y desembolso', 'La empresa aceptó la deuda y recibió los dólares'];
    if (label.startsWith('price:')) return ['Seguimiento', 'Actualización del precio publicado'];
    if (label.startsWith('margin:')) return ['Seguimiento', 'Se registró un aviso de margen'];
    if (label.startsWith('topup:')) return ['Cierre o incumplimiento', 'Se adelantaron fondos de prueba para el pago'];
    if (label.startsWith('default:')) return ['Cierre o incumplimiento', 'Se declaró el incumplimiento'];
    if (label.startsWith('buyer-holder:') || label.startsWith('buyer-permit:')) return ['Cierre o incumplimiento', 'El comprador fue autorizado para recibir los bonos'];
    if (label.startsWith('liquidate:')) return ['Cierre o incumplimiento', 'La compra y la entrega de bonos se liquidaron juntas'];
    if (label.includes('repay')) return ['Cierre o incumplimiento', 'El pago liberó los bonos'];
    return ['Actividad', 'Operación confirmada en Stellar'];
  };
  const stages = ['Preparación', 'Depósito y desembolso', 'Seguimiento', 'Cierre o incumplimiento', 'Actividad'];
  const grouped = new Map(stages.map(stage => [stage, [] as { hash: string; url: string; label: string }[]]));
  for (const tx of item.transactions) {
    const [stage, label] = describe(tx.label);
    const entries = grouped.get(stage)!;
    if (tx.label.startsWith('price:')) {
      const existing = entries.find(entry => entry.label.startsWith('Actualizaciones del precio'));
      if (existing) { existing.label = `Actualizaciones del precio publicado (${Number(existing.label.match(/\((\d+)\)/)?.[1] ?? 1) + 1})`; existing.hash = tx.hash; existing.url = tx.url; continue; }
      entries.push({ ...tx, label: 'Actualizaciones del precio publicado (1)' });
    } else {
      const repeatable = label === 'Firma confirmada de la empresa' || label === 'El emisor autorizó la bóveda para recibir bonos';
      const existing = repeatable && entries.find(entry => entry.label.startsWith(label));
      if (existing) { existing.label = `${label} (${Number(existing.label.match(/\((\d+)\)/)?.[1] ?? 1) + 1})`; existing.hash = tx.hash; existing.url = tx.url; }
      else if (!entries.some(entry => entry.hash === tx.hash)) entries.push({ ...tx, label });
    }
  }
  const sequence: Record<string, number> = {
    'El emisor autorizó a la empresa a recibir los bonos': 1, 'Se registró la serie del bono': 2, 'Se publicó el precio inicial del bono': 3, 'Se emitieron los bonos de prueba': 4, 'Se creó la bóveda de garantía': 5,
    'La empresa depositó los bonos como garantía': 1, 'Firma confirmada de la empresa': 2, 'Se creó el desembolso protegido': 3, 'El prestamista aportó los dólares de prueba': 4, 'Se verificó la garantía del desembolso': 5, 'El prestamista aprobó el desembolso': 6, 'Los dólares quedaron listos en la bóveda': 7, 'La empresa aceptó la deuda y recibió los dólares': 8,
    'Actualización del precio publicado (1)': 1, 'Se registró un aviso de margen': 2,
    'Se adelantaron fondos de prueba para el pago': 1, 'El pago liberó los bonos': 2, 'Se declaró el incumplimiento': 3, 'El comprador fue autorizado para recibir los bonos': 4, 'La compra y la entrega de bonos se liquidaron juntas': 5,
  };
  const baseLabel = (label: string) => label.replace(/ \(\d+\)$/, '');
  for (const entries of grouped.values()) entries.sort((left, right) => (sequence[baseLabel(left.label)] ?? 99) - (sequence[baseLabel(right.label)] ?? 99));
  return <details className="mt-5 border-t border-line pt-2 text-sm"><summary className="cursor-pointer py-3">Detalle técnico · actividad en Stellar</summary><p className="max-w-2xl leading-6">Resumen verificable de la actividad de este préstamo. Los enlaces abren Stellar Expert; no son pasos que deba realizar.</p><div className="mt-3 grid gap-3">{stages.map(stage => {
    const entries = grouped.get(stage)!;
    return entries.length ? <section key={stage}><h4 className="font-semibold">{stage}</h4><ul className="mt-1">{entries.map(tx => <li key={tx.hash}><a className="inline-block max-w-full break-words py-2 underline" href={tx.url} target="_blank" rel="noreferrer">{tx.label} ↗</a></li>)}</ul></section> : null;
  })}</div><section className="mt-3 border-t border-line pt-3"><h4 className="font-semibold">Contratos relacionados</h4><ul className="mt-1">{Object.entries(item.links).map(([key, url]) => url && <li key={key}><a className="inline-block py-2 underline" href={url} target="_blank" rel="noreferrer">{contracts[key] ?? 'Contrato relacionado'} ↗</a></li>)}</ul></section></details>;
}
function dueSummary(value: string, now: number) {
  const due = new Date(value), days = Math.ceil((due.getTime() - now * 1000) / 86400000);
  const date = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(due);
  return days > 0 ? `Vence el ${date} · faltan ${days} ${days === 1 ? 'día' : 'días'}` : days === 0 ? `Vence hoy · ${date}` : `Venció el ${date}`;
}
function Offer({ principal, fee, debt }: { principal: number; fee: number; debt: number }) {
  return <div className="mt-5 grid gap-6 md:grid-cols-2"><div><p className="text-sm">Recibe en su cuenta</p><p className="mt-2 break-words font-serif text-4xl">{money(principal - fee)}</p><p className="mt-3 text-sm leading-6">La comisión se descuenta de los dólares, no de sus bonos. El plazo comienza con su segunda firma.</p></div><dl className="grid gap-3 text-sm">{[['Capital que debe', money(principal)], ['Comisión de desembolso · 0,3 %', money(fee)], ['Interés fijo · 8 % anual, 30/360', money(debt - principal)], ['Total a devolver en 30 días', money(debt)]].map(([k,v]) => <div key={k} className="flex flex-wrap justify-between gap-2 border-b border-line pb-2"><dt>{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl></div>;
}
export function LoanPanel({ address, onState }: { address: string; onState: (state: LoanState) => void }) {
  const loan = useLoan(address, onState), state = loan.state;
  const [showForm, setShowForm] = useState(false), [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(timer); }, []);
  const urgent = state?.allLoans.find(l => l.status === 'Defaulted');
  const preparation = state?.allLoans.find(l => l.status === 'Pending');
  const review = state?.bondRecords.some(b => b.status === 'under_review');
  const offer = state?.bondRecords.some(b => b.availability === 'available');
  const next = urgent ? 'Tiene un incumplimiento declarado. Consulte el tiempo disponible y pague para recuperar sus bonos antes de la venta.' : preparation ? 'Su préstamo está en preparación. Continúe con el paso pendiente; los pasos confirmados se conservan.' : review ? 'Su declaración está en revisión. En esta prueba puede simular la aprobación para continuar.' : offer ? 'Su bono está aprobado. Revise el neto que recibirá y el total a devolver antes de preparar el préstamo.' : state?.allLoans.some(l => ['Active','Margin'].includes(l.status)) ? 'Consulte la salud y el vencimiento de sus préstamos. Al pagar, libera todos sus bonos en la misma transacción.' : 'Consulte el resultado de sus préstamos y los saldos disponibles en su cuenta.';
  return <>
    <VerificationStages verified pending={false} stage={state?.setup?.stage ?? (state?.loans.length ? state.loans.at(-1)?.stage : 'none')} />
    <section className="on-dark mt-4 bg-ink p-6 text-white md:p-10" aria-busy={loan.busy}>
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-bright">Su próximo paso</p>
      <h2 className="mt-4 font-serif text-3xl font-semibold">{!state ? 'Consultando su progreso…' : !state.bondRecords.length ? 'Declare su bono' : 'Su financiamiento'}</h2>
      {!!state?.bondRecords.length && <><p className="mt-4 max-w-2xl leading-7">{next}</p><a href={urgent || preparation || !review && !offer ? '#loans-title' : '#bonds-title'} className="btn-primary mt-5 mr-5">{urgent ? 'Ver plazo y pago' : preparation ? 'Continuar preparación' : review ? 'Revisar declaración' : offer ? 'Revisar oferta' : 'Ver sus préstamos'}</a></>}
      {loan.message && <p role="status" className="mt-4 max-w-2xl text-sm leading-6">{loan.message}</p>}
      {loan.error && <p role="alert" className="mt-4 border-l-2 border-blue-bright pl-4 leading-7">{loan.error}</p>}
      {state && <>
        {state.limitReached ? <p className="mt-4 leading-7">Tiene tres préstamos abiertos. Cierre uno antes de iniciar otro.</p> : !state.bondRecords.length || showForm ? <BondForm country={state.verification.country} exampleIndex={state.bondRecords.length} busy={loan.busy} register={(b,h) => void loan.register(b,h).then(ok => { if (ok) setShowForm(false); })} /> : <button className="mt-3 mr-5 min-h-11 underline disabled:opacity-50" disabled={loan.busy} onClick={() => setShowForm(true)}>Declarar otro bono</button>}
        {amount(state.claimable) > 0 && <div className="mt-6 border-t border-line pt-5"><h3 className="font-serif text-2xl">Tiene {money(amount(state.claimable))} por cobrar</h3><p className="mt-2 leading-6">Es el saldo pendiente de su empresa en el libro, no de un préstamo individual. Confirme la firma para recibirlo.</p><button className={`${button} mt-4`} disabled={loan.busy} onClick={() => void loan.sign('claim')}>Firmar y cobrar saldo</button></div>}
        <button className="mt-6 min-h-11 underline disabled:opacity-50" disabled={loan.busy} onClick={() => void loan.retry()}>Consultar estado actualizado</button>
      </>}
    </section>
    {state && <section id="bonds-title" className="mt-8" aria-label="Sus bonos"><div className="divide-y divide-line border-line">{state.bondRecords.filter(b => ['under_review','available','reserved'].includes(b.availability)).map(b => {
      const t = terms(amount(b.face)), reserved = b.availability === 'reserved';
      if (reserved && state.allLoans.some(l => l.bondId === b.id)) return null;
      return <article key={b.id} className="border border-line bg-white p-6 md:p-8"><p className="text-xs uppercase tracking-widest text-blue">{b.status === 'under_review' ? 'En revisión' : reserved ? 'Preparación pendiente' : 'Bono aprobado · su oferta'}</p><h3 className="mt-3 break-words font-serif text-2xl">{b.bond.issuer}</h3><p className="mt-2 text-sm">Serie {b.bond.series} · Nominal USD {formatNumber(amount(b.face),2)}</p>{b.status === 'under_review' ? <><p className="mt-4 max-w-2xl leading-7">Declaración recibida. Falta revisar el certificado y autorizar a su empresa para recibir los bonos. En esta prueba usted simula esa aprobación; no hay revisión de un depositario real.</p><button className={`${button} mt-5`} disabled={loan.busy} onClick={() => void loan.action('approve',{bondId:b.id})}>Simular aprobación y emisión</button><p className="mt-3 text-sm">Si su cuenta aún no recibe bonos, habilítelos en «Su cuenta» y reintente.</p></> : <><Offer principal={t.loan} fee={t.custodyFee} debt={t.total} /><p className="mt-4 text-sm leading-6">Recupera todos sus bonos al pagar. El interés no disminuye por pago anticipado. A continuación prepara la garantía; luego firma el depósito y la recepción de dólares por separado.</p><button className={`${button} mt-5`} disabled={loan.busy || (state.limitReached && !reserved)} onClick={() => void loan.action('accept',{bondId:b.id})}>{reserved ? 'Reanudar preparación' : 'Preparar este préstamo'}</button>{b.priceAge !== null && b.priceAge > 86400 && <button className="ml-3 min-h-11 underline" disabled={loan.busy} onClick={() => void loan.action('price',{bondId:b.id,price:1})}>Simular renovación del precio</button>}</>}
      <details className="mt-4 text-sm"><summary className="cursor-pointer py-3">Detalle de la declaración</summary><p className="break-all">Huella SHA-256: {b.certificateHash}</p><p className="mt-2">El certificado no se envió ni se almacenó.</p>{b.transactions.map(tx => <a key={tx.hash} className="block py-2 underline" href={tx.url} target="_blank" rel="noreferrer">Aprobación y emisión en Stellar ↗</a>)}</details></article>;
    })}</div></section>}
    {!!state?.allLoans.length && <section className="mt-8" aria-labelledby="loans-title"><h2 id="loans-title" className="font-serif text-2xl">Sus préstamos</h2><div className="mt-4 divide-y divide-line border border-line bg-white">{state.allLoans.map(item => {
      const pending = item.status === 'Pending', active = ['Active','Margin'].includes(item.status), defaulted = item.status === 'Defaulted';
      const seconds = Math.max(0, Math.ceil((item.cureDeadline ?? 0) - now));
      const waiting = loan.waiting?.id === item.id ? loan.waiting : null;
      const wait = waiting ? Math.max(0,Math.ceil(waiting.until-now)) : 0;
      return <article key={item.id} className="min-w-0 p-6 md:p-8"><p className="text-xs uppercase tracking-widest text-blue">{pending ? 'Preparación · dos firmas' : defaulted ? 'Incumplimiento declarado' : item.status === 'Repaid' ? 'Pagado · garantía liberada' : item.status === 'Liquidated' ? 'Garantía vendida' : item.status === 'WrittenOff' ? 'Garantía entregada al prestamista' : item.status === 'Cancelled' ? 'Preparación cancelada' : 'Préstamo activo'}</p><h3 className="mt-3 break-words font-serif text-2xl">{item.bond?.issuer}</h3><p className="mt-2 text-sm">Serie {item.bond?.series}</p>
      {pending ? <><Offer principal={amount(item.amounts.principal)} fee={amount(item.amounts.fee)} debt={amount(item.amounts.debt)} /><ol className="mt-6 grid gap-3 text-sm sm:grid-cols-3"><li className="border-t border-line pt-3">1. Firma de depósito {item.stage === 'collateral_locked' ? '✓' : '· pendiente'}</li><li className="border-t border-line pt-3">2. Preparar los dólares {item.readyToOpen ? '✓' : '· pendiente'}</li><li className="border-t border-line pt-3">3. Firma de aceptación y recepción</li></ol><p className="mt-4 leading-7">{item.stage !== 'collateral_locked' ? 'Firme para depositar los bonos en la bóveda de este préstamo. Todavía no se genera deuda.' : item.readyToOpen ? 'Los dólares están preparados. Confirme la segunda firma para aceptar la deuda y recibir el neto en su cuenta.' : 'Garantía depositada. Prepare los dólares del prestamista; después firme para aceptar la deuda y recibir el neto. Repetir la preparación recupera los pasos ya confirmados.'}</p>{!item.priceFresh && <button className="mt-4 min-h-11 underline" disabled={loan.busy} onClick={() => void loan.action('price',{contractId:item.id,price:item.price})}>Simular renovación del precio vencido</button>}<details className="mt-3 text-sm"><summary className="cursor-pointer py-3">Recuperar preparación interrumpida</summary><p>Si la autorización de la garantía quedó incompleta, reanude este paso antes de depositar.</p><button className="min-h-11 underline" disabled={loan.busy} onClick={() => void loan.action('accept',{bondId:item.bondId})}>Reanudar autorización</button></details><div className="mt-5 flex flex-wrap gap-3">{item.stage !== 'collateral_locked' ? <button className={button} disabled={loan.busy} onClick={() => void loan.sign('deposit',item.id)}>Firmar depósito · primera firma</button> : <><button className={button} disabled={loan.busy || item.readyToOpen} onClick={() => void loan.action('fund',{contractId:item.id})}>{item.readyToOpen ? 'Dólares preparados ✓' : 'Preparar dólares de prueba'}</button><button className={button} disabled={loan.busy || !item.readyToOpen} onClick={() => void loan.sign('open',item.id)}>Aceptar y recibir · segunda firma</button></>}</div></> : item.status === 'Cancelled' ? <p className="mt-5">La preparación fue cancelada sin abrir una deuda. El reembolso del escrow se confirma por separado.</p> : <div className="mt-5 grid gap-4 sm:grid-cols-2"><p>Recibió <strong>{money(amount(item.amounts.net))}</strong></p><p>{item.status === 'Repaid' ? 'Pagó' : 'Deuda del préstamo'} <strong>{money(amount(item.amounts.debt))}</strong></p></div>}
      {(active || defaulted) && <><p className="mt-4 text-sm">{dueSummary(item.terms.dueDate, now)}.</p>{!defaulted && <LoanHealth debt={item.terms.total} collateral={item.collateralValue} health={item.health} />}<p className="mt-4 text-sm">Precio publicado: USD {formatNumber(item.price,2)} por bono · {item.priceFresh ? 'vigente' : 'vencido: renueve el precio antes de continuar'}.</p>{defaulted && <p className="mt-4 border-l-2 border-blue pl-4 leading-7">{seconds ? `La ventana de pago de esta simulación termina en ${seconds} segundos. Use «Firmar pago y recuperar bonos» antes de habilitar la venta.` : 'Terminó la ventana de pago de esta simulación. La compra ya puede ejecutarse; aún puede usar «Firmar pago y recuperar bonos» mientras no se haya vendido la garantía.'}</p>}<div className="mt-5 flex flex-wrap gap-3"><button className={button} disabled={loan.busy} onClick={() => void loan.sign('repay',item.id)}>Firmar pago y recuperar bonos</button>{active && (item.health.level === 'risk' || item.view?.overdue) && <button className={button} disabled={loan.busy} onClick={() => void loan.action('default',{contractId:item.id})}>Declarar incumplimiento</button>}{defaulted && <button className={button} disabled={loan.busy || seconds > 0} onClick={() => void loan.action('liquidate',{contractId:item.id})}>Simular compra autorizada</button>}</div><details className="mt-5 text-sm"><summary className="cursor-pointer py-3">Simulaciones · fondos y precio de prueba</summary><p className="leading-6">Para acortar la demostración, el precio cambia como máximo 25 % cada 30 segundos y la ventana de pago tras el incumplimiento dura 60 segundos. Cada paso publica un precio real en testnet. El prestamista puede adelantar una sola vez el interés y la comisión para probar el pago.</p><button className="my-3 min-h-11 underline" disabled={loan.busy} onClick={() => void loan.action('repay/topup',{contractId:item.id})}>Simular adelanto para pagar</button><div className="flex flex-wrap gap-2">{[1,.8,.65,.5].map(price => <button key={price} className="min-h-11 border border-line px-4 disabled:opacity-50" disabled={loan.busy || wait > 0} onClick={() => void loan.setPrice(item.id,price)}>Simular USD {formatNumber(price,2)}</button>)}</div>{waiting && <p className="mt-3">Objetivo USD {formatNumber(waiting.price,2)}. {wait ? `Próximo cambio en ${wait} segundos.` : 'Ya puede continuar hacia el precio solicitado.'}<button className="ml-2 min-h-11 underline" disabled={loan.busy || wait > 0} onClick={() => void loan.setPrice(item.id,waiting.price)}>Continuar cambio</button></p>}</details></>}
      {item.status === 'Repaid' && <p className="mt-5 leading-7">El pago y la liberación íntegra de sus bonos ocurrieron en la misma transacción. {amount(item.deliveryBalance) > 0 ? 'La entrega a su cuenta está pendiente; puede recogerlos abajo.' : 'Sus bonos están disponibles en su cuenta.'}</p>}
      {item.status === 'Liquidated' && item.view && <div className="mt-5 leading-7"><p>Compra y entrega de bonos confirmadas juntas. El prestamista cobró primero.</p><p>Compra: {money(amount(item.view.loan.proceeds))} · Excedente de su empresa: {money(amount(item.view.loan.surplus))} · Pérdida del prestamista: {money(amount(item.view.loan.loss))}.</p><p>El excedente se entrega a su cuenta; si quedó pendiente, aparece arriba como saldo por cobrar.</p></div>}
      {item.status === 'WrittenOff' && <p className="mt-5">Tras 180 días de incumplimiento, la garantía se entregó al prestamista. No hay excedente para la empresa.</p>}
      {amount(item.deliveryBalance) > 0 && <div className="mt-5"><p>Bonos pendientes en custodia auxiliar: {formatNumber(amount(item.deliveryBalance),2)}. Su cuenta debe estar habilitada y autorizada por el emisor.</p><button className={`${button} mt-3`} disabled={loan.busy} onClick={() => void loan.sign('collect',item.id)}>Firmar recogida de bonos</button></div>}
      <Technical item={item} /></article>;
    })}</div></section>}
    {!!state?.claimTransactions?.length && <details className="mt-6 text-sm"><summary className="min-h-11 cursor-pointer py-3">Detalle técnico · cobros de la empresa</summary>{state.claimTransactions.map(tx => <a key={tx.hash} className="block py-2 underline" href={tx.url} target="_blank" rel="noreferrer">Cobro confirmado en Stellar ↗</a>)}</details>}
    <details className="mt-6 border-t border-line pt-3 text-sm"><summary className="cursor-pointer py-3">Reglas de riesgo de esta prueba</summary><p className="max-w-3xl leading-7">{RISK_RULES}</p></details>
  </>;
}
