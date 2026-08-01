export type PublicoPesquisaEvasao = "direto" | "responsavel";

export function resolverPublicoPesquisa(
  dataNascimento: string | null,
  agora = new Date(),
): PublicoPesquisaEvasao {
  if (!dataNascimento?.trim()) {
    throw new Error("DATA_NASCIMENTO_AUSENTE");
  }

  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataNascimento);
  if (!partes) throw new Error("DATA_NASCIMENTO_INVALIDA");

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const nascimento = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    nascimento.getUTCFullYear() !== ano ||
    nascimento.getUTCMonth() !== mes - 1 ||
    nascimento.getUTCDate() !== dia
  ) {
    throw new Error("DATA_NASCIMENTO_INVALIDA");
  }

  let idade = agora.getUTCFullYear() - ano;
  const antesDoAniversario =
    agora.getUTCMonth() < mes - 1 ||
    (agora.getUTCMonth() === mes - 1 && agora.getUTCDate() < dia);

  if (antesDoAniversario) idade -= 1;

  return idade < 18 ? "responsavel" : "direto";
}
