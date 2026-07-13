import { useState, useRef, useEffect } from 'react'
import { Upload, Users, Phone, FileText, Settings, CheckCircle, ArrowLeft, ArrowRight, X, AlertCircle, Building2, GraduationCap, Target, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useNumerosMeta, type NumeroMeta } from '../hooks/useNumerosMeta'
import { useTemplatesMeta, type TemplateMeta } from '../hooks/useTemplatesMeta'
import { parseCSV, parseExcel, validarContatos, validarBulkPhones, type ParsedCSV, type ValidacaoContatos } from './WizardSteps/csvParser'
import { extrairVariaveis, renderizarTemplate } from './WizardSteps/templateParser'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContatoImportado {
  telefone: string
  variaveis: Record<string, string>
}

interface WizardState {
  unidadeId: string
  nome: string
  contatos: ContatoImportado[]
  csvHeaders: string[]
  phoneColumn: string
  numeroMetaId: string
  templateId: string
  mapeamento: Record<string, string>  // "1" → coluna CSV
  mediaUrlCustom: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCriada: (campanhaId: string) => void
  unidadeId: string | null
}

const STEPS = [
  { id: 0, label: 'Contatos', icon: Users },
  { id: 1, label: 'Número', icon: Phone },
  { id: 2, label: 'Template', icon: FileText },
  { id: 3, label: 'Variáveis', icon: Settings },
  { id: 4, label: 'Revisão', icon: CheckCircle },
]

