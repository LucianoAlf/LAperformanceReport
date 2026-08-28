import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AulaAgenda, PresencaEnvelopeAgenda } from '@/hooks/useAgendaDia';
import { useAuth } from '@/contexts/AuthContext';
import { adaptarPresencaProfessorCanonica, rotuloPresencaFonte } from '@/lib/presencaCanonica';
import {
  adquirirTravaPresenca,
  chaveDoPedido,
  chaveTravaProfessorDia,
  descreverErro,
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
  type ReciboPresenca,
} from '@/lib/presencaRecibo';

/**
 * Mantem a diferenca entre uma falha de transporte e uma resposta invalida.
 * Nos dois casos o `request_id` continua guardado para um retry idempotente.
 */
async function consultarRecibo(
  operacao: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ ok: true; recibo: unknown } | { ok: false }> {
  try {
    const { data, error } = await operacao();
    if (error) throw error;
    return { ok: true, recibo: data };
  } catch (e) {
    toast.error('Não foi possível consultar o resultado; tente novamente.', {
      description: mensagemDeErro(e),
    });
    return { ok: false };
  }
}

function notificarFalhaDeRecibo(e: unknown): void {
  const detalhe = mensagemDeErro(e);
  if (falhaEhRespostaInvalida(e)) {
    toast.error('Resposta inválida; pedido preservado para nova tentativa.', { description: detalhe });
  } else {
    toast.error('Não foi possível consultar o resultado; tente novamente.', { description: detalhe });
  }
}

function descreverItensRejeitados(recibo: ReciboPresenca): string {
  const itens = recibo.erros.map((erro, indice) => {
    const alvo = erro.professor_id != null
      ? `professor ${erro.professor_id}`
      : erro.aluno_id != null
        ? `aluno ${erro.aluno_id}`
        : `item ${indice + 1}`;
    return `${alvo}: ${descreverErro(erro.codigo)} (${erro.codigo})`;
  });
  return `Aplicados: ${recibo.aplicados}; rejeitados: ${recibo.rejeitados}. ${itens.join('; ')}`;
}

/** Retorna `true` somente quando a tela deve recarregar os dados aplicados. */
function notificarRecibo(recibo: ReciboPresenca, mensagemSucesso: string): boolean {
  switch (recibo.status) {
    case 'concluido':
      if (!reciboAplicouAlteracao(recibo)) {
        toast.warning('Pedido concluído sem alteração.', {
          description: 'Nenhuma presença de professor foi aplicada.',
        });
        return false;
      }
      toast.success(mensagemSucesso, {
        description: `Aplicados: ${recibo.aplicados}; rejeitados: ${recibo.rejeitados}.`,
      });
      return true;
    case 'parcial':
      toast.warning('Alteração parcialmente aplicada', {
        description: descreverItensRejeitados(recibo),
      });
      return true;
    case 'falhou':
      toast.error('Não foi possível alterar', {
        description: descreverErrosDoRecibo(recibo),
      });
      return false;
    case 'nao_recebido':
      toast.error('Não foi possível alterar', {
        description: 'Pedido não recebido; tente novamente.',
      });
      return false;
    case 'recebido':
    case 'processando':
      toast.warning('Alteração pendente', {
        description: 'Pedido recebido; aguardando confirmação.',
      });
      return false;
  }
}

interface Props {
  professorId: number;
  professorNome: string;
  fotoUrl: string | null;
  data: string;
  unidadeId: string;
  aulas: AulaAgenda[];
  primeiraAula: string;
  ultimaAula: string;
  presente: boolean | null;
  presenca: PresencaEnvelopeAgenda;
  onMudou: () => void;
}

/**
 * Card compacto de presenca do professor. Clica para abrir modal com ajuste
 * fino por aula. O botao de status faz toggle do dia inteiro.
 */
