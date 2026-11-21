import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

const cards = [
  {
    label: "Empresas",
    title: "Empresas que requieren liquidez",
    body: "Su tesorería mantiene RWA y necesita dólares a corto plazo.",
    points: [
      "Obtiene USDC sin vender sus RWA.",
      "Los bonos quedan separados en una bóveda propia del préstamo.",
      "Al pagar capital e interés, libera todos sus bonos en la misma transacción.",
    ],
    risk: "En caso de incumplimiento, la garantía se vende a un comprador autorizado por el emisor para cubrir la deuda; el remanente se le devuelve. Puede perder toda la garantía; consulte las reglas y límites en las preguntas frecuentes.",
    dark: true,
  },
  {
    label: "Prestamistas",
    title: "Prestamistas que buscan rendimiento en dólares",
    body: "Aportan USDC y perciben el interés que pagan las empresas.",
    points: [
      "Cada préstamo está respaldado por RWA inmovilizados en una bóveda por préstamo.",
      "El préstamo no supera una fracción del valor de la garantía: 50 % del nominal en esta prueba.",
      "Solo se presta a empresas verificadas.",
    ],
    risk: "El rendimiento no está garantizado. Si la venta de la garantía no cubre la deuda, la diferencia es una pérdida del prestamista; no hay póliza de seguro.",
    dark: false,
  },
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="mt-1.5 h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
  );
}

export function Audience() {
  return (
    <section className="bg-white py-24 md:py-32" aria-labelledby="audience-title">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Reveal>
          <Eyebrow index="03">Participantes</Eyebrow>
          <h2 id="audience-title" className="section-title mt-6 max-w-3xl">
            Dos partes, un mismo contrato.
          </h2>
        </Reveal>

        <Reveal variant="group">
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {cards.map((card, index) => (
              <article
                key={card.label}
                className={`reveal-step card flex flex-col p-8 md:p-10 ${
                  card.dark ? "on-dark border-ink bg-ink text-white" : "bg-offwhite"
                }`}
                style={{ "--i": index } as React.CSSProperties}
              >
                <p
                  className={`text-xs font-semibold tracking-[0.16em] uppercase ${
                    card.dark ? "text-blue-bright" : "text-blue"
                  }`}
                >
                  {card.label}
                </p>
                <h3 className="mt-4 font-serif text-2xl leading-snug font-semibold md:text-3xl">
                  {card.title}
                </h3>
                <p className={`mt-4 leading-7 ${card.dark ? "text-white/75" : "text-ink/75"}`}>
                  {card.body}
                </p>
                <ul className="mt-8 mb-8 grid gap-4">
                  {card.points.map((point) => (
                    <li key={point} className="flex gap-4 leading-7">
                      <CheckIcon />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <p
                  className={`mt-auto border-t pt-6 text-sm leading-6 ${
                    card.dark ? "border-white/20 text-white/75" : "border-line text-ink/75"
                  }`}
                >
                  <span className={`font-semibold ${card.dark ? "text-white" : "text-ink"}`}>
                    Riesgo:{" "}
                  </span>
                  {card.risk}
                </p>
              </article>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
