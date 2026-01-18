import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TipoCompetencia, CompetenciaFiltro, CompetenciaRange } from '@/hooks/useCompetenciaFiltro';

interface CompetenciaFilterProps {
  filtro: CompetenciaFiltro;
  range: CompetenciaRange;
  anosDisponiveis: number[];
  onTipoChange: (tipo: TipoCompetencia) => void;
  onAnoChange: (ano: number) => void;
  onMesChange: (mes: number) => void;
  onTrimestreChange: (trimestre: 1 | 2 | 3 | 4) => void;
  onSemestreChange: (semestre: 1 | 2) => void;
  className?: string;
}

const TIPOS: { id: TipoCompetencia; label: string; shortLabel: string }[] = [
  { id: 'mensal', label: 'Mensal', shortLabel: 'Mês' },
  { id: 'trimestral', label: 'Trimestre', shortLabel: 'Trim' },
  { id: 'semestral', label: 'Semestre', shortLabel: 'Sem' },
  { id: 'anual', label: 'Anual', shortLabel: 'Ano' },
];

const MESES = [
  { value: 1, label: 'Janeiro', short: 'Jan' },
  { value: 2, label: 'Fevereiro', short: 'Fev' },
  { value: 3, label: 'Março', short: 'Mar' },
  { value: 4, label: 'Abril', short: 'Abr' },
  { value: 5, label: 'Maio', short: 'Mai' },
  { value: 6, label: 'Junho', short: 'Jun' },
  { value: 7, label: 'Julho', short: 'Jul' },
  { value: 8, label: 'Agosto', short: 'Ago' },
  { value: 9, label: 'Setembro', short: 'Set' },
  { value: 10, label: 'Outubro', short: 'Out' },
  { value: 11, label: 'Novembro', short: 'Nov' },
  { value: 12, label: 'Dezembro', short: 'Dez' },
];

const TRIMESTRES = [
  { value: 1 as const, label: 'Q1 (Jan-Mar)', short: 'Q1' },
  { value: 2 as const, label: 'Q2 (Abr-Jun)', short: 'Q2' },
  { value: 3 as const, label: 'Q3 (Jul-Set)', short: 'Q3' },
  { value: 4 as const, label: 'Q4 (Out-Dez)', short: 'Q4' },
];

const SEMESTRES = [
  { value: 1 as const, label: '1º Semestre (Jan-Jun)', short: '1º Sem' },
  { value: 2 as const, label: '2º Semestre (Jul-Dez)', short: '2º Sem' },
];

export function CompetenciaFilter({
  filtro,
  range,
  anosDisponiveis,
  onTipoChange,
  onAnoChange,
  onMesChange,
  onTrimestreChange,
  onSemestreChange,
  className,
}: CompetenciaFilterProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Seletor de Tipo */}
      <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1">
        {TIPOS.map((tipo) => (
          <button
            key={tipo.id}
            onClick={() => onTipoChange(tipo.id)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              filtro.tipo === tipo.id
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            )}
          >
            {tipo.shortLabel}
          </button>
        ))}
      </div>

      {/* Seletores de Período */}
      <div className="flex items-center gap-3">
        {/* Seletor de Ano */}
        <div className="relative">
          <select
            value={filtro.ano}
            onChange={(e) => onAnoChange(Number(e.target.value))}
            className="appearance-none bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 pr-9 text-sm text-white cursor-pointer focus:outline-none focus:border-violet-500"
          >
            {anosDisponiveis.map((ano) => (
              <option key={ano} value={ano} className="bg-slate-900">
                {ano}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Seletor de Mês (apenas para tipo mensal) */}
        {filtro.tipo === 'mensal' && (
          <div className="relative">
            <select
              value={filtro.mes}
              onChange={(e) => onMesChange(Number(e.target.value))}
              className="appearance-none bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 pr-9 text-sm text-white cursor-pointer focus:outline-none focus:border-violet-500"
            >
              {MESES.map((mes) => (
                <option key={mes.value} value={mes.value} className="bg-slate-900">
                  {mes.short}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Seletor de Trimestre */}
        {filtro.tipo === 'trimestral' && (
          <div className="relative">
            <select
              value={filtro.trimestre}
              onChange={(e) => onTrimestreChange(Number(e.target.value) as 1 | 2 | 3 | 4)}
              className="appearance-none bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 pr-9 text-sm text-white cursor-pointer focus:outline-none focus:border-violet-500"
            >
              {TRIMESTRES.map((t) => (
                <option key={t.value} value={t.value} className="bg-slate-900">
                  {t.short}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Seletor de Semestre */}
        {filtro.tipo === 'semestral' && (
          <div className="relative">
            <select
              value={filtro.semestre}
              onChange={(e) => onSemestreChange(Number(e.target.value) as 1 | 2)}
              className="appearance-none bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 pr-9 text-sm text-white cursor-pointer focus:outline-none focus:border-violet-500"
            >
              {SEMESTRES.map((s) => (
                <option key={s.value} value={s.value} className="bg-slate-900">
                  {s.short}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>
    </div>
  );
}

export default CompetenciaFilter;