export function ProfessorPresencaToggle({
  professorId,
  professorNome,
  fotoUrl,
  data,
  unidadeId,
  aulas,
  primeiraAula,
  ultimaAula,
  presente,
  presenca,
  onMudou,
}: Props) {
  const { user } = useAuth();
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvandoAula, setSalvandoAula] = useState<number | null>(null);

  const totalAulas = aulas.length;
  const presencaBloqueada = presenca.dados_status !== 'atualizados';
  const decisaoDia = adaptarPresencaProfessorCanonica({
    professorId,
    aulaIds: aulas.flatMap((aula) => aula.aula_ids),
    envelope: presenca,
  });
  const horarioDecisao = decisaoDia.decididoEm
    ? new Date(decisaoDia.decididoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const estadoAuditoria = decisaoDia.estado === 'dados_desatualizados'
    ? 'Dados desatualizados'
    : decisaoDia.estado === 'indeterminado' || decisaoDia.estado === 'roster_em_revisao'
      ? 'Em auditoria'
      : null;

  function adquirirTravaDoDia(usuarioId: string): { chave: string; liberar: () => void } | null {
    try {
      const chave = chaveTravaProfessorDia(usuarioId, unidadeId, data);
      const liberar = adquirirTravaPresenca(chave);
      if (!liberar) {
        toast.info('Outra alteração de presença de professor está em andamento; aguarde.');
        return null;
      }
      return { chave, liberar };
    } catch (e) {
      toast.error('Não foi possível preparar o pedido', { description: mensagemDeErro(e) });
      return null;
    }
  }

  async function reconciliarPendenciasDoDia(chaveTrava: string): Promise<boolean> {
    try {
      const resumo = await reconciliarIntencoesPendentes(
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
      if (resumo.aplicados > 0) {
        toast.info('A marcação anterior foi confirmada.', {
          description: resumo.falhas.length > 0
            ? 'Os dados aplicados foram atualizados; outro pedido ainda não pôde ser consultado.'
            : 'Os dados foram atualizados. Revise o estado antes de alterar novamente.',
        });
        onMudou();
        return false;
      }
      if (resumo.falhas.length > 0) {
        toast.error('Não foi possível consultar o resultado; tente novamente.', {
          description: resumo.falhas.map((falha) => falha.mensagem).join('; '),
        });
        return false;
      }
      if (resumo.pendentes > 0) {
        toast.info('Pedido recebido; aguardando confirmação.');
        return false;
      }
      return true;
    } catch (e) {
      toast.error('Não foi possível consultar o resultado; tente novamente.', {
        description: mensagemDeErro(e),
      });
      return false;
    }
  }

  async function toggleDia() {
    if (salvando || presencaBloqueada) return;
    if (!user?.id) {
      toast.error('Sessão inválida', {
        description: 'Entre novamente para registrar a chamada.',
      });
      return;
    }
    const trava = adquirirTravaDoDia(user.id);
    if (!trava) return;
    setSalvando(true);
    const virandoParaAusente = presente === true;
    try {
      if (!(await reconciliarPendenciasDoDia(trava.chave))) return;
      const payload = {
        professorId,
        data,
        unidadeId,
        ausente: virandoParaAusente,
      };
      const chave = chaveDoPedido(user.id, 'professor_dia', payload);
      const requestId = requestIdDoPedido(chave);
      const reserva = reservarIntencaoProfessorPendente(
        trava.chave,
        chave,
        requestId,
        virandoParaAusente ? 'ausente' : 'presente',
      );
      if (reserva.ok === false) {
        toast.warning('Existe uma alteração oposta aguardando confirmação.', {
          description: `Confirme primeiro a marcação como ${reserva.direcaoPendente}.`,
        });
        return;
      }
      const consulta = await consultarRecibo(() => (
        virandoParaAusente
          ? supabase.rpc('app_remover_presenca_professor_dia', {
            p_professor_id: professorId,
            p_data: data,
            p_unidade_id: unidadeId,
            p_request_id: requestId,
          })
          : supabase.rpc('app_registrar_presenca_professor_dia', {
            p_professor_id: professorId,
            p_data: data,
            p_unidade_id: unidadeId,
            p_hora_chegada: null,
            p_hora_saida: null,
            p_request_id: requestId,
          })
      ));
      if (!consulta.ok) return;
      const recibo = consulta.recibo;

      let resultado: ReciboPresenca;
      try {
        resultado = interpretarEEncerrarPedido(chave, requestId, recibo);
        if (resultado.status !== 'recebido' && resultado.status !== 'processando') {
          encerrarIntencaoProfessorPendente(trava.chave, chave, requestId);
        }
      } catch (e) {
        notificarFalhaDeRecibo(e);
        return;
      }

      if (notificarRecibo(
        resultado,
        `${professorNome} marcado como ${virandoParaAusente ? 'ausente' : 'presente'}`,
      )) {
        onMudou();
      }
    } catch (e) {
      toast.error('Não foi possível preparar o pedido', { description: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
      trava.liberar();
    }
  }

  async function toggleAula(aula: AulaAgenda) {
    if (salvandoAula || presencaBloqueada) return;
    if (!user?.id) {
      toast.error('Sessão inválida', {
        description: 'Entre novamente para registrar a chamada.',
      });
      return;
    }
    const aulaId = aula.aula_ids[0];
    if (!aulaId) return;
    const trava = adquirirTravaDoDia(user.id);
    if (!trava) return;
    setSalvandoAula(aulaId);
    const decisaoAtual = adaptarPresencaProfessorCanonica({
      professorId,
      aulaIds: aula.aula_ids,
      envelope: presenca,
    });
    const novoPresente = decisaoAtual.estado !== 'presente';
    try {
      if (!(await reconciliarPendenciasDoDia(trava.chave))) return;
      const payload = { aulaId, novoPresente };
      const chave = chaveDoPedido(user.id, 'professor_aula', payload);
      const requestId = requestIdDoPedido(chave);
      const reserva = reservarIntencaoProfessorPendente(
        trava.chave,
        chave,
        requestId,
        novoPresente ? 'presente' : 'ausente',
      );
      if (reserva.ok === false) {
        toast.warning('Existe uma alteração oposta aguardando confirmação.', {
          description: `Confirme primeiro a marcação como ${reserva.direcaoPendente}.`,
        });
        return;
      }
      // RPC security definer — UPDATE direto falhava por RLS (aulas_emusys so tem SELECT)
      const consulta = await consultarRecibo(() => supabase.rpc('app_marcar_presenca_professor_aula', {
        p_aula_emusys_id: aulaId,
        p_presente: novoPresente,
        p_request_id: requestId,
      }));
      if (!consulta.ok) return;
      const recibo = consulta.recibo;

      let resultado: ReciboPresenca;
      try {
        resultado = interpretarEEncerrarPedido(chave, requestId, recibo);
        if (resultado.status !== 'recebido' && resultado.status !== 'processando') {
          encerrarIntencaoProfessorPendente(trava.chave, chave, requestId);
        }
      } catch (e) {
        notificarFalhaDeRecibo(e);
        return;
      }

      if (notificarRecibo(
        resultado,
        `${professorNome} ${novoPresente ? 'presente' : 'ausente'} na aula das ${aula.hora_inicio}`,
      )) {
        onMudou();
      }
    } catch (e) {
      toast.error('Não foi possível preparar o pedido', { description: mensagemDeErro(e) });
    } finally {
      setSalvandoAula(null);
      trava.liberar();
    }
  }

  async function marcarTodasAulas(presenteAula: boolean) {
    if (salvando || presencaBloqueada) return;
    if (!user?.id) {
      toast.error('Sessão inválida', {
        description: 'Entre novamente para registrar a chamada.',
      });
      return;
    }
    const trava = adquirirTravaDoDia(user.id);
    if (!trava) return;
    setSalvando(true);
    try {
      if (!(await reconciliarPendenciasDoDia(trava.chave))) return;
      const payload = {
        professorId,
        data,
        unidadeId,
        ausente: !presenteAula,
      };
      const chave = chaveDoPedido(user.id, 'professor_dia', payload);
      const requestId = requestIdDoPedido(chave);
      const reserva = reservarIntencaoProfessorPendente(
        trava.chave,
        chave,
        requestId,
        presenteAula ? 'presente' : 'ausente',
      );
      if (reserva.ok === false) {
        toast.warning('Existe uma alteração oposta aguardando confirmação.', {
          description: `Confirme primeiro a marcação como ${reserva.direcaoPendente}.`,
        });
        return;
      }
      const consulta = await consultarRecibo(() => (
        presenteAula
          ? supabase.rpc('app_registrar_presenca_professor_dia', {
            p_professor_id: professorId,
            p_data: data,
            p_unidade_id: unidadeId,
            p_hora_chegada: null,
            p_hora_saida: null,
            p_request_id: requestId,
          })
          : supabase.rpc('app_remover_presenca_professor_dia', {
            p_professor_id: professorId,
            p_data: data,
            p_unidade_id: unidadeId,
            p_request_id: requestId,
          })
      ));
      if (!consulta.ok) return;
      const recibo = consulta.recibo;

      let resultado: ReciboPresenca;
      try {
        resultado = interpretarEEncerrarPedido(chave, requestId, recibo);
        if (resultado.status !== 'recebido' && resultado.status !== 'processando') {
          encerrarIntencaoProfessorPendente(trava.chave, chave, requestId);
        }
      } catch (e) {
        notificarFalhaDeRecibo(e);
        return;
      }

      if (notificarRecibo(
        resultado,
        `${professorNome} — todas as aulas ${presenteAula ? 'presentes' : 'ausentes'}`,
      )) {
        onMudou();
      }
    } catch (e) {
      toast.error('Não foi possível preparar o pedido', { description: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
      trava.liberar();
    }
  }

  const inicial = professorNome
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      {/* Card compacto — clicavel para abrir modal */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setModalAberto(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') setModalAberto(true); }}
        className={cn(
          'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all',
          presente === true
            ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'
            : presente === false
              ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15'
              : 'border-slate-700 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60',
        )}
      >
        {/* Foto */}
        {fotoUrl ? (
          <img
            src={fotoUrl}
            alt={professorNome}
            className="h-10 w-10 shrink-0 rounded-full border-2 border-slate-600 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-700 text-xs font-bold text-slate-300">
            {inicial}
          </div>
        )}

        {/* Nome + grade */}
        <div className="min-w-0 flex-1">
          <p className={cn(
            'truncate text-sm font-semibold',
            presente === true ? 'text-emerald-200' : presente === false ? 'text-rose-200' : 'text-slate-200',
          )}>
            {professorNome}
          </p>
          <p className="text-[11px] text-slate-400">
            {primeiraAula} — {ultimaAula} · {totalAulas} {totalAulas === 1 ? 'aula' : 'aulas'}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {estadoAuditoria ?? rotuloPresencaFonte(decisaoDia.fonte)}
            {horarioDecisao ? ` · ${horarioDecisao}` : ''}
            {decisaoDia.requestId ? ` · recibo ${decisaoDia.reciboStatus ?? 'recebido'}` : ''}
          </p>
          <p className="truncate text-[9px] text-slate-600">
            Regra {decisaoDia.regraVersao} · sincronizado {decisaoDia.sincronizadoEm ?? 'sem horário'}
          </p>
        </div>

        {/* Toggle do dia — stopPropagation para nao abrir modal */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleDia(); }}
          disabled={salvando || presencaBloqueada}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all',
            presente === true
              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
              : presente === false
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70',
            (salvando || presencaBloqueada) && 'opacity-50',
          )}
        >
          {salvando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : presente === true ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : presente === false ? (
            <XCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {presente === true ? 'Presente' : presente === false ? 'Ausente' : 'Marcar'}
        </button>
      </div>

      {/* Modal com ajuste fino por aula */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="z-[110] max-w-none border-slate-700 bg-[#0c1220] p-0 sm:max-w-[480px]">
          <DialogTitle className="sr-only">Presenca de {professorNome}</DialogTitle>
          <div className="flex max-h-[80vh] flex-col">
            {/* Cabecalho do modal */}
            <header className="border-b border-slate-700/50 p-5">
              <div className="flex items-center gap-3">
                {fotoUrl ? (
                  <img
                    src={fotoUrl}
                    alt={professorNome}
                    className="h-12 w-12 rounded-full border-2 border-slate-600 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-700 text-sm font-bold text-slate-300">
                    {inicial}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-white">{professorNome}</h2>
                  <p className="text-xs text-slate-400">
                    {primeiraAula} — {ultimaAula} · {totalAulas} {totalAulas === 1 ? 'aula' : 'aulas'}
                  </p>
                </div>
              </div>
            </header>

            {/* Lista de aulas */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Ajuste fino por aula
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => marcarTodasAulas(true)}
                    disabled={salvando || presencaBloqueada}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    Todas presentes
                  </button>
                  <button
                    type="button"
                    onClick={() => marcarTodasAulas(false)}
                    disabled={salvando || presencaBloqueada}
                    className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    Todas ausentes
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {aulas.map((aula) => {
                  const aulaId = aula.aula_ids[0];
                  const decisaoAula = adaptarPresencaProfessorCanonica({
                    professorId,
                    aulaIds: aula.aula_ids,
                    envelope: presenca,
                  });
                  const presenteAula = decisaoAula.estado === 'presente';
                  const ausenteAula = decisaoAula.estado === 'ausente';
                  const horarioAula = decisaoAula.decididoEm
                    ? new Date(decisaoAula.decididoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : null;
                  const rotuloEstadoAula = decisaoAula.estado === 'dados_desatualizados'
                    ? 'Dados desatualizados'
                    : decisaoAula.estado === 'indeterminado' || decisaoAula.estado === 'roster_em_revisao'
                      ? 'Em auditoria'
                      : rotuloPresencaFonte(decisaoAula.fonte);
                  return (
                    <div
                      key={aula.chave}
                      className="flex items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2.5"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-slate-400">{aula.hora_inicio}</span>
                          <span className="font-medium text-slate-200">{aula.curso_nome}</span>
                          <span className="text-slate-500">{aula.sala_nome}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {rotuloEstadoAula}
                          {horarioAula ? ` · ${horarioAula}` : ''}
                          {decisaoAula.requestId ? ` · recibo ${decisaoAula.reciboStatus ?? 'recebido'}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleAula(aula)}
                        disabled={salvandoAula === aulaId || presencaBloqueada}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                          presenteAula
                            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                            : ausenteAula
                              ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                              : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70',
                          (salvandoAula === aulaId || presencaBloqueada) && 'opacity-50',
                        )}
                      >
                        {salvandoAula === aulaId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : presenteAula ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : ausenteAula ? (
                          <XCircle className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {presenteAula ? 'Presente' : ausenteAula ? 'Ausente' : rotuloEstadoAula}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
