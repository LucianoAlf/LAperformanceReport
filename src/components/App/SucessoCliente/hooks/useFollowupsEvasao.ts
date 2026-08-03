import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { supabase } from '@/lib/supabase';
import type {
  PesquisaEvasaoFollowupAcao,
  PesquisaEvasaoFollowupCanal,
  PesquisaEvasaoFollowupFiltro,
  PesquisaEvasaoFollowupItem,
} from '../pesquisaEvasao.types';

interface UseFollowupsEvasaoParams {
  unidadeAtual: UnidadeId;
  ano: number;
  mes: number | null;
  busca: string;
  estado: PesquisaEvasaoFollowupFiltro;
  pagina: number;
}

interface RegistrarAcaoParams {
  pesquisaId: string;
  acao: PesquisaEvasaoFollowupAcao;
  canal: PesquisaEvasaoFollowupCanal | null;
  observacao: string;
}

const TAMANHO_PAGINA = 50;

export function useFollowupsEvasao({
  unidadeAtual,
  ano,
  mes,
  busca,
  estado,
  pagina,
}: UseFollowupsEvasaoParams) {
  const [itens, setItens] = useState<PesquisaEvasaoFollowupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPendente, setTotalPendente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const parametros = useMemo(() => ({
    p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
    p_ano: ano,
    p_mes: mes,
  }), [ano, mes, unidadeAtual]);

  const recarregar = useCallback(async () => {
    setLoading(true);
    setErro(null);

    const [lista, contador] = await Promise.all([
      supabase.rpc('listar_followups_pesquisa_evasao_v1', {
        ...parametros,
        p_limite: TAMANHO_PAGINA,
        p_offset: Math.max(0, pagina - 1) * TAMANHO_PAGINA,
        p_estado: estado,
        p_busca: busca.trim() || null,
      }),
      supabase.rpc('contar_followups_pesquisa_evasao_v1', parametros),
    ]);

    if (lista.error || contador.error) {
      const mensagem = lista.error?.message || contador.error?.message ||
        'Não foi possível carregar os follow-ups';
      setErro(mensagem);
      setItens([]);
      setTotal(0);
      setTotalPendente(0);
      setLoading(false);
      return;
    }

    const proximosItens = (lista.data ?? []) as PesquisaEvasaoFollowupItem[];
    setItens(proximosItens);
    setTotal(Number(proximosItens[0]?.total_count ?? 0));
    setTotalPendente(Number(contador.data ?? 0));
    setLoading(false);
  }, [busca, estado, pagina, parametros]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const registrarAcao = useCallback(async ({
    pesquisaId,
    acao,
    canal,
    observacao,
  }: RegistrarAcaoParams) => {
    const { error } = await supabase.rpc('registrar_followup_pesquisa_evasao_v1', {
      p_pesquisa_id: pesquisaId,
      p_acao: acao,
      p_canal: acao === 'realizado' ? canal : null,
      p_observacao: observacao.trim() || null,
    });

    if (error) throw error;
    await recarregar();
  }, [recarregar]);

  return {
    itens,
    total,
    totalPendente,
    loading,
    erro,
    tamanhoPagina: TAMANHO_PAGINA,
    recarregar,
    registrarAcao,
  };
}
