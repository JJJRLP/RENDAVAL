"use client";

import { PollarProvider } from "@pollar/react";
import "@pollar/react/styles.css";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const apiKey = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY;

export function VaultPollarProvider({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!apiKey?.startsWith("pub_testnet_")) {
    return <p role="alert" className="border border-line bg-white p-8">El acceso no está disponible. Configure una clave pública de Pollar para testnet.</p>;
  }
  // Pollar requires browser storage and WebCrypto; never initialize during SSR.
  if (!mounted) return <p role="status" className="text-ink/70">Preparando el acceso…</p>;
  return (
    <PollarProvider client={{ apiKey, stellarNetwork: "testnet", confirmation: "auto" }}>
      {children}
    </PollarProvider>
  );
}
