export type Substantividade =
  | "adiamento"
  | "abertura"
  | "conteudo_substantivo"
  | "opt_out"
  | "indeterminado";

function normalizarParaClassificacao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classificarSubstantividade(
  texto: string | null,
): Substantividade {
  if (!texto?.trim()) return "indeterminado";
  const normalizado = normalizarParaClassificacao(texto);

  // Adiamento = a pessoa promete responder depois. Nao e resposta, e nao pode
  // fechar a pesquisa -- ela continua esperando.
  //
  // A versao anterior exigia o verbo ANTES do tempo e acertava 5 de 15 formas
  // comuns. Falhava por duas razoes distintas:
  //   vocabulario -- "MANDO mais tarde", "envio depois", "depois te RETORNO";
  //   ordem       -- "DAQUI A POUCO eu respondo" (o verbo estava na lista!).
  // Caso real (Joachim, 05/08/2026): "Mando mais tarde" virou a resposta
  // oficial da pesquisa, que fechou com isso; o feedback de verdade chegou 21
  // dias depois e nunca entrou.
  //
  // Agora os dois lados sao listas e a ordem entre eles e livre, com a
  // distancia limitada para nao casar frase inteira por acidente. Continua
  // sendo peneira barata, nao entendedor de linguagem: o caso dificil e do
  // classificador semantico.
  const VERBOS =
    "respondo|responder|responderei|mando|mandar|envio|enviar|retorno|" +
    "retornar|falo|falar|falamos|vejo|olho|olhar";
  const MARCADORES =
    "amanha|depois|mais tarde|daqui a pouco|ja ja|hoje a noite|a noite|" +
    "com calma|assim que puder|quando der|na segunda|semana que vem";

  if (
    new RegExp(`\\b(${VERBOS})\\b.{0,25}?\\b(${MARCADORES})\\b`)
      .test(normalizado) ||
    new RegExp(`\\b(${MARCADORES})\\b.{0,25}?\\b(${VERBOS})\\b`)
      .test(normalizado) ||
    /\b(agora nao|agora nao posso|sem tempo agora|to sem tempo|estou sem tempo|nao posso agora)\b/
      .test(normalizado)
  ) {
    return "adiamento";
  }

  if (
    /\b(nao quero responder|nao me mande mais mensagens|pare de mandar mensagens?|remova (o )?meu numero)\b/
      .test(normalizado)
  ) {
    return "opt_out";
  }

  if (
    /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|entao|pois e)$/i
      .test(normalizado) ||
    /^(?:(?:oi|ola|olha) )?deixa eu te (?:falar|contar)(?: uma (?:coisa|coisinha))?$/i
      .test(normalizado)
  ) {
    return "abertura";
  }

  return normalizado.split(" ").filter(Boolean).length >= 3
    ? "conteudo_substantivo"
    : "indeterminado";
}
