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
 * Card compacto de presenca do professor. A identificacao abre o ajuste fino
 * por aula; Presente e Ausente sao comandos explicitos para o dia inteiro.
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
  const decisaoDia = adaptarPresencaProfessorCanonica({
    professorId,
    aulaIds: aulas.flatMap((aula) => aula.aula_ids),
    envelope: presenca,
  });
  const horarioDecisao = decisaoDia.decididoEm
    ? new Date(decisaoDia.decididoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const estadoLeitura = decisaoDia.estado === 'dados_desatualizados'
    ? 'Dados de leitura desatualizados'
    : decisaoDia.estado === 'roster_em_revisao'
      ? 'Roster em revisão'
      : decisaoDia.estado === 'indeterminado'
        ? 'Não marcado'
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

  async function marcarDia(novoPresente: boolean) {
    if (salvando) return;
    if (!user?.id) {
      toast.error('Sessão inválida', {
        description: 'Entre novamente para registrar a chamada.',
      });
      return;
    }
    const trava = adquirirTravaDoDia(user.id);
    if (!trava) return;
    setSalvando(true);
    const virandoParaAusente = !novoPresente;
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

  async function marcarAula(aula: AulaAgenda, novoPresente: boolean) {
    if (salvandoAula) return;
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
    if (salvando) return;
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
      {/* Card compacto com navegacao e comandos independentes. */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border p-3 transition-all',
          presente === true
            ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'
            : presente === false
              ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15'
              : 'border-slate-700 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60',
        )}
      >
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          aria-label={`Abrir ajuste por aula de ${professorNome}`}
        >
          {/* Foto */}
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full border-2 border-slate-600 object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-700 text-xs font-bold text-slate-300">
              {inicial}
            </span>
          )}

          {/* Nome + grade */}
          <span className="min-w-0 flex-1">
            <span className={cn(
              'block truncate text-sm font-semibold',
              presente === true ? 'text-emerald-200' : presente === false ? 'text-rose-200' : 'text-slate-200',
            )}>
              {professorNome}
            </span>
            <span className="block text-[11px] text-slate-400">
              {primeiraAula} — {ultimaAula} · {totalAulas} {totalAulas === 1 ? 'aula' : 'aulas'}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-slate-500">
              {estadoLeitura ?? rotuloPresencaFonte(decisaoDia.fonte)}
              {horarioDecisao ? ` · ${horarioDecisao}` : ''}
              {decisaoDia.requestId ? ` · recibo ${decisaoDia.reciboStatus ?? 'recebido'}` : ''}
            </span>
            <span className="block truncate text-[9px] text-slate-600">
              Regra {decisaoDia.regraVersao} · sincronizado {decisaoDia.sincronizadoEm ?? 'sem horário'}
            </span>
          </span>
        </button>

        {/* Ações explícitas do dia — nenhuma leitura ambígua vira toggle. */}
        <div className="flex shrink-0 flex-col gap-1" role="group" aria-label={`Presença de ${professorNome} no dia`}>
          <button
            type="button"
            aria-pressed={presente === true}
            onClick={(e) => { e.stopPropagation(); marcarDia(true); }}
            disabled={salvando}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors',
              presente === true
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-emerald-500/40 hover:text-emerald-300',
              salvando && 'opacity-50',
            )}
          >
            {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Presente
          </button>
          <button
            type="button"
            aria-pressed={presente === false}
            onClick={(e) => { e.stopPropagation(); marcarDia(false); }}
            disabled={salvando}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors',
              presente === false
                ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-rose-500/40 hover:text-rose-300',
              salvando && 'opacity-50',
            )}
          >
            <XCircle className="h-3 w-3" />
            Ausente
          </button>
        </div>
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
                    disabled={salvando}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    Todas presentes
                  </button>
                  <button
                    type="button"
                    onClick={() => marcarTodasAulas(false)}
                    disabled={salvando}
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
                    ? 'Dados de leitura desatualizados'
                    : decisaoAula.estado === 'roster_em_revisao'
                      ? 'Roster em revisão'
                      : decisaoAula.estado === 'indeterminado'
                        ? 'Não marcado'
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
                      <div
                        className="flex items-center gap-1.5"
                        role="group"
                        aria-label={`Presença na aula das ${aula.hora_inicio}`}
                      >
                        <button
                          type="button"
                          aria-pressed={presenteAula}
                          onClick={() => marcarAula(aula, true)}
                          disabled={salvandoAula === aulaId}
                          className={cn(
                            'flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                            presenteAula
                              ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                              : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-emerald-500/40 hover:text-emerald-300',
                            salvandoAula === aulaId && 'opacity-50',
                          )}
                        >
                          {salvandoAula === aulaId
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Presente
                        </button>
                        <button
                          type="button"
                          aria-pressed={ausenteAula}
                          onClick={() => marcarAula(aula, false)}
                          disabled={salvandoAula === aulaId}
                          className={cn(
                            'flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                            ausenteAula
                              ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                              : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-rose-500/40 hover:text-rose-300',
                            salvandoAula === aulaId && 'opacity-50',
                          )}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Ausente
                        </button>
                      </div>
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
