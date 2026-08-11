import { useState, useEffect } from 'react'

const CACHE_KEY = 'la_cotacao_usd_brl'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h — não precisa ser em tempo real, só não ficar velha demais

interface CotacaoCache {
  valor: number
  buscadoEm: number
}

/**
 * Cotação USD→BRL ao vivo (frankfurter.app, fonte BCE, sem chave/CORS livre).
 * Cacheada em sessionStorage por 1h pra não bater na API a cada render/aba.
 * Falha de rede não trava a tela — quem consome trata `cotacao === null` como
 * "sem conversão disponível agora" e cai de volta pro valor original.
 */
export function useCotacaoUSDBRL() {
  const [cotacao, setCotacao] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false

    async function buscar() {
      try {
        const cacheBruto = sessionStorage.getItem(CACHE_KEY)
        if (cacheBruto) {
          const cache = JSON.parse(cacheBruto) as CotacaoCache
          if (Date.now() - cache.buscadoEm < CACHE_TTL_MS) {
            if (!cancelado) { setCotacao(cache.valor); setLoading(false) }
            return
          }
        }

        const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=BRL')
        if (!res.ok) throw new Error(`Cotação indisponível (${res.status})`)
        const data = await res.json()
        const valor = data?.rates?.BRL
        if (typeof valor !== 'number') throw new Error('Cotação indisponível')

        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ valor, buscadoEm: Date.now() } satisfies CotacaoCache))
        if (!cancelado) { setCotacao(valor); setLoading(false) }
      } catch (err) {
        if (!cancelado) { setError((err as Error).message); setLoading(false) }
      }
    }

    buscar()
    return () => { cancelado = true }
  }, [])

  return { cotacao, loading, error }
}
