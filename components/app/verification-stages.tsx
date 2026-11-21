import type { Stage } from '@/lib/loan/model';

const STEPS = ['Verificación', 'Garantía', 'Desembolso', 'Reembolso'];

/** Compact progress bar above the focal block: where the company is in the loan. */
export function VerificationStages({ verified, pending, stage }: { verified: boolean; pending: boolean; stage?: Stage }) {
  const completed = !verified ? 0 : stage === 'closed' ? 4 : stage === 'active' || stage === 'repaid_release_pending' || stage === 'disputed' || stage === 'liquidated' ? 3 : stage === 'collateral_locked' ? 2 : 1;
  return (
    <ol className="mt-10 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" aria-label="Etapas del préstamo">
      {STEPS.map((name, index) => {
        const done = index < completed;
        const current = index === completed;
        const status = done
          ? 'Completada'
          : !current
            ? 'Pendiente'
            : index === 3 && stage === 'repaid_release_pending'
              ? 'En proceso'
              : (index === 0 && pending) || (index === 3 && stage === 'active')
                ? 'En curso'
                : 'Ahora';
        return (
          <li key={name} aria-current={current ? 'step' : undefined} className={`border-t-2 pt-3 ${done || current ? 'border-blue' : 'border-line'}`}>
            <p className={`text-xs font-semibold uppercase tracking-widest ${done || current ? 'text-blue' : 'text-ink/50'}`}>
              0{index + 1} <span aria-hidden="true">{done ? '✓' : ''}</span> {status}
            </p>
            <p className={`mt-1 font-serif text-lg font-semibold ${done || current ? '' : 'text-ink/50'}`}>{name}</p>
          </li>
        );
      })}
    </ol>
  );
}
