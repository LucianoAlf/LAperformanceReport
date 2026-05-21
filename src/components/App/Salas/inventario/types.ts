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
  status: 'ativo' | 'manutencao' | 'baixa' | 'inativo';
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

export interface PendenciaInventario {
  id: number;
  sala_id: number;
  unidade_id: string;
  titulo: string;
  descricao: string | null;
  categoria: 'compra' | 'reposicao' | 'reparo' | 'melhoria';
  prioridade: 'urgente' | 'importante' | 'futuramente';
  status: 'aberta' | 'em_andamento' | 'concluida' | 'cancelada';
  solicitante: string | null;
  created_via: string | null;
  resolvido_em: string | null;
  resolvido_por: string | null;
  resolucao_obs: string | null;
  item_vinculado_id: number | null;
  created_at: string;
  updated_at: string;
  sala_nome?: string;
  unidade_nome?: string;
  item_vinculado_nome?: string;
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
  { value: 'Bateria/Percussão', label: 'Bateria/Percussão', emoji: '🥁' },
  { value: 'Cordas', label: 'Cordas', emoji: '🎸' },
  { value: 'Teclados/Piano', label: 'Teclados/Piano', emoji: '🎹' },
  { value: 'Sopro', label: 'Sopro', emoji: '🎷' },
  { value: 'Áudio', label: 'Áudio', emoji: '🎤' },
  { value: 'Amplificadores', label: 'Amplificadores', emoji: '🔊' },
  { value: 'Mobiliário', label: 'Mobiliário', emoji: '🪑' },
  { value: 'Climatização', label: 'Climatização', emoji: '❄️' },
  { value: 'Acessórios', label: 'Acessórios', emoji: '🎼' },
  { value: 'Outros', label: 'Outros', emoji: '📦' },
];

export const STATUS_EQUIPAMENTO = [
  { value: 'ativo', label: 'Ativo', cor: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'manutencao', label: 'Em Manutenção', cor: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'baixa', label: 'Baixa', cor: 'bg-red-500/20 text-red-400' },
  { value: 'inativo', label: 'Inativo', cor: 'bg-slate-500/20 text-slate-300' },
];

export const CONDICAO_EQUIPAMENTO = [
  { value: 'novo', label: 'Novo', cor: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'bom', label: 'Bom', cor: 'bg-blue-500/20 text-blue-400' },
  { value: 'regular', label: 'Regular', cor: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'ruim', label: 'Ruim', cor: 'bg-red-500/20 text-red-400' },
];

export const CATEGORIAS_PENDENCIA = [
  { value: 'compra', label: 'Compra' },
  { value: 'reposicao', label: 'Reposição' },
  { value: 'reparo', label: 'Reparo' },
  { value: 'melhoria', label: 'Melhoria' },
];

export const PRIORIDADES_PENDENCIA = [
  { value: 'urgente', label: 'Urgente', emoji: '🔴', cor: 'bg-red-500/15 text-red-300 border-red-500/30' },
  { value: 'importante', label: 'Importante', emoji: '🟠', cor: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'futuramente', label: 'Futuramente', emoji: '🟡', cor: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
];

export const STATUS_PENDENCIA = [
  { value: 'aberta', label: 'Abertas', cor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  { value: 'em_andamento', label: 'Em andamento', cor: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  { value: 'concluida', label: 'Concluídas', cor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'cancelada', label: 'Canceladas', cor: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
];

function normalizeText(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getCategoriaConfig(categoria: string | null) {
  const categoriaNormalizada = normalizeText(categoria);
  const cat = CATEGORIAS_EQUIPAMENTO.find(c => normalizeText(c.value) === categoriaNormalizada);
  return cat || { value: categoria || 'Outros', label: categoria || 'Outros', emoji: '📦' };
}

export function getStatusConfig(status: string) {
  const aliases: Record<string, string> = {
    em_manutencao: 'manutencao',
    baixado: 'baixa',
    emprestado: 'inativo',
  };
  const statusNormalizado = aliases[status] || status;
  const s = STATUS_EQUIPAMENTO.find(s => s.value === statusNormalizado);
  return s || STATUS_EQUIPAMENTO[0];
}

export function getCondicaoConfig(condicao: string) {
  const c = CONDICAO_EQUIPAMENTO.find(c => c.value === condicao);
  return c || CONDICAO_EQUIPAMENTO[1];
}

export function getPrioridadePendenciaConfig(prioridade: PendenciaInventario['prioridade']) {
  return PRIORIDADES_PENDENCIA.find(item => item.value === prioridade) || PRIORIDADES_PENDENCIA[1];
}

export function getStatusPendenciaConfig(status: PendenciaInventario['status']) {
  return STATUS_PENDENCIA.find(item => item.value === status) || STATUS_PENDENCIA[0];
}

export function getCategoriaPendenciaLabel(categoria: PendenciaInventario['categoria']) {
  return CATEGORIAS_PENDENCIA.find(item => item.value === categoria)?.label || categoria;
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
