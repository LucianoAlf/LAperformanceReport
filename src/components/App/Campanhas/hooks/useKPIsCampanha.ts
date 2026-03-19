import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface KPIsCampanha {
  totalCampanhas: number
  campanhasAtivas: number
  totalEnviados: number
  totalEntregues: number
  totalLidos: number
  totalRespondidos: number
  totalFalhas: number
  custoEstimadoMes: number
  custoRealMes: number
  orcamentoMensal: number | null
  taxaEntrega: number
  taxaLeitura: number
  taxaResposta: number
  cotaDiariaUsada: number
  cotaDiariaLimite: number
  agentesAtivos: number
  conversasAbertas: number
}

export function useKPIsCampanha(unidadeId?: string | null) {
  const [kpis, setKpis] = useState<KPIsCampanha | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchKPIs = useCallback(async () => {
    setLoading(true)
    try {
      // Campanhas
      let qCampanhas = supabase.from('campanhas').select('status, enviados, entregues, lidos, respondidos, falhas, custo_estimado, custo_real, created_at')
      if (unidadeId) qCampanhas = qCampanhas.eq('unidade_id', unidadeId)
      const { data: campanhas } = await qCampanhas

      const now = new Date()
      const mesAtual = campanhas?.filter(c => {
        const d = new Date(c.created_at)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }) ?? []

      const totalEnviados = campanhas?.reduce((s, c) => s + (c.enviados ?? 0), 0) ?? 0
      const totalEntregues = campanhas?.reduce((s, c) => s + (c.entregues ?? 0), 0) ?? 0
      const totalLidos = campanhas?.reduce((s, c) => s + (c.lidos ?? 0), 0) ?? 0
      const totalRespondidos = campanhas?.reduce((s, c) => s + (c.respondidos ?? 0), 0) ?? 0
      const totalFalhas = campanhas?.reduce((s, c) => s + (c.falhas ?? 0), 0) ?? 0

      // Custo do mês
      const custoEstimadoMes = mesAtual.reduce((s, c) => s + (c.custo_estimado ?? 0), 0)
      const custoRealMes = mesAtual.reduce((s, c) => s + (c.custo_real ?? 0), 0)

      // Orçamento mensal (do primeiro número)
      let qNumero = supabase.from('numeros_meta').select('orcamento_mensal, limite_diario').limit(1)
      if (unidadeId) qNumero = qNumero.eq('unidade_id', unidadeId)
      const { data: numeros } = await qNumero
      const orcamento = numeros?.[0]?.orcamento_mensal ?? null
      const limiteDiario = numeros?.[0]?.limite_diario ?? 1000

      // Contatos enviados hoje (cota diária)
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      let qHoje = supabase
        .from('campanha_contatos')
        .select('id', { count: 'exact', head: true })
        .gte('enviado_em', hoje.toISOString())
        .in('status', ['enviado', 'entregue', 'lido'])
      const { count: cotaUsada } = await qHoje

      // Agentes ativos
      let qAgentes = supabase.from('agentes').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('status', 'active')
      if (unidadeId) qAgentes = qAgentes.eq('unidade_id', unidadeId)
      const { count: agentesAtivos } = await qAgentes

      // Conversas abertas
      let qConversas = supabase.from('conversas_campanha').select('id', { count: 'exact', head: true }).eq('status', 'open')
      if (unidadeId) qConversas = qConversas.eq('unidade_id', unidadeId)
      const { count: conversasAbertas } = await qConversas

      setKpis({
        totalCampanhas: campanhas?.length ?? 0,
        campanhasAtivas: campanhas?.filter(c => c.status === 'executando').length ?? 0,
        totalEnviados, totalEntregues, totalLidos, totalRespondidos, totalFalhas,
        custoEstimadoMes, custoRealMes,
        orcamentoMensal: orcamento,
        taxaEntrega: totalEnviados > 0 ? Math.round((totalEntregues / totalEnviados) * 100) : 0,
        taxaLeitura: totalEntregues > 0 ? Math.round((totalLidos / totalEntregues) * 100) : 0,
        taxaResposta: totalEntregues > 0 ? Math.round((totalRespondidos / totalEntregues) * 100) : 0,
        cotaDiariaUsada: cotaUsada ?? 0,
        cotaDiariaLimite: limiteDiario,
        agentesAtivos: agentesAtivos ?? 0,
        conversasAbertas: conversasAbertas ?? 0,
      })
    } finally {
      setLoading(false)
    }
  }, [unidadeId])

  useEffect(() => { fetchKPIs() }, [fetchKPIs])

  return { kpis, loading, refetch: fetchKPIs }
}
