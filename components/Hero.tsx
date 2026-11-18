import type { CSSProperties } from "react";
import { SplitStage } from "./SplitStage";

/** Order in which each part of the diagram draws itself. */
const order = (d: number) => ({ "--d": d }) as CSSProperties;

/** Compact flow: bonds go into a safe, dollars come out. */
function FlowCard() {
  return (
    <figure className="border border-white/25 bg-ink p-4">
      <svg
        viewBox="0 0 480 170"
        role="img"
        aria-labelledby="hero-diagram-title"
        className="flow-draw h-auto w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title id="hero-diagram-title">
          Los RWA ingresan en custodia y se desembolsan dólares en USDC.
        </title>

        {/* Bonds: two stacked certificates */}
        <g style={order(0)}>
          <rect pathLength={1} x="56" y="28" width="64" height="84" rx="2" />
          <rect pathLength={1} x="40" y="44" width="64" height="84" rx="2" fill="var(--ink)" />
          <path pathLength={1} d="M52 64h40M52 76h40M52 88h24" />
          <rect pathLength={1} x="52" y="102" width="12" height="12" />
        </g>

        {/* Arrow: bonds go in */}
        <path pathLength={1} style={order(1)} d="M136 80h40M168 72l8 8-8 8" />

        {/* Safe */}
        <g style={order(2)}>
          <rect pathLength={1} x="184" y="20" width="112" height="112" rx="4" />
          <rect pathLength={1} x="194" y="30" width="92" height="92" rx="2" />
          <circle pathLength={1} cx="234" cy="76" r="18" />
          <circle pathLength={1} cx="234" cy="76" r="3" />
          <path pathLength={1} d="M234 58v6M234 88v6M216 76h6M246 76h6" />
          <path pathLength={1} d="M270 62v28" />
          <path pathLength={1} d="M200 132v8h16v-8M264 132v8h16v-8" />
        </g>

        {/* Arrow: dollars come out */}
        <path pathLength={1} style={order(3)} d="M304 80h40M336 72l8 8-8 8" />

        {/* Dollars: two stacked notes */}
        <g style={order(4)}>
          <rect pathLength={1} x="376" y="48" width="72" height="40" rx="2" />
          <rect pathLength={1} x="360" y="64" width="72" height="40" rx="2" fill="var(--ink)" />
        </g>
        <text
          x="396"
          y="92"
          textAnchor="middle"
          fontSize="22"
          fontWeight="600"
          fill="currentColor"
          stroke="none"
        >
          $
        </text>
      </svg>

      <figcaption className="mt-4 border-t border-white/25 pt-4 text-sm leading-6 text-white/80">
        <span className="font-semibold text-white">RWA, garantía, USDC.</span>{" "}
        Los activos permanecen en un escrow y continúan devengando intereses.
      </figcaption>
    </figure>
  );
}

export function Hero() {
  return (
    <section
      id="hero"
      className="on-dark hero-enter bg-ink text-white"
      aria-labelledby="hero-title"
    >
      <div className="guides mx-auto max-w-content px-6 md:px-10">
        <div className="hero-bar flex items-center justify-between border-b border-white/20 py-6">
          <span className="font-serif text-2xl font-semibold tracking-tight">Vault</span>
          <span className="text-sm text-white/70">Prototipo en testnet</span>
        </div>

        <div className="py-16 md:py-20 lg:py-24">
          <SplitStage
            as="h1"
            statue="hero"
            tone="dark"
            titleId="hero-title"
            title="Liquidez en dólares sobre sus RWA, sin vender la posición."
            titleClassName="display-1"
            caption={<FlowCard />}
          >
            <p className="mt-8 text-lg leading-8 text-white/80">
              Constituya sus RWA en garantía y disponga de USDC. Su empresa
              conserva la titularidad y el rendimiento de los activos durante
              la vigencia del préstamo.
            </p>
            <a href="/app" className="btn-primary mt-10">
              Ingresar a Vault
              <span aria-hidden="true" className="btn-arrow">
                →
              </span>
            </a>
          </SplitStage>
        </div>
      </div>
    </section>
  );
}
