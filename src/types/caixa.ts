export type CaixaStatus = 'aberto' | 'fechado';
export type CaixaAmbiente = 'cofre' | 'venda';
export type CaixaTipoMovimento = 'entrada' | 'saida';
export type CaixaFormaPagamento = 'dinheiro' | 'pix' | 'cartao' | 'cheque' | 'transferencia' | 'outro';
export type CaixaCategoria = 'lojinha' | 'seguranca' | 'troco' | 'retirada' | 'despesa' | 'outro';

export interface CaixaDiario {
  id: string;
  unidade_id: string;
  data_caixa: string;
  status: CaixaStatus;
  saldo_inicial_cofre: number;
  saldo_final_calculado: number;
  saldo_final_conferido: number | null;
  aberto_em: string;
  aberto_por: string | null;
  fechado_em: string | null;
  fechado_por: string | null;
  observacoes: string | null;
  ultimo_envio_whatsapp_em: string | null;
  ultimo_envio_whatsapp_por: string | null;
  ultimo_envio_whatsapp_status: string | null;
  ultimo_envio_whatsapp_erro: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaixaMovimentacao {
  id: string;
  caixa_diario_id: string;
  unidade_id: string;
  data_movimento: string;
  ambiente: CaixaAmbiente;
  tipo: CaixaTipoMovimento;
  forma_pagamento: CaixaFormaPagamento;
  categoria: CaixaCategoria;
  descricao: string;
  valor: number;
  responsavel: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface NovaCaixaMovimentacaoInput {
  ambiente: CaixaAmbiente;
  tipo: CaixaTipoMovimento;
  forma_pagamento: CaixaFormaPagamento;
  categoria: CaixaCategoria;
  descricao: string;
  valor: number;
  responsavel?: string;
  criado_por?: string;
}

export interface CaixaResumo {
  saldoInicialCofre: number;
  entradasDinheiroCofre: number;
  saidasDinheiroCofre: number;
  saldoFinalCalculado: number;
  vendasDinheiro: number;
  vendasPix: number;
  vendasCartao: number;
  vendasCheque: number;
  vendasTransferencia: number;
  vendasOutro: number;
  vendasTotal: number;
}
