// ============================================
// TIPOS DA LOJINHA LA MUSIC
// ============================================

// Colaboradores (Farmers, Hunters, Gerentes)
export interface Colaborador {
  id: number;
  nome: string;
  apelido: string | null;
  tipo: 'farmer' | 'hunter' | 'gerente' | 'admin';
  unidade_id: string | null;
  whatsapp: string | null;
  email: string | null;
  usuario_id: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Joins
  unidades?: { codigo: string; nome: string };
}

// Categorias de Produtos
export interface LojaCategoria {
  id: number;
  nome: string;
  icone: string;
  ordem: number;
  ativo: boolean;
  created_at: string;
}

// Produtos
export interface LojaProduto {
  id: number;
  nome: string;
  descricao: string | null;
  categoria_id: number | null;
  sku: string | null;
  preco: number;
  custo: number | null;
  estoque_minimo: number;
  comissao_especial: number | null;
  foto_url: string | null;
  disponivel_whatsapp: boolean;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Joins
  loja_categorias?: LojaCategoria;
  loja_variacoes?: LojaVariacao[];
  // Computed
  estoque_total?: number;
  variacoes_count?: number;
}

// Variações de Produtos
export interface LojaVariacao {
  id: number;
  produto_id: number;
  nome: string;
  sku: string | null;
  preco: number | null;
  ativo: boolean;
  created_at: string;
  // Computed
  estoque_por_unidade?: Record<string, number>;
}

// Estoque
export interface LojaEstoque {
  id: number;
  produto_id: number;
  variacao_id: number | null;
  unidade_id: string;
  quantidade: number;
  updated_at: string;
  // Joins
  loja_produtos?: LojaProduto;
  loja_variacoes?: LojaVariacao;
  unidades?: { codigo: string; nome: string };
}

// Movimentações de Estoque
export interface LojaMovimentacaoEstoque {
  id: number;
  produto_id: number | null;
  variacao_id: number | null;
  unidade_id: string | null;
  tipo: 'entrada' | 'venda' | 'estorno' | 'ajuste';
  quantidade: number;
  saldo_apos: number;
  referencia_id: number | null;
  colaborador_id: number | null;
  observacoes: string | null;
  created_at: string;
  // Joins
  loja_produtos?: LojaProduto;
  loja_variacoes?: LojaVariacao;
  colaboradores?: Colaborador;
}

// Formas de Pagamento
export type FormaPagamento = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'folha' | 'saldo';

export const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string; icone: string }[] = [
  { value: 'pix', label: 'Pix', icone: '💰' },
  { value: 'dinheiro', label: 'Dinheiro', icone: '💵' },
  { value: 'debito', label: 'Cartão Débito', icone: '💳' },
  { value: 'credito', label: 'Cartão Crédito', icone: '💳' },
  { value: 'folha', label: 'Desconto em Folha', icone: '📋' },
  { value: 'saldo', label: 'Saldo Carteira', icone: '👛' },
];

// Tipos de Cliente
export type TipoCliente = 'aluno' | 'colaborador' | 'avulso';

export const TIPOS_CLIENTE: { value: TipoCliente; label: string; icone: string }[] = [
  { value: 'aluno', label: 'Aluno', icone: '👤' },
  { value: 'colaborador', label: 'Colaborador', icone: '👨‍💼' },
  { value: 'avulso', label: 'Venda Avulsa', icone: '🏷️' },
];

// Vendas
export interface LojaVenda {
  id: number;
  unidade_id: string | null;
  data_venda: string;
  tipo_cliente: TipoCliente;
  aluno_id: number | null;
  colaborador_cliente_id: number | null;
  cliente_nome: string | null;
  professor_indicador_id: number | null;
  subtotal: number;
  desconto: number;
  desconto_tipo: 'valor' | 'percentual';
  total: number;
  forma_pagamento: FormaPagamento;
  parcelas: number;
  observacoes: string | null;
  comprovante_enviado: boolean;
  comprovante_enviado_em: string | null;
  status: 'concluida' | 'estornada';
  estornada_em: string | null;
  estornada_por: number | null;
  motivo_estorno: string | null;
  vendedor_id: number | null;
  created_at: string;
  // Joins
  unidades?: { codigo: string; nome: string };
  alunos?: { nome: string };
  colaboradores?: Colaborador;
  professores?: { nome: string };
  loja_vendas_itens?: LojaVendaItem[];
  vendedor?: Colaborador;
}

// Itens da Venda
export interface LojaVendaItem {
  id: number;
  venda_id: number;
  produto_id: number | null;
  variacao_id: number | null;
  produto_nome: string;
  variacao_nome: string | null;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  created_at: string;
}

// Tipo de Titular da Carteira
export type TipoTitular = 'farmer' | 'professor';

// Carteira Digital
export interface LojaCarteira {
  id: number;
  tipo_titular: TipoTitular;
  colaborador_id: number | null;
  professor_id: number | null;
  unidade_id: string | null;
  saldo: number;
  moedas_la: number;
  updated_at: string;
  // Joins
  colaboradores?: Colaborador;
  professores?: { id: number; nome: string };
  unidades?: { codigo: string; nome: string };
}

