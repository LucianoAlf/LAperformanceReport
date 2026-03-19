import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface CampanhasConfig {
  id: string
  notificacoes_ativas: boolean
  visibilidade_global: boolean
  updated_at: string
}

export function useCampanhasConfig() {
  const [config, setConfig] = useState<CampanhasConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('campanhas_config')
      .select('*')
      .single()
      .then(({ data }) => {
        setConfig(data as CampanhasConfig | null)
        setLoading(false)
      })
  }, [])

  async function updateConfig(updates: Partial<Pick<CampanhasConfig, 'notificacoes_ativas' | 'visibilidade_global'>>) {
    if (!config) return { error: 'Config não carregada' }
    const { error } = await supabase
      .from('campanhas_config')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', config.id)
    if (!error) setConfig(prev => prev ? { ...prev, ...updates } : prev)
    return { error: error?.message ?? null }
  }

  return { config, loading, updateConfig }
}
