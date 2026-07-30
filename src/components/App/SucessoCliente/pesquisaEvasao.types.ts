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
