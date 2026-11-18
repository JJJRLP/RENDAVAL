import Link from "next/link";
import type { Metadata } from "next";
import { VaultPollarProvider } from "@/components/app/pollar-provider";

export const metadata: Metadata = { title: "Su empresa · Vault", robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-offwhite">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-6 py-6 md:px-10">
          <Link href="/" aria-label="Vault, inicio" className="font-serif text-2xl font-semibold tracking-tight">Vault</Link>
          <span className="border border-line px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ink/70">Versión de prueba</span>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-content px-6 py-12 md:px-10 md:py-20">
        <VaultPollarProvider>{children}</VaultPollarProvider>
      </main>
    </div>
  );
}
