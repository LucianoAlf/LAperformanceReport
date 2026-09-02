// Arquivo GERADO nao e consumo. `src/types/database.types.ts` lista TODAS as
// tabelas e funcoes do banco; conta-lo como fonte faz 100% do catalogo parecer
// ATIVA. Aconteceu de verdade em 02/09/2026: regenerar os tipos levou o contador
// de 439 para 1148 ATIVA e zerou ORFA, SO-INTERNA e LEGADO de uma vez.
export const ARQUIVOS_GERADOS = [/database\.types\.ts$/, /\.gerado\./];

export function ehArquivoGerado(caminhoRelativo) {
  const normalizado = caminhoRelativo.split('\\').join('/');
  return ARQUIVOS_GERADOS.some((padrao) => padrao.test(normalizado));
}
