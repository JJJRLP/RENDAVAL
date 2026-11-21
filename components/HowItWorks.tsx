"use client";

import { useEffect, useRef, useState } from "react";
import { CountUp } from "./CountUp";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";
import {
  EXAMPLE_ANNUAL_RATE,
  EXAMPLE_LTV,
  formatNumber,
  maxLoan,
  oneMonthCost,
} from "@/lib/format";

const MAX_COLLATERAL_USD = 1_000_000_000;
const SLIDER_MIN = 10_000;
const SLIDER_MAX = 1_000_000;
const SLIDER_STEP = 10_000;
const LTV_PERCENT = EXAMPLE_LTV * 100;
const RATE_PERCENT = EXAMPLE_ANNUAL_RATE * 100;

type Parsed =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "valid"; value: number };

type Figures = { collateral: string; loan: string; cost: string } | null;

/** Accepts whole amounts: "100000", "100 000" or "100.000". */
function parseAmount(raw: string): Parsed {
  const text = raw.replace(/\s/g, "");
  if (text === "") return { kind: "empty" };

  const plain = /^\d+$/.test(text);
  const grouped = /^\d{1,3}(\.\d{3})+$/.test(text);
  if (!plain && !grouped) {
    return {
      kind: "invalid",
      message: "Ingrese un monto entero en USD, solo con cifras. Por ejemplo: 100.000.",
    };
  }

  const value = Number(text.replace(/\./g, ""));
  if (value <= 0) {
    return { kind: "invalid", message: "Ingrese un monto mayor que cero." };
  }
  if (value > MAX_COLLATERAL_USD) {
    return {
      kind: "invalid",
      message: `El simulador admite hasta ${formatNumber(MAX_COLLATERAL_USD)} USD.`,
    };
  }
  return { kind: "valid", value };
}

/** The five stages, written with the simulator's figures when there are any. */
function buildSteps(figures: Figures) {
  return [
    {
      name: "Registro",
      body: "Su empresa solicita acceso y completa el proceso de verificación.",
    },
    {
      name: "Garantía",
      body: figures
        ? `Constituye en garantía bonos por ${figures.collateral} USD en un escrow. Los bonos continúan devengando intereses.`
        : "Constituye sus bonos en garantía en un escrow. Los bonos continúan devengando intereses.",
    },
    {
      name: "Desembolso",
      body: figures
        ? `Recibe ${figures.loan} USDC, equivalentes al ${LTV_PERCENT} % del valor de la garantía.`
        : `Recibe en USDC el ${LTV_PERCENT} % del valor de la garantía.`,
    },
    {
      name: "Seguimiento",
      body: "Consulta en todo momento el valor de la garantía, el saldo y el interés devengado.",
    },
    {
      name: "Reembolso",
      body: figures
        ? `Reembolsa ${figures.loan} USDC más ${figures.cost} USDC de interés. La garantía se libera.`
        : "Reembolsa el capital más el interés. La garantía se libera.",
    },
  ];
}

const PARTIES = [
  { name: "Empresa", role: "Aporta la garantía" },
  { name: "Escrow", role: "Custodia los bonos" },
  { name: "Prestamista", role: "Aporta los USDC" },
];

/** Which party (0 to 2) holds each asset at each of the five stages. */
const BONDS_AT = [0, 1, 1, 1, 0];
const USDC_AT = [2, 2, 0, 0, 2];
const INTEREST_AT = [0, 0, 0, 0, 2];
const INTEREST_FROM = 3;

const columnCenter = (column: number) => `${((column * 2 + 1) / 6) * 100}%`;

/**
 * Who holds what, stage by stage: bonds move into the escrow, USDC reaches the
 * company, and at the end both go back with the interest.
 * Decorative: the list of stages next to it says the same in words.
 */
