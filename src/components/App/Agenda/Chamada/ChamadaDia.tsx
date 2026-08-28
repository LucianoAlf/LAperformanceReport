import { useMemo, useState } from 'react';
import { CalendarX, User } from 'lucide-react';
import type { AulaAgenda, LeadExperimentalAgenda } from '@/hooks/useAgendaDia';
import { useAuth } from '@/contexts/AuthContext';
import { useOutletContext } from 'react-router-dom';
import { chamadaCompleta, estadoDoAluno } from './chamadaUtils';
import { ChamadaAulaBloco } from './ChamadaAulaBloco';
import { AlertaPendencias } from './AlertaPendencias';
import { ProfessorPresencaToggle } from './ProfessorPresencaToggle';
import type { ItemChamada } from './useChamadaAcoes';
import type { AlunoAgenda } from '@/hooks/useAgendaDia';
import { cn } from '@/lib/utils';

interface OutletContext {
  unidadeSelecionada: string | null;
}

interface Props {
  data: string;
  aulas: AulaAgenda[];
  salvando: boolean;
  onRegistrar: (itens: ItemChamada[]) => void;
  onRegistrarExperimental: (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou') => void;
  onJustificar: (aluno: AlunoAgenda, aula: AulaAgenda) => void;
  onCancelarAula: (aula: AulaAgenda) => void;
  onReagendarAula: (aula: AulaAgenda) => void;
  onAbrirDrawer: (aula: AulaAgenda) => void;
  onAbrirDrawerLead: (lead: LeadExperimentalAgenda, aula: AulaAgenda) => void;
  recarregar?: () => void;
}

/**
 * Visao Dia da chamada. Cada aula do dia vira um bloco com acoes de nivel
 * aula (todos presentes, reagendar, cancelar) e os cards de nivel aluno.
 *
 * Pendencias (alunos sem destino em aulas ja ocorridas) ficam em banner no
 * topo: e o "digest" pedindo atencao da equipe, sem precisar de cron.
 */
export function ChamadaDia({
  data,
  aulas,
  salvando,
  onRegistrar,
  onRegistrarExperimental,
  onJustificar,
  onCancelarAula,
  onReagendarAula,
  onAbrirDrawer,
  onAbrirDrawerLead,
  recarregar,
}: Props) {
  const { hasPermission, user } = useAuth();
  const podeOperar = hasPermission('agenda.chamada');
  const agora = useMemo(() => new Date(), []);
  const context = useOutletContext<OutletContext | undefined>();
  const consolidado = !context?.unidadeSelecionada;
  const [filtroExperimental, setFiltroExperimental] = useState<'todas' | 'regulares' | 'experimentais'>('todas');
  const [processandoProfessores, setProcessandoProfessores] = useState(false);

  const ordenadas = useMemo(
    () => [...aulas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
    [aulas],
  );

  // Marca todos os professores como presentes ou ausentes de uma vez
  async function marcarTodosProfessores(presente: boolean) {
    if (processandoProfessores) return;
    const { supabase } = await import('@/lib/supabase');
    const { toast } = await import('sonner');
    const unidadeId = context?.unidadeSelecionada;
    if (!unidadeId) return;
    if (!user?.id) {
      toast.error('Sessão inválida', {
        description: 'Entre novamente para registrar a chamada.',
      });
      return;
    }

    const {
      adquirirTravaPresenca,
      chaveDoPedido,
      chaveTravaProfessorDia,
      descreverErrosDoRecibo,
      encerrarIntencaoProfessorPendente,
      falhaEhRespostaInvalida,
      interpretarEEncerrarPedido,
      listarIntencoesProfessorPendentes,
      mensagemDeErro,
      reconciliarIntencoesPendentes,
      reciboAplicouAlteracao,
      reservarIntencaoProfessorPendente,
      requestIdDoPedido,
    } = await import('@/lib/presencaRecibo');

    let chaveTrava: string;
    let liberarTrava: (() => void) | null;
    try {
      chaveTrava = chaveTravaProfessorDia(user.id, unidadeId, data);
      liberarTrava = adquirirTravaPresenca(chaveTrava);
    } catch (e) {
      toast.error('Não foi possível preparar o pedido.', { description: mensagemDeErro(e) });
      return;
    }
    if (!liberarTrava) {
      toast.info('Outra alteração de presença de professor está em andamento; aguarde.');
      return;
    }

    setProcessandoProfessores(true);
    try {
      let resumoPendente;
      try {
        resumoPendente = await reconciliarIntencoesPendentes(
          listarIntencoesProfessorPendentes(chaveTrava),
          (requestId) => supabase.rpc('app_status_comando_presenca_v1', {
            p_request_id: requestId,
          }),
          (intencao) => encerrarIntencaoProfessorPendente(
            chaveTrava,
            intencao.chavePedido,
            intencao.requestId,
          ),
        );
      } catch (e) {
        toast.error('Não foi possível consultar o resultado; tente novamente.', {
          description: mensagemDeErro(e),
        });
        return;
      }
      if (resumoPendente.aplicados > 0) {
        toast.info('Uma marcação anterior foi confirmada.', {
          description: resumoPendente.falhas.length > 0
            ? 'Os dados aplicados foram atualizados; outro pedido ainda não pôde ser consultado.'
            : 'Os dados foram atualizados. Revise o estado antes de alterar novamente.',
        });
        recarregar?.();
        return;
      }
      if (resumoPendente.falhas.length > 0) {
        toast.error('Não foi possível consultar o resultado; tente novamente.', {
          description: resumoPendente.falhas.map((falha) => falha.mensagem).join('; '),
        });
        return;
      }
      if (resumoPendente.pendentes > 0) {
        toast.info('Pedido recebido; aguardando confirmação.', {
          description: `${resumoPendente.pendentes} pedido(s) ainda em processamento.`,
        });
        return;
      }

      let sucessos = 0;
      let semAlteracao = 0;
      let aplicadosConcluidos = 0;
      let rejeitadosConcluidos = 0;
      let parciais = 0;
      let aplicadosParciais = 0;
      let rejeitadosParciais = 0;
      let errosTerminais = 0;
      let rejeitadosTerminais = 0;
      let naoRecebidos = 0;
      let pendentes = 0;
      let falhasPreparacao = 0;
      let falhasConsulta = 0;
      let respostasInvalidas = 0;
      let conflitosPendentes = 0;
      const detalhesParciais: string[] = [];
      const detalhesTerminais: string[] = [];
      const detalhesPreparacao: string[] = [];
      const detalhesConsulta: string[] = [];
      const detalhesInvalidos: string[] = [];
      const detalhesConflitos: string[] = [];
      const direcao = presente ? 'presente' : 'ausente';

      for (const [professorId, { nome }] of aulasPorProfessor) {
        // Um pedido por professor: cada linha tem desfecho próprio no ledger.
        const payload = {
          professorId,
          data,
          unidadeId,
          ausente: !presente,
        };

        let pedido: { chave: string; requestId: string };
        try {
          const chave = chaveDoPedido(user.id, 'professor_dia', payload);
          const requestId = requestIdDoPedido(chave);
          const reserva = reservarIntencaoProfessorPendente(
            chaveTrava,
            chave,
            requestId,
            direcao,
          );
          if (reserva.ok === false) {
            conflitosPendentes++;
            detalhesConflitos.push(
              `${nome}: existe marcação como ${reserva.direcaoPendente} aguardando confirmação`,
            );
            break;
          }
          pedido = { chave, requestId };
        } catch (e) {
          falhasPreparacao++;
          detalhesPreparacao.push(`${nome}: ${mensagemDeErro(e)}`);
          continue;
        }

        const { chave, requestId } = pedido;
        let recibo: unknown;
        try {
          const resposta = presente
            ? await supabase.rpc('app_registrar_presenca_professor_dia', {
                p_professor_id: professorId,
                p_data: data,
                p_unidade_id: unidadeId,
                p_hora_chegada: null,
                p_hora_saida: null,
                p_request_id: requestId,
              })
            : await supabase.rpc('app_remover_presenca_professor_dia', {
                p_professor_id: professorId,
                p_data: data,
                p_unidade_id: unidadeId,
                p_request_id: requestId,
              });
          if (resposta.error) throw resposta.error;
          recibo = resposta.data;
        } catch (e) {
          falhasConsulta++;
          detalhesConsulta.push(`${nome}: ${mensagemDeErro(e)}`);
          continue;
        }

        let resultado;
        try {
          resultado = interpretarEEncerrarPedido(chave, requestId, recibo);
          if (resultado.status !== 'recebido' && resultado.status !== 'processando') {
            encerrarIntencaoProfessorPendente(chaveTrava, chave, requestId);
          }
        } catch (e) {
          if (falhaEhRespostaInvalida(e)) {
            respostasInvalidas++;
            detalhesInvalidos.push(`${nome}: ${mensagemDeErro(e)}`);
          } else {
            falhasConsulta++;
            detalhesConsulta.push(`${nome}: ${mensagemDeErro(e)}`);
          }
          continue;
        }

        if (resultado.status === 'concluido') {
          if (!reciboAplicouAlteracao(resultado)) {
            semAlteracao++;
            continue;
          }
          sucessos++;
          aplicadosConcluidos += resultado.aplicados;
          rejeitadosConcluidos += resultado.rejeitados;
          continue;
        }

        if (resultado.status === 'parcial') {
          parciais++;
          aplicadosParciais += resultado.aplicados;
          rejeitadosParciais += resultado.rejeitados;
          const codigos = resultado.erros.map((erro) => erro.codigo).join(', ');
          detalhesParciais.push(`${nome}: ${codigos} — ${descreverErrosDoRecibo(resultado)}`);
          continue;
        }

        if (resultado.status === 'falhou') {
          errosTerminais++;
          rejeitadosTerminais += resultado.rejeitados;
          const codigos = resultado.erros.map((erro) => erro.codigo).join(', ');
          detalhesTerminais.push(`${nome}: ${codigos} — ${descreverErrosDoRecibo(resultado)}`);
          continue;
        }

        if (resultado.status === 'nao_recebido') {
          naoRecebidos++;
          continue;
        }

        if (resultado.status === 'recebido' || resultado.status === 'processando') {
          pendentes++;
        }
      }

      if (sucessos > 0) {
        toast.success(`${sucessos} pedido(s) concluído(s)`, {
          description: `${aplicadosConcluidos} aplicado(s), ${rejeitadosConcluidos} rejeitado(s).`,
        });
      }
      if (semAlteracao > 0) {
        toast.warning('Pedido concluído sem alteração.', {
          description: `${semAlteracao} professor(es) sem presença aplicada.`,
        });
      }
      if (parciais > 0) {
        toast.warning(`${parciais} pedido(s) parcialmente concluído(s)`, {
          description: `${aplicadosParciais} aplicado(s), ${rejeitadosParciais} rejeitado(s): ${detalhesParciais.join('; ')}`,
        });
      }
      if (errosTerminais > 0) {
        toast.error(`${errosTerminais} pedido(s) com falha canônica`, {
          description: `${rejeitadosTerminais} rejeitado(s): ${detalhesTerminais.join('; ')}`,
        });
      }
      if (naoRecebidos > 0) {
        toast.warning('Pedido não recebido; tente novamente.', {
          description: `${naoRecebidos} professor(es) sem pedido recebido.`,
        });
      }
      if (pendentes > 0) {
        toast.info('Pedido recebido; aguardando confirmação.', {
          description: `${pendentes} professor(es) ainda em processamento.`,
        });
      }
      if (falhasPreparacao > 0) {
        toast.error('Não foi possível preparar o pedido.', {
          description: `${falhasPreparacao} professor(es); nenhuma RPC enviada: ${detalhesPreparacao.join('; ')}`,
        });
      }
      if (falhasConsulta > 0) {
        toast.error('Não foi possível consultar o resultado; tente novamente.', {
          description: `${falhasConsulta} professor(es): ${detalhesConsulta.join('; ')}`,
        });
      }
      if (respostasInvalidas > 0) {
        toast.error('Resposta inválida; pedido preservado para nova tentativa.', {
          description: `${respostasInvalidas} professor(es): ${detalhesInvalidos.join('; ')}`,
        });
      }
      if (conflitosPendentes > 0) {
        toast.warning('Existe uma alteração oposta aguardando confirmação.', {
          description: detalhesConflitos.join('; '),
        });
      }

      toast.info('Resumo do lote de professores', {
        description: [
          `${sucessos} concluído(s) com aplicação`,
          `${semAlteracao} concluído(s) sem alteração`,
          `${parciais} parcial(is)`,
          `${errosTerminais} falha(s) terminal(is)`,
          `${naoRecebidos} não recebido(s)`,
          `${pendentes} pendente(s)`,
          `${falhasPreparacao} falha(s) de preparação`,
          `${falhasConsulta} falha(s) de consulta`,
          `${respostasInvalidas} resposta(s) inválida(s)`,
          `${conflitosPendentes} conflito(s) pendente(s)`,
        ].join(', '),
      });

      if (sucessos > 0 || parciais > 0) recarregar?.();
    } finally {
      setProcessandoProfessores(false);
      liberarTrava();
    }
  }

  // Filtro: separar experimental de regular
  const filtradas = useMemo(() => {
    if (filtroExperimental === 'regulares') return ordenadas.filter((a) => a.categoria !== 'experimental');
    if (filtroExperimental === 'experimentais') return ordenadas.filter((a) => a.categoria === 'experimental');
    return ordenadas;
  }, [ordenadas, filtroExperimental]);

  const totalAulas = filtradas.length;
  const aulasConcluidas = filtradas.filter((a) => chamadaCompleta(a, data, agora)).length;

  // Agrupa aulas por professor para o toggle de presenca.
  // Aula cancelada NAO entra: a RPC de presenca pula canceladas, e ler o
  // professor_presenca de uma cancelada (que fica 'ausente' por default do
  // Emusys) deixava o card vermelho mesmo depois de marcar presente — caso
  // real do Pedro em 12/08 (aula das 17:00 cancelada escondia o presente).
  const aulasPorProfessor = useMemo(() => {
    const mapa = new Map<number, { nome: string; fotoUrl: string | null; aulas: AulaAgenda[]; presente: boolean | null; primeira: string; ultima: string }>();
    for (const aula of filtradas) {
      if (aula.professor_id == null) continue;
      if (aula.cancelada) continue;
      const existente = mapa.get(aula.professor_id);
      if (existente) {
        existente.aulas.push(aula);
        if (aula.hora_inicio < existente.primeira) existente.primeira = aula.hora_inicio;
        if (aula.hora_fim > existente.ultima) existente.ultima = aula.hora_fim;
      } else {
        const presente = aula.professor_presenca === 'presente'
          ? true
          : aula.professor_presenca === 'ausente'
            ? false
            : null;
        mapa.set(aula.professor_id, {
          nome: aula.professor_nome ?? 'Professor',
          fotoUrl: aula.professor_foto_url ?? null,
          aulas: [aula],
          presente,
          primeira: aula.hora_inicio,
          ultima: aula.hora_fim,
        });
      }
    }
    return Array.from(mapa.entries()).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [filtradas]);

  if (ordenadas.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 p-12 text-center">
        <CalendarX className="mx-auto mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm text-slate-400">Nenhuma aula neste dia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alerta de pendências — ao vivo, separado por hoje/ontem, clicável */}
      <AlertaPendencias
        data={data}
        aulas={ordenadas}
        consolidado={consolidado}
        unidadeId={context?.unidadeSelecionada ?? null}
        onAbrirDrawer={onAbrirDrawer}
      />

      {/* Presenca dos professores — toggle por professor para o dia inteiro */}
      {podeOperar && aulasPorProfessor.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Presença dos professores</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => marcarTodosProfessores(true)}
                disabled={processandoProfessores}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                Todos presentes
              </button>
              <button
                type="button"
                onClick={() => marcarTodosProfessores(false)}
                disabled={processandoProfessores}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              >
                Todos ausentes
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {aulasPorProfessor.map(([professorId, { nome, fotoUrl, aulas: aulasProf, presente, primeira, ultima }]) => (
              <ProfessorPresencaToggle
                key={professorId}
                professorId={professorId}
                professorNome={nome}
                fotoUrl={fotoUrl}
                data={data}
                unidadeId={context?.unidadeSelecionada ?? ''}
                aulas={aulasProf}
                primeiraAula={primeira}
                ultimaAula={ultima}
                presente={presente}
                onMudou={() => recarregar?.()}
              />
            ))}
          </div>
        </div>
      )}

      {/* Progresso + Filtro — juntos, acima dos cards de aula */}
      <div className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-2.5 text-xs text-slate-400">
        <span>
          <b className="text-slate-200">{aulasConcluidas}</b> de <b className="text-slate-200">{totalAulas}</b> aulas com chamada completa
          {filtroExperimental !== 'todas' && (
            <span className="ml-1 text-slate-500">
              ({filtroExperimental === 'regulares' ? 'regulares' : 'experimentais'})
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mostrar:</span>
          <button
            type="button"
            onClick={() => setFiltroExperimental(filtroExperimental === 'todas' ? 'regulares' : 'todas')}
            className={cn(
              'rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors',
              filtroExperimental !== 'experimentais'
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200',
            )}
          >
            Regulares
          </button>
          <button
            type="button"
            onClick={() => setFiltroExperimental(filtroExperimental === 'experimentais' ? 'todas' : 'experimentais')}
            className={cn(
              'rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors',
              filtroExperimental === 'experimentais'
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200',
            )}
          >
            <User className="mr-0.5 inline h-3 w-3" />
            Experimentais
          </button>
          <span className="ml-2 text-slate-500">
            {filtradas.filter((a) => a.cancelada).length} cancelada(s)
          </span>
        </div>
      </div>

      {/* Blocos de aula em ordem de horario */}
      <div className="space-y-3">
        {filtradas.map((aula) => (
          <ChamadaAulaBloco
            key={aula.chave}
            aula={aula}
            data={data}
            podeOperar={podeOperar}
            salvando={salvando}
            onMarcar={(aluno, status) =>
              onRegistrar([
                {
                  aula_emusys_id: aluno.aula_emusys_id!,
                  aluno_id: aluno.aluno_id!,
                  status,
                },
              ])
            }
            onMarcarExperimental={onRegistrarExperimental}
            onJustificar={(aluno) => onJustificar(aluno, aula)}
            onTodosPresentes={(a) => onRegistrarTodosPresentes(a, onRegistrar)}
            onCancelarAula={onCancelarAula}
            onReagendarAula={onReagendarAula}
            onAbrirDrawer={onAbrirDrawer}
            onAbrirDrawerLead={onAbrirDrawerLead}
          />
        ))}
      </div>
    </div>
  );
}

/** Marca todos os alunos vinculados como presentes em um unico lote. */
function onRegistrarTodosPresentes(aula: AulaAgenda, onRegistrar: (itens: ItemChamada[]) => void) {
  const itens: ItemChamada[] = aula.alunos
    .filter((a) => a.aluno_id != null && a.aula_emusys_id != null && estadoDoAluno(a) !== 'presente')
    .map((a) => ({
      aula_emusys_id: a.aula_emusys_id!,
      aluno_id: a.aluno_id!,
      status: 'presente' as const,
    }));
  if (itens.length > 0) onRegistrar(itens);
}
