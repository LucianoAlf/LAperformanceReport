import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ContratoVencendo = {
  unidade_id: string;
  unidade_nome: string;
  aluno_id: number | null;
  // Pode ser null: LEFT JOIN com alunos deixa sem nome a matricula
  // sem vinculo local (medido: 2 linhas em producao).
  aluno_nome: string | null;
  emusys_matricula_id: number;
  emusys_matricula_disciplina_id: number;
  curso_nome: string | null;
  professor_nome: string | null;
  data_matricula: string | null;
  data_ultima_aula: string;
  dias_ate_vencimento: number;
  nr_aulas_futuras: number | null;
  venc_ultima_fatura: string | null;
  valor_parcela: number | null;
  inadimplente: boolean | null;
  telefone: string | null;
  whatsapp: string | null;
  ultima_sincronizacao_emusys: string | null;
};

export type JanelaDias = 30 | 60 | 90;

type Params = { unidadeId: string | 'todos'; janelaDias: JanelaDias };

export function useContratosVencendo({ unidadeId, janelaDias }: Params) {
  const [contratos, setContratos] = useState<ContratoVencendo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setLoading(true);
    setErro(null);

    let query = supabase
      .from('vw_contratos_vencendo')
      .select('*')
      // dias_ate_vencimento negativo = contrato ja vencido; fora do escopo da tela.
      .gte('dias_ate_vencimento', 0)
      .lte('dias_ate_vencimento', janelaDias)
      .order('data_ultima_aula', { ascending: true });

    if (unidadeId !== 'todos') query = query.eq('unidade_id', unidadeId);

    const { data, error } = await query;
    if (error) {
      setErro(error.message);
      setContratos([]);
    } else {
      setContratos((data ?? []) as ContratoVencendo[]);
    }
    setLoading(false);
  }, [unidadeId, janelaDias]);

  useEffect(() => { buscar(); }, [buscar]);

  // Data do dado mais VELHO da tela: mostrar o mais novo daria falsa sensacao de frescor.
  const ultimoSync = contratos.reduce<string | null>((maisVelho, c) => {
    if (!c.ultima_sincronizacao_emusys) return maisVelho;
    if (!maisVelho) return c.ultima_sincronizacao_emusys;
    return c.ultima_sincronizacao_emusys < maisVelho ? c.ultima_sincronizacao_emusys : maisVelho;
  }, null);

  return { contratos, loading, erro, ultimoSync, refetch: buscar };
}