function FlowStage({ step, name, figures }: { step: number; name: string; figures: Figures }) {
  const inEscrow = BONDS_AT[step] === 1;

  return (
    <div aria-hidden="true" className="bg-ink text-white shadow-[0_24px_48px_-28px_rgb(11_13_18/0.7)]">
      <div className="grid grid-cols-3 border-b border-white/15 text-center">
        {PARTIES.map((party, index) => (
          <div
            key={party.name}
            className={`px-2 py-4 md:py-5 ${index === 1 ? "border-x border-white/15 bg-white/5" : ""}`}
          >
            <p className="font-serif text-base font-semibold md:text-xl">{party.name}</p>
            <p className="mt-1 text-xs leading-4 text-white/60">{party.role}</p>
          </div>
        ))}
      </div>

      <div className="flow-track">
        <div className="absolute inset-0 grid grid-cols-3">
          <div />
          <div className="border-x border-white/15 bg-white/5" />
          <div />
        </div>

        <div
          className="flow-chip bg-white text-ink"
          style={{ left: columnCenter(BONDS_AT[step]), top: "1rem" }}
        >
          <span className="block text-[10px] font-semibold tracking-widest uppercase opacity-70">
            {inEscrow ? "Bonos · en garantía" : "Bonos · USD"}
          </span>
          <span className="block text-sm font-semibold sm:text-base">
            {figures?.collateral ?? "—"}
          </span>
        </div>

        <div
          className="flow-chip bg-blue text-white"
          style={{ left: columnCenter(USDC_AT[step]), top: "5.25rem" }}
        >
          <span className="block text-[10px] font-semibold tracking-widest uppercase opacity-80">
            USDC
          </span>
          <span className="block text-sm font-semibold sm:text-base">
            {figures?.loan ?? "—"}
          </span>
        </div>

        <div
          className="flow-chip border border-blue-bright text-white"
          style={{
            left: columnCenter(INTEREST_AT[step]),
            top: "9.5rem",
            opacity: step >= INTEREST_FROM ? 1 : 0,
          }}
        >
          <span className="block text-[10px] font-semibold tracking-widest text-blue-bright uppercase">
            Interés · USDC
          </span>
          <span className="block text-sm font-semibold sm:text-base">
            {figures?.cost ?? "—"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/15 px-4 py-3 text-xs md:px-6">
        <span className="font-semibold tracking-widest text-white/60 uppercase">
          Etapa {step + 1} de 5
        </span>
        <span className="font-serif text-base font-semibold">{name}</span>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const [input, setInput] = useState("100.000");
  const [step, setStep] = useState(0);
  /** Stages advance on their own until the visitor picks one. */
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = flowRef.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.4,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const parsed = parseAmount(input);
  const loan = parsed.kind === "valid" ? maxLoan(parsed.value) : null;
  const cost = loan === null ? null : oneMonthCost(loan);
  const loanDecimals = loan !== null && loan % 1 !== 0 ? 2 : 0;
  const sliderValue =
    parsed.kind === "valid"
      ? Math.min(Math.max(parsed.value, SLIDER_MIN), SLIDER_MAX)
      : SLIDER_MIN;

  const figures: Figures =
    parsed.kind === "valid" && loan !== null && cost !== null
      ? {
          collateral: formatNumber(parsed.value),
          loan: formatNumber(loan, loanDecimals),
          cost: formatNumber(cost, 2),
        }
      : null;
  const steps = buildSteps(figures);

  const summary = figures
    ? `Préstamo máximo: ${figures.loan} USDC. Costo financiero estimado a un mes: ${figures.cost} USDC.`
    : "Sin resultado. Ingrese el valor de sus RWA.";

  return (
    <section className="bg-offwhite py-24 md:py-32" aria-labelledby="how-title">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Reveal>
          <Eyebrow index="02">Cómo funciona</Eyebrow>
          <h2 id="how-title" className="section-title mt-6 max-w-3xl">
            De la solicitud al reembolso, en cinco etapas.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/75">
            Indique el valor de su cartera y siga la operación etapa por etapa.
          </p>
        </Reveal>

        <Reveal className="mt-14">
          <div className="grid border border-line bg-white lg:grid-cols-[2fr_3fr]">
            <div className="p-6 md:p-8">
              <label htmlFor="collateral" className="block font-semibold">
                Valor de los RWA en garantía (USD)
              </label>
              <div className="mt-2 flex items-stretch">
                <input
                  id="collateral"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  aria-invalid={parsed.kind === "invalid"}
                  aria-describedby="collateral-help"
                  className={`min-h-12 w-full min-w-0 rounded-l-sm border bg-white px-4 py-2 text-lg ${
                    parsed.kind === "invalid" ? "border-2 border-ink" : "border-ink/50"
                  }`}
                />
                <span className="flex items-center rounded-r-sm border border-l-0 border-ink/50 bg-offwhite px-4 font-medium">
                  USD
                </span>
              </div>
              <input
                type="range"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                step={SLIDER_STEP}
                value={sliderValue}
                onChange={(event) => setInput(formatNumber(Number(event.target.value)))}
                aria-label="Valor de los RWA en garantía, en USD"
                aria-valuetext={`${formatNumber(sliderValue)} USD`}
                className="mt-4 block w-full cursor-pointer accent-blue"
              />
              <p id="collateral-help" className="mt-2 text-sm leading-6 text-ink/75">
                {parsed.kind === "invalid" ? (
                  <span className="font-semibold text-ink">{parsed.message}</span>
                ) : (
                  `Préstamo del ${LTV_PERCENT} % del valor, a una tasa del ${RATE_PERCENT} % anual, a un mes.`
                )}
              </p>
            </div>

            <div className="border-t border-line lg:border-t-0 lg:border-l">
              <dl className="grid gap-px bg-line sm:grid-cols-2">
                <div className="bg-white p-6 md:p-8">
                  <dt className="text-sm text-ink/70">Préstamo máximo</dt>
                  <dd className="mt-2 font-serif text-4xl font-semibold text-blue md:text-5xl">
                    {loan === null ? (
                      <span className="text-ink/60">—</span>
                    ) : (
                      <>
                        <CountUp value={loan} decimals={loanDecimals} />{" "}
                        <span className="font-sans text-base font-medium">USDC</span>
                      </>
                    )}
                  </dd>
                </div>
                <div className="bg-white p-6 md:p-8">
                  <dt className="text-sm text-ink/70">Costo financiero estimado a un mes</dt>
                  <dd className="mt-2 font-serif text-4xl font-semibold text-blue md:text-5xl">
                    {cost === null ? (
                      <span className="text-ink/60">—</span>
                    ) : (
                      <>
                        <CountUp value={cost} decimals={2} />{" "}
                        <span className="font-sans text-base font-medium">USDC</span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="border-t border-line px-6 py-4 text-sm text-ink/70 md:px-8">
                Cifras ilustrativas. No constituyen una oferta.
              </p>

              {/* Announced to screen readers instead of the animated figures. */}
              <p className="sr-only" role="status">
                {summary}
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal className="mt-16 lg:mt-20">
          <div ref={flowRef} className="grid items-start gap-8 lg:grid-cols-[5fr_7fr] lg:gap-14">
            <div className="sticky top-16 z-10 lg:top-24 lg:order-last">
              <FlowStage step={step} name={steps[step].name} figures={figures} />
            </div>

            <ol>
              {steps.map((item, index) => {
                const active = index === step;
                return (
                  <li key={item.name}>
                    <button
                      type="button"
                      aria-current={active ? "step" : undefined}
                      onClick={() => {
                        setAuto(false);
                        setStep(index);
                      }}
                      className={`relative grid w-full cursor-pointer grid-cols-[2.5rem_1fr] gap-x-4 border-l-2 px-5 py-5 text-left transition-colors duration-300 ${
                        active
                          ? "border-blue bg-white"
                          : "border-line hover:border-ink/40 hover:bg-white/60"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pt-1 text-sm font-semibold transition-colors duration-300 ${
                          active ? "text-blue" : "text-ink/50"
                        }`}
                      >
                        0{index + 1}
                      </span>
                      <span>
                        <span className="block font-serif text-xl font-semibold">
                          {item.name}
                        </span>
                        <span className="mt-1 block leading-7 text-ink/75">{item.body}</span>
                      </span>
                      {active && auto && inView && (
                        <span
                          key={index}
                          aria-hidden="true"
                          onAnimationEnd={() => setStep((index + 1) % steps.length)}
                          className="step-timer absolute right-0 bottom-0 left-0 h-0.5 bg-blue"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="mt-10 max-w-3xl border-t border-line pt-5 text-sm leading-6 text-ink/70">
            <span className="font-semibold text-ink">RWA</span> (real-world asset): activo del
            mundo real representado como token en una blockchain. En este diagrama,
            «bonos» designa los RWA constituidos en garantía, que son bonos tokenizados.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
