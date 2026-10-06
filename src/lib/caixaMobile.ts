/**
 * O Caixa no celular (LAPE-32, 06/10/2026).
 *
 * Medido a 390px: 4,4 telas, a lista de lançamentos só começava a 1.091px e
 * a tabela de 900px deixava valor, responsável e os botões de editar e
 * excluir FORA da tela. No celular cada lançamento vira uma linha de extrato
 * — direção, descrição, detalhe e valor com sinal —, e lançar, fechar e a
 * mensagem do WhatsApp abrem em folhas com os MESMOS componentes do
 * computador.
 *
 * Aqui mora só o que é decisão de exibição. Nada é recalculado: o saldo e as
 * vendas vêm de `calcularResumoCaixa`, como no computador.
 */

import { obterNomeCategoriaCaixa, type CaixaCategoria as CaixaCategoriaRecord } from './caixaCategorias';
import { formatarMoedaCaixa } from './caixaFinanceiro';
import type { CaixaFormaPagamento, CaixaMovimentacao, NovaCaixaMovimentacaoInput } from '../types/caixa';

const ROTULO_FORMA: Record<CaixaFormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Cartão',
  cheque: 'Cheque',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export interface LinhaExtrato {
  id: string;
  entrada: boolean;
  descricao: string;
  /** "Pix · Parcela · Mayra · via Sol" — o que a tabela tinha em colunas. */
  detalhe: string;
  /** Com sinal: "+R$ 407,00" / "−R$ 50,00". */
  valor: string;
}

export function rotuloFormaCaixa(mov: Pick<CaixaMovimentacao, 'forma_pagamento' | 'cartao_modalidade' | 'cartao_parcelas'>): string {
  const base = ROTULO_FORMA[mov.forma_pagamento] ?? mov.forma_pagamento;
  if (mov.forma_pagamento !== 'cartao' || !mov.cartao_modalidade) return base;
  if (mov.cartao_modalidade === 'debito') return 'Cartão débito';
  return `Cartão crédito${mov.cartao_parcelas ? ` ${mov.cartao_parcelas}x` : ''}`;
}

export function linhaExtratoCaixa(mov: CaixaMovimentacao, categorias: CaixaCategoriaRecord[]): LinhaExtrato {
  const entrada = mov.tipo === 'entrada';
  const partes = [
    // Só a exceção ganha rótulo: escrito em toda linha, "Venda" empurrava o
    // responsável para fora (medido a 390px: "Mayra · vi…").
    mov.ambiente === 'cofre' ? 'Cofre' : null,
    rotuloFormaCaixa(mov),
    obterNomeCategoriaCaixa(mov.categoria, categorias),
    mov.responsavel?.trim() || null,
  ].filter(Boolean);
  return {
    id: mov.id,
    entrada,
    descricao: mov.descricao,
    detalhe: partes.join(' · '),
    valor: `${entrada ? '+' : '−'}${formatarMoedaCaixa(Number(mov.valor))}`,
  };
}

/**
 * Os valores com que a edição abre. Era um literal dentro da tabela do
 * computador; o celular abre o MESMO formulário com os MESMOS valores, então
 * a regra mora aqui — se um campo novo entrar só num lugar, a edição de um
 * dos dois apagaria o campo ao salvar.
 */
export function valoresIniciaisDoMovimento(mov: CaixaMovimentacao): Partial<NovaCaixaMovimentacaoInput> {
  return {
    ambiente: mov.ambiente,
    tipo: mov.tipo,
    forma_pagamento: mov.forma_pagamento,
    categoria: mov.categoria,
    descricao: mov.descricao,
    valor: Number(mov.valor),
    cartao_modalidade: mov.cartao_modalidade,
    cartao_parcelas: mov.cartao_parcelas,
    link_pagamento: mov.link_pagamento,
    responsavel: mov.responsavel || undefined,
  };
}

export interface DestaqueCofre {
  rotulo: string;
  valor: number;
  /** Só quando o conferido difere do previsto: a diferença é o que importa. */
  nota: string | null;
}

/**
 * O número grande do topo. "No cofre agora" só é verdade no caixa de HOJE e
 * aberto; num dia fechado o fato é o que foi CONFERIDO, e o previsto aparece
 * ao lado só se divergir.
 */
export function destaqueDoCofre(p: { fechado: boolean; ehHoje: boolean; previsto: number; conferido: number | null }): DestaqueCofre {
  if (p.fechado && p.conferido != null) {
    const dif = Math.round((p.conferido - p.previsto) * 100) / 100;
    return {
      rotulo: 'Conferido no fechamento',
      valor: p.conferido,
      nota: dif === 0 ? null : `previsto ${formatarMoedaCaixa(p.previsto)} · diferença ${dif > 0 ? '+' : '−'}${formatarMoedaCaixa(Math.abs(dif))}`,
    };
  }
  return { rotulo: p.ehHoje && !p.fechado ? 'No cofre agora' : 'Saldo previsto do cofre', valor: p.previsto, nota: null };
}

/** "seg, 06/10" a partir de "2026-10-06" — sem fuso, a data é do caixa. */
export function rotuloDiaCaixa(dataIso: string): string {
  const [a, m, d] = dataIso.split('-').map(Number);
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
