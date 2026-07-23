import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface CategoriaInfo {
  rate: number
  volume: number
  cost: number
  fonte: 'meta_live' | 'fallback_configurado'
}

interface PricingEstimate {
  moeda: string
  janelaDias: number
  categorias: Record<string, CategoriaInfo>
}

const FALLBACK: PricingEstimate = {
  moeda: 'BRL',
  janelaDias: 0,
  categorias: {
    marketing: { rate: 0.5, volume: 0, cost: 0, fonte: 'fallback_configurado' },
    utility: { rate: 0.15, volume: 0, cost: 0, fonte: 'fallback_configurado' },
    authentication: { rate: 0.25, volume: 0, cost: 0, fonte: 'fallback_configurado' },
  },
}

// Tarifa real por mensagem consultada ao vivo na Meta (pricing_analytics, últimos 90 dias)
export function useMetaPricingEstimate(numeroMetaId: string | null | undefined) {
  const [estimate, setEstimate] = useState<PricingEstimate>(FALLBACK)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!numeroMetaId) { setEstimate(FALLBACK); return }
    let cancelado = false
    setLoading(true)
    setError(null)
    supabase.functions.invoke('meta-pricing-estimate', { body: { numero_meta_id: numeroMetaId } })
      .then(({ data, error: fnErr }) => {
        if (cancelado) return
        if (fnErr || data?.error) {
          setError(fnErr?.message ?? data?.error ?? 'Erro ao consultar tarifa')
          setEstimate(FALLBACK)
          return
        }
        setEstimate({ moeda: data.moeda, janelaDias: data.janela_dias, categorias: data.categorias })
      })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [numeroMetaId])

  return { ...estimate, loading, error }
}
