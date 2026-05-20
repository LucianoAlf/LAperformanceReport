// src/hooks/useAutomacoesData.ts
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type Severidade = 'critico' | 'aviso';

export type Invariante = {
  id: number;
  log_id: number;
  regra: string;
  severidade: Severidade;
  mensagem: string;
  visto_em: string | null;
  visto_por: string | null;
  created_at: string;
};

export type LogAutomacao = {
  id: number;
  evento: string;
  acao: string;
  aluno_nome: string;
  aluno_id: number | null;
  lead_id: number | null;
  unidade_nome: string | null;
  status: 'ok' | 'warn' | 'erro';
  payload_bruto: unknown;
  detalhes: unknown;
  workflow_id: string | null;
  execution_id: string | null;
  created_at: string;
  invariantes?: Invariante[];
};

export type Filtros = {
  dataInicio: Date;
  dataFim: Date;
  unidades: string[];
  status: Array<'ok' | 'warn' | 'erro'>;
  busca: string;
  apenasNaoVistos: boolean;
  evento: string | null;
  regra: string | null;
  severidade: Severidade | null;
  limit: number;
};

export function defaultFiltros(): Filtros {
  const dataFim = new Date();
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - 7);
  return {
    dataInicio,
    dataFim,
    unidades: [],
    status: [],
    busca: '',
    apenasNaoVistos: false,
    evento: null,
    regra: null,
    severidade: null,
    limit: 200,
  };
}

export function useAutomacoesData(filtros: Filtros) {
  const [logs, setLogs] = useState<LogAutomacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const fkey = useMemo(() => JSON.stringify({
    di: filtros.dataInicio.toISOString(),
    df: filtros.dataFim.toISOString(),
    u: [...filtros.unidades].sort(),
    s: [...filtros.status].sort(),
    b: filtros.busca,
    nv: filtros.apenasNaoVistos,
    e: filtros.evento,
    r: filtros.regra,
    sev: filtros.severidade,
    l: filtros.limit,
  }), [filtros]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setErro(null);

    let q = supabase
      .from('automacao_log')
      .select(`
        id, evento, acao, aluno_nome, aluno_id, lead_id, unidade_nome,
        status, payload_bruto, detalhes, workflow_id, execution_id, created_at,
        automacao_invariantes (id, log_id, regra, severidade, mensagem, visto_em, visto_por, created_at)
      `)
      .gte('created_at', filtros.dataInicio.toISOString())
      .lte('created_at', filtros.dataFim.toISOString())
      .order('created_at', { ascending: false })
      .limit(filtros.limit);

    if (filtros.unidades.length > 0) {
      q = q.in('unidade_nome', filtros.unidades);
    }
    if (filtros.status.length > 0) {
      q = q.in('status', filtros.status);
    }
    if (filtros.busca.trim()) {
      q = q.ilike('aluno_nome', `%${filtros.busca.trim()}%`);
    }
    if (filtros.evento) {
      q = q.eq('evento', filtros.evento);
    }

    const { data, error } = await q;
    if (error) {
      setErro(error.message);
      setLogs([]);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lista = (data ?? []).map((l: any) => ({
      ...l,
      invariantes: l.automacao_invariantes ?? [],
    })) as LogAutomacao[];

    if (filtros.regra) {
      lista = lista.filter(l => l.invariantes?.some(i => i.regra === filtros.regra));
    }
    if (filtros.severidade) {
      lista = lista.filter(l => l.invariantes?.some(i => i.severidade === filtros.severidade));
    }
    if (filtros.apenasNaoVistos) {
      lista = lista.filter(l => l.invariantes?.some(i => i.visto_em === null && i.severidade === 'critico'));
    }

    setLogs(lista);
    setLoading(false);
  }, [fkey]);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 30_000);
    return () => clearInterval(interval);
  }, [refetch]);

  const marcarVistas = useCallback(async (invariante_ids: number[]) => {
    if (invariante_ids.length === 0) return;
    const { data: userResult } = await supabase.auth.getUser();
    const uid = userResult.user?.id ?? null;
    const { error } = await supabase
      .from('automacao_invariantes')
      .update({ visto_em: new Date().toISOString(), visto_por: uid })
      .in('id', invariante_ids)
      .is('visto_em', null);
    if (error) {
      console.error('[marcarVistas]', error);
    } else {
      await refetch();
    }
  }, [refetch]);

  return { logs, loading, erro, refetch, marcarVistas };
}
