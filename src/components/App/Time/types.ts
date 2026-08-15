export interface Colaborador {
  id: number;
  nome: string;
  apelido: string | null;
  foto_url: string | null;
  bio: string | null;
  cargo: string | null;
  tipo: string | null;
  situacao: string;
  departamento: string | null;
  whatsapp: string | null;
  unidade_id: string | null;
  unidade_nome: string | null;
  temperamento_codinome: string | null;
  valorizacao_codinome: string | null;
  valores_codinome: string | null;
}

export interface FichaTokenStatus {
  link: string | null;
  ja_existia: boolean;
  ja_respondeu: boolean;
  gerado_em: string | null;
}

export interface FichaColaborador extends Colaborador {
  temperamento_contagem: Record<string, number> | null;
  valorizacao_contagem: Record<string, number> | null;
  valores_primario: string | null;
  valores_secundario: string | null;
  valores_sacrificado: string | null;
  concluido_em: string | null;
  rider_respostas: Record<string, string> | null;
  rider_updated_at: string | null;
  ficha_token: FichaTokenStatus | null;
}

export interface Unidade {
  id: string;
  nome: string;
}
