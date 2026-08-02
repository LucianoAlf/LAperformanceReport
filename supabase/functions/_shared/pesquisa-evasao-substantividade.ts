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

  if (
    /\b(respondo|responder|falo|falamos)\b.*\b(amanha|depois|mais tarde|daqui a pouco)\b/
      .test(normalizado) ||
    /\b(agora nao|depois eu respondo)\b/.test(normalizado)
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
