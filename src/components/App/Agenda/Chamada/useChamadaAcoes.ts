import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  chaveDoPedido,
  descreverErrosDoRecibo,
  encerrarPedido,
  interpretarRecibo,
  mensagemDeErro,
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
  const [salvando, setSalvando] = useState(false);

  const registrar = useCallback(
    async (itens: ItemChamada[]): Promise<boolean> => {
      if (itens.length === 0) return true;
      setSalvando(true);
      // Mesma intenção => mesmo id enquanto o banco não responder, para o
      // retry do usuário não virar uma segunda chamada aos olhos do ledger.
      const chave = chaveDoPedido('chamada', itens);
      try {
        const { data, error } = await supabase.rpc('app_registrar_chamada_agenda', {
          p_itens: itens,
          p_request_id: requestIdDoPedido(chave),
        });
        if (error) throw error;

        // O banco decidiu — do próximo clique em diante é uma nova intenção.
        encerrarPedido(chave);
        const recibo = interpretarRecibo(data);

        if (recibo.status === 'falhou' || recibo.aplicados === 0) {
          // NADA gravou: erro vermelho, não warning — warning amarelo passava
          // por sucesso e a equipe achava que tinha registrado (caso 12/08).
          toast.error('Não foi possível registrar', {
            description: descreverErrosDoRecibo(recibo),
          });
          return false;
        }
        if (recibo.status === 'parcial') {
          toast.warning('Chamada parcialmente registrada', {
            description: descreverErrosDoRecibo(recibo, { comAluno: true }),
          });
        } else {
          // Quando todos os itens são 'indeterminado', a operação é um
          // "desmarcar" (toggle) — não faz sentido dizer "Chamada registrada".
          const todosIndeterminado = itens.every((i) => i.status === 'indeterminado');
          toast.success(todosIndeterminado ? 'Marcação removida' : 'Chamada registrada');
        }
        aoConcluir();
        return recibo.rejeitados === 0;
      } catch (e) {
        // Não encerra o pedido: pode ter chegado ao banco e a resposta é que
        // se perdeu. O retry reusa o id e o recibo anterior é devolvido.
        toast.error('Não foi possível registrar a chamada', {
          description: mensagemDeErro(e),
        });
        return false;
      } finally {
        setSalvando(false);
      }
    },
    [aoConcluir],
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
