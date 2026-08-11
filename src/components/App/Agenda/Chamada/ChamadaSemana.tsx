import { useMemo, useState, useCallback as useCb } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarX, Check, Clock, FileText, X, XCircle } from 'lucide-react';
import { useAgendaSemana } from '@/hooks/useAgendaSemana';
import type { AulaAgenda, AlunoAgenda, LeadExperimentalAgenda } from '@/hooks/useAgendaDia';
import { aulaJaOcorreu } from '@/lib/agenda';
import { alunoSemDestino, chamadaCompleta, estadoDoAluno, type EstadoChamada } from './chamadaUtils';
import type { ItemChamada } from './useChamadaAcoes';
import { cn } from '@/lib/utils';

interface Props {
  data: string;
  unidadeId: string | null;
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onRegistrarExperimental: (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou') => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDia: (data: string) => void;
  onAbrirDrawer: (aula: AulaAgenda, data: string) => void;
  onAbrirDrawerLead: (lead: LeadExperimentalAgenda, aula: AulaAgenda) => void;
}

/**
 * Visao Semana: grade segunda->sabado (sem domingo — a escola nao opera).
 * Cada dia carrega seu proprio `useAgendaDia`. Os mini-cards sao EXPANDIDOS:
 * mostram os alunos com os mesmos 3 botoes (Presente/Falta/Justif.) da visao
 * Dia, para que a equipe possa fazer a chamada sem trocar de aba.
 *
 * Apos cada acao (registrar/cancelar/reagendar), as colunas sao remontadas
 * via `contadorRecarga` para buscar dados frescos — o `recarregar` do
 * ChamadaView so recarrega o dia selecionado, nao as colunas da semana.
 */
export function ChamadaSemana({
  data,
  unidadeId,
  salvando,
  onRegistrar,
  onRegistrarExperimental,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDia,
  onAbrirDrawer,
  onAbrirDrawerLead,
}: Props) {
  // Uma unica chamada RPC para a semana inteira (seg-sab).
  // Antes: 6 useAgendaDia separados, 6 chamadas RPC, 6x mais lento.
  const { aulasDoDia, dias, carregando } = useAgendaSemana({ data, unidadeId });

  const hoje = format(new Date(), 'yyyy-MM-dd');

  // Contador de recarga: incrementa apos cada acao para forcar a remontagem
  // das ColunaDia (que faz fetch fresco sem cache stale).
  const [contadorRecarga, setContadorRecarga] = useState(0);
  const forcarRecarga = useCb(() => setContadorRecarga((c) => c + 1), []);

  // Wrappers que chamam a acao e depois forcam recarga da semana inteira.
  const registrarERecarregar = useCb(
    (itens: ItemChamada[]) => {
      onRegistrar(itens);
      forcarRecarga();
    },
    [onRegistrar, forcarRecarga],
  );
  const justificarERecarregar = useCb(
    (aluno: AlunoAgenda, aula: AulaAgenda) => {
      onJustificar(aluno, aula);
      forcarRecarga();
    },
    [onJustificar, forcarRecarga],
  );
  const cancelarERecarregar = useCb(
    (aula: AulaAgenda) => {
      onCancelarAula(aula);
      forcarRecarga();
    },
    [onCancelarAula, forcarRecarga],
  );
  const reagendarERecarregar = useCb(
    (aula: AulaAgenda) => {
      onReagendarAula(aula);
      forcarRecarga();
    },
    [onReagendarAula, forcarRecarga],
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {dias.map((dia) => (
        <ColunaDia
          key={`${dia}-${contadorRecarga}`}
          dia={dia}
          aulas={aulasDoDia(dia)}
          carregando={carregando}
          ehHoje={dia === hoje}
          ehSelecionado={dia === data}
          salvando={salvando}
          onRegistrar={registrarERecarregar}
          onRegistrarExperimental={onRegistrarExperimental}
          onJustificar={justificarERecarregar}
          onCancelarAula={cancelarERecarregar}
          onReagendarAula={reagendarERecarregar}
          onAbrirDia={() => onAbrirDia(dia)}
          onAbrirDrawer={(aula) => onAbrirDrawer(aula, dia)}
          onAbrirDrawerLead={onAbrirDrawerLead}
        />
      ))}
    </div>
  );
}

function ColunaDia({
  dia,
  aulas,
  carregando,
  ehHoje,
  ehSelecionado,
  salvando,
  onRegistrar,
  onRegistrarExperimental,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDia,
  onAbrirDrawer,
  onAbrirDrawerLead,
}: {
  dia: string;
  aulas: AulaAgenda[];
  carregando: boolean;
  ehHoje: boolean;
  ehSelecionado: boolean;
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onRegistrarExperimental: (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou') => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDia: () => void;
  onAbrirDrawer: (aula: AulaAgenda) => void;
  onAbrirDrawerLead: (lead: LeadExperimentalAgenda, aula: AulaAgenda) => void;
}) {
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
                onRegistrarExperimental={onRegistrarExperimental}
                onJustificar={onJustificar}
                onCancelarAula={onCancelarAula}
                onReagendarAula={onReagendarAula}
                onAbrirDrawer={() => onAbrirDrawer(aula)}
                onAbrirDrawerLead={onAbrirDrawerLead}
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
  onRegistrarExperimental,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDrawer,
  onAbrirDrawerLead,
}: {
  aula: AulaAgenda;
  dia: string;
  agora: Date;
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onRegistrarExperimental: (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou') => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDrawer: () => void;
  onAbrirDrawerLead: (lead: LeadExperimentalAgenda, aula: AulaAgenda) => void;
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
  const total = vinculados.length;

  const marcar = (aluno: AlunoAgenda, status: 'presente' | 'falta' | 'indeterminado') => {
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
        'rounded-xl border px-2.5 py-2 transition-all hover:-translate-y-px',
        aula.cancelada
          ? 'border-rose-500/30 bg-rose-500/5 opacity-70'
          : contagens.indeterminado > 0 && ocorrida
            ? 'border-amber-500/40 bg-amber-500/5'
            : completa && total > 0
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-slate-700/40 bg-slate-800/30',
      )}
    >
      {/* Cabeçalho: horário + status + contagens + ações */}
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
          ) : completa && total > 0 ? (
            <Check className="h-3 w-3 shrink-0 text-emerald-400" />
          ) : ocorrida && contagens.indeterminado > 0 ? (
            <Clock className="h-3 w-3 shrink-0 text-amber-400" />
          ) : null}
        </button>

