import type { CaixaDiario, CaixaMovimentacao, CaixaResumo } from '@/types/caixa';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

export function formatarMoedaCaixa(value: number): string {
  return brl.format(Number.isFinite(value) ? value : 0);
}

export function formatarInputMoedaCaixa(value: string): string {
  const cents = Number(value.replace(/\D/g, '') || 0);
  return brl.format(cents / 100);
}

export function formatarNumeroComoInputMoedaCaixa(value?: number | null): string {
  const cents = Math.round(Number(value || 0) * 100);
  return brl.format(cents / 100);
}

export function parseMoedaCaixa(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const cents = Number(String(value || '').replace(/\D/g, '') || 0);
  return cents / 100;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatarDataCaixa(dataCaixa: string): string {
  return parseLocalDate(dataCaixa).toLocaleDateString('pt-BR');
}

export function calcularResumoCaixa(
  caixa: Pick<CaixaDiario, 'saldo_inicial_cofre'> | null,
  movimentos: CaixaMovimentacao[]
): CaixaResumo {
  const saldoInicialCofre = caixa?.saldo_inicial_cofre ?? 0;

  const entradasDinheiroCofre = movimentos
    .filter((m) => m.ambiente === 'cofre' && m.tipo === 'entrada' && m.forma_pagamento === 'dinheiro')
    .reduce((total, m) => total + Number(m.valor || 0), 0);

  const saidasDinheiroCofre = movimentos
    .filter((m) => m.ambiente === 'cofre' && m.tipo === 'saida' && m.forma_pagamento === 'dinheiro')
    .reduce((total, m) => total + Number(m.valor || 0), 0);

  const vendasPorForma = (forma: CaixaMovimentacao['forma_pagamento']) =>
    movimentos
      .filter((m) => m.ambiente === 'venda' && m.tipo === 'entrada' && m.forma_pagamento === forma)
      .reduce((total, m) => total + Number(m.valor || 0), 0);

  const vendasDinheiro = vendasPorForma('dinheiro');
  const vendasPix = vendasPorForma('pix');
  const vendasCartao = vendasPorForma('cartao');
  const vendasCheque = vendasPorForma('cheque');
  const vendasTransferencia = vendasPorForma('transferencia');
  const vendasOutro = vendasPorForma('outro');

  return {
    saldoInicialCofre,
    entradasDinheiroCofre,
    saidasDinheiroCofre,
    saldoFinalCalculado: saldoInicialCofre + entradasDinheiroCofre - saidasDinheiroCofre,
    vendasDinheiro,
    vendasPix,
    vendasCartao,
    vendasCheque,
    vendasTransferencia,
    vendasOutro,
    vendasTotal: vendasDinheiro + vendasPix + vendasCartao + vendasCheque + vendasTransferencia + vendasOutro,
  };
}

function linhasMovimentos(movimentos: CaixaMovimentacao[], tipo: 'entrada' | 'saida'): string {
  const linhas = movimentos
    .filter((m) => m.ambiente === 'cofre' && m.tipo === tipo && m.forma_pagamento === 'dinheiro')
    .map((m) => `- ${formatarMoedaCaixa(Number(m.valor))} - ${m.descricao}`);

  return linhas.length > 0 ? linhas.join('\n') : '- R$ 0,00 -';
}

export function formatarRelatorioCaixaWhatsApp(params: {
  caixa: Pick<CaixaDiario, 'data_caixa' | 'saldo_inicial_cofre'>;
  movimentos: CaixaMovimentacao[];
  unidadeNome: string;
  unidadeCodigo: string;
  conferidoPor: string;
}): string {
  const { caixa, movimentos, unidadeNome, unidadeCodigo, conferidoPor } = params;
  const resumo = calcularResumoCaixa(caixa, movimentos);
  const data = formatarDataCaixa(caixa.data_caixa);

  return [
    `*FECHAMENTO DE CAIXA DE ${unidadeNome.toUpperCase()}*`,
    `📆 ${data}`,
    '',
    `💰 *Caixa Cofre Dinheiro - ${unidadeCodigo}*`,
    '',
    `Saldo inicial: *${formatarMoedaCaixa(resumo.saldoInicialCofre)}*`,
    '',
    '🟢 *Entrada do dia:*',
    linhasMovimentos(movimentos, 'entrada'),
    '',
    '🔴 *Saida do dia:*',
    linhasMovimentos(movimentos, 'saida'),
    '',
    '🧾 *Vendas / Caixa Diario:*',
    `- Dinheiro: ${formatarMoedaCaixa(resumo.vendasDinheiro)}`,
    `- Pix: ${formatarMoedaCaixa(resumo.vendasPix)}`,
    `- Cartao: ${formatarMoedaCaixa(resumo.vendasCartao)}`,
    `- Cheque: ${formatarMoedaCaixa(resumo.vendasCheque)}`,
    `- Transferencia: ${formatarMoedaCaixa(resumo.vendasTransferencia)}`,
    '',
    `✅ *Saldo final caixa dia ${data}:* ${formatarMoedaCaixa(resumo.saldoFinalCalculado)}`,
    '',
    `Conferido por: *${conferidoPor || '-'}*`,
    '_Gerado pelo LA Report_',
  ].join('\n');
}
