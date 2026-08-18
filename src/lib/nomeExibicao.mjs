// Regra de exibicao de nome de pessoa em listas.
//
// Vive aqui como .mjs (e nao dentro do hook) pelo mesmo motivo de
// `campanhasConversao.mjs`: e logica pura, entao o teste em `tests/` importa o
// mesmo arquivo que a tela usa, sem passar pelo client do Supabase.

const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du']);

/**
 * Abrevia um nome para as primeiras `quantas` palavras significativas.
 *
 * Conectivos ("Ana de Souza") sao ignorados na contagem, senao o corte cairia
 * neles e devolveria "Ana de". Nome com ate `quantas` palavras volta intacto.
 */
export function abreviarNome(nomeCompleto, quantas = 2) {
  const partes = String(nomeCompleto ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= quantas) return partes.join(' ');

  const significativas = partes.filter((p) => !CONECTIVOS.has(p.toLowerCase()));
  // Nome formado so por conectivos nao existe na pratica; se acontecer, e
  // melhor cortar o nome cru do que devolver string vazia.
  const base = significativas.length >= quantas ? significativas : partes;
  return base.slice(0, quantas).join(' ');
}

/**
 * Abrevia uma lista de nomes garantindo que dois nomes diferentes nunca
 * colapsem no mesmo texto.
 *
 * Importa porque o texto abreviado e o que se grava em
 * `professor_360_ocorrencias.registrado_por` (coluna text, sem FK): se duas
 * pessoas virassem "Mayra Alves", nao haveria como desempatar depois quem
 * registrou. Em colisao, os envolvidos ganham uma palavra a mais ate separarem
 * — e quem nao colidiu continua curto.
 */
export function abreviarNomesSemColisao(nomes, quantas = 2) {
  const lista = (nomes || []).map((nome) => String(nome ?? ''));
  const resultado = lista.map((nome) => abreviarNome(nome, quantas));

  const MAX_PALAVRAS = 6;
  for (let n = quantas; n < MAX_PALAVRAS; n++) {
    const ocorrencias = new Map();
    resultado.forEach((abreviado, i) => {
      if (!ocorrencias.has(abreviado)) ocorrencias.set(abreviado, []);
      ocorrencias.get(abreviado).push(i);
    });

    const colididos = [...ocorrencias.values()].filter((idx) => idx.length > 1);
    if (colididos.length === 0) break;

    let mudou = false;
    for (const indices of colididos) {
      // Nomes completos identicos (dois cadastros homonimos) nunca separam:
      // alongar so deixaria os dois longos sem ganho.
      const completosDistintos = new Set(indices.map((i) => lista[i])).size > 1;
      if (!completosDistintos) continue;

      for (const i of indices) {
        const maisLongo = abreviarNome(lista[i], n + 1);
        if (maisLongo !== resultado[i]) {
          resultado[i] = maisLongo;
          mudou = true;
        }
      }
    }
    if (!mudou) break;
  }

  return resultado;
}
