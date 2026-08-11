import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarX,
  Check,
  Clock,
  FileText,
  GraduationCap,
  History,
  MapPin,
  Paperclip,
  RotateCcw,
  User,
  X,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { AulaAgenda, AlunoAgenda } from '@/hooks/useAgendaDia';
import { aulaJaOcorreu } from '@/lib/agenda';
import { estadoDoAluno, rotuloOrigem, temConflito, type EstadoChamada } from './chamadaUtils';
import type { ItemChamada } from './useChamadaAcoes';
import { cn } from '@/lib/utils';

interface Props {
  aula: AulaAgenda | null;
  data: string;
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onFechar: () => void;
}

interface Retificacao {
  id: number;
  status_anterior: string | null;
  status_novo: string;
  motivo: string | null;
  autor_nome: string | null;
  criada_em: string;
}

/**
 * Drawer de chamada: abre como modal lateral (não como painel fixo da grade,
 * que e papel do AgendaDrawer na visao Professores/Salas). Mostra tudo da
 * aula + histórico de retificações para auditoria.
 */
export function ChamadaDrawer({ aula, data, salvando, onRegistrar, onJustificar, onCancelarAula, onReagendarAula, onFechar }: Props) {
  return (
    <Dialog open={aula != null} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className="z-[110] max-w-none border-slate-700 bg-[#0c1220] p-0 sm:max-w-[480px]"
        overlayClassName="z-[110] bg-black/60 backdrop-blur-sm"
      >
        <DialogTitle className="sr-only">Detalhes da aula</DialogTitle>
        {aula && (
          <ConteudoDrawer
            aula={aula}
            data={data}
            salvando={salvando}
            onRegistrar={onRegistrar}
            onJustificar={onJustificar}
            onCancelarAula={onCancelarAula}
            onReagendarAula={onReagendarAula}
            onFechar={onFechar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConteudoDrawer({
  aula,
  data,
  salvando,
  onRegistrar,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onFechar,
}: {
  aula: AulaAgenda;
  data: string;
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onFechar: () => void;
}) {
  const jaOcorreu = aulaJaOcorreu(data, aula.hora_fim, new Date());
  const vinculados = aula.alunos.filter((a) => a.aluno_id != null);
  const [retificacoes, setRetificacoes] = useState<Retificacao[]>([]);
  const [carregandoRetif, setCarregandoRetif] = useState(false);

  // Retificacoes sao por aula_emusys_id. Em turma, cada aluno tem a sua linha,
  // entao buscamos por todos os IDs do slot. A migration 20260811130200
  // liberou leitura escopada para o perfil operacional.
  useEffect(() => {
    if (aula.aula_ids.length === 0) return;
    let cancelado = false;
    setCarregandoRetif(true);
    (async () => {
      const { data: rows, error } = await supabase
        .from('aluno_presenca_retificacoes')
        .select('id, status_anterior, status_novo, motivo, autor_nome, criada_em')
        .in('aula_emusys_id', aula.aula_ids)
        .order('criada_em', { ascending: false })
        .limit(50);
      if (cancelado) return;
      if (!error) setRetificacoes((rows ?? []) as unknown as Retificacao[]);
      setCarregandoRetif(false);
    })();
    return () => { cancelado = true; };
  }, [aula.aula_ids]);

  return (
    <div className="flex max-h-[90vh] flex-col">
      {/* Cabeçalho */}
      <header className="flex items-start justify-between gap-3 border-b border-slate-700/50 p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Clock className="h-3 w-3" />
            {aula.hora_inicio}–{aula.hora_fim} · {aula.duracao_minutos} min
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            {aula.turma_nome || aula.curso_nome || 'Aula'}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {aula.cancelada && (
              <Tag cor="rose" icon={<CalendarX className="h-3 w-3" />}>Cancelada</Tag>
            )}
            {aula.reagendada && (
              <Tag cor="sky" icon={<RotateCcw className="h-3 w-3" />}>Reagendada</Tag>
            )}
            {aula.justificada && !aula.cancelada && (
              <Tag cor="amber">Justificada (Emusys)</Tag>
            )}
            {aula.tipo === 'turma' && <Tag cor="slate">Turma — {vinculados.length} alunos</Tag>}
            {aula.categoria && <Tag cor="slate">{aula.categoria}</Tag>}
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Ações de aula — reagendar e cancelar. So fazem sentido em aula nao
          cancelada. O cancelamento abre modal (motivo obrigatorio); o
          reagendamento hoje e orientacao operacional (Fase 1). */}
      {!aula.cancelada && vinculados.length > 0 && (
        <div className="flex gap-2 border-b border-slate-700/40 px-5 py-2.5">
          <button
            type="button"
            disabled={salvando}
            onClick={() => onReagendarAula(aula)}
            className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reagendar
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => onCancelarAula(aula)}
            className="flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancelar aula
          </button>
        </div>
      )}

      {/* Corpo */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Metadados da aula */}
        <section className="grid grid-cols-2 gap-3 text-xs">
          <Meta icon={<User className="h-3.5 w-3.5" />} rotulo="Professor" valor={aula.professor_nome ?? '—'} />
          <Meta icon={<MapPin className="h-3.5 w-3.5" />} rotulo="Sala" valor={aula.sala_nome ?? '—'} />
          <Meta icon={<GraduationCap className="h-3.5 w-3.5" />} rotulo="Curso" valor={aula.curso_nome ?? '—'} />
          <Meta icon={<Building2 className="h-3.5 w-3.5" />} rotulo="Unidade" valor={aula.unidade_nome} />
        </section>

        {/* Motivo do cancelamento */}
        {aula.cancelada && aula.cancelada_motivo && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-300">Motivo do cancelamento</p>
            <p className="mt-1 text-sm text-rose-100">{aula.cancelada_motivo}</p>
            <p className="mt-1 text-[10px] text-rose-300/70">
              Origem: {aula.cancelada_origem === 'agenda_secretaria' ? 'Secretaria (Agenda)' : 'Emusys'}
            </p>
          </div>
        )}

        {/* Aula original (reagendada) */}
        {aula.reagendada && aula.hora_original && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-200">
            <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" />
            Aula reagendada — horário original: <b>{aula.hora_original}</b>
          </div>
        )}

        {/* Alunos */}
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Alunos ({vinculados.length})
          </p>
          {vinculados.length === 0 ? (
            <p className="text-xs text-slate-500">Sem alunos vinculados.</p>
          ) : (
            <ul className="space-y-1.5">
              {vinculados.map((aluno) => (
                <LinhaAlunoDrawer
                  key={`${aluno.aula_emusys_id}-${aluno.aluno_id}`}
                  aluno={aluno}
                  aula={aula}
                  salvando={salvando}
                  podeOperar={!aula.cancelada && jaOcorreu}
                  onMarcar={(al, status) => {
                    if (!al.aula_emusys_id || !al.aluno_id) return;
                    onRegistrar([{ aula_emusys_id: al.aula_emusys_id, aluno_id: al.aluno_id, status }]);
                  }}
                  onJustificar={(al) => onJustificar(al, aula)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Histórico de retificações */}
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <History className="h-3.5 w-3.5" />
            Histórico de retificações
          </p>
          {carregandoRetif ? (
            <p className="text-xs text-slate-500">Carregando…</p>
          ) : retificacoes.length === 0 ? (
            <p className="text-xs text-slate-600">Nenhuma retificação registrada.</p>
          ) : (
            <ul className="space-y-1.5">
              {retificacoes.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-300">
                      {r.status_anterior ?? '—'} → <span className="text-cyan-300">{r.status_novo}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(r.criada_em).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {r.motivo && <p className="mt-0.5 text-slate-400">“{r.motivo}”</p>}
                  {r.autor_nome && <p className="mt-0.5 text-[10px] text-slate-500">por {r.autor_nome}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {!jaOcorreu && (
          <p className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-2.5 text-[11px] text-slate-500">
            A aula ainda não ocorreu — a chamada pode ser registrada a partir de {aula.hora_inicio}.
          </p>
        )}
      </div>
    </div>
  );
}

function LinhaAlunoDrawer({
  aluno,
  aula,
  salvando,
  podeOperar,
  onMarcar,
  onJustificar,
}: {
  aluno: AlunoAgenda;
  aula: AulaAgenda;
  salvando: boolean;
  podeOperar: boolean;
  onMarcar: (aluno: AlunoAgenda, status: 'presente' | 'falta') => void;
  onJustificar: (aluno: AlunoAgenda) => void;
}) {
  const estado = estadoDoAluno(aluno);
  const conflito = temConflito(aluno);
  const semVinculo = !aluno.aula_emusys_id || !aluno.aluno_id;
  const cor: Record<EstadoChamada, string> = {
    presente: 'text-emerald-400',
    falta: 'text-rose-400',
    falta_justificada: 'text-amber-400',
    indeterminado: 'text-slate-500',
  };
  const rotulo: Record<EstadoChamada, string> = {
    presente: 'Presente',
    falta: 'Falta',
    falta_justificada: 'Falta justificada',
    indeterminado: 'Sem destino',
  };

  return (
    <li className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-2.5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-200">{aluno.nome}</p>
          {aluno.nr_da_aula != null && aluno.qtd_aulas_contrato != null && (
            <p className="text-[10px] text-slate-500">
              Aula {aluno.nr_da_aula} de {aluno.qtd_aulas_contrato}
              {aluno.aluno_novo && ' · aluno novo'}
            </p>
          )}
        </div>
        <span className={cn('text-xs font-semibold', cor[estado])}>{rotulo[estado]}</span>
      </div>

      {/* Botoes de chamada — iguais ao card da visao Dia. So em aula que ja
          ocorreu e nao esta cancelada, e quando o aluno tem vinculo real. */}
      {podeOperar && !semVinculo && (
        <div className="mt-2 flex gap-1" role="group" aria-label={`Destino de ${aluno.nome}`}>
          <button
            type="button"
            disabled={salvando}
            onClick={() => onMarcar(aluno, 'presente')}
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
            onClick={() => onMarcar(aluno, 'falta')}
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
            onClick={() => onJustificar(aluno)}
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

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
        <span>Origem: {rotuloOrigem(aluno.respondido_por)}</span>
        {aluno.emusys_presenca_bruta && (
          <span>Emusys: {aluno.emusys_presenca_bruta}</span>
        )}
        {aluno.risco_pct != null && (
          <span className={aluno.risco_pct >= 40 ? 'text-amber-400' : ''}>
            Risco: {aluno.risco_pct}%
          </span>
        )}
        {(aluno.reposicoes_pendentes ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 text-amber-400">
            <RotateCcw className="h-3 w-3" />
            {aluno.reposicoes_pendentes} reposição(ões) pendente(s)
          </span>
        )}
      </div>

      {aluno.justificada_motivo && (
        <p className="mt-1.5 text-[11px] text-slate-400">
          <b className="text-amber-300">Motivo:</b> {aluno.justificada_motivo}
          {aluno.justificada_evidencia && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-300">
              <Paperclip className="h-3 w-3" /> com evidência
            </span>
          )}
        </p>
      )}

      {conflito && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          Conflito: Emusys registrou “{aluno.emusys_presenca_bruta}”; resposta humana prevalece.
        </p>
      )}
    </li>
  );
}

function Meta({ icon, rotulo, valor }: { icon: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}
        {rotulo}
      </p>
      <p className="mt-0.5 truncate text-slate-200">{valor}</p>
    </div>
  );
}

function Tag({ cor, icon, children }: { cor: 'rose' | 'sky' | 'amber' | 'slate'; icon?: React.ReactNode; children: React.ReactNode }) {
  const cores = {
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    slate: 'border-slate-600/40 bg-slate-700/30 text-slate-300',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold', cores[cor])}>
      {icon}
      {children}
    </span>
  );
}
