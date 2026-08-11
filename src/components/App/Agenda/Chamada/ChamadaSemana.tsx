import { useMemo } from 'react';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarX, Check, Clock, FileText, X, XCircle } from 'lucide-react';
import { useAgendaDia, type AulaAgenda, type AlunoAgenda } from '@/hooks/useAgendaDia';
import { aulaJaOcorreu } from '@/lib/agenda';
import { alunoSemDestino, chamadaCompleta, estadoDoAluno, type EstadoChamada } from './chamadaUtils';
import type { ItemChamada } from './useChamadaAcoes';
import { cn } from '@/lib/utils';

interface Props {
  data: string;
  unidadeId: string | null;
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDia: (data: string) => void;
  onAbrirDrawer: (aula: AulaAgenda, data: string) => void;
}

/**
 * Visao Semana: grade segunda->sabado (sem domingo — a escola nao opera).
 * Cada dia carrega seu proprio `useAgendaDia`. Os mini-cards sao EXPANDIDOS:
 * mostram os alunos com os mesmos 3 botoes (Presente/Falta/Justif.) da visao
 * Dia, para que a equipe possa fazer a chamada sem trocar de aba.
 */
export function ChamadaSemana({
  data,
  unidadeId,
  salvando,
  onRegistrar,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDia,
  onAbrirDrawer,
}: Props) {
  const inicio = useMemo(() => {
    const d = parseISO(data);
    return startOfWeek(d, { weekStartsOn: 1 });
  }, [data]);

  // Segunda a sabado (6 dias) — domingo removido: a escola nao tem aula.
  const dias = useMemo(
    () => Array.from({ length: 6 }, (_, i) => format(addDays(inicio, i), 'yyyy-MM-dd')),
    [inicio],
  );

  const hoje = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {dias.map((dia) => (
        <ColunaDia
          key={dia}
          dia={dia}
          unidadeId={unidadeId}
          ehHoje={dia === hoje}
          ehSelecionado={dia === data}
          salvando={salvando}
          onRegistrar={onRegistrar}
          onJustificar={onJustificar}
          onCancelarAula={onCancelarAula}
          onReagendarAula={onReagendarAula}
          onAbrirDia={() => onAbrirDia(dia)}
          onAbrirDrawer={(aula) => onAbrirDrawer(aula, dia)}
        />
      ))}
    </div>
  );
}

function ColunaDia({
  dia,
  unidadeId,
  ehHoje,
  ehSelecionado,
  salvando,
  onRegistrar,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDia,
  onAbrirDrawer,
}: {
  dia: string;
  unidadeId: string | null;
  ehHoje: boolean;
  ehSelecionado: boolean;
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDia: () => void;
  onAbrirDrawer: (aula: AulaAgenda) => void;
}) {
  const { aulas, carregando } = useAgendaDia({ data: dia, unidadeId });
  const agora = useMemo(() => new Date(), []);
  const dataObj = parseISO(dia);

  const totalAulas = aulas.length;
  const concluidas = aulas.filter((a) => chamadaCompleta(a, dia, agora)).length;
  const pendencias = useMemo(() => {
    let count = 0;
    for (const aula of aulas) {
      if (aula.cancelada) continue;
      if (!aulaJaOcorreu(dia, aula.hora_fim, agora)) continue;
      for (const aluno of aula.alunos) {
        if (aluno.aluno_id != null && alunoSemDestino(aula, aluno, dia, agora)) count++;
      }
    }
    return count;
  }, [aulas, dia, agora]);

  const rotuloDia = format(dataObj, 'EEE', { locale: ptBR }).replace('-feira', '');
  const numDia = format(dataObj, 'd');

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-slate-800/20',
        ehSelecionado ? 'border-cyan-500/50' : 'border-slate-700/50',
        ehHoje && !ehSelecionado && 'border-emerald-500/30',
      )}
    >
      <button
        type="button"
        onClick={onAbrirDia}
        className="flex items-center justify-between border-b border-slate-700/40 px-3 py-2 text-left"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotuloDia}</p>
          <p className={cn('text-lg font-bold', ehHoje ? 'text-emerald-400' : 'text-slate-200')}>{numDia}</p>
        </div>
        <div className="text-right text-[10px] text-slate-500">
          {totalAulas > 0 ? (
            <>
              <p>
                <b className="text-emerald-400">{concluidas}</b>/{totalAulas} ok
              </p>
              {pendencias > 0 && <p className="text-amber-400">{pendencias} pend.</p>}
            </>
          ) : (
            <p>—</p>
          )}
        </div>
      </button>

      <div className="flex-1 space-y-2 p-2">
        {carregando ? (
          <p className="py-4 text-center text-[10px] text-slate-600">Carregando…</p>
        ) : aulas.length === 0 ? (
          <p className="py-4 text-center text-[10px] text-slate-600">
            <CalendarX className="mx-auto mb-1 h-4 w-4" />
            Sem aulas
          </p>
        ) : (
          aulas
            .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
            .map((aula) => (
              <CardAulaSemana
                key={aula.chave}
                aula={aula}
                dia={dia}
                agora={agora}
                salvando={salvando}
                onRegistrar={onRegistrar}
                onJustificar={onJustificar}
                onCancelarAula={onCancelarAula}
                onReagendarAula={onReagendarAula}
                onAbrirDrawer={() => onAbrirDrawer(aula)}
              />
            ))
        )}
      </div>
    </div>
  );
}

