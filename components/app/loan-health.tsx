import { formatNumber } from '@/lib/format';
import { HEALTH_LIMIT, HEALTH_WARNING, type LoanView } from '@/lib/loan/model';

/** How much of the collateral's value the debt uses, against Rendaval's example thresholds. */
export function LoanHealth({ debt, collateral, health }: { debt: number; collateral: number; health: LoanView['health'] }) {
  const { ratio, level } = health;
  if (ratio === null || level === 'unknown') return <p className="mt-5 text-sm">Salud no calculable; consulte el estado del contrato.</p>;
  const percent = Math.round(ratio * 100);
  const label = level === 'ok' ? 'Saludable' : level === 'warning' ? 'Aviso de margen abierto' : 'En riesgo';
  const mark = level === 'ok' ? '✓' : level === 'warning' ? '!' : '✕';
  return (
    <div className="mt-5 border-t border-line pt-4 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>
          <span className="text-ink/65">Salud del préstamo: </span>
          <span className={`font-semibold ${level === 'ok' ? 'text-blue' : ''}`}>
            <span aria-hidden="true">{mark} </span>
            {label}
          </span>
        </span>
        <span className="text-ink/65">
          Debe {formatNumber(debt, 2)} USDC sobre USD {formatNumber(collateral, 2)} en bonos · usa el {percent} % de su garantía
        </span>
      </p>
      <div className="relative mt-3 h-2 bg-offwhite" role="img" aria-label={`El préstamo usa el ${percent} % del valor de la garantía. Aviso a partir del ${HEALTH_WARNING * 100} %, límite en ${HEALTH_LIMIT * 100} %.`}>
        <div className={`h-full ${level === 'ok' ? 'bg-blue' : 'bg-ink'}`} style={{ width: `${Math.min(100, percent)}%` }} />
        <span className="absolute top-[-3px] h-[14px] w-px bg-ink/50" style={{ left: `${HEALTH_WARNING * 100}%` }} />
        <span className="absolute top-[-3px] h-[14px] w-px bg-ink" style={{ left: `${HEALTH_LIMIT * 100}%` }} />
      </div>
      <p className="relative mt-2 flex justify-end gap-3 text-xs text-ink/55 sm:block sm:h-4">
        <span className="whitespace-nowrap sm:absolute sm:-translate-x-full sm:pr-1" style={{ left: `${HEALTH_WARNING * 100}%` }}>Aviso {HEALTH_WARNING * 100} %</span>
        <span className="whitespace-nowrap sm:absolute sm:right-0">Límite {HEALTH_LIMIT * 100} %</span>
      </p>
      <p className="mt-2 text-xs leading-5 text-ink/55">
        {level === 'ok' ? 'Su deuda está por debajo del nivel de aviso. Pague y recupere sus bonos antes del vencimiento.' : level === 'warning' ? 'Hay un aviso de margen abierto. Use «Firmar pago y recuperar bonos» para cerrar la deuda.' : 'La deuda alcanzó el límite de riesgo. Puede declararse el incumplimiento. Use «Firmar pago y recuperar bonos» antes de que se ejecute la venta.'}
      </p>
    </div>
  );
}
