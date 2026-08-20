/**
 * Redirecionamento de atendimento — regra pura da tool `redirecionar_atendimento`.
 *
 * Quem escreve na caixa da campanha nem sempre é lead: aluno e responsável
 * caem ali com assunto de secretaria. Antes disso existir, o autoreply da caixa
 * (`numeros_meta.auto_reply_message`) era a única saída — e ele só roda quando
 * NÃO há agente ativo (`else if` em `meta-webhook-campanhas`), então com a Mila
 * respondendo o texto ficava inalcançável e ela empurrava o funil de vendas.
 *
 * O texto dos canais continua vindo daquele mesmo campo — fonte única, editável
 * em Campanhas → Config → Número Meta. A tool só embrulha: intro escrita pelo
 * agente na hora + canais da caixa + fecho configurado no agente.
 */

export const JANELA_DEBOUNCE_REDIRECIONAMENTO_MS = 10 * 60 * 1000

export interface PartesRedirecionamento {
  /** Frase de abertura escrita pelo agente, reagindo ao que a pessoa disse. */
  intro?: string | null
  /** `numeros_meta.auto_reply_message` — os telefones, intactos. */
  canais?: string | null
  /** Frase fixa do agente (ex.: convite para voltar a falar da campanha). */
  fecho?: string | null
}

function limpar(valor: string | null | undefined): string {
  return (valor ?? '').trim()
}

/**
 * Monta a mensagem única do redirecionamento.
 *
 * Devolve `null` quando a caixa não tem texto de canais: sem ele não há
 * telefone a passar, e inventar um seria pior que não responder — quem chama
 * devolve a decisão ao modelo.
 */
export function montarMensagemRedirecionamento(partes: PartesRedirecionamento): string | null {
  const canais = limpar(partes.canais)
  if (!canais) return null

  return [limpar(partes.intro), canais, limpar(partes.fecho)]
    .filter(parte => parte.length > 0)
    .join('\n\n')
}

export interface JanelaRedirecionamento {
  ultimoEnvioIso?: string | null
  agoraIso: string
  janelaMs?: number
}

/**
 * O bot continua ativo depois de redirecionar (decisão do Hugo), então quem
 * insiste mandaria o contato receber a lista de telefones a cada mensagem.
 * A janela corta a repetição sem calar o agente.
 */
export function podeEnviarRedirecionamento(janela: JanelaRedirecionamento): boolean {
  const ultimo = limpar(janela.ultimoEnvioIso)
  if (!ultimo) return true

  const ultimoMs = Date.parse(ultimo)
  const agoraMs = Date.parse(janela.agoraIso)
  // Data ilegível não pode virar mordaça: na dúvida, envia.
  if (Number.isNaN(ultimoMs) || Number.isNaN(agoraMs)) return true

  return agoraMs - ultimoMs >= (janela.janelaMs ?? JANELA_DEBOUNCE_REDIRECIONAMENTO_MS)
}

type SessionData = Record<string, unknown> | null | undefined

export function marcarRedirecionamento(
  sessionData: SessionData,
  agoraIso: string,
): Record<string, unknown> {
  return { ...(sessionData ?? {}), redirecionado_em: agoraIso }
}

/**
 * Instrução injetada no system prompt de quem já foi redirecionado.
 *
 * É sobre INICIATIVA, não sobre silêncio: a proibição é reofertar a campanha
 * por conta própria. Quem puxar o assunto continua sendo atendido — o prompt
 * do Feirão já mandava recuar com o lead desinteressado e o modelo insistiu
 * mesmo assim (caso de 18/08), por isso a regra vira fato no contexto em vez
 * de mais uma linha de instrução genérica.
 */
export function instrucaoModoPassivo(sessionData: SessionData): string | null {
  const marca = limpar((sessionData ?? {})['redirecionado_em'] as string | undefined)
  if (!marca) return null

  return [
    '## Esta pessoa já foi redirecionada para a secretaria',
    'Você já mandou os canais de atendimento nesta conversa.',
    'NÃO reofereça a campanha, NÃO envie botões e NÃO retome o fluxo de vendas por conta própria.',
    'Responda curto e cordial ao que ela disser.',
    'Só volte a falar da campanha se ela mesma perguntar — aí responda normalmente.',
  ].join('\n')
}
