import { supabase } from '../lib/supabase'
import type { DadosMensais, Meta, Anotacao } from '../types/database.types'

// Atualizar dados mensais
export async function updateDadosMensais(
  id: string, 
  updates: Partial<DadosMensais>
) {
  const { data, error } = await supabase
    .from('dados_mensais')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Upsert dados mensais via RPC
export async function upsertDadosMensais(params: {
  unidade_codigo: string
  ano: number
  mes: number
  alunos_pagantes?: number
  novas_matriculas?: number
  evasoes?: number
  churn_rate?: number
  ticket_medio?: number
  taxa_renovacao?: number
  tempo_permanencia?: number
  inadimplencia?: number
  reajuste_parcelas?: number
}) {
  const { data, error } = await supabase
    .rpc('upsert_dados_mensais', {
      p_unidade_codigo: params.unidade_codigo,
      p_ano: params.ano,
      p_mes: params.mes,
      p_alunos_pagantes: params.alunos_pagantes,
      p_novas_matriculas: params.novas_matriculas,
      p_evasoes: params.evasoes,
      p_churn_rate: params.churn_rate,
      p_ticket_medio: params.ticket_medio,
      p_taxa_renovacao: params.taxa_renovacao,
      p_tempo_permanencia: params.tempo_permanencia,
      p_inadimplencia: params.inadimplencia,
      p_reajuste_parcelas: params.reajuste_parcelas
    })
  
  if (error) throw error
  return data
}

// Atualizar metas
export async function updateMeta(id: string, updates: Partial<Meta>) {
  const { data, error } = await supabase
    .from('metas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Upsert metas via UPDATE direto (alternativa ao RPC que está dando 404)
export async function upsertMeta(params: {
  unidade_codigo: string
  ano: number
  meta_alunos?: number
  meta_matriculas_mes?: number
  meta_evasoes_max?: number
  meta_churn?: number
  meta_renovacao?: number
  meta_ticket?: number
  meta_permanencia?: number
  meta_inadimplencia?: number
  meta_faturamento?: number
}) {
  console.log('upsertMeta chamado com params:', params)
  
  // Primeiro, buscar o unidade_id pelo código
  const { data: unidade, error: unidadeError } = await supabase
    .from('unidades')
    .select('id')
    .eq('codigo', params.unidade_codigo)
    .single()
  
  if (unidadeError || !unidade) {
    console.error('Erro ao buscar unidade:', unidadeError)
    throw new Error(`Unidade não encontrada: ${params.unidade_codigo}`)
  }
  
  console.log('Unidade encontrada:', unidade)
  
  // Preparar dados para update
  const updateData: any = {
    unidade_id: (unidade as any).id,
    ano: params.ano,
  }
  
  if (params.meta_alunos !== undefined) updateData.meta_alunos = params.meta_alunos
  if (params.meta_matriculas_mes !== undefined) updateData.meta_matriculas_mes = params.meta_matriculas_mes
  if (params.meta_evasoes_max !== undefined) updateData.meta_evasoes_max = params.meta_evasoes_max
  if (params.meta_churn !== undefined) updateData.meta_churn = params.meta_churn
  if (params.meta_renovacao !== undefined) updateData.meta_renovacao = params.meta_renovacao
  if (params.meta_ticket !== undefined) updateData.meta_ticket = params.meta_ticket
  if (params.meta_permanencia !== undefined) updateData.meta_permanencia = params.meta_permanencia
  if (params.meta_inadimplencia !== undefined) updateData.meta_inadimplencia = params.meta_inadimplencia
  if (params.meta_faturamento !== undefined) updateData.meta_faturamento = params.meta_faturamento
  
  console.log('Dados para upsert:', updateData)
  
  // Fazer upsert na tabela metas
  const { data, error } = await supabase
    .from('metas')
    .upsert(updateData, {
      onConflict: 'unidade_id,ano'
    })
    .select()
    .single()
  
  console.log('Resposta do Supabase:', { data, error })
  
  if (error) {
    console.error('Erro do Supabase:', error)
    throw error
  }
  return data
}

// Criar anotação
export async function createAnotacao(anotacao: Omit<Anotacao, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('anotacoes')
    .insert(anotacao)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Atualizar anotação
export async function updateAnotacao(id: string, updates: Partial<Anotacao>) {
  const { data, error } = await supabase
    .from('anotacoes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Deletar anotação
export async function deleteAnotacao(id: string) {
  const { error } = await supabase
    .from('anotacoes')
    .delete()
    .eq('id', id)
  
  if (error) throw error
  return true
}
