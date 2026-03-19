import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AgentToolDefinition } from '../types'

export interface Agente {
  id: string
  unidade_id: string
  nome: string
  descricao: string | null
  system_prompt: string
  modelo: string
  provider: string
  temperature: number
  max_tokens: number
  tools: AgentToolDefinition[]
  mensagem_boas_vindas: string | null
  mensagem_fallback: string | null
  horario_funcionamento: Record<string, any>
  is_active: boolean
  status: string
  numero_meta_id: string | null
  anti_spam: { min_interval_ms: number; max_messages_per_minute: number }
  modo_teste: boolean
  telefone_teste: string | null
  auto_reply_message: string | null
  created_at: string
  updated_at: string
}

export type AgenteForm = Omit<Agente, 'id' | 'created_at' | 'updated_at'>

export function useAgentes(unidadeId?: string | null) {
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAgentes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase.from('agentes').select('*').order('nome')
      if (unidadeId) query = query.eq('unidade_id', unidadeId)
      const { data, error: err } = await query
      if (err) throw err
      setAgentes(data ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [unidadeId])

  useEffect(() => { fetchAgentes() }, [fetchAgentes])

  function sanitizeForm(form: AgenteForm | Partial<AgenteForm>) {
    const clean = { ...form }
    // UUID fields: enviar null em vez de string vazia
    if ('unidade_id' in clean && !clean.unidade_id) clean.unidade_id = null as any
    if ('numero_meta_id' in clean && !clean.numero_meta_id) clean.numero_meta_id = null as any
    return clean
  }

  async function criar(form: AgenteForm): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('agentes').insert(sanitizeForm(form))
    if (err) return { error: err.message }
    await fetchAgentes()
    return { error: null }
  }

  async function atualizar(id: string, form: Partial<AgenteForm>): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('agentes')
      .update({ ...sanitizeForm(form), updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) return { error: err.message }
    await fetchAgentes()
    return { error: null }
  }

  async function excluir(id: string): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('agentes').delete().eq('id', id)
    if (err) return { error: err.message }
    await fetchAgentes()
    return { error: null }
  }

  async function toggleAtivo(id: string, ativo: boolean): Promise<{ error: string | null }> {
    return atualizar(id, { is_active: ativo })
  }

  return { agentes, loading, error, refetch: fetchAgentes, criar, atualizar, excluir, toggleAtivo }
}

export interface MetricasAgente {
  agente_id: string
  total_conversas: number
  total_mensagens: number
  transferencias: number
  taxa_transfer: number
}

export function useMetricasAgentes(agenteIds: string[]) {
  const [metricas, setMetricas] = useState<Record<string, MetricasAgente>>({})

  useEffect(() => {
    if (!agenteIds.length) return
    Promise.all(agenteIds.map(async (id) => {
      const [{ count: conversas }, { count: msgs }, { count: transfers }] = await Promise.all([
        supabase.from('agente_conversas').select('*', { count: 'exact', head: true }).eq('agente_id', id),
        supabase.from('mensagens_campanha').select('*', { count: 'exact', head: true }).eq('enviado_por_agente', id),
        supabase.from('agente_conversas').select('*', { count: 'exact', head: true }).eq('agente_id', id).eq('status', 'transferred'),
      ])
      return {
        agente_id: id,
        total_conversas: conversas ?? 0,
        total_mensagens: msgs ?? 0,
        transferencias: transfers ?? 0,
        taxa_transfer: (conversas ?? 0) > 0 ? Math.round(((transfers ?? 0) / (conversas ?? 1)) * 100) : 0,
      }
    })).then(results => {
      const map: Record<string, MetricasAgente> = {}
      for (const r of results) map[r.agente_id] = r
      setMetricas(map)
    })
  }, [agenteIds.join(',')])

  return metricas
}
