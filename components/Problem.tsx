import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";
import { SplitStage } from "./SplitStage";

const statements = [
  {
    title: "La tesorería requiere liquidez.",
    body: "Las obligaciones de pago no esperan al vencimiento del activo.",
  },
  {
    title: "La alternativa habitual es vender.",
    body: "Al precio que el mercado ofrezca en esa fecha.",
  },
  {
    title: "La venta interrumpe el rendimiento.",
    body: "El activo enajenado deja de devengar intereses.",
  },
];

export function Problem() {
  return (
    <section className="bg-white py-24 md:py-32" aria-labelledby="problem-title">
      <div className="mx-auto max-w-content px-6 md:px-10">
        <Reveal>
          <SplitStage
            as="h2"
            statue="problem"
            tone="light"
            split="50%"
            start="mouth"
            titleId="problem-title"
            title="Una cartera de RWA no equivale a liquidez disponible."
            titleClassName="display-2 mt-6"
            eyebrow={<Eyebrow index="01">El problema</Eyebrow>}
          />
        </Reveal>

        <Reveal variant="group">
          <ol className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8 lg:mt-24">
            {statements.map((statement, index) => (
              <li
                key={statement.title}
                className="reveal-step border-t border-ink pt-6"
                style={{ "--i": index } as React.CSSProperties}
              >
                <span
                  className="font-serif text-5xl leading-none font-semibold text-ink/20"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="mt-6 font-serif text-2xl leading-snug font-semibold">
                  {statement.title}
                </h3>
                <p className="mt-3 leading-7 text-ink/75">{statement.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
