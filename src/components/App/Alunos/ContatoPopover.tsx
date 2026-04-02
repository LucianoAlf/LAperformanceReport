import { useState, useEffect } from 'react'
import { Phone, Copy, ExternalLink, Star, Loader2, UserPlus, Plus, Check, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface Contato {
  id: number
  nome: string
  telefone: string | null
  parentesco: string | null
  principal: boolean
}

const PARENTESCO_LABEL: Record<string, string> = {
  proprio: 'Próprio',
  mae: 'Mãe',
  pai: 'Pai',
  responsavel: 'Responsável',
  avo: 'Avó/Avô',
  tio: 'Tio/Tia',
  outro: 'Outro',
}

const PARENTESCO_COLOR: Record<string, string> = {
  proprio: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  mae: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  pai: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  responsavel: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  avo: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  tio: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  outro: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
}

function formatPhone(tel: string | null): string {
  if (!tel) return '-'
  const digits = tel.replace(/\D/g, '')
  // Remove country code 55 for display
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }
  return tel
}

function whatsappLink(tel: string | null): string | null {
  if (!tel) return null
  const digits = tel.replace(/\D/g, '')
  const full = digits.startsWith('55') ? digits : '55' + digits
  return `https://wa.me/${full}`
}

interface ContatoPopoverProps {
  alunoId: number
  telefonePrincipal: string | null
}

export function ContatoPopover({ alunoId, telefonePrincipal }: ContatoPopoverProps) {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ nome: '', telefone: '', parentesco: 'proprio' })

  function fetchContatos() {
    setLoading(true)
    supabase
      .from('aluno_contatos')
      .select('id, nome, telefone, parentesco, principal')
      .eq('aluno_id', alunoId)
      .order('principal', { ascending: false })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setContatos(data || [])
        setLoaded(true)
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!open || loaded) return
    fetchContatos()
  }, [open, loaded, alunoId])

  function copiarNumero(tel: string | null) {
    if (!tel) return
    navigator.clipboard.writeText(tel.replace(/\D/g, ''))
    toast.success('Número copiado')
  }

  function resetForm() {
    setForm({ nome: '', telefone: '', parentesco: 'proprio' })
    setShowAdd(false)
  }

  async function salvarContato() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.telefone.trim()) { toast.error('Telefone é obrigatório'); return }
    setSalvando(true)
    const { error } = await supabase.from('aluno_contatos').insert({
      aluno_id: alunoId,
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      parentesco: form.parentesco,
      principal: contatos.length === 0,
    })
    setSalvando(false)
    if (error) {
      toast.error('Erro ao salvar contato')
      console.error(error)
      return
    }
    toast.success('Contato adicionado')
    resetForm()
    fetchContatos()
  }

  const total = contatos.length
  const displayPhone = formatPhone(telefonePrincipal)

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <PopoverTrigger asChild>
        <button
          className="group flex items-center gap-1.5 text-left text-sm hover:bg-slate-800/60 rounded-md px-1.5 py-1 -mx-1.5 -my-1 transition-colors w-full min-w-[120px]"
        >
          <Phone className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
          <span className="text-slate-300 group-hover:text-white transition-colors truncate font-mono text-xs">
            {telefonePrincipal ? displayPhone : <span className="text-slate-600 font-sans">sem tel.</span>}
          </span>
          {loaded && total > 1 && (
            <span className="flex-shrink-0 ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-700/80 text-slate-400 border border-slate-600/50">
              +{total - 1}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-72 p-0 bg-slate-900 border-slate-700/80 shadow-xl shadow-black/40 rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-3.5 py-2.5 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Phone className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-xs font-medium text-slate-300">
              {total === 0 ? 'Nenhum contato' : `${total} contato${total > 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Carregando...</span>
            </div>
          ) : contatos.length === 0 && !showAdd ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-500">
              <UserPlus className="w-5 h-5 mb-1.5 opacity-40" />
              <span className="text-xs">Nenhum contato cadastrado</span>
            </div>
          ) : (
            <div className="py-1">
              {contatos.map((contato, i) => {
                const parentescoKey = contato.parentesco || 'outro'
                const colorCls = PARENTESCO_COLOR[parentescoKey] || PARENTESCO_COLOR.outro
                const waLink = whatsappLink(contato.telefone)

                return (
                  <div
                    key={contato.id}
                    className={`px-3.5 py-2.5 hover:bg-slate-800/50 transition-colors ${
                      i > 0 ? 'border-t border-slate-800/60' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {contato.principal && (
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                      )}
                      <span className="text-[13px] font-medium text-slate-200 truncate">
                        {contato.nome}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${colorCls}`}>
                        {PARENTESCO_LABEL[parentescoKey] || parentescoKey}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-slate-400 flex-1">
                        {formatPhone(contato.telefone)}
                      </span>
                      {contato.telefone && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); copiarNumero(contato.telefone) }}
                            className="p-1 rounded hover:bg-slate-700/80 text-slate-500 hover:text-slate-300 transition-colors"
                            title="Copiar número"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="p-1 rounded hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Abrir WhatsApp"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Inline add form */}
          {showAdd && (
            <div className="border-t border-slate-800/60 px-3.5 py-3 space-y-2 bg-slate-800/20">
              <input
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome do contato"
                autoFocus
                className="w-full h-7 px-2.5 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
              />
              <input
                value={form.telefone}
                onChange={e => setForm({ ...form, telefone: e.target.value })}
                placeholder="(21) 99999-9999"
                className="w-full h-7 px-2.5 text-xs font-mono bg-slate-800 border border-slate-700 rounded-md text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
              />
              <div className="flex items-center gap-2">
                <select
                  value={form.parentesco}
                  onChange={e => setForm({ ...form, parentesco: e.target.value })}
                  className="flex-1 h-7 px-2 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-300 focus:outline-none focus:border-emerald-500/50"
                >
                  {Object.entries(PARENTESCO_LABEL).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={salvarContato}
                  disabled={salvando}
                  className="h-7 w-7 flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                  title="Salvar"
                >
                  {salvando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={resetForm}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Cancelar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Add button */}
        {!showAdd && !loading && (
          <div className="border-t border-slate-800 px-3.5 py-2">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-400 transition-colors w-full py-0.5"
            >
              <Plus className="w-3 h-3" />
              Adicionar contato
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
