// =============================================================================
// TIPOS DO CRM PRÉ-ATENDIMENTO
// =============================================================================

// Etapas do pipeline (vem da tabela crm_pipeline_etapas)
export interface PipelineEtapa {
  id: number;
  nome: string;
  slug: string;
  cor: string;
  icone: string;
  ordem: number;
  ativo: boolean;
}

// Etiquetas do CRM
export interface EtiquetaCRM {
  id: number;
  nome: string;
  cor: string;
  icone: string | null;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
}

export interface LeadEtiqueta {
  id: number;
  lead_id: number;
  etiqueta_id: number;
  adicionada_por: string | null;
  created_at: string;
  crm_etiquetas?: EtiquetaCRM | null;
}

// Motivo de não comparecimento (lookup)
export interface MotivoNaoComparecimento {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

// Template WhatsApp
export interface TemplateWhatsApp {
  id: number;
  nome: string;
  slug: string;
  conteudo: string;
  tipo: string;
  ativo: boolean;
}

// Meta da Andreza por unidade/mês
export interface MetaAndreza {
  id: number;
  ano: number;
  mes: number;
  unidade_id: string;
  meta_show_up_rate: number;
  taxa_compromisso_valor: number;
  bonus_valor: number;
}

// Follow-up
export interface Followup {
  id: number;
  lead_id: number;
  tipo: string;
  descricao: string | null;
  data_agendada: string;
  hora_agendada: string | null;
  prioridade: 'alta' | 'normal' | 'baixa';
  concluido: boolean;
  data_conclusao: string | null;
  resultado: string | null;
  criado_por: 'manual' | 'automatico';
  created_by: number | null;
  created_at: string;
  updated_at: string;
  // Joins
  lead?: LeadCRM;
}

// Histórico do lead (timeline)
export interface LeadHistorico {
  id: number;
  lead_id: number;
  tipo: string;
  descricao: string | null;
  dados: Record<string, any>;
  created_by: number | null;
  created_at: string;
  // Joins
  colaborador?: { nome: string; apelido: string | null };
}

// Lead completo para o CRM
export interface LeadCRM {
  id: number;
  nome: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  idade: number | null;
  unidade_id: string;
  curso_interesse_id: number | null;
  canal_origem_id: number | null;
  data_contato: string;
  data_primeiro_contato: string | null;
  data_ultimo_contato: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;

  // Campos do CRM (novas colunas)
  etapa_pipeline_id: number | null;
  temperatura: 'quente' | 'morno' | 'frio' | null;
  faixa_etaria: 'LAMK' | 'EMLA' | null;
  tipo_agendamento: 'experimental' | 'visita' | null;
  observacoes_professor: string | null;
  qtd_tentativas_sem_resposta: number;
  qtd_desmarcacoes: number;
  motivo_nao_comparecimento_id: number | null;
  atendido_por_id: number | null;
  consultor_id: number | null;
  data_passagem_mila: string | null;
  motivo_passagem_mila: string | null;
  qtd_mensagens_mila: number;
  taxa_compromisso_cobrada: boolean;
  sabia_preco: boolean | null;

  // Campos existentes de experimental
  experimental_agendada: boolean;
  data_experimental: string | null;
  horario_experimental: string | null;
  professor_experimental_id: number | null;
  experimental_realizada: boolean;
  faltou_experimental: boolean;
  converteu: boolean;
  data_conversao: string | null;
  aluno_id: number | null;
  motivo_nao_matricula_id: number | null;
  motivo_arquivamento_id: number | null;
  arquivado: boolean;

  // Joins
  canais_origem?: { nome: string } | null;
  cursos?: { nome: string } | null;
  unidades?: { nome: string; codigo: string } | null;
  professores?: { nome: string } | null;
  crm_pipeline_etapas?: PipelineEtapa | null;
  crm_motivos_nao_comparecimento?: MotivoNaoComparecimento | null;
  atendido_por?: { nome: string; apelido: string | null } | null;
  consultor?: { nome: string; apelido: string | null } | null;
}

// Abas do CRM
export type CRMTabId = 'dashboard' | 'pipeline' | 'conversas' | 'leads' | 'agenda' | 'metas' | 'mila' | 'relatorios' | 'tarefas';

// =============================================================================
// TIPOS DO PAINEL CONVERSACIONAL WHATSAPP
// =============================================================================

// Conversa WhatsApp (1 por lead)
export interface ConversaCRM {
  id: string;
  lead_id: number;
  unidade_id: string | null;
  status: 'aberta' | 'pausada' | 'encerrada' | 'aguardando';
  atribuido_a: 'mila' | 'andreza' | 'nao_atribuido';
  whatsapp_jid: string | null;
  foto_perfil_url: string | null;
  nao_lidas: number;
  ultima_mensagem_at: string | null;
  ultima_mensagem_preview: string | null;
  mila_pausada: boolean;
  mila_pausada_em: string | null;
  mila_pausada_por: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  lead?: LeadCRM | null;
}

// Mensagem WhatsApp
export type TipoMensagem = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'localizacao' | 'contato' | 'sistema';
export type DirecaoMensagem = 'entrada' | 'saida';
export type RemetenteMensagem = 'lead' | 'mila' | 'andreza' | 'sistema';
export type StatusEntrega = 'enviando' | 'enviada' | 'entregue' | 'lida' | 'erro';

export interface MensagemCRM {
  id: string;
  conversa_id: string;
  lead_id: number;
  direcao: DirecaoMensagem;
  tipo: TipoMensagem;
  conteudo: string | null;
  midia_url: string | null;
  midia_mimetype: string | null;
  midia_nome: string | null;
  remetente: RemetenteMensagem;
  remetente_nome: string | null;
  status_entrega: StatusEntrega;
  is_sistema: boolean;
  whatsapp_message_id: string | null;
  template_id: number | null;
  reply_to_id: string | null;
  editada?: boolean;
  deletada?: boolean;
  transcricao?: string | null;
  reacoes?: { emoji: string; de: string; timestamp?: number }[];
  created_at: string;
}

// Filtros do inbox
export type FiltroInbox = 'todas' | 'nao_lidas' | 'mila' | 'minhas';

// Status de conexão WhatsApp
export interface WhatsAppConnectionStatus {
  connected: boolean;
  phone?: string;
  instanceName?: string;
  error?: string;
}

// KPIs do Dashboard
export interface DashboardKPIs {
  totalLeads: number;
  leadsHoje: number;
  agendadas: number;
  taxaAgendamento: number;
  visitaram: number;
  taxaShowUp: number;
  matriculados: number;
  taxaMatricula: number;
  tagsCompletas: number;
  tagsPendentes: number;
  taxaTags: number;
}

// Dados do funil
export interface FunilDados {
  leads: number;
  agendadas: number;
  visitaram: number;
  matriculados: number;
}

// Alerta do dashboard
export interface AlertaDashboard {
  tipo: 'novo_lead' | 'sem_acao' | 'matricula' | 'experimental_amanha' | 'tentativa_sem_resposta';
  titulo: string;
  descricao: string;
  icone: string;
  variante: 'purple' | 'warning' | 'success' | 'info';
  leadId?: number;
}

// Unidade simplificada
export interface UnidadeCRM {
  id: string;
  nome: string;
  codigo: string;
}

// Canal de origem
export interface CanalOrigem {
  id: number;
  nome: string;
}

// Curso
export interface CursoCRM {
  id: number;
  nome: string;
}
