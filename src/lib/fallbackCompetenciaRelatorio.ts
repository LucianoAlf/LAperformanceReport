import { supabase } from '@/lib/supabase';

export type FallbackCompetencia = {
  ano: number;
  mes: number;
  rotulo: string;
};

/**
 * `supabase.functions.invoke` converte qualquer resposta não-2xx em FunctionsHttpError
 * e não entrega o corpo. A resposta original fica em `context`, e é lá que a edge
 * manda qual competência está disponível.
 */
export async function extrairFallbackCompetencia(
  erro: unknown,
): Promise<FallbackCompetencia | null> {
  const contexto = (erro as { context?: Response } | null)?.context;
  if (!contexto || typeof contexto.json !== 'function') return null;

  try {
    const corpo = await contexto.clone().json();
    if (corpo?.motivo !== 'fechamento_indisponivel') return null;

    const fallback = corpo?.fallback;
    if (
      !fallback
      || !Number.isInteger(fallback.ano)
      || !Number.isInteger(fallback.mes)
      || typeof fallback.rotulo !== 'string'
    ) {
      return null;
    }

    return { ano: fallback.ano, mes: fallback.mes, rotulo: fallback.rotulo };
  } catch {
    return null;
  }
}

type ModoMensal = 'dry_run_mensal_admin' | 'dry_run_mensal_comercial';

/**
 * Tenta a competência pedida. Se a edge responder que não há fechamento e
 * oferecer um mês anterior, pede confirmação e refaz a chamada uma única vez.
 */
export async function solicitarRelatorioMensalComFallback(params: {
  modo: ModoMensal;
  unidade: string;
  ano: number;
  mes: number;
  pedirConfirmacao: (fallback: FallbackCompetencia) => Promise<boolean>;
}): Promise<string> {
  const { modo, unidade, ano, mes, pedirConfirmacao } = params;

  const solicitar = (anoAlvo: number, mesAlvo: number) =>
    supabase.functions.invoke('relatorio-admin-whatsapp', {
      body: { modo, unidade, ano: anoAlvo, mes: mesAlvo },
    });

  const extrairTexto = (data: { success?: boolean; texto?: string; error?: string } | null) => {
    if (data?.success !== true || typeof data?.texto !== 'string' || !data.texto.trim()) {
      throw new Error(data?.error || 'O fechamento oficial deste mês ainda não está disponível.');
    }
    return data.texto;
  };

  const primeira = await solicitar(ano, mes);
  if (!primeira.error) return extrairTexto(primeira.data);

  const fallback = await extrairFallbackCompetencia(primeira.error);
  if (!fallback) throw primeira.error;

  const aceitou = await pedirConfirmacao(fallback);
  if (!aceitou) {
    throw new Error('Geração cancelada. Escolha uma competência já fechada.');
  }

  const segunda = await solicitar(fallback.ano, fallback.mes);
  if (segunda.error) throw segunda.error;
  return extrairTexto(segunda.data);
}
