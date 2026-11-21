import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rendaval · Liquidez en dólares sobre RWA",
  description:
    "Constituya sus RWA (activos del mundo real tokenizados) en garantía y disponga de USDC sin vender la posición. Al pagar, recupera sus bonos en la misma transacción. Prototipo en testnet de Stellar.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${inter.variable} ${sourceSerif.variable}`}>
      <body>
        {/* Without JavaScript nothing triggers the reveal, so show everything. */}
        <noscript>
          <style>{`.reveal, .reveal-group .reveal-step { opacity: 1 !important; transform: none !important; } .reveal .split-block { clip-path: none !important; }`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
