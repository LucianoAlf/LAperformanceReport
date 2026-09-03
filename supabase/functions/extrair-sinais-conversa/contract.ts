// Regra pura do extrator semântico de conversas (Mapa de Sinais / A5).
// Fora daqui só existe I/O (OpenAI, SOL, banco). Testável sem rede.

export type TipoConversa =
  | "cancelamento_declarado"
  | "dificuldade_financeira"
  | "promessa_sem_desfecho"
  | "reposicao_pedida"
  | "ausencia_ou_doenca"
  | "pergunta_sem_resposta"
  | "cortesia"
  | "aviso_operacional"
  | "spam"
  | "outro";

export type Confianca = "alta" | "media" | "baixa";

export interface VeredictoConversa {
  tipo: TipoConversa;
  precisa_resposta: boolean;
  confianca: Confianca;
  resumo: string;
  trecho_chave: string;
}

/**
 * O modelo NÃO escolhe a regra nem a severidade — ele descreve o que está
 * acontecendo, e este mapa (determinístico) decide. Sem isso, o LLM estaria
 * definindo prioridade de retenção, que é decisão de negócio.
 */
const REGRA_POR_TIPO: Record<TipoConversa, string | null> = {
  cancelamento_declarado: "R2",
  dificuldade_financeira: "R14",
  promessa_sem_desfecho: "R7",
  reposicao_pedida: "R10",
  ausencia_ou_doenca: "R9",
  pergunta_sem_resposta: "R8",
  cortesia: null,
  aviso_operacional: null,
  spam: null,
  outro: null,
};

/**
 * Tipos que dispensam `precisa_resposta`, por dois motivos distintos:
 *
 * - GRAVIDADE: quem escreveu "não continuaremos" não fez pergunta, e é o caso
 *   mais importante de todos. Idem quem avisou que não vai conseguir pagar.
 * - DEFINIÇÃO: em `promessa_sem_desfecho` a dívida da escola É o tipo — se ela
 *   prometeu e não voltou, ela deve, e perguntar ao modelo se "precisa
 *   resposta" é redundante. Isso custou um sinal real em 03/09: a Graciele foi
 *   classificada certo (`promessa_sem_desfecho`, confiança alta, resumo "a
 *   escola prometeu cobrar um retorno sobre os valores e a conversa ficou sem
 *   desfecho") e mesmo assim descartada por `precisa_resposta: false`.
 */
const ESCOLA_DEVE = new Set<TipoConversa>([
  "cancelamento_declarado",
  "dificuldade_financeira",
  "promessa_sem_desfecho",
]);

export interface DecisaoSinal {
  emitir: boolean;
  regra_codigo: string | null;
  motivo_descarte: string | null;
}

/**
 * Assimetria deliberada: o erro de NÃO emitir é o comportamento de hoje
 * (ninguém vê nada, e é o que estamos consertando); o erro de emitir lixo
 * chega na lista da guardiã e destrói a confiança no canal — que é o ativo
 * mais caro de reconstruir. Na dúvida, silêncio.
 */
export function decidirSinal(v: VeredictoConversa): DecisaoSinal {
  const nao = (motivo: string): DecisaoSinal => ({
    emitir: false,
    regra_codigo: null,
    motivo_descarte: motivo,
  });

  const regra = REGRA_POR_TIPO[v.tipo] ?? null;
  if (regra === null) return nao(`tipo_sem_regra:${v.tipo}`);

  // Confiança baixa nunca vira item de lista.
  if (v.confianca === "baixa") return nao("confianca_baixa");

  // Tipo em que a escola deve por gravidade ou por definição dispensa o campo.
  if (!v.precisa_resposta && !ESCOLA_DEVE.has(v.tipo)) {
    return nao("nao_precisa_resposta");
  }

  return { emitir: true, regra_codigo: regra, motivo_descarte: null };
}

/**
 * Primeiro dia do mês corrente em BRT (UTC-3). `radar_sinais.competencia` é
 * NOT NULL, e usar UTC erraria o mês inteiro na virada: das 21h à meia-noite
 * BRT o `now()` do banco já está no dia seguinte. Mesma armadilha que a
 * `vw_contratos_vencendo` teve com CURRENT_DATE.
 */
export function competenciaBrt(agora: Date): string {
  const brt = new Date(agora.getTime() - 3 * 3600_000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Semana ISO — mesmo período que o detector SQL já usa em R1/R3/R5/R6. */
export function semanaIso(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((t.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-${String(semana).padStart(2, "0")}`;
}

/**
 * Ancorada na CONVERSA, e não só na entidade: duas conversas distintas do
 * mesmo aluno são dois assuntos. A semana no fim segue o padrão do detector —
 * problema que continua de pé volta a aparecer na semana seguinte.
 */
export function chaveDedup(
  regra: string,
  entidadeTipo: string,
  entidadeId: number | null,
  chaveTelefone: string | null,
  conversaId: number,
  agora: Date,
): string {
  const id = entidadeId ?? chaveTelefone ?? "?";
  return `${regra}|${entidadeTipo}|${id}|c${conversaId}|${semanaIso(agora)}`;
}

/** Uma linha de log por (conversa, última mensagem, versão do prompt). */
export function chaveIdempotencia(
  conversaId: number,
  ultimoMessageId: string,
  promptVersao: string,
): string {
  return `extrator_conversa:${conversaId}:${ultimoMessageId}:${promptVersao}`;
}
