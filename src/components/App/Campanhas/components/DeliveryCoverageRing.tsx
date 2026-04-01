import { cn } from '@/lib/utils'

interface Props {
  total: number
  entregues: number
  lidos: number
  size?: 80 | 120
}

export function DeliveryCoverageRing({ total, entregues, lidos, size = 120 }: Props) {
  const cobertura = total > 0 ? Math.round(((entregues + lidos) / total) * 100) : 0
  // Evitar double-count: entregues já inclui quem leu em alguns casos
  const pct = Math.min(cobertura, 100)

  const strokeWidth = size === 120 ? 8 : 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  const color = pct >= 95 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'
  const trackColor = pct >= 95 ? 'text-emerald-500/15' : pct >= 70 ? 'text-amber-500/15' : 'text-red-500/15'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          className={cn('stroke-current', trackColor)}
        />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={cn('stroke-current transition-all duration-1000 ease-out', color)}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-bold', color, size === 120 ? 'text-2xl' : 'text-lg')}>
          {pct}%
        </span>
        <span className="text-[10px] text-gray-500">Cobertura</span>
      </div>
    </div>
  )
}
