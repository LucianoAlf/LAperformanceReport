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
 *   14:00  Violão                            1/4
 *          G. Ribeiro · Sala 2
 *
 * O horário vira âncora à esquerda porque a lista é lida em ordem de
 * horário — é por ele que se procura "o que tem depois do almoço".
 *
 * ⚠️ O nome do professor entra ABREVIADO. Medido na Chamada, em 21/09: o nome
 * por extenso truncava 7 de 20 linhas, e o que sumia era sempre o que vinha
 * depois dele — aqui, a sala, que é justamente para onde a pessoa vai.
 */

/**
 * 🔴 A cor marca EXCEÇÃO, e "um aluno" não é exceção aqui.
 *
 * A primeira versão desta tela pintava `sozinho` de vermelho, como a tela do
 * computador faz. Medido a 390px: **105 das 160 linhas do dia** acendiam —
 * e, na base inteira, 745 de 895 turmas (83,2%) têm um aluno só, porque na LA
 * quase toda disciplina é contratada como turma e roda individual.
 *
 * Alerta que acende em 83% das linhas não avisa nada: vira o fundo da tela.
 * É a mesma lição que a Agenda pagou em 21/09 com o `opacity-50` no passado e
 * com a barra cinza em toda linha normal.
 *
 * Sobra como exceção a turma SEM NENHUM aluno — vínculo faltando, não lotação
 * baixa. Quem procura ocupação baixa usa o filtro "Sozinhas", que continua ali.
 */
const TOM: Record<NivelOcupacao, { texto: string; marca: string }> = {
  vazia: { texto: 'text-amber-400', marca: 'border-l-amber-500/70' },
  sozinho: { texto: 'text-slate-300', marca: 'border-l-transparent' },
  dupla: { texto: 'text-slate-300', marca: 'border-l-transparent' },
  cheia: { texto: 'text-slate-300', marca: 'border-l-transparent' },
  ok: { texto: 'text-slate-300', marca: 'border-l-transparent' },
};

interface Props {
  turma: Turma;
  onAbrir: (turma: Turma) => void;
}

export function LinhaTurma({ turma, onAbrir }: Props) {
  const nivel = nivelOcupacaoTurma(turma.total_alunos, turma.capacidade_maxima);
  const tom = TOM[nivel];
  // 🔴 Medido a 390px: com "Curso · Professor" numa linha so, 106 das 895
  // linhas truncavam — "Musicalizacao Preparatoria · Leticia" e cortado no
  // meio do nome. Sobram ~250px depois do horario, da ocupacao e da seta, e
  // um nome de curso longo ja os ocupa sozinho. Entao o curso fica com a
  // primeira linha inteira, e professor e sala dividem a segunda.
  const quem = turma.curso_nome || 'sem curso';
  const onde = [abreviarNome(turma.professor_nome), turma.sala_nome || 'sem sala'].filter(Boolean).join(' · ');

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

      {/* Só o número; a palavra "aluno(a)s" não cabe e o cabeçalho da lista já
          diz do que se trata. Sem capacidade declarada (630 das 895 turmas), o
          texto vem sem denominador — inventar "/4" afirmaria uma lotação que
          ninguém cadastrou. */}
      <span className={cn('flex-none text-[12px] font-semibold tabular-nums', tom.texto)}>
        {textoOcupacaoTurma(turma.total_alunos, turma.capacidade_maxima).split(' ')[0]}
      </span>

      <ChevronRight className="h-4 w-4 flex-none text-slate-600" aria-hidden="true" />
    </button>
  );
}

export default LinhaTurma;
