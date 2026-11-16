export function Footer() {
  return (
    <footer className="on-dark border-t border-white/15 bg-ink text-white">
      <div className="mx-auto flex max-w-content flex-col gap-8 px-6 py-12 md:flex-row md:items-start md:justify-between md:px-10 md:py-16">
        <div>
          <p className="font-serif text-2xl font-semibold tracking-tight">Vault</p>
          <p className="mt-2 text-sm text-white/70">
            Préstamos en USDC con garantía de RWA.
          </p>
        </div>
        <div className="max-w-md text-sm leading-6 text-white/70">
          <p className="font-semibold text-white">
            Prototipo en testnet. Auditoría pendiente.
          </p>
          <p className="mt-2">
            Las cifras de esta página son ilustrativas. No constituyen una oferta
            de crédito ni una recomendación de inversión.
          </p>
        </div>
      </div>
    </footer>
  );
}
