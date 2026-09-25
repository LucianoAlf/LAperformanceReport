/**
 * Trilho que rola para o lado no celular (LAPE-32).
 *
 * 🔴 De onde veio: o Hugo, no trilho de filas do Administrativo — *"essas tabs
 * de renovações, etc. eu não consigo arrastar pro lado aqui no PC, mas não sei
 * se é uma limitação do PC ou se você não fez"*. Medido a 390px: o trilho rola
 * (`scrollWidth` 1322 contra `clientWidth` 380), e o arrasto com o MOUSE nunca
 * funciona num contêiner de rolagem nativo — o dedo funciona, o ponteiro não.
 * Ou seja, a mecânica estava certa.
 *
 * O que estava errado é o que a medição mostrou ao lado: **7 dos 9 chips ficam
 * fora da vista**, e o último ("Alunos novos", com 42 lançamentos) começa a
 * 1179px — três telas de arrasto. O trilho não dizia que havia mais nada, e a
 * pergunta "não consigo arrastar" é o sintoma disso: ninguém tenta arrastar o
 * que parece terminar ali.
 *
 * Estas duas funções são puras de propósito — a decisão de para onde rolar e
 * de onde esmaecer é aritmética, e aritmética se prova sem navegador.
 */

export interface MedidaDoTrilho {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

export interface MedidaDoItem {
  offsetLeft: number;
  offsetWidth: number;
}

/** Quanto de folga deixar entre o item e a borda do trilho. */
export const FOLGA_PADRAO_PX = 16;

/**
 * Para onde o trilho deve rolar para que `item` fique inteiro à vista.
 *
 * ⚠️ Devolve o `scrollLeft` ATUAL quando o item já está visível. Rolar um item
 * que já se vê é movimento sem informação, e no caso mais comum — o primeiro
 * chip, que abre aceso — centralizá-lo empurraria o trilho para longe do
 * começo, escondendo justamente o que já estava certo.
 *
 * ⚠️ Não centraliza: alinha pela borda mais próxima. Centralizar o último item
 * de uma lista curta deixaria um vão à direita, e o vão parece fim de lista.
 */
export function alvoDeRolagem(
  trilho: MedidaDoTrilho,
  item: MedidaDoItem,
  folga: number = FOLGA_PADRAO_PX,
): number {
  const maximo = Math.max(0, trilho.scrollWidth - trilho.clientWidth);
  const limitar = (v: number) => Math.min(maximo, Math.max(0, v));

  const inicioItem = item.offsetLeft;
  const fimItem = item.offsetLeft + item.offsetWidth;

  if (inicioItem < trilho.scrollLeft + folga) return limitar(inicioItem - folga);
  if (fimItem > trilho.scrollLeft + trilho.clientWidth - folga) {
    return limitar(fimItem - trilho.clientWidth + folga);
  }
  return limitar(trilho.scrollLeft);
}

export interface BordasDoTrilho {
  /** Há conteúdo escondido ANTES do que se vê. */
  temAntes: boolean;
  /** Há conteúdo escondido DEPOIS do que se vê. */
  temDepois: boolean;
}

/** Onde o trilho está: no começo, no meio, no fim, ou sem nada escondido. */
export function bordasDoTrilho(trilho: MedidaDoTrilho, tolerancia = 1): BordasDoTrilho {
  const sobraDepois = trilho.scrollWidth - trilho.clientWidth - trilho.scrollLeft;
  return {
    temAntes: trilho.scrollLeft > tolerancia,
    temDepois: sobraDepois > tolerancia,
  };
}

/**
 * O esmaecimento que diz "tem mais para cá".
 *
 * ⚠️ É DINÂMICO, não uma máscara fixa à direita. A máscara fixa (que o trilho
 * de abas desta mesma tela usa) esmaece a borda direita mesmo depois de a
 * pessoa ter chegado ao fim — então ela mente nas duas pontas: diz que há mais
 * quando acabou, e nunca diz que ficou coisa para trás.
 *
 * ⚠️ Devolve `undefined` quando não há nada escondido de lado nenhum. Aplicar
 * uma máscara "toda preta" custa uma camada de composição em cada quadro de
 * rolagem para não mudar um pixel.
 */
export function mascaraDoTrilho(bordas: BordasDoTrilho, px = 20): string | undefined {
  if (!bordas.temAntes && !bordas.temDepois) return undefined;
  const partes = [
    bordas.temAntes ? 'transparent 0' : 'black 0',
    `black ${px}px`,
    `black calc(100% - ${px}px)`,
    bordas.temDepois ? 'transparent 100%' : 'black 100%',
  ];
  return `linear-gradient(to right, ${partes.join(', ')})`;
}
