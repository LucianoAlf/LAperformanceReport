import { useState, useEffect } from 'react'
import { useMetas, useUnidadeAnual } from '../hooks/useSupabase'
import { upsertMeta } from '../hooks/useSupabaseMutations'
import { Building2, Users, Target, Check, Loader2 } from 'lucide-react'

interface MetaUnidade {
  unidade_id: string
  unidade_codigo: string
  unidade_nome: string
  cor: string
  meta_alunos: number
  meta_matriculas_mes: number
  meta_churn: number
  meta_renovacao: number
  meta_ticket: number
  meta_permanencia: number
  meta_inadimplencia: number
  alunos_atual: number
  variacao_necessaria: number
}

export function Metas2026() {
  const { data: metas, loading: loadingMetas } = useMetas(2026)
  const { data: dadosAtuais, loading: loadingDados } = useUnidadeAnual(2025)
  const [metasEditaveis, setMetasEditaveis] = useState<MetaUnidade[]>([])
  const [metasOriginais, setMetasOriginais] = useState<MetaUnidade[]>([])
  const [salvando, setSalvando] = useState<string | null>(null)
  const [salvoRecente, setSalvoRecente] = useState<string | null>(null)

  const cores: Record<string, string> = {
    'CG': '#00d4ff',
    'REC': '#8b5cf6', 
    'BARRA': '#00cc66'
  }

  const nomes: Record<string, string> = {
    'CG': 'Campo Grande',
    'REC': 'Recreio',
    'BARRA': 'Barra'
  }

  useEffect(() => {
    if (metas && dadosAtuais && metas.length > 0) {
      const metasMontadas: MetaUnidade[] = metas.map((meta: any) => {
        const atual = dadosAtuais.find((d: any) => d.codigo === meta.unidades?.codigo)
        const alunosAtual = atual?.alunos_dezembro || 0
        const variacao = alunosAtual > 0 
          ? ((meta.meta_alunos - alunosAtual) / alunosAtual * 100)
          : 0

        return {
          unidade_id: meta.unidade_id,
          unidade_codigo: meta.unidades?.codigo || '',
          unidade_nome: nomes[meta.unidades?.codigo || ''] || '',
          cor: cores[meta.unidades?.codigo || ''] || '#00d4ff',
          meta_alunos: meta.meta_alunos,
          meta_matriculas_mes: meta.meta_matriculas_mes,
          meta_churn: meta.meta_churn,
          meta_renovacao: meta.meta_renovacao,
          meta_ticket: meta.meta_ticket,
          meta_permanencia: meta.meta_permanencia,
          meta_inadimplencia: meta.meta_inadimplencia,
          alunos_atual: alunosAtual,
          variacao_necessaria: variacao
        }
      })
      setMetasEditaveis(metasMontadas)
      setMetasOriginais(JSON.parse(JSON.stringify(metasMontadas)))
    }
  }, [metas, dadosAtuais])

  const hasChanges = (codigo: string): boolean => {
    const atual = metasEditaveis.find(m => m.unidade_codigo === codigo)
    const original = metasOriginais.find(m => m.unidade_codigo === codigo)
    
    if (!atual || !original) return false
    
    return (
      atual.meta_alunos !== original.meta_alunos ||
      atual.meta_matriculas_mes !== original.meta_matriculas_mes ||
      atual.meta_churn !== original.meta_churn ||
      atual.meta_renovacao !== original.meta_renovacao ||
      atual.meta_ticket !== original.meta_ticket
    )
  }

  const handleChange = (codigo: string, campo: keyof MetaUnidade, valor: number) => {
    setMetasEditaveis(prev => prev.map(m => {
      if (m.unidade_codigo === codigo) {
        const updated = { ...m, [campo]: valor }
        if (campo === 'meta_alunos' && m.alunos_atual > 0) {
          updated.variacao_necessaria = ((valor - m.alunos_atual) / m.alunos_atual * 100)
        }
        return updated
      }
      return m
    }))
  }

  const handleSave = async (meta: MetaUnidade) => {
    setSalvando(meta.unidade_codigo)
    console.log('Salvando meta:', meta)
    try {
      const result = await upsertMeta({
        unidade_codigo: meta.unidade_codigo,
        ano: 2026,
        meta_alunos: meta.meta_alunos,
        meta_matriculas_mes: meta.meta_matriculas_mes,
        meta_churn: meta.meta_churn,
        meta_renovacao: meta.meta_renovacao,
        meta_ticket: meta.meta_ticket,
        meta_permanencia: meta.meta_permanencia,
        meta_inadimplencia: meta.meta_inadimplencia
      })
      console.log('Meta salva com sucesso:', result)
      
      // Atualizar valores originais após salvar
      setMetasOriginais(prev => prev.map(m => 
        m.unidade_codigo === meta.unidade_codigo ? { ...meta } : m
      ))
      
      setSalvoRecente(meta.unidade_codigo)
      setTimeout(() => setSalvoRecente(null), 2000)
    } catch (error) {
      console.error('Erro detalhado ao salvar meta:', error)
      alert(`Erro ao salvar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`)
    } finally {
      setSalvando(null)
    }
  }

  const totais = {
    alunos: metasEditaveis.reduce((acc, m) => acc + m.meta_alunos, 0),
    matriculas: metasEditaveis.reduce((acc, m) => acc + m.meta_matriculas_mes, 0),
    churn: metasEditaveis.length > 0 
      ? (metasEditaveis.reduce((acc, m) => acc + m.meta_churn, 0) / metasEditaveis.length).toFixed(1)
      : '0',
    faturamento: metasEditaveis.reduce((acc, m) => acc + (m.meta_alunos * m.meta_ticket), 0)
  }

  if (loadingMetas || loadingDados) {
    return (
      <section className="py-16 px-8">
        <div className="flex items-center justify-center gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Carregando metas...</span>
        </div>
      </section>
    )
  }

  return (
    <section className="py-16 px-8">
      <div className="mb-8">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm mb-4">
          <Target className="w-4 h-4" />
          Metas 2026
        </span>
        <h2 className="text-3xl font-bold text-white mb-2">Estratégia de Retomada</h2>
        <p className="text-gray-400">Clique nos valores para editar e defina as metas do próximo ciclo</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {metasEditaveis.map(meta => (
          <div 
            key={meta.unidade_codigo}
            className="bg-slate-800/50 rounded-xl p-6 border-2 transition-all"
            style={{ borderColor: meta.cor }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5" style={{ color: meta.cor }} />
                <h3 className="text-xl font-semibold text-white">{meta.unidade_nome}</h3>
              </div>
              <button
                onClick={() => handleSave(meta)}
                disabled={salvando === meta.unidade_codigo || !hasChanges(meta.unidade_codigo)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2
                  ${salvoRecente === meta.unidade_codigo 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                    : hasChanges(meta.unidade_codigo)
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30 animate-pulse'
                    : 'bg-slate-700/50 text-gray-500 border border-slate-600 cursor-not-allowed'
                  }`}
              >
                {salvando === meta.unidade_codigo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : salvoRecente === meta.unidade_codigo ? (
                  <Check className="w-4 h-4" />
                ) : null}
                {salvoRecente === meta.unidade_codigo 
                  ? 'Salvo!' 
                  : hasChanges(meta.unidade_codigo)
                  ? 'Salvar Alterações'
                  : 'Salvar'
                }
              </button>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                <Users className="w-4 h-4" />
                ALUNOS DEZEMBRO
              </div>
              <div className="flex items-end gap-3">
                <input
                  type="number"
                  value={meta.meta_alunos}
                  onChange={(e) => handleChange(meta.unidade_codigo, 'meta_alunos', parseInt(e.target.value) || 0)}
                  className="bg-transparent text-4xl font-bold text-white w-32 border-b-2 border-transparent hover:border-slate-600 focus:border-cyan-400 focus:outline-none transition-all"
                />
                <div className="text-sm text-gray-500 mb-2">
                  2025: {meta.alunos_atual}
                </div>
              </div>
              <div className={`text-sm mt-2 ${meta.variacao_necessaria >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                VAR: {meta.variacao_necessaria >= 0 ? '+' : ''}{meta.variacao_necessaria.toFixed(1)}%
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">CHURN ALVO</div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    value={meta.meta_churn}
                    onChange={(e) => handleChange(meta.unidade_codigo, 'meta_churn', parseFloat(e.target.value) || 0)}
                    className="bg-transparent text-xl font-semibold text-white w-16 border-b border-transparent hover:border-slate-600 focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-gray-400">%</span>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">RENOVAÇÃO</div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={meta.meta_renovacao}
                    onChange={(e) => handleChange(meta.unidade_codigo, 'meta_renovacao', parseInt(e.target.value) || 0)}
                    className="bg-transparent text-xl font-semibold text-white w-16 border-b border-transparent hover:border-slate-600 focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-gray-400">%</span>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">MATRÍCULAS/MÊS</div>
                <input
                  type="number"
                  value={meta.meta_matriculas_mes}
                  onChange={(e) => handleChange(meta.unidade_codigo, 'meta_matriculas_mes', parseInt(e.target.value) || 0)}
                  className="bg-transparent text-xl font-semibold text-white w-full border-b border-transparent hover:border-slate-600 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="bg-slate-900/50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-1">TICKET MÉDIO ALVO</div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400">R$</span>
                  <input
                    type="number"
                    value={meta.meta_ticket}
                    onChange={(e) => handleChange(meta.unidade_codigo, 'meta_ticket', parseInt(e.target.value) || 0)}
                    className="bg-transparent text-xl font-semibold text-white w-20 border-b border-transparent hover:border-slate-600 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/30 rounded-xl p-6 text-center">
          <div className="text-5xl font-bold text-cyan-400 mb-2">
            {totais.alunos.toLocaleString('pt-BR')}
          </div>
          <div className="text-gray-400 text-sm">META ALUNOS GRUPO</div>
        </div>

        <div className="bg-slate-800/30 rounded-xl p-6 text-center">
          <div className="text-5xl font-bold text-green-400 mb-2">
            {totais.churn}%
          </div>
          <div className="text-gray-400 text-sm">META CHURN MÉDIO</div>
        </div>

        <div className="bg-slate-800/30 rounded-xl p-6 text-center">
          <div className="text-5xl font-bold text-purple-400 mb-2">
            {totais.matriculas}
          </div>
          <div className="text-gray-400 text-sm">MATRÍCULAS/MÊS</div>
        </div>

        <div className="bg-slate-800/30 rounded-xl p-6 text-center">
          <div className="text-4xl font-bold text-amber-400 mb-2">
            ~R$ {(totais.faturamento / 1000).toFixed(0)}k
          </div>
          <div className="text-gray-400 text-sm">FATURAMENTO ESTIMADO/MÊS</div>
        </div>
      </div>

      <p className="text-center text-gray-500 text-sm mt-6">
        💡 As alterações são salvas individualmente por unidade. Clique em "Salvar" após editar.
      </p>
    </section>
  )
}

export default Metas2026
