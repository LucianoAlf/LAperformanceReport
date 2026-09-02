/**
 * Agradecimento automatico apos a resposta da pesquisa de evasao -- REGRA PURA.
 *
 * Contexto da decisao (02/09/2026, Hugo): o agradecimento vai direto a producao,
 * sem o estagio "Crawl" (humano aprova cada envio) que o AI Engineering recomenda,
 * porque o volume e de 6-12 respostas/mes -- o minimo de ~300 exemplos de eval que
 * o livro pede levaria anos para juntar. A contrapartida acordada e observabilidade
 * em tempo real (log no topico Logs do Lia Core) + as guardas deste arquivo.
 *
 * ⚠️ QUEM DECIDE AGRADECER NAO E ESTE ARQUIVO, e sim `decidirAgradecimento()` em
 * `classificar-resposta-evasao/contract.ts`, sobre o que o LLM relatou. Aqui ficam
 * apenas as guardas de OPERACAO: kill switch, idempotencia, frescor e teto. A
 * divisao importa: o julgamento do texto e uma pergunta; "pode mandar agora?" e
 * outra, e so a segunda protege contra envio em lote.
 *
 * O LLM nunca decide enviar. Ele preenche 4 campos; codigo deterministico decide.
 */

/**
 * Quanto tempo depois de a analise fechar o agradecimento ainda faz sentido.
 *
 * ⚠️ Existe por um caso concreto: a resposta do Heitor e de 31/08 e segue sem
 * analise (LAPE-4). No dia em que ela for destravada, sem esta janela sairia um
 * "obrigada pelo seu retorno" tres dias depois de a conversa ter morrido. Vale
 * para qualquer reprocessamento de analise antiga, que e o modo mais provavel de
 * este robo constranger alguem.
 */
export const JANELA_FRESCOR_MS = 6 * 60 * 60 * 1000;

/**
 * Teto por dia. Com 6-12 respostas/mes ele nunca estorva o uso real -- existe
 * para que um bug de reprocessamento custe 3 mensagens em vez da base inteira.
 * O kill switch e a reacao humana depois que alguem ve; o teto age sozinho antes.
 */
export const TETO_DIARIO_AGRADECIMENTO = 3;

export interface VeredictoAgradecimento {
  agradecer: boolean;
  motivo_nao_agradecer: string | null;
}

export interface EstadoAgradecimento {
  /** `automacoes_config.ativo` do slug `auto_agradecimento_evasao`. */
  automacaoAtiva: boolean;
  /** Veredito ja gravado pelo classificador. `null` = ele nao rodou. */
  classificacao: VeredictoAgradecimento | null;
  /** Ja existe registro de agradecimento para esta (pesquisa, versao). */
  jaAgradecido: boolean;
  /** `pesquisa_evasao_analises.encerrada_em` da versao em questao. */
  analiseEncerradaEm: string | null;
  /** Agradecimentos enviados hoje, em toda a base. */
  enviadosHoje: number;
}

export type DecisaoAgradecimento =
  | { acao: "enviar" }
  | { acao: "nao_enviar"; motivo: string };

/**
 * A ordem dos portoes e escolhida pelo LOG, nao pela logica: quando varios
 * motivos valem ao mesmo tempo, o relatado deve ser o que responde "por que este
 * caso nao saiu?" para quem esta lendo. Por isso o kill switch vem primeiro
 * (quem desligou precisa ler "desligada", nunca "teto diario") e a idempotencia
 * vem antes de janela e teto (ja enviado e fato consumado -- reportar "teto"
 * esconderia que a mensagem ja saiu).
 */
export function decidirEnvioAgradecimento(
  estado: EstadoAgradecimento,
  agora: Date,
): DecisaoAgradecimento {
  const nao = (motivo: string): DecisaoAgradecimento => ({
    acao: "nao_enviar",
    motivo,
  });

  if (!estado.automacaoAtiva) return nao("automacao_desligada");

  // Fail-closed: sem veredito nao ha julgamento do texto, e mandar sem julgamento
  // e exatamente o que a arquitetura existe para impedir.
  if (!estado.classificacao) return nao("sem_classificacao");

  if (!estado.classificacao.agradecer) {
    // O motivo do classificador viaja junto no log. Sem ele nao da para saber se
    // os portoes estao calibrados -- e 3 dos 4 nunca foram exercitados por dado
    // real ate aqui (medido em 02/09: `contem_pergunta` e `pede_atendimento`
    // deram false em 6 de 6 respostas da base).
    return nao(`classificador:${estado.classificacao.motivo_nao_agradecer ?? "motivo_ausente"}`);
  }

  if (estado.jaAgradecido) return nao("ja_agradecido");

  const fechamento = estado.analiseEncerradaEm
    ? Date.parse(estado.analiseEncerradaEm)
    : Number.NaN;
  if (!Number.isFinite(fechamento)) return nao("sem_data_de_fechamento");

  const idade = agora.getTime() - fechamento;
  // Relogio torto ou dado corrompido deixaria a janela "sempre dentro".
  if (idade < 0) return nao("fechamento_no_futuro");
  if (idade > JANELA_FRESCOR_MS) return nao("fora_da_janela");

  if (estado.enviadosHoje >= TETO_DIARIO_AGRADECIMENTO) return nao("teto_diario");

  return { acao: "enviar" };
}
