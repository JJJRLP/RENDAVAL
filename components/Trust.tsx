import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";
import { SplitStage } from "./SplitStage";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6 shrink-0 text-teal-bright"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const points = [
  {
    title: "Garantía en escrow",
    body: "Ni Vault ni el prestamista pueden disponer de los RWA.",
    icon: (
      <Icon>
        <rect x="4" y="10" width="16" height="11" rx="1" />
        <path d="M8 10V7a4 4 0 018 0v3M12 14v3" />
      </Icon>
    ),
  },
  {
    title: "Emisores regulados",
    body: "Solo se admiten RWA de emisores sujetos a regulación.",
    icon: (
      <Icon>
        <path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18M3 18h18" />
      </Icon>
    ),
  },
  {
    title: "Empresas verificadas",
    body: "No se admiten cuentas anónimas ni personas naturales.",
    icon: (
      <Icon>
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
        <path d="M8.5 12l2.5 2.5 4.5-5" />
      </Icon>
    ),
  },
  {
    title: "Registro en Stellar",
    body: "Cada depósito, desembolso y pago es verificable.",
    icon: (
      <Icon>
        <circle cx="5" cy="12" r="2" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="19" cy="19" r="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M7 12h3M13.5 10.5l4-4M13.5 13.5l4 4" />
      </Icon>
    ),
  },
];

export function Trust() {
  return (
    <section
      className="on-dark bg-deep py-24 text-white md:py-32"
      aria-labelledby="trust-title"
    >
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Reveal>
          <SplitStage
            as="h2"
            statue="trust"
            tone="deep"
            split="50%"
            titleId="trust-title"
            title="Reglas claras antes que promesas."
            titleClassName="display-2 mt-6"
            eyebrow={
              <Eyebrow index="04" tone="dark">
                Garantías
              </Eyebrow>
            }
          />
        </Reveal>

        <Reveal variant="group">
          <ul className="mt-16 grid gap-x-8 gap-y-8 border-t border-white/20 pt-10 sm:grid-cols-2 lg:mt-24 lg:grid-cols-4">
            {points.map((point, index) => (
              <li
                key={point.title}
                className="reveal-step"
                style={{ "--i": index } as React.CSSProperties}
              >
                {point.icon}
                <h3 className="mt-4 font-serif text-xl leading-snug font-semibold">
                  {point.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/75">{point.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <p className="text-sm font-semibold text-white/70">Infraestructura</p>
            <ul className="flex flex-wrap gap-2 text-sm font-semibold">
              <li className="rounded-sm border border-white/30 px-4 py-2">Stellar</li>
              <li className="rounded-sm border border-purple bg-purple px-4 py-2">
                Trustless Work
              </li>
              <li className="rounded-sm border border-white/30 px-4 py-2">Pollar</li>
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
