/**
 * Identidade do lancamento de caixa: de onde veio e se da para ligar ao DRE.
 *
 * O caixa registra dois tipos de dinheiro que parecem iguais na tela e nao sao:
 *
 *   - entrada COM fatura do Emusys -> ja entrou no Super Folha pelo sync de faturas.
 *     Lancar de novo como receita inventaria faturamento (R$ 130.781,56 so em agosto).
 *     Aqui o caixa e' baixa, nao receita.
 *   - entrada SEM fatura (lojinha, venda de balcao) -> receita nova, que hoje nao tem
 *     porta nenhuma: `contas_receber` e' espelho do sync (3.320 linhas, todas com
 *     emusys_fatura_id, zero manuais), entao nao existe onde lancar isso a mao.
 *
 * `fatura_id` e' o unico campo que separa os dois casos. Sem ele nao da para automatizar
 * nada sem duplicar. Medido em 08/09/2026: a Sol grava em 88% do que lanca; o formulario
 * manual do app, em 19% — porque o campo nunca existiu na tela.
 */
import type { CaixaCategoria, CaixaTipoMovimento } from '@/types/caixa';

/** Prefixo que a Sol grava em `criado_por` ao lancar pelo grupo do WhatsApp. */
const PREFIXO_SOL = 'sol-agente:';
const PREFIXO_MIGRACAO = 'migracao:';

export type OrigemLancamento = 'sol' | 'humano' | 'migracao' | 'desconhecida';

/**
 * De onde veio o lancamento. Os dois pontos no prefixo importam: sem eles, "Solange"
 * viraria lancamento da Sol.
 */
export function origemDoLancamento(criadoPor: string | null | undefined): OrigemLancamento {
  const valor = (criadoPor ?? '').trim();
  if (!valor) return 'desconhecida';
  if (valor.startsWith(PREFIXO_SOL)) return 'sol';
  if (valor.startsWith(PREFIXO_MIGRACAO)) return 'migracao';
  return 'humano';
}

/**
 * Categorias de ENTRADA que podem corresponder a uma fatura de aluno.
 * Saida nunca entra aqui: retirada, seguranca e despesa nao tem fatura.
 * Lojinha entra mesmo raramente tendo fatura — e' justamente o caso em que a resposta
 * "nao tem" precisa ser registrada em vez de presumida.
 */
export const CATEGORIAS_COM_IDENTIDADE: readonly CaixaCategoria[] = [
  'parcela',
  'passaporte',
  'lojinha',
];

export function exigeIdentidade(tipo: CaixaTipoMovimento, categoria: CaixaCategoria): boolean {
  if (tipo !== 'entrada') return false;
  return CATEGORIAS_COM_IDENTIDADE.includes(categoria);
}

/**
 * Lancamento cego: pede identidade e nao tem. Nao e' erro de quem digitou — e' uma
 * linha que o DRE nao consegue classificar sem adivinhar.
 */
export function lancamentoCego(mov: {
  tipo: CaixaTipoMovimento;
  categoria: CaixaCategoria;
  fatura_id?: string | null;
}): boolean {
  return exigeIdentidade(mov.tipo, mov.categoria) && !mov.fatura_id;
}
