"use client";

import { useEffect, useState } from "react";
import { usePollar } from "@pollar/react";
import { TRUST_ASSETS, isClassicAddress } from "@/lib/stellar/assets";
import { assetBalance, readBalances, type Balance } from "@/lib/stellar/horizon";
import { confirmedTrustline, createTrustline } from "@/lib/stellar/trustlines";

export function useWallet(address: string, revision?: unknown) {
  const { getClient } = usePollar();
  const [attempt, setAttempt] = useState(0);
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [progress, setProgress] = useState("Preparando su cuenta…");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const active = () => !controller.signal.aborted;
    const run = async () => {
      setBusy(true);
      setError("");
      setProgress("Preparando su cuenta…");
      try {
        let current = await readBalances(address, controller.signal);
        if (!active()) return;
        setBalances(current);
        for (const asset of TRUST_ASSETS) {
          if (!active()) return;
          if (!isClassicAddress(asset.issuer)) throw new Error("Los bonos de prueba no están configurados. Contacte al equipo de Vault.");
          if (assetBalance(current, asset)) {
            confirmedTrustline(address, asset);
            continue;
          }
          const client = getClient();
          const session = client.getAuthState();
          if (client.getWallet()?.address !== address || session.step !== "authenticated" || !session.verified) {
            throw new Error("Su sesión cambió. Ingrese nuevamente para continuar.");
          }
          setProgress(`Habilitando ${asset.code === 'USDC' ? 'los dólares digitales' : 'los bonos'} en su cuenta…`);
          await createTrustline(address, asset, (value) => client.setTrustline(value));
          if (!active()) return;
          setProgress(`Habilitando ${asset.code === 'USDC' ? 'los dólares digitales' : 'los bonos'} en su cuenta…`);
          // Horizon can index after the SDK responds. Never report success early.
          for (let i = 0; i < 5; i++) {
            current = await readBalances(address, controller.signal);
            if (!active()) return;
            setBalances(current);
            if (assetBalance(current, asset)) break;
            if (i < 4) await new Promise<void>((resolve) => setTimeout(resolve, 1500));
          }
          if (!assetBalance(current, asset)) {
            throw new Error(`Todavía estamos habilitando ${asset.code === 'USDC' ? 'los dólares digitales' : 'los bonos'} en su cuenta. Pulse Reintentar en unos segundos.`);
          }
          confirmedTrustline(address, asset);
        }
        if (active()) setProgress("");
      } catch (cause) {
        if (active()) {
          setProgress("");
          setError(cause instanceof Error ? cause.message : "No pudimos preparar su cuenta. Intente nuevamente.");
        }
      } finally {
        if (active()) setBusy(false);
      }
    };
    // Deferral lets Strict Mode cancel its rehearsal before any wallet mutation.
    const timer = setTimeout(() => void run(), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [address, attempt, getClient, revision]);

  return { balances, busy, progress, error, refresh: () => setAttempt((value) => value + 1) };
}
