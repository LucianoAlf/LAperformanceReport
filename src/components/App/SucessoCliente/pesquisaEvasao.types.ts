export interface PesquisaEvasaoPreview {
  preview_id: string;
  expira_em: string;
  aluno: string;
  destinatario: string;
  destinatario_tipo: 'aluno' | 'responsavel' | 'teste';
  telefone_mascarado: string;
  unidade: string;
  curso: string | null;
  professor: string | null;
  assinatura: string;
  mensagem: string;
  modo_teste: boolean;
  alertas: string[];
}

export interface PesquisaEvasaoConfirmacao {
  success: boolean;
  pesquisa_id?: string;
  preview_id?: string;
  envio_status?: string;
  modo_teste?: boolean;
  captura_resposta_preparada?: boolean;
  warning?: string;
  error?: string;
  message?: string;
  mensagem?: string;
}

export type PesquisaEvasaoBloqueioCodigo =
  | 'sem_aluno'
  | 'data_nascimento_ausente'
  | 'sem_telefone'
  | 'telefone_invalido'
  | 'responsavel_sem_nome'
  | 'responsavel_sem_telefone'
  | 'responsavel_telefone_invalido'
  | 'telefone_snapshot_ausente'
  | 'telefone_responsavel_divergente'
  | 'motivo_nao_catalogado'
  | 'publico_interno'
  | 'pesquisa_aberta_no_mesmo_numero'
  | null;

export interface PesquisaEvasaoListagemItem {
  total_count: number;
  evasao_id: number;
  aluno_id: number | null;
  nome: string;
  telefone: string | null;
  curso: string | null;
  professor: string | null;
  tempo_meses: number;
  data_evasao: string;
  motivo_catalogado: string | null;
  motivo_legado: string | null;
  pesquisa_producao_status: string;
  pesquisa_producao_id: string | null;
  resposta_producao_texto: string | null;
  resposta_producao_audio_url: string | null;
  resposta_producao_tipo: string | null;
  respondido_producao_em: string | null;
  is_menor: boolean;
  responsavel_nome: string | null;
  publico_tipo: 'aluno' | 'responsavel' | 'indeterminado' | 'colaborador' | 'professor' | 'outro';
  bloqueio_codigo: PesquisaEvasaoBloqueioCodigo;
  elegivel_envio: boolean;
  elegibilidade_regra: string;
  possui_historico_teste: boolean;
  quantidade_testes: number;
  ultimo_teste_em: string | null;
  elegivel_a_partir_em: string | null;
}

export interface PesquisaEvasaoTeste {
  pesquisa_id: string;
  modo_teste: boolean;
  envio_status: string;
  resposta_status: string;
  enviado_em: string | null;
  respondido_em: string | null;
}

export interface PesquisaEvasaoMensagemRodada {
  id: string;
  tipo: 'texto' | 'audio';
  texto: string | null;
  substantividade: 'adiamento' | 'abertura' | 'conteudo_substantivo' | 'opt_out' | 'indeterminado';
  recebido_em: string;
  audio_disponivel: boolean;
  transcricao_status: 'pendente' | 'processando' | 'concluida' | 'falhou' | null;
  transcricao_texto: string | null;
}

export interface PesquisaEvasaoRodada {
  id: string;
  versao: number;
  status: 'rascunho' | 'pronta_para_revisao' | 'em_revisao' | 'revisada';
  texto_consolidado: string | null;
  iniciada_em: string | null;
  ultima_mensagem_em: string | null;
  encerrada_em: string | null;
  revisao_iniciada_em: string | null;
  revisao_iniciada_por_usuario_id: number | null;
  revisao_iniciada_por_nome: string | null;
  revisado_em: string | null;
  revisor_usuario_id: number | null;
  revisor_nome: string | null;
  mensagens: PesquisaEvasaoMensagemRodada[];
}

export interface PesquisaEvasaoConversa {
  pesquisa_id: string;
  aluno_nome: string;
  modo_teste: boolean;
  resposta_status: string;
  conteudo_novo_desde_revisao: boolean;
  resposta_texto_legado: string | null;
  respondido_em: string | null;
  rodadas: PesquisaEvasaoRodada[];
}

