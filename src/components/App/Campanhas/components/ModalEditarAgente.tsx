import { useState, useEffect } from 'react'
import { Bot, Wrench, Clock, Shield, MessageSquare, Plus, Trash2, X, Sparkles, Loader2, ChevronDown, Settings2, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAgentes, type Agente, type AgenteForm } from '../hooks/useAgentes'
import { useNumerosMeta } from '../hooks/useNumerosMeta'
import type { AgentToolDefinition, AgentToolParameter } from '../types'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Aba = 'prompt' | 'tools' | 'toolconfig' | 'horario' | 'antispam' | 'mensagens'

const ABAS: { id: Aba; label: string; icon: React.ElementType }[] = [
  { id: 'prompt', label: 'Prompt', icon: Bot },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'toolconfig', label: 'Config Tools', icon: Settings2 },
  { id: 'horario', label: 'Horário', icon: Clock },
  { id: 'antispam', label: 'Anti-Spam', icon: Shield },
  { id: 'mensagens', label: 'Mensagens', icon: MessageSquare },
]

const MODELOS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'gemini' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'gemini' },
]

const BUILTIN_TOOLS: AgentToolDefinition[] = [
  {
    name: 'transfer', description: 'Transfere o lead para um consultor humano na unidade especificada.',
    parameters: [
      { name: 'unit', type: 'string', description: 'Nome da unidade', required: true },
      { name: 'lead_name', type: 'string', description: 'Nome do lead', required: false },
      { name: 'summary', type: 'string', description: 'Resumo da conversa', required: false },
    ],
    enabled: true, config: {},
  },
  {
    name: 'think', description: 'Raciocínio interno antes de responder (não visível ao usuário).',
    parameters: [{ name: 'thought', type: 'string', description: 'Seu raciocínio', required: true }],
    enabled: true,
  },
  {
    name: 'send_buttons', description: 'Envia mensagem com botões de resposta rápida (máx 3 botões).',
    parameters: [
      { name: 'body', type: 'string', description: 'Texto principal', required: true },
      { name: 'buttons', type: 'array', description: 'Textos dos botões (máx 3)', required: true },
    ],
    enabled: true,
  },
  {
    name: 'send_list', description: 'Envia mensagem com lista de opções (menu expandível, máx 10 itens).',
    parameters: [
      { name: 'body', type: 'string', description: 'Texto explicando as opções', required: true },
      { name: 'button_text', type: 'string', description: 'Texto do botão', required: true },
      { name: 'items', type: 'array', description: 'Opções {title, description?}', required: true },
    ],
    enabled: true,
  },
]

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  agente: Agente | null
  onSalvo: () => void
  unidadeId: string | null
}

