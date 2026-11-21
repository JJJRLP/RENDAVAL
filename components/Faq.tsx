"use client";

import { useState } from "react";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

const items = [
  {
    question: "¿En qué países opera?",
    answer: [
      "Rendaval está diseñado para empresas de cualquier país. Bolivia es nuestro primer mercado y aparece preseleccionada al comenzar.",
      "Seleccione el país de su empresa al verificarla y declare su bono en moneda local o en USD. Si su país no figura en la lista, elija «Otro país» para usar USD. Esta versión utiliza fondos de prueba y tipos de cambio de demostración; la verificación documental depende de la cobertura del proveedor.",
    ],
  },
  {
    question: "¿Qué es un RWA?",
    answer: [
      "RWA (real-world asset, activo del mundo real): un activo tradicional, como un bono, un crédito o un inmueble, representado como token en una blockchain.",
      "El token acredita derechos sobre el activo subyacente y puede transferirse o inmovilizarse mediante contratos inteligentes.",
    ],
  },
  {
    question: "¿Qué RWA se admiten?",
    answer: [
      "Bonos tokenizados: instrumentos de deuda de emisores regulados, emitidos como tokens en la red Stellar. Mantienen su rendimiento mientras permanecen en el escrow. En el diagrama de etapas se denominan simplemente «bonos».",
      "La lista de activos admitidos se confirma con cada empresa durante el registro.",
      "El prototipo actual opera únicamente con activos de prueba en testnet, sin valor real. No deposite activos reales.",
    ],
  },
  {
    question: "¿Qué ocurre en caso de incumplimiento?",
    answer: [
      "Hay incumplimiento si el préstamo y el interés no se reembolsan en la fecha acordada, o si la deuda supera el 85 % del valor de la garantía y la empresa no la repone. Antes de ese límite, desde el 70 %, se le pide añadir garantía o reducir el saldo.",
      "En ese caso la garantía se ejecuta de una sola forma: los RWA se transfieren a un comprador autorizado por el emisor, que paga en USDC. El prestamista puede ser ese comprador si el emisor lo autoriza. Con ese pago se cubren el capital y el interés del prestamista, y el remanente se devuelve a la empresa. Es posible perder una parte o la totalidad de los activos depositados.",
      "Si la venta no alcanza para cubrir la deuda, la diferencia es una pérdida del prestamista: hoy no existe una póliza de seguro que cubra estos préstamos.",
      "En el prototipo este proceso todavía no es automático: el préstamo se congela y lo revisa el equipo de Rendaval. La actualización del precio por oráculo, los avisos de margen y la venta al comprador autorizado están diseñados, no implementados. Los porcentajes son de ejemplo.",
    ],
  },
  {
    question: "¿Cuál es el costo?",
    answer: [
      "El interés se calcula sobre el monto desembolsado y por el plazo efectivo de uso.",
      "Las condiciones de cada préstamo se comunican por escrito antes de la constitución de la garantía.",
    ],
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-offwhite py-24 md:py-32" aria-labelledby="faq-title">
      <Reveal className="mx-auto grid max-w-content gap-12 px-6 md:px-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <div>
          <Eyebrow index="05">Preguntas frecuentes</Eyebrow>
          <h2 id="faq-title" className="section-title mt-6">
            Aspectos a considerar antes de solicitar acceso.
          </h2>
        </div>

        <div className="border-t border-ink">
          {items.map((item, index) => {
            const isOpen = openIndex === index;
            const buttonId = `faq-button-${index}`;
            const panelId = `faq-panel-${index}`;
            return (
              <div key={item.question} className="border-b border-line">
                <h3>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="group flex w-full cursor-pointer items-center justify-between gap-6 py-6 text-left font-serif text-xl font-semibold"
                  >
                    <span className="underline-offset-4 group-hover:underline">
                      {item.question}
                    </span>
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ease-out ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6l5 5 5-5" />
                    </svg>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  inert={!isOpen}
                  className={`faq-panel ${isOpen ? "is-open" : ""}`}
                >
                  <div>
                    <div className="grid max-w-2xl gap-4 pb-8 leading-7 text-ink/80">
                      {item.answer.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
