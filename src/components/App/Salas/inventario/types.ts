// Tipos para o Sistema de Inventário

export interface Sala {
  id: number;
  nome: string;
  unidade_id: string;
  unidade_nome?: string;
  tipo_sala?: string;
}

export interface Unidade {
  id: string;
  nome: string;
  codigo: string;
}

export interface ItemInventario {
  id: number;
  codigo_patrimonio: string | null;
  sala_id: number | null;
  unidade_id: string;
  nome: string;
  categoria: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  valor_compra: number | null;
  data_compra: string | null;
  nota_fiscal: string | null;
  fornecedor: string | null;
  vida_util_meses: number;
  valor_residual: number | null;
  status: 'ativo' | 'em_manutencao' | 'baixado' | 'emprestado';
  condicao: 'novo' | 'bom' | 'regular' | 'ruim';
  quantidade: number;
  observacoes: string | null;
  foto_url: string | null;
  proxima_revisao: string | null;
  alerta_revisao_dias: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  ativo: boolean;
  // Joins
  sala_nome?: string;
  unidade_nome?: string;
}

export interface Manutencao {
  id: number;
  item_id: number;
  tipo: 'preventiva' | 'corretiva' | 'limpeza';
  descricao: string | null;
  custo: number | null;
  data_manutencao: string;
  data_proxima_revisao: string | null;
  responsavel: string | null;
  fornecedor_servico: string | null;
  observacoes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Movimentacao {
  id: number;
  item_id: number;
  tipo: 'entrada' | 'saida' | 'transferencia' | 'baixa';
  sala_origem_id: number | null;
  sala_destino_id: number | null;
  motivo: string | null;
  data_movimentacao: string;
  usuario_id: string | null;
}

// Categorias de equipamentos
export const CATEGORIAS_EQUIPAMENTO = [
  { value: 'bateria_percussao', label: 'Bateria/Percussão', emoji: '🥁' },
  { value: 'cordas', label: 'Cordas', emoji: '🎸' },
  { value: 'teclados', label: 'Teclados/Piano', emoji: '🎹' },
  { value: 'sopro', label: 'Sopro', emoji: '🎷' },
  { value: 'audio', label: 'Áudio', emoji: '🎤' },
  { value: 'amplificadores', label: 'Amplificadores', emoji: '🔊' },
  { value: 'mobiliario', label: 'Mobiliário', emoji: '🪑' },
  { value: 'climatizacao', label: 'Climatização', emoji: '❄️' },
  { value: 'acessorios', label: 'Acessórios', emoji: '🎼' },
  { value: 'outros', label: 'Outros', emoji: '📦' },
];

export const STATUS_EQUIPAMENTO = [
  { value: 'ativo', label: 'Ativo', cor: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'em_manutencao', label: 'Em Manutenção', cor: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'baixado', label: 'Baixado', cor: 'bg-red-500/20 text-red-400' },
  { value: 'emprestado', label: 'Emprestado', cor: 'bg-blue-500/20 text-blue-400' },
];

export const CONDICAO_EQUIPAMENTO = [
  { value: 'novo', label: 'Novo', cor: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'bom', label: 'Bom', cor: 'bg-blue-500/20 text-blue-400' },
  { value: 'regular', label: 'Regular', cor: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'ruim', label: 'Ruim', cor: 'bg-red-500/20 text-red-400' },
];

export function getCategoriaConfig(categoria: string | null) {
  const cat = CATEGORIAS_EQUIPAMENTO.find(c => c.value === categoria);
  return cat || { value: 'outros', label: 'Outros', emoji: '📦' };
}

export function getStatusConfig(status: string) {
  const s = STATUS_EQUIPAMENTO.find(s => s.value === status);
  return s || STATUS_EQUIPAMENTO[0];
}

export function getCondicaoConfig(condicao: string) {
  const c = CONDICAO_EQUIPAMENTO.find(c => c.value === condicao);
  return c || CONDICAO_EQUIPAMENTO[1];
}

// Gerar código de patrimônio
export function gerarCodigoPatrimonio(unidadeCodigo: string, sequencial: number): string {
  return `LA-${unidadeCodigo.toUpperCase()}-${String(sequencial).padStart(4, '0')}`;
}

// Calcular depreciação
export function calcularDepreciacao(
  valorCompra: number,
  dataCompra: string,
  vidaUtilMeses: number,
  valorResidual: number = 0
): { valorAtual: number; percentualDepreciado: number } {
  const dataCompraDate = new Date(dataCompra);
  const hoje = new Date();
  const mesesDecorridos = Math.floor(
    (hoje.getTime() - dataCompraDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  
  const depreciacaoMensal = (valorCompra - valorResidual) / vidaUtilMeses;
  const depreciacaoTotal = Math.min(depreciacaoMensal * mesesDecorridos, valorCompra - valorResidual);
  const valorAtual = Math.max(valorCompra - depreciacaoTotal, valorResidual);
  const percentualDepreciado = ((valorCompra - valorAtual) / valorCompra) * 100;
  
  return { valorAtual, percentualDepreciado };
}