// Tipos de Movimentação da Carteira
export type TipoMovimentacaoCarteira = 
  | 'comissao_venda' 
  | 'comissao_indicacao' 
  | 'moeda_la' 
  | 'saque' 
  | 'compra_loja' 
  | 'estorno_comissao' 
  | 'ajuste';

export const TIPOS_MOVIMENTACAO_CARTEIRA: { value: TipoMovimentacaoCarteira; label: string; cor: string }[] = [
  { value: 'comissao_venda', label: 'Comissão venda', cor: 'success' },
  { value: 'comissao_indicacao', label: 'Comissão indicação', cor: 'purple' },
  { value: 'moeda_la', label: 'Moeda LA', cor: 'warning' },
  { value: 'saque', label: 'Saque', cor: 'blue' },
  { value: 'compra_loja', label: 'Compra loja', cor: 'orange' },
  { value: 'estorno_comissao', label: 'Estorno comissão', cor: 'error' },
  { value: 'ajuste', label: 'Ajuste', cor: 'gray' },
];

// Movimentações da Carteira
export interface LojaCarteiraMovimentacao {
  id: number;
  carteira_id: number;
  tipo: TipoMovimentacaoCarteira;
  valor: number;
  saldo_apos: number;
  referencia_tipo: string | null;
  referencia_id: number | null;
  descricao: string | null;
  created_at: string;
}

// Configurações da Loja
export interface LojaConfiguracao {
  id: number;
  chave: string;
  valor: string;
  descricao: string | null;
  updated_at: string;
}

// Chaves de Configuração
export type ChaveConfiguracao = 
  | 'comissao_farmer_padrao'
  | 'comissao_professor_indicacao'
  | 'valor_moeda_la'
  | 'estoque_minimo_padrao'
  | 'alerta_whatsapp_ativo'
  | 'template_comprovante'
  | 'template_alerta_estoque';

// Responsáveis por Reposição
export interface LojaResponsavelReposicao {
  id: number;
  unidade_id: string;
  nome: string;
  whatsapp: string;
  ativo: boolean;
  created_at: string;
  // Joins
  unidades?: { codigo: string; nome: string };
}

// Opt-in Novidades
export interface LojaOptinNovidades {
  id: number;
  aluno_id: number;
  unidade_id: string;
  whatsapp: string | null;
  ativo: boolean;
  created_at: string;
  // Joins
  alunos?: { nome: string };
}

// ============================================
// TIPOS PARA FORMULÁRIOS E UI
// ============================================

// Item do Carrinho (PDV)
export interface ItemCarrinho {
  produto_id: number;
  variacao_id: number | null;
  produto_nome: string;
  variacao_nome: string | null;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

// Dados do PDV
export interface DadosPDV {
  itens: ItemCarrinho[];
  tipo_cliente: TipoCliente;
  aluno_id: number | null;
  colaborador_cliente_id: number | null;
  cliente_nome: string;
  professor_indicador_id: number | null;
  forma_pagamento: FormaPagamento;
  parcelas: number;
  desconto: number;
  desconto_tipo: 'valor' | 'percentual';
  observacoes: string;
  enviar_comprovante: boolean;
}

// Alerta de Estoque
export interface AlertaEstoque {
  produto_id: number;
  variacao_id: number | null;
  produto_nome: string;
  variacao_nome: string | null;
  categoria_nome: string;
  quantidade_atual: number;
  estoque_minimo: number;
  nivel: 'critico' | 'atencao' | 'zerado';
}

// Resumo da Lojinha (KPIs)
export interface ResumoLojinha {
  total_produtos: number;
  produtos_ativos: number;
  produtos_inativos: number;
  total_categorias: number;
  produtos_estoque_baixo: number;
  valor_estoque: number;
  vendas_hoje: number;
  vendas_hoje_valor: number;
  vendas_mes: number;
  vendas_mes_valor: number;
  ticket_medio: number;
  comissoes_mes: number;
  comissoes_farmers: number;
  comissoes_professores: number;
  moedas_la_creditadas: number;
}

// Filtros de Produtos
export interface FiltrosProdutos {
  busca: string;
  categoria_id: number | null;
  status: 'todos' | 'ativos' | 'inativos' | 'estoque_baixo';
}

// Filtros de Vendas
export interface FiltrosVendas {
  busca: string;
  data_inicio: string | null;
  data_fim: string | null;
  status: 'todos' | 'concluida' | 'estornada';
  forma_pagamento: FormaPagamento | 'todos';
}

// Motivos de Estorno
export const MOTIVOS_ESTORNO = [
  'Desistência do cliente',
  'Produto com defeito',
  'Erro no registro',
  'Troca de produto',
  'Outro',
] as const;

export type MotivoEstorno = typeof MOTIVOS_ESTORNO[number];

// Formas de Recebimento de Saque
export const FORMAS_SAQUE = [
  { value: 'folha', label: 'Desconto em folha (próximo pagamento)', icone: '📋' },
  { value: 'pix', label: 'Pix', icone: '💰' },
  { value: 'dinheiro', label: 'Dinheiro', icone: '💵' },
] as const;

export type FormaSaque = typeof FORMAS_SAQUE[number]['value'];
