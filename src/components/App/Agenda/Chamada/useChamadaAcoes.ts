import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  adquirirTravaPresenca,
  chaveDoPedido,
  chaveTravaChamadaAlunos,
  descreverErrosDoRecibo,
  encerrarIntencaoAlunosPendente,
  falhaEhRespostaInvalida,
  interpretarEEncerrarPedido,
  listarIntencoesAlunosPendentes,
  mensagemDeErro,
  reconciliarIntencoesPendentes,
  reciboAplicouAlteracao,
  reservarIntencaoAlunosPendente,
  requestIdDoPedido,
} from '@/lib/presencaRecibo';

/**
 * Acoes da chamada (Fase 2, spec 2026-08-11). Todas passam pelas RPCs
 * security definer que validam a permissao `agenda.chamada` por unidade.
 * Nada aqui escreve direto em tabela.
 *
 * Desde 27/08 a chamada leva `p_request_id` e o banco devolve um RECIBO
 * (Checkpoint 4 do rollout de presenca canonica): quem pediu fica gravado e
 * cada aluno tem desfecho proprio. Ver `@/lib/presencaRecibo`.
 */

export interface ItemChamada {
  aula_emusys_id: number;
  aluno_id: number;
  status: 'presente' | 'falta' | 'falta_justificada' | 'indeterminado';
  motivo?: string;
  evidencia_path?: string;
}

/** Upload de evidencia (atestado, comunicado) no bucket privado. */
export async function uploadEvidencia(arquivo: File, aulaId: number, alunoId?: number): Promise<string> {
  const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'bin';
  const alvo = alunoId != null ? `aluno-${alunoId}` : 'aula';
  const caminho = `aula-${aulaId}/${alvo}/${Date.now()}.${extensao}`;

  const { error } = await supabase.storage
    .from('presenca-evidencias')
    .upload(caminho, arquivo, { cacheControl: '3600', upsert: false });

  if (error) throw new Error(`Falha no upload da evidência: ${error.message}`);
  return caminho;
}

