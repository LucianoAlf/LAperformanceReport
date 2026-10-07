import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { AulaAgenda } from '@/hooks/useAgendaDia';
import { useAuth } from '@/contexts/AuthContext';
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

interface Params {
  professorId: number;
  professorNome: string;
  data: string;
  unidadeId: string;
  /** Chamado quando a escrita foi aplicada e a tela precisa reler os dados. */
  onMudou: () => void;
}

export interface ProfessorPresencaAcoes {
  /** Uma escrita do DIA esta em curso (trava o par Presente/Ausente). */
  salvando: boolean;
  /** Id da aula cuja marcacao individual esta em curso, ou `null`. */
  salvandoAula: number | null;
  marcarDia: (novoPresente: boolean) => Promise<void>;
  marcarTodasAulas: (presenteAula: boolean) => Promise<void>;
  marcarAula: (aula: AulaAgenda, novoPresente: boolean) => Promise<void>;
}

/**
 * A orquestracao de marcar presenca de professor — trava, reconciliacao do
 * pendente, pedido idempotente e leitura do recibo.
 *
 * 🔴 **Nenhuma regra nasce aqui.** `chaveDoPedido`, `requestIdDoPedido`, a
 * trava e a reconciliacao vem de `@/lib/presencaRecibo`; este hook so as
 * encadeia na ordem certa e traduz o recibo em toast. Reimplementar qualquer
 * uma delas daria duas respostas para "qual e o id deste pedido?", e o retry
 * idempotente deixaria de casar com o pedido original.
 *
 * ⚠️ E o caminho de escrita mais usado do sistema (183 marcacoes/dia) e o
 * banco protege a decisao humana por trigger — a flag
 * `app.escrita_humana_aula` e setada pelas proprias RPCs, nao daqui.
 */
export function useProfessorPresenca({
  professorId,
  professorNome,
  data,
  unidadeId,
  onMudou,
}: Params): ProfessorPresencaAcoes {
  const { user } = useAuth();
  const [salvando, setSalvando] = useState(false);
  const [salvandoAula, setSalvandoAula] = useState<number | null>(null);

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

  /**
   * Marca o DIA inteiro do professor.
   *
   * 🔴 Esta funcao nasceu da fusao de `marcarDia` e `marcarTodasAulas`, que
   * eram **identicas byte a byte** no `ProfessorPresencaToggle` (medido em
   * 21/09: mesmo payload `professor_dia`, mesmas duas RPCs, mesma reserva) e
   * diferiam so na string do toast — ~60 linhas duplicadas. O que varia e a
   * mensagem, entao e a mensagem que e parametro; duplicar a orquestracao
   * significaria que um fix de concorrencia precisaria ser aplicado duas vezes
   * e que o dia em que alguem esquecesse a segunda, as duas discordariam sobre
   * a mesma escrita.
   */
  async function marcarDiaInteiro(novoPresente: boolean, mensagemSucesso: string) {
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

      if (notificarRecibo(resultado, mensagemSucesso)) {
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

  return {
    salvando,
    salvandoAula,
    marcarDia: (novoPresente: boolean) => marcarDiaInteiro(
      novoPresente,
      `${professorNome} marcado como ${novoPresente ? 'presente' : 'ausente'}`,
    ),
    marcarTodasAulas: (presenteAula: boolean) => marcarDiaInteiro(
      presenteAula,
      `${professorNome} — todas as aulas ${presenteAula ? 'presentes' : 'ausentes'}`,
    ),
    marcarAula,
  };
}
