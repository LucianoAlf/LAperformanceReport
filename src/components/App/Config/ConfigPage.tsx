import { useState, useEffect } from 'react';
import { Settings, Save, Plus, Trash2, RefreshCw, Building2, Users, Tag, Megaphone, Clock, Music, Edit2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimePicker24h } from '@/components/ui/time-picker-24h';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';

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

interface Curso {
  id: number;
  nome: string;
  ativo: boolean;
  capacidade_maxima: number | null;
}

type TabId = 'unidades' | 'canais' | 'motivos' | 'tipos' | 'cursos';

export function ConfigPage() {
  const { isAdmin, unidadeId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('unidades');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados para cada entidade
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadesFiltradas, setUnidadesFiltradas] = useState<Unidade[]>([]);
  const [canais, setCanais] = useState<CanalOrigem[]>([]);
  const [motivosSaida, setMotivosSaida] = useState<MotivoSaida[]>([]);
  const [tiposSaida, setTiposSaida] = useState<TipoSaida[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);

  // Estados de edição
  const [editedUnidades, setEditedUnidades] = useState<Set<string>>(new Set());
  const [editedCanais, setEditedCanais] = useState<Set<number>>(new Set());
  const [newCanal, setNewCanal] = useState('');
  const [newMotivo, setNewMotivo] = useState('');
  const [newTipo, setNewTipo] = useState('');
  const [newCurso, setNewCurso] = useState('');
  
  // Estados para controle dos AlertDialogs de exclusão
  const [canalParaExcluir, setCanalParaExcluir] = useState<number | null>(null);
  const [motivoParaExcluir, setMotivoParaExcluir] = useState<number | null>(null);
  const [tipoParaExcluir, setTipoParaExcluir] = useState<number | null>(null);
  const [cursoParaExcluir, setCursoParaExcluir] = useState<number | null>(null);
  
  // Estado para modal de edição de curso
  const [cursoParaEditar, setCursoParaEditar] = useState<Curso | null>(null);
  const [capacidadeEditando, setCapacidadeEditando] = useState<number | null>(null);
  const [semLimite, setSemLimite] = useState(false);

  useEffect(() => {
    fetchDados();
  }, []);

  async function fetchDados() {
    setLoading(true);
    try {
      const [unidadesRes, canaisRes, motivosRes, tiposRes, cursosRes] = await Promise.all([
        supabase.from('unidades').select('*').order('nome'),
        supabase.from('canais_origem').select('*').order('nome'),
        supabase.from('motivos_saida').select('*').order('nome'),
        supabase.from('tipos_saida').select('*').order('nome'),
        supabase.from('cursos').select('*').order('nome'),
      ]);

      if (unidadesRes.data) {
        setUnidades(unidadesRes.data);
        // Filtrar unidades baseado no perfil do usuário
        if (isAdmin) {
          // Admin vê todas as unidades
          setUnidadesFiltradas(unidadesRes.data);
        } else if (unidadeId) {
          // Usuário comum vê apenas sua unidade
          setUnidadesFiltradas(unidadesRes.data.filter(u => u.id === unidadeId));
        } else {
          setUnidadesFiltradas([]);
        }
      }
      if (canaisRes.data) setCanais(canaisRes.data);
      if (motivosRes.data) setMotivosSaida(motivosRes.data);
      if (tiposRes.data) setTiposSaida(tiposRes.data);
      if (cursosRes.data) setCursos(cursosRes.data);
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

  async function confirmarExclusaoCanal() {
    if (!canalParaExcluir) return;
    
    try {
      const { error } = await supabase
        .from('canais_origem')
        .delete()
        .eq('id', canalParaExcluir);
      
      if (error) {
        console.error('Erro ao excluir canal:', error);
        alert(`Erro ao excluir canal: ${error.message}\n\nPode haver dados vinculados a este canal.`);
        setCanalParaExcluir(null);
        return;
      }
      
      // Sucesso: atualizar lista local
      setCanais(prev => prev.filter(c => c.id !== canalParaExcluir));
      setCanalParaExcluir(null);
    } catch (err) {
      console.error('Erro inesperado ao excluir canal:', err);
      alert('Erro inesperado ao excluir. Tente novamente.');
      setCanalParaExcluir(null);
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

  async function confirmarExclusaoMotivo() {
    if (!motivoParaExcluir) return;
    
    try {
      const { error } = await supabase
        .from('motivos_saida')
        .delete()
        .eq('id', motivoParaExcluir);
      
      if (error) {
        console.error('Erro ao excluir motivo:', error);
        alert(`Erro ao excluir motivo: ${error.message}\n\nPode haver dados vinculados a este motivo.`);
        setMotivoParaExcluir(null);
        return;
      }
      
      // Sucesso: atualizar lista local
      setMotivosSaida(prev => prev.filter(m => m.id !== motivoParaExcluir));
      setMotivoParaExcluir(null);
    } catch (err) {
      console.error('Erro inesperado ao excluir motivo:', err);
      alert('Erro inesperado ao excluir. Tente novamente.');
      setMotivoParaExcluir(null);
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

  async function confirmarExclusaoTipo() {
    if (!tipoParaExcluir) return;
    
    try {
      const { error } = await supabase
        .from('tipos_saida')
        .delete()
        .eq('id', tipoParaExcluir);
      
      if (error) {
        console.error('Erro ao excluir tipo:', error);
        alert(`Erro ao excluir tipo: ${error.message}\n\nPode haver dados vinculados a este tipo.`);
        setTipoParaExcluir(null);
        return;
      }
      
      // Sucesso: atualizar lista local
      setTiposSaida(prev => prev.filter(t => t.id !== tipoParaExcluir));
      setTipoParaExcluir(null);
    } catch (err) {
      console.error('Erro inesperado ao excluir tipo:', err);
      alert('Erro inesperado ao excluir. Tente novamente.');
      setTipoParaExcluir(null);
    }
  }

  // Handlers para Cursos
  async function addCurso() {
    if (!newCurso.trim()) return;
    try {
      const { error } = await supabase.from('cursos').insert({ nome: newCurso, ativo: true });
      if (error) throw error;
      setNewCurso('');
      await fetchDados();
    } catch (err) {
      console.error('Erro ao adicionar curso:', err);
      alert('Erro ao adicionar curso.');
    }
  }

  async function toggleCurso(id: number, ativo: boolean) {
    try {
      await supabase.from('cursos').update({ ativo: !ativo }).eq('id', id);
      setCursos(prev => prev.map(c => c.id === id ? { ...c, ativo: !ativo } : c));
    } catch (err) {
      console.error('Erro ao atualizar curso:', err);
    }
  }

  function abrirModalEditarCurso(curso: Curso) {
    setCursoParaEditar(curso);
    setCapacidadeEditando(curso.capacidade_maxima);
    setSemLimite(curso.capacidade_maxima === null);
  }

  async function salvarEdicaoCurso() {
    if (!cursoParaEditar) return;
    
    try {
      const { error } = await supabase
        .from('cursos')
        .update({ 
          capacidade_maxima: semLimite ? null : capacidadeEditando 
        })
        .eq('id', cursoParaEditar.id);
      
      if (error) throw error;
      
      // Atualizar lista local
      setCursos(prev => prev.map(c => 
        c.id === cursoParaEditar.id 
          ? { ...c, capacidade_maxima: semLimite ? null : capacidadeEditando }
          : c
      ));
      
      setCursoParaEditar(null);
      setCapacidadeEditando(null);
      setSemLimite(false);
    } catch (err) {
      console.error('Erro ao atualizar curso:', err);
      alert('Erro ao atualizar curso.');
    }
  }

  async function confirmarExclusaoCurso() {
    if (!cursoParaExcluir) return;
    
    try {
      const { error } = await supabase
        .from('cursos')
        .delete()
        .eq('id', cursoParaExcluir);
      
      if (error) {
        console.error('Erro ao excluir curso:', error);
        alert(`Erro ao excluir curso: ${error.message}\n\nPode haver dados vinculados a este curso.`);
        setCursoParaExcluir(null);
        return;
      }
      
      // Sucesso: atualizar lista local
      setCursos(prev => prev.filter(c => c.id !== cursoParaExcluir));
      setCursoParaExcluir(null);
    } catch (err) {
      console.error('Erro inesperado ao excluir curso:', err);
      alert('Erro inesperado ao excluir. Tente novamente.');
      setCursoParaExcluir(null);
    }
  }

  const tabs = [
    { id: 'unidades' as const, label: 'Unidades', icon: Building2 },
    { id: 'canais' as const, label: 'Canais de Origem', icon: Megaphone },
    { id: 'motivos' as const, label: 'Motivos de Saída', icon: Tag },
    { id: 'tipos' as const, label: 'Tipos de Saída', icon: Tag },
    { id: 'cursos' as const, label: 'Cursos', icon: Music },
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
      <div className="flex items-center gap-2 border-b border-slate-700 pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-slate-800 text-white border-b-2 border-purple-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
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
              {unidadesFiltradas.length === 0 ? (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
                  <p className="text-slate-400">Nenhuma unidade disponível para configuração</p>
                </div>
              ) : (
                unidadesFiltradas.map(u => {
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
                            <TimePicker24h
                              value={horario.segunda_sexta?.inicio || '08:00'}
                              onChange={(value) => handleHorarioChange(u.id, 'segunda_sexta', 'inicio', value)}
                              placeholder="Início"
                              className="flex-1"
                            />
                            <span className="text-slate-500">às</span>
                            <TimePicker24h
                              value={horario.segunda_sexta?.fim || '21:00'}
                              onChange={(value) => handleHorarioChange(u.id, 'segunda_sexta', 'fim', value)}
                              placeholder="Fim"
                              className="flex-1"
                            />
                          </div>
                        </div>

                        {/* Sábado */}
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <span className="text-xs text-slate-400 uppercase block mb-2">Sábado</span>
                          <div className="flex items-center gap-2">
                            <TimePicker24h
                              value={horario.sabado?.inicio || '08:00'}
                              onChange={(value) => handleHorarioChange(u.id, 'sabado', 'inicio', value)}
                              placeholder="Início"
                              className="flex-1"
                            />
                            <span className="text-slate-500">às</span>
                            <TimePicker24h
                              value={horario.sabado?.fim || '16:00'}
                              onChange={(value) => handleHorarioChange(u.id, 'sabado', 'fim', value)}
                              placeholder="Fim"
                              className="flex-1"
                            />
                          </div>
                        </div>

                        {/* Domingo */}
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <span className="text-xs text-slate-400 uppercase block mb-2">Domingo</span>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={horario.domingo?.fechado !== false}
                                onCheckedChange={(checked) => handleHorarioChange(u.id, 'domingo', 'fechado', checked as boolean)}
                              />
                              <span className="text-sm text-slate-300">Fechado</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
              )}
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
                <div key={c.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border-b border-slate-700/30">
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
                        onClick={() => setCanalParaExcluir(c.id)}
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
                <div key={m.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border-b border-slate-700/30">
                  <span className="text-white text-sm">{m.nome}</span>
                  {isAdmin && (
                    <button
                      onClick={() => setMotivoParaExcluir(m.id)}
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
                <div key={t.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border-b border-slate-700/30">
                  <span className="text-white text-sm">{t.nome}</span>
                  {isAdmin && (
                    <button
                      onClick={() => setTipoParaExcluir(t.id)}
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

        {/* Tab Cursos */}
        {activeTab === 'cursos' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Cursos</h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newCurso}
                onChange={(e) => setNewCurso(e.target.value)}
                placeholder="Novo curso..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addCurso()}
              />
              <button
                onClick={addCurso}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm"
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {cursos.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border-b border-slate-700/30">
                  <div className="flex-1">
                    <span className={`text-sm ${c.ativo ? 'text-white' : 'text-slate-500 line-through'}`}>
                      {c.nome}
                    </span>
                    {c.capacidade_maxima && (
                      <span className="ml-2 text-xs text-slate-400">
                        (máx. {c.capacidade_maxima} alunos)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCurso(c.id, c.ativo)}
                      className={`px-3 py-1 rounded text-xs ${
                        c.ativo ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => abrirModalEditarCurso(c)}
                          className="p-1 text-slate-500 hover:text-violet-400"
                          title="Editar capacidade"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setCursoParaExcluir(c.id)}
                          className="p-1 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AlertDialog de Confirmação de Exclusão de Canal */}
      <AlertDialog open={canalParaExcluir !== null} onOpenChange={(open) => !open && setCanalParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este canal de origem? Esta ação não pode ser desfeita.
              {canais.find(c => c.id === canalParaExcluir) && (
                <span className="block mt-2 font-medium text-white">
                  Canal: {canais.find(c => c.id === canalParaExcluir)?.nome}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCanalParaExcluir(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarExclusaoCanal}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação de Exclusão de Motivo de Saída */}
      <AlertDialog open={motivoParaExcluir !== null} onOpenChange={(open) => !open && setMotivoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este motivo de saída? Esta ação não pode ser desfeita.
              {motivosSaida.find(m => m.id === motivoParaExcluir) && (
                <span className="block mt-2 font-medium text-white">
                  Motivo: {motivosSaida.find(m => m.id === motivoParaExcluir)?.nome}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMotivoParaExcluir(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarExclusaoMotivo}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação de Exclusão de Tipo de Saída */}
      <AlertDialog open={tipoParaExcluir !== null} onOpenChange={(open) => !open && setTipoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este tipo de saída? Esta ação não pode ser desfeita.
              {tiposSaida.find(t => t.id === tipoParaExcluir) && (
                <span className="block mt-2 font-medium text-white">
                  Tipo: {tiposSaida.find(t => t.id === tipoParaExcluir)?.nome}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTipoParaExcluir(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarExclusaoTipo}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Edição de Curso */}
      <AlertDialog open={cursoParaEditar !== null} onOpenChange={(open) => !open && setCursoParaEditar(null)}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Editar Curso</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Configure a capacidade máxima de alunos por turma para este curso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm text-slate-300">Curso</Label>
              <div className="mt-1 px-3 py-2 bg-slate-900/50 rounded-lg text-white text-sm">
                {cursoParaEditar?.nome}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sem-limite"
                  checked={semLimite}
                  onCheckedChange={(checked) => {
                    setSemLimite(checked as boolean);
                    if (checked) setCapacidadeEditando(null);
                  }}
                />
                <Label htmlFor="sem-limite" className="text-sm text-slate-300 cursor-pointer">
                  Sem limite de capacidade
                </Label>
              </div>
              
              {!semLimite && (
                <div>
                  <Label htmlFor="capacidade" className="text-sm text-slate-300">
                    Capacidade máxima de alunos
                  </Label>
                  <Input
                    id="capacidade"
                    type="number"
                    min="1"
                    max="20"
                    value={capacidadeEditando || ''}
                    onChange={(e) => setCapacidadeEditando(parseInt(e.target.value) || null)}
                    className="mt-1 bg-slate-900 border-slate-700 text-white"
                    placeholder="Ex: 5"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    A capacidade efetiva da turma será o menor valor entre a capacidade da sala e do curso.
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCursoParaEditar(null)} className="bg-slate-700 hover:bg-slate-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={salvarEdicaoCurso}
              className="bg-violet-600 hover:bg-violet-700"
              disabled={!semLimite && (!capacidadeEditando || capacidadeEditando < 1)}
            >
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação de Exclusão de Curso */}
      <AlertDialog open={cursoParaExcluir !== null} onOpenChange={(open) => !open && setCursoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este curso? Esta ação não pode ser desfeita.
              {cursos.find(c => c.id === cursoParaExcluir) && (
                <span className="block mt-2 font-medium text-white">
                  Curso: {cursos.find(c => c.id === cursoParaExcluir)?.nome}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCursoParaExcluir(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmarExclusaoCurso}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ConfigPage;
