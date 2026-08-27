// Regra pura da classificação de resposta da pesquisa de evasão.
// Fora daqui só existe I/O (OpenAI, banco). Testável sem rede e sem Docker.

export type Confianca = "alta" | "media" | "baixa";

export interface VeredictoModelo {
  e_resposta: boolean;
  confianca: Confianca;
  motivo: string;
  contem_pergunta: boolean;
  pede_atendimento_humano: boolean;
}

export interface DecisaoAgradecimento {
  agradecer: boolean;
  motivo_nao_agradecer: string | null;
}

/**
 * Decide se cabe agradecer. Assimétrico de propósito: o erro de NÃO agradecer é
 * invisível (é o comportamento de hoje, e ninguém reclama); o de agradecer à toa
 * chega no WhatsApp da pessoa e não tem desfazer. Por isso todo caminho duvidoso
 * termina em silêncio.
 *
 * ⚠️ Isto NÃO decide o registro da resposta. O registro continua com a regra
 * permissiva que já existe (>= 3 palavras): dar veto ao modelo trocaria um erro
 * barato -- registrar lixo, que a revisão descarta -- por um caro: perder
 * feedback de verdade porque o modelo se enganou.
 */
export function decidirAgradecimento(
  vereditoDoModelo: VeredictoModelo,
): DecisaoAgradecimento {
  const nao = (motivo: string): DecisaoAgradecimento => ({
    agradecer: false,
    motivo_nao_agradecer: motivo,
  });

  if (!vereditoDoModelo.e_resposta) return nao("nao_e_resposta");
  if (vereditoDoModelo.confianca !== "alta") return nao("confianca_insuficiente");

  // Agradecer sem responder a pergunta é pior que o silêncio: confirma que
  // ninguém leu.
  if (vereditoDoModelo.contem_pergunta) return nao("contem_pergunta");

  // Quem está cobrando algo precisa de gente, não de "obrigado pelo feedback".
  if (vereditoDoModelo.pede_atendimento_humano) return nao("pede_atendimento");

  return { agradecer: true, motivo_nao_agradecer: null };
}

/** `warn` marca as linhas que merecem meu olho na auditoria. */
export function statusDoLog(
  vereditoDoModelo: VeredictoModelo,
  registradoComoResposta: boolean,
): "ok" | "warn" {
  return vereditoDoModelo.e_resposta === registradoComoResposta ? "ok" : "warn";
}

/** Uma linha por (pesquisa, versão da análise, versão do prompt). */
export function chaveIdempotencia(
  pesquisaId: string,
  analiseVersao: number,
  promptVersao: string,
): string {
  return `classificacao_ia_evasao:${pesquisaId}:${analiseVersao}:${promptVersao}`;
}
