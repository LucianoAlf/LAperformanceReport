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
  | 'opt_out';

export type PesquisaEvasaoFollowupFiltro =
  | 'todos'
  | 'followup_pendente'
  | 'followup_avisado'
  | 'followup_realizado'
  | 'followup_dispensado'
  | 'aguardando_resposta';

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
