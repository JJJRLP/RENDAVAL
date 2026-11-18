type Proof = { href?: string; label: string };
type Item = { name: string; role: string; proof?: Proof };

/** Names the infrastructure behind each step, with a link to on-chain evidence when there is one. */
export function TechStrip({ account, receiptUrl, escrowUrl }: { account?: string; receiptUrl?: string; escrowUrl?: string }) {
  const items: Item[] = [
    { name: 'Pollar', role: 'Acceso con correo o Google, cuenta de la empresa y firma de cada operación.' },
    { name: 'Didit', role: 'Verificación de la identidad legal de la empresa.', proof: receiptUrl ? { href: receiptUrl, label: 'Ver constancia' } : undefined },
    { name: 'Trustless Work', role: 'Escrow que custodia los bonos mientras dura el préstamo.', proof: escrowUrl ? { href: escrowUrl, label: 'Ver contrato' } : undefined },
    { name: 'Stellar', role: 'Red donde viven los bonos digitales y los dólares (USDC).', proof: account ? { href: `https://stellar.expert/explorer/testnet/account/${account}`, label: 'Ver cuenta' } : undefined },
  ];
  return (
    <section aria-labelledby="tech-title" className="mt-6 border border-line bg-white p-6 md:p-8">
      <h2 id="tech-title" className="font-serif text-2xl font-semibold">
        Cómo funciona por dentro
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">Cada paso se apoya en infraestructura abierta y se puede comprobar en la red.</p>
      <ul className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => (
          <li key={item.name} className="border-t-2 border-ink pt-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-teal">0{index + 1}</p>
            <p className="mt-1 font-serif text-lg font-semibold">{item.name}</p>
            <p className="mt-1 text-sm leading-6 text-ink/70">{item.role}</p>
            {item.proof && (
              <a className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-teal underline underline-offset-4" href={item.proof.href} target="_blank" rel="noopener noreferrer">
                {item.proof.label}
                <span className="sr-only"> (abre una pestaña nueva)</span>&nbsp;↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
