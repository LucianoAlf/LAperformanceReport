import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface NumeroMeta {
  id: string
  unidade_id: string | null
  nome: string
  phone_number_id: string
  waba_id: string
  access_token: string
  app_secret: string | null
  verify_token: string | null
  numero_telefone: string | null
  limite_diario: number
  limite_por_segundo: number
  custo_por_categoria: { marketing: number; utility: number; authentication: number }
  orcamento_mensal: number | null
  is_default: boolean
  auto_reply_ativo: boolean
  auto_reply_message: string | null
  created_at: string
  updated_at: string
}

export interface NumeroMetaForm {
  nome: string
  phone_number_id: string
  waba_id: string
  access_token: string
  app_secret?: string
  verify_token?: string
  numero_telefone?: string | null
  limite_diario: number
  orcamento_mensal?: number | null
  is_default: boolean
  unidade_id?: string | null
  auto_reply_ativo?: boolean
  auto_reply_message?: string | null
}

export function useNumerosMeta(unidadeId?: string | null) {
  const [numeros, setNumeros] = useState<NumeroMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNumeros = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('numeros_meta')
        .select('*')
        .order('nome')

      if (unidadeId) query = query.eq('unidade_id', unidadeId)

      const { data, error: err } = await query
      if (err) throw err
      setNumeros(data ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [unidadeId])

  useEffect(() => {
    fetchNumeros()
  }, [fetchNumeros])

  async function criar(form: NumeroMetaForm): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('numeros_meta').insert({
      ...form,
      verify_token: form.verify_token || crypto.randomUUID(),
    })
    if (err) return { error: err.message }
    await fetchNumeros()
    return { error: null }
  }

  async function atualizar(id: string, form: Partial<NumeroMetaForm>): Promise<{ error: string | null }> {
    const { error: err } = await supabase
      .from('numeros_meta')
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) return { error: err.message }
    await fetchNumeros()
    return { error: null }
  }

  async function excluir(id: string): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('numeros_meta').delete().eq('id', id)
    if (err) return { error: err.message }
    await fetchNumeros()
    return { error: null }
  }

  return { numeros, loading, error, refetch: fetchNumeros, criar, atualizar, excluir }
}
