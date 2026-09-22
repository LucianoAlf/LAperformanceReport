import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { abreviarNome } from '@/lib/nomeExibicao.mjs';
import {
  formatarHorarioTurma,
  nivelOcupacaoTurma,
  textoOcupacaoTurma,
  type NivelOcupacao,
} from '@/lib/turmas';
import type { Turma } from '@/components/App/Alunos/AlunosPage';

/**
 * Uma turma na lista do celular.
 *
 *   14:00  Violão · G. Ribeiro              1/4
 *          Sala 2                        sozinho
 *
 * O horário vira âncora à esquerda porque a lista é lida em ordem de
 * horário — é por ele que se procura "o que tem depois do almoço".
 *
 * ⚠️ O nome do professor entra ABREVIADO. Medido na Chamada, em 21/09: o nome
 * por extenso truncava 7 de 20 linhas, e o que sumia era sempre o que vinha
 * depois dele — aqui, a sala, que é justamente para onde a pessoa vai.
 */

const TOM: Record<NivelOcupacao, { texto: string; marca: string }> = {
  // Sozinho é o caso que a coordenação remaneja — o mesmo que o KPI SOZINHOS
  // conta. Por isso é o único em vermelho.
  sozinho: { texto: 'text-red-400', marca: 'border-l-red-500/70' },
  vazia: { texto: 'text-slate-500', marca: 'border-l-slate-600' },
  dupla: { texto: 'text-amber-400', marca: 'border-l-amber-500/60' },
  cheia: { texto: 'text-emerald-400', marca: 'border-l-emerald-500/60' },
  ok: { texto: 'text-emerald-400', marca: 'border-l-emerald-500/60' },
};

interface Props {
  turma: Turma;
  onAbrir: (turma: Turma) => void;
}

export function LinhaTurma({ turma, onAbrir }: Props) {
  const nivel = nivelOcupacaoTurma(turma.total_alunos, turma.capacidade_maxima);
  const tom = TOM[nivel];
  const quem = [turma.curso_nome, abreviarNome(turma.professor_nome)].filter(Boolean).join(' · ');
  const onde = turma.sala_nome || 'sem sala';

  return (
    <button
      type="button"
      onClick={() => onAbrir(turma)}
      className={cn(
        'flex w-full items-center gap-2.5 border-b border-l-[3px] border-b-slate-800/70 py-2.5 pl-2.5 pr-1 text-left',
        'active:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
        tom.marca,
      )}
    >
      <span className="w-[42px] flex-none text-[12.5px] font-semibold tabular-nums text-slate-300">
        {formatarHorarioTurma(turma.horario_inicio)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-slate-100">{quem}</p>
        <p className="truncate text-[11px] leading-tight text-slate-500">{onde}</p>
      </div>

      <span className={cn('flex-none text-[12px] font-semibold tabular-nums', tom.texto)}>
        {textoOcupacaoTurma(turma.total_alunos, turma.capacidade_maxima).split(' ')[0]}
      </span>

      <ChevronRight className="h-4 w-4 flex-none text-slate-600" aria-hidden="true" />
    </button>
  );
}

export default LinhaTurma;
