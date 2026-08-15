import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * "Alunos com aula mas sem fatura por mês" — replica a tela homônima do Emusys.
 *
 * Contrato que COBRE a competência e não tem MENSALIDADE emitida nela. O critério foi
 * destrinchado contra a tela real (Barra, ago/2026: 13 de 13) e está documentado na
 * migration `20260815140000_vw_alunos_sem_fatura_mes.sql` — em resumo: grão de
 * matrícula/curso (não aluno), só mensalidade (taxa de matrícula não conta), inclui
 * quem já saiu, exclui trancado e atividade extra.
 */
export type AlunoSemFatura = {
  unidade_id: string;
  unidade_nome: string;
  aluno_id: number | null;
  aluno_nome: string;
  curso_nome: string | null;
  emusys_matricula_id: number;
  emusys_matricula_disciplina_id: number;
  competencia: string;
  data_primeira_aula: string;
  data_ultima_aula: string;
  status_matricula: string | null;
  /** Parcelas do contrato. 1 com muitas aulas costuma ser pagamento à vista, não cobrança parada. */
  nr_faturas: number | null;
  valor_parcela: number | null;
  telefone: string | null;
  whatsapp: string | null;
  ultima_sincronizacao_emusys: string | null;
};

type Params = {
  unidadeId: string | 'todos';
  /** Primeiro dia do mês, YYYY-MM-01. A view só expõe anterior, atual e seguinte. */
  competencia: string;
  /** false mantém o hook montado sem consultar — usado quando a aba está noutro recorte. */
  ativo?: boolean;
};

/** As 3 competências da view, na mesma ordem das abas do Emusys (anterior | atual | seguinte). */
export function competenciasDisponiveis(): string[] {
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return [-1, 0, 1].map((off) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + off, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
}

export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

export function useAlunosSemFatura({ unidadeId, competencia, ativo = true }: Params) {
  const [alunos, setAlunos] = useState<AlunoSemFatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    if (!ativo) { setLoading(false); return; }
    setLoading(true);
    setErro(null);

    let query = supabase
      .from('vw_alunos_sem_fatura_mes')
      .select('*')
      .eq('competencia', competencia)
      .order('aluno_nome', { ascending: true });

    if (unidadeId !== 'todos') query = query.eq('unidade_id', unidadeId);

    const { data, error } = await query;
    if (error) {
      setErro(error.message);
      setAlunos([]);
    } else {
      setAlunos((data ?? []) as AlunoSemFatura[]);
    }
    setLoading(false);
  }, [unidadeId, competencia, ativo]);

  useEffect(() => { buscar(); }, [buscar]);

  // Mesma escolha dos hooks irmãos: o dado MAIS VELHO da tela, não o mais novo.
  const ultimoSync = useMemo(
    () => alunos.reduce<string | null>((maisVelho, a) => {
      if (!a.ultima_sincronizacao_emusys) return maisVelho;
      if (!maisVelho) return a.ultima_sincronizacao_emusys;
      return a.ultima_sincronizacao_emusys < maisVelho ? a.ultima_sincronizacao_emusys : maisVelho;
    }, null),
    [alunos],
  );

  return { alunos, loading, erro, ultimoSync, refetch: buscar };
}