export interface PesquisaEvasaoFilaRevisaoItem {
  pesquisa_id: string;
  evasao_id: number;
  unidade_id: string;
  aluno_nome: string;
  modo_teste: boolean;
  resposta_status: string;
  conteudo_novo_desde_revisao: boolean;
  ultima_versao: number;
  ultima_rodada_status: string;
  ultima_mensagem_em: string | null;
  total_count: number;
}

export type PesquisaEvasaoFollowupEstado =
  | 'aguardando_resposta'
  | 'followup_pendente'
  | 'followup_avisado'
  | 'followup_realizado'
  | 'followup_dispensado'
  | 'respondendo'
  | 'pronta_para_revisao'
  | 'em_revisao'
  | 'nova_rodada'
  | 'revisada'
  /** Desfecho registrado. Faltava aqui desde 31/08 — o banco ja devolvia, o tipo nao previa. */
  | 'concluida'
  | 'opt_out';

/**
 * As duas ABAS da fila. Espelham `fn_pesquisa_evasao_followup_encerrada` no banco,
 * que e a fonte unica da particao — o filtro roda no servidor, aqui e so o rotulo.
 */
export type PesquisaEvasaoFollowupGrupo = 'em_aberto' | 'encerradas';

export type PesquisaEvasaoFollowupFiltro =
  | 'todos'
  | PesquisaEvasaoFollowupGrupo
  | 'followup_pendente'
  | 'followup_avisado'
  | 'followup_realizado'
  | 'followup_dispensado'
  | 'aguardando_resposta'
  | 'revisada'
  | 'opt_out'
  | 'concluida';

export type PesquisaEvasaoFollowupAcao = 'realizado' | 'dispensado';
export type PesquisaEvasaoFollowupCanal = 'whatsapp' | 'telefone' | 'outro';

export interface PesquisaEvasaoFollowupItem {
  total_count: number;
  pesquisa_id: string;
  evasao_id: number;
  /**
   * Vem da movimentação, não da pesquisa: saída lançada à mão sem selecionar o
   * aluno da lista fica sem vínculo, e aí não há para onde levar o operador.
   */
  aluno_id: number | null;
  aluno_nome: string;
  /** Número para onde a pesquisa foi; casa a conversa quando ela não tem `aluno_id`. */
  telefone_destino: string | null;
  unidade_id: string;
  unidade_nome: string;
  enviado_em: string;
  vencido_em: string;
  operador_usuario_id: number;
  operador_nome: string;
  estado_visivel: PesquisaEvasaoFollowupEstado;
  followup_pendente: boolean;
  interagiu_sem_resposta_valida: boolean;
  alerta_enviado_em: string | null;
  acao: PesquisaEvasaoFollowupAcao | null;
  acao_canal: PesquisaEvasaoFollowupCanal | null;
  acao_observacao: string | null;
  acao_registrada_em: string | null;
  acao_operador_nome: string | null;
}

export const PESQUISA_EVASAO_CATEGORIAS = [
  'financeiro',
  'tempo_horario',
  'saude',
  'desanimo',
  'pedagogico_professor',
  'atendimento_experiencia',
  'mudanca_endereco',
  'familia_estudos_trabalho',
  'outro',
  'inconclusivo',
  'resposta_invalida',
] as const;

export type PesquisaEvasaoCategoria = typeof PESQUISA_EVASAO_CATEGORIAS[number];

export type PesquisaEvasaoRelacaoMotivo =
  | 'confirmou'
  | 'confirmou_parcialmente'
  | 'complementou'
  | 'divergiu'
  | 'sem_motivo_anterior'
  | 'inconclusivo'
  | 'invalido';

export type PesquisaEvasaoAcaoTipo =
  | 'retorno_familia'
  | 'encaminhar_coordenacao'
  | 'encaminhar_financeiro'
  | 'vincular_professor'
  | 'tentativa_retencao'
  | 'solucao_oferecida'
  | 'outro';

export type PesquisaEvasaoDesfecho =
  | 'recuperou'
  | 'prometeu_voltar'
  | 'confirmou_saida';

