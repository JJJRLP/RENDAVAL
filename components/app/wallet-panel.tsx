"use client";

import type { LoanState } from "@/lib/loan/model";
import { formatNumber } from "@/lib/format";
import { useState } from "react";
import { USDC, VBOND } from "@/lib/stellar/assets";
import { assetBalance, type Balance } from "@/lib/stellar/horizon";
import { useWallet } from "./use-wallet";

const amount = (balance: Balance | undefined) =>
  balance ? formatNumber(Number(balance.balance), 2) : "—";

/** Balances in business terms; chain details stay one click away. */
export function WalletPanel({ address, loan }: { address: string; loan: LoanState | null }) {
  const { balances, busy, progress, error, refresh } = useWallet(address, loan);
  const [copyStatus, setCopyStatus] = useState("");
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopyStatus("Copiada.");
    } catch {
      setCopyStatus("No se pudo copiar; selecciónela manualmente.");
    }
  }
  const tiles = [
    { label: "Dólares", unit: "USDC", balance: balances ? assetBalance(balances, USDC) : undefined },
    { label: "Bonos disponibles", unit: "USD", balance: balances ? assetBalance(balances, VBOND) : undefined },
  ];
  const native = balances?.find((item) => item.asset_type === "native");

  return (
    <section aria-labelledby="wallet-title" className="mt-6 border border-line bg-white p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="wallet-title" className="font-serif text-2xl font-semibold">
          Su cuenta
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className="min-h-11 cursor-pointer text-sm font-semibold text-teal underline underline-offset-4 disabled:cursor-wait disabled:opacity-50"
        >
          {busy ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      <div className={`mt-6 grid gap-4 ${loan && loan.locked > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`} aria-busy={busy}>
        {tiles.map((tile) => (
          <div key={tile.unit} className="min-w-0 border border-line bg-offwhite p-6">
            <p className="text-sm text-ink/70">{tile.label}</p>
            <p className="mt-3 break-words font-serif text-4xl font-semibold">
              {loan && busy ? formatNumber(tile.unit === "USDC" ? loan.usdc : loan.bonds, 2) : amount(tile.balance)} <span className="font-sans text-base font-semibold text-teal">{tile.unit}</span>
            </p>
          </div>
        ))}
        {loan && loan.locked > 0 && (
          <div className="min-w-0 border border-line bg-offwhite p-6">
            <p className="text-sm text-ink/70">Bonos en garantía</p>
            <p className="mt-3 break-words font-serif text-4xl font-semibold">
              {formatNumber(loan.locked, 2)} <span className="font-sans text-base font-semibold text-teal">USD</span>
            </p>
          </div>
        )}
      </div>


      {progress && (
        <p role="status" className="mt-5 text-sm text-ink/70">
          {progress}
        </p>
      )}
      {error && (
        <div className="mt-5 border-l-2 border-ink pl-4">
          <p role="alert" className="text-sm">
            {error}
          </p>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="mt-2 min-h-11 cursor-pointer text-sm font-semibold text-teal underline underline-offset-4 disabled:opacity-50"
          >
            Reintentar
          </button>
        </div>
      )}

      <details className="mt-6 border-t border-line pt-4 text-sm text-ink/70">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">Detalles técnicos de la cuenta</summary>
        <dl className="mt-2 grid gap-4">
          <div>
            <dt className="font-semibold text-ink">Dirección en Stellar (red de prueba)</dt>
            <dd className="mt-1 break-all font-mono select-all">{address}</dd>
            <dd className="mt-1 flex flex-wrap items-center gap-x-4">
              <button type="button" className="min-h-11 cursor-pointer text-teal underline underline-offset-4" onClick={() => void copyAddress()}>
                Copiar dirección
              </button>
              <a
                className="inline-flex min-h-11 items-center text-teal underline underline-offset-4"
                href={`https://stellar.expert/explorer/testnet/account/${address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver en el explorador<span className="sr-only"> (abre una pestaña nueva)</span>&nbsp;↗
              </a>
              <span role="status">{copyStatus}</span>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Saldo para comisiones de red</dt>
            <dd className="mt-1">{amount(native)} XLM</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-5">Esta es una versión de prueba: los saldos no tienen valor real.</p>
      </details>
    </section>
  );
}
