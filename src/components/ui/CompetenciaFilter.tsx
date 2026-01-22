import { cn } from '@/lib/utils';
import { TipoCompetencia, CompetenciaFiltro, CompetenciaRange } from '@/hooks/useCompetenciaFiltro';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
      <div className="flex items-center gap-2">
        {/* Seletor de Ano */}
        <Select
          value={filtro.ano.toString()}
          onValueChange={(value) => onAnoChange(Number(value))}
        >
          <SelectTrigger className="w-[90px] bg-slate-800/50 border-slate-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map((ano) => (
              <SelectItem key={ano} value={ano.toString()}>
                {ano}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Seletor de Mês (apenas para tipo mensal) */}
        {filtro.tipo === 'mensal' && (
          <Select
            value={filtro.mes.toString()}
            onValueChange={(value) => onMesChange(Number(value))}
          >
            <SelectTrigger className="w-[80px] bg-slate-800/50 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((mes) => (
                <SelectItem key={mes.value} value={mes.value.toString()}>
                  {mes.short}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Seletor de Trimestre */}
        {filtro.tipo === 'trimestral' && (
          <Select
            value={filtro.trimestre.toString()}
            onValueChange={(value) => onTrimestreChange(Number(value) as 1 | 2 | 3 | 4)}
          >
            <SelectTrigger className="w-[80px] bg-slate-800/50 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIMESTRES.map((t) => (
                <SelectItem key={t.value} value={t.value.toString()}>
                  {t.short}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Seletor de Semestre */}
        {filtro.tipo === 'semestral' && (
          <Select
            value={filtro.semestre.toString()}
            onValueChange={(value) => onSemestreChange(Number(value) as 1 | 2)}
          >
            <SelectTrigger className="w-[100px] bg-slate-800/50 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEMESTRES.map((s) => (
                <SelectItem key={s.value} value={s.value.toString()}>
                  {s.short}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

export default CompetenciaFilter;
