"use client";

import { usePollar } from "@pollar/react";
import { useState } from "react";
import { Eyebrow } from "@/components/Eyebrow";
import { VerificationPanel } from "./verification-panel";
import { WalletPanel } from "./wallet-panel";

/** The same stages the landing explains, so the company recognises where it is. */
const STEPS = [
  { name: "Verificación", body: "Confirmamos la identidad legal de su empresa." },
  { name: "Garantía", body: "Sus bonos respaldan el préstamo y siguen siendo suyos." },
  { name: "Desembolso", body: "Recibe dólares digitales (USDC) en su cuenta." },
  { name: "Reembolso", body: "Devuelve el préstamo y recupera sus bonos." },
];

export function AppHome() {
  const { isAuthenticated, verified, wallet, openLoginModal, logout, configStatus, retryConfig } = usePollar();
  const [error, setError] = useState("");
  function action(callback: () => void) {
    setError("");
    try {
      callback();
    } catch {
      setError("No se pudo completar la acción. Intente nuevamente.");
    }
  }

  if (!isAuthenticated) {
    const loading = configStatus === "loading";
    const failed = configStatus === "error";
    return (
      <section className="mx-auto grid max-w-4xl border border-line bg-white md:grid-cols-5" aria-labelledby="sign-in-title">
        <div className="p-8 md:col-span-3 md:p-12">
          <Eyebrow index="01">Acceso</Eyebrow>
          <h1 id="sign-in-title" className="section-title mt-6">
            Financie su empresa con sus bonos.
          </h1>
          <p className="mt-6 text-lg leading-8 text-ink/70">
            Ingrese con su correo o su cuenta de Google. Creamos la cuenta de su empresa al instante, sin instalar
            nada.
          </p>
          <button
            type="button"
            className="btn-primary mt-8 disabled:cursor-wait disabled:opacity-50"
            disabled={loading}
            onClick={() => action(failed ? retryConfig : openLoginModal)}
          >
            {loading ? "Preparando el acceso…" : failed ? "Reintentar" : "Ingresar"}
            <span aria-hidden="true" className="btn-arrow">
              →
            </span>
          </button>
          {failed && (
            <p role="alert" className="mt-4 text-sm">
              No pudimos conectar con el servicio de acceso. Intente nuevamente.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm">
              {error}
            </p>
          )}
        </div>
        <ol className="on-dark bg-ink p-8 text-white md:col-span-2 md:p-10">
          {STEPS.map((step, index) => (
            <li key={step.name} className="flex gap-4 border-t border-white/20 py-4 first:border-t-0 first:pt-0 last:pb-0">
              <span className="text-sm font-semibold text-teal-bright">0{index + 1}</span>
              <span>
                <span className="block font-semibold">{step.name}</span>
                <span className="mt-1 block text-sm leading-6 text-white/75">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow index="01">Su empresa</Eyebrow>
          <h1 className="section-title mt-6">Su financiamiento, paso a paso.</h1>
        </div>
        <button
          type="button"
          className="min-h-11 cursor-pointer text-sm font-semibold underline underline-offset-4"
          onClick={() => action(logout)}
        >
          Cerrar sesión
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-4">
          {error}
        </p>
      )}

      {verified && wallet?.address && <VerificationPanel key={wallet.address} address={wallet.address} />}

      {!verified ? (
        <div role="status" className="mt-6 border border-line bg-white p-8">
          Verificando su sesión…
        </div>
      ) : wallet?.address ? (
        <WalletPanel key={wallet.address} address={wallet.address} />
      ) : (
        <div className="mt-6 border border-line bg-white p-8">
          <h2 className="font-serif text-2xl font-semibold">Su cuenta aún no está lista</h2>
          <p role="status" className="mt-3 leading-7 text-ink/70">
            Cierre sesión e ingrese nuevamente. Si el problema continúa, escriba al equipo de Vault.
          </p>
        </div>
      )}
    </>
  );
}