const ESTILO_BOTAO: Record<'presente' | 'falta' | 'justif', { ativo: string; idle: string }> = {
  presente: {
    ativo: 'bg-emerald-500/10 text-emerald-400 shadow-[inset_0_0_0_1.5px_currentColor]',
    idle: 'text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400',
  },
  falta: {
    ativo: 'bg-rose-500/10 text-rose-400 shadow-[inset_0_0_0_1.5px_currentColor]',
    idle: 'text-slate-500 hover:bg-rose-500/10 hover:text-rose-400',
  },
  justif: {
    ativo: 'bg-amber-500/10 text-amber-400 shadow-[inset_0_0_0_1.5px_currentColor]',
    idle: 'text-slate-500 hover:bg-amber-500/10 hover:text-amber-400',
  },
};

function CardAulaSemana({
  aula,
  dia,
  agora,
  salvando,
  onRegistrar,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDrawer,
}: {
  aula: AulaAgenda;
  dia: string;
  agora: Date;
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDrawer: () => void;
}) {
  const vinculados = aula.alunos.filter((a) => a.aluno_id != null);
  const contagens = vinculados.reduce(
    (acc, a) => {
      acc[estadoDoAluno(a)] += 1;
      return acc;
    },
    { presente: 0, falta: 0, falta_justificada: 0, indeterminado: 0 } as Record<string, number>,
  );
  const completa = chamadaCompleta(aula, dia, agora);
  const ocorrida = aulaJaOcorreu(dia, aula.hora_fim, agora);
  const podeOperar = !aula.cancelada && vinculados.length > 0;

  const marcar = (aluno: AlunoAgenda, status: 'presente' | 'falta') => {
    if (!aluno.aula_emusys_id || !aluno.aluno_id) return;
    onRegistrar([{ aula_emusys_id: aluno.aula_emusys_id, aluno_id: aluno.aluno_id, status }]);
  };

  const todosPresentes = () => {
    if (!podeOperar) return;
    onRegistrar(
      vinculados
        .filter((a) => a.aula_emusys_id && a.aluno_id)
        .map((a) => ({ aula_emusys_id: a.aula_emusys_id!, aluno_id: a.aluno_id!, status: 'presente' as const })),
    );
  };

  return (
    <div
      className={cn(
        'rounded-lg border px-2 py-1.5 transition-colors',
        aula.cancelada
          ? 'border-rose-500/30 bg-rose-500/5'
          : contagens.indeterminado > 0 && ocorrida
            ? 'border-amber-500/40 bg-amber-500/5'
            : completa && vinculados.length > 0
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-slate-700/40 bg-slate-800/30',
      )}
    >
      {/* Cabecalho do card: horario + status + acoes de aula */}
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onAbrirDrawer}
          className="flex min-w-0 items-center gap-1.5 text-left"
          aria-label={`Abrir detalhes de ${aula.turma_nome || aula.curso_nome || 'aula'}`}
        >
          <span className="text-[11px] font-bold text-slate-200">{aula.hora_inicio}</span>
          {aula.cancelada ? (
            <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
          ) : completa && vinculados.length > 0 ? (
            <Check className="h-3 w-3 shrink-0 text-emerald-400" />
          ) : ocorrida && contagens.indeterminado > 0 ? (
            <Clock className="h-3 w-3 shrink-0 text-amber-400" />
          ) : null}
        </button>
        {podeOperar && (
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              disabled={salvando}
              onClick={todosPresentes}
              className="rounded px-1 py-0.5 text-[8.5px] font-semibold text-slate-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400 disabled:opacity-50"
              title="Marcar todos presentes"
            >
              Todos P
            </button>
            <button
              type="button"
              onClick={() => onReagendarAula(aula)}
              className="rounded px-1 py-0.5 text-[8.5px] font-semibold text-slate-500 transition-colors hover:bg-amber-500/10 hover:text-amber-400"
              title="Reagendar aula"
            >
              Reag.
            </button>
            <button
              type="button"
              onClick={() => onCancelarAula(aula)}
              className="rounded px-1 py-0.5 text-[8.5px] font-semibold text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              title="Cancelar aula"
            >
              Canc.
            </button>
          </div>
        )}
      </div>

      <p className="mt-0.5 truncate text-[10px] text-slate-400">
        {aula.professor_nome ?? '—'}
      </p>
      <p className="truncate text-[10px] text-slate-500">{aula.curso_nome}</p>

      {/* Lista de alunos com botoes — igual a visao Dia, mas compacta */}
      {vinculados.length > 0 && !aula.cancelada && (
        <ul className="mt-1.5 space-y-1">
          {vinculados.map((aluno) => {
            const estado = estadoDoAluno(aluno);
            const semVinculo = !aluno.aula_emusys_id || !aluno.aluno_id;
            return (
              <li key={`${aluno.aula_emusys_id}-${aluno.aluno_id}`} className="space-y-0.5">
                <button
                  type="button"
                  onClick={onAbrirDrawer}
                  className="block w-full truncate text-left text-[10.5px] font-medium text-slate-300 hover:text-white"
                  title={aluno.nome}
                >
                  {aluno.nome}
                </button>
                {!semVinculo && (
                  <div className="flex gap-0.5" role="group" aria-label={`Destino de ${aluno.nome}`}>
                    <BotaoSemana
                      estado={estado}
                      alvo="presente"
                      disabled={salvando}
                      onClick={() => marcar(aluno, 'presente')}
                    >
                      <Check className="inline h-2.5 w-2.5" />P
                    </BotaoSemana>
                    <BotaoSemana
                      estado={estado}
                      alvo="falta"
                      disabled={salvando}
                      onClick={() => marcar(aluno, 'falta')}
                    >
                      <X className="inline h-2.5 w-2.5" />F
                    </BotaoSemana>
                    <BotaoSemana
                      estado={estado}
                      alvo="justif"
                      disabled={salvando}
                      onClick={() => onJustificar(aluno, aula)}
                    >
                      <FileText className="inline h-2.5 w-2.5" />J
                    </BotaoSemana>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Aula cancelada: mostrar motivo resumido */}
      {aula.cancelada && aula.cancelada_motivo && (
        <p className="mt-1 truncate text-[9.5px] italic text-rose-300/70" title={aula.cancelada_motivo}>
          {aula.cancelada_motivo}
        </p>
      )}
    </div>
  );
}

function BotaoSemana({
  estado,
  alvo,
  disabled,
  onClick,
  children,
}: {
  estado: EstadoChamada;
  alvo: 'presente' | 'falta' | 'justif';
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const ativo =
    (alvo === 'presente' && estado === 'presente') ||
    (alvo === 'falta' && estado === 'falta') ||
    (alvo === 'justif' && estado === 'falta_justificada');
  const estilo = ESTILO_BOTAO[alvo];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex-1 rounded py-0.5 text-[9px] font-bold transition-all hover:-translate-y-px disabled:opacity-50',
        ativo ? estilo.ativo : estilo.idle,
      )}
    >
      {children}
    </button>
  );
}
