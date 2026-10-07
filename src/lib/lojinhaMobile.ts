/**
 * Regras da LOJINHA no celular (LAPE-32).
 *
 * 🔴 O corte aqui é de FORMA, não de conteúdo. A Lojinha não tem os defeitos
 * das outras abas: medida a 390px com unidade escolhida, ela **não rola para
 * o lado, não trunca e quase não tem alvo pequeno** — os filtros foram
 * corrigidos em 24/09. O que ela tem é volume: 19.509px somados nas cinco
 * sub-abas, e **7.496px (8,9 telas) só em Produtos**.
 *
 * A causa é medida: a tabela já vira cartão no celular, mas empilha as NOVE
 * colunas como nove linhas de rótulo e valor — **326px por produto**, 20
 * produtos, 6.520px. No balcão a pergunta sobre um produto tem três palavras:
 * *tem? quanto custa?* Nome, preço e estoque respondem; SKU, categoria,
 * variações, comissão e status são detalhe de cadastro e saem da frente sem
 * deixar de existir.
 *
 * ⚠️ Nada aqui busca dado. A tela recebe os produtos que a `TabProdutos` já
 * carregou e devolve, por callback, qual modal abrir — os mesmos do
 * computador.
 */

/** O subconjunto de `LojaProduto` que estas regras leem. */
export interface ProdutoLike {
  id: number;
  nome: string;
  sku?: string | null;
  preco: number;
  custo?: number | null;
  categoria_id?: number | null;
  estoque_minimo: number;
  comissao_especial?: number | null;
  ativo: boolean;
  estoque_total?: number;
  variacoes_count?: number;
  loja_categorias?: { id?: number; nome: string; icone?: string } | null;
}

export type NivelEstoque = 'sem' | 'baixo' | 'ok';

/**
 * Em que pé está o estoque deste produto.
 *
 * ⚠️ A régua do "baixo" é a MESMA do desktop (`estoque_total < estoque_minimo`),
 * e é o que o filtro "estoque baixo" dele já usa. Inventar um limiar próprio
 * aqui faria a pílula da linha discordar do chip que a filtra — duas verdades
 * sobre o mesmo produto na mesma tela.
 *
 * ⚠️ `sem` é separado de `baixo` de propósito: os dois pedem reposição, mas só
 * o `sem` impede a venda que está acontecendo agora, no balcão.
 */
export function nivelDeEstoque(p: ProdutoLike): NivelEstoque {
  const total = p.estoque_total ?? 0;
  if (total <= 0) return 'sem';
  if (total < p.estoque_minimo) return 'baixo';
  return 'ok';
}

export type StatusFiltro = 'todos' | 'ativos' | 'inativos' | 'estoque_baixo';

export interface FiltrosLike {
  busca: string;
  categoria_id: number | null;
  status: StatusFiltro;
}

/**
 * O predicado de filtro, em fonte única.
 *
 * 🔴 Extraído do corpo da `TabProdutos` **sem mudar uma comparação**: o
 * desktop passa a chamar esta função em vez de repetir o `filter` inline. As
 * duas telas filtram a mesma lista e não podem discordar sobre quantos
 * produtos existem — e o chip do celular exibe a contagem, o que torna a
 * divergência visível na hora.
 *
 * ⚠️ `estoque_baixo` aqui é `< estoque_minimo`, e portanto **inclui o
 * zerado** — é assim no desktop e mexer nisso mudaria o número que ele
 * mostra.
 */
export function produtoPassaNoFiltro(p: ProdutoLike, f: FiltrosLike): boolean {
  if (f.busca) {
    const busca = f.busca.toLowerCase();
    if (!p.nome.toLowerCase().includes(busca) && !p.sku?.toLowerCase().includes(busca)) {
      return false;
    }
  }
  if (f.categoria_id && p.categoria_id !== f.categoria_id) return false;
  if (f.status === 'ativos' && !p.ativo) return false;
  if (f.status === 'inativos' && p.ativo) return false;
  if (f.status === 'estoque_baixo' && (p.estoque_total || 0) >= p.estoque_minimo) return false;
  return true;
}

