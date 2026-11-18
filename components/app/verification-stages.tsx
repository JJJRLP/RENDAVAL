const steps = [
  ['Verificación', 'Confirmamos la identidad legal de su empresa.'],
  ['Garantía', 'Sus bonos respaldan el préstamo y siguen siendo suyos.'],
  ['Desembolso', 'Recibe dólares digitales en su cuenta.'],
  ['Reembolso', 'Devuelve el préstamo y recupera sus bonos.'],
];
export function VerificationStages({ verified, pending }: { verified: boolean; pending: boolean }) {
  return <ol className="mt-6 grid border border-line bg-white sm:grid-cols-2 lg:grid-cols-4" aria-label="Etapas del préstamo">
    {steps.map(([name, body], index) => {
      const done = verified && index === 0;
      const next = index === (verified ? 1 : 0);
      return <li key={name} aria-current={next ? 'step' : undefined} className="border-t border-line p-6 first:border-t-0 sm:even:border-l lg:border-l lg:border-t-0 lg:first:border-l-0">
        <p className={`flex items-center justify-between gap-2 text-sm font-semibold ${next || done ? 'text-teal' : 'text-ink/50'}`}>
          <span>0{index + 1}{done ? ' ✓' : next ? ' →' : ''}</span>
          <span className="text-xs uppercase tracking-widest">{done ? 'Completada' : next ? pending && !verified ? 'En curso' : 'Siguiente' : 'Después'}</span>
        </p>
        <h3 className="mt-4 font-serif text-xl font-semibold">{name}</h3>
        <p className="mt-2 text-sm leading-6 text-ink/70">{body}</p>
      </li>;
    })}
  </ol>;
}
