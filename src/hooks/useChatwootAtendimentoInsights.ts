import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  AgenteAtendimento,
  CaixaAtendimento,
  UnidadeAtendimento,
  ResumoAtendimento,
  ChatwootAtendimentoResposta,
} from '@/lib/chatwootAtendimento';

interface UseChatwootAtendimentoInsightsParams {
  ano: number;
  mesInicio: number;
  mesFim: number;
  enabled?: boolean;
}

interface ChatwootAtendimentoInsights {
  agentes: AgenteAtendimento[];
  caixas: CaixaAtendimento[];
  unidades: UnidadeAtendimento[];
  geral: ResumoAtendimento | null;
  since: number | null;
  until: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Busca a performance de atendimento (Chatwoot) via edge function.
// Fetch isolado e lazy: só dispara quando `enabled` (sub-aba ativa), pra não travar o
// carregamento das outras sub-abas do Comercial com uma fonte externa mais lenta.
export function useChatwootAtendimentoInsights({
  ano,
  mesInicio,
  mesFim,
  enabled = true,
}: UseChatwootAtendimentoInsightsParams): ChatwootAtendimentoInsights {
  const [agentes, setAgentes] = useState<AgenteAtendimento[]>([]);
  const [caixas, setCaixas] = useState<CaixaAtendimento[]>([]);
  const [unidades, setUnidades] = useState<UnidadeAtendimento[]>([]);
  const [geral, setGeral] = useState<ResumoAtendimento | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guarda contra setState após unmount ou de uma resposta obsoleta (troca de período).
  const requisicaoAtivaRef = useRef(0);

  const fetchInsights = useCallback(async () => {
    if (!enabled) return;

    const requisicao = ++requisicaoAtivaRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('chatwoot-atendimento-insights', {
        body: { ano, mesInicio, mesFim },
      });
      if (requisicao !== requisicaoAtivaRef.current) return;
      if (fnError) throw fnError;
      const resposta = data as ChatwootAtendimentoResposta;
      if (!resposta?.ok) throw new Error(resposta?.error || 'Erro ao consultar o Chatwoot');
      setAgentes(resposta.agentes ?? []);
      setCaixas(resposta.caixas ?? []);
      setUnidades(resposta.unidades ?? []);
      setGeral(resposta.geral ?? null);
      setSince(resposta.since ?? null);
      setUntil(resposta.until ?? null);
    } catch (e) {
      if (requisicao !== requisicaoAtivaRef.current) return;
      console.error('Erro ao buscar insights de atendimento (Chatwoot):', e);
      setError(e instanceof Error ? e.message : 'Erro ao consultar o Chatwoot');
      setAgentes([]);
      setCaixas([]);
      setUnidades([]);
      setGeral(null);
    } finally {
      if (requisicao === requisicaoAtivaRef.current) setLoading(false);
    }
  }, [ano, mesInicio, mesFim, enabled]);

  useEffect(() => {
    fetchInsights();
    return () => { requisicaoAtivaRef.current++; };
  }, [fetchInsights]);

  return { agentes, caixas, unidades, geral, since, until, loading, error, refetch: fetchInsights };
}
