/**
 * Faturas do aluno para o lancamento manual do caixa.
 *
 * Usa o caminho canonico do app (`carregarFaturasAlunosFinanceiras`, a RPC
 * get_faturas_alunos_financeiro_v1) em vez de um join proprio, porque casar fatura com
 * aluno na mao erra: medido em 08/09/2026, `emusys_student_id = alunos.id` da 2.052 pares
 * que caem para 695 ao filtrar pela unidade (o resto e colisao de numero entre unidades),
 * e casar por `emusys_student_id` da 7.729 pares para 5.334 faturas porque a tabela
 * `alunos` tem registro duplicado. ID do Emusys e por unidade — join ingenuo mostra a
 * fatura do aluno errado no balcao.
 *
 * A janela e de 3 meses (`janela_3`): quem paga no balcao costuma estar pagando parcela
 * atrasada, nao a do mes corrente.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  carregarFaturasAlunosFinanceiras,
  type FaturasFinanceirasItem,
} from '@/lib/faturasAlunosFinanceiras';

export interface FaturaParaCaixa {
  /** Chave composta "<unidade>:<emusys_fatura_id>" — identifica na lista, NAO e a FK. */
  chave: string;
  emusysFaturaId: string;
  alunoId: number | null;
  alunoNome: string;
  cursoNome: string | null;
  competencia: string;
  dataVencimento: string | null;
  status: string;
  valor: number | null;
}

const semAcento = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filtrarFaturasPorBusca(faturas: FaturaParaCaixa[], busca: string): FaturaParaCaixa[] {
  const termo = semAcento(busca.trim());
  if (termo.length < 2) return [];
  return faturas.filter((f) => semAcento(f.alunoNome).includes(termo)).slice(0, 12);
}

function paraOpcao(item: FaturasFinanceirasItem): FaturaParaCaixa {
  return {
    chave: item.canonical_fatura_id,
    emusysFaturaId: String(item.emusys_fatura_id),
    alunoId: item.aluno?.id ?? null,
    alunoNome: item.aluno?.nome ?? '',
    cursoNome: item.aluno?.curso_nome ?? null,
    competencia: item.competencia,
    dataVencimento: item.data_vencimento ?? null,
    status: item.status,
    valor: item.valores?.valor_pago ?? item.valores?.valor_com_desconto ?? null,
  };
}

/**
 * Resolve a FK real (`emusys_faturas.id`) a partir do par natural, que e unico:
 * 5.334 faturas, 5.334 pares distintos, zero duplicado (medido em 08/09/2026).
 * A RPC canonica so devolve a chave composta, que nao serve para FK.
 */
export async function resolverFaturaId(
  unidadeId: string,
  emusysFaturaId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('emusys_faturas')
    .select('id')
    .eq('unidade_id', unidadeId)
    .eq('emusys_fatura_id', emusysFaturaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id?: string } | null)?.id ?? null;
}

export function useFaturasParaCaixa(unidadeId?: string | null) {
  const [faturas, setFaturas] = useState<FaturaParaCaixa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!unidadeId || unidadeId === 'todos') {
      setFaturas([]);
      setErro(null);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const hoje = new Date();
      const estado = await carregarFaturasAlunosFinanceiras(supabase as never, {
        unidadeId,
        ano: hoje.getFullYear(),
        mes: hoje.getMonth() + 1,
        modoPeriodo: 'janela_3',
        situacao: 'todas',
        asOfDate: hoje.toISOString().slice(0, 10),
      });
      if (estado.erro) throw new Error(estado.erro);
      setFaturas(estado.items.map(paraOpcao));
    } catch (err: unknown) {
      // Falhar aqui nao pode travar o caixa: sem a lista o lancamento segue sem
      // identidade, com aviso. Travar o balcao produz lancamento inventado.
      setErro(err instanceof Error ? err.message : 'Falha ao carregar faturas do aluno.');
      setFaturas([]);
    } finally {
      setCarregando(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return useMemo(
    () => ({ faturas, carregando, erro, recarregar: carregar }),
    [carregando, carregar, erro, faturas],
  );
}
