import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ehMatriculaComercialCanonica } from '@/lib/comercialMatriculasCanonicas'
import {
  extrairCampanhaLabel,
  filtrarLeadsCampanhaPorUnidade,
  calcularTaxaConversao,
  calcularCustoPorMatricula,
} from '@/lib/campanhasConversao.mjs'

export interface MatriculaConversao {
  leadId: number
  alunoId: number
  nome: string
  dataMatricula: string | null
}

export interface ConversaoCampanha {
  campanhaId: string
  campanhaNome: string
  leadsGerados: number
  matriculados: number
  taxaConversao: number
  custoPorMatricula: number | null
  custoMoeda: string
  matriculasDetalhe: MatriculaConversao[]
}

const SELECT_ALUNO_CANONICO = `
  id, nome, status, data_matricula, valor_parcela, valor_passaporte,
  is_segundo_curso,
  cursos(nome, is_projeto_banda),
  tipos_matricula(codigo, conta_como_pagante, entra_ticket_medio)
`

/**
 * `campanhaId` distingue dois modos: omitido (undefined, default) lista TODAS
 * as campanhas — uso da aba "Conversão" geral. Passado explicitamente mas
 * vazio ('' ou null) é tratado como erro do chamador (ex: rota sem
 * :campanhaId resolvido) e retorna lista vazia, nunca cai no modo "todas" —
 * senão a página de detalhamento de uma campanha mostraria os números de
 * OUTRA campanha. Ver Achado 8 da revisão de 2026-08-11.
 */
export function useConversaoCampanhas(campanhaId?: string | null, unidadeId?: string | null) {
  const [conversoes, setConversoes] = useState<ConversaoCampanha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const campanhaIdInvalido = campanhaId !== undefined && !campanhaId

  const fetchConversoes = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (campanhaIdInvalido) {
      setConversoes([])
      setLoading(false)
      return
    }

    try {
      let query = supabase.from('campanhas').select('id, nome, unidade_id, numero_meta_id, custo_real, custo_moeda')
      if (campanhaId) query = query.eq('id', campanhaId)
      if (unidadeId) query = query.eq('unidade_id', unidadeId)
      const { data: campanhas, error: campErr } = await query
      if (campErr) throw campErr
      if (!campanhas || campanhas.length === 0) { setConversoes([]); return }

      const resultado: ConversaoCampanha[] = []

      for (const campanha of campanhas) {
        if (!campanha.numero_meta_id) {
          resultado.push(vazio(campanha))
          continue
        }

        const { data: agentes } = await supabase
          .from('agentes')
          .select('tools')
          .eq('numero_meta_id', campanha.numero_meta_id)

        const label = extrairCampanhaLabel(agentes ?? [])
        if (!label) {
          resultado.push(vazio(campanha))
          continue
        }

        const { data: linhas, error: leadsErr } = await supabase
          .from('leads_campanhas')
          .select(`lead_id, leads(id, aluno_id, unidade_id, alunos!leads_aluno_id_fkey(${SELECT_ALUNO_CANONICO}))`)
          .eq('campanha_slug', label)
        if (leadsErr) throw leadsErr

        const daUnidade = filtrarLeadsCampanhaPorUnidade(linhas ?? [], campanha.unidade_id)
        const leadsGerados = daUnidade.length

        const matriculasDetalhe: MatriculaConversao[] = []
        for (const linha of daUnidade) {
          const lead = Array.isArray((linha as any).leads) ? (linha as any).leads[0] : (linha as any).leads
          const aluno = lead?.alunos ? (Array.isArray(lead.alunos) ? lead.alunos[0] : lead.alunos) : null
          if (aluno && ehMatriculaComercialCanonica(aluno)) {
            matriculasDetalhe.push({
              leadId: linha.lead_id,
              alunoId: lead.aluno_id,
              nome: aluno.nome,
              dataMatricula: aluno.data_matricula ?? null,
            })
          }
        }

        const matriculados = matriculasDetalhe.length
        resultado.push({
          campanhaId: campanha.id,
          campanhaNome: campanha.nome,
          leadsGerados,
          matriculados,
          taxaConversao: calcularTaxaConversao(leadsGerados, matriculados),
          custoPorMatricula: calcularCustoPorMatricula(campanha.custo_real ?? 0, matriculados),
          custoMoeda: campanha.custo_moeda ?? 'USD',
          matriculasDetalhe,
        })
      }

      setConversoes(resultado)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [campanhaId, unidadeId, campanhaIdInvalido])

  useEffect(() => { fetchConversoes() }, [fetchConversoes])

  return { conversoes, loading, error, refetch: fetchConversoes }
}

function vazio(campanha: { id: string; nome: string; custo_moeda?: string }): ConversaoCampanha {
  return {
    campanhaId: campanha.id,
    campanhaNome: campanha.nome,
    leadsGerados: 0,
    matriculados: 0,
    taxaConversao: 0,
    custoPorMatricula: null,
    custoMoeda: campanha.custo_moeda ?? 'USD',
    matriculasDetalhe: [],
  }
}
