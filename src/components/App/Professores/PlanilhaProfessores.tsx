import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, GraduationCap, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, parseBRL, formatBRLInput } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface Professor {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  unidade_id: string;
  status: string;
  data_admissao: string | null;
  especialidade: string | null;
  comissao_percentual: number | null;
  created_at?: string;
}

interface Unidade {
  id: string;
  nome: string;
}

export function PlanilhaProfessores() {
  const { isAdmin, usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [editedRows, setEditedRows] = useState<Set<number>>(new Set());
  const [newRows, setNewRows] = useState<Partial<Professor>[]>([]);
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('ativo');

  useEffect(() => {
    fetchDados();
  }, []);

  async function fetchDados() {
    setLoading(true);
    try {
      const [professoresRes, unidadesRes] = await Promise.all([
        supabase.from('professores').select('*').order('nome'),
        supabase.from('unidades').select('id, nome'),
      ]);

      if (professoresRes.data) setProfessores(professoresRes.data);
      if (unidadesRes.data) setUnidades(unidadesRes.data);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(id: number, field: keyof Professor, value: any) {
    setProfessores(prev => prev.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
    setEditedRows(prev => new Set(prev).add(id));
  }

  function handleNewRowChange(index: number, field: keyof Professor, value: any) {
    setNewRows(prev => prev.map((row, i) => 
      i === index ? { ...row, [field]: value } : row
    ));
  }

  function addNewRow() {
    const defaultUnidade = isAdmin ? (unidades[0]?.id || '') : (usuario?.unidade_id || '');
    setNewRows(prev => [...prev, {
      nome: '',
      email: '',
      telefone: '',
      unidade_id: defaultUnidade,
      status: 'ativo',
      data_admissao: new Date().toISOString().split('T')[0],
      especialidade: '',
      comissao_percentual: 0,
    }]);
  }

  function removeNewRow(index: number) {
    setNewRows(prev => prev.filter((_, i) => i !== index));
  }

  async function saveChanges() {
    setSaving(true);
    try {
      // Salvar linhas editadas
      for (const id of editedRows) {
        const professor = professores.find(p => p.id === id);
        if (professor) {
          const { error } = await supabase
            .from('professores')
            .update({
              nome: professor.nome,
              email: professor.email,
              telefone: professor.telefone,
              unidade_id: professor.unidade_id,
              status: professor.status,
              data_admissao: professor.data_admissao,
              especialidade: professor.especialidade,
              comissao_percentual: professor.comissao_percentual,
            })
            .eq('id', id);
          
          if (error) throw error;
        }
      }

      // Inserir novas linhas
      for (const row of newRows) {
        if (row.nome && row.unidade_id) {
          const { error } = await supabase
            .from('professores')
            .insert({
              nome: row.nome,
              email: row.email || null,
              telefone: row.telefone || null,
              unidade_id: row.unidade_id,
              status: row.status || 'ativo',
              data_admissao: row.data_admissao || null,
              especialidade: row.especialidade || null,
              comissao_percentual: row.comissao_percentual || 0,
            });
          
          if (error) throw error;
        }
      }

      // Limpar estados e recarregar
      setEditedRows(new Set());
      setNewRows([]);
      await fetchDados();
      alert('Dados salvos com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar dados. Verifique o console.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfessor(id: number) {
    if (!confirm('Tem certeza que deseja excluir este professor?')) return;
    
    try {
      const { error } = await supabase
        .from('professores')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setProfessores(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir professor. Pode haver dados vinculados.');
    }
  }

  // Filtrar professores
  const professoresFiltrados = professores.filter(p => {
    if (filtroUnidade !== 'todos' && p.unidade_id !== filtroUnidade) return false;
    if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;
    return true;
  });

  const hasChanges = editedRows.size > 0 || newRows.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GraduationCap className="text-violet-400" />
            Planilha de Professores
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Cadastro e gestão de professores
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDados}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Recarregar"
          >
            <RefreshCw size={20} />
          </button>
          <button
            onClick={addNewRow}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
          >
            <Plus size={18} />
            Novo Professor
          </button>
          {hasChanges && (
            <button
              onClick={saveChanges}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Unidade</label>
          <select
            value={filtroUnidade}
            onChange={(e) => setFiltroUnidade(e.target.value)}
            className="mt-1 block w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="todos">Todas</option>
            {unidades.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Status</label>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="mt-1 block w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>
        <div className="ml-auto text-sm text-slate-400">
          {professoresFiltrados.length} professores
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 text-left">Nome</th>
                <th className="py-3 px-4 text-left">Email</th>
                <th className="py-3 px-4 text-left">Telefone</th>
                <th className="py-3 px-4 text-left">Unidade</th>
                <th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4 text-left">Especialidade</th>
                <th className="py-3 px-4 text-right">Comissão %</th>
                <th className="py-3 px-4 text-center w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {/* Novas linhas */}
              {newRows.map((row, index) => (
                <tr key={`new-${index}`} className="border-b border-slate-700/30 bg-emerald-500/5">
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={row.nome || ''}
                      onChange={(e) => handleNewRowChange(index, 'nome', e.target.value)}
                      placeholder="Nome do professor"
                      className="w-full bg-slate-900 border border-emerald-500/30 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="email"
                      value={row.email || ''}
                      onChange={(e) => handleNewRowChange(index, 'email', e.target.value)}
                      placeholder="email@exemplo.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={row.telefone || ''}
                      onChange={(e) => handleNewRowChange(index, 'telefone', e.target.value)}
                      placeholder="(21) 99999-9999"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <select
                      value={row.unidade_id || ''}
                      onChange={(e) => handleNewRowChange(index, 'unidade_id', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                    >
                      <option value="">Selecione</option>
                      {unidades.map(u => (
                        <option key={u.id} value={u.id}>{u.nome}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-4">
                    <select
                      value={row.status || 'ativo'}
                      onChange={(e) => handleNewRowChange(index, 'status', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={row.especialidade || ''}
                      onChange={(e) => handleNewRowChange(index, 'especialidade', e.target.value)}
                      placeholder="Piano, Violão..."
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="number"
                      value={row.comissao_percentual || 0}
                      onChange={(e) => handleNewRowChange(index, 'comissao_percentual', Number(e.target.value))}
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm text-right"
                    />
                  </td>
                  <td className="py-2 px-4 text-center">
                    <button
                      onClick={() => removeNewRow(index)}
                      className="p-1 text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Linhas existentes */}
              {professoresFiltrados.map((p) => (
                <tr 
                  key={p.id} 
                  className={`border-b border-slate-700/30 hover:bg-slate-800/30 ${
                    editedRows.has(p.id) ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={p.nome}
                      onChange={(e) => handleChange(p.id, 'nome', e.target.value)}
                      className="w-full bg-transparent border-0 text-white text-sm focus:bg-slate-900 focus:border focus:border-slate-700 rounded px-2 py-1"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="email"
                      value={p.email || ''}
                      onChange={(e) => handleChange(p.id, 'email', e.target.value)}
                      className="w-full bg-transparent border-0 text-slate-300 text-sm focus:bg-slate-900 focus:border focus:border-slate-700 rounded px-2 py-1"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={p.telefone || ''}
                      onChange={(e) => handleChange(p.id, 'telefone', e.target.value)}
                      className="w-full bg-transparent border-0 text-slate-300 text-sm focus:bg-slate-900 focus:border focus:border-slate-700 rounded px-2 py-1"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <select
                      value={p.unidade_id}
                      onChange={(e) => handleChange(p.id, 'unidade_id', e.target.value)}
                      className="w-full bg-transparent border-0 text-slate-300 text-sm focus:bg-slate-900 focus:border focus:border-slate-700 rounded px-2 py-1"
                    >
                      {unidades.map(u => (
                        <option key={u.id} value={u.id}>{u.nome}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-4">
                    <select
                      value={p.status}
                      onChange={(e) => handleChange(p.id, 'status', e.target.value)}
                      className={`w-full bg-transparent border-0 text-sm rounded px-2 py-1 ${
                        p.status === 'ativo' ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="text"
                      value={p.especialidade || ''}
                      onChange={(e) => handleChange(p.id, 'especialidade', e.target.value)}
                      className="w-full bg-transparent border-0 text-slate-300 text-sm focus:bg-slate-900 focus:border focus:border-slate-700 rounded px-2 py-1"
                    />
                  </td>
                  <td className="py-2 px-4">
                    <input
                      type="number"
                      value={p.comissao_percentual || 0}
                      onChange={(e) => handleChange(p.id, 'comissao_percentual', Number(e.target.value))}
                      className="w-20 bg-transparent border-0 text-slate-300 text-sm text-right focus:bg-slate-900 focus:border focus:border-slate-700 rounded px-2 py-1"
                    />
                  </td>
                  <td className="py-2 px-4 text-center">
                    {isAdmin && (
                      <button
                        onClick={() => deleteProfessor(p.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {professoresFiltrados.length === 0 && newRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Nenhum professor encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-emerald-500/20 rounded" />
          <span>Nova linha</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-500/20 rounded" />
          <span>Linha editada</span>
        </div>
      </div>
    </div>
  );
}

export default PlanilhaProfessores;
