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
  revisado_em: string | null;
  revisor_usuario_id: number | null;
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
