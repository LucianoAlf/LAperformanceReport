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

interface ContagemGrupos {
  em_aberto: number;
  encerradas: number;
  pendentes: number;
}

/**
 * Era 50 — maior que a fila inteira (35 casos em 31/08/2026), entao os controles de
 * pagina existiam e NUNCA saiam de "1/1": a secao virava uma rolagem unica com
 * trabalho pendente e trabalho encerrado misturados. Com 8 a paginacao passa a
 * significar alguma coisa, e o cartao de cada caso e alto o bastante para que mais
 * do que isso volte a ser rolagem.
 */
const TAMANHO_PAGINA = 8;

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
  const [totais, setTotais] = useState<ContagemGrupos>({
    em_aberto: 0,
    encerradas: 0,
    pendentes: 0,
  });
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

    const buscaNormalizada = busca.trim() || null;

    const [lista, contador] = await Promise.all([
      supabase.rpc('listar_followups_pesquisa_evasao_v1', {
        ...parametros,
        p_limite: TAMANHO_PAGINA,
        p_offset: Math.max(0, pagina - 1) * TAMANHO_PAGINA,
        p_estado: estado,
        p_busca: buscaNormalizada,
      }),
      // Uma varredura devolve os tres numeros das abas. O contador antigo
      // (`contar_followups_pesquisa_evasao_v1`) ignorava a busca: o cabecalho
      // seguia anunciando "28 pendentes" com um unico caso na tela.
      supabase.rpc('contar_followups_pesquisa_evasao_grupos_v1', {
        ...parametros,
        p_busca: buscaNormalizada,
      }),
    ]);

    if (lista.error || contador.error) {
      const mensagem = lista.error?.message || contador.error?.message ||
        'Não foi possível carregar os follow-ups';
      setErro(mensagem);
      setItens([]);
      setTotal(0);
      setTotais({ em_aberto: 0, encerradas: 0, pendentes: 0 });
      setLoading(false);
      return;
    }

    const proximosItens = (lista.data ?? []) as PesquisaEvasaoFollowupItem[];
    // A RPC devolve `returns table`, entao o PostgREST entrega um array de uma linha.
    const contagem = (Array.isArray(contador.data) ? contador.data[0] : contador.data) as
      | Partial<ContagemGrupos>
      | null;

    setItens(proximosItens);
    setTotal(Number(proximosItens[0]?.total_count ?? 0));
    setTotais({
      em_aberto: Number(contagem?.em_aberto ?? 0),
      encerradas: Number(contagem?.encerradas ?? 0),
      pendentes: Number(contagem?.pendentes ?? 0),
    });
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
    totalEmAberto: totais.em_aberto,
    totalEncerradas: totais.encerradas,
    totalPendente: totais.pendentes,
    loading,
    erro,
    tamanhoPagina: TAMANHO_PAGINA,
    recarregar,
    registrarAcao,
  };
}
