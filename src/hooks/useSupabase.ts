import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { 
  Unidade, 
  DadosMensais, 
  Meta, 
  ConsolidadoAnual, 
  UnidadeAnual,
  Sazonalidade 
} from '../types/database.types'

// Hook para buscar unidades
export function useUnidades() {
  const [data, setData] = useState<Unidade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchUnidades() {
      try {
        const { data, error } = await supabase
          .from('unidades')
          .select('*')
          .eq('ativo', true)
          .order('nome')
        
        if (error) throw error
        setData(data || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchUnidades()
  }, [])

  return { data, loading, error }
}

// Hook para buscar KPIs consolidados
export function useKpisConsolidados(ano: number) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchKpis() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .rpc('get_kpis_consolidados', { p_ano: ano })
        
        if (error) throw error
        setData(data?.[0] || null)
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchKpis()
  }, [ano])

  return { data, loading, error }
}

// Hook para buscar KPIs por unidade
export function useKpisUnidade(codigoUnidade: string, ano: number) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchKpis() {
      if (!codigoUnidade) return
      setLoading(true)
      try {
        const { data, error } = await supabase
          .rpc('get_kpis_unidade', { 
            p_unidade_codigo: codigoUnidade, 
            p_ano: ano 
          })
        
        if (error) throw error
        setData(data?.[0] || null)
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchKpis()
  }, [codigoUnidade, ano])

  return { data, loading, error }
}

// Hook para comparativo entre anos
export function useComparativoAnos(anoAtual: number, anoAnterior: number) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchComparativo() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .rpc('get_comparativo_anos', { 
            p_ano_atual: anoAtual, 
            p_ano_anterior: anoAnterior 
          })
        
        if (error) throw error
        setData(data || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchComparativo()
  }, [anoAtual, anoAnterior])

  return { data, loading, error }
}

// Hook para dados do heatmap
export function useHeatmapData(ano: number, metrica: string = 'evasoes') {
  const [data, setData] = useState<any[]>([])
  const [totais, setTotais] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchHeatmap() {
      setLoading(true)
      try {
        // Buscar dados por unidade
        const { data: heatmapData, error: heatmapError } = await supabase
          .rpc('get_heatmap_data', { p_ano: ano, p_metrica: metrica })
        
        if (heatmapError) throw heatmapError

        // Buscar totais
        const { data: totaisData, error: totaisError } = await supabase
          .rpc('get_heatmap_totais', { p_ano: ano, p_metrica: metrica })
        
        if (totaisError) throw totaisError

        setData(heatmapData || [])
        setTotais(totaisData || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchHeatmap()
  }, [ano, metrica])

  return { data, totais, loading, error }
}

// Hook para dados mensais (tabela completa)
export function useDadosMensais(ano?: number, unidadeId?: string) {
  const [data, setData] = useState<DadosMensais[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchDados() {
      setLoading(true)
      try {
        let query = supabase
          .from('dados_mensais')
          .select(`
            *,
            unidades (nome, codigo, cor_primaria)
          `)
          .order('ano', { ascending: true })
          .order('mes', { ascending: true })
        
        if (ano) query = query.eq('ano', ano)
        if (unidadeId) query = query.eq('unidade_id', unidadeId)
        
        const { data, error } = await query
        
        if (error) throw error
        setData(data || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchDados()
  }, [ano, unidadeId])

  return { data, loading, error }
}

// Hook para metas
export function useMetas(ano?: number) {
  const [data, setData] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchMetas() {
      setLoading(true)
      try {
        let query = supabase
          .from('metas')
          .select(`
            *,
            unidades (nome, codigo)
          `)
          .order('ano')
        
        if (ano) query = query.eq('ano', ano)
        
        const { data, error } = await query
        
        if (error) throw error
        setData(data || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchMetas()
  }, [ano])

  return { data, loading, error }
}

// Hook para view consolidado anual
export function useConsolidadoAnual() {
  const [data, setData] = useState<ConsolidadoAnual[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchConsolidado() {
      try {
        const { data, error } = await supabase
          .from('vw_consolidado_anual')
          .select('*')
          .order('ano')
        
        if (error) throw error
        setData(data || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchConsolidado()
  }, [])

  return { data, loading, error }
}

// Hook para view unidade anual
export function useUnidadeAnual(ano?: number) {
  const [data, setData] = useState<UnidadeAnual[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchUnidadeAnual() {
      setLoading(true)
      try {
        let query = supabase
          .from('vw_unidade_anual')
          .select('*')
          .order('ano')
          .order('unidade')
        
        if (ano) query = query.eq('ano', ano)
        
        const { data, error } = await query
        
        if (error) throw error
        setData(data || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchUnidadeAnual()
  }, [ano])

  return { data, loading, error }
}

// Hook para sazonalidade
export function useSazonalidade(ano: number) {
  const [data, setData] = useState<Sazonalidade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchSazonalidade() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('vw_sazonalidade')
          .select('*')
          .eq('ano', ano)
          .order('mes')
          .order('unidade')
        
        if (error) throw error
        setData(data || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }
    fetchSazonalidade()
  }, [ano])

  return { data, loading, error }
}