function normTel(tel: string | null | undefined): string | null {
  if (!tel) return null
  const digits = tel.replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.length <= 11 ? '55' + digits : digits
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function ModalNovaCampanha({ open, onOpenChange, onCriada, unidadeId }: Props) {
  const { isAdmin } = useAuth()
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>({
    unidadeId: unidadeId ?? '',
    nome: '',
    contatos: [],
    csvHeaders: [],
    phoneColumn: '',
    numeroMetaId: '',
    templateId: '',
    mapeamento: {},
    mediaUrlCustom: '',
  })

  // Sincronizar unidadeId do header quando muda
  useEffect(() => {
    if (unidadeId) setState(prev => ({ ...prev, unidadeId }))
  }, [unidadeId])

  function set<K extends keyof WizardState>(key: K, val: WizardState[K]) {
    setState(prev => {
      const next = { ...prev, [key]: val }
      // Se mudou a unidade, resetar número e template (cascata)
      if (key === 'unidadeId' && val !== prev.unidadeId) {
        next.numeroMetaId = ''
        next.templateId = ''
      }
      return next
    })
  }

  function resetar() {
    setStep(0)
    setState({ unidadeId: unidadeId ?? '', nome: '', contatos: [], csvHeaders: [], phoneColumn: '', numeroMetaId: '', templateId: '', mapeamento: {}, mediaUrlCustom: '' })
  }

  function fechar() {
    onOpenChange(false)
    setTimeout(resetar, 300)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl p-0 overflow-hidden">
        {/* Header com stepper */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-700/50">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Nova Campanha</h2>
          </div>
          <div className="flex gap-1">
            {STEPS.map(s => {
              const Icon = s.icon
              const active = step === s.id
              const done = step > s.id
              return (
                <div key={s.id} className={cn(
                  'flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors',
                  active ? 'bg-amber-500/20 text-amber-400' : done ? 'text-emerald-400' : 'text-gray-500',
                )}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-5 min-h-[340px] max-h-[60vh] overflow-y-auto">
          {step === 0 && <StepContatos state={state} set={set} isAdmin={isAdmin} />}
          {step === 1 && <StepNumero state={state} set={set} />}
          {step === 2 && <StepTemplate state={state} set={set} />}
          {step === 3 && <StepVariaveis state={state} set={set} />}
          {step === 4 && <StepRevisao state={state} onMediaUrl={(url) => set('mediaUrlCustom', url)} />}
        </div>

        {/* Footer com navegação */}
        <div className="px-6 py-4 border-t border-slate-700/50 flex justify-between">
          <Button variant="ghost" onClick={() => step === 0 ? fechar() : setStep(s => s - 1)}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance(step, state)} className="bg-amber-500 hover:bg-amber-600 text-black">
              Próximo
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <BotaoConfirmar state={state} onCriada={onCriada} onClose={fechar} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function canAdvance(step: number, state: WizardState): boolean {
  if (step === 0) return state.unidadeId.length > 0 && state.contatos.length > 0 && state.nome.trim().length > 0
  if (step === 1) return !!state.numeroMetaId
  if (step === 2) return !!state.templateId
  return true
}

// ─── Step 1: Contatos ─────────────────────────────────────────────────────────

function StepContatos({ state, set, isAdmin }: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; isAdmin: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [bulkText, setBulkText] = useState('')
  const [modo, setModo] = useState<'csv' | 'manual' | 'alunos' | 'leads'>('csv')
  const [validacao, setValidacao] = useState<ValidacaoContatos | null>(null)
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([])

  // Estado para modo alunos
  const [alunosDisponiveis, setAlunosDisponiveis] = useState<any[]>([])
  const [alunosSelecionados, setAlunosSelecionados] = useState<Set<number>>(new Set())
  const [carregandoAlunos, setCarregandoAlunos] = useState(false)
  const [filtroStatusAluno, setFiltroStatusAluno] = useState('ativo')
  const [filtroCursoAluno, setFiltroCursoAluno] = useState('todos')
  const [buscaAluno, setBuscaAluno] = useState('')
  const [cursosLista, setCursosLista] = useState<{ id: number; nome: string }[]>([])
  const [enviarPara, setEnviarPara] = useState<'principal' | 'mae' | 'pai' | 'responsavel' | 'proprio'>('principal')

  // Estado para modo leads
  const [leadsDisponiveis, setLeadsDisponiveis] = useState<any[]>([])
  const [leadsSelecionados, setLeadsSelecionados] = useState<Set<number>>(new Set())
  const [carregandoLeads, setCarregandoLeads] = useState(false)
  const [filtroStatusLead, setFiltroStatusLead] = useState('todos')
  const [filtroCursoLead, setFiltroCursoLead] = useState('todos')
  const [filtroOrigemLead, setFiltroOrigemLead] = useState('todos')
  const [excluirConvertidosLead, setExcluirConvertidosLead] = useState(true)
  const [buscaLead, setBuscaLead] = useState('')
  const [canaisOrigemLista, setCanaisOrigemLista] = useState<{ id: number; nome: string }[]>([])

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setUnidades(data ?? []))
  }, [isAdmin])

  // Carregar cursos
  useEffect(() => {
    supabase.from('cursos').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setCursosLista(data ?? []))
  }, [])

  // Carregar canais de origem
  useEffect(() => {
    supabase.from('canais_origem').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setCanaisOrigemLista(data ?? []))
  }, [])

  // Carregar alunos quando muda unidade, status ou curso
  useEffect(() => {
    if (modo !== 'alunos' || !state.unidadeId) return
    setCarregandoAlunos(true)
    let query = supabase
      .from('alunos')
      .select('id, nome, telefone, whatsapp, responsavel_telefone, curso_id, cursos(nome), status, aluno_contatos(id, nome, telefone, parentesco, principal)')
      .eq('unidade_id', state.unidadeId)

    if (filtroStatusAluno !== 'todos') {
      query = query.eq('status', filtroStatusAluno)
    }
    if (filtroCursoAluno !== 'todos') {
      query = query.eq('curso_id', Number(filtroCursoAluno))
    }

    query.order('nome').then(({ data }) => {
      setAlunosDisponiveis(data ?? [])
      setCarregandoAlunos(false)
    })
  }, [modo, state.unidadeId, filtroStatusAluno, filtroCursoAluno])

  // Carregar leads quando muda unidade ou filtros
  useEffect(() => {
    if (modo !== 'leads' || !state.unidadeId) return
    setCarregandoLeads(true)
    let query = supabase
      .from('leads')
      .select('id, nome, telefone, whatsapp, status, converteu, canais_origem(nome), cursos:curso_interesse_id(nome)')
      .eq('unidade_id', state.unidadeId)
      .eq('arquivado', false)

    if (filtroStatusLead !== 'todos') {
      query = query.eq('status', filtroStatusLead)
    }
    if (filtroCursoLead !== 'todos') {
      query = query.eq('curso_interesse_id', Number(filtroCursoLead))
    }
    if (filtroOrigemLead !== 'todos') {
      query = query.eq('canal_origem_id', Number(filtroOrigemLead))
    }
    if (excluirConvertidosLead) {
      query = query.eq('converteu', false)
    }

    query.order('nome').then(({ data }) => {
      setLeadsDisponiveis(data ?? [])
      setCarregandoLeads(false)
    })
  }, [modo, state.unidadeId, filtroStatusLead, filtroCursoLead, filtroOrigemLead, excluirConvertidosLead])

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
      const parsed = isExcel ? await parseExcel(file) : await parseCSV(file)
      set('csvHeaders', parsed.headers)
      const phoneCol = parsed.phoneColumn ?? parsed.headers[0] ?? ''
      set('phoneColumn', phoneCol)
      const resultado = validarContatos(parsed.rows, phoneCol)
      set('contatos', resultado.validos)
      setValidacao(resultado)
      toast.success(`${resultado.validos.length} contatos válidos importados`)
    } catch {
      toast.error('Erro ao ler arquivo')
    }
  }

  function handleBulk() {
    if (!bulkText.trim()) { toast.error('Cole telefones primeiro'); return }
    const resultado = validarBulkPhones(bulkText)
    if (resultado.validos.length === 0) { toast.error('Nenhum telefone válido encontrado'); return }
    set('contatos', resultado.validos)
    set('csvHeaders', [])
    setValidacao(resultado)
    toast.success(`${resultado.validos.length} telefones válidos`)
  }

  function toggleAluno(id: number) {
    setAlunosSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    const filtrados = alunosFiltrados
    if (alunosSelecionados.size === filtrados.length) {
      setAlunosSelecionados(new Set())
    } else {
      setAlunosSelecionados(new Set(filtrados.map(a => a.id)))
    }
  }

  function confirmarAlunos() {
    const selecionados = alunosDisponiveis.filter(a => alunosSelecionados.has(a.id))
    const contatos: ContatoImportado[] = []
    const telefones = new Set<string>()
    let semTelefone = 0
    let telInvalido = 0
    let duplicados = 0

    for (const aluno of selecionados) {
      const alunoContatos = (aluno.aluno_contatos as any[]) || []
      let tel: string | null = null

      if (enviarPara === 'principal') {
        // Contato principal da tabela, fallback para campos legados
        const principal = alunoContatos.find((c: any) => c.principal)
        tel = normTel(principal?.telefone) || normTel(aluno.whatsapp) || normTel(aluno.telefone) || normTel(aluno.responsavel_telefone)
      } else {
        // Buscar por parentesco específico
        const contatoMatch = alunoContatos.find((c: any) => c.parentesco === enviarPara)
        tel = normTel(contatoMatch?.telefone)
        // Fallback para principal se não encontrar o parentesco
        if (!tel) {
          const principal = alunoContatos.find((c: any) => c.principal)
          tel = normTel(principal?.telefone) || normTel(aluno.whatsapp) || normTel(aluno.telefone)
        }
      }

      if (!tel) { semTelefone++; continue }
      if (telefones.has(tel)) { duplicados++; continue }
      telefones.add(tel)
      contatos.push({
        telefone: tel,
        variaveis: { nome: aluno.nome, curso: (aluno.cursos as any)?.nome || '' },
      })
    }

    if (contatos.length === 0) {
      toast.error('Nenhum aluno selecionado com telefone válido')
      return
    }

    set('contatos', contatos)
    set('csvHeaders', ['nome', 'curso'])
    setValidacao({
      validos: contatos,
      total: selecionados.length,
      duplicatas: duplicados,
      invalidos: semTelefone + telInvalido,
    })
    const detalhes = [
      semTelefone > 0 && `${semTelefone} sem telefone`,
      telInvalido > 0 && `${telInvalido} telefone inválido`,
      duplicados > 0 && `${duplicados} duplicados`,
    ].filter(Boolean).join(', ')
    toast.success(`${contatos.length} alunos importados${detalhes ? ` (${detalhes})` : ''}`)
  }

  function toggleLead(id: number) {
    setLeadsSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleTodosLeads() {
    const filtrados = leadsFiltrados
    if (leadsSelecionados.size === filtrados.length) {
      setLeadsSelecionados(new Set())
    } else {
      setLeadsSelecionados(new Set(filtrados.map(l => l.id)))
    }
  }

  function confirmarLeads() {
    const selecionados = leadsDisponiveis.filter(l => leadsSelecionados.has(l.id))
    const contatos: ContatoImportado[] = []
    const telefones = new Set<string>()
    let semTelefone = 0
    let duplicados = 0

    for (const lead of selecionados) {
      const tel = normTel(lead.whatsapp) || normTel(lead.telefone)
      if (!tel) { semTelefone++; continue }
      if (telefones.has(tel)) { duplicados++; continue }
      telefones.add(tel)
      contatos.push({
        telefone: tel,
        variaveis: { nome: lead.nome ?? '', curso: (lead.cursos as any)?.nome || '' },
      })
    }

    if (contatos.length === 0) {
      toast.error('Nenhum lead selecionado com telefone válido')
      return
    }

    set('contatos', contatos)
    set('csvHeaders', ['nome', 'curso'])
    setValidacao({
      validos: contatos,
      total: selecionados.length,
      duplicatas: duplicados,
      invalidos: semTelefone,
    })
    const detalhes = [
      semTelefone > 0 && `${semTelefone} sem telefone`,
      duplicados > 0 && `${duplicados} duplicados`,
    ].filter(Boolean).join(', ')
    toast.success(`${contatos.length} leads importados${detalhes ? ` (${detalhes})` : ''}`)
  }

  const alunosFiltrados = alunosDisponiveis.filter(a => {
    if (!buscaAluno) return true
    return a.nome.toLowerCase().includes(buscaAluno.toLowerCase())
  })

  const leadsFiltrados = leadsDisponiveis.filter(l => {
    if (!buscaLead) return true
    return (l.nome ?? '').toLowerCase().includes(buscaLead.toLowerCase())
  })

  return (
    <div className="space-y-4">
      {/* Seletor de unidade (admin only) */}
      {isAdmin && (
        <Campo label="Unidade *">
          <div className="flex gap-2 flex-wrap">
            {unidades.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => set('unidadeId', u.id)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5',
                  state.unidadeId === u.id
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : 'text-gray-400 border-slate-700 hover:text-white hover:border-slate-600',
                )}
              >
                <Building2 className="w-3.5 h-3.5" />
                {u.nome}
              </button>
            ))}
          </div>
          {!state.unidadeId && <p className="text-xs text-yellow-400/80 mt-1">Selecione a unidade para a campanha</p>}
        </Campo>
      )}

      <Campo label="Nome da campanha">
        <input value={state.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Volta às Aulas 2026" className={inputCls} />
      </Campo>

      <div className="flex gap-2">
        <button onClick={() => setModo('csv')} className={cn(tabCls, modo === 'csv' && tabActiveCls)}>Upload CSV</button>
        <button onClick={() => setModo('manual')} className={cn(tabCls, modo === 'manual' && tabActiveCls)}>Colar telefones</button>
        <button onClick={() => setModo('alunos')} className={cn(tabCls, modo === 'alunos' && tabActiveCls)}>
          <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />Alunos</span>
        </button>
        <button onClick={() => setModo('leads')} className={cn(tabCls, modo === 'leads' && tabActiveCls)}>
          <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" />Leads</span>
        </button>
      </div>

      {modo === 'csv' ? (
        <div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleCSV} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full p-8 border-2 border-dashed border-slate-700 rounded-xl hover:border-amber-500/50 transition-colors text-center group"
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500 group-hover:text-amber-400 transition-colors" />
            <p className="text-sm text-gray-400">Clique para selecionar CSV ou Excel</p>
            <p className="text-xs text-gray-600 mt-1">Precisa ter uma coluna de telefone</p>
          </button>
        </div>
      ) : modo === 'manual' ? (
        <div className="space-y-2">
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            placeholder="Cole telefones separados por vírgula ou quebra de linha..."
            rows={5}
            className={cn(inputCls, 'resize-none')}
          />
          <Button onClick={handleBulk} variant="outline" size="sm">Importar telefones</Button>
        </div>
      ) : modo === 'alunos' ? (
        <div className="space-y-3">
          {!state.unidadeId ? (
            <div className="text-center py-6 text-gray-500">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Selecione uma unidade primeiro</p>
            </div>
          ) : (
            <>
              {/* Filtros */}
              <div className="flex gap-2 flex-wrap">
                <select value={filtroStatusAluno} onChange={e => setFiltroStatusAluno(e.target.value)} className={cn(inputCls, 'w-auto')}>
                  <option value="todos">Todos os status</option>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                  <option value="trancado">Trancados</option>
                  <option value="evadido">Evadidos</option>
                  <option value="aviso_previo">Aviso prévio</option>
                </select>
                <select value={filtroCursoAluno} onChange={e => setFiltroCursoAluno(e.target.value)} className={cn(inputCls, 'w-auto')}>
                  <option value="todos">Todos os cursos</option>
                  {cursosLista.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select value={enviarPara} onChange={e => setEnviarPara(e.target.value as any)} className={cn(inputCls, 'w-auto')} title="Para qual contato enviar">
                  <option value="principal">Contato principal</option>
                  <option value="mae">Mãe</option>
                  <option value="pai">Pai</option>
                  <option value="responsavel">Responsável</option>
                  <option value="proprio">Próprio aluno</option>
                </select>
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input value={buscaAluno} onChange={e => setBuscaAluno(e.target.value)} placeholder="Buscar aluno..." className={cn(inputCls, 'pl-8')} />
                </div>
              </div>

              {/* Lista de alunos */}
              {carregandoAlunos ? (
                <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Carregando alunos...</span>
                </div>
              ) : alunosFiltrados.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum aluno encontrado</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={alunosSelecionados.size === alunosFiltrados.length && alunosFiltrados.length > 0}
                        onChange={toggleTodos}
                        className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      Selecionar todos ({alunosFiltrados.length})
                    </label>
                    {alunosSelecionados.size > 0 && (
                      <Button onClick={confirmarAlunos} size="sm" className="bg-amber-500 hover:bg-amber-600 text-black text-xs">
                        Importar {alunosSelecionados.size} aluno(s)
                      </Button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-700/50 rounded-lg divide-y divide-slate-700/30">
                    {alunosFiltrados.map(aluno => (
                      <label
                        key={aluno.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors',
                          alunosSelecionados.has(aluno.id) && 'bg-amber-500/5',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={alunosSelecionados.has(aluno.id)}
                          onChange={() => toggleAluno(aluno.id)}
                          className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{aluno.nome}</div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {(aluno.cursos as any)?.nome || '-'} · {(() => {
                              const cts = (aluno.aluno_contatos as any[]) || []
                              if (enviarPara !== 'principal') {
                                const match = cts.find((c: any) => c.parentesco === enviarPara)
                                if (match?.telefone) return match.telefone
                              }
                              const princ = cts.find((c: any) => c.principal)
                              return princ?.telefone || aluno.whatsapp || aluno.telefone || aluno.responsavel_telefone || 'sem tel.'
                            })()}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {!state.unidadeId ? (
            <div className="text-center py-6 text-gray-500">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Selecione uma unidade primeiro</p>
            </div>
          ) : (
            <>
              {/* Filtros */}
              <div className="flex gap-2 flex-wrap">
                <select value={filtroStatusLead} onChange={e => setFiltroStatusLead(e.target.value)} className={cn(inputCls, 'w-auto')}>
                  <option value="todos">Todos os status</option>
                  <option value="novo">Novo</option>
                  <option value="em_contato">Em contato</option>
                  <option value="agendado">Agendado</option>
                  <option value="experimental_agendada">Experimental agendada</option>
                  <option value="experimental_realizada">Experimental realizada</option>
                  <option value="experimental_faltou">Experimental faltou</option>
                  <option value="visita_escola">Visita à escola</option>
                  <option value="realizado">Realizado</option>
                  <option value="convertido">Convertido</option>
                  <option value="matriculado">Matriculado</option>
                  <option value="perdido">Perdido</option>
                </select>
                <select value={filtroCursoLead} onChange={e => setFiltroCursoLead(e.target.value)} className={cn(inputCls, 'w-auto')}>
                  <option value="todos">Todos os cursos</option>
                  {cursosLista.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select value={filtroOrigemLead} onChange={e => setFiltroOrigemLead(e.target.value)} className={cn(inputCls, 'w-auto')}>
                  <option value="todos">Todas as origens</option>
                  {canaisOrigemLista.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input value={buscaLead} onChange={e => setBuscaLead(e.target.value)} placeholder="Buscar lead..." className={cn(inputCls, 'pl-8')} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={excluirConvertidosLead}
                  onChange={e => setExcluirConvertidosLead(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500"
                />
                Excluir leads já convertidos
              </label>

              {/* Lista de leads */}
              {carregandoLeads ? (
                <div className="flex items-center justify-center py-8 text-gray-500 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Carregando leads...</span>
                </div>
              ) : leadsFiltrados.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum lead encontrado</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leadsSelecionados.size === leadsFiltrados.length && leadsFiltrados.length > 0}
                        onChange={toggleTodosLeads}
                        className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500"
                      />
                      Selecionar todos ({leadsFiltrados.length})
                    </label>
                    {leadsSelecionados.size > 0 && (
                      <Button onClick={confirmarLeads} size="sm" className="bg-amber-500 hover:bg-amber-600 text-black text-xs">
                        Importar {leadsSelecionados.size} lead(s)
                      </Button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-700/50 rounded-lg divide-y divide-slate-700/30">
                    {leadsFiltrados.map(lead => (
                      <label
                        key={lead.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors',
                          leadsSelecionados.has(lead.id) && 'bg-amber-500/5',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={leadsSelecionados.has(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                          className="rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{lead.nome || '(sem nome)'}</div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {(lead.cursos as any)?.nome || '-'} · {(lead.canais_origem as any)?.nome || 'origem desconhecida'} · {lead.whatsapp || lead.telefone || 'sem tel.'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {validacao && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-sm text-emerald-300">{validacao.validos.length} contatos válidos</span>
          </div>
          {validacao.duplicatas > 0 && (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <span className="text-sm text-yellow-300">{validacao.duplicatas} duplicatas removidas</span>
            </div>
          )}
          {validacao.invalidos > 0 && (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-300">{validacao.invalidos} telefones inválidos</span>
            </div>
          )}
          <p className="text-xs text-gray-500">{validacao.total} linhas processadas · Telefones normalizados com prefixo 55</p>
        </div>
      )}
    </div>
  )
}

// ─── Step 2: Número Meta ──────────────────────────────────────────────────────

function StepNumero({ state, set }: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  // Mostrar todos os números — muitos são compartilhados (unidade_id = null)
  const { numeros, loading } = useNumerosMeta()

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">Selecione o número WhatsApp para envio da campanha.</p>
      {loading ? (
        <p className="text-gray-500 text-sm py-4 text-center">Carregando números...</p>
      ) : numeros.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum número configurado. Vá até Config para adicionar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {numeros.map(n => (
            <button
              key={n.id}
              onClick={() => { set('numeroMetaId', n.id); set('templateId', '') }}
              className={cn(
                'w-full text-left p-4 rounded-lg border transition-colors',
                state.numeroMetaId === n.id
                  ? 'bg-amber-500/10 border-amber-500/40 text-white'
                  : 'bg-slate-800/50 border-slate-700/50 text-gray-300 hover:border-slate-600',
              )}
            >
              <div className="flex items-center gap-3">
                <Phone className={cn('w-5 h-5', state.numeroMetaId === n.id ? 'text-amber-400' : 'text-gray-500')} />
                <div>
                  <div className="font-medium">{n.nome}</div>
                  <div className="text-xs text-gray-500">ID: {n.phone_number_id} · Limite: {n.limite_diario}/dia</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 3: Template ─────────────────────────────────────────────────────────

function StepTemplate({ state, set }: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  const { templates, loading } = useTemplatesMeta(state.numeroMetaId || null)
  const aprovados = templates.filter(t => t.status === 'APPROVED')

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">Escolha um template aprovado pela Meta.</p>
      {loading ? (
        <p className="text-gray-500 text-sm py-4 text-center">Carregando templates...</p>
      ) : aprovados.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum template aprovado. Sincronize na aba Templates.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {aprovados.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => set('templateId', tpl.id)}
              className={cn(
                'w-full text-left p-4 rounded-lg border transition-colors',
                state.templateId === tpl.id
                  ? 'bg-amber-500/10 border-amber-500/40'
                  : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-medium text-sm">{tpl.nome}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {tpl.categoria} · {tpl.idioma}
                    {tpl.variaveis.length > 0 && ` · ${tpl.variaveis.length} variável(is)`}
                  </div>
                </div>
                {state.templateId === tpl.id && <CheckCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />}
              </div>
              {tpl.body_text && (
                <p className="text-xs text-gray-400 mt-2 line-clamp-2">{tpl.body_text}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 4: Variáveis ────────────────────────────────────────────────────────

function StepVariaveis({ state, set }: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void }) {
  const { templates } = useTemplatesMeta(state.numeroMetaId || null)
  const template = templates.find(t => t.id === state.templateId)
  const vars = template ? extrairVariaveis(template) : []

  if (vars.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <CheckCircle className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
        <p className="text-sm text-emerald-300">Este template não possui variáveis.</p>
        <p className="text-xs text-gray-500 mt-1">Pode avançar para a revisão.</p>
      </div>
    )
  }

  const opcoesColuna = state.csvHeaders.length > 0
    ? ['', ...state.csvHeaders]
    : ['']

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Mapeie as variáveis do template para colunas do seu CSV.
      </p>
      {template?.body_text && (
        <div className="bg-slate-800 rounded-lg p-3 text-xs text-gray-400 whitespace-pre-wrap border border-slate-700/50">
          {template.body_text}
        </div>
      )}
      <div className="space-y-3">
        {vars.map(varNum => (
          <div key={varNum} className="flex items-center gap-3">
            <span className="text-sm text-amber-400 font-mono w-12 flex-shrink-0">{`{{${varNum}}}`}</span>
            <span className="text-gray-500 text-sm">→</span>
            {state.csvHeaders.length > 0 ? (
              <select
                value={state.mapeamento[varNum] ?? ''}
                onChange={e => set('mapeamento', { ...state.mapeamento, [varNum]: e.target.value })}
                className={cn(inputCls, 'flex-1')}
              >
                <option value="">Selecionar coluna...</option>
                {state.csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            ) : (
              <input
                placeholder="Valor estático"
                value={state.mapeamento[varNum] ?? ''}
                onChange={e => set('mapeamento', { ...state.mapeamento, [varNum]: e.target.value })}
                className={cn(inputCls, 'flex-1')}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Upload de mídia do header ────────────────────────────────────────────────

function MediaHeaderUpload({ mediaUrl, onMediaUrl }: { mediaUrl: string; onMediaUrl: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { supabase } = await import('@/lib/supabase')
      const ext = file.name.split('.').pop() ?? 'jpg'
      const filePath = `campanhas-headers/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('whatsapp-media-campanhas')
        .upload(filePath, file, { contentType: file.type, upsert: false })
      if (uploadErr) throw new Error(uploadErr.message)
      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-media-campanhas')
        .getPublicUrl(filePath)
      onMediaUrl(publicUrl)
      toast.success('Imagem enviada')
    } catch (err) {
      toast.error('Erro ao enviar imagem: ' + (err as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
      <label className="text-xs text-purple-400 font-medium block mb-2">
        Imagem do header (obrigatória para este template)
      </label>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={mediaUrl}
          onChange={(e) => onMediaUrl(e.target.value)}
          placeholder="https://exemplo.com/imagem.jpg"
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Enviando...' : 'Upload'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
      </div>
      {mediaUrl && (
        <div className="mt-2">
          <img src={mediaUrl} alt="Preview" className="max-h-32 rounded-lg object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
      )}
      <p className="text-xs text-gray-500 mt-1.5">
        Envie do seu PC ou cole uma URL pública (HTTPS).
      </p>
    </div>
  )
}

// ─── Step 5: Revisão ──────────────────────────────────────────────────────────

function StepRevisao({ state, onMediaUrl }: { state: WizardState; onMediaUrl: (url: string) => void }) {
  const { numeros } = useNumerosMeta()
  const { templates } = useTemplatesMeta(state.numeroMetaId || null)
  const numero = numeros.find(n => n.id === state.numeroMetaId)
  const template = templates.find(t => t.id === state.templateId)

  // Previsão de custo
  const custoCategoria = numero?.custo_por_categoria ?? { marketing: 0.50, utility: 0.15, authentication: 0.25 }
  const categoria = (template?.categoria?.toLowerCase() ?? 'marketing') as keyof typeof custoCategoria
  const custoUnitario = custoCategoria[categoria] ?? 0.50
  const custoTotal = state.contatos.length * custoUnitario

  // Preview da mensagem com dados do primeiro contato
  let previewText = template?.body_text ?? ''
  if (template && state.contatos.length > 0) {
    const primeiroContato = state.contatos[0]
    const varsPreview: Record<string, string> = {}
    for (const [varNum, campo] of Object.entries(state.mapeamento)) {
      if (state.csvHeaders.length > 0) {
        varsPreview[varNum] = primeiroContato.variaveis[campo] ?? ''
      } else {
        varsPreview[varNum] = campo // valor estático
      }
    }
    previewText = renderizarTemplate(previewText, varsPreview)
  }

  const orcamentoExcedido = numero?.orcamento_mensal ? custoTotal > numero.orcamento_mensal : false

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <InfoItem label="Campanha" value={state.nome} />
        <InfoItem label="Contatos" value={`${state.contatos.length}`} />
        <InfoItem label="Número" value={numero?.nome ?? '—'} />
        <InfoItem label="Template" value={template?.nome ?? '—'} />
      </div>

      {/* Mídia do header IMAGE/VIDEO/DOCUMENT */}
      {template && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.header_type?.toUpperCase?.() ?? '') && (
        <MediaHeaderUpload mediaUrl={state.mediaUrlCustom} onMediaUrl={onMediaUrl} />
      )}

      {/* Previsão de custo */}
      <div className={cn(
        'rounded-lg p-4 border',
        orcamentoExcedido
          ? 'bg-red-500/10 border-red-500/30'
          : 'bg-amber-500/10 border-amber-500/30',
      )}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Custo estimado</p>
            <p className="text-xl font-bold text-white">
              R$ {custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {state.contatos.length} contatos × R$ {custoUnitario.toFixed(2)} ({template?.categoria ?? 'marketing'})
            </p>
          </div>
          {orcamentoExcedido && (
            <div className="flex items-center gap-1.5 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-xs font-medium">Excede orçamento</span>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {previewText && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Preview (1o contato):</p>
          <div className="bg-slate-800 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap border border-slate-700/50">
            {previewText}
          </div>
        </div>
      )}
    </div>
  )
}

function BotaoConfirmar({ state, onCriada, onClose }: { state: WizardState; onCriada: (id: string) => void; onClose: () => void }) {
  const { numeros } = useNumerosMeta()
  const { templates } = useTemplatesMeta(state.numeroMetaId || null)
  const [criando, setCriando] = useState(false)

  const { useCampanhas: _ } = {} as any // avoid hook issue — use supabase directly
  const numero = numeros.find(n => n.id === state.numeroMetaId)
  const template = templates.find(t => t.id === state.templateId)
  const custoCategoria = numero?.custo_por_categoria ?? { marketing: 0.50, utility: 0.15, authentication: 0.25 }
  const categoria = (template?.categoria?.toLowerCase() ?? 'marketing') as keyof typeof custoCategoria
  const custoEstimado = state.contatos.length * (custoCategoria[categoria] ?? 0.50)

  async function handleConfirmar() {
    if (!state.unidadeId) {
      toast.error('Selecione uma unidade para a campanha')
      return
    }
    setCriando(true)
    try {
      const { supabase } = await import('@/lib/supabase')

      // Criar campanha
      const { data: campanha, error: campErr } = await supabase
        .from('campanhas')
        .insert({
          nome: state.nome,
          unidade_id: state.unidadeId,
          template_id: state.templateId,
          numero_meta_id: state.numeroMetaId,
          total_contatos: state.contatos.length,
          mapeamento_variaveis: state.mapeamento,
          media_url_custom: state.mediaUrlCustom || null,
          custo_estimado: custoEstimado,
          status: 'rascunho',
        })
        .select('id')
        .single()

      if (campErr || !campanha) throw new Error(campErr?.message ?? 'Erro ao criar campanha')

      // Inserir contatos em batches de 500
      for (let i = 0; i < state.contatos.length; i += 500) {
        const batch = state.contatos.slice(i, i + 500).map(c => ({
          campanha_id: campanha.id,
          telefone: c.telefone,
          variaveis: c.variaveis,
          status: 'pendente',
        }))
        const { error } = await supabase.from('campanha_contatos').insert(batch)
        if (error) throw new Error(error.message)
      }

      toast.success('Campanha criada como rascunho')
      onCriada(campanha.id)
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setCriando(false)
    }
  }

  return (
    <Button onClick={handleConfirmar} disabled={criando} className="bg-amber-500 hover:bg-amber-600 text-black">
      <CheckCircle className="w-4 h-4 mr-1.5" />
      {criando ? 'Criando...' : 'Criar Campanha'}
    </Button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-white font-medium mt-0.5 truncate">{value}</p>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30'
const tabCls = 'px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 text-gray-400 transition-colors'
const tabActiveCls = 'bg-amber-500/20 text-amber-400 border-amber-500/30'
