import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Loader2, Send, Users, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Unidade {
  id: string;
  nome: string;
}

interface Destinatario {
  id: number;
  tipo: string;
  nome: string;
  jid: string;
  unidade_id: string | null;
  ativo: boolean;
  created_at: string;
}

interface DestinatarioForm {
  id?: number;
  tipo: string;
  nome: string;
  jid: string;
  unidade_id: string;
  ativo: boolean;
}

const emptyForm: DestinatarioForm = {
  tipo: 'relatorio_admin',
  nome: '',
  jid: '',
  unidade_id: '',
  ativo: true,
};

const TIPOS_RELATORIO: Record<string, { label: string; cor: string }> = {
  relatorio_admin: { label: 'Relatório Admin', cor: 'bg-violet-500/20 text-violet-400' },
  relatorio_coordenacao: { label: 'Relatório Coordenação', cor: 'bg-sky-500/20 text-sky-400' },
};

export function DestinatariosRelatorioManager() {
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<DestinatarioForm | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetchDestinatarios = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_destinatarios_relatorio')
      .select('*')
      .order('tipo, nome');
    if (!error && data) setDestinatarios(data);
    setLoading(false);
  }, []);

  const fetchUnidades = useCallback(async () => {
    const { data } = await supabase
      .from('unidades')
      .select('id, nome')
      .order('nome');
    if (data) setUnidades(data);
  }, []);

  useEffect(() => {
    fetchDestinatarios();
    fetchUnidades();
  }, [fetchDestinatarios, fetchUnidades]);

  // Limpar mensagens após 3s
  useEffect(() => {
    if (erro || sucesso) {
      const t = setTimeout(() => { setErro(null); setSucesso(null); }, 3000);
      return () => clearTimeout(t);
    }
  }, [erro, sucesso]);

  async function salvar() {
    if (!editando) return;
    if (!editando.nome.trim() || !editando.jid.trim()) {
      setErro('Nome e JID são obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tipo: editando.tipo,
        nome: editando.nome.trim(),
        jid: editando.jid.trim(),
        unidade_id: editando.unidade_id || null,
        ativo: editando.ativo,
      };

      if (editando.id) {
        const { error } = await supabase
          .from('whatsapp_destinatarios_relatorio')
          .update(payload)
          .eq('id', editando.id);
        if (error) throw error;
        setSucesso('Destinatário atualizado!');
      } else {
        const { error } = await supabase
          .from('whatsapp_destinatarios_relatorio')
          .insert(payload);
        if (error) throw error;
        setSucesso('Destinatário criado!');
      }

      setEditando(null);
      await fetchDestinatarios();
    } catch (err: any) {
      setErro(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id: number) {
    try {
      const { error } = await supabase
        .from('whatsapp_destinatarios_relatorio')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setSucesso('Destinatário removido!');
      setConfirmDelete(null);
      await fetchDestinatarios();
    } catch (err: any) {
      setErro(err.message || 'Erro ao excluir');
      setConfirmDelete(null);
    }
  }

  async function toggleAtivo(dest: Destinatario) {
    const { error } = await supabase
      .from('whatsapp_destinatarios_relatorio')
      .update({ ativo: !dest.ativo })
      .eq('id', dest.id);
    if (!error) {
      setDestinatarios(prev =>
        prev.map(d => d.id === dest.id ? { ...d, ativo: !d.ativo } : d)
      );
    }
  }

  function getNomeUnidade(unidadeId: string | null) {
    if (!unidadeId) return 'Todas';
    return unidades.find(u => u.id === unidadeId)?.nome || 'Desconhecida';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="animate-spin text-violet-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send size={18} className="text-violet-400" />
          <h3 className="text-lg font-bold text-white">Destinatários de Relatórios</h3>
          <span className="text-xs text-slate-500">({destinatarios.length})</span>
        </div>
        <button
          onClick={() => setEditando({ ...emptyForm })}
          className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm transition-colors"
        >
          <Plus size={16} />
          Novo Destinatário
        </button>
      </div>

      {/* Mensagens */}
      {erro && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm">
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
          {sucesso}
        </div>
      )}

      {/* Formulário de edição */}
      {editando && (
        <div className="bg-slate-800/80 border border-violet-500/30 rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-white">
            {editando.id ? 'Editar Destinatário' : 'Novo Destinatário'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tipo */}
            <div>
              <label className="text-xs text-slate-400 uppercase mb-1 block">Tipo de Relatório</label>
              <select
                value={editando.tipo}
                onChange={(e) => setEditando({ ...editando, tipo: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              >
                {Object.entries(TIPOS_RELATORIO).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Nome */}
            <div>
              <label className="text-xs text-slate-400 uppercase mb-1 block">Nome do Grupo/Contato</label>
              <input
                type="text"
                value={editando.nome}
                onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                placeholder="Ex: RELATÓRIOS DIÁRIOS CG"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>

            {/* JID */}
            <div>
              <label className="text-xs text-slate-400 uppercase mb-1 block">JID WhatsApp</label>
              <input
                type="text"
                value={editando.jid}
                onChange={(e) => setEditando({ ...editando, jid: e.target.value })}
                placeholder="Ex: 5521999999999@g.us"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Grupos terminam com @g.us, contatos com @s.whatsapp.net
              </p>
            </div>

            {/* Unidade */}
            <div>
              <label className="text-xs text-slate-400 uppercase mb-1 block">
                <Building2 size={12} className="inline mr-1" />
                Unidade (opcional)
              </label>
              <select
                value={editando.unidade_id}
                onChange={(e) => setEditando({ ...editando, unidade_id: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="">Todas as unidades</option>
                {unidades.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ativo toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editando.ativo}
              onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-violet-500"
            />
            <span className="text-sm text-slate-300">Ativo</span>
          </label>

          {/* Ações */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={salvar}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar
            </button>
            <button
              onClick={() => setEditando(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de destinatários */}
      {destinatarios.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          Nenhum destinatário configurado
        </div>
      ) : (
        <div className="space-y-2">
          {destinatarios.map(dest => {
            const tipoInfo = TIPOS_RELATORIO[dest.tipo] || { label: dest.tipo, cor: 'bg-slate-500/20 text-slate-400' };

            return (
              <div
                key={dest.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  dest.ativo
                    ? 'bg-slate-800/50 border-slate-700/50'
                    : 'bg-slate-900/50 border-slate-800/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Users size={16} className={dest.ativo ? 'text-violet-400' : 'text-slate-600'} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${dest.ativo ? 'text-white' : 'text-slate-500'}`}>
                        {dest.nome}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tipoInfo.cor}`}>
                        {tipoInfo.label}
                      </span>
                      {dest.unidade_id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-400">
                          {getNomeUnidade(dest.unidade_id)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono truncate">{dest.jid}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={() => toggleAtivo(dest)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      dest.ativo
                        ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {dest.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button
                    onClick={() => setEditando({
                      id: dest.id,
                      tipo: dest.tipo,
                      nome: dest.nome,
                      jid: dest.jid,
                      unidade_id: dest.unidade_id || '',
                      ativo: dest.ativo,
                    })}
                    className="px-2.5 py-1 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                  >
                    Editar
                  </button>
                  {confirmDelete === dest.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => excluir(dest.id)}
                        className="px-2 py-1 rounded text-xs bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(dest.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
