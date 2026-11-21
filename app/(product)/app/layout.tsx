import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { VaultPollarProvider } from "@/components/app/pollar-provider";

export const metadata: Metadata = { title: "Su empresa · Rendaval", robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-offwhite">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-6 py-6 md:px-10">
          <Link href="/" aria-label="Rendaval, inicio" className="flex min-h-11 items-center"><Logo className="h-10" /></Link>
          <span className="border border-line px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ink/70">Versión de prueba</span>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-content px-6 py-12 md:px-10 md:py-20">
        <VaultPollarProvider>{children}</VaultPollarProvider>
        <p className="mt-12 border-t border-line pt-6 text-xs leading-6 text-ink/60">
          Versión de prueba sobre la red de pruebas de Stellar. Los bonos y los dólares no tienen valor real, el registro del bono es
          simulado (sin custodio) y el tipo de cambio de referencia es Bs 6,96 por USD.
        </p>
      </main>
    </div>
  );
}
