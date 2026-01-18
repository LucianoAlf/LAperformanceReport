export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      alunos: {
        Row: {
          id: string
          nome: string
          email: string | null
          telefone: string | null
          data_nascimento: string | null
          responsavel: string | null
          unidade_id: string
          curso_id: string | null
          professor_id: string | null
          data_matricula: string
          data_inicio_aulas: string | null
          valor_mensalidade: number
          dia_vencimento: number
          forma_pagamento: string | null
          duracao_contrato_meses: number
          status: string
          observacoes: string | null
          fez_experimental: boolean
          data_experimental: string | null
          professor_experimental_id: string | null
          converteu_experimental: boolean
          data_ultima_renovacao: string | null
          nps_score: number | null
          nps_feedback: string | null
          agente_comercial_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome: string
          email?: string | null
          telefone?: string | null
          data_nascimento?: string | null
          responsavel?: string | null
          unidade_id: string
          curso_id?: string | null
          professor_id?: string | null
          data_matricula: string
          data_inicio_aulas?: string | null
          valor_mensalidade: number
          dia_vencimento?: number
          forma_pagamento?: string | null
          duracao_contrato_meses?: number
          status?: string
          observacoes?: string | null
          fez_experimental?: boolean
          data_experimental?: string | null
          professor_experimental_id?: string | null
          converteu_experimental?: boolean
          data_ultima_renovacao?: string | null
          nps_score?: number | null
          nps_feedback?: string | null
          agente_comercial_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          email?: string | null
          telefone?: string | null
          data_nascimento?: string | null
          responsavel?: string | null
          unidade_id?: string
          curso_id?: string | null
          professor_id?: string | null
          data_matricula?: string
          data_inicio_aulas?: string | null
          valor_mensalidade?: number
          dia_vencimento?: number
          forma_pagamento?: string | null
          duracao_contrato_meses?: number
          status?: string
          observacoes?: string | null
          fez_experimental?: boolean
          data_experimental?: string | null
          professor_experimental_id?: string | null
          converteu_experimental?: boolean
          data_ultima_renovacao?: string | null
          nps_score?: number | null
          nps_feedback?: string | null
          agente_comercial_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alunos_unidade_id_fkey"
            columns: ["unidade_id"]
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_curso_id_fkey"
            columns: ["curso_id"]
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alunos_professor_id_fkey"
            columns: ["professor_id"]
            referencedRelation: "professores"
            referencedColumns: ["id"]
          }
        ]
      }
      leads: {
        Row: {
          id: string
          nome: string
          email: string | null
          telefone: string | null
          data_nascimento: string | null
          responsavel: string | null
          unidade_id: string
          curso_interesse_id: string | null
          canal_origem_id: string | null
          status: string
          data_contato: string
          agendou_experimental: boolean
          data_experimental: string | null
          professor_experimental_id: string | null
          compareceu_experimental: boolean
          feedback_experimental: string | null
          converteu_matricula: boolean
          data_conversao: string | null
          motivo_nao_matricula_id: number | null
          observacoes: string | null
          agente_comercial_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome: string
          email?: string | null
          telefone?: string | null
          data_nascimento?: string | null
          responsavel?: string | null
          unidade_id: string
          curso_interesse_id?: string | null
          canal_origem_id?: string | null
          status?: string
          data_contato: string
          agendou_experimental?: boolean
          data_experimental?: string | null
          professor_experimental_id?: string | null
          compareceu_experimental?: boolean
          feedback_experimental?: string | null
          converteu_matricula?: boolean
          data_conversao?: string | null
          motivo_nao_matricula_id?: number | null
          observacoes?: string | null
          agente_comercial_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          email?: string | null
          telefone?: string | null
          data_nascimento?: string | null
          responsavel?: string | null
          unidade_id?: string
          curso_interesse_id?: string | null
          canal_origem_id?: string | null
          status?: string
          data_contato?: string
          agendou_experimental?: boolean
          data_experimental?: string | null
          professor_experimental_id?: string | null
          compareceu_experimental?: boolean
          feedback_experimental?: string | null
          converteu_matricula?: boolean
          data_conversao?: string | null
          motivo_nao_matricula_id?: number | null
          observacoes?: string | null
          agente_comercial_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      movimentacoes: {
        Row: {
          id: string
          aluno_id: string
          unidade_id: string
          tipo: string
          data_movimentacao: string
          valor_mensalidade: number | null
          observacoes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          aluno_id: string
          unidade_id: string
          tipo: string
          data_movimentacao: string
          valor_mensalidade?: number | null
          observacoes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          aluno_id?: string
          unidade_id?: string
          tipo?: string
          data_movimentacao?: string
          valor_mensalidade?: number | null
          observacoes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      renovacoes: {
        Row: {
          id: string
          aluno_id: string
          unidade_id: string
          data_renovacao: string
          valor_anterior: number
          valor_novo: number
          percentual_reajuste: number
          duracao_contrato_meses: number
          motivo_reajuste: string | null
          observacoes: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          aluno_id: string
          unidade_id: string
          data_renovacao: string
          valor_anterior: number
          valor_novo: number
          percentual_reajuste?: number
          duracao_contrato_meses?: number
          motivo_reajuste?: string | null
          observacoes?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          aluno_id?: string
          unidade_id?: string
          data_renovacao?: string
          valor_anterior?: number
          valor_novo?: number
          percentual_reajuste?: number
          duracao_contrato_meses?: number
          motivo_reajuste?: string | null
          observacoes?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      evasoes: {
        Row: {
          id: string
          aluno_id: string
          unidade_id: string
          data_evasao: string
          tipo_evasao: string
          motivo_id: number | null
          motivo_detalhe: string | null
          tentou_retencao: boolean
          acoes_retencao: string | null
          feedback_aluno: string | null
          observacoes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          aluno_id: string
          unidade_id: string
          data_evasao: string
          tipo_evasao: string
          motivo_id?: number | null
          motivo_detalhe?: string | null
          tentou_retencao?: boolean
          acoes_retencao?: string | null
          feedback_aluno?: string | null
          observacoes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          aluno_id?: string
          unidade_id?: string
          data_evasao?: string
          tipo_evasao?: string
          motivo_id?: number | null
          motivo_detalhe?: string | null
          tentou_retencao?: boolean
          acoes_retencao?: string | null
          feedback_aluno?: string | null
          observacoes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      relatorios_diarios: {
        Row: {
          id: string
          data_relatorio: string
          total_alunos_ativos: number
          matriculas_dia: number
          evasoes_dia: number
          renovacoes_dia: number
          saldo_liquido: number
          receita_estimada: number
          ticket_medio: number
          observacoes: string | null
          dados_unidades: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          data_relatorio: string
          total_alunos_ativos?: number
          matriculas_dia?: number
          evasoes_dia?: number
          renovacoes_dia?: number
          saldo_liquido?: number
          receita_estimada?: number
          ticket_medio?: number
          observacoes?: string | null
          dados_unidades?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          data_relatorio?: string
          total_alunos_ativos?: number
          matriculas_dia?: number
          evasoes_dia?: number
          renovacoes_dia?: number
          saldo_liquido?: number
          receita_estimada?: number
          ticket_medio?: number
          observacoes?: string | null
          dados_unidades?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      unidades: {
        Row: {
          id: string
          nome: string
          codigo: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          codigo: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          codigo?: string
          ativo?: boolean
          created_at?: string
        }
        Relationships: []
      }
      cursos: {
        Row: {
          id: string
          nome: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          ativo?: boolean
          created_at?: string
        }
        Relationships: []
      }
      professores: {
        Row: {
          id: string
          nome: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          ativo?: boolean
          created_at?: string
        }
        Relationships: []
      }
      canais_origem: {
        Row: {
          id: string
          nome: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          ativo?: boolean
          created_at?: string
        }
        Relationships: []
      }
      motivos_evasao: {
        Row: {
          id: number
          nome: string
          categoria: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: number
          nome: string
          categoria: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          nome?: string
          categoria?: string
          ativo?: boolean
          created_at?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          id: string
          email: string
          nome: string
          perfil: string
          unidade_id: string | null
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          nome: string
          perfil?: string
          unidade_id?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          nome?: string
          perfil?: string
          unidade_id?: string | null
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_unidade_id_fkey"
            columns: ["unidade_id"]
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
