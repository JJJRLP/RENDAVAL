import { formatNumber } from '@/lib/format';
import { HEALTH_LIMIT, HEALTH_WARNING, loanHealth } from '@/lib/loan/model';

/** How much of the collateral's value the debt uses, against Vault's example thresholds. */
export function LoanHealth({ debt, collateral }: { debt: number; collateral: number }) {
  const { ratio, level } = loanHealth(debt, collateral);
  const percent = Math.min(100, Math.round(ratio * 100));
  const label = level === 'ok' ? 'Saludable' : level === 'warning' ? 'Atención' : 'En riesgo';
  const mark = level === 'ok' ? '✓' : level === 'warning' ? '!' : '✕';
  return (
    <div className="mt-5 border-t border-line pt-4 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>
          <span className="text-ink/65">Salud del préstamo: </span>
          <span className={`font-semibold ${level === 'ok' ? 'text-teal' : ''}`}>
            <span aria-hidden="true">{mark} </span>
            {label}
          </span>
        </span>
        <span className="text-ink/65">
          Debe {formatNumber(debt, 2)} USDC sobre USD {formatNumber(collateral, 2)} en bonos · usa el {percent} % de su garantía
        </span>
      </p>
      <div className="relative mt-3 h-2 bg-offwhite" role="img" aria-label={`El préstamo usa el ${percent} % del valor de la garantía. Aviso a partir del ${HEALTH_WARNING * 100} %, límite en ${HEALTH_LIMIT * 100} %.`}>
        <div className={`h-full ${level === 'ok' ? 'bg-teal' : 'bg-ink'}`} style={{ width: `${percent}%` }} />
        <span className="absolute top-[-3px] h-[14px] w-px bg-ink/50" style={{ left: `${HEALTH_WARNING * 100}%` }} />
        <span className="absolute top-[-3px] h-[14px] w-px bg-ink" style={{ left: `${HEALTH_LIMIT * 100}%` }} />
      </div>
      <p className="mt-2 flex justify-between text-xs text-ink/55">
        <span>0 %</span>
        <span style={{ marginLeft: `${HEALTH_WARNING * 100 - 12}%` }}>Aviso {HEALTH_WARNING * 100} %</span>
        <span>Límite {HEALTH_LIMIT * 100} %</span>
        <span>100 %</span>
      </p>
    </div>
  );
}
