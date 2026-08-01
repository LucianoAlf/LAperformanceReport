export type TratamentoGramatical = "feminino" | "masculino" | "neutro";

const NOMES_FEMININOS = new Set([
  "ana",
  "antonella",
  "clara",
  "clarice",
  "fabi",
  "fabiola",
  "gabriela",
  "geovana",
  "giovanna",
  "helena",
  "isabela",
  "isabella",
  "jessica",
  "jessyca",
  "julia",
  "katia",
  "lis",
  "livia",
  "luisa",
  "malu",
  "manuela",
  "maria",
  "maristela",
  "olivia",
  "sophia",
  "suzana",
  "tammy",
  "vitoria",
]);

const NOMES_MASCULINOS = new Set([
  "anthony",
  "bernardo",
  "carlos",
  "cauan",
  "daniel",
  "davi",
  "ezequiel",
  "guilherme",
  "heitor",
  "joachim",
  "joao",
  "lorenzo",
  "luciano",
  "marcelo",
  "matheus",
  "miguel",
  "noah",
  "paulo",
  "pedro",
  "samuel",
  "vinicius",
  "vitor",
]);

function primeiroNomeOriginal(nome: string): string {
  const valor = nome.trim().split(/\s+/u)[0] ?? "";
  if (!valor) throw new Error("NOME_AUSENTE");
  return valor;
}

function chave(nome: string): string {
  return primeiroNomeOriginal(nome)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

export function resolverTratamentoGramatical(
  nome: string,
): TratamentoGramatical {
  const valor = chave(nome);
  if (NOMES_FEMININOS.has(valor)) return "feminino";
  if (NOMES_MASCULINOS.has(valor)) return "masculino";
  return "neutro";
}

export function assinaturaComArtigo(nome: string): string {
  const valor = primeiroNomeOriginal(nome);
  const tratamento = resolverTratamentoGramatical(valor);
  if (tratamento === "feminino") return "a " + valor;
  if (tratamento === "masculino") return "o " + valor;
  return valor;
}

export function alunoComPreposicao(nome: string): string {
  const valor = primeiroNomeOriginal(nome);
  const tratamento = resolverTratamentoGramatical(valor);
  if (tratamento === "feminino") return "da " + valor;
  if (tratamento === "masculino") return "do " + valor;
  return "de " + valor;
}