export function useChamadaAcoes(aoConcluir: () => void) {
  const { user } = useAuth();
  const [salvando, setSalvando] = useState(false);

  const registrar = useCallback(
    async (itens: ItemChamada[]): Promise<boolean> => {
      if (itens.length === 0) return true;
      if (!user?.id) {
        toast.error('Sessão inválida', {
          description: 'Entre novamente para registrar a chamada.',
        });
        return false;
      }

      let liberarTrava: (() => void) | null;
      try {
        liberarTrava = adquirirTravaPresenca(chaveTravaChamadaAlunos(user.id));
      } catch (e) {
        toast.error('Não foi possível preparar o pedido', { description: mensagemDeErro(e) });
        return false;
      }
      if (!liberarTrava) {
        toast.info('Outra chamada está em andamento; aguarde.');
        return false;
      }

      // Mesma intenção => mesmo id enquanto o banco não responder, para o
      // retry do usuário não virar uma segunda chamada aos olhos do ledger.
      setSalvando(true);
      try {
        let resumo;
        try {
          const intencoesPendentes = listarIntencoesAlunosPendentes(user.id, itens);
          resumo = await reconciliarIntencoesPendentes(
            intencoesPendentes,
            (requestId) => supabase.rpc('app_status_comando_presenca_v1', {
              p_request_id: requestId,
            }),
            (intencao) => encerrarIntencaoAlunosPendente(
              user.id,
              intencao.chavePedido,
              intencao.requestId,
            ),
          );
        } catch (e) {
          toast.error('Não foi possível consultar o resultado; tente novamente.', {
            description: mensagemDeErro(e),
          });
          return false;
        }
        if (resumo.aplicados > 0) {
          toast.info('A marcação anterior foi confirmada.', {
            description: resumo.falhas.length > 0
              ? 'Os dados aplicados foram atualizados; outro pedido ainda não pôde ser consultado.'
              : 'Os dados foram atualizados. Revise o estado antes de alterar novamente.',
          });
          aoConcluir();
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

        const chave = chaveDoPedido(user.id, 'chamada', itens);
        const requestId = requestIdDoPedido(chave);
        const reserva = reservarIntencaoAlunosPendente(user.id, itens, chave, requestId);
        if (reserva.ok === false) {
          toast.warning('Existe uma alteração anterior aguardando confirmação.', {
            description: `${reserva.alvosEmConflito} aluno(s) desta ação ainda têm um pedido pendente. Repita primeiro a marcação anterior.`,
          });
          return false;
        }
        let data: unknown;
        try {
          const resposta = await supabase.rpc('app_registrar_chamada_agenda', {
            p_itens: itens,
            p_request_id: requestId,
          });
          if (resposta.error) throw resposta.error;
          data = resposta.data;
        } catch (e) {
          // A requisição pode ter chegado ao banco. O pedido permanece na
          // carteira para que a tentativa seguinte reutilize o mesmo id.
          toast.error('Não foi possível consultar o resultado; tente novamente.', {
            description: mensagemDeErro(e),
          });
          return false;
        }

        let recibo: ReturnType<typeof interpretarEEncerrarPedido>;
        try {
          recibo = interpretarEEncerrarPedido(chave, requestId, data);
          if (recibo.status !== 'recebido' && recibo.status !== 'processando') {
            encerrarIntencaoAlunosPendente(user.id, chave, requestId);
          }
        } catch (e) {
          // Resposta sem contrato verificável não autoriza limpar a intenção.
          const detalhe = mensagemDeErro(e);
          if (falhaEhRespostaInvalida(e)) {
            toast.error('Resposta inválida; pedido preservado para nova tentativa.', {
              description: detalhe,
            });
          } else {
            toast.error('Não foi possível consultar o resultado; tente novamente.', {
              description: detalhe,
            });
          }
          return false;
        }

        const houveAplicacao = reciboAplicouAlteracao(recibo);

        if (recibo.status === 'nao_recebido') {
          toast.error('Pedido não recebido; tente novamente.');
          return false;
        }

        if (recibo.status === 'recebido' || recibo.status === 'processando') {
          toast.info('Pedido recebido; aguardando confirmação.');
          return false;
        }

        if (recibo.status === 'falhou') {
          toast.error('Não foi possível registrar', {
            description: descreverErrosDoRecibo(recibo, { comAluno: true }),
          });
          return false;
        }

        if (recibo.status === 'concluido' && !houveAplicacao) {
          toast.warning('Pedido concluído sem alteração.', {
            description: 'Nenhuma presença ou falta foi aplicada.',
          });
          return false;
        }

        if (recibo.status === 'parcial') {
          toast.warning('Chamada parcialmente registrada', {
            description: [
              `Aplicados: ${recibo.aplicados}; rejeitados: ${recibo.rejeitados}.`,
              descreverErrosDoRecibo(recibo, { comAluno: true }),
            ].join(' '),
          });
        } else {
          // Quando todos os itens são 'indeterminado', a operação é um
          // "desmarcar" (toggle) — não faz sentido dizer "Chamada registrada".
          const todosIndeterminado = itens.every((i) => i.status === 'indeterminado');
          toast.success(todosIndeterminado ? 'Marcação removida' : 'Chamada registrada', {
            description: `Aplicados: ${recibo.aplicados}; rejeitados: ${recibo.rejeitados}.`,
          });
        }
        aoConcluir();
        return houveAplicacao;
      } catch (e) {
        // Falha antes do transporte (por exemplo, sessionStorage bloqueado):
        // nenhuma RPC foi enviada e a tela não fica presa em loading.
        toast.error('Não foi possível preparar o pedido', {
          description: mensagemDeErro(e),
        });
        return false;
      } finally {
        setSalvando(false);
        liberarTrava();
      }
    },
    [aoConcluir, user?.id],
  );

  const cancelarAula = useCallback(
    async (params: {
      aulaEmusysId: number;
      motivo: string;
      evidenciaPath?: string;
      escopo?: 'aula' | 'unidade_dia';
    }): Promise<boolean> => {
      setSalvando(true);
      try {
        const { data, error } = await supabase.rpc('app_cancelar_aula', {
          p_aula_emusys_id: params.aulaEmusysId,
          p_motivo: params.motivo,
          p_evidencia_path: params.evidenciaPath ?? null,
          p_escopo: params.escopo ?? 'aula',
        });
        if (error) throw error;

        const resultado = data as { aulas_canceladas: number; creditos_gerados: number };
        toast.success(
          params.escopo === 'unidade_dia'
            ? `Dia cancelado: ${resultado.aulas_canceladas} aulas, ${resultado.creditos_gerados} créditos de reposição`
            : `Aula cancelada — ${resultado.creditos_gerados} crédito(s) de reposição gerado(s)`,
        );
        aoConcluir();
        return true;
      } catch (e) {
        toast.error('Não foi possível cancelar', {
          description: mensagemDeErro(e),
        });
        return false;
      } finally {
        setSalvando(false);
      }
    },
    [aoConcluir],
  );

  const registrarPresencaExperimental = useCallback(
    async (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou'): Promise<boolean> => {
      setSalvando(true);
      try {
        const { error } = await supabase.rpc('app_registrar_presenca_experimental', {
          p_experimental_id: experimentalId,
          p_status: status,
        });
        if (error) throw error;
        toast.success(status === 'experimental_realizada' ? 'Presença registrada' : 'Falta registrada');
        aoConcluir();
        return true;
      } catch (e) {
        toast.error('Não foi possível registrar', {
          description: mensagemDeErro(e),
        });
        return false;
      } finally {
        setSalvando(false);
      }
    },
    [aoConcluir],
  );

  return { salvando, registrar, cancelarAula, registrarPresencaExperimental };
}
