import { useEffect } from 'react';

/**
 * Faz cada `<td>` carregar o nome da sua coluna, para o CSS de
 * "tabela vira card" (ver `src/index.css`) poder exibi-lo como rotulo.
 *
 * 🔴 Por que em runtime e nao no JSX: sao 85 arquivos com `<table>` no app.
 * Escrever `data-rotulo` a mao em cada `<td>` seria editar 85 telas, criar
 * 85 oportunidades de o rotulo divergir do cabecalho, e ainda assim deixar a
 * proxima tabela nascendo sem rotulo. Aqui a fonte do rotulo e o proprio
 * `<thead>` — ele nao tem como divergir de si mesmo.
 *
 * ⚠️ Roda SO no celular. No computador o efeito sai na primeira linha e nao
 * toca em nenhum no: a tabela do desktop continua sendo uma tabela.
 *
 * ⚠️ O `MutationObserver` existe porque quase toda tabela do app chega
 * DEPOIS — os dados vem de hook assincrono, e um efeito que rodasse uma vez
 * acharia o `<tbody>` vazio. Ele e desligado junto com o componente.
 */

/** Uma celula "vazia" nao merece linha: rotulo sem valor e ruido. */
const VAZIOS = new Set(['', '-', '—', '–', 'N/A', 'n/a', '--']);

function textoLimpo(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Qual coluna vira o TITULO do card.
 *
 * 🔴 Nao e "a coluna 0". Medido na Lojinha: a coluna 0 e a foto do produto,
 * com `<th>` VAZIO, e o emoji `👕` foi promovido a titulo enquanto "Azul
 * Music Style - G" — o nome de verdade — virou um atributo rotulado
 * "PRODUTO". O card ficou com a cara trocada.
 *
 * A regua e **a primeira coluna que TEM cabecalho**: coluna sem cabecalho
 * nao nomeia atributo nenhum, e por isso mesmo nao nomeia a linha. Alem
 * disso ela precisa carregar texto proprio — caixa de selecao e botao de
 * acao nao sao nome de coisa alguma.
 */
function indiceDoTitulo(cabecalhos: string[], celulas: HTMLTableCellElement[]): number {
  for (let i = 0; i < celulas.length; i++) {
    if (!cabecalhos[i]) continue;
    const celula = celulas[i];
    const texto = textoLimpo(celula);
    if (!texto || VAZIOS.has(texto)) continue;
    if (celula.querySelector('input[type="checkbox"], input[type="radio"]')) continue;
    return i;
  }
  return -1;
}

function rotular(tabela: HTMLTableElement): void {
  if (tabela.dataset.cards === 'nao') return;

  const cabecalhos = Array.from(tabela.querySelectorAll<HTMLTableCellElement>('thead th'))
    .map((th) => textoLimpo(th));
  // Sem cabecalho nao ha rotulo a dar, e um card de valores sem nome e pior
  // que a tabela: deixa como esta.
  if (!cabecalhos.some(Boolean)) {
    tabela.dataset.cards = 'nao';
    return;
  }

  for (const linha of Array.from(tabela.querySelectorAll<HTMLTableRowElement>('tbody tr'))) {
    const celulas = Array.from(linha.cells);
    const iTitulo = indiceDoTitulo(cabecalhos, celulas);
    celulas.forEach((celula, i) => {
      const rotulo = cabecalhos[i] ?? '';
      if (celula.dataset.rotulo !== rotulo) celula.dataset.rotulo = rotulo;

      const vazia = VAZIOS.has(textoLimpo(celula)) && !celula.querySelector('svg, img, button, input');
      const marcaVazia = vazia ? 'sim' : 'nao';
      if (celula.dataset.vazia !== marcaVazia) celula.dataset.vazia = marcaVazia;

      const titulo = i === iTitulo ? 'sim' : 'nao';
      if (celula.dataset.titulo !== titulo) celula.dataset.titulo = titulo;

      // Coluna sem cabecalho (foto, selo, acao) nao ganha rotulo orfao: ela
      // fica alinhada a esquerda, como enfeite da linha, em vez de fingir
      // que e um atributo chamado "".
      const semRotulo = rotulo ? 'nao' : 'sim';
      if (celula.dataset.semrotulo !== semRotulo) celula.dataset.semrotulo = semRotulo;
    });
  }
}

export function useTabelaComoCards(ativo: boolean, raiz: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    if (!ativo) return;
    const alvo = raiz.current;
    if (!alvo) return;

    const passar = () => {
      for (const t of Array.from(alvo.querySelectorAll<HTMLTableElement>('table'))) rotular(t);
    };

    passar();

    // ⚠️ `subtree` e obrigatorio: a tabela costuma nascer varios niveis
    // abaixo, quando o hook de dados responde.
    const observador = new MutationObserver(() => passar());
    observador.observe(alvo, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, [ativo, raiz]);
}
