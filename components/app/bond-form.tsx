'use client';
import { useState } from 'react';
import { BS_PER_USD, exampleBond, type Bond } from '@/lib/loan/model';
import { formatNumber } from '@/lib/format';
export function BondForm({ busy, register }: { busy: boolean; register: (bond: Bond) => void }) {
  const [minDate] = useState(() => new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10));
  const [bond, setBond] = useState(exampleBond);
  const input = 'mt-2 min-h-11 w-full border border-white/30 bg-white/10 px-3 py-2 text-white focus:outline-2 focus:outline-teal-bright';
  return <form className="mt-6" onSubmit={e => { e.preventDefault(); register(bond); }}>
    <p className="max-w-xl leading-7 text-white/75">Comience con este ejemplo ficticio o declare los datos de su bono corporativo en bolivianos.</p>
    <fieldset disabled={busy} className="mt-6 grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Datos del bono</legend>
      <label className="text-sm sm:col-span-2">Empresa emisora<input required maxLength={80} className={input} value={bond.issuer} onChange={e => setBond({ ...bond, issuer: e.target.value })} /></label>
      <label className="text-sm">Serie<input required maxLength={24} className={input} value={bond.series} onChange={e => setBond({ ...bond, series: e.target.value })} /></label>
      <label className="text-sm">Valor nominal (Bs)<input required type="number" min={696} max={6960} step="0.01" className={input} value={Number.isFinite(bond.nominalBs) ? bond.nominalBs : ''} onChange={e => setBond({ ...bond, nominalBs: e.target.valueAsNumber })} /></label>
      <label className="text-sm">Cupón anual (%)<input required type="number" min={0} max={30} step="0.01" className={input} value={Number.isFinite(bond.coupon) ? bond.coupon : ''} onChange={e => setBond({ ...bond, coupon: e.target.valueAsNumber })} /></label>
      <label className="text-sm">Fecha de vencimiento<input required type="date" min={minDate} className={input} value={bond.maturity} onChange={e => setBond({ ...bond, maturity: e.target.value })} /></label>
    </fieldset>
    <p className="mt-6 font-serif text-2xl" aria-live="polite">Bs {formatNumber(Number.isFinite(bond.nominalBs) ? bond.nominalBs : 0, 2)} <span className="text-white/50">≈</span> USD {formatNumber(Number.isFinite(bond.nominalBs) ? bond.nominalBs / BS_PER_USD : 0, 2)}</p>
    <p className="mt-2 text-xs leading-6 text-white/60">Tipo de cambio de referencia para esta prueba: Bs 6,96 por USD. Garantía entre USD 100 y USD 1.000; préstamo máximo de 500 USDC.</p>
    <button className="btn-primary mt-6 w-full disabled:opacity-60 sm:w-auto" disabled={busy}>{busy ? 'Registrando su bono…' : 'Registrar bono'}</button>
    <p className="mt-4 text-xs leading-6 text-white/50">El registro digital es simulado, sin custodio real. Los bonos y dólares de esta prueba no tienen valor real.</p>
  </form>;
}
