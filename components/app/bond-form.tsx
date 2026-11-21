'use client';
import { useState } from 'react';
import { bondUsd, examplesFor, type Bond } from '@/lib/loan/model';
import { countryFor, currencyFor, type CountryCode } from '@/lib/countries';
import { formatNumber } from '@/lib/format';
export function BondForm({ busy, register, exampleIndex = 0, country }: { country: CountryCode; exampleIndex?: number; busy: boolean; register: (bond: Bond, certificateHash: string) => void }) {
  const [certificate, setCertificate] = useState<File | null>(null);
  const [hashing, setHashing] = useState(false);
  const [error, setError] = useState('');
  const [minDate] = useState(() => new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10));
  const [bond, setBond] = useState(() => examplesFor(country)[exampleIndex % 3]);
  const local = countryFor(country)!;
  const currency = currencyFor(bond.currency)!;
  const input = 'mt-2 min-h-11 w-full border border-white/30 bg-white/10 px-3 py-2 text-white focus:outline-2 focus:outline-blue-bright';
  return <form className="mt-6" onSubmit={async e => { e.preventDefault(); if (!certificate) return; setHashing(true); setError(''); try { const digest = await crypto.subtle.digest('SHA-256', await certificate.arrayBuffer()); register(bond, Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')); } catch { setError('No pudimos leer el certificado. Seleccione el archivo de nuevo.'); } finally { setHashing(false); } }}>
    <p className="max-w-xl leading-7 text-white/75">Declare el bono que su empresa quiere dejar en garantía. Puede usar este ejemplo para probar.</p>
    <fieldset disabled={busy || hashing} className="mt-6 grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Datos del bono</legend>
      <label className="text-sm sm:col-span-2">Empresa emisora<input required maxLength={80} className={input} value={bond.issuer} onChange={e => setBond({ ...bond, issuer: e.target.value })} /></label>
      <label className="text-sm">Serie<input required maxLength={24} className={input} value={bond.series} onChange={e => setBond({ ...bond, series: e.target.value })} /></label>
      <label className="text-sm">Moneda<select className={input.replace('bg-white/10', 'bg-ink')} value={bond.currency} onChange={e => { const next = currencyFor(e.target.value)!; setBond({ ...bond, currency: next.currency, nominal: Number((bondUsd(bond) * next.perUsd).toFixed(2)) }); }}>
        <option className="bg-ink" value={local.currency}>{local.currency} · {local.name === 'Otro país' ? 'Dólares' : local.name}</option>
        {local.currency !== 'USD' && <option className="bg-ink" value="USD">USD · Dólares</option>}
      </select></label>
      <label className="text-sm">Valor nominal ({currency.symbol} · {currency.currency})<input required type="number" min={100 * currency.perUsd} max={400 * currency.perUsd} step="0.01" className={input} value={Number.isFinite(bond.nominal) ? bond.nominal : ''} onChange={e => setBond({ ...bond, nominal: e.target.valueAsNumber })} /></label>
      <label className="text-sm">Cupón anual (%)<input required type="number" min={0} max={30} step="0.01" className={input} value={Number.isFinite(bond.coupon) ? bond.coupon : ''} onChange={e => setBond({ ...bond, coupon: e.target.valueAsNumber })} /></label>
      <label className="text-sm">Fecha de vencimiento<input required type="date" min={minDate} className={input} value={bond.maturity} onChange={e => setBond({ ...bond, maturity: e.target.value })} /></label>
      <label className="min-w-0 text-sm sm:col-span-2">Certificado de bloqueo del depositario<input required type="file" className={`${input} min-w-0`} onChange={e => setCertificate(e.target.files?.[0] ?? null)} /><span className="mt-2 block leading-6 text-white/70">El archivo permanece en su navegador. Solo se registra su huella digital en Stellar. Use un documento ficticio para esta simulación; los datos declarados son públicos.</span></label>
    </fieldset>
    {error && <p role="alert" className="mt-4">{error}</p>}
    <p className="mt-6 font-serif text-2xl" aria-live="polite">{currency.symbol} {formatNumber(Number.isFinite(bond.nominal) ? bond.nominal : 0, 2)} {currency.currency} <span className="text-white/50">≈</span> USD {formatNumber(Number.isFinite(bond.nominal) ? bondUsd(bond) : 0, 2)}</p>
    <p className="mt-2 text-xs leading-6 text-white/60">Garantía de {currency.symbol} {formatNumber(100 * currency.perUsd, 2)} a {currency.symbol} {formatNumber(400 * currency.perUsd, 2)} {currency.currency} (USD 100–400).</p>
    {currency.currency !== 'USD' && <p className="mt-2 text-xs leading-6 text-white/60">Tipo de cambio de referencia de demostración: {formatNumber(currency.perUsd, 2)} {currency.currency} por USD. No es una cotización en tiempo real.</p>}
    <button className="btn-primary mt-6 w-full disabled:opacity-60 sm:w-auto" disabled={busy || hashing}>{hashing ? 'Calculando la huella…' : busy ? 'Registrando su bono…' : 'Enviar a revisión'}</button>
  </form>;
}
