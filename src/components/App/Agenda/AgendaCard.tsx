import { cn } from '@/lib/utils';
import type { AulaAgenda } from '@/hooks/useAgendaDia';

interface Props {
  aula: AulaAgenda;
  selecionada: boolean;
  estilo: React.CSSProperties;
  onSelecionar: (aula: AulaAgenda) => void;
}

function primeiroENome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1]}` : partes[0];
}

export function AgendaCard({ aula, selecionada, estilo, onSelecionar }: Props) {
  const experimental = aula.categoria === 'experimental';
  const semAluno = aula.alunos.length === 0 && !aula.cancelada;

  let titulo: string;
  if (experimental) titulo = 'Experimental';
  else if (aula.alunos.length === 1) titulo = primeiroENome(aula.alunos[0].nome);
  else if (aula.alunos.length > 1) {
    titulo = `${primeiroENome(aula.alunos[0].nome)} +${aula.alunos.length - 1}`;
  } else titulo = aula.turma_nome || aula.curso_nome || 'Aula';

  const subtitulo = aula.nr_da_aula
    ? `${aula.sala_nome ?? 'sem sala'} · aula ${aula.nr_da_aula}`
    : `${aula.sala_nome ?? 'sem sala'}${aula.qtd_alunos ? ` · ${aula.qtd_alunos} alunos` : ''}`;

  const risco = Math.max(0, ...aula.alunos.map((a) => a.risco_pct ?? 0));

  return (
    <button
      type="button"
      style={estilo}
      onClick={() => onSelecionar(aula)}
      aria-current={selecionada}
      title={`${aula.hora_inicio}–${aula.hora_fim} · ${aula.curso_nome ?? ''}`}
      className={cn(
        'absolute flex items-center gap-1.5 overflow-hidden rounded-md border border-l-[3px] px-2 text-left',
        'border-slate-700 bg-slate-800 hover:border-slate-500',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500',
        !experimental && !aula.cancelada && !aula.reagendada && !semAluno && 'border-l-emerald-500',
        experimental && 'border-l-violet-400 bg-violet-500/15',
        aula.cancelada && !experimental && 'border-l-rose-400 bg-rose-500/10',
        aula.reagendada && !aula.cancelada && !experimental && 'border-l-amber-400 bg-amber-500/15',
        semAluno && !experimental && !aula.reagendada && 'border-l-slate-500',
        aula.cancelada && 'opacity-70',
        selecionada && 'ring-1 ring-emerald-500',
      )}
    >
      <span className="min-w-0 flex-1 leading-tight">
        <span
          className={cn(
            'block truncate text-xs font-semibold',
            aula.cancelada && 'line-through',
            semAluno && !experimental && 'italic font-medium text-slate-300',
          )}
        >
          {titulo}
        </span>
        <span className="block truncate text-[10.5px] text-slate-400">{subtitulo}</span>
      </span>

      {experimental && <Marca cor="bg-violet-400 text-violet-950" texto="E" />}
      {!experimental && aula.cancelada && <Marca cor="bg-rose-400 text-rose-950" texto="✕" />}
      {!experimental && !aula.cancelada && aula.reagendada && (
        <Marca cor="bg-amber-400 text-amber-950" texto="R" />
      )}
      {!experimental && !aula.cancelada && !aula.reagendada && risco >= 40 && (
        <Marca cor="bg-rose-400 text-rose-950" texto="!" />
      )}
    </button>
  );
}

function Marca({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid h-[15px] w-[15px] shrink-0 place-items-center rounded text-[9px] font-extrabold', cor)}
    >
      {texto}
    </span>
  );
}
