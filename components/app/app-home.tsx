"use client";

import { usePollar } from "@pollar/react";
import { useState } from "react";
import { Eyebrow } from "@/components/Eyebrow";
import { WalletPanel } from "./wallet-panel";

/** The same stages the landing explains, so the company recognises where it is. */
const STEPS = [
  { name: "Verificación", body: "Confirmamos la identidad legal de su empresa." },
  { name: "Garantía", body: "Deposita sus bonos en un escrow. Siguen siendo suyos." },
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

      {/* Phase 2 (Didit) enables this action; phase 3 adds the loan. */}
      <section className="on-dark mt-10 bg-ink p-8 text-white md:p-10" aria-labelledby="next-step-title">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-bright">Su próximo paso</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <h2 id="next-step-title" className="font-serif text-3xl font-semibold">
              Verifique su empresa
            </h2>
            <p className="mt-3 leading-7 text-white/75">
              Antes de habilitar un préstamo confirmamos la identidad legal de su empresa. Toma unos minutos.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="min-h-12 cursor-not-allowed border border-white/40 px-6 py-3 font-semibold text-white/70"
          >
            Disponible muy pronto
          </button>
        </div>
      </section>

      <ol className="mt-6 grid border border-line bg-white sm:grid-cols-2 lg:grid-cols-4" aria-label="Etapas del préstamo">
        {STEPS.map((step, index) => (
          <li
            key={step.name}
            aria-current={index === 0 ? "step" : undefined}
            className="border-t border-line p-6 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:even:border-l lg:border-l lg:border-t-0 lg:first:border-l-0"
          >
            <p className="flex items-center justify-between text-sm font-semibold">
              <span className={index === 0 ? "text-teal" : "text-ink/50"}>0{index + 1}</span>
              <span className={`text-xs uppercase tracking-widest ${index === 0 ? "text-teal" : "text-ink/50"}`}>
                {index === 0 ? "Siguiente" : "Después"}
              </span>
            </p>
            <h3 className={`mt-4 font-serif text-xl font-semibold ${index === 0 ? "" : "text-ink/60"}`}>{step.name}</h3>
            <p className="mt-2 text-sm leading-6 text-ink/70">{step.body}</p>
          </li>
        ))}
      </ol>

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
