import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface ContatoAluno {
  id: number
  aluno_id: number
  nome: string
  telefone: string | null
  parentesco: string | null
  principal: boolean
  created_at: string
}

export function useContatosAluno(alunoId: number | null) {
  const [contatos, setContatos] = useState<ContatoAluno[]>([])
  const [loading, setLoading] = useState(false)

  const fetchContatos = useCallback(async () => {
    if (!alunoId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('aluno_contatos')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('principal', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) {
      console.error('Erro ao buscar contatos:', error)
    } else {
      setContatos(data || [])
    }
    setLoading(false)
  }, [alunoId])

  useEffect(() => {
    fetchContatos()
  }, [fetchContatos])

  async function adicionarContato(contato: Omit<ContatoAluno, 'id' | 'aluno_id' | 'created_at'>) {
    if (!alunoId) return false
    // Se marcou como principal, desmarcar os outros
    if (contato.principal) {
      await supabase
        .from('aluno_contatos')
        .update({ principal: false })
        .eq('aluno_id', alunoId)
    }
    const { error } = await supabase
      .from('aluno_contatos')
      .insert({ ...contato, aluno_id: alunoId })
    if (error) {
      toast.error('Erro ao adicionar contato')
      console.error(error)
      return false
    }
    await fetchContatos()
    await sincronizarCamposLegado()
    return true
  }

  async function atualizarContato(id: number, dados: Partial<Omit<ContatoAluno, 'id' | 'aluno_id' | 'created_at'>>) {
    if (!alunoId) return false
    if (dados.principal) {
      await supabase
        .from('aluno_contatos')
        .update({ principal: false })
        .eq('aluno_id', alunoId)
    }
    const { error } = await supabase
      .from('aluno_contatos')
      .update(dados)
      .eq('id', id)
    if (error) {
      toast.error('Erro ao atualizar contato')
      console.error(error)
      return false
    }
    await fetchContatos()
    await sincronizarCamposLegado()
    return true
  }

  async function removerContato(id: number) {
    const { error } = await supabase
      .from('aluno_contatos')
      .delete()
      .eq('id', id)
    if (error) {
      toast.error('Erro ao remover contato')
      console.error(error)
      return false
    }
    await fetchContatos()
    await sincronizarCamposLegado()
    return true
  }

  // Mantém campos legados sincronizados durante a transição
  async function sincronizarCamposLegado() {
    if (!alunoId) return
    const { data } = await supabase
      .from('aluno_contatos')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('principal', { ascending: false })
      .order('created_at', { ascending: true })
    if (!data) return

    const principal = data.find(c => c.principal) || data[0]
    const responsavel = data.find(c => !c.principal && c.parentesco !== 'proprio')

    await supabase.from('alunos').update({
      telefone: principal?.telefone || null,
      responsavel_nome: responsavel?.nome || null,
      responsavel_telefone: responsavel?.telefone || null,
      responsavel_parentesco: responsavel?.parentesco || null,
    }).eq('id', alunoId)
  }

  return {
    contatos,
    loading,
    adicionarContato,
    atualizarContato,
    removerContato,
    refetch: fetchContatos,
  }
}
