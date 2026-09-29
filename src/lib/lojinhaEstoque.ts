/**
 * Regras da aba ESTOQUE da Lojinha — fonte única do computador e do celular
 * (LAPE-32, 29/09/2026).
 *
 * Existe porque as duas telas mostram a mesma lista e não podem discordar
 * sobre quantos produtos existem, em que nível cada variação está, nem sobre
 * o que a busca encontra. O agrupamento foi EXTRAÍDO do corpo da
 * `TabEstoque` sem mudar uma comparação.
 *
 * ⚠️ Nada aqui busca dado: são funções puras sobre o que a `TabEstoque` já
 * carregou.
 */

/** O subconjunto de uma linha de `loja_estoque` (com os joins) que estas regras leem. */
export interface LinhaEstoqueLike {
  produto_id: number;
  variacao_id: number | null;
  quantidade: number;
  updated_at?: string | null;
  loja_produtos?: {
    nome?: string | null;
    estoque_minimo?: number | null;
    loja_categorias?: { nome?: string | null; icone?: string | null } | null;
  } | null;
  loja_variacoes?: { nome?: string | null } | null;
}

export interface VariacaoEstoque {
  variacao_id: number | null;
  variacao_nome: string | null;
  quantidade: number;
  minimo: number;
  ultima_mov: string | null;
}

export interface GrupoEstoque {
  produto_id: number;
  produto_nome: string;
  icone: string;
  variacoes: VariacaoEstoque[];
}

/**
 * O mínimo quando o produto não declara um. É o MESMO 5 que a `TabEstoque`
 * sempre usou — tanto no agrupamento quanto no cálculo dos alertas.
 */
export const ESTOQUE_MINIMO_PADRAO = 5;

/**
 * Uma linha por produto, com as variações dentro.
 *
 * ⚠️ A ORDEM é a do id do produto, crescente — e não a alfabética, embora a
 * consulta da `TabEstoque` peça `order('loja_produtos(nome)')`. O código de
 * antes agrupava num objeto com o `produto_id` como chave e devolvia
 * `Object.values(...)`, e o JavaScript enumera chaves numéricas em ordem
 * crescente: a ordenação por nome se perdia ali, em silêncio. É a ordem que o
 * computador sempre exibiu, e esta extração a preserva de propósito — mudá-la
 * seria mudar o desktop. Provado contra o reduce antigo em
 * `tests/lojinhaEstoque.test.mjs`.
 */
export function agruparEstoque(linhas: readonly LinhaEstoqueLike[]): GrupoEstoque[] {
  const porProduto = new Map<number, GrupoEstoque>();
  for (const e of linhas) {
    let grupo = porProduto.get(e.produto_id);
    if (!grupo) {
      grupo = {
        produto_id: e.produto_id,
        produto_nome: e.loja_produtos?.nome || '',
        icone: e.loja_produtos?.loja_categorias?.icone || '📦',
        variacoes: [],
      };
      porProduto.set(e.produto_id, grupo);
    }
    grupo.variacoes.push({
      variacao_id: e.variacao_id,
      variacao_nome: e.loja_variacoes?.nome || null,
      quantidade: e.quantidade,
      minimo: e.loja_produtos?.estoque_minimo || ESTOQUE_MINIMO_PADRAO,
      ultima_mov: e.updated_at ?? null,
    });
  }
  return [...porProduto.values()].sort((a, b) => a.produto_id - b.produto_id);
}

export type NivelVariacao = 'zerado' | 'atencao' | 'ok';

/**
 * A régua da coluna Status do computador: zero é zerado, abaixo do mínimo é
 * atenção, o resto está ok. Mesmos limites da tabela — a pílula do celular e
 * o selo do computador não podem discordar sobre a mesma variação.
 */
export function nivelDaVariacao(v: Pick<VariacaoEstoque, 'quantidade' | 'minimo'>): NivelVariacao {
  if (v.quantidade === 0) return 'zerado';
  if (v.quantidade < v.minimo) return 'atencao';
  return 'ok';
}

/**
 * O que a caixa "Buscar..." encontra.
 *
 * 🔴 Até 29/09/2026 a caixa guardava o texto e NÃO filtrava nada: a pessoa
 * digitava, a lista seguia igual, e a conclusão natural era "esse produto não
 * existe no estoque".
 *
 * Encontra pelo nome do produto OU pelo nome de uma variação ("GG" acha as
 * camisetas GG). O produto que casa aparece com TODAS as variações — cortar
 * as outras esconderia justamente o tamanho que tem para oferecer no lugar.
 *
 * ⚠️ Mesma comparação da busca de Produtos (`toLowerCase` + `includes`): duas
 * buscas na mesma Lojinha não podem reagir diferente ao mesmo texto.
 */
export function filtrarEstoquePorBusca<T extends GrupoEstoque>(grupos: readonly T[], busca: string): T[] {
  const termo = busca.trim().toLowerCase();
  if (!termo) return [...grupos];
  return grupos.filter(
    (g) =>
      g.produto_nome.toLowerCase().includes(termo) ||
      g.variacoes.some((v) => (v.variacao_nome ?? '').toLowerCase().includes(termo)),
  );
}

/**
 * O nome no título da tabela.
 *
 * 🔴 O título dizia "Estoque — Barra" para QUALQUER unidade que não fosse o
 * Consolidado: o nome estava escrito fixo no código, e quem estava em Campo
 * Grande lia Barra. Sem o nome em mãos, o título diz "Unidade" — escrever
 * uma unidade que ninguém escolheu é pior do que não dizer qual.
 */
export function tituloDaUnidade(unidadeId: string | null | undefined, nomeUnidade: string | null): string {
  if (unidadeId === 'todos') return 'Consolidado';
  return nomeUnidade?.trim() || 'Unidade';
}