        {/* Contagem compacta: 2P 1F 1J 1? */}
        {total > 0 && !aula.cancelada && (
          <span className="text-[9px] font-semibold text-slate-500">
            {contagens.presente > 0 && <span className="text-emerald-400">{contagens.presente}P</span>}
            {contagens.falta > 0 && <span className="text-rose-400"> {contagens.falta}F</span>}
            {contagens.falta_justificada > 0 && <span className="text-amber-400"> {contagens.falta_justificada}J</span>}
            {contagens.indeterminado > 0 && <span className="text-slate-500"> {contagens.indeterminado}?</span>}
          </span>
        )}
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

      {/* Info da aula */}
      <div className="mt-1 flex items-baseline justify-between gap-1">
        <p className="truncate text-[10px] font-medium text-slate-400">
          {aula.professor_nome ?? '—'}
        </p>
        <p className="truncate text-[9.5px] text-slate-500">{aula.curso_nome}</p>
      </div>

      {/* Lista de alunos com botões — igual a visão Dia, mas compacta */}
      {(total > 0 || (aula.experimental_leads ?? []).length > 0) && !aula.cancelada && (
        <ul className="mt-1.5 space-y-1">
          {vinculados.map((aluno) => {
            const estado = estadoDoAluno(aluno);
            const semVinculo = !aluno.aula_emusys_id || !aluno.aluno_id;
            return (
              <li key={`${aluno.aula_emusys_id}-${aluno.aluno_id}`} className="space-y-0.5">
                <button
                  type="button"
                  onClick={onAbrirDrawer}
                  className="block w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-[10.5px] font-medium text-slate-300 transition-colors hover:bg-slate-700/30 hover:text-white"
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
                      onClick={() => marcar(aluno, estado === 'presente' ? 'indeterminado' : 'presente')}
                    >
                      <Check className="inline h-2.5 w-2.5" />P
                    </BotaoSemana>
                    <BotaoSemana
                      estado={estado}
                      alvo="falta"
                      disabled={salvando}
                      onClick={() => marcar(aluno, estado === 'falta' ? 'indeterminado' : 'falta')}
                    >
                      <X className="inline h-2.5 w-2.5" />F
                    </BotaoSemana>
                    <BotaoSemana
                      estado={estado}
                      alvo="justif"
                      disabled={salvando}
                      onClick={() => {
                        if (estado === 'falta_justificada') {
                          marcar(aluno, 'indeterminado');
                        } else {
                          onJustificar(aluno, aula);
                        }
                      }}
                    >
                      <FileText className="inline h-2.5 w-2.5" />J
                    </BotaoSemana>
                  </div>
                )}
              </li>
            );
          })}
          {(aula.experimental_leads ?? []).map((lead) => {
            const presente = lead.status === 'experimental_realizada';
            const faltou = lead.status === 'experimental_faltou';
            const camposFaltantes: string[] = [];
            if (!lead.curso_interesse_id) camposFaltantes.push('curso');
            if (!lead.telefone) camposFaltantes.push('telefone');
            if (!lead.canal_origem_id) camposFaltantes.push('canal');
            if (!lead.faixa_etaria) camposFaltantes.push('faixa');
            if (!lead.professor_experimental_id) camposFaltantes.push('professor');
            return (
              <li key={`lead-${lead.experimental_id}`} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => onAbrirDrawerLead(lead, aula)}
                  className="block w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-[10.5px] font-medium text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200"
                  title={`${lead.nome} (experimental)`}
                >
                  {lead.nome} <span className="text-[8px] text-violet-400/70">exp.</span>
                </button>
                {camposFaltantes.length > 0 && (
                  <p className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 text-[8px] text-amber-300">
                    <span className="font-bold">!</span>
                    Falta: {camposFaltantes.join(', ')}
                  </p>
                )}
                <div className="flex gap-0.5" role="group" aria-label={`Destino de ${lead.nome}`} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={(e) => { e.stopPropagation(); onRegistrarExperimental(lead.experimental_id, 'experimental_realizada'); }}
                    className={cn(
                      'flex-1 rounded py-0.5 text-[9px] font-bold transition-all hover:-translate-y-px disabled:opacity-50',
                      presente
                        ? 'bg-emerald-500/10 text-emerald-400 shadow-[inset_0_0_0_1.5px_currentColor]'
                        : 'text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400',
                    )}
                  >
                    <Check className="inline h-2.5 w-2.5" />P
                  </button>
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={(e) => { e.stopPropagation(); onRegistrarExperimental(lead.experimental_id, 'experimental_faltou'); }}
                    className={cn(
                      'flex-1 rounded py-0.5 text-[9px] font-bold transition-all hover:-translate-y-px disabled:opacity-50',
                      faltou
                        ? 'bg-rose-500/10 text-rose-400 shadow-[inset_0_0_0_1.5px_currentColor]'
                        : 'text-slate-500 hover:bg-rose-500/10 hover:text-rose-400',
                    )}
                  >
                    <X className="inline h-2.5 w-2.5" />F
                  </button>
                </div>
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
