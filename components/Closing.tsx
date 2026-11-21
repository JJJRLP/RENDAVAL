"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

type FieldName = "company" | "email" | "tokens";
type Values = Record<FieldName, string>;
type Errors = Partial<Record<FieldName, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FIELD_ORDER: FieldName[] = ["company", "email", "tokens"];

function validate(values: Values): Errors {
  const errors: Errors = {};
  if (values.company.trim().length < 2) {
    errors.company = "Indique la razón social de su empresa.";
  }
  if (values.email.trim() === "") {
    errors.email = "Indique su correo corporativo.";
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "El formato del correo no es válido. Ejemplo: nombre@empresa.com.";
  }
  if (values.tokens.trim().length < 2) {
    errors.tokens = "Indique los RWA que mantiene su empresa.";
  }
  return errors;
}

const inputBase =
  "mt-2 block min-h-12 w-full rounded-sm border bg-white px-4 py-2 text-base";

export function Closing() {
  const [values, setValues] = useState<Values>({ company: "", email: "", tokens: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  function update(name: FieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => ({ ...current, [name]: undefined }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);

    const firstInvalid = FIELD_ORDER.find((name) => found[name]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLInputElement>(`#${firstInvalid}`)?.focus();
      return;
    }

    // Client-side only: nothing is sent or stored.
    setSubmitted(true);
  }

  function field(
    name: FieldName,
    label: string,
    props: { type: string; autoComplete: string; hint?: string },
  ) {
    const error = errors[name];
    const describedBy =
      [props.hint ? `${name}-hint` : null, error ? `${name}-error` : null]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div>
        <label htmlFor={name} className="block font-semibold">
          {label}
        </label>
        {props.hint && (
          <p id={`${name}-hint`} className="mt-1 text-sm text-ink/70">
            {props.hint}
          </p>
        )}
        <input
          id={name}
          name={name}
          type={props.type}
          autoComplete={props.autoComplete}
          required
          value={values[name]}
          onChange={(event) => update(name, event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${inputBase} ${error ? "border-2 border-ink" : "border-ink/50"}`}
        />
        {error && (
          <p id={`${name}-error`} className="mt-2 flex gap-2 text-sm font-semibold">
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 4.5v4M8 11v.5" />
            </svg>
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <section
      id="solicitar-acceso"
      className="scroll-mt-16 bg-ink py-24 text-white md:py-32"
      aria-labelledby="closing-title"
    >
      <Reveal className="mx-auto grid max-w-content gap-12 px-6 md:px-10 lg:grid-cols-2 lg:gap-16">
        <div className="on-dark">
          <Eyebrow index="06" tone="dark">
            Acceso
          </Eyebrow>
          <h2 id="closing-title" className="display-2 mt-6">
            Solicite acceso al prototipo.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/75">
            Tres datos son suficientes para evaluar si su empresa se ajusta a
            esta etapa.
          </p>
        </div>

        <div className="bg-white p-6 text-ink md:p-10">
          {submitted ? (
            <div ref={successRef} tabIndex={-1} role="status" className="outline-none">
              <svg
                viewBox="0 0 32 32"
                aria-hidden="true"
                className="h-10 w-10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="16" cy="16" r="13" />
                <path d="M10 16.5l4 4 8-9" />
              </svg>
              <h3 className="mt-6 font-serif text-2xl font-semibold">
                Solicitud completa.
              </h3>
              <p className="mt-4 leading-7 text-ink/80">
                Los datos de {values.company.trim()} son válidos. Agradecemos su
                interés en Rendaval.
              </p>
              <p className="mt-4 text-sm leading-6 text-ink/80">
                Esta página es un prototipo: sus datos no se han enviado ni
                almacenado.
              </p>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-6">
              {field("company", "Razón social", {
                type: "text",
                autoComplete: "organization",
              })}
              {field("email", "Correo electrónico corporativo", {
                type: "email",
                autoComplete: "email",
              })}
              {field("tokens", "RWA en cartera", {
                type: "text",
                autoComplete: "off",
                hint: "Indique el tipo de activo y un monto aproximado en USD.",
              })}
              <div>
                <button type="submit" className="btn-primary w-full sm:w-auto">
                  Solicitar acceso
                </button>
              </div>
            </form>
          )}
        </div>
      </Reveal>
    </section>
  );
}