export interface PesquisaEvasaoClassificacaoVersao {
  id: string;
  versao: number;
  analise_versao_max: number;
  relacao_motivo: PesquisaEvasaoRelacaoMotivo;
  justificativa: string;
  categorias: PesquisaEvasaoCategoria[];
  revisor_usuario_id: number;
  revisor_nome: string;
  revisado_em: string;
}

export interface PesquisaEvasaoAcao {
  id: string;
  tipo: PesquisaEvasaoAcaoTipo;
  descricao: string;
  resultado: string | null;
  estado: 'pendente' | 'realizada' | 'cancelada';
  prazo_em: string | null;
  professor_id: number | null;
  criado_por_usuario_id: number;
  realizado_por_nome: string;
  created_at: string;
  concluida_por_usuario_id: number | null;
  concluida_em: string | null;
}

export type RepescagemStatus = 'pendente' | 'enviando' | 'enviada' | 'falhou' | 'cancelada';

export interface RepescagemEstado {
  pesquisa_id: string;
  status: RepescagemStatus;
  agendada_para: string;
  enviada_em: string | null;
  ultimo_erro: string | null;
}

export type RepescagemMotivoRecusa =
  | 'pesquisa_inexistente'
  | 'opt_out'
  | 'primeiro_toque_nao_confirmado'
  | 'ja_respondeu'
  | 'muito_cedo'
  | 'ja_enfileirada'
  | 'telefone_ausente'
  | 'telefone_ja_respondeu'
  | 'publico_indeterminado'
  | 'template_ausente'
  | 'erro_ao_enfileirar';

export interface RepescagemRecusa {
  pesquisa_id: string;
  motivo: RepescagemMotivoRecusa | string;
  erro?: string;
}

export interface RepescagemEnfileirada {
  pesquisa_id: string;
  agendada_para: string;
}

export interface RepescagemEnfileiramentoResultado {
  enfileiradas: RepescagemEnfileirada[];
  recusadas: RepescagemRecusa[];
}

/**
 * As 11 recusas reais devolvidas por `enfileirar_repescagem_evasao`
 * (migration `20260827092000_pesquisa_evasao_enfileirar_repescagem.sql`).
 * Todo motivo precisa de texto legível aqui — nenhum pode cair num
 * "motivo desconhecido" (ver task-8-brief).
 */
export const MOTIVOS_RECUSA_REPESCAGEM: Record<RepescagemMotivoRecusa, string> = {
  pesquisa_inexistente: 'pesquisa não encontrada',
  opt_out: 'pediu para não receber mais',
  primeiro_toque_nao_confirmado: 'o 1º envio não teve confirmação de entrega',
  ja_respondeu: 'já respondeu',
  muito_cedo: 'menos de 3 dias desde o 1º envio',
  ja_enfileirada: 'já está na fila de repescagem',
  telefone_ausente: 'sem telefone para enviar',
  telefone_ja_respondeu: 'esse telefone já respondeu por outro aluno',
  publico_indeterminado: 'não foi possível determinar o público (aluno/responsável)',
  template_ausente: 'template de repescagem não encontrado para esse público',
  erro_ao_enfileirar: 'erro inesperado ao colocar na fila',
};

export function rotuloMotivoRecusaRepescagem(motivo: string): string {
  return MOTIVOS_RECUSA_REPESCAGEM[motivo as RepescagemMotivoRecusa] ?? `motivo não catalogado (${motivo})`;
}

export interface PesquisaEvasaoClassificacaoDados {
  pesquisa_id: string;
  motivo_cadastrado: string | null;
  modo_teste: boolean;
  analise_atual: {
    id: string;
    versao: number;
    status: PesquisaEvasaoRodada['status'];
    texto_consolidado: string | null;
    revisado_em: string | null;
  } | null;
  classificacao_atual: PesquisaEvasaoClassificacaoVersao | null;
  classificacao_desatualizada: boolean;
  historico_classificacoes: PesquisaEvasaoClassificacaoVersao[];
  acoes: PesquisaEvasaoAcao[];
  desfecho_atual: {
    id: string;
    desfecho: PesquisaEvasaoDesfecho;
    observacao: string;
    registrado_em: string;
  } | null;
}
