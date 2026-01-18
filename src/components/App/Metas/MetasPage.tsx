import { useState, useEffect } from 'react';
import { Target, Save, Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, Users, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, parseBRL, formatBRLInput } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface Meta {
  id: number;
  ano: number;
  mes: number;
  unidade_id: string;
  tipo: string;
  valor: number;
  created_at?: string;
}

interface Unidade {
  id: string;
  nome: string;
}

const TIPOS_META = [
  { id: 'matriculas', label: 'Matrículas', icon: Users, color: 'emerald' },
  { id: 'leads', label: 'Leads', icon: TrendingUp, color: 'cyan' },
  { id: 'experimentais', label: 'Experimentais', icon: TrendingUp, color: 'amber' },
  { id: 'renovacoes', label: 'Renovações', icon: RefreshCw, color: 'violet' },
  { id: 'evasoes_max', label: 'Evasões (máx)', icon: TrendingDown, color: 'rose' },
  { id: 'faturamento', label: 'Faturamento', icon: DollarSign, color: 'emerald' },
  { id: 'ticket_medio', label: 'Ticket Médio', icon: DollarSign, color: 'violet' },
  { id: 'taxa_conversao', label: 'Taxa Conversão (%)', icon: TrendingUp, color: 'cyan' },
  { id: 'taxa_renovacao', label: 'Taxa Renovação (%)', icon: RefreshCw, color: 'amber' },
];

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function MetasPage() {
  const { isAdmin, usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [editedMetas, setEditedMetas] = useState<Map<string, number>>(new Map());
  
  // Filtros
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string>('todos');

  useEffect(() => {
    fetchDados();
  }, [anoSelecionado]);

  async function fetchDados() {
    setLoading(true);
    try {
      const [metasRes, unidadesRes] = await Promise.all([
        supabase
          .from('metas')
          .select('*')
          .eq('ano', anoSelecionado)
          .order('mes'),
        supabase.from('unidades').select('id, nome'),
      ]);

      if (metasRes.data) setMetas(metasRes.data);
      if (unidadesRes.data) setUnidades(unidadesRes.data);
    } catch (err) {
      console.error('Erro ao carregar metas:', err);
    } finally {
      setLoading(false);
    }
  }

  function getMetaKey(unidadeId: string, mes: number, tipo: string): string {
    return `${unidadeId}-${mes}-${tipo}`;
  }

  function getMetaValue(unidadeId: string, mes: number, tipo: string): number {
    const key = getMetaKey(unidadeId, mes, tipo);
    if (editedMetas.has(key)) {
      return editedMetas.get(key) || 0;
    }
    const meta = metas.find(m => m.unidade_id === unidadeId && m.mes === mes && m.tipo === tipo);
    return meta?.valor || 0;
  }

  function handleMetaChange(unidadeId: string, mes: number, tipo: string, valor: number) {
    const key = getMetaKey(unidadeId, mes, tipo);
    setEditedMetas(prev => new Map(prev).set(key, valor));
  }

  async function saveChanges() {
    setSaving(true);
    try {
      for (const [key, valor] of editedMetas) {
        const [unidadeId, mesStr, tipo] = key.split('-');
        const mes = parseInt(mesStr);

        // Verificar se já existe
        const existing = metas.find(m => 
          m.unidade_id === unidadeId && m.mes === mes && m.tipo === tipo
        );

        if (existing) {
          await supabase
            .from('metas')
            .update({ valor })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('metas')
            .insert({
              ano: anoSelecionado,
              mes,
              unidade_id: unidadeId,
              tipo,
              valor,
            });
        }
      }

      setEditedMetas(new Map());
      await fetchDados();
      alert('Metas salvas com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar metas:', err);
      alert('Erro ao salvar metas. Verifique o console.');
    } finally {
      setSaving(false);
    }
  }

  // Filtrar unidades
  const unidadesFiltradas = unidadeSelecionada === 'todos' 
    ? unidades 
    : unidades.filter(u => u.id === unidadeSelecionada);

  const hasChanges = editedMetas.size > 0;

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
            <Target className="text-amber-400" />
            Gestão de Metas
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Defina metas mensais por unidade e tipo
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
          {hasChanges && (
            <button
              onClick={saveChanges}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Salvando...' : 'Salvar Metas'}
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Ano</label>
          <select
            value={anoSelecionado}
            onChange={(e) => setAnoSelecionado(Number(e.target.value))}
            className="mt-1 block w-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value={2024}>2024</option>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Unidade</label>
          <select
            value={unidadeSelecionada}
            onChange={(e) => setUnidadeSelecionada(e.target.value)}
            className="mt-1 block w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="todos">Todas</option>
            {unidades.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabelas de Metas por Unidade */}
      {unidadesFiltradas.map(unidade => (
        <div key={unidade.id} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-700/50 bg-slate-900/30">
            <h3 className="text-lg font-bold text-white">{unidade.nome}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 text-left w-40">Tipo de Meta</th>
                  {MESES.map((mes, i) => (
                    <th key={i} className="py-3 px-2 text-center w-20">{mes.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIPOS_META.map(tipo => (
                  <tr key={tipo.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        <tipo.icon size={16} className={`text-${tipo.color}-400`} />
                        <span className="text-white text-sm font-medium">{tipo.label}</span>
                      </div>
                    </td>
                    {MESES.map((_, mesIndex) => {
                      const mes = mesIndex + 1;
                      const valor = getMetaValue(unidade.id, mes, tipo.id);
                      const isEdited = editedMetas.has(getMetaKey(unidade.id, mes, tipo.id));
                      const isCurrency = tipo.id === 'faturamento' || tipo.id === 'ticket_medio';
                      const isPercentage = tipo.id === 'taxa_conversao' || tipo.id === 'taxa_renovacao';

                      return (
                        <td key={mes} className="py-1 px-1">
                          <input
                            type="number"
                            value={valor || ''}
                            onChange={(e) => handleMetaChange(unidade.id, mes, tipo.id, Number(e.target.value))}
                            placeholder="—"
                            className={`w-full text-center bg-transparent border rounded px-1 py-1 text-sm transition-colors ${
                              isEdited 
                                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300' 
                                : 'border-slate-700/50 text-slate-300 hover:border-slate-600'
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Legenda */}
      <div className="flex items-center gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-500/20 border border-amber-500/50 rounded" />
          <span>Valor editado (não salvo)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Dica:</span>
          <span>Deixe em branco para metas não definidas</span>
        </div>
      </div>
    </div>
  );
}

export default MetasPage;
