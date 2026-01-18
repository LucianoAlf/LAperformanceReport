export interface Database {
  public: {
    Tables: {
      unidades: {
        Row: {
          id: string
          nome: string
          codigo: string
          cor_primaria: string
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['unidades']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['unidades']['Insert']>
      }
      dados_mensais: {
        Row: {
          id: string
          unidade_id: string
          ano: number
          mes: number
          alunos_pagantes: number
          novas_matriculas: number
          evasoes: number
          churn_rate: number
          ticket_medio: number
          taxa_renovacao: number
          tempo_permanencia: number
          inadimplencia: number
          reajuste_parcelas: number
          faturamento_estimado: number
          saldo_liquido: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['dados_mensais']['Row'], 'id' | 'created_at' | 'updated_at' | 'faturamento_estimado' | 'saldo_liquido'>
        Update: Partial<Database['public']['Tables']['dados_mensais']['Insert']>
      }
      metas: {
        Row: {
          id: string
          unidade_id: string
          ano: number
          meta_alunos: number
          meta_matriculas_mes: number
          meta_evasoes_max: number
          meta_churn: number
          meta_renovacao: number
          meta_ticket: number
          meta_permanencia: number
          meta_inadimplencia: number
          meta_faturamento: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['metas']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['metas']['Insert']>
      }
      anotacoes: {
        Row: {
          id: string
          unidade_id: string | null
          ano: number | null
          mes: number | null
          tipo: string
          titulo: string
          descricao: string | null
          cor: string
          resolvido: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['anotacoes']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['anotacoes']['Insert']>
      }
      dashboard_config: {
        Row: {
          id: string
          chave: string
          valor: any
          descricao: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['dashboard_config']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['dashboard_config']['Insert']>
      }
      motivos_arquivamento: {
        Row: {
          id: number
          nome: string
          descricao: string | null
          ativo: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['motivos_arquivamento']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['motivos_arquivamento']['Insert']>
      }
      horarios: {
        Row: {
          id: number
          nome: string
          hora_inicio: string | null
          hora_fim: string | null
          ativo: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['horarios']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['horarios']['Insert']>
      }
    }
    Views: {
      vw_consolidado_anual: {
        Row: {
          ano: number
          alunos_dezembro: number
          total_matriculas: number
          total_evasoes: number
          churn_medio: number
          ticket_medio: number
          renovacao_media: number
          permanencia_media: number
          inadimplencia_media: number
          faturamento_total: number
        }
      }
      vw_unidade_anual: {
        Row: {
          unidade: string
          codigo: string
          ano: number
          alunos_dezembro: number
          alunos_janeiro: number
          total_matriculas: number
          total_evasoes: number
          churn_medio: number
          ticket_medio: number
          renovacao_media: number
          permanencia_atual: number
          inadimplencia_media: number
        }
      }
      vw_sazonalidade: {
        Row: {
          unidade: string
          codigo: string
          ano: number
          mes: number
          novas_matriculas: number
          evasoes: number
          churn_rate: number
          saldo_liquido: number
        }
      }
      vw_kpis_professor_completo: {
        Row: {
          id: number
          nome: string
          unidade_id: string | null
          unidade_nome: string | null
          carteira_alunos: number
          ticket_medio: number
          media_presenca: number
          taxa_faltas: number
          experimentais: number
          matriculas: number
          taxa_conversao: number
          evasoes: number
          mrr_perdido: number
          renovacoes: number
          nao_renovacoes: number
          taxa_renovacao: number
          taxa_nao_renovacao: number
          taxa_cancelamento: number
          ranking_matriculador: number
          ranking_renovador: number
          ranking_churn: number
          nps_medio: number | null
          media_alunos_turma: number | null
        }
      }
      vw_renovacoes_pendentes: {
        Row: {
          unidade_id: string
          unidade_nome: string
          mes_vencimento: string
          total_vencendo: number
          renovadas: number
          nao_renovadas: number
          pendentes: number
          atrasadas: number
        }
      }
    }
    Functions: {
      get_kpis_consolidados: {
        Args: { p_ano: number }
        Returns: {
          alunos_total: number
          matriculas_total: number
          evasoes_total: number
          churn_medio: number
          ticket_medio: number
          renovacao_media: number
          permanencia_media: number
          inadimplencia_media: number
          faturamento_estimado: number
        }[]
      }
      get_kpis_unidade: {
        Args: { p_unidade_codigo: string; p_ano: number }
        Returns: {
          alunos_dezembro: number
          alunos_janeiro: number
          matriculas_total: number
          evasoes_total: number
          churn_medio: number
          ticket_medio: number
          renovacao_media: number
          permanencia: number
          inadimplencia_media: number
          faturamento_dezembro: number
        }[]
      }
      get_comparativo_anos: {
        Args: { p_ano_atual: number; p_ano_anterior: number }
        Returns: {
          metrica: string
          valor_anterior: number
          valor_atual: number
          variacao: number
        }[]
      }
      get_heatmap_data: {
        Args: { p_ano: number; p_metrica: string }
        Returns: {
          unidade: string
          codigo: string
          mes: number
          valor: number
        }[]
      }
      get_heatmap_totais: {
        Args: { p_ano: number; p_metrica: string }
        Returns: {
          mes: number
          total: number
        }[]
      }
    }
  }
}

// Types auxiliares - Tabelas
export type Unidade = Database['public']['Tables']['unidades']['Row']
export type DadosMensais = Database['public']['Tables']['dados_mensais']['Row']
export type Meta = Database['public']['Tables']['metas']['Row']
export type Anotacao = Database['public']['Tables']['anotacoes']['Row']
export type MotivoArquivamento = Database['public']['Tables']['motivos_arquivamento']['Row']
export type Horario = Database['public']['Tables']['horarios']['Row']

// Types auxiliares - Views
export type ConsolidadoAnual = Database['public']['Views']['vw_consolidado_anual']['Row']
export type UnidadeAnual = Database['public']['Views']['vw_unidade_anual']['Row']
export type Sazonalidade = Database['public']['Views']['vw_sazonalidade']['Row']
export type KPIProfessorCompleto = Database['public']['Views']['vw_kpis_professor_completo']['Row']
export type RenovacoesPendentes = Database['public']['Views']['vw_renovacoes_pendentes']['Row']
