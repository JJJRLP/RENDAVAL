"use client";

import { RISK_RULES, DEMO_NOTICE, KNOWN_LIMITS } from "@/lib/loan/risk-copy";
import { useState } from "react";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

const items = [
  {
    question: "¿En qué países opera?",
    answer: [
      "Rendaval está diseñado para empresas de cualquier país. México es nuestro primer mercado, seguido de Brasil, y aparece preseleccionado al comenzar.",
      "Seleccione el país de su empresa al verificarla y declare su bono en moneda local o en USD. Si su país no figura en la lista, elija «Otro país» para usar USD. Esta versión utiliza fondos de prueba y tipos de cambio de demostración; la verificación documental depende de la cobertura del proveedor.",
    ],
  },
  {
    question: "¿Qué es un RWA?",
    answer: [
      "RWA (real-world asset, activo del mundo real): un activo tradicional, como un bono, un crédito o un inmueble, representado como token en una blockchain.",
      "En un producto con custodia real, el token representa derechos sobre el activo subyacente y puede transferirse o inmovilizarse mediante contratos inteligentes.",
    ],
  },
  {
    question: "¿Qué RWA se admiten?",
    answer: [
      "Bonos tokenizados: instrumentos de deuda de emisores regulados, emitidos como tokens en la red Stellar. Solo pueden recibirlos tenedores autorizados por el emisor. Se depositan en una bóveda propia de cada préstamo. En el diagrama de etapas se denominan simplemente «bonos».",
      "La lista de activos admitidos se confirma con cada empresa durante el registro.",
      "El prototipo actual opera únicamente con activos de prueba en testnet, sin valor real. No deposite activos reales.",
    ],
  },
  { question: "¿Cuáles son las reglas de riesgo?", answer: [RISK_RULES] },
  { question: "¿Qué ocurre en caso de incumplimiento?", answer: ["La venta está implementada en Stellar. Después de la ventana de pago, la aplicación permite simular la compra autorizada. Si no se puede entregar el bono, tampoco se cobra al comprador. Usted puede perder la garantía; el precio publicado no garantiza liquidez.", KNOWN_LIMITS] },
  { question: "¿Cuál es el costo?", answer: ["El capital equivale al 50 % del nominal de los bonos. Recibe ese importe menos la comisión de desembolso de 0,3 % de Trustless Work. Debe el capital bruto más un interés fijo de 8 % anual aplicado a 30/360, redondeado hacia arriba. Pagar antes no reduce ese interés; pagar tarde no lo aumenta.", "Por 100,00 USD de garantía: capital 50,00 USDC, comisión 0,15 USDC, neto recibido 49,85 USDC y total a devolver 50,33 USDC. La operación usa siete decimales; la pantalla muestra dos."] },
  { question: "¿Cómo conserva la empresa el rendimiento?", answer: ["Depende de cómo paga el bono. En los bonos de acumulación, como los CETES y TESOURO tokenizados de Etherfuse, el rendimiento se suma al valor del token: sigue creciendo dentro de la bóveda y la empresa lo recupera completo al pagar, porque recibe todos sus bonos. Un precio mayor también mejora la salud del préstamo.", "Los bonos que pagan cupones necesitarían reenviar cada cupón a la empresa mientras dura el préstamo; esta versión no lo hace. El bono de prueba RBOND no paga cupón ni acumula rendimiento. El piloto con CETES es un plan: Rendaval no tiene un acuerdo con Etherfuse."] },
  { question: "¿Qué está simulado?", answer: [DEMO_NOTICE, "Usted declara el bono y el certificado de bloqueo: solo su huella digital se registra en Stellar. El archivo nunca sale del navegador. La aprobación se activa con una acción rotulada como simulación. RBOND no acumula rendimiento ni distribuye cupones."] },
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
