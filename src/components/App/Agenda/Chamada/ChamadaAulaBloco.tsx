import { Check, RotateCcw, XCircle } from 'lucide-react';
import type { AlunoAgenda, AulaAgenda, LeadExperimentalAgenda } from '@/hooks/useAgendaDia';
import { estadoDoAluno } from './chamadaUtils';
import { ChamadaAlunoCard } from './ChamadaAlunoCard';
import { ChamadaLeadCard } from './ChamadaLeadCard';

interface Props {
  aula: AulaAgenda;
  data: string;
  podeOperar: boolean;
  salvando: boolean;
  onMarcar: (aluno: AlunoAgenda, status: 'presente' | 'falta' | 'indeterminado') => void;
  onMarcarExperimental: (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou') => void;
  onJustificar: (aluno: AlunoAgenda) => void;
  onTodosPresentes: (aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDrawer: (aula: AulaAgenda) => void;
}

/**
 * Bloco da aula na visao Dia: acoes no cabecalho (nivel AULA — todos
 * presentes, reagendar, cancelar) e os cards de aluno dentro (nivel ALUNO).
 * Cancelamento e reagendamento nao existem por aluno: a aula e o evento.
 */
export function ChamadaAulaBloco({
  aula,
  data,
  podeOperar,
  salvando,
  onMarcar,
  onMarcarExperimental,
  onJustificar,
  onTodosPresentes,
  onCancelarAula,
  onReagendarAula,
  onAbrirDrawer,
}: Props) {
  const vinculados = aula.alunos.filter((a) => a.aluno_id != null);
  const leads = aula.experimental_leads ?? [];
  const totalPessoas = vinculados.length + leads.length;
  const contagens = vinculados.reduce(
    (acc, a) => {
      acc[estadoDoAluno(a)] += 1;
      return acc;
    },
    { presente: 0, falta: 0, falta_justificada: 0, indeterminado: 0 } as Record<string, number>,
  );

  if (aula.cancelada) {
    return (
      <section className="overflow-hidden rounded-2xl border border-rose-500/25 bg-slate-800/20">
        <button
          type="button"
          onClick={() => onAbrirDrawer(aula)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-4">
            <span className="text-lg font-extrabold text-slate-500 line-through">{aula.hora_inicio}</span>
            <div>
              <p className="text-sm font-semibold text-slate-400">
                {aula.professor_nome} <span className="font-normal text-slate-600">· {aula.curso_nome} · {aula.sala_nome} · {aula.unidade_nome}</span>
              </p>
              <p className="text-[11px] font-medium text-rose-300/90">
                <XCircle className="mr-1 inline h-3 w-3" />
                Cancelada{aula.cancelada_motivo ? ` — “${aula.cancelada_motivo}”` : ''}
                {aula.cancelada_origem === 'agenda_secretaria' ? ' · pela secretaria' : ''}
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
            <RotateCcw className="mr-1 inline h-3 w-3" />
            {vinculados.length} crédito(s) de reposição
          </span>
        </button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-800/25">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/40 bg-slate-800/30 px-5 py-3.5">
        <button type="button" onClick={() => onAbrirDrawer(aula)} className="flex items-center gap-4 text-left">
          <span className="text-lg font-extrabold text-white">{aula.hora_inicio}</span>
          <span>
            <span className="block text-sm font-semibold text-slate-200">
              {aula.professor_nome}{' '}
              <span className="font-normal text-slate-500">· {aula.curso_nome} · {aula.sala_nome} · {aula.unidade_nome}</span>
            </span>
            <span className="block text-[11px] text-slate-500">
              {aula.tipo === 'turma' ? `Turma — ${vinculados.length} alunos` : 'Individual'}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs text-slate-400">
            <b className="text-emerald-400">{contagens.presente}</b> presenças ·{' '}
            <b className="text-rose-400">{contagens.falta}</b> falta ·{' '}
            <b className="text-amber-400">{contagens.falta_justificada}</b> justificada ·{' '}
            <b className="text-slate-500">{contagens.indeterminado}</b> pendente
          </span>
          {podeOperar && (
            <>
              <button
                type="button"
                disabled={salvando || vinculados.length === 0}
                onClick={() => onTodosPresentes(aula)}
                className="rounded-lg border border-emerald-500/30 bg-emerald-600/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-600/25 disabled:opacity-50"
              >
                <Check className="mr-1 inline h-3.5 w-3.5" />
                Todos presentes
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={() => onReagendarAula(aula)}
                className="rounded-lg border border-sky-500/30 bg-sky-600/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition-all hover:bg-sky-600/20 disabled:opacity-50"
              >
                <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
                Reagendar
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={() => onCancelarAula(aula)}
                className="rounded-lg border border-rose-500/30 bg-rose-600/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-600/20 disabled:opacity-50"
              >
                <XCircle className="mr-1 inline h-3.5 w-3.5" />
                Cancelar aula
              </button>
            </>
          )}
        </div>
      </div>

      {totalPessoas === 0 ? (
        <p className="p-4 text-xs text-slate-500">Sem alunos nem leads nesta aula.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {vinculados.map((aluno) => (
            <ChamadaAlunoCard
              key={`${aluno.aula_emusys_id}-${aluno.aluno_id}`}
              aluno={aluno}
              podeOperar={podeOperar}
              salvando={salvando}
              onMarcar={onMarcar}
              onJustificar={onJustificar}
            />
          ))}
          {leads.map((lead) => (
            <ChamadaLeadCard
              key={`lead-${lead.experimental_id}`}
              lead={lead}
              podeOperar={podeOperar}
              salvando={salvando}
              onMarcar={onMarcarExperimental}
            />
          ))}
        </div>
      )}
    </section>
  );
}
