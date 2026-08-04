import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  PesquisaEvasaoAcaoTipo,
  PesquisaEvasaoCategoria,
  PesquisaEvasaoClassificacaoDados,
  PesquisaEvasaoDesfecho,
  PesquisaEvasaoRelacaoMotivo,
} from '../pesquisaEvasao.types';

export function useClassificacaoEvasao(pesquisaId: string, habilitado: boolean) {
  const [dados, setDados] = useState<PesquisaEvasaoClassificacaoDados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!habilitado || !pesquisaId) {
      setDados(null);
      setErro(null);
      return;
    }
    setCarregando(true);
    const { data, error } = await supabase.rpc(
      'obter_dados_classificacao_pesquisa_evasao_v1' as never,
      { p_pesquisa_id: pesquisaId } as never,
    );
    setCarregando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setErro(null);
    setDados(data as PesquisaEvasaoClassificacaoDados);
  }, [habilitado, pesquisaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = useCallback(async (
    rpc: string,
    parametros: Record<string, unknown>,
  ) => {
    const { data, error } = await supabase.rpc(rpc as never, parametros as never);
    if (error) return { ok: false as const, erro: error };
    await carregar();
    return { ok: true as const, data };
  }, [carregar]);

  return {
    dados,
    carregando,
    erro,
    carregar,
    classificar: (entrada: {
      analiseId: string;
      categorias: PesquisaEvasaoCategoria[];
      relacao: PesquisaEvasaoRelacaoMotivo;
      justificativa: string;
    }) => executar('registrar_classificacao_pesquisa_evasao_v1', {
      p_pesquisa_id: pesquisaId,
      p_analise_id: entrada.analiseId,
      p_categorias: entrada.categorias,
      p_relacao_motivo: entrada.relacao,
      p_justificativa: entrada.justificativa,
    }),
    criarAcao: (entrada: {
      classificacaoId: string;
      tipo: PesquisaEvasaoAcaoTipo;
      descricao: string;
      prazoEm: string | null;
      professorId: number | null;
    }) => executar('registrar_acao_pesquisa_evasao_v1', {
      p_pesquisa_id: pesquisaId,
      p_classificacao_id: entrada.classificacaoId,
      p_tipo: entrada.tipo,
      p_descricao: entrada.descricao,
      p_prazo_em: entrada.prazoEm,
      p_professor_id: entrada.professorId,
    }),
    concluirAcao: (
      acaoId: string,
      estado: 'realizada' | 'cancelada',
      observacao: string,
    ) => executar('concluir_acao_pesquisa_evasao_v1', {
      p_acao_id: acaoId,
      p_estado: estado,
      p_observacao: observacao,
    }),
    registrarDesfecho: (
      classificacaoId: string,
      desfecho: PesquisaEvasaoDesfecho,
      observacao: string,
    ) => executar('registrar_desfecho_pesquisa_evasao_v1', {
      p_pesquisa_id: pesquisaId,
      p_classificacao_id: classificacaoId,
      p_desfecho: desfecho,
      p_observacao: observacao,
    }),
  };
}
