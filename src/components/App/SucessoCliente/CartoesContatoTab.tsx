import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Plus, Trash2, Send, Loader2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { useVcardsUnidade, type VcardUnidade } from './hooks/useVcardsUnidade';
import { VcardPreview } from './VcardPreview';

interface Props {
  unidadeAtual: UnidadeId;
}

interface FormState {
  id: string | null;
  unidade_id: string;
  titulo: string;
  full_name: string;
  telefones: string[];
  organizacao: string;
  email: string;
  url: string;
}

const formVazio = (unidadeId: string): FormState => ({
  id: null, unidade_id: unidadeId, titulo: '', full_name: '',
  telefones: [''], organizacao: 'LA Music', email: '', url: '',
});

function paraForm(c: VcardUnidade): FormState {
  return {
    id: c.id, unidade_id: c.unidade_id, titulo: c.titulo, full_name: c.full_name,
    telefones: c.telefones.length ? c.telefones : [''],
    organizacao: c.organizacao || '', email: c.email || '', url: c.url || '',
  };
}

export function CartoesContatoTab({ unidadeAtual }: Props) {
  const { cartoes, loading, criar, atualizar, excluir } = useVcardsUnidade(unidadeAtual);
  const [form, setForm] = useState<FormState | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [numeroTeste, setNumeroTeste] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Unidade alvo para "novo cartão": a selecionada, ou a 1ª real se "todos".
  const unidadeParaNovo = unidadeAtual !== 'todos'
    ? unidadeAtual
    : (cartoes[0]?.unidade_id || '');

  useEffect(() => { setForm(null); }, [unidadeAtual]);

  const novoCartao = () => {
    if (!unidadeParaNovo) { toast.error('Selecione uma unidade específica para criar'); return; }
    setForm(formVazio(unidadeParaNovo));
  };

  const setCampo = (campo: keyof FormState, valor: string) =>
    setForm(f => f ? { ...f, [campo]: valor } : f);

  const setTelefone = (i: number, valor: string) =>
    setForm(f => f ? { ...f, telefones: f.telefones.map((t, idx) => idx === i ? valor : t) } : f);

  const addTelefone = () => setForm(f => f ? { ...f, telefones: [...f.telefones, ''] } : f);
  const rmTelefone = (i: number) =>
    setForm(f => f ? { ...f, telefones: f.telefones.filter((_, idx) => idx !== i) } : f);

  const salvar = async () => {
    if (!form) return;
    if (!form.titulo.trim() || !form.full_name.trim()) {
      toast.error('Preencha título e nome'); return;
    }
    setSalvando(true);
    const payload = {
      unidade_id: form.unidade_id,
      titulo: form.titulo.trim(),
      full_name: form.full_name.trim(),
      telefones: form.telefones.map(t => t.trim()).filter(Boolean),
      organizacao: form.organizacao.trim() || null,
      email: form.email.trim() || null,
      url: form.url.trim() || null,
    };
    const ok = form.id ? await atualizar(form.id, payload) : !!(await criar(payload));
    setSalvando(false);
    if (ok) setForm(null);
  };

  const enviarTeste = async () => {
    if (!form) return;
    const telefones = form.telefones.map(t => t.trim()).filter(Boolean);
    if (!form.full_name.trim()) { toast.error('Preencha o nome do contato'); return; }
    if (telefones.length === 0) { toast.error('Adicione ao menos um telefone'); return; }
    if (!numeroTeste.trim()) { toast.error('Informe o número de teste'); return; }
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-vcard', {
        body: {
          numeroDestino: numeroTeste.trim(),
          vcard: {
            fullName: form.full_name.trim(),
            telefones,
            organizacao: form.organizacao.trim() || undefined,
            email: form.email.trim() || undefined,
            url: form.url.trim() || undefined,
          },
        },
      });
      if (error || !data?.ok) {
        toast.error('Falha no envio: ' + (data?.erro || error?.message || 'erro desconhecido'));
      } else {
        toast.success('Cartão de teste enviado');
      }
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + (err?.message || 'desconhecido'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
      {/* Coluna esquerda: lista + form */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Cartões de Contato</h3>
          <Button size="sm" onClick={novoCartao} className="bg-violet-500 hover:bg-violet-600">
            <Plus className="w-4 h-4 mr-1" /> Novo cartão
          </Button>
        </div>

        {/* Lista de cartões */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 divide-y divide-slate-700/50">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
            </div>
          ) : cartoes.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">Nenhum cartão cadastrado</p>
          ) : (
            cartoes.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{c.titulo}</p>
                  <p className="text-slate-400 text-xs truncate">{c.full_name} · {c.telefones.length} tel.</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="text-blue-400" onClick={() => setForm(paraForm(c))}>Editar</Button>
                  <Button variant="ghost" size="sm" className="text-rose-400" onClick={() => excluir(c.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Form de edição/criação */}
        {form && (
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-white font-medium text-sm">{form.id ? 'Editar cartão' : 'Novo cartão'}</h4>
              <button onClick={() => setForm(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Título (interno)</label>
                <Input value={form.titulo} onChange={e => setCampo('titulo', e.target.value)} placeholder="Secretaria" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Organização</label>
                <Input value={form.organizacao} onChange={e => setCampo('organizacao', e.target.value)} placeholder="LA Music" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400">Nome exibido no contato</label>
              <Input value={form.full_name} onChange={e => setCampo('full_name', e.target.value)} placeholder="LA Music CG — Secretaria" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Telefones</label>
              <div className="space-y-2">
                {form.telefones.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={t} onChange={e => setTelefone(i, e.target.value)} placeholder="5521999999999" />
                    {form.telefones.length > 1 && (
                      <button onClick={() => rmTelefone(i)} className="text-rose-400"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTelefone} className="border-slate-700">
                  <Plus className="w-3 h-3 mr-1" /> Telefone
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Email (opcional)</label>
                <Input value={form.email} onChange={e => setCampo('email', e.target.value)} placeholder="contato@lamusic.com.br" />
              </div>
              <div>
                <label className="text-xs text-slate-400">URL (opcional)</label>
                <Input value={form.url} onChange={e => setCampo('url', e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <Button onClick={salvar} disabled={salvando} className="bg-emerald-500 hover:bg-emerald-600 w-full">
              {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Salvar cartão
            </Button>
          </div>
        )}
      </div>

      {/* Coluna direita: preview + teste */}
      <div className="space-y-4">
        <VcardPreview
          fullName={form?.full_name || ''}
          telefones={form?.telefones || []}
          organizacao={form?.organizacao}
        />
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4 space-y-2">
          <label className="text-xs text-slate-400">Enviar teste para (número WhatsApp)</label>
          <Input value={numeroTeste} onChange={e => setNumeroTeste(e.target.value)} placeholder="5521964171223" />
          <Button onClick={enviarTeste} disabled={enviando || !form} className="bg-violet-500 hover:bg-violet-600 w-full">
            {enviando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Enviar teste
          </Button>
          {!form && <p className="text-[11px] text-slate-500">Selecione ou crie um cartão para testar.</p>}
        </div>
      </div>
    </div>
  );
}