export function ModalEditarAgente({ open, onOpenChange, agente, onSalvo, unidadeId }: Props) {
  const { numeros } = useNumerosMeta(unidadeId ?? undefined)
  const { criar, atualizar } = useAgentes()
  const [aba, setAba] = useState<Aba>('prompt')
  const [salvando, setSalvando] = useState(false)

  const defaultForm: AgenteForm = {
    unidade_id: unidadeId ?? '',
    nome: '', descricao: '',
    system_prompt: '', modelo: 'gpt-4o-mini', provider: 'openai',
    temperature: 0.7, max_tokens: 1024,
    tools: [...BUILTIN_TOOLS],
    mensagem_boas_vindas: null, mensagem_fallback: null,
    horario_funcionamento: {},
    is_active: true, status: 'active',
    numero_meta_id: null,
    anti_spam: { min_interval_ms: 3000, max_messages_per_minute: 20 },
    modo_teste: false, telefone_teste: null,
    auto_reply_message: null,
  }

  const [form, setForm] = useState<AgenteForm>(defaultForm)

  useEffect(() => {
    if (agente) {
      setForm({
        unidade_id: agente.unidade_id,
        nome: agente.nome, descricao: agente.descricao ?? '',
        system_prompt: agente.system_prompt,
        modelo: agente.modelo, provider: agente.provider,
        temperature: agente.temperature, max_tokens: agente.max_tokens,
        tools: agente.tools?.length ? agente.tools : [...BUILTIN_TOOLS],
        mensagem_boas_vindas: agente.mensagem_boas_vindas,
        mensagem_fallback: agente.mensagem_fallback,
        horario_funcionamento: agente.horario_funcionamento ?? {},
        is_active: agente.is_active, status: agente.status,
        numero_meta_id: agente.numero_meta_id,
        anti_spam: agente.anti_spam ?? { min_interval_ms: 3000, max_messages_per_minute: 20 },
        modo_teste: agente.modo_teste, telefone_teste: agente.telefone_teste,
        auto_reply_message: agente.auto_reply_message,
      })
    } else {
      setForm(defaultForm)
    }
    setAba('prompt')
  }, [agente, open])

  function set<K extends keyof AgenteForm>(key: K, val: AgenteForm[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSalvar() {
    if (!form.nome.trim() || !form.system_prompt.trim()) {
      toast.error('Nome e system prompt são obrigatórios')
      return
    }
    setSalvando(true)
    try {
      if (agente) {
        const { error } = await atualizar(agente.id, form)
        if (error) { toast.error(error); return }
        toast.success('Agente atualizado')
      } else {
        const { error } = await criar(form)
        if (error) { toast.error(error); return }
        toast.success('Agente criado')
      }
      onSalvo()
      onOpenChange(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-3xl p-0 overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-slate-700/50">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-white">{agente ? 'Editar Agente' : 'Novo Agente'}</h2>
          </div>
          <div className="flex gap-1">
            {ABAS.map(a => {
              const Icon = a.icon
              return (
                <button key={a.id} onClick={() => setAba(a.id)} className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                  aba === a.id ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300',
                )}>
                  <Icon className="w-3.5 h-3.5" />
                  {a.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-5 overflow-y-auto max-h-[55vh]">
          {aba === 'prompt' && <AbaPrompt form={form} set={set} numeros={numeros} />}
          {aba === 'tools' && <AbaTools form={form} set={set} />}
          {aba === 'toolconfig' && <AbaToolConfig form={form} set={set} />}
          {aba === 'horario' && <AbaHorario form={form} set={set} />}
          {aba === 'antispam' && <AbaAntiSpam form={form} set={set} />}
          {aba === 'mensagens' && <AbaMensagens form={form} set={set} />}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-700/50">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvando} className="bg-amber-500 hover:bg-amber-600 text-black">
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Abas internas ────────────────────────────────────────────────────────────

function AbaPrompt({ form, set, numeros }: { form: AgenteForm; set: <K extends keyof AgenteForm>(k: K, v: AgenteForm[K]) => void; numeros: any[] }) {
  function handleModelo(modelo: string) {
    const m = MODELOS.find(m => m.value === modelo)
    set('modelo', modelo)
    if (m) set('provider', m.provider)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Nome do agente">
          <input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Qualificador CG" className={inputCls} />
        </Campo>
        <Campo label="Número WhatsApp">
          <select value={form.numero_meta_id ?? ''} onChange={e => set('numero_meta_id', e.target.value || null)} className={inputCls}>
            <option value="">Padrão da unidade</option>
            {numeros.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}
          </select>
        </Campo>
      </div>

      <Campo label="Descrição">
        <input value={form.descricao ?? ''} onChange={e => set('descricao', e.target.value)} placeholder="Breve descrição do agente" className={inputCls} />
      </Campo>

      <Campo label="System Prompt">
        <textarea
          value={form.system_prompt}
          onChange={e => set('system_prompt', e.target.value)}
          placeholder="Você é um assistente de qualificação..."
          rows={8}
          className={cn(inputCls, 'resize-none font-mono text-xs leading-relaxed')}
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-gray-600">{form.system_prompt.length} caracteres</p>
          <GeradorPrompt form={form} onGenerated={(prompt) => set('system_prompt', prompt)} />
        </div>
      </Campo>

      <div className="grid grid-cols-3 gap-3">
        <Campo label="Modelo">
          <select value={form.modelo} onChange={e => handleModelo(e.target.value)} className={inputCls}>
            {MODELOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Campo>
        <Campo label="Temperatura">
          <input type="number" min={0} max={2} step={0.1} value={form.temperature} onChange={e => set('temperature', parseFloat(e.target.value) || 0.7)} className={inputCls} />
        </Campo>
        <Campo label="Max Tokens">
          <input type="number" min={100} max={4096} value={form.max_tokens} onChange={e => set('max_tokens', parseInt(e.target.value) || 1024)} className={inputCls} />
        </Campo>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.modo_teste} onChange={e => set('modo_teste', e.target.checked)} className="w-4 h-4 accent-amber-500" />
          <span className="text-sm text-gray-300">Modo teste</span>
        </label>
        {form.modo_teste && (
          <input value={form.telefone_teste ?? ''} onChange={e => set('telefone_teste', e.target.value)} placeholder="5521999999999" className={cn(inputCls, 'w-48')} />
        )}
      </div>
    </div>
  )
}

function AbaTools({ form, set }: { form: AgenteForm; set: <K extends keyof AgenteForm>(k: K, v: AgenteForm[K]) => void }) {
  const tools = form.tools ?? []

  function toggleTool(idx: number) {
    const updated = [...tools]
    updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled }
    set('tools', updated)
  }

  function addTool() {
    set('tools', [...tools, {
      name: '', description: '', parameters: [], enabled: true,
    }])
  }

  function removeTool(idx: number) {
    set('tools', tools.filter((_, i) => i !== idx))
  }

  function updateTool(idx: number, field: string, value: any) {
    const updated = [...tools]
    updated[idx] = { ...updated[idx], [field]: value }
    set('tools', updated)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Configure as ferramentas que o agente pode usar.</p>
      {tools.map((tool, idx) => {
        const isBuiltin = tool.name === 'transfer' || tool.name === 'think'
        return (
          <div key={idx} className={cn('bg-slate-800/50 rounded-lg p-4 border', tool.enabled ? 'border-slate-700/50' : 'border-slate-700/30 opacity-50')}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tool.enabled} onChange={() => toggleTool(idx)} className="w-4 h-4 accent-amber-500" />
                  {isBuiltin ? (
                    <span className="text-sm text-white font-medium">{tool.name}</span>
                  ) : (
                    <input value={tool.name} onChange={e => updateTool(idx, 'name', e.target.value)} placeholder="nome_tool" className={cn(inputCls, 'w-40 py-1')} />
                  )}
                </label>
                {isBuiltin && <span className="text-xs text-gray-500 px-1.5 py-0.5 rounded bg-slate-700">built-in</span>}
              </div>
              {!isBuiltin && (
                <button onClick={() => removeTool(idx)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
            {isBuiltin ? (
              <p className="text-xs text-gray-500">{tool.description}</p>
            ) : (
              <input value={tool.description} onChange={e => updateTool(idx, 'description', e.target.value)} placeholder="Descrição da ferramenta" className={cn(inputCls, 'text-xs')} />
            )}
          </div>
        )
      })}
      <Button variant="outline" size="sm" onClick={addTool}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar tool
      </Button>
    </div>
  )
}

// ─── Aba Config Tools ─────────────────────────────────────────────────────────

function AbaToolConfig({ form, set }: { form: AgenteForm; set: <K extends keyof AgenteForm>(k: K, v: AgenteForm[K]) => void }) {
  const tools = form.tools ?? []
  const enabledTools = tools.filter(t => t.enabled)

  function updateToolConfig(toolName: string, config: Record<string, unknown>) {
    const updated = tools.map(t => t.name === toolName ? { ...t, config } : t)
    set('tools', updated)
  }

  function getToolConfig(toolName: string): Record<string, unknown> {
    return (tools.find(t => t.name === toolName)?.config ?? {}) as Record<string, unknown>
  }

  if (enabledTools.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Settings2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhuma tool habilitada.</p>
        <p className="text-xs mt-1">Ative tools na aba "Tools" primeiro.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">Configure os parâmetros de cada ferramenta habilitada.</p>

      {enabledTools.map(tool => (
        <div key={tool.name} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/30 flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-sm font-medium text-white">{tool.name}</span>
            <span className="text-xs text-gray-500">{tool.description.slice(0, 60)}...</span>
          </div>
          <div className="px-4 py-3">
            {tool.name === 'transfer' && (
              <TransferConfig config={getToolConfig('transfer')} onChange={c => updateToolConfig('transfer', c)} />
            )}
            {tool.name === 'send_buttons' && (
              <SendButtonsConfig config={getToolConfig('send_buttons')} onChange={c => updateToolConfig('send_buttons', c)} />
            )}
            {tool.name === 'send_list' && (
              <SendListConfig config={getToolConfig('send_list')} onChange={c => updateToolConfig('send_list', c)} />
            )}
            {tool.name === 'think' && (
              <p className="text-xs text-gray-500">Sem configuração necessária. O agente usa raciocínio interno automaticamente.</p>
            )}
            {!['transfer', 'send_buttons', 'send_list', 'think'].includes(tool.name) && (
              <div className="space-y-2">
                <Campo label="Config JSON (avançado)">
                  <textarea
                    value={JSON.stringify(getToolConfig(tool.name), null, 2)}
                    onChange={e => { try { updateToolConfig(tool.name, JSON.parse(e.target.value)) } catch {} }}
                    rows={4}
                    className={cn(inputCls, 'resize-none font-mono text-xs')}
                    placeholder='{}'
                  />
                </Campo>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Transfer Config ──────────────────────────────────────────────────────────

function TransferConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const units = (config.units as any[] ?? []) as Array<{ name: string; inbox_id: string; consultant_phone?: string; consultant_name?: string; quepasa_bot_token?: string }>
  const cwUrl = (config.chatwoot_api_url as string) ?? ''
  const cwToken = (config.chatwoot_api_token as string) ?? ''
  const cwAccount = (config.chatwoot_account_id as string) ?? ''
  const quepasaUrl = (config.quepasa_url as string) ?? ''
  const campanhaLabel = (config.campanha_label as string) ?? ''

  function update(field: string, value: unknown) {
    onChange({ ...config, [field]: value })
  }

  function addUnit() {
    update('units', [...units, { name: '', inbox_id: '', consultant_phone: '', consultant_name: '', quepasa_bot_token: '' }])
  }

  function updateUnit(idx: number, field: string, value: string) {
    const updated = [...units]
    updated[idx] = { ...updated[idx], [field]: value }
    update('units', updated)
  }

  function removeUnit(idx: number) {
    update('units', units.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">As mensagens de transferência são controladas pelo system prompt. Aqui configure apenas integrações técnicas.</p>

      {/* Label da campanha */}
      <Campo label="Label da campanha">
        <input value={campanhaLabel} onChange={e => update('campanha_label', e.target.value)} placeholder="ex: lead-volta-as-aulas-2026" className={cn(inputCls, 'text-xs')} />
        <p className="text-xs text-gray-600 mt-1">Adicionada ao contato e conversa no Chatwoot</p>
      </Campo>

      {/* Unidades de transferência */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-400">Unidades para transferência</label>
          <button type="button" onClick={addUnit} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition">
            <Plus className="w-3 h-3" /> Adicionar
          </button>
        </div>
        {units.length === 0 ? (
          <p className="text-xs text-gray-600 py-2">Nenhuma unidade configurada. O transfer funcionará sem notificar consultores.</p>
        ) : (
          <div className="space-y-3">
            {units.map((u, idx) => (
              <div key={idx} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Unidade {idx + 1}</span>
                  <button type="button" onClick={() => removeUnit(idx)} className="text-gray-500 hover:text-red-400 transition">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={u.name} onChange={e => updateUnit(idx, 'name', e.target.value)} placeholder="Nome (ex: Campo Grande)" className={cn(inputCls, 'text-xs py-1.5')} />
                  <input value={u.inbox_id} onChange={e => updateUnit(idx, 'inbox_id', e.target.value)} placeholder="Inbox ID Chatwoot" className={cn(inputCls, 'text-xs py-1.5')} />
                  <input value={u.consultant_name ?? ''} onChange={e => updateUnit(idx, 'consultant_name', e.target.value)} placeholder="Nome do consultor" className={cn(inputCls, 'text-xs py-1.5')} />
                  <input value={u.consultant_phone ?? ''} onChange={e => updateUnit(idx, 'consultant_phone', e.target.value)} placeholder="Tel consultor (5521...)" className={cn(inputCls, 'text-xs py-1.5')} />
                  <input value={u.quepasa_bot_token ?? ''} onChange={e => updateUnit(idx, 'quepasa_bot_token', e.target.value)} placeholder="Token bot Quepasa" className={cn(inputCls, 'text-xs py-1.5 col-span-2')} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chatwoot + Quepasa */}
      <div className="border-t border-slate-700/30 pt-3">
        <p className="text-xs font-medium text-gray-400 mb-2">Integração Chatwoot</p>
        <div className="grid grid-cols-1 gap-2">
          <input value={cwUrl} onChange={e => update('chatwoot_api_url', e.target.value)} placeholder="URL Chatwoot (ex: https://chatmusic.poliredeomnichat.com.br)" className={cn(inputCls, 'text-xs')} />
          <div className="grid grid-cols-2 gap-2">
            <input value={cwToken} onChange={e => update('chatwoot_api_token', e.target.value)} placeholder="API Token" className={cn(inputCls, 'text-xs')} />
            <input value={cwAccount} onChange={e => update('chatwoot_account_id', e.target.value)} placeholder="Account ID" className={cn(inputCls, 'text-xs')} />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-700/30 pt-3">
        <p className="text-xs font-medium text-gray-400 mb-2">Quepasa (notificação consultor via WhatsApp)</p>
        <input value={quepasaUrl} onChange={e => update('quepasa_url', e.target.value)} placeholder="URL Quepasa (ex: https://poliredeomnichat.apibridge.top)" className={cn(inputCls, 'text-xs')} />
        <p className="text-xs text-gray-600 mt-1">Token do bot de cada unidade é configurado acima, por unidade</p>
      </div>
    </div>
  )
}

// ─── Send Buttons Config ──────────────────────────────────────────────────────

function SendButtonsConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const maxButtons = (config.max_buttons as number) ?? 3
  const defaultFooter = (config.default_footer as string) ?? ''

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Máx botões por mensagem">
          <input type="number" min={1} max={3} value={maxButtons} onChange={e => onChange({ ...config, max_buttons: parseInt(e.target.value) || 3 })} className={cn(inputCls, 'text-xs')} />
          <p className="text-xs text-gray-600 mt-1">Limite da Meta: 3</p>
        </Campo>
        <Campo label="Footer padrão">
          <input value={defaultFooter} onChange={e => onChange({ ...config, default_footer: e.target.value })} placeholder="Opcional (ex: LA Music)" className={cn(inputCls, 'text-xs')} />
        </Campo>
      </div>
      <p className="text-xs text-gray-500">O agente decide automaticamente quando usar botões com base no contexto da conversa.</p>
    </div>
  )
}

// ─── Send List Config ─────────────────────────────────────────────────────────

function SendListConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const defaultButtonText = (config.default_button_text as string) ?? 'Ver opções'
  const defaultFooter = (config.default_footer as string) ?? ''

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Texto do botão padrão">
          <input value={defaultButtonText} onChange={e => onChange({ ...config, default_button_text: e.target.value })} placeholder="Ver opções" className={cn(inputCls, 'text-xs')} />
          <p className="text-xs text-gray-600 mt-1">Máx 20 caracteres</p>
        </Campo>
        <Campo label="Footer padrão">
          <input value={defaultFooter} onChange={e => onChange({ ...config, default_footer: e.target.value })} placeholder="Opcional" className={cn(inputCls, 'text-xs')} />
        </Campo>
      </div>
      <p className="text-xs text-gray-500">O agente decide automaticamente quando usar listas com base no contexto da conversa.</p>
    </div>
  )
}

// ─── Aba Horário ──────────────────────────────────────────────────────────────

function AbaHorario({ form, set }: { form: AgenteForm; set: <K extends keyof AgenteForm>(k: K, v: AgenteForm[K]) => void }) {
  const wh = form.horario_funcionamento ?? {}
  const dias = wh.days ?? []
  const DIAS_SEMANA = [
    { id: 1, label: 'Seg' }, { id: 2, label: 'Ter' }, { id: 3, label: 'Qua' },
    { id: 4, label: 'Qui' }, { id: 5, label: 'Sex' }, { id: 6, label: 'Sáb' }, { id: 7, label: 'Dom' },
  ]

  function updateWH(field: string, value: any) {
    set('horario_funcionamento', { ...wh, [field]: value })
  }

  function toggleDia(dia: number) {
    const updated = dias.includes(dia) ? dias.filter((d: number) => d !== dia) : [...dias, dia]
    updateWH('days', updated)
  }

  const is24h = !wh.start && !wh.end && (!wh.days || wh.days.length === 0)

  function toggle24h() {
    if (is24h) {
      // Ativar horário limitado com defaults
      set('horario_funcionamento', { start: '09:00', end: '18:00', timezone: 'America/Sao_Paulo', days: [1, 2, 3, 4, 5], outside_message: wh.outside_message ?? '' })
    } else {
      // Limpar tudo = 24/7
      set('horario_funcionamento', { outside_message: wh.outside_message ?? '' })
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Configure o horário de funcionamento do agente. Fora do horário, ele envia a mensagem de fora do expediente.</p>

      <label className="flex items-center gap-3 cursor-pointer py-2">
        <input type="checkbox" checked={is24h} onChange={toggle24h} className="w-4 h-4 accent-amber-500" />
        <div>
          <span className="text-sm text-white font-medium">Online 24/7</span>
          <p className="text-xs text-gray-500">Agente responde a qualquer hora, todos os dias</p>
        </div>
      </label>

      {!is24h && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Início">
              <input type="time" value={wh.start ?? ''} onChange={e => updateWH('start', e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Fim">
              <input type="time" value={wh.end ?? ''} onChange={e => updateWH('end', e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Timezone">
              <select value={wh.timezone ?? 'America/Sao_Paulo'} onChange={e => updateWH('timezone', e.target.value)} className={inputCls}>
                <option value="America/Sao_Paulo">BRT (SP)</option>
                <option value="America/Manaus">AMT (Manaus)</option>
                <option value="America/Fortaleza">BRT (Fortaleza)</option>
              </select>
            </Campo>
          </div>

          <Campo label="Dias de funcionamento">
            <div className="flex gap-2">
              {DIAS_SEMANA.map(d => (
                <button key={d.id} type="button" onClick={() => toggleDia(d.id)} className={cn(
                  'w-10 h-10 rounded-lg text-xs font-medium transition-colors border',
                  dias.includes(d.id) ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-gray-500 border-slate-700 hover:border-slate-600',
                )}>
                  {d.label}
                </button>
              ))}
            </div>
          </Campo>

          <Campo label="Mensagem fora do horário">
            <textarea
              value={wh.outside_message ?? ''}
              onChange={e => updateWH('outside_message', e.target.value)}
              placeholder="Nosso horário de atendimento é de segunda a sexta, das 9h às 18h."
              rows={3}
              className={cn(inputCls, 'resize-none')}
            />
          </Campo>
        </>
      )}
    </div>
  )
}

function AbaAntiSpam({ form, set }: { form: AgenteForm; set: <K extends keyof AgenteForm>(k: K, v: AgenteForm[K]) => void }) {
  const as = form.anti_spam ?? { min_interval_ms: 3000, max_messages_per_minute: 20 }

  function update(field: string, value: number) {
    set('anti_spam', { ...as, [field]: value })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Configure o debounce e limites de taxa para evitar spam e custos excessivos.</p>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Debounce (ms)">
          <input type="number" min={0} step={500} value={as.min_interval_ms} onChange={e => update('min_interval_ms', parseInt(e.target.value) || 3000)} className={inputCls} />
          <p className="text-xs text-gray-600 mt-1">Acumula mensagens por {as.min_interval_ms / 1000}s antes de processar</p>
        </Campo>
        <Campo label="Máx mensagens/minuto">
          <input type="number" min={1} value={as.max_messages_per_minute} onChange={e => update('max_messages_per_minute', parseInt(e.target.value) || 20)} className={inputCls} />
          <p className="text-xs text-gray-600 mt-1">Limite de rate para prevenir flooding</p>
        </Campo>
      </div>
    </div>
  )
}

function AbaMensagens({ form, set }: { form: AgenteForm; set: <K extends keyof AgenteForm>(k: K, v: AgenteForm[K]) => void }) {
  return (
    <div className="space-y-4">
      <Campo label="Mensagem de boas-vindas (primeira mensagem)">
        <textarea
          value={form.mensagem_boas_vindas ?? ''}
          onChange={e => set('mensagem_boas_vindas', e.target.value || null)}
          placeholder="Opcional — enviada quando o contato fala pela primeira vez"
          rows={3}
          className={cn(inputCls, 'resize-none')}
        />
      </Campo>
      <Campo label="Mensagem de fallback (quando IA falha)">
        <textarea
          value={form.mensagem_fallback ?? ''}
          onChange={e => set('mensagem_fallback', e.target.value || null)}
          placeholder="Desculpe, estou com dificuldades. Um atendente irá te ajudar."
          rows={3}
          className={cn(inputCls, 'resize-none')}
        />
      </Campo>
      <Campo label="Auto-reply (campanhas sem agente)">
        <textarea
          value={form.auto_reply_message ?? ''}
          onChange={e => set('auto_reply_message', e.target.value || null)}
          placeholder="Opcional — só envia se preenchido e não há agente ativo"
          rows={3}
          className={cn(inputCls, 'resize-none')}
        />
        <p className="text-xs text-gray-600 mt-1">Enviado apenas 1x quando contato responde a template e não há agente. Deixe vazio para não enviar nada.</p>
      </Campo>
    </div>
  )
}

// ─── Gerador de Prompt com IA ─────────────────────────────────────────────────

const OBJETIVOS = ['Qualificar leads', 'Agendar aula experimental', 'Reativação de ex-alunos', 'Suporte e dúvidas', 'Personalizado']
const TONS = ['Amigável', 'Profissional', 'Casual', 'Formal', 'Entusiástico']

function GeradorPrompt({ form, onGenerated }: { form: AgenteForm; onGenerated: (prompt: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const [objetivo, setObjetivo] = useState('Qualificar leads')
  const [tom, setTom] = useState('Amigável')
  const [infoEscola, setInfoEscola] = useState('')
  const [regras, setRegras] = useState('')
  const [perguntas, setPerguntas] = useState('')

  async function gerar() {
    setGerando(true)
    setPreview(null)
    try {
      const toolsHabilitadas = (form.tools ?? []).filter(t => t.enabled).map(t => t.name)
      const { data, error } = await supabase.functions.invoke('gerar-prompt-agente', {
        body: {
          objetivo,
          tom_voz: tom,
          info_escola: infoEscola,
          regras,
          perguntas,
          idioma: 'Português BR',
          tools_habilitadas: toolsHabilitadas,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setPreview(data.prompt)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setGerando(false)
    }
  }

  function aplicar() {
    if (!preview) return
    if (form.system_prompt.trim() && !confirm('Sobrescrever o prompt atual?')) return
    onGenerated(preview)
    setPreview(null)
    setAberto(false)
    toast.success('Prompt aplicado')
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition">
        <Sparkles className="w-3.5 h-3.5" />
        Gerar com IA
      </button>
    )
  }

  return (
    <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-300">Gerador de Prompt</span>
        </div>
        <button type="button" onClick={() => { setAberto(false); setPreview(null) }} className="text-gray-500 hover:text-white transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!preview ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Objetivo</label>
              <select value={objetivo} onChange={e => setObjetivo(e.target.value)} className={inputCls}>
                {OBJETIVOS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Tom de voz</label>
              <select value={tom} onChange={e => setTom(e.target.value)} className={inputCls}>
                {TONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Informações da escola</label>
            <textarea value={infoEscola} onChange={e => setInfoEscola(e.target.value)} placeholder="Cursos, horários, unidades, diferenciais, preços..." rows={3} className={cn(inputCls, 'resize-none text-xs')} />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Regras específicas</label>
            <textarea value={regras} onChange={e => setRegras(e.target.value)} placeholder="O que deve/não deve fazer. Ex: não falar preço, sempre pedir nome..." rows={2} className={cn(inputCls, 'resize-none text-xs')} />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Perguntas que deve fazer</label>
            <textarea value={perguntas} onChange={e => setPerguntas(e.target.value)} placeholder="Ex: nome, curso de interesse, melhor horário, unidade preferida..." rows={2} className={cn(inputCls, 'resize-none text-xs')} />
          </div>

          <button type="button" onClick={gerar} disabled={gerando} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition text-sm font-medium disabled:opacity-50">
            {gerando ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4" /> Gerar Prompt</>}
          </button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Preview do prompt gerado</label>
            <textarea value={preview} onChange={e => setPreview(e.target.value)} rows={12} className={cn(inputCls, 'resize-none font-mono text-xs leading-relaxed')} />
            <p className="text-xs text-gray-600">{preview.length} caracteres — você pode editar antes de aplicar</p>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={aplicar} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition text-sm font-medium">
              Usar este prompt
            </button>
            <button type="button" onClick={gerar} disabled={gerando} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition text-sm">
              {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gerar outro'}
            </button>
          </div>
        </>
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

const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30'
