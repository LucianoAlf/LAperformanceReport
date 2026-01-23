import { useState, useEffect } from 'react';
import { Settings, Save, Plus, Trash2, RefreshCw, Building2, Users, Tag, Megaphone, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface HorarioFuncionamento {
  segunda_sexta: { inicio: string; fim: string };
  sabado: { inicio: string; fim: string };
  domingo: { fechado: boolean; inicio?: string; fim?: string };
}

interface Unidade {
  id: string;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  horario_funcionamento: HorarioFuncionamento | null;
}

interface CanalOrigem {
  id: number;
  nome: string;
  ativo: boolean;
}

interface MotivoSaida {
  id: number;
  nome: string;
  categoria: string | null;
}

interface TipoSaida {
  id: number;
  nome: string;
}

type TabId = 'unidades' | 'canais' | 'motivos' | 'tipos';

export function ConfigPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('unidades');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados para cada entidade
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [canais, setCanais] = useState<CanalOrigem[]>([]);
  const [motivosSaida, setMotivosSaida] = useState<MotivoSaida[]>([]);
  const [tiposSaida, setTiposSaida] = useState<TipoSaida[]>([]);

  // Estados de edição
  const [editedUnidades, setEditedUnidades] = useState<Set<string>>(new Set());
  const [editedCanais, setEditedCanais] = useState<Set<number>>(new Set());
  const [newCanal, setNewCanal] = useState('');
  const [newMotivo, setNewMotivo] = useState('');
  const [newTipo, setNewTipo] = useState('');

  useEffect(() => {
    fetchDados();
  }, []);

  async function fetchDados() {
    setLoading(true);
    try {
      const [unidadesRes, canaisRes, motivosRes, tiposRes] = await Promise.all([
        supabase.from('unidades').select('*').order('nome'),
        supabase.from('canais_origem').select('*').order('nome'),
        supabase.from('motivos_saida').select('*').order('nome'),
        supabase.from('tipos_saida').select('*').order('nome'),
      ]);

      if (unidadesRes.data) setUnidades(unidadesRes.data);
      if (canaisRes.data) setCanais(canaisRes.data);
      if (motivosRes.data) setMotivosSaida(motivosRes.data);
      if (tiposRes.data) setTiposSaida(tiposRes.data);
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
    } finally {
      setLoading(false);
    }
  }

  // Handlers para Unidades
  function handleUnidadeChange(id: string, field: keyof Unidade, value: string) {
    setUnidades(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
    setEditedUnidades(prev => new Set(prev).add(id));
  }

  async function saveUnidades() {
    setSaving(true);
    try {
      for (const id of editedUnidades) {
        const unidade = unidades.find(u => u.id === id);
        if (unidade) {
          await supabase.from('unidades').update({
            nome: unidade.nome,
            endereco: unidade.endereco,
            telefone: unidade.telefone,
            horario_funcionamento: unidade.horario_funcionamento,
          }).eq('id', id);
        }
      }
      setEditedUnidades(new Set());
      alert('Unidades salvas!');
    } catch (err) {
      console.error('Erro ao salvar unidades:', err);
      alert('Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  // Handler para horário de funcionamento
  function handleHorarioChange(
    unidadeId: string, 
    periodo: 'segunda_sexta' | 'sabado' | 'domingo', 
    campo: 'inicio' | 'fim' | 'fechado', 
    valor: string | boolean
  ) {
    setUnidades(prev => prev.map(u => {
      if (u.id !== unidadeId) return u;
      
      const horarioAtual = u.horario_funcionamento || {
        segunda_sexta: { inicio: '08:00', fim: '21:00' },
        sabado: { inicio: '08:00', fim: '16:00' },
        domingo: { fechado: true }
      };

      return {
        ...u,
        horario_funcionamento: {
          ...horarioAtual,
          [periodo]: {
            ...horarioAtual[periodo],
            [campo]: valor
          }
        }
      };
    }));
    setEditedUnidades(prev => new Set(prev).add(unidadeId));
  }

  // Handlers para Canais
  async function addCanal() {
    if (!newCanal.trim()) return;
    try {
      const { error } = await supabase.from('canais_origem').insert({ nome: newCanal, ativo: true });
      if (error) throw error;
      setNewCanal('');
      await fetchDados();
    } catch (err) {
      console.error('Erro ao adicionar canal:', err);
      alert('Erro ao adicionar canal.');
    }
  }

  async function toggleCanal(id: number, ativo: boolean) {
    try {
      await supabase.from('canais_origem').update({ ativo: !ativo }).eq('id', id);
      setCanais(prev => prev.map(c => c.id === id ? { ...c, ativo: !ativo } : c));
    } catch (err) {
      console.error('Erro ao atualizar canal:', err);
    }
  }

  async function deleteCanal(id: number) {
    if (!confirm('Excluir este canal?')) return;
    try {
      await supabase.from('canais_origem').delete().eq('id', id);
      setCanais(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Erro ao excluir canal:', err);
      alert('Erro ao excluir. Pode haver dados vinculados.');
    }
  }

  // Handlers para Motivos de Saída
  async function addMotivo() {
    if (!newMotivo.trim()) return;
    try {
      const { error } = await supabase.from('motivos_saida').insert({ nome: newMotivo });
      if (error) throw error;
      setNewMotivo('');
      await fetchDados();
    } catch (err) {
      console.error('Erro ao adicionar motivo:', err);
      alert('Erro ao adicionar motivo.');
    }
  }

  async function deleteMotivo(id: number) {
    if (!confirm('Excluir este motivo?')) return;
    try {
      await supabase.from('motivos_saida').delete().eq('id', id);
      setMotivosSaida(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Erro ao excluir motivo:', err);
      alert('Erro ao excluir. Pode haver dados vinculados.');
    }
  }

  // Handlers para Tipos de Saída
  async function addTipo() {
    if (!newTipo.trim()) return;
    try {
      const { error } = await supabase.from('tipos_saida').insert({ nome: newTipo });
      if (error) throw error;
      setNewTipo('');
      await fetchDados();
    } catch (err) {
      console.error('Erro ao adicionar tipo:', err);
      alert('Erro ao adicionar tipo.');
    }
  }

  async function deleteTipo(id: number) {
    if (!confirm('Excluir este tipo?')) return;
    try {
      await supabase.from('tipos_saida').delete().eq('id', id);
      setTiposSaida(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Erro ao excluir tipo:', err);
      alert('Erro ao excluir. Pode haver dados vinculados.');
    }
  }

  const tabs = [
    { id: 'unidades' as const, label: 'Unidades', icon: Building2 },
    { id: 'canais' as const, label: 'Canais de Origem', icon: Megaphone },
    { id: 'motivos' as const, label: 'Motivos de Saída', icon: Tag },
    { id: 'tipos' as const, label: 'Tipos de Saída', icon: Tag },
  ];

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
            <Settings className="text-slate-400" />
            Configurações
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Gerencie unidades, canais e categorias do sistema
          </p>
        </div>
        <button
          onClick={fetchDados}
          className="p-2 text-slate-400 hover:text-white transition-colors"
          title="Recarregar"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-violet-400 border-violet-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo das Tabs */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        {/* Tab Unidades */}
        {activeTab === 'unidades' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Unidades</h3>
              {editedUnidades.size > 0 && (
                <button
                  onClick={saveUnidades}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm"
                >
                  <Save size={16} />
                  Salvar Alterações
                </button>
              )}
            </div>
            <div className="space-y-6">
              {unidades.map(u => {
                const horario = u.horario_funcionamento || {
                  segunda_sexta: { inicio: '08:00', fim: '21:00' },
                  sabado: { inicio: '08:00', fim: '16:00' },
                  domingo: { fechado: true }
                };
                
                return (
                  <div key={u.id} className={`p-4 rounded-xl ${
                    editedUnidades.has(u.id) ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-900/50 border border-slate-700/50'
                  }`}>
                    {/* Dados básicos da unidade */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="text-xs text-slate-400 uppercase mb-1 block">Nome</label>
                        <input
                          type="text"
                          value={u.nome}
                          onChange={(e) => handleUnidadeChange(u.id, 'nome', e.target.value)}
                          placeholder="Nome"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 uppercase mb-1 block">Endereço</label>
                        <input
                          type="text"
                          value={u.endereco || ''}
                          onChange={(e) => handleUnidadeChange(u.id, 'endereco', e.target.value)}
                          placeholder="Endereço"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 uppercase mb-1 block">Telefone</label>
                        <input
                          type="text"
                          value={u.telefone || ''}
                          onChange={(e) => handleUnidadeChange(u.id, 'telefone', e.target.value)}
                          placeholder="Telefone"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm"
                        />
                      </div>
                    </div>

                    {/* Horário de Funcionamento */}
                    <div className="border-t border-slate-700/50 pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock size={16} className="text-violet-400" />
                        <span className="text-sm font-medium text-white">Horário de Funcionamento</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Segunda a Sexta */}
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <span className="text-xs text-slate-400 uppercase block mb-2">Segunda a Sexta</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={horario.segunda_sexta?.inicio || '08:00'}
                              onChange={(e) => handleHorarioChange(u.id, 'segunda_sexta', 'inicio', e.target.value)}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm"
                            />
                            <span className="text-slate-500">às</span>
                            <input
                              type="time"
                              value={horario.segunda_sexta?.fim || '21:00'}
                              onChange={(e) => handleHorarioChange(u.id, 'segunda_sexta', 'fim', e.target.value)}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm"
                            />
                          </div>
                        </div>

                        {/* Sábado */}
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <span className="text-xs text-slate-400 uppercase block mb-2">Sábado</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={horario.sabado?.inicio || '08:00'}
                              onChange={(e) => handleHorarioChange(u.id, 'sabado', 'inicio', e.target.value)}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm"
                            />
                            <span className="text-slate-500">às</span>
                            <input
                              type="time"
                              value={horario.sabado?.fim || '16:00'}
                              onChange={(e) => handleHorarioChange(u.id, 'sabado', 'fim', e.target.value)}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm"
                            />
                          </div>
                        </div>

                        {/* Domingo */}
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <span className="text-xs text-slate-400 uppercase block mb-2">Domingo</span>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={horario.domingo?.fechado !== false}
                                onChange={(e) => handleHorarioChange(u.id, 'domingo', 'fechado', e.target.checked)}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500"
                              />
                              <span className="text-sm text-slate-300">Fechado</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab Canais */}
        {activeTab === 'canais' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Canais de Origem</h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newCanal}
                onChange={(e) => setNewCanal(e.target.value)}
                placeholder="Novo canal de origem..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addCanal()}
              />
              <button
                onClick={addCanal}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm"
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {canais.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className={`text-sm ${c.ativo ? 'text-white' : 'text-slate-500 line-through'}`}>
                    {c.nome}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCanal(c.id, c.ativo)}
                      className={`px-3 py-1 rounded text-xs ${
                        c.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => deleteCanal(c.id)}
                        className="p-1 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Motivos de Saída */}
        {activeTab === 'motivos' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Motivos de Saída</h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newMotivo}
                onChange={(e) => setNewMotivo(e.target.value)}
                placeholder="Novo motivo de saída..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addMotivo()}
              />
              <button
                onClick={addMotivo}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm"
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {motivosSaida.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-white text-sm">{m.nome}</span>
                  {isAdmin && (
                    <button
                      onClick={() => deleteMotivo(m.id)}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Tipos de Saída */}
        {activeTab === 'tipos' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Tipos de Saída</h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newTipo}
                onChange={(e) => setNewTipo(e.target.value)}
                placeholder="Novo tipo de saída..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addTipo()}
              />
              <button
                onClick={addTipo}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm"
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tiposSaida.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-white text-sm">{t.nome}</span>
                  {isAdmin && (
                    <button
                      onClick={() => deleteTipo(t.id)}
                      className="p-1 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfigPage;
