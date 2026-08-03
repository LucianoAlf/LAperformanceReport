export type FallbackCompetencia = {
  ano: number;
  mes: number;
  rotulo: string;
};

/**
 * Erro dedicado para o cancelamento deliberado do usuário — distinto de falha
 * real de rede/servidor, para que a UI possa discriminar com `instanceof` e
 * não mostrar um toast de erro para uma escolha do próprio usuário.
 */
export class CancelamentoCompetenciaError extends Error {
  constructor() {
    super('Geração cancelada. Escolha uma competência já fechada.');
    this.name = 'CancelamentoCompetenciaError';
  }
}

type CorpoErroRelatorio = {
  fallback: FallbackCompetencia | null;
  /** `error` do corpo da edge — a frase útil em português, quando houver. */
  mensagem: string | null;
};

/**
 * `supabase.functions.invoke` converte qualquer resposta não-2xx em FunctionsHttpError
 * e não entrega o corpo. A resposta original fica em `context`, e é lá que a edge
 * manda qual competência está disponível E a mensagem legível — a `message` do
 * FunctionsHttpError é sempre o genérico "Edge Function returned a non-2xx status code".
 */
async function lerCorpoErroRelatorio(erro: unknown): Promise<CorpoErroRelatorio> {
  const vazio: CorpoErroRelatorio = { fallback: null, mensagem: null };
  const contexto = (erro as { context?: Response } | null)?.context;
  if (!contexto || typeof contexto.json !== 'function') return vazio;

  try {
    const corpo = await contexto.clone().json();
    const mensagem = typeof corpo?.error === 'string' && corpo.error.trim()
      ? corpo.error.trim()
      : null;
    if (corpo?.motivo !== 'fechamento_indisponivel') return { fallback: null, mensagem };

    const fallback = corpo?.fallback;
    if (
      !fallback
      || !Number.isInteger(fallback.ano)
      || !Number.isInteger(fallback.mes)
      || typeof fallback.rotulo !== 'string'
    ) {
      return { fallback: null, mensagem };
    }

    return {
      fallback: { ano: fallback.ano, mes: fallback.mes, rotulo: fallback.rotulo },
      mensagem,
    };
  } catch {
    return vazio;
  }
}

export async function extrairFallbackCompetencia(
  erro: unknown,
): Promise<FallbackCompetencia | null> {
  return (await lerCorpoErroRelatorio(erro)).fallback;
}

/**
 * Relança preservando a mensagem que a edge escreveu. Sem isso o usuário lê
 * "Edge Function returned a non-2xx status code" no lugar da frase em português.
 */
function erroLegivel(erroOriginal: unknown, mensagem: string | null): unknown {
  return mensagem ? new Error(mensagem) : erroOriginal;
}

type ModoMensal = 'dry_run_mensal_admin' | 'dry_run_mensal_comercial';

type ResultadoInvocacao = { data: { success?: boolean; texto?: string; error?: string } | null; error: unknown };

type Invocador = (ano: number, mes: number) => Promise<ResultadoInvocacao>;

function extrairTexto(data: ResultadoInvocacao['data']): string {
  if (data?.success !== true || typeof data?.texto !== 'string' || !data.texto.trim()) {
    throw new Error(data?.error || 'O fechamento oficial deste mês ainda não está disponível.');
  }
  return data.texto;
}

/**
 * Lógica pura do ciclo tentar → oferecer → reenviar, recebendo o invocador
 * por parâmetro para ser testável sem depender do client Supabase real.
 * Uma única tentativa de fallback: nunca encadeia para um terceiro mês.
 */
export async function executarCicloFallback(params: {
  invocar: Invocador;
  ano: number;
  mes: number;
  pedirConfirmacao: (fallback: FallbackCompetencia) => Promise<boolean>;
}): Promise<string> {
  const { invocar, ano, mes, pedirConfirmacao } = params;

  const primeira = await invocar(ano, mes);
  if (!primeira.error) return extrairTexto(primeira.data);

  const { fallback, mensagem } = await lerCorpoErroRelatorio(primeira.error);
  if (!fallback) throw erroLegivel(primeira.error, mensagem);

  const aceitou = await pedirConfirmacao(fallback);
  if (!aceitou) {
    throw new CancelamentoCompetenciaError();
  }

  const segunda = await invocar(fallback.ano, fallback.mes);
  if (segunda.error) {
    const { mensagem: mensagemSegunda } = await lerCorpoErroRelatorio(segunda.error);
    throw erroLegivel(segunda.error, mensagemSegunda);
  }
  return extrairTexto(segunda.data);
}

/**
 * Tenta a competência pedida. Se a edge responder que não há fechamento e
 * oferecer um mês anterior, pede confirmação e refaz a chamada uma única vez.
 * Wrapper fino: monta o invocador com o client Supabase real e delega para
 * `executarCicloFallback`.
 *
 * O client é importado dinamicamente (em vez de no topo do arquivo) para que
 * `executarCicloFallback` continue importável/testável isoladamente sem
 * exigir resolução do alias `@/` fora do bundler do Vite.
 */
export async function solicitarRelatorioMensalComFallback(params: {
  modo: ModoMensal;
  unidade: string;
  ano: number;
  mes: number;
  pedirConfirmacao: (fallback: FallbackCompetencia) => Promise<boolean>;
}): Promise<string> {
  const { modo, unidade, ano, mes, pedirConfirmacao } = params;
  const { supabase } = await import('@/lib/supabase');

  const invocar: Invocador = (anoAlvo, mesAlvo) =>
    supabase.functions.invoke('relatorio-admin-whatsapp', {
      body: { modo, unidade, ano: anoAlvo, mes: mesAlvo },
    });

  return executarCicloFallback({ invocar, ano, mes, pedirConfirmacao });
}
