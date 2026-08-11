import { AlertTriangle, Check, FileText, Paperclip, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlunoAgenda } from '@/hooks/useAgendaDia';
import { estadoDoAluno, rotuloOrigem, temConflito, type EstadoChamada } from './chamadaUtils';

interface Props {
  aluno: AlunoAgenda;
  podeOperar: boolean;
  salvando: boolean;
  onMarcar: (aluno: AlunoAgenda, status: 'presente' | 'falta' | 'indeterminado') => void;
  onJustificar: (aluno: AlunoAgenda) => void;
}

const ESTILO_CARD: Record<EstadoChamada, string> = {
  presente: 'border-emerald-500/40 bg-emerald-500/5',
  falta: 'border-rose-500/40 bg-rose-500/5',
  falta_justificada: 'border-amber-500/40 bg-amber-500/5',
  indeterminado: 'border-dashed border-slate-500/60 bg-slate-700/10',
};

const GRADIENTE_AVATAR: Record<EstadoChamada, string> = {
  presente: 'from-emerald-500 to-teal-600',
  falta: 'from-rose-500 to-orange-600',
  falta_justificada: 'from-amber-500 to-yellow-600',
  indeterminado: 'from-slate-500 to-slate-600',
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

/**
 * Card do aluno na chamada: 3 destinos possiveis. Presente e falta sao
 * 1 clique; justificada abre modal (motivo obrigatorio + evidencia) — o
 * atrito fica so onde a operacao pediu rastreabilidade.
 */
export function ChamadaAlunoCard({ aluno, podeOperar, salvando, onMarcar, onJustificar }: Props) {
  const estado = estadoDoAluno(aluno);
  const conflito = temConflito(aluno);
  const semVinculo = aluno.aluno_id == null || aluno.aula_emusys_id == null;

  return (
    <div className={cn('rounded-xl border p-3 transition-colors', ESTILO_CARD[estado])}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white',
            GRADIENTE_AVATAR[estado],
          )}
          aria-hidden="true"
        >
          {iniciais(aluno.nome)}
        </div>
        <div className="min-w-0">
          <p className={cn('truncate text-sm font-semibold', estado === 'indeterminado' ? 'text-slate-300' : 'text-white')}>
            {aluno.nome}
          </p>
          <p className="text-[10px] text-slate-500">
            {aluno.nr_da_aula != null && aluno.qtd_aulas_contrato != null
              ? `Aula ${aluno.nr_da_aula} de ${aluno.qtd_aulas_contrato}`
              : 'Sem contrato vinculado'}
            {estado === 'falta' && <span className="text-rose-400"> · desconta do pacote</span>}
            {estado === 'falta_justificada' && <span className="text-amber-400"> · repor depois</span>}
          </p>
        </div>
      </div>

      {podeOperar && !semVinculo && (
        <div className="flex gap-1" role="group" aria-label={`Destino de ${aluno.nome}`}>
          <button
            type="button"
            disabled={salvando}
            onClick={() => onMarcar(aluno, estado === 'presente' ? 'indeterminado' : 'presente')}
            className={cn(
              'flex-1 rounded-md py-1 text-[10px] font-bold transition-all hover:-translate-y-px disabled:opacity-50',
              estado === 'presente'
                ? 'bg-emerald-500/10 text-emerald-400 shadow-[inset_0_0_0_1.5px_currentColor]'
                : 'text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400',
            )}
          >
            <Check className="mr-0.5 inline h-3 w-3" />Presente
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => onMarcar(aluno, estado === 'falta' ? 'indeterminado' : 'falta')}
            className={cn(
              'flex-1 rounded-md py-1 text-[10px] font-bold transition-all hover:-translate-y-px disabled:opacity-50',
              estado === 'falta'
                ? 'bg-rose-500/10 text-rose-400 shadow-[inset_0_0_0_1.5px_currentColor]'
                : 'text-slate-500 hover:bg-rose-500/10 hover:text-rose-400',
            )}
          >
            <X className="mr-0.5 inline h-3 w-3" />Falta
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => {
              if (estado === 'falta_justificada') {
                onMarcar(aluno, 'indeterminado');
              } else {
                onJustificar(aluno);
              }
            }}
            className={cn(
              'flex-1 rounded-md py-1 text-[10px] font-bold transition-all hover:-translate-y-px disabled:opacity-50',
              estado === 'falta_justificada'
                ? 'bg-amber-500/10 text-amber-400 shadow-[inset_0_0_0_1.5px_currentColor]'
                : 'text-slate-500 hover:bg-amber-500/10 hover:text-amber-400',
            )}
          >
            <FileText className="mr-0.5 inline h-3 w-3" />Justif.
          </button>
        </div>
      )}

      <div className="mt-2 space-y-1">
        {estado === 'falta_justificada' && aluno.justificada_motivo && (
          <p className="text-[10px] text-slate-400">
            {aluno.justificada_motivo}
            {aluno.justificada_evidencia && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-amber-300">
                <Paperclip className="h-3 w-3" /> com evidência
              </span>
            )}
          </p>
        )}
        {conflito && (
          <p
            className="flex items-center gap-1 text-[10px] text-amber-400/90"
            title={`O Emusys registrou "${aluno.emusys_presenca_bruta}"; a resposta humana prevalece.`}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Emusys: {aluno.emusys_presenca_bruta} · humano confirmou
          </p>
        )}
        {estado === 'indeterminado' && (
          <p className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            Sem destino — entra no digest
          </p>
        )}
        {(aluno.reposicoes_pendentes ?? 0) > 0 && estado !== 'falta_justificada' && (
          <p className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            <RotateCcw className="h-3 w-3" />
            {aluno.reposicoes_pendentes} reposição(ões) pendente(s)
          </p>
        )}
        {estado !== 'indeterminado' && (
          <p className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className={cn('h-1.5 w-1.5 rounded-full', aluno.respondido_por === 'agenda_secretaria' ? 'bg-emerald-400' : 'bg-violet-400')} />
            {rotuloOrigem(aluno.respondido_por)}
          </p>
        )}
      </div>
    </div>
  );
}
