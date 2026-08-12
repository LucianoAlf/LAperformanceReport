import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

/**
 * Acoes da chamada (Fase 2, spec 2026-08-11). Todas passam pelas RPCs
 * security definer que validam a permissao `agenda.chamada` por unidade.
 * Nada aqui escreve direto em tabela.
 */

export interface ItemChamada {
  aula_emusys_id: number;
  aluno_id: number;
  status: 'presente' | 'falta' | 'falta_justificada' | 'indeterminado';
  motivo?: string;
  evidencia_path?: string;
}

interface ResultadoChamada {
  inseridos: number;
  atualizados: number;
  retificados: number;
  erros: Array<{ aluno_id: number; erro: string }>;
}

const MENSAGENS_ERRO: Record<string, string> = {
  aula_nao_encontrada: 'aula não encontrada',
  sem_permissao_unidade: 'sem permissão nesta unidade',
  aula_cancelada: 'aula cancelada',
  status_invalido: 'status inválido',
  motivo_obrigatorio_justificada: 'justificativa exige motivo',
  aluno_fora_do_roster: 'aluno fora do roster da aula',
  experimental_nao_encontrada: 'aula experimental não encontrada',
};

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
      try {
        const { data, error } = await supabase.rpc('app_registrar_chamada_agenda', {
          p_itens: itens,
        });
        if (error) throw error;

        const resultado = data as ResultadoChamada;
        const erros = resultado?.erros ?? [];
        const gravados = (resultado?.inseridos ?? 0) + (resultado?.atualizados ?? 0) + (resultado?.retificados ?? 0);
        if (erros.length > 0 && gravados === 0) {
          // NADA gravou: erro vermelho, não warning — warning amarelo passava
          // por sucesso e a equipe achava que tinha registrado (caso 12/08).
          const detalhes = erros
            .map((e) => MENSAGENS_ERRO[e.erro] ?? e.erro)
            .join('; ');
          toast.error('Não foi possível registrar', { description: detalhes });
          return false;
        }
        if (erros.length > 0) {
          const detalhes = erros
            .map((e) => `aluno ${e.aluno_id}: ${MENSAGENS_ERRO[e.erro] ?? e.erro}`)
            .join('; ');
          toast.warning(`Chamada parcialmente registrada`, { description: detalhes });
        } else {
          // Quando todos os itens são 'indeterminado', a operação é um
          // "desmarcar" (toggle) — não faz sentido dizer "Chamada registrada".
          const todosIndeterminado = itens.every((i) => i.status === 'indeterminado');
          toast.success(todosIndeterminado ? 'Marcação removida' : 'Chamada registrada');
        }
        aoConcluir();
        return erros.length === 0;
      } catch (e) {
        toast.error('Não foi possível registrar a chamada', {
          description: e instanceof Error ? e.message : String(e),
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
          description: e instanceof Error ? e.message : String(e),
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
          description: e instanceof Error ? e.message : String(e),
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
