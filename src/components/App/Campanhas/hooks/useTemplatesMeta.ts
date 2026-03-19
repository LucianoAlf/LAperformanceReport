import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface TemplateMeta {
  id: string
  numero_meta_id: string
  nome: string
  idioma: string
  categoria: string | null
  status: string | null
  componentes: any[]
  meta_template_id: string | null
  body_text: string | null
  header_type: string | null
  has_buttons: boolean
  media_url: string | null
  media_type: string | null
  variaveis: string[]
  created_at: string
  updated_at: string
}

export function useTemplatesMeta(numeroMetaId?: string | null) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    if (!numeroMetaId) {
      setTemplates([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('templates_meta')
        .select('*')
        .eq('numero_meta_id', numeroMetaId)
        .order('nome')
      if (err) throw err
      setTemplates(data ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [numeroMetaId])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  async function sincronizar(): Promise<{ sincronizados: number; total: number; error: string | null }> {
    if (!numeroMetaId) return { sincronizados: 0, total: 0, error: 'Nenhum número selecionado' }
    setSincronizando(true)
    try {
      const { data, error: err } = await supabase.functions.invoke('sincronizar-templates', {
        body: { numero_meta_id: numeroMetaId },
      })
      if (err) return { sincronizados: 0, total: 0, error: err.message }
      if (data?.error) return { sincronizados: 0, total: 0, error: data.error }
      await fetchTemplates()
      return { sincronizados: data.sincronizados ?? 0, total: data.total ?? 0, error: null }
    } finally {
      setSincronizando(false)
    }
  }

  return { templates, loading, sincronizando, error, refetch: fetchTemplates, sincronizar }
}
