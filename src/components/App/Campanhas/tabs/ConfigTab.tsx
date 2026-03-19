import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Phone, Star, StarOff, Eye, EyeOff, RefreshCw, Ban, MessageSquare, Bell, BellOff, Globe, GlobeLock, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useNumerosMeta, type NumeroMeta, type NumeroMetaForm } from '../hooks/useNumerosMeta'
import { useCampanhasConfig } from '../hooks/useCampanhasConfig'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ─── Modal CRUD Número Meta ────────────────────────────────────────────────────

interface ModalNumeroProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  numero: NumeroMeta | null
  onSalvar: (form: NumeroMetaForm) => Promise<void>
}

function ModalNumero({ open, onOpenChange, numero, onSalvar }: ModalNumeroProps) {
  const { usuario, isAdmin } = useAuth()

  const [form, setForm] = useState<NumeroMetaForm>(() => numero ? {
    nome: numero.nome,
    phone_number_id: numero.phone_number_id,
    waba_id: numero.waba_id,
    access_token: numero.access_token,
    app_secret: numero.app_secret ?? '',
    verify_token: numero.verify_token ?? '',
    limite_diario: numero.limite_diario,
    orcamento_mensal: numero.orcamento_mensal,
    is_default: numero.is_default,
    unidade_id: numero.unidade_id,
  } : {
    nome: '',
    phone_number_id: '',
    waba_id: '',
    access_token: '',
    app_secret: '',
    verify_token: '',
    limite_diario: 1000,
    orcamento_mensal: null,
    is_default: false,
    unidade_id: isAdmin ? null : (usuario?.unidade_id ?? null),
  })

  const [mostrarToken, setMostrarToken] = useState(false)
  const [salvando, setSalvando] = useState(false)

  function set(field: keyof NumeroMetaForm, value: any) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.nome.trim() || !form.phone_number_id.trim() || !form.waba_id.trim() || !form.access_token.trim()) {
      toast.error('Preencha nome, Phone Number ID, WABA ID e Access Token')
      return
    }
    setSalvando(true)
    try {
      await onSalvar(form)
      onOpenChange(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">
            {numero ? 'Editar Número WhatsApp' : 'Novo Número WhatsApp'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Campo label="Nome">
            <input
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
              placeholder="Ex: LA Music CG"
              className={inputCls}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Phone Number ID">
              <input
                value={form.phone_number_id}
                onChange={e => set('phone_number_id', e.target.value)}
                placeholder="796558576879831"
                className={inputCls}
              />
            </Campo>
            <Campo label="WABA ID">
              <input
                value={form.waba_id}
                onChange={e => set('waba_id', e.target.value)}
                placeholder="822964763744857"
                className={inputCls}
              />
            </Campo>
          </div>

          <Campo label="Access Token (Permanente)">
            <div className="relative">
              <input
                type={mostrarToken ? 'text' : 'password'}
                value={form.access_token}
                onChange={e => set('access_token', e.target.value)}
                placeholder="EAAxxxxx..."
                className={cn(inputCls, 'pr-10')}
              />
              <button
                type="button"
                onClick={() => setMostrarToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {mostrarToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Campo>

          <Campo label="App Secret (para validar webhooks)">
            <input
              value={form.app_secret ?? ''}
              onChange={e => set('app_secret', e.target.value)}
              placeholder="Opcional — recomendado para segurança"
              className={inputCls}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Limite diário de mensagens">
              <input
                type="number"
                min={1}
                value={form.limite_diario}
                onChange={e => set('limite_diario', parseInt(e.target.value) || 1000)}
                className={inputCls}
              />
            </Campo>
            <Campo label="Orçamento mensal (R$)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.orcamento_mensal ?? ''}
                onChange={e => set('orcamento_mensal', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="Opcional"
                className={inputCls}
              />
            </Campo>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={e => set('is_default', e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <span className="text-sm text-gray-300">Número padrão desta unidade</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={salvando} className="bg-amber-500 hover:bg-amber-600 text-black">
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── ConfigTab ─────────────────────────────────────────────────────────────────

export function ConfigTab({ unidadeId }: { unidadeId: string | null }) {
  const { numeros, loading, criar, atualizar, excluir } = useNumerosMeta(unidadeId ?? undefined)
  const { config: campanhasConfig, updateConfig } = useCampanhasConfig()

  const [modalAberto, setModalAberto] = useState(false)
  const [numeroEditando, setNumeroEditando] = useState<NumeroMeta | null>(null)

  function abrirCriar() {
    setNumeroEditando(null)
    setModalAberto(true)
  }

  function abrirEditar(numero: NumeroMeta) {
    setNumeroEditando(numero)
    setModalAberto(true)
  }

  async function handleSalvar(form: NumeroMetaForm) {
    if (numeroEditando) {
      const { error } = await atualizar(numeroEditando.id, form)
      if (error) { toast.error(error); return }
      toast.success('Número atualizado')
    } else {
      const { error } = await criar(form)
      if (error) { toast.error(error); return }
      toast.success('Número adicionado')
    }
  }

  async function handleExcluir(numero: NumeroMeta) {
    if (!confirm(`Excluir "${numero.nome}"? Campanhas vinculadas serão afetadas.`)) return
    const { error } = await excluir(numero.id)
    if (error) { toast.error(error); return }
    toast.success('Número removido')
  }

  async function handleToggle(field: 'notificacoes_ativas' | 'visibilidade_global') {
    if (!campanhasConfig) return
    const novoValor = !campanhasConfig[field]
    const { error } = await updateConfig({ [field]: novoValor })
    if (error) toast.error('Falha ao atualizar configuração')
    else toast.success(`${field === 'notificacoes_ativas' ? 'Notificações' : 'Visibilidade'} ${novoValor ? 'ativada' : 'desativada'}`)
  }

  return (
    <div className="space-y-6">
      {/* Configurações Gerais */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-slate-100">Geral</h3>
        </div>

        <div className="space-y-4">
          {/* Toggle Notificações */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <div className="flex items-center gap-3">
              {campanhasConfig?.notificacoes_ativas ? (
                <Bell className="w-5 h-5 text-amber-400" />
              ) : (
                <BellOff className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-200">Notificações de mensagens</p>
                <p className="text-xs text-slate-400">Receber alertas quando novas mensagens chegarem</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('notificacoes_ativas')}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                campanhasConfig?.notificacoes_ativas ? 'bg-amber-500' : 'bg-slate-600'
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                campanhasConfig?.notificacoes_ativas ? 'translate-x-6' : 'translate-x-1'
              )} />
            </button>
          </div>

          {/* Toggle Visibilidade Global */}
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <div className="flex items-center gap-3">
              {campanhasConfig?.visibilidade_global ? (
                <Globe className="w-5 h-5 text-green-400" />
              ) : (
                <GlobeLock className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-200">Módulo visível para todos</p>
                <p className="text-xs text-slate-400">Quando desativado, apenas o desenvolvedor tem acesso ao módulo Campanhas</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('visibilidade_global')}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                campanhasConfig?.visibilidade_global ? 'bg-green-500' : 'bg-slate-600'
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                campanhasConfig?.visibilidade_global ? 'translate-x-6' : 'translate-x-1'
              )} />
            </button>
          </div>
        </div>
      </div>

      {/* Números Meta */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-400" />
              Números WhatsApp (Meta Cloud API)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Números configurados para envio de campanhas via Meta Business.
            </p>
          </div>
          <Button onClick={abrirCriar} className="bg-amber-500 hover:bg-amber-600 text-black text-sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Adicionar número
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Carregando...
          </div>
        ) : numeros.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Phone className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>Nenhum número configurado.</p>
            <p className="text-xs mt-1">Adicione um número Meta Business para começar a enviar campanhas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {numeros.map(n => (
              <div
                key={n.id}
                className="flex items-center gap-4 p-4 bg-slate-900/60 border border-slate-700/50 rounded-lg"
              >
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{n.nome}</span>
                    {n.is_default && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Padrão
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    Phone ID: {n.phone_number_id} · WABA: {n.waba_id}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Limite: {n.limite_diario.toLocaleString('pt-BR')}/dia
                    {n.orcamento_mensal && ` · Orçamento: R$ ${n.orcamento_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => abrirEditar(n)}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleExcluir(n)}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contatos Bloqueados (DNC) */}
      <SecaoBloqueados />

      {/* Respostas Rápidas */}
      <SecaoRespostasRapidas />

      <ModalNumero
        open={modalAberto}
        onOpenChange={setModalAberto}
        numero={numeroEditando}
        onSalvar={handleSalvar}
      />
    </div>
  )
}

// ─── Seção Contatos Bloqueados ────────────────────────────────────────────────

function SecaoBloqueados() {
  const [bloqueados, setBloqueados] = useState<{ id: string; telefone: string; motivo: string | null; bloqueado_em: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('contatos_bloqueados_campanha').select('*').order('bloqueado_em', { ascending: false }).then(({ data }) => {
      setBloqueados(data ?? [])
      setLoading(false)
    })
  }, [])

  async function desbloquear(id: string) {
    const { error } = await supabase.from('contatos_bloqueados_campanha').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setBloqueados(prev => prev.filter(b => b.id !== id))
    toast.success('Contato desbloqueado')
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Ban className="w-4 h-4 text-red-400" />
        <h2 className="text-white font-semibold">Contatos Bloqueados (DNC)</h2>
        <span className="text-xs text-gray-500">({bloqueados.length})</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Contatos bloqueados não recebem campanhas nem respostas automáticas.</p>
      {loading ? (
        <div className="text-center py-4 text-gray-500 text-sm"><RefreshCw className="w-4 h-4 animate-spin mx-auto" /></div>
      ) : bloqueados.length === 0 ? (
        <p className="text-center py-4 text-gray-500 text-sm">Nenhum contato bloqueado.</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {bloqueados.map(b => (
            <div key={b.id} className="flex items-center justify-between px-3 py-2 bg-slate-900/50 rounded-lg">
              <div>
                <span className="text-sm text-white">{b.telefone}</span>
                {b.motivo && <span className="text-xs text-gray-500 ml-2">· {b.motivo}</span>}
              </div>
              <button onClick={() => desbloquear(b.id)} className="text-xs text-red-400 hover:text-red-300 transition">Desbloquear</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Seção Respostas Rápidas ──────────────────────────────────────────────────

function SecaoRespostasRapidas() {
  const [respostas, setRespostas] = useState<{ id: string; titulo: string; conteudo: string; categoria: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoConteudo, setNovoConteudo] = useState('')

  useEffect(() => {
    supabase.from('respostas_rapidas_campanha').select('*').order('titulo').then(({ data }) => {
      setRespostas(data ?? [])
      setLoading(false)
    })
  }, [])

  async function adicionar() {
    if (!novoTitulo.trim() || !novoConteudo.trim()) { toast.error('Preencha título e conteúdo'); return }
    const { data, error } = await supabase.from('respostas_rapidas_campanha').insert({ titulo: novoTitulo.trim(), conteudo: novoConteudo.trim() }).select().single()
    if (error) { toast.error(error.message); return }
    setRespostas(prev => [...prev, data])
    setNovoTitulo('')
    setNovoConteudo('')
    toast.success('Resposta rápida adicionada')
  }

  async function remover(id: string) {
    const { error } = await supabase.from('respostas_rapidas_campanha').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setRespostas(prev => prev.filter(r => r.id !== id))
    toast.success('Resposta removida')
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-amber-400" />
        <h2 className="text-white font-semibold">Respostas Rápidas</h2>
        <span className="text-xs text-gray-500">({respostas.length})</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">Use "/" no chat de conversas para inserir respostas rápidas.</p>

      {/* Adicionar */}
      <div className="flex gap-2 mb-3">
        <input value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} placeholder="Título (ex: saudacao)" className={cn(inputCls, 'w-40')} />
        <input value={novoConteudo} onChange={e => setNovoConteudo(e.target.value)} placeholder="Conteúdo da resposta..." className={cn(inputCls, 'flex-1')} />
        <Button onClick={adicionar} className="bg-amber-500 hover:bg-amber-600 text-black text-sm px-3">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-4 text-gray-500 text-sm"><RefreshCw className="w-4 h-4 animate-spin mx-auto" /></div>
      ) : respostas.length === 0 ? (
        <p className="text-center py-4 text-gray-500 text-sm">Nenhuma resposta rápida configurada.</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {respostas.map(r => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-slate-900/50 rounded-lg">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-amber-400">/{r.titulo}</span>
                <p className="text-xs text-gray-400 truncate mt-0.5">{r.conteudo}</p>
              </div>
              <button onClick={() => remover(r.id)} className="text-xs text-red-400 hover:text-red-300 transition ml-2 flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30'
