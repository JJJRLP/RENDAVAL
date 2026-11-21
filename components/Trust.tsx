import Image from "next/image";
import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";
import { SplitStage } from "./SplitStage";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6 shrink-0 text-blue-bright"
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

/** Infrastructure behind each step. Logos belong to their owners. */
const PARTNERS = [
  { name: "Stellar", role: "Red de los bonos y los dólares", href: "https://stellar.org", logo: "/logos/stellar.svg", width: 24, height: 24, wordmark: "Stellar" },
  { name: "Trustless Work", role: "Escrow de la garantía", href: "https://www.trustlesswork.com", logo: "/logos/trustless-work.png", width: 495, height: 434, wordmark: "Trustless Work" },
  { name: "Pollar", role: "Acceso, cuenta y firma", href: "https://pollar.xyz", logo: "/logos/pollar.png", width: 1200, height: 245 },
  { name: "Didit", role: "Verificación de empresas", href: "https://didit.me", logo: "/logos/didit.png", width: 400, height: 145 },
];

const points = [
  {
    title: "Garantía en escrow",
    body: "Ni Rendaval ni el prestamista pueden disponer de los RWA.",
    icon: (
      <Icon>
        <rect x="4" y="10" width="16" height="11" rx="1" />
        <path d="M8 10V7a4 4 0 018 0v3M12 14v3" />
      </Icon>
    ),
  },
  {
    title: "Acceso con permisos",
    body: "El emisor del RWA autoriza al contrato y a cada billetera que opera.",
    icon: (
      <Icon>
        <path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18M3 18h18" />
      </Icon>
    ),
  },
  {
    title: "Empresas verificadas",
    body: "Cada empresa pasa una verificación KYB. No se admiten cuentas anónimas ni personas naturales.",
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

          <div className="mt-12 bg-white p-6 text-ink md:p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink/60">Construido sobre</p>
            <ul className="mt-5 grid grid-cols-2 items-center gap-x-8 gap-y-6 md:grid-cols-4">
              {PARTNERS.map((partner) => (
                <li key={partner.name} className="min-w-0">
                  <a href={partner.href} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2" aria-label={`${partner.name}: ${partner.role} (abre una pestaña nueva)`}>
                    <Image src={partner.logo} alt="" width={partner.width} height={partner.height} unoptimized className="h-6 w-auto shrink-0 sm:h-8" />
                    {partner.wordmark && <span className="text-base leading-tight font-semibold tracking-tight sm:text-xl sm:whitespace-nowrap">{partner.wordmark}</span>}
                  </a>
                  <p className="mt-2 text-xs leading-5 text-ink/65">{partner.role}</p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
