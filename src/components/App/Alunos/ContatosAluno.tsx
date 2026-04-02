import { useState } from 'react'
import { Phone, Plus, Trash2, Star, Pencil, Check, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useContatosAluno, type ContatoAluno } from '@/hooks/useContatosAluno'
import { toast } from 'sonner'

const PARENTESCOS = [
  { value: 'proprio', label: 'Próprio' },
  { value: 'mae', label: 'Mãe' },
  { value: 'pai', label: 'Pai' },
  { value: 'responsavel', label: 'Responsável' },
  { value: 'avo', label: 'Avó/Avô' },
  { value: 'tio', label: 'Tio/Tia' },
  { value: 'outro', label: 'Outro' },
]

function parentescoLabel(value: string | null) {
  return PARENTESCOS.find(p => p.value === value)?.label || value || '-'
}

interface ContatosAlunoProps {
  alunoId: number
  nomeAluno: string
}

export function ContatosAluno({ alunoId, nomeAluno }: ContatosAlunoProps) {
  const { contatos, loading, adicionarContato, atualizarContato, removerContato } = useContatosAluno(alunoId)
  const [showForm, setShowForm] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [form, setForm] = useState({ nome: '', telefone: '', parentesco: 'proprio', principal: false })
  const [salvando, setSalvando] = useState(false)

  function abrirNovoContato() {
    setForm({ nome: '', telefone: '', parentesco: 'proprio', principal: contatos.length === 0 })
    setEditandoId(null)
    setShowForm(true)
  }

  function abrirEdicao(contato: ContatoAluno) {
    setForm({
      nome: contato.nome,
      telefone: contato.telefone || '',
      parentesco: contato.parentesco || 'proprio',
      principal: contato.principal,
    })
    setEditandoId(contato.id)
    setShowForm(true)
  }

  async function salvar() {
    if (!form.nome.trim()) {
      toast.error('Nome do contato é obrigatório')
      return
    }
    setSalvando(true)
    const dados = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      parentesco: form.parentesco,
      principal: form.principal,
    }
    const ok = editandoId
      ? await atualizarContato(editandoId, dados)
      : await adicionarContato(dados)
    setSalvando(false)
    if (ok) {
      toast.success(editandoId ? 'Contato atualizado' : 'Contato adicionado')
      setShowForm(false)
      setEditandoId(null)
    }
  }

  async function handleRemover(id: number) {
    const ok = await removerContato(id)
    if (ok) toast.success('Contato removido')
  }

  async function togglePrincipal(contato: ContatoAluno) {
    if (contato.principal) return // já é principal
    await atualizarContato(contato.id, { principal: true })
  }

  if (loading) {
    return (
      <div className="border-t border-slate-700 pt-4">
        <Label className="mb-3 block text-slate-400">
          <Phone className="inline w-4 h-4 mr-1.5" />Contatos
        </Label>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />Carregando...
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-slate-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <Label className="text-slate-400">
          <Phone className="inline w-4 h-4 mr-1.5" />Contatos
          <span className="ml-2 text-xs font-normal text-slate-500">({contatos.length})</span>
        </Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-emerald-400 hover:text-emerald-300"
          onClick={abrirNovoContato}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
        </Button>
      </div>

      {/* Lista de contatos */}
      {contatos.length === 0 && !showForm && (
        <p className="text-sm text-slate-500 italic">Nenhum contato cadastrado</p>
      )}

      <div className="space-y-2">
        {contatos.map(contato => (
          <div
            key={contato.id}
            className={`flex items-center gap-3 px-3 py-2 rounded-md border ${
              contato.principal
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-slate-800/50 border-slate-700'
            }`}
          >
            <button
              onClick={() => togglePrincipal(contato)}
              title={contato.principal ? 'Contato principal' : 'Tornar principal'}
              className="flex-shrink-0"
            >
              <Star className={`w-4 h-4 ${
                contato.principal ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-slate-400'
              }`} />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200 truncate">{contato.nome}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                  {parentescoLabel(contato.parentesco)}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {contato.telefone || 'sem telefone'}
              </span>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => abrirEdicao(contato)}
                className="p-1 text-slate-500 hover:text-slate-300 rounded"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleRemover(contato.id)}
                className="p-1 text-slate-500 hover:text-red-400 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Formulário inline de add/edit */}
      {showForm && (
        <div className="mt-3 p-3 rounded-md border border-slate-600 bg-slate-800/70 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm({ ...form, nome: e.target.value })}
                placeholder={nomeAluno || 'Nome do contato'}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Telefone</Label>
              <Input
                value={form.telefone}
                onChange={e => setForm({ ...form, telefone: e.target.value })}
                placeholder="(21) 99999-9999"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Parentesco</Label>
              <Select value={form.parentesco} onValueChange={v => setForm({ ...form, parentesco: v })}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARENTESCOS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer mb-1.5">
                <input
                  type="checkbox"
                  checked={form.principal}
                  onChange={e => setForm({ ...form, principal: e.target.checked })}
                  className="rounded border-slate-600"
                />
                Principal
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setShowForm(false); setEditandoId(null) }}
            >
              <X className="w-3.5 h-3.5 mr-1" />Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={salvar}
              disabled={salvando}
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              {editandoId ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
