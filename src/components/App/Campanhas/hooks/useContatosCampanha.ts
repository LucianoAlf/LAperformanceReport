import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface ContatoStatus {
  id: string
  telefone: string
  status: string
  erro: string | null
  enviado_em: string | null
}

export type TabStatus = 'todos' | 'pendentes' | 'falhas' | 'nao_entregues' | 'entregues'

export function useContatosCampanha(campanhaId: string | null) {
  const [contatos, setContatos] = useState<ContatoStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<TabStatus>('todos')

  // Fetch todos os contatos
  useEffect(() => {
    if (!campanhaId) { setContatos([]); return }
    setLoading(true)
    supabase
      .from('campanha_contatos')
      .select('id, telefone, status, erro, enviado_em')
      .eq('campanha_id', campanhaId)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setContatos(data ?? []); setLoading(false) })
  }, [campanhaId])

  // Realtime
  useEffect(() => {
    if (!campanhaId) return
    const channel = supabase
      .channel(`contatos_ctrl_${campanhaId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'campanha_contatos',
        filter: `campanha_id=eq.${campanhaId}`,
      }, (payload) => {
        const updated = payload.new as ContatoStatus
        setContatos(prev => prev.map(ct => ct.id === updated.id ? updated : ct))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campanhaId])

  // Agrupamento por status
  const contatosPorStatus = useMemo(() => {
    const map: Record<string, ContatoStatus[]> = {
      pendente: [], enviado: [], entregue: [], lido: [], falha: [], bloqueado: [], invalido: [], ignorado: [],
    }
    contatos.forEach(c => {
      if (map[c.status]) map[c.status].push(c)
      else map[c.status] = [c]
    })
    return map
  }, [contatos])

  // Contadores para tabs (falhas inclui bloqueado e invalido)
  const contadores = useMemo(() => ({
    todos: contatos.length,
    pendentes: contatosPorStatus.pendente?.length ?? 0,
    falhas: (contatosPorStatus.falha?.length ?? 0) + (contatosPorStatus.bloqueado?.length ?? 0) + (contatosPorStatus.invalido?.length ?? 0),
    nao_entregues: contatosPorStatus.enviado?.length ?? 0,
    entregues: (contatosPorStatus.entregue?.length ?? 0) + (contatosPorStatus.lido?.length ?? 0),
  }), [contatos, contatosPorStatus])

  // Filtrados por tab + busca
  const filtrados = useMemo(() => {
    let result = contatos
    if (activeTab === 'pendentes') result = contatosPorStatus.pendente ?? []
    else if (activeTab === 'falhas') result = [...(contatosPorStatus.falha ?? []), ...(contatosPorStatus.bloqueado ?? []), ...(contatosPorStatus.invalido ?? [])]
    else if (activeTab === 'nao_entregues') result = contatosPorStatus.enviado ?? []
    else if (activeTab === 'entregues') result = [...(contatosPorStatus.entregue ?? []), ...(contatosPorStatus.lido ?? [])]
    if (searchTerm) {
      const term = searchTerm.replace(/\D/g, '')
      result = result.filter(c => c.telefone.includes(term))
    }
    return result
  }, [contatos, contatosPorStatus, activeTab, searchTerm])

  // Copiar números não entregues
  const copiarNaoEntregues = useCallback(async () => {
    const naoEntregues = contatos.filter(c => !['entregue', 'lido'].includes(c.status))
    if (naoEntregues.length === 0) { toast.info('Todos os contatos já receberam'); return 0 }
    const numeros = naoEntregues.map(c => c.telefone).join('\n')
    try {
      await navigator.clipboard.writeText(numeros)
      toast.success(`${naoEntregues.length} números copiados`)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = numeros; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      toast.success(`${naoEntregues.length} números copiados`)
    }
    return naoEntregues.length
  }, [contatos])

  // Exportar CSV
  const exportarCSV = useCallback((nomeCampanha: string) => {
    const header = 'telefone,status,erro,enviado_em'
    const rows = contatos.map(c =>
      `${c.telefone},${c.status},"${(c.erro ?? '').replace(/"/g, '""')}",${c.enviado_em ?? ''}`
    )
    const csv = '\uFEFF' + [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campanha-${nomeCampanha.replace(/\s+/g, '-').toLowerCase()}-contatos.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exportado')
  }, [contatos])

  return {
    contatos, loading, contatosPorStatus, contadores, filtrados,
    searchTerm, setSearchTerm, activeTab, setActiveTab,
    copiarNaoEntregues, exportarCSV,
  }
}
