import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CriterioVencimento } from '@/hooks/useContratosVencendo';

/**
 * Cobertura de renovação da competência: quantos contratos terminam no mês e
 * quantos já ganharam ciclo novo.
 *
 * Diferente da Taxa de Renovação (que divide pelo que foi LANÇADO em
 * movimentacoes_admin), o denominador aqui é a base que precisava renovar, lida
 * da jornada. Materializa a fórmula que `docs/REGRAS-DE-NEGOCIO.md` §5.4 já define
 * como canônica no recorte por professor — `renovações / contratos_a_vencer` —
 * aplicada ao recorte de unidade.
 */
export type CicloRenovacao = {
  unidade_id: string;
  unidade_nome: string;
  aluno_id: number | null;
  aluno_nome: string | null;
  emusys_matricula_id: number;
  emusys_matricula_disciplina_id: number;
  curso_id: number | null;
  curso_nome: string | null;
  professor_nome: string | null;
  data_matricula: string | null;
  data_ultima_aula: string;
  nr_aulas_futuras: number | null;
  valor_parcela: number | null;
  inadimplente: boolean | null;
  telefone: string | null;
  whatsapp: string | null;
  ultima_sincronizacao_emusys: string | null;
  sucedida_por: number | null;
  renovou: boolean;
  atividade_extra: boolean;
  competencia_aula: string | null;
  venc_ultima_fatura: string | null;
  competencia_fatura: string | null;
};

const COLUNA_COMPETENCIA: Record<CriterioVencimento, string> = {
  aula: 'competencia_aula',
  fatura: 'competencia_fatura',
};

type Params = {
  unidadeId: string | 'todos';
  ano: number;
  mes: number;
  criterio?: CriterioVencimento;
  /** false mantém o hook montado sem consultar — usado quando a aba está noutro recorte. */
  ativo?: boolean;
};

function primeiroDiaISO(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

export function useCoberturaRenovacao({
  unidadeId, ano, mes, criterio = 'aula', ativo = true,
}: Params) {
  const [ciclos, setCiclos] = useState<CicloRenovacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    if (!ativo) { setLoading(false); return; }
    setLoading(true);
    setErro(null);

    let query = supabase
      .from('vw_renovacao_ciclos')
      .select('*')
      .eq(COLUNA_COMPETENCIA[criterio], primeiroDiaISO(ano, mes))
      // §3.5: banda, coral, Power Kids e GarageBand ficam fora da retenção.
      // A view expõe a flag em vez de filtrar — o filtro é responsabilidade daqui.
      .eq('atividade_extra', false)
      .order('data_ultima_aula', { ascending: true });

    if (unidadeId !== 'todos') query = query.eq('unidade_id', unidadeId);

    const { data, error } = await query;
    if (error) {
      setErro(error.message);
      setCiclos([]);
    } else {
      setCiclos((data ?? []) as CicloRenovacao[]);
    }
    setLoading(false);
  }, [unidadeId, ano, mes, criterio, ativo]);

  useEffect(() => { buscar(); }, [buscar]);

  const resumo = useMemo(() => {
    const base = ciclos.length;
    const renovados = ciclos.filter((c) => c.renovou).length;
    return {
      base,
      renovados,
      faltam: base - renovados,
      // sem base no mês a taxa não é 0%, é indefinida — quem exibe decide o traço
      taxa: base > 0 ? (renovados / base) * 100 : null,
      pendentes: ciclos.filter((c) => !c.renovou),
    };
  }, [ciclos]);

  // Mesma escolha do useContratosVencendo: o dado MAIS VELHO da tela. Mostrar o mais
  // novo daria falsa sensação de frescor.
  const ultimoSync = useMemo(
    () => ciclos.reduce<string | null>((maisVelho, c) => {
      if (!c.ultima_sincronizacao_emusys) return maisVelho;
      if (!maisVelho) return c.ultima_sincronizacao_emusys;
      return c.ultima_sincronizacao_emusys < maisVelho ? c.ultima_sincronizacao_emusys : maisVelho;
    }, null),
    [ciclos],
  );

  return { ...resumo, ciclos, ultimoSync, loading, erro, refetch: buscar };
}
