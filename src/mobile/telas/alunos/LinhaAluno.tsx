import { ChevronRight } from 'lucide-react';

import type { AlunoLista } from '@/hooks/useAlunosLista';

import { quandoTemAula, seloDoAluno } from './seloAluno';

/**
 * Uma linha da lista de alunos no celular.
 *
 * A tabela do desktop tem 16 colunas e não encolhe para 351px. O arquétipo 1
 * do spec manda a linha carregar três coisas — **quem**, **com quem/quando** e
 * **o que exige ação** — e o resto morar na ficha:
 *
 *   Nome do Aluno                    [selo]
 *   Violão · Gabriel
 *   Terça 14:00                          CG
 *
 * Quem usa: secretaria/ADM (maioria) e coordenação. O núcleo serve os dois —
 * o que é exclusivo de cada um virou FILTRO, não coluna. Escola, Turma,
 * Parcela, Tempo, Telefone, Anamnese, Vencimento e Matrícula ficam na ficha.
 */

interface LinhaAlunoProps {
  aluno: AlunoLista;
  /** Na visão consolidada a unidade importa; dentro de uma unidade, é ruído. */
  mostrarUnidade: boolean;
  onAbrir: (aluno: AlunoLista) => void;
}

export function LinhaAluno({ aluno, mostrarUnidade, onAbrir }: LinhaAlunoProps) {
  const selo = seloDoAluno(aluno);
  const quando = quandoTemAula(aluno.dia_aula, aluno.horario_aula);
  const comQuem = [aluno.curso_nome, aluno.professor_nome].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={() => onAbrir(aluno)}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-left active:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
    >
      {/* min-w-0 aqui e em cada filho de texto: sem ele, um nome longo empurra
          o selo e o chevron para fora do cartão — é a mesma armadilha de
          `min-width:auto` que o KPICard tinha. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{aluno.nome}</span>
          {selo && (
            <span className={`flex-none rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${selo.classe}`}>
              {selo.texto}
            </span>
          )}
        </div>

        {comQuem && <p className="mt-0.5 truncate text-[12px] text-slate-400">{comQuem}</p>}

        {(quando || (mostrarUnidade && aluno.unidade_codigo)) && (
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] text-slate-500">{quando}</span>
            {mostrarUnidade && aluno.unidade_codigo && (
              <span className="flex-none text-[10px] font-medium uppercase text-slate-600">
                {aluno.unidade_codigo}
              </span>
            )}
          </div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 flex-none text-slate-600" aria-hidden="true" />
    </button>
  );
}

export default LinhaAluno;
