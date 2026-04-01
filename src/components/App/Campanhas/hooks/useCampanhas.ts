import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface Campanha {
  id: string
  unidade_id: string
  criado_por: string | null
  nome: string
  template_id: string | null
  numero_meta_id: string | null
  status: string
  total_contatos: number
  enviados: number
  entregues: number
  lidos: number
  respondidos: number
  falhas: number
  custo_estimado: number
  custo_real: number
  mapeamento_variaveis: Record<string, string> | null
  media_url_custom: string | null
  iniciada_em: string | null
  concluida_em: string | null
  created_at: string
  updated_at: string
  // joins
  template_nome?: string
  numero_nome?: string
}

export type StatusCampanha = 'rascunho' | 'executando' | 'pausada' | 'concluida' | 'falha'
export type FiltroStatus = 'todos' | StatusCampanha

export function useCampanhas(unidadeId?: string | null) {
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCampanhas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('campanhas')
        .select(`
          *,
          templates_meta(nome),
          numeros_meta(nome)
        `)
        .order('created_at', { ascending: false })

      if (unidadeId) query = query.eq('unidade_id', unidadeId)

      const { data, error: err } = await query
      if (err) throw err

      const mapped: Campanha[] = (data ?? []).map((c: any) => ({
        ...c,
        template_nome: c.templates_meta?.nome ?? null,
        numero_nome: c.numeros_meta?.nome ?? null,
      }))
      setCampanhas(mapped)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [unidadeId])

  useEffect(() => {
    fetchCampanhas()
  }, [fetchCampanhas])

  // Realtime — atualizar campanhas automaticamente
  useEffect(() => {
    const channel = supabase
      .channel('campanhas_realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'campanhas',
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setCampanhas(prev => prev.filter(c => c.id !== payload.old.id))
          return
        }
        const updated = payload.new as any
        // Se tem filtro de unidade e não bate, ignorar
        if (unidadeId && updated.unidade_id !== unidadeId) return

        setCampanhas(prev => {
          const idx = prev.findIndex(c => c.id === updated.id)
          if (idx === -1) {
            // Nova campanha — refetch completo para pegar joins
            fetchCampanhas()
            return prev
          }
          // Atualizar in-place mantendo joins existentes
          const existing = prev[idx]
          return [
            ...prev.slice(0, idx),
            { ...existing, ...updated, template_nome: existing.template_nome, numero_nome: existing.numero_nome },
            ...prev.slice(idx + 1),
          ]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [unidadeId, fetchCampanhas])

  async function criar(dados: {
    nome: string
    unidade_id: string
    template_id: string
    numero_meta_id: string
    contatos: { telefone: string; variaveis?: Record<string, string> }[]
    mapeamento_variaveis?: Record<string, string>
    custo_estimado?: number
  }): Promise<{ error: string | null; campanha_id: string | null }> {
    // 1. Criar campanha
    const { data: campanha, error: campErr } = await supabase
      .from('campanhas')
      .insert({
        nome: dados.nome,
        unidade_id: dados.unidade_id,
        template_id: dados.template_id,
        numero_meta_id: dados.numero_meta_id,
        total_contatos: dados.contatos.length,
        mapeamento_variaveis: dados.mapeamento_variaveis ?? {},
        custo_estimado: dados.custo_estimado ?? 0,
        status: 'rascunho',
      })
      .select('id')
      .single()

    if (campErr || !campanha) return { error: campErr?.message ?? 'Erro ao criar campanha', campanha_id: null }

    // 2. Inserir contatos
    const contatosInsert = dados.contatos.map(c => ({
      campanha_id: campanha.id,
      telefone: c.telefone,
      variaveis: c.variaveis ?? {},
      status: 'pendente',
    }))

    const { error: contatosErr } = await supabase
      .from('campanha_contatos')
      .insert(contatosInsert)

    if (contatosErr) return { error: contatosErr.message, campanha_id: campanha.id }

    await fetchCampanhas()
    return { error: null, campanha_id: campanha.id }
  }

  async function controlar(campanhaId: string, action: 'iniciar' | 'pausar' | 'retomar'): Promise<{ error: string | null }> {
    const { data, error: err } = await supabase.functions.invoke('controle-campanha', {
      body: { campanha_id: campanhaId, action },
    })
    if (err) return { error: err.message }
    if (data?.error) return { error: data.error }
    await fetchCampanhas()
    return { error: null }
  }

  async function reenviarFalhas(campanhaId: string): Promise<{ error: string | null }> {
    // Resetar contatos com falha para pendente
    const { error: resetErr } = await supabase
      .from('campanha_contatos')
      .update({ status: 'pendente', erro: null })
      .eq('campanha_id', campanhaId)
      .eq('status', 'falha')
    if (resetErr) return { error: resetErr.message }

    // Resetar contador de falhas e setar status para executando
    await supabase.from('campanhas').update({ falhas: 0, status: 'executando', updated_at: new Date().toISOString() }).eq('id', campanhaId)

    // Disparar envio diretamente (status já é 'executando')
    const { data, error } = await supabase.functions.invoke('enviar-campanha', {
      body: { campanha_id: campanhaId },
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }

    await fetchCampanhas()
    return { error: null }
  }

  async function excluir(campanhaId: string): Promise<{ error: string | null }> {
    // Deletar registros filhos antes (FK sem CASCADE)
    await supabase.from('mensagens_campanha').delete().eq('campanha_id', campanhaId)
    await supabase.from('campanha_contatos').delete().eq('campanha_id', campanhaId)
    const { error: err } = await supabase
      .from('campanhas')
      .delete()
      .eq('id', campanhaId)
    if (err) return { error: err.message }
    await fetchCampanhas()
    return { error: null }
  }

  return { campanhas, loading, error, refetch: fetchCampanhas, criar, controlar, excluir, reenviarFalhas }
}