export function filtrarProdutos<T extends ProdutoLike>(produtos: readonly T[], f: FiltrosLike): T[] {
  return produtos.filter((p) => produtoPassaNoFiltro(p, f));
}

export interface ContagemDosChips {
  todos: number;
  semEstoque: number;
  estoqueBaixo: number;
  inativos: number;
}

/**
 * Os números que os chips exibem.
 *
 * ⚠️ Contam sobre a lista INTEIRA, nunca sobre a já filtrada: um chip que
 * mostra o tamanho do próprio recorte não ajuda a decidir se vale tocá-lo —
 * ele diria "11" depois de clicado e "11" antes, sem informar nada.
 *
 * ⚠️ `estoqueBaixo` exclui o zerado aqui, ao contrário do filtro do desktop,
 * porque os dois chips aparecem LADO A LADO: somar o zerado nos dois faria as
 * contagens se sobreporem sem que nada na tela explicasse por quê.
 */
export function contarChips(produtos: readonly ProdutoLike[]): ContagemDosChips {
  let semEstoque = 0;
  let estoqueBaixo = 0;
  let inativos = 0;
  for (const p of produtos) {
    const nivel = nivelDeEstoque(p);
    if (nivel === 'sem') semEstoque += 1;
    if (nivel === 'baixo') estoqueBaixo += 1;
    if (!p.ativo) inativos += 1;
  }
  return { todos: produtos.length, semEstoque, estoqueBaixo, inativos };
}

/** `R$ 50` / `R$ 1.240` — sem centavos, que numa linha de 62px é ruído. */
export function formatarPreco(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: valor % 1 === 0 ? 0 : 2,
  });
}

/**
 * A segunda linha do produto: preço e categoria.
 *
 * ⚠️ Sem a categoria quando ela não existe — "R$ 50,00 · —" gasta o mesmo
 * espaço para dizer que não sabe.
 */
export function subtituloDoProduto(p: ProdutoLike): string {
  const partes = [formatarPreco(p.preco)];
  const categoria = p.loja_categorias?.nome?.trim();
  if (categoria) partes.push(categoria);
  return partes.join(' · ');
}

/** O que a ficha mostra, na ordem em que a tela pergunta. */
export interface LinhaDaFicha {
  rotulo: string;
  valor: string;
}

/**
 * O cadastro que saiu da linha e mora na ficha.
 *
 * 🔴 Este array é a prova de que nada sumiu: cada coluna que a tabela do
 * computador exibia e a linha não exibe mais tem de aparecer aqui. Há teste
 * cobrando a correspondência.
 */
export function fichaDoProduto(p: ProdutoLike): LinhaDaFicha[] {
  return [
    { rotulo: 'SKU', valor: p.sku?.trim() || '—' },
    { rotulo: 'Categoria', valor: p.loja_categorias?.nome?.trim() || '—' },
    {
      rotulo: 'Variações',
      valor: p.variacoes_count && p.variacoes_count > 0 ? String(p.variacoes_count) : '—',
    },
    {
      rotulo: 'Comissão',
      valor:
        typeof p.comissao_especial === 'number'
          ? `Especial (${p.comissao_especial}%)`
          : 'Padrão',
    },
    { rotulo: 'Estoque mínimo', valor: String(p.estoque_minimo) },
    { rotulo: 'Custo', valor: typeof p.custo === 'number' ? formatarPreco(p.custo) : '—' },
    { rotulo: 'Status', valor: p.ativo ? 'Ativo' : 'Inativo' },
  ];
}

/**
 * As sub-abas da Lojinha que a versão do celular cobre.
 *
 * ⚠️ Declarado aqui para a tela poder DIZER o que ficou no computador, em vez
 * de omitir em silêncio. Comissões é dinheiro de gente e Configurações muda
 * regra de percentual: as duas são leitura e edição de mesa.
 */
export const SUBABAS_NO_COMPUTADOR = ['Comissões', 'Configurações'] as const;
