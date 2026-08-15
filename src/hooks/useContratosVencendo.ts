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
  // null quando o contrato nao tem faturas (nr_faturas = 0): nao ha vencimento
  // financeiro a medir, entao a linha simplesmente nao entra na janela por fatura.
  dias_ate_venc_fatura: number | null;
  valor_parcela: number | null;
  inadimplente: boolean | null;
  telefone: string | null;
  whatsapp: string | null;
  ultima_sincronizacao_emusys: string | null;
  // Faturas vencidas e não pagas — replica a coluna "Faturas" da tela de Renovação
  // de Matrículas do Emusys. É um PISO, não o valor exato: `emusys_faturas` só cobre
  // de jun/2026 em diante, então atraso mais antigo não entra na conta (medido: o
  // Emusys mostra 2 para o Renan onde temos 1). Quem exibe deve tirar a COR de
  // `inadimplente`, que vem do contrato e não tem esse limite.
  faturas_vencidas_abertas: number;
  /** Nº de parcelas do contrato. 1 com muitas aulas pela frente costuma ser pagamento à vista. */
  nr_faturas: number | null;
};

export type JanelaDias = 30 | 60 | 90;

// Os dois criterios do alternador da tela de Renovacao de Matriculas do Emusys.
// Nao sao equivalentes: em 78% dos contratos ativos a ultima aula e a ultima fatura
// caem em MESES diferentes -- ora sobra parcela depois das aulas, ora sobra aula
// depois das parcelas. Cada criterio devolve uma lista diferente, de proposito.
export type CriterioVencimento = 'aula' | 'fatura';

const COLUNA_JANELA: Record<CriterioVencimento, string> = {
  aula: 'dias_ate_vencimento',
  fatura: 'dias_ate_venc_fatura',
};

const COLUNA_ORDEM: Record<CriterioVencimento, string> = {
  aula: 'data_ultima_aula',
  fatura: 'venc_ultima_fatura',
};

type Params = {
  unidadeId: string | 'todos';
  janelaDias: JanelaDias;
  criterio?: CriterioVencimento;
  /** false mantém o hook montado sem consultar — usado quando a aba está noutro recorte. */
  ativo?: boolean;
};

export function useContratosVencendo({
  unidadeId, janelaDias, criterio = 'aula', ativo = true,
}: Params) {
  const [contratos, setContratos] = useState<ContratoVencendo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    if (!ativo) { setLoading(false); return; }
    setLoading(true);
    setErro(null);

    const colunaJanela = COLUNA_JANELA[criterio];

    let query = supabase
      .from('vw_contratos_vencendo')
      .select('*')
      // negativo = ja vencido; fora do escopo da tela. No criterio de fatura, a coluna
      // e NULL para contrato sem faturas, e o PostgREST ja descarta NULL nesses filtros.
      .gte(colunaJanela, 0)
      .lte(colunaJanela, janelaDias)
      .order(COLUNA_ORDEM[criterio], { ascending: true });

    if (unidadeId !== 'todos') query = query.eq('unidade_id', unidadeId);

    const { data, error } = await query;
    if (error) {
      setErro(error.message);
      setContratos([]);
    } else {
      setContratos((data ?? []) as ContratoVencendo[]);
    }
    setLoading(false);
  }, [unidadeId, janelaDias, criterio, ativo]);

  useEffect(() => { buscar(); }, [buscar]);

  // Data do dado mais VELHO da tela: mostrar o mais novo daria falsa sensacao de frescor.
  const ultimoSync = contratos.reduce<string | null>((maisVelho, c) => {
    if (!c.ultima_sincronizacao_emusys) return maisVelho;
    if (!maisVelho) return c.ultima_sincronizacao_emusys;
    return c.ultima_sincronizacao_emusys < maisVelho ? c.ultima_sincronizacao_emusys : maisVelho;
  }, null);

  return { contratos, loading, erro, ultimoSync, refetch: buscar };
}
