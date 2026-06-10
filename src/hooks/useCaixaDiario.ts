import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcularResumoCaixa } from '@/lib/caixaFinanceiro';
import type { CaixaDiario, CaixaMovimentacao, NovaCaixaMovimentacaoInput } from '@/types/caixa';

interface UseCaixaDiarioParams {
  unidadeId?: string | null;
  dataCaixa: string;
}

export function useCaixaDiario({ unidadeId, dataCaixa }: UseCaixaDiarioParams) {
  const [caixa, setCaixa] = useState<CaixaDiario | null>(null);
  const [movimentos, setMovimentos] = useState<CaixaMovimentacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!unidadeId || unidadeId === 'todos') {
      setCaixa(null);
      setMovimentos([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: caixaData, error: caixaError } = await supabase
        .from('caixas_diarios')
        .select('*')
        .eq('unidade_id', unidadeId)
        .eq('data_caixa', dataCaixa)
        .maybeSingle();

      if (caixaError) throw caixaError;

      const caixaAtual = caixaData as CaixaDiario | null;
      setCaixa(caixaAtual);

      if (!caixaAtual) {
        setMovimentos([]);
        return;
      }

      const { data: movimentosData, error: movimentosError } = await supabase
        .from('caixa_movimentacoes')
        .select('*')
        .eq('caixa_diario_id', caixaAtual.id)
        .order('created_at', { ascending: true });

      if (movimentosError) throw movimentosError;
      setMovimentos((movimentosData ?? []) as CaixaMovimentacao[]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar caixa diario.');
    } finally {
      setLoading(false);
    }
  }, [dataCaixa, unidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizarSaldoCalculado = useCallback(async (caixaAtual: CaixaDiario, nextMovimentos: CaixaMovimentacao[]) => {
    const resumo = calcularResumoCaixa(caixaAtual, nextMovimentos);

    const { data, error: updateError } = await supabase
      .from('caixas_diarios')
      .update({ saldo_final_calculado: resumo.saldoFinalCalculado })
      .eq('id', caixaAtual.id)
      .select('*')
      .single();

    if (updateError) throw updateError;
    setCaixa(data as CaixaDiario);
    return data as CaixaDiario;
  }, []);

  const abrirCaixa = useCallback(async (saldoInicial: number, abertoPor: string) => {
    if (!unidadeId || unidadeId === 'todos') {
      throw new Error('Selecione uma unidade para abrir o caixa.');
    }

    setSaving(true);
    try {
      const { data, error: insertError } = await supabase
        .from('caixas_diarios')
        .insert({
          unidade_id: unidadeId,
          data_caixa: dataCaixa,
          saldo_inicial_cofre: saldoInicial,
          saldo_final_calculado: saldoInicial,
          aberto_por: abertoPor || null,
        })
        .select('*')
        .single();

      if (insertError) throw insertError;
      setCaixa(data as CaixaDiario);
      setMovimentos([]);
      return data as CaixaDiario;
    } finally {
      setSaving(false);
    }
  }, [dataCaixa, unidadeId]);

  const adicionarMovimento = useCallback(async (input: NovaCaixaMovimentacaoInput) => {
    if (!caixa || !unidadeId || unidadeId === 'todos') {
      throw new Error('Abra o caixa antes de lancar movimentacoes.');
    }
    if (caixa.status === 'fechado') {
      throw new Error('Caixa fechado nao aceita novos lancamentos.');
    }

    setSaving(true);
    try {
      const { data, error: insertError } = await supabase
        .from('caixa_movimentacoes')
        .insert({
          caixa_diario_id: caixa.id,
          unidade_id: unidadeId,
          data_movimento: dataCaixa,
          ...input,
          responsavel: input.responsavel || null,
          criado_por: input.criado_por || null,
        })
        .select('*')
        .single();

      if (insertError) throw insertError;

      const nextMovimentos = [...movimentos, data as CaixaMovimentacao];
      setMovimentos(nextMovimentos);
      await atualizarSaldoCalculado(caixa, nextMovimentos);
      return data as CaixaMovimentacao;
    } finally {
      setSaving(false);
    }
  }, [atualizarSaldoCalculado, caixa, dataCaixa, movimentos, unidadeId]);

  const excluirMovimento = useCallback(async (movimentoId: string) => {
    if (!caixa) throw new Error('Caixa nao carregado.');
    if (caixa.status === 'fechado') throw new Error('Caixa fechado nao permite exclusao.');

    setSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from('caixa_movimentacoes')
        .delete()
        .eq('id', movimentoId);

      if (deleteError) throw deleteError;

      const nextMovimentos = movimentos.filter((m) => m.id !== movimentoId);
      setMovimentos(nextMovimentos);
      await atualizarSaldoCalculado(caixa, nextMovimentos);
    } finally {
      setSaving(false);
    }
  }, [atualizarSaldoCalculado, caixa, movimentos]);

  const fecharCaixa = useCallback(async (saldoFinalConferido: number, fechadoPor: string, observacoes?: string) => {
    if (!caixa) throw new Error('Caixa nao carregado.');
    if (!fechadoPor.trim()) throw new Error('Informe quem conferiu o caixa.');

    const resumo = calcularResumoCaixa(caixa, movimentos);
    setSaving(true);
    try {
      const { data, error: updateError } = await supabase
        .from('caixas_diarios')
        .update({
          status: 'fechado',
          saldo_final_calculado: resumo.saldoFinalCalculado,
          saldo_final_conferido: saldoFinalConferido,
          fechado_por: fechadoPor.trim(),
          fechado_em: new Date().toISOString(),
          observacoes: observacoes?.trim() || null,
        })
        .eq('id', caixa.id)
        .select('*')
        .single();

      if (updateError) throw updateError;
      setCaixa(data as CaixaDiario);
      return data as CaixaDiario;
    } finally {
      setSaving(false);
    }
  }, [caixa, movimentos]);

  return {
    caixa,
    movimentos,
    resumo: useMemo(() => calcularResumoCaixa(caixa, movimentos), [caixa, movimentos]),
    loading,
    saving,
    error,
    carregar,
    abrirCaixa,
    adicionarMovimento,
    excluirMovimento,
    fecharCaixa,
  };
}
