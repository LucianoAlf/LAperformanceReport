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
  type FaturaFinanceiraItem,
} from '@/lib/faturasAlunosFinanceiras';

export interface FaturaParaCaixa {
  /** Chave composta "<unidade>:<emusys_fatura_id>" — identifica na lista, NAO e a FK. */
  chave: string;
  emusysFaturaId: string;
  /** UUID real da linha em `emusys_faturas` — preenchido quando a opcao veio do espelho direto. */
  faturaId?: string | null;
  emusysStudentId: string | null;
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

/**
 * Sugestao por valor: quem paga no balcao costuma pagar o valor exato da parcela
 * aberta. So em aberto — fatura paga nao e candidata. Centavos tem que bater:
 * sugestao frouxa ensina link errado, e link errado e' pior que nenhum.
 */
export function sugerirFaturasPorValor(faturas: FaturaParaCaixa[], valor: number): FaturaParaCaixa[] {
  if (!valor || valor <= 0) return [];
  return faturas
    .filter((f) => f.valor !== null && Math.abs(f.valor - valor) < 0.005 && f.status === 'aberta')
    .slice(0, 12);
}

function paraOpcao(item: FaturaFinanceiraItem): FaturaParaCaixa {
  return {
    chave: item.canonical_fatura_id,
    emusysFaturaId: String(item.emusys_fatura_id),
    emusysStudentId: item.emusys_student_id ?? null,
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
 * Todas as faturas do aluno no espelho, sem janela de competencia — e' o que
 * permite vincular pagamento composto (ex: contrato inteiro pago no cartao,
 * com parcelas de competencias futuras que a janela_3 nao alcanca).
 * Leitura via RPC security definer: `emusys_faturas` e' service-only (RLS),
 * select direto volta vazio para usuario autenticado.
 */
export async function buscarFaturasDoAluno(
  unidadeId: string,
  emusysStudentId: string,
  alunoNome: string,
): Promise<FaturaParaCaixa[]> {
  const { data, error } = await supabase.rpc('caixa_faturas_do_aluno_v1', {
    p_unidade_id: unidadeId,
    p_emusys_student_id: Number(emusysStudentId),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const valorOriginal = Number(row.valor_original ?? 0);
    const liquido = valorOriginal - Number(row.desconto_fixo ?? 0) - Number(row.desconto_condicional ?? 0);
    return {
      chave: String(row.id),
      emusysFaturaId: String(row.emusys_fatura_id),
      faturaId: String(row.id),
      emusysStudentId,
      alunoId: null,
      alunoNome,
      cursoNome: null,
      competencia: String(row.competencia ?? ''),
      dataVencimento: row.data_vencimento ? String(row.data_vencimento) : null,
      status: String(row.status ?? ''),
      valor: row.valor_pago != null ? Number(row.valor_pago) : liquido,
    };
  });
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
  const { data, error } = await supabase.rpc('caixa_fatura_resolver_id_v1', {
    p_unidade_id: unidadeId,
    p_emusys_fatura_id: Number(emusysFaturaId),
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
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
      if (estado.error) throw new Error(estado.error);
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
