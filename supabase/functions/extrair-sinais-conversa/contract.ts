// Regra pura do extrator semântico de conversas (Mapa de Sinais / A5).
// Fora daqui só existe I/O (OpenAI, SOL, banco). Testável sem rede.

export type TipoConversa =
  | "cancelamento_declarado"
  | "dificuldade_financeira"
  | "promessa_sem_desfecho"
  | "reposicao_pedida"
  | "ausencia_ou_doenca"
  | "pergunta_sem_resposta"
  | "retomar_depois"
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
  /**
   * A expressao de tempo LITERAL que a pessoa usou ("em janeiro", "daqui a 3
   * meses"). Vazio quando ela nao deu prazo. 🔴 O modelo NAO converte para
   * data: quem converte e `fn_resolver_prazo_retomada`, no banco. Modelo
   * fazendo aritmetica de calendario erra em silencio, e lembrete no mes
   * errado e pior que lembrete nenhum.
   */
  prazo_texto?: string;
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
  // ⚠️ NAO vira sinal: sinal do radar significa "aja AGORA", e uma retomada
  // marcada para janeiro ficaria meses ocupando a pauta. Vai para
  // `lead_retomada` por `decidirRetomada`, abaixo.
  retomar_depois: null,
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

export interface DecisaoRetomada {
  registrar: boolean;
  motivo_descarte: string | null;
}

/**
 * O BUMERANGUE. Mesma disciplina do `decidirSinal`: o modelo descreve, isto
 * decide.
 *
 * ⚠️ SÓ VALE PARA LEAD. Aluno dizendo "me chama mês que vem" é assunto de
 * retenção (dificuldade financeira, reposição), não de agenda comercial —
 * tratar como retomada tiraria o caso da fila de quem cuida de retenção.
 *
 * ⚠️ CONFIANÇA BAIXA NÃO ENTRA. Um lembrete errado daqui a 3 meses é pior que
 * lembrete nenhum: a consultora não terá contexto para desconfiar dele.
 *
 * ⚠️ SEM FRASE NÃO REGISTRA. `trecho_chave` é o que vai aparecer para ela no
 * dia; sem isso o lembrete é "retomar contato com fulano", que ela ignora.
 * A coluna é NOT NULL no banco, então isto é a primeira das duas guardas.
 */
export function decidirRetomada(
  v: VeredictoConversa,
  entidadeTipo: string | null,
): DecisaoRetomada {
  const nao = (motivo: string): DecisaoRetomada => ({ registrar: false, motivo_descarte: motivo });
  if (v.tipo !== "retomar_depois") return nao(`tipo_nao_e_retomada:${v.tipo}`);
  if (entidadeTipo !== "lead") return nao(`retomada_so_para_lead:${entidadeTipo ?? "desconhecido"}`);
  if (v.confianca === "baixa") return nao("confianca_baixa");
  if (!v.trecho_chave || v.trecho_chave.trim().length < 10) return nao("sem_frase");
  return { registrar: true, motivo_descarte: null };
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
