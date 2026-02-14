import React, { useState } from 'react';
import { 
  Trophy, 
  AlertTriangle, 
  Settings, 
  Plus, 
  Trash2,
  Gift,
  Star,
  TrendingUp,
  Medal,
  Award,
  Target,
  Percent,
  ShoppingBag,
  Check,
  X,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFidelizaPrograma, FarmerDados } from '@/hooks/useFidelizaPrograma';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Tipos de penalidade
const TIPOS_PENALIDADE = [
  { value: 'nao_preencheu_sistema', label: 'Nao preencheu sistema', pontos: 3 },
  { value: 'nao_preencheu_lareport', label: 'Nao preencheu LA Report', pontos: 3 },
  { value: 'reincidencia_mes', label: 'Reincidencia no mes', pontos: 5 },
  { value: 'outro', label: 'Outro (personalizado)', pontos: 0 },
];

// Nomes dos trimestres
const TRIMESTRES = [
  { value: 1, label: 'Q1 (Jan-Mar)' },
  { value: 2, label: 'Q2 (Abr-Jun)' },
  { value: 3, label: 'Q3 (Jul-Set)' },
  { value: 4, label: 'Q4 (Out-Dez)' },
];

// Configuracao das abas (padrao cockpit)
const ABAS_CONFIG = [
  { id: 'ranking' as const, label: 'Ranking', icon: Trophy, bgColor: 'bg-emerald-600' },
  { id: 'penalidades' as const, label: 'Penalidades', icon: AlertTriangle, bgColor: 'bg-red-600' },
  { id: 'config' as const, label: 'Configuracoes', icon: Settings, bgColor: 'bg-slate-600' },
];

// Componente de Input com Auto-Save (igual ao Matriculador+)
interface ConfigInputProps {
  value: number;
  campo: string;
  ano: number;
  tipo?: 'numero' | 'percentual' | 'moeda';
  onSaved?: () => void;
  className?: string;
}

function ConfigInput({ value, campo, ano, tipo = 'numero', onSaved, className }: ConfigInputProps) {
  const [inputValue, setInputValue] = useState(String(value));
  const [status, setStatus] = useState<'idle' | 'editing' | 'saving' | 'saved'>('idle');
  const originalValue = React.useRef(value);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    setInputValue(String(value));
    originalValue.current = value;
  }, [value]);

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const texto = e.target.value;
    if (!/^[\d.,]*$/.test(texto) && texto !== '') return;
    setInputValue(texto);
    
    const novoValor = parseFloat(texto.replace(',', '.')) || 0;
    if (novoValor !== originalValue.current) {
      setStatus('editing');
    } else {
      setStatus('idle');
    }
  };

  const handleBlur = async () => {
    const novoValor = parseFloat(inputValue.replace(',', '.')) || 0;
    if (novoValor === originalValue.current) {
      setStatus('idle');
      return;
    }

    setStatus('saving');
    try {
      const { error } = await supabase
        .from('programa_fideliza_config')
        .update({ [campo]: novoValor, updated_at: new Date().toISOString() })
        .eq('ano', ano);

      if (error) throw error;

      setStatus('saved');
      originalValue.current = novoValor;
      onSaved?.();
      
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      console.error('Erro ao salvar config:', err);
      toast.error('Erro ao salvar configuracao');
      setStatus('idle');
    }
  };

  const getStatusStyles = () => {
    switch (status) {
      case 'editing':
        return 'border-amber-500/70 bg-amber-500/10 text-amber-200';
      case 'saving':
        return 'border-cyan-500/70 bg-cyan-500/10 text-cyan-200';
      case 'saved':
        return 'border-emerald-500/70 bg-emerald-500/10 text-emerald-200';
      default:
        return 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600';
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          "border rounded-lg px-3 py-2 text-sm transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
          getStatusStyles(),
          className
        )}
      />
      {status === 'saved' && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <Check size={14} className="text-emerald-400" />
        </div>
      )}
    </div>
  );
}

interface TabProgramaFidelizaProps {
  unidadeSelecionada?: string;
  ano?: number;
}

export function TabProgramaFideliza({ unidadeSelecionada, ano = 2026 }: TabProgramaFidelizaProps) {
  const { user, isAdmin } = useAuth();
  
  // Determinar se e visao admin (consolidado) ou individual (unidade especifica)
  const isSuperAdmin = isAdmin && (!unidadeSelecionada || unidadeSelecionada === 'todos');
  
  const [abaInterna, setAbaInterna] = useState<'ranking' | 'penalidades' | 'config'>('ranking');
  const [trimestreSelecionado, setTrimestreSelecionado] = useState<number | null>(null);
  const [showModalPenalidade, setShowModalPenalidade] = useState(false);
  const [deletePenalidadeId, setDeletePenalidadeId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Estados para experiencias
  const [showModalExperiencia, setShowModalExperiencia] = useState(false);
  const [editingExperiencia, setEditingExperiencia] = useState<{ id: number; tipo: string; nome: string; descricao: string; emoji: string; valor_estimado: number } | null>(null);
  const [deleteExperienciaId, setDeleteExperienciaId] = useState<number | null>(null);
  const [novaExperiencia, setNovaExperiencia] = useState({
    tipo: 'standard' as 'standard' | 'premium',
    nome: '',
    descricao: '',
    emoji: '🎁',
    valor_estimado: 100,
  });
  
  // Estado para alternar visao tabela/grafico no historico
  const [historicoView, setHistoricoView] = useState<'tabela' | 'grafico'>('tabela');

  // Hook do programa
  const {
    loading,
    config,
    trimestreAtual,
    farmers,
    penalidades,
    historico,
    experiencias,
    registrarPenalidade,
    deletarPenalidade,
    atualizarPenalidade,
    atualizarConfigDireto,
    adicionarExperiencia,
    atualizarExperiencia,
    deletarExperiencia,
  } = useFidelizaPrograma(ano, trimestreSelecionado || undefined, unidadeSelecionada !== 'todos' ? unidadeSelecionada : undefined);

  // Trimestre efetivo (selecionado ou atual)
  const trimestreEfetivo = trimestreSelecionado || trimestreAtual;
  
  // Farmer atual (para visao individual)
  const farmerAtual = farmers?.find(f => f.unidade_id === unidadeSelecionada);

  // Helper: meta da lojinha por unidade
  const getMetaLojinha = (unidadeId?: string) => {
    if (unidadeId === '2ec861f6-023f-4d7b-9927-3960ad8c2a92') return config?.metas.lojinha_campo_grande || 5000;
    if (unidadeId === '95553e96-971b-4590-a6eb-0201d013c14d') return config?.metas.lojinha_recreio || 3000;
    if (unidadeId === '368d47f5-2d88-4475-bc14-ba084a9a348e') return config?.metas.lojinha_barra || 3000;
    return 5000;
  };

  // Form de nova penalidade
  const [novaPenalidade, setNovaPenalidade] = useState({
    unidade_id: '',
    tipo: '',
    descricao: '',
    pontos: 3,
    data: new Date().toISOString().split('T')[0],
  });

  // Filtrar penalidades do trimestre
  const penalidadesTrimestre = penalidades.filter(p => p.trimestre === trimestreEfetivo);

  // Handlers
  const handleRegistrarPenalidade = async () => {
    if (!novaPenalidade.unidade_id || !novaPenalidade.tipo) {
      toast.error('Preencha todos os campos obrigatorios');
      return;
    }

    setSaving(true);
    const result = await registrarPenalidade(
      novaPenalidade.unidade_id,
      novaPenalidade.tipo,
      novaPenalidade.descricao,
      novaPenalidade.pontos,
      novaPenalidade.data,
      user?.nome || 'Admin'
    );

    if (result.success) {
      toast.success('Penalidade registrada!');
      setShowModalPenalidade(false);
      setNovaPenalidade({
        unidade_id: '',
        tipo: '',
        descricao: '',
        pontos: 3,
        data: new Date().toISOString().split('T')[0],
      });
    } else {
      toast.error(result.error || 'Erro ao registrar penalidade');
    }
    setSaving(false);
  };

  const handleDeletarPenalidade = async () => {
    if (!deletePenalidadeId) return;
    
    setSaving(true);
    const result = await deletarPenalidade(deletePenalidadeId);
    if (result.success) {
      toast.success('Penalidade removida!');
    } else {
      toast.error(result.error || 'Erro ao remover penalidade');
    }
    setDeletePenalidadeId(null);
    setSaving(false);
  };

  // Handlers de experiencias
  const handleAdicionarExperiencia = async () => {
    if (!novaExperiencia.nome) {
      toast.error('Informe o nome da experiencia');
      return;
    }

    setSaving(true);
    const result = await adicionarExperiencia(
      novaExperiencia.tipo,
      novaExperiencia.nome,
      novaExperiencia.descricao,
      novaExperiencia.emoji,
      novaExperiencia.valor_estimado
    );

    if (result.success) {
      toast.success('Experiencia adicionada!');
      setShowModalExperiencia(false);
      setNovaExperiencia({
        tipo: 'standard',
        nome: '',
        descricao: '',
        emoji: '🎁',
        valor_estimado: 100,
      });
    } else {
      toast.error(result.error || 'Erro ao adicionar experiencia');
    }
    setSaving(false);
  };

  const handleEditarExperiencia = async () => {
    if (!editingExperiencia) return;

    setSaving(true);
    const result = await atualizarExperiencia(editingExperiencia.id, {
      tipo: editingExperiencia.tipo,
      nome: editingExperiencia.nome,
      descricao: editingExperiencia.descricao,
      emoji: editingExperiencia.emoji,
      valor_estimado: editingExperiencia.valor_estimado,
    });

    if (result.success) {
      toast.success('Experiencia atualizada!');
      setEditingExperiencia(null);
    } else {
      toast.error(result.error || 'Erro ao atualizar experiencia');
    }
    setSaving(false);
  };

  const handleDeletarExperiencia = async () => {
    if (!deleteExperienciaId) return;

    setSaving(true);
    const result = await deletarExperiencia(deleteExperienciaId);
    if (result.success) {
      toast.success('Experiencia removida!');
    } else {
      toast.error(result.error || 'Erro ao remover experiencia');
    }
    setDeleteExperienciaId(null);
    setSaving(false);
  };

  // Renderizar card de farmer (para ranking)
  const renderFarmerCard = (farmer: FarmerDados, index: number) => {
    const posicao = farmer.posicao || index + 1;
    const isFirst = posicao === 1;
    const isSecond = posicao === 2;

    const bgGradient = isFirst 
      ? 'from-yellow-900/30 to-yellow-600/10 border-yellow-500/50'
      : isSecond 
        ? 'from-slate-700/30 to-slate-600/10 border-slate-500/50'
        : 'from-orange-900/30 to-orange-600/10 border-orange-500/50';

    const textColor = isFirst ? 'text-yellow-400' : isSecond ? 'text-slate-300' : 'text-orange-400';
    const badgeBg = isFirst ? 'bg-yellow-500 text-black' : isSecond ? 'bg-slate-400 text-black' : 'bg-orange-600 text-white';

    const iniciais = farmer.farmers.apelidos.split(' & ').map(n => n.charAt(0));

    return (
      <div key={farmer.unidade_id} className={cn(
        "bg-gradient-to-br border-2 rounded-2xl p-6 relative",
        bgGradient
      )}>
        {/* Badge de posicao */}
        <div className={cn("absolute -top-3 -right-3 font-bold px-3 py-1 rounded-full text-sm", badgeBg)}>
          {posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : '🥉'} {posicao}o Lugar
        </div>

        {/* Header com avatares */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex -space-x-3">
            {iniciais.map((inicial, i) => (
              <div key={i} className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2",
                isFirst ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                isSecond ? 'bg-slate-500/20 text-slate-300 border-slate-500/50' :
                'bg-orange-500/20 text-orange-400 border-orange-500/50'
              )}>
                {inicial}
              </div>
            ))}
          </div>
          <div>
            <h3 className={cn("text-lg font-bold", textColor)}>{farmer.farmers.apelidos}</h3>
            <p className="text-slate-400 text-sm">{farmer.unidade_nome}</p>
          </div>
        </div>

        {/* Pontuacao */}
        <div className="text-center mb-4">
          <span className={cn("text-5xl font-bold", textColor)}>{farmer.pontuacao?.total || 0}</span>
          <span className="text-slate-400 text-lg"> pontos</span>
        </div>

        {/* Metricas */}
        <div className="space-y-2 text-sm">
          <MetricaRow 
            label="Churn" 
            valor={`${farmer.metricas.churn_rate.toFixed(1)}%`}
            bateu={farmer.metricas.churn_rate <= (config?.metas.churn_maximo || 4)}
          />
          <MetricaRow 
            label="Inadimplencia" 
            valor={`${farmer.metricas.inadimplencia_pct.toFixed(1)}%`}
            bateu={farmer.metricas.inadimplencia_pct <= (config?.metas.inadimplencia_maxima || 1)}
          />
          <MetricaRow 
            label="Renovacao" 
            valor={`${farmer.metricas.taxa_renovacao.toFixed(0)}%`}
            bateu={farmer.metricas.taxa_renovacao >= (config?.metas.renovacao_minima || 90)}
          />
          <MetricaRow 
            label="Reajuste" 
            valor={`${farmer.metricas.reajuste_medio.toFixed(1)}%`}
            bateu={farmer.metricas.reajuste_medio >= (config?.metas.reajuste_minimo || 7)}
          />
          <MetricaRow 
            label="Lojinha" 
            valor={`R$ ${farmer.metricas.vendas_lojinha.toLocaleString('pt-BR')}`}
            bateu={false}
            semMeta
          />
          
          {/* Penalidades */}
          {farmer.penalidades.total_pontos > 0 && (
            <div className="flex justify-between text-red-400 border-t border-slate-700 pt-2 mt-2">
              <span>Penalidades</span>
              <span>-{farmer.penalidades.total_pontos} pts</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VISAO ADMIN (CONSOLIDADO) - COM ABAS
  // ═══════════════════════════════════════════════════════════════
  if (isSuperAdmin) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-400" />
              Programa Fideliza+ LA {ano}
            </h2>
            <p className="text-slate-400 mt-1">
              Competicao trimestral de retencao • Premio anual: 14o Salario + VR 6 meses
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowModalPenalidade(true)}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <Plus className="w-4 h-4 mr-2" />
            Registrar Penalidade
          </Button>
        </div>

        {/* Abas internas (padrao cockpit) */}
        <div className="flex gap-2 border-b border-slate-700 pb-2">
          {ABAS_CONFIG.map(aba => {
            const Icon = aba.icon;
            const isActive = abaInterna === aba.id;
            
            return (
              <button
                key={aba.id}
                onClick={() => setAbaInterna(aba.id)}
                className={cn(
                  "px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-2",
                  isActive 
                    ? `${aba.bgColor} text-white` 
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                )}
              >
                <Icon size={16} />
                {aba.label}
              </button>
            );
          })}
        </div>

        {/* ABA: RANKING */}
        {abaInterna === 'ranking' && (
          <div className="space-y-6">
            {/* Cards de Ranking */}
            <div className="grid grid-cols-3 gap-4">
              {farmers.map((farmer, index) => renderFarmerCard(farmer, index))}
            </div>

            {/* Tabela Comparativa */}
            <div className="bg-slate-900 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                Comparativo Detalhado - {TRIMESTRES.find(t => t.value === trimestreEfetivo)?.label}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-3">Metrica</th>
                      <th className="text-center py-3">Meta</th>
                      {farmers.map(f => (
                        <th key={f.unidade_id} className="text-center py-3">{f.farmers.apelidos}</th>
                      ))}
                      <th className="text-center py-3">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Churn Premiado</td>
                      <td className="text-center text-slate-400">≤ {config?.metas.churn_maximo}%</td>
                      {farmers.map(f => (
                        <td key={f.unidade_id} className={cn(
                          "text-center",
                          f.metricas.churn_rate <= (config?.metas.churn_maximo || 4) ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {f.metricas.churn_rate.toFixed(1)}% {f.metricas.churn_rate <= (config?.metas.churn_maximo || 4) ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config?.pontuacao.churn} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Inadimplencia Zero</td>
                      <td className="text-center text-slate-400">≤ {config?.metas.inadimplencia_maxima}%</td>
                      {farmers.map(f => (
                        <td key={f.unidade_id} className={cn(
                          "text-center",
                          f.metricas.inadimplencia_pct <= (config?.metas.inadimplencia_maxima || 1) ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {f.metricas.inadimplencia_pct.toFixed(1)}% {f.metricas.inadimplencia_pct <= (config?.metas.inadimplencia_maxima || 1) ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config?.pontuacao.inadimplencia} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Max Renovacao</td>
                      <td className="text-center text-slate-400">≥ {config?.metas.renovacao_minima}%</td>
                      {farmers.map(f => (
                        <td key={f.unidade_id} className={cn(
                          "text-center",
                          f.metricas.taxa_renovacao >= (config?.metas.renovacao_minima || 90) ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {f.metricas.taxa_renovacao.toFixed(0)}% {f.metricas.taxa_renovacao >= (config?.metas.renovacao_minima || 90) ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config?.pontuacao.renovacao} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Reajuste Campeao</td>
                      <td className="text-center text-slate-400">≥ {config?.metas.reajuste_minimo}%</td>
                      {farmers.map(f => (
                        <td key={f.unidade_id} className={cn(
                          "text-center",
                          f.metricas.reajuste_medio >= (config?.metas.reajuste_minimo || 7) ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {f.metricas.reajuste_medio.toFixed(1)}% {f.metricas.reajuste_medio >= (config?.metas.reajuste_minimo || 7) ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config?.pontuacao.reajuste} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Mestres da Lojinha</td>
                      <td className="text-center text-slate-400">CG: R$5k / Outros: R$3k</td>
                      {farmers.map(f => (
                        <td key={f.unidade_id} className="text-center text-slate-400">
                          R$ {f.metricas.vendas_lojinha.toLocaleString('pt-BR')}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config?.pontuacao.lojinha} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800 text-red-400">
                      <td className="py-3 font-medium">Penalidades</td>
                      <td className="text-center text-slate-400">-</td>
                      {farmers.map(f => (
                        <td key={f.unidade_id} className="text-center">
                          -{f.penalidades.total_pontos} pts
                        </td>
                      ))}
                      <td className="text-center text-slate-400">Desconto</td>
                    </tr>
                    <tr className="font-bold text-lg">
                      <td className="py-3">TOTAL</td>
                      <td className="text-center text-slate-400">100</td>
                      {farmers.map((f, i) => (
                        <td key={f.unidade_id} className={cn(
                          "text-center",
                          i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : 'text-orange-400'
                        )}>
                          {f.pontuacao?.total || 0} pts
                        </td>
                      ))}
                      <td className="text-center">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historico Trimestral - 2026 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" />
                  Historico Trimestral - {ano}
                </h3>
                <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
                  <button
                    onClick={() => setHistoricoView('tabela')}
                    className={cn(
                      "px-3 py-1 rounded text-sm transition-colors",
                      historicoView === 'tabela' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    )}
                  >
                    Tabela
                  </button>
                  <button
                    onClick={() => setHistoricoView('grafico')}
                    className={cn(
                      "px-3 py-1 rounded text-sm transition-colors",
                      historicoView === 'grafico' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                    )}
                  >
                    Grafico
                  </button>
                </div>
              </div>

              {historicoView === 'tabela' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-3">Trimestre</th>
                        <th className="text-center py-3">Churn</th>
                        <th className="text-center py-3">Inadimpl.</th>
                        <th className="text-center py-3">Renovacao</th>
                        <th className="text-center py-3">Reajuste</th>
                        <th className="text-center py-3">Lojinha</th>
                        <th className="text-center py-3 bg-emerald-500/10">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TRIMESTRES.map(trim => {
                        const hist = historico.find(h => h.trimestre === trim.value);
                        const isAtual = trim.value === trimestreEfetivo;
                        
                        return (
                          <tr key={trim.value} className={cn(
                            "border-b border-slate-800",
                            isAtual && "bg-cyan-500/5"
                          )}>
                            <td className={cn("py-3 font-medium", isAtual && "text-cyan-400")}>
                              {trim.label} {isAtual && "(atual)"}
                            </td>
                            {hist ? (
                              <>
                                <td className={cn("text-center", hist.bateu_churn ? 'text-emerald-400' : 'text-red-400')}>
                                  {hist.churn_rate.toFixed(1)}% {hist.bateu_churn ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                                </td>
                                <td className={cn("text-center", hist.bateu_inadimplencia ? 'text-emerald-400' : 'text-red-400')}>
                                  {hist.inadimplencia_pct.toFixed(1)}% {hist.bateu_inadimplencia ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                                </td>
                                <td className={cn("text-center", hist.bateu_renovacao ? 'text-emerald-400' : 'text-red-400')}>
                                  {hist.taxa_renovacao.toFixed(0)}% {hist.bateu_renovacao ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                                </td>
                                <td className={cn("text-center", hist.bateu_reajuste ? 'text-emerald-400' : 'text-red-400')}>
                                  {hist.reajuste_medio.toFixed(1)}% {hist.bateu_reajuste ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                                </td>
                                <td className="text-center text-slate-400">
                                  R$ {hist.vendas_lojinha?.toLocaleString('pt-BR') || '-'}
                                </td>
                                <td className="text-center bg-emerald-500/10 font-bold text-emerald-400">
                                  {hist.pontos_total} pts
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="text-center text-slate-600">-</td>
                                <td className="text-center text-slate-600">-</td>
                                <td className="text-center text-slate-600">-</td>
                                <td className="text-center text-slate-600">-</td>
                                <td className="text-center text-slate-600">-</td>
                                <td className="text-center bg-emerald-500/10 text-slate-600">-</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                      {/* Media Anual */}
                      <tr className="font-bold border-t-2 border-slate-600">
                        <td className="py-3">MEDIA ANUAL</td>
                        {historico.length > 0 ? (
                          <>
                            <td className="text-center">
                              {(historico.reduce((acc, h) => acc + h.churn_rate, 0) / historico.length).toFixed(1)}%
                            </td>
                            <td className="text-center">
                              {(historico.reduce((acc, h) => acc + h.inadimplencia_pct, 0) / historico.length).toFixed(1)}%
                            </td>
                            <td className="text-center">
                              {(historico.reduce((acc, h) => acc + h.taxa_renovacao, 0) / historico.length).toFixed(0)}%
                            </td>
                            <td className="text-center">
                              {(historico.reduce((acc, h) => acc + h.reajuste_medio, 0) / historico.length).toFixed(1)}%
                            </td>
                            <td className="text-center">
                              R$ {(historico.reduce((acc, h) => acc + (h.vendas_lojinha || 0), 0) / historico.length).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="text-center bg-emerald-500/10 text-emerald-400">
                              {(historico.reduce((acc, h) => acc + h.pontos_total, 0) / historico.length).toFixed(0)} pts
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="text-center text-slate-600">-</td>
                            <td className="text-center text-slate-600">-</td>
                            <td className="text-center text-slate-600">-</td>
                            <td className="text-center text-slate-600">-</td>
                            <td className="text-center text-slate-600">-</td>
                            <td className="text-center bg-emerald-500/10 text-slate-600">-</td>
                          </>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-64">
                  <p className="text-sm text-slate-400 mb-4">
                    Evolucao do Churn (Criterio de Desempate) - Meta: ≤ {config?.metas.churn_maximo}%
                  </p>
                  <div className="relative h-48 border-l border-b border-slate-700">
                    {/* Linha de meta */}
                    <div 
                      className="absolute left-0 right-0 border-t-2 border-dashed border-amber-500/50"
                      style={{ bottom: `${((config?.metas.churn_maximo || 4) / 10) * 100}%` }}
                    >
                      <span className="absolute right-0 -top-4 text-xs text-amber-400">
                        Meta: {config?.metas.churn_maximo}%
                      </span>
                    </div>
                    
                    {/* Barras dos trimestres */}
                    <div className="absolute inset-0 flex items-end justify-around px-4">
                      {TRIMESTRES.map(trim => {
                        const hist = historico.find(h => h.trimestre === trim.value);
                        const churn = hist?.churn_rate || 0;
                        const height = Math.min((churn / 10) * 100, 100);
                        const isAtual = trim.value === trimestreEfetivo;
                        const bateu = churn <= (config?.metas.churn_maximo || 4);
                        
                        return (
                          <div key={trim.value} className="flex flex-col items-center gap-1 w-16">
                            {hist ? (
                              <>
                                <span className={cn(
                                  "text-sm font-bold",
                                  bateu ? 'text-emerald-400' : 'text-red-400'
                                )}>
                                  {churn.toFixed(1)}%
                                </span>
                                <div 
                                  className={cn(
                                    "w-10 rounded-t transition-all",
                                    bateu ? 'bg-emerald-500' : 'bg-red-500',
                                    isAtual && 'ring-2 ring-cyan-400'
                                  )}
                                  style={{ height: `${height}%`, minHeight: '4px' }}
                                />
                              </>
                            ) : (
                              <div className="w-10 h-1 bg-slate-700 rounded" />
                            )}
                            <span className={cn(
                              "text-xs",
                              isAtual ? 'text-cyan-400 font-bold' : 'text-slate-500'
                            )}>
                              Q{trim.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Metas vs Media do Grupo */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-purple-400" />
                Comparativo: Unidades vs Media do Grupo
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Compare o desempenho de cada unidade com a media das 3 escolas (sem revelar posicoes individuais)
              </p>
              
              <div className="grid grid-cols-4 gap-4">
                {/* Churn */}
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-3">Churn (Desempate)</div>
                  <div className="space-y-2">
                    {farmers.map(f => {
                      const valor = f.metricas.churn_rate;
                      const meta = config?.metas.churn_maximo || 4;
                      const bateu = valor <= meta;
                      return (
                        <div key={f.unidade_id} className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{f.unidade_nome.split(' ')[0]}</span>
                          <span className={cn(
                            "text-sm font-bold px-2 py-0.5 rounded",
                            bateu ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {valor.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                    <div className="border-t border-slate-700 pt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Media</span>
                      <span className="text-sm font-medium text-slate-300">
                        {farmers.length > 0 ? (farmers.reduce((acc, f) => acc + f.metricas.churn_rate, 0) / farmers.length).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Meta</span>
                      <span className="text-sm font-medium text-amber-400">≤ {config?.metas.churn_maximo}%</span>
                    </div>
                  </div>
                </div>

                {/* Inadimplencia */}
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-3">Inadimplencia</div>
                  <div className="space-y-2">
                    {farmers.map(f => {
                      const valor = f.metricas.inadimplencia_pct;
                      const meta = config?.metas.inadimplencia_maxima || 1;
                      const bateu = valor <= meta;
                      return (
                        <div key={f.unidade_id} className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{f.unidade_nome.split(' ')[0]}</span>
                          <span className={cn(
                            "text-sm font-bold px-2 py-0.5 rounded",
                            bateu ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {valor.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                    <div className="border-t border-slate-700 pt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Media</span>
                      <span className="text-sm font-medium text-slate-300">
                        {farmers.length > 0 ? (farmers.reduce((acc, f) => acc + f.metricas.inadimplencia_pct, 0) / farmers.length).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Meta</span>
                      <span className="text-sm font-medium text-amber-400">≤ {config?.metas.inadimplencia_maxima}%</span>
                    </div>
                  </div>
                </div>

                {/* Renovacao */}
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-3">Renovacao</div>
                  <div className="space-y-2">
                    {farmers.map(f => {
                      const valor = f.metricas.taxa_renovacao;
                      const meta = config?.metas.renovacao_minima || 90;
                      const bateu = valor >= meta;
                      return (
                        <div key={f.unidade_id} className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{f.unidade_nome.split(' ')[0]}</span>
                          <span className={cn(
                            "text-sm font-bold px-2 py-0.5 rounded",
                            bateu ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {valor.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                    <div className="border-t border-slate-700 pt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Media</span>
                      <span className="text-sm font-medium text-slate-300">
                        {farmers.length > 0 ? (farmers.reduce((acc, f) => acc + f.metricas.taxa_renovacao, 0) / farmers.length).toFixed(0) : 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Meta</span>
                      <span className="text-sm font-medium text-amber-400">≥ {config?.metas.renovacao_minima}%</span>
                    </div>
                  </div>
                </div>

                {/* Reajuste */}
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-3">Reajuste</div>
                  <div className="space-y-2">
                    {farmers.map(f => {
                      const valor = f.metricas.reajuste_medio;
                      const meta = config?.metas.reajuste_minimo || 7;
                      const bateu = valor >= meta;
                      return (
                        <div key={f.unidade_id} className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{f.unidade_nome.split(' ')[0]}</span>
                          <span className={cn(
                            "text-sm font-bold px-2 py-0.5 rounded",
                            bateu ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {valor.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                    <div className="border-t border-slate-700 pt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Media</span>
                      <span className="text-sm font-medium text-slate-300">
                        {farmers.length > 0 ? (farmers.reduce((acc, f) => acc + f.metricas.reajuste_medio, 0) / farmers.length).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Meta</span>
                      <span className="text-sm font-medium text-amber-400">≥ {config?.metas.reajuste_minimo}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: PENALIDADES */}
        {abaInterna === 'penalidades' && (
          <div className="space-y-6">
            {/* Cards de Penalidades por Dupla */}
            <div className="grid grid-cols-3 gap-4">
              {farmers.map(f => (
                <div key={f.unidade_id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center text-sm font-bold text-purple-400">
                      {f.farmers.apelidos.split(' & ')[0].charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium">{f.farmers.apelidos}</div>
                      <div className="text-xs text-slate-400">{f.unidade_nome}</div>
                    </div>
                  </div>
                  <div className={cn(
                    "text-3xl font-bold",
                    f.penalidades.total_pontos > 0 ? 'text-red-400' : 'text-slate-300'
                  )}>
                    -{f.penalidades.total_pontos} <span className="text-sm text-slate-500">pts</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {f.penalidades.quantidade} penalidade{f.penalidades.quantidade !== 1 ? 's' : ''} este ano
                  </div>
                </div>
              ))}
            </div>

            {/* Tabela de Penalidades */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">
                Historico de Penalidades - {ano}
              </h3>
              
              {penalidades.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  Nenhuma penalidade registrada este ano
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-3">Data</th>
                      <th className="text-left py-3">Farmer</th>
                      <th className="text-left py-3">Tipo</th>
                      <th className="text-left py-3">Descricao</th>
                      <th className="text-center py-3">Pontos</th>
                      <th className="text-left py-3">Registrado por</th>
                      <th className="text-center py-3">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {penalidades.map(p => {
                      const farmer = farmers.find(f => f.unidade_id === p.unidade_id);
                      return (
                        <tr key={p.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                          <td className="py-3">{new Date(p.data_ocorrencia).toLocaleDateString('pt-BR')}</td>
                          <td className="py-3">{farmer?.farmers.apelidos || '-'}</td>
                          <td className="py-3">{TIPOS_PENALIDADE.find(t => t.value === p.tipo)?.label || p.tipo}</td>
                          <td className="py-3 text-slate-400">{p.descricao || '-'}</td>
                          <td className="py-3 text-center text-red-400 font-bold">-{p.pontos_descontados}</td>
                          <td className="py-3 text-slate-400">{p.registrado_por}</td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => setDeletePenalidadeId(p.id)}
                              className="text-slate-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ABA: CONFIGURACOES */}
        {abaInterna === 'config' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-slate-400" />
                  Configuracoes do Programa Fideliza+ LA
                </h3>
                <p className="text-sm text-slate-400">
                  Edite as metas, pontuacoes e nota de corte • <span className="text-emerald-400">Salvo automaticamente</span>
                </p>
              </div>
            </div>

            {/* Grid 3 colunas: Metas, Lojinha, Pontuacao */}
            <div className="grid grid-cols-3 gap-6">
              {/* Metas de Retencao */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h4 className="font-medium text-slate-300 border-b border-slate-700 pb-2 mb-4">Metas de Retencao (Trimestral)</h4>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Churn Premiado (maximo)</Label>
                    <div className="flex items-center gap-2">
                      <ConfigInput
                        value={config?.metas.churn_maximo || 4}
                        campo="meta_churn_maximo"
                        ano={ano}
                        className="w-24"
                      />
                      <span className="text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Inadimplencia (maximo)</Label>
                    <div className="flex items-center gap-2">
                      <ConfigInput
                        value={config?.metas.inadimplencia_maxima || 1}
                        campo="meta_inadimplencia_maxima"
                        ano={ano}
                        className="w-24"
                      />
                      <span className="text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Max Renovacao (minimo)</Label>
                    <div className="flex items-center gap-2">
                      <ConfigInput
                        value={config?.metas.renovacao_minima || 90}
                        campo="meta_renovacao_minima"
                        ano={ano}
                        className="w-24"
                      />
                      <span className="text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Reajuste Campeao (minimo)</Label>
                    <div className="flex items-center gap-2">
                      <ConfigInput
                        value={config?.metas.reajuste_minimo || 7}
                        campo="meta_reajuste_minimo"
                        ano={ano}
                        className="w-24"
                      />
                      <span className="text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mestres da Lojinha */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h4 className="font-medium text-slate-300 border-b border-slate-700 pb-2 mb-4">Mestres da Lojinha (Meta Trimestral)</h4>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Campo Grande (Gabi & Jhon)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">R$</span>
                      <ConfigInput
                        value={config?.metas.lojinha_campo_grande || 5000}
                        campo="meta_lojinha_campo_grande"
                        ano={ano}
                        className="w-28"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Recreio (Fefe & Dai)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">R$</span>
                      <ConfigInput
                        value={config?.metas.lojinha_recreio || 3000}
                        campo="meta_lojinha_recreio"
                        ano={ano}
                        className="w-28"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Barra (Duda & Arthur)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">R$</span>
                      <ConfigInput
                        value={config?.metas.lojinha_barra || 3000}
                        campo="meta_lojinha_barra"
                        ano={ano}
                        className="w-28"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sistema de Pontuacao */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h4 className="font-medium text-slate-300 border-b border-slate-700 pb-2 mb-4">Sistema de Pontuacao</h4>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Pontos - Churn Premiado</Label>
                    <ConfigInput
                      value={config?.pontuacao.churn || 25}
                      campo="pontos_churn"
                      ano={ano}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Pontos - Inadimplencia</Label>
                    <ConfigInput
                      value={config?.pontuacao.inadimplencia || 20}
                      campo="pontos_inadimplencia"
                      ano={ano}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Pontos - Max Renovacao</Label>
                    <ConfigInput
                      value={config?.pontuacao.renovacao || 25}
                      campo="pontos_renovacao"
                      ano={ano}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Pontos - Reajuste Campeao</Label>
                    <ConfigInput
                      value={config?.pontuacao.reajuste || 15}
                      campo="pontos_reajuste"
                      ano={ano}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Pontos - Mestres da Lojinha</Label>
                    <ConfigInput
                      value={config?.pontuacao.lojinha || 15}
                      campo="pontos_lojinha"
                      ano={ano}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Grid 2 colunas: Penalidades e Nota de Corte */}
            <div className="grid grid-cols-2 gap-6">
              {/* Penalidades */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h4 className="font-medium text-slate-300 border-b border-slate-700 pb-2 mb-4">Penalidades</h4>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Nao preencheu sistema</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">-</span>
                      <ConfigInput
                        value={config?.penalidades?.nao_preencheu_sistema || 3}
                        campo="penalidade_nao_preencheu_sistema"
                        ano={ano}
                        className="w-20"
                      />
                      <span className="text-slate-400">pts</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Nao preencheu LA Report</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">-</span>
                      <ConfigInput
                        value={config?.penalidades?.nao_preencheu_lareport || 3}
                        campo="penalidade_nao_preencheu_lareport"
                        ano={ano}
                        className="w-20"
                      />
                      <span className="text-slate-400">pts</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Reincidencia no mes</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">-</span>
                      <ConfigInput
                        value={config?.penalidades?.reincidencia_mes || 5}
                        campo="penalidade_reincidencia_mes"
                        ano={ano}
                        className="w-20"
                      />
                      <span className="text-slate-400">pts</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nota de Corte e Regras */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                <h4 className="font-medium text-slate-300 border-b border-slate-700 pb-2 mb-4">Nota de Corte e Regras</h4>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Pontuacao minima para participar</Label>
                    <div className="flex items-center gap-2">
                      <ConfigInput
                        value={config?.nota_corte || 60}
                        campo="nota_corte"
                        ano={ano}
                        className="w-24"
                      />
                      <span className="text-slate-400">pontos</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Duplas abaixo desta pontuacao nao participam das experiencias</p>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Criterio de Desempate Anual</Label>
                    <Select
                      defaultValue={config?.criterio_desempate || 'menor_churn'}
                      onValueChange={async (value) => {
                        await atualizarConfigDireto('criterio_desempate', value);
                      }}
                    >
                      <SelectTrigger className="w-full bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="menor_churn">Menor Churn Acumulado</SelectItem>
                        <SelectItem value="maior_renovacao">Maior Taxa de Renovacao</SelectItem>
                        <SelectItem value="maior_lojinha">Maior Venda na Lojinha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-400 block mb-1">Periodo do Programa</Label>
                    <div className="flex items-center gap-2">
                      <Select defaultValue="1">
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Q1 (Jan-Mar)</SelectItem>
                          <SelectItem value="2">Q2 (Abr-Jun)</SelectItem>
                          <SelectItem value="3">Q3 (Jul-Set)</SelectItem>
                          <SelectItem value="4">Q4 (Out-Dez)</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-slate-400">ate</span>
                      <Select defaultValue="4">
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Q1 (Jan-Mar)</SelectItem>
                          <SelectItem value="2">Q2 (Abr-Jun)</SelectItem>
                          <SelectItem value="3">Q3 (Jul-Set)</SelectItem>
                          <SelectItem value="4">Q4 (Out-Dez)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Experiencias Cadastradas */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-slate-300 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-purple-400" />
                  Experiencias Cadastradas
                </h4>
                <Button 
                  size="sm" 
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => setShowModalExperiencia(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Experiencia
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                {/* Standard */}
                <div>
                  <h5 className="text-sm text-slate-400 mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" /> Standard (4/5 criterios)
                  </h5>
                  <div className="space-y-2">
                    {experiencias.filter(e => e.tipo === 'standard').length === 0 ? (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        Nenhuma experiencia standard cadastrada
                      </div>
                    ) : (
                      experiencias.filter(e => e.tipo === 'standard').map(exp => (
                        <div key={exp.id} className="bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{exp.emoji || '🎁'}</span>
                            <div>
                              <div className="text-sm font-medium">{exp.nome}</div>
                              <div className="text-xs text-slate-400">{exp.descricao}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              className="text-slate-400 hover:text-white transition-colors"
                              onClick={() => setEditingExperiencia({
                                id: exp.id,
                                tipo: exp.tipo,
                                nome: exp.nome,
                                descricao: exp.descricao,
                                emoji: exp.emoji,
                                valor_estimado: exp.valor_estimado,
                              })}
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                            <button 
                              className="text-slate-400 hover:text-red-400 transition-colors"
                              onClick={() => setDeleteExperienciaId(exp.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                {/* Premium */}
                <div>
                  <h5 className="text-sm text-slate-400 mb-3 flex items-center gap-2">
                    <Award className="w-4 h-4 text-yellow-400" /> Premium (5/5 criterios)
                  </h5>
                  <div className="space-y-2">
                    {experiencias.filter(e => e.tipo === 'premium').length === 0 ? (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        Nenhuma experiencia premium cadastrada
                      </div>
                    ) : (
                      experiencias.filter(e => e.tipo === 'premium').map(exp => (
                        <div key={exp.id} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{exp.emoji || '🌟'}</span>
                            <div>
                              <div className="text-sm font-medium text-yellow-400">{exp.nome}</div>
                              <div className="text-xs text-slate-400">{exp.descricao}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              className="text-slate-400 hover:text-white transition-colors"
                              onClick={() => setEditingExperiencia({
                                id: exp.id,
                                tipo: exp.tipo,
                                nome: exp.nome,
                                descricao: exp.descricao,
                                emoji: exp.emoji,
                                valor_estimado: exp.valor_estimado,
                              })}
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                            <button 
                              className="text-slate-400 hover:text-red-400 transition-colors"
                              onClick={() => setDeleteExperienciaId(exp.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Registrar Penalidade */}
        <Dialog open={showModalPenalidade} onOpenChange={setShowModalPenalidade}>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle>Registrar Penalidade</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Dupla de Farmers</Label>
                <Select
                  value={novaPenalidade.unidade_id}
                  onValueChange={(v) => setNovaPenalidade(prev => ({ ...prev, unidade_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a dupla" />
                  </SelectTrigger>
                  <SelectContent>
                    {farmers.map(f => (
                      <SelectItem key={f.unidade_id} value={f.unidade_id}>
                        {f.farmers.apelidos} - {f.unidade_nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Penalidade</Label>
                <Select
                  value={novaPenalidade.tipo}
                  onValueChange={(tipo) => {
                    const tipoPen = TIPOS_PENALIDADE.find(t => t.value === tipo);
                    setNovaPenalidade(prev => ({ ...prev, tipo, pontos: tipoPen?.pontos || 0 }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_PENALIDADE.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label} (-{t.pontos} pts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pontos a descontar</Label>
                <Input
                  type="number"
                  value={novaPenalidade.pontos}
                  onChange={(e) => setNovaPenalidade(prev => ({ ...prev, pontos: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>Descricao</Label>
                <Input
                  value={novaPenalidade.descricao}
                  onChange={(e) => setNovaPenalidade(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descreva o motivo da penalidade..."
                />
              </div>
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={novaPenalidade.data}
                  onChange={(e) => setNovaPenalidade(prev => ({ ...prev, data: e.target.value }))}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModalPenalidade(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleRegistrarPenalidade}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Registrar Penalidade
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AlertDialog de Confirmar Exclusao */}
        <AlertDialog open={!!deletePenalidadeId} onOpenChange={() => setDeletePenalidadeId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Penalidade?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acao nao pode ser desfeita. A penalidade sera removida e os pontos serao restaurados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeletarPenalidade} className="bg-red-600">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Modal de Adicionar Experiencia */}
        <Dialog open={showModalExperiencia} onOpenChange={setShowModalExperiencia}>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-purple-400" />
                Adicionar Experiencia
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={novaExperiencia.tipo}
                  onValueChange={(v) => setNovaExperiencia(prev => ({ ...prev, tipo: v as 'standard' | 'premium' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (4/5 criterios)</SelectItem>
                    <SelectItem value="premium">Premium (5/5 criterios)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nome</Label>
                <Input
                  value={novaExperiencia.nome}
                  onChange={(e) => setNovaExperiencia(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Cinema + Pipoca"
                />
              </div>
              <div>
                <Label>Descricao</Label>
                <Input
                  value={novaExperiencia.descricao}
                  onChange={(e) => setNovaExperiencia(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Ex: Ingresso + combo para 2 pessoas"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Emoji</Label>
                  <Input
                    value={novaExperiencia.emoji}
                    onChange={(e) => setNovaExperiencia(prev => ({ ...prev, emoji: e.target.value }))}
                    placeholder="🎁"
                    className="text-center text-xl"
                  />
                </div>
                <div>
                  <Label>Valor Estimado (R$)</Label>
                  <Input
                    type="number"
                    value={novaExperiencia.valor_estimado}
                    onChange={(e) => setNovaExperiencia(prev => ({ ...prev, valor_estimado: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModalExperiencia(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleAdicionarExperiencia}
                disabled={saving}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Editar Experiencia */}
        <Dialog open={!!editingExperiencia} onOpenChange={() => setEditingExperiencia(null)}>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-400" />
                Editar Experiencia
              </DialogTitle>
            </DialogHeader>
            {editingExperiencia && (
              <div className="space-y-4 py-4">
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={editingExperiencia.tipo}
                    onValueChange={(v) => setEditingExperiencia(prev => prev ? { ...prev, tipo: v } : null)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard (4/5 criterios)</SelectItem>
                      <SelectItem value="premium">Premium (5/5 criterios)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={editingExperiencia.nome}
                    onChange={(e) => setEditingExperiencia(prev => prev ? { ...prev, nome: e.target.value } : null)}
                  />
                </div>
                <div>
                  <Label>Descricao</Label>
                  <Input
                    value={editingExperiencia.descricao}
                    onChange={(e) => setEditingExperiencia(prev => prev ? { ...prev, descricao: e.target.value } : null)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Emoji</Label>
                    <Input
                      value={editingExperiencia.emoji}
                      onChange={(e) => setEditingExperiencia(prev => prev ? { ...prev, emoji: e.target.value } : null)}
                      className="text-center text-xl"
                    />
                  </div>
                  <div>
                    <Label>Valor Estimado (R$)</Label>
                    <Input
                      type="number"
                      value={editingExperiencia.valor_estimado}
                      onChange={(e) => setEditingExperiencia(prev => prev ? { ...prev, valor_estimado: parseInt(e.target.value) || 0 } : null)}
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingExperiencia(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleEditarExperiencia}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AlertDialog de Confirmar Exclusao de Experiencia */}
        <AlertDialog open={!!deleteExperienciaId} onOpenChange={() => setDeleteExperienciaId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Experiencia?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta experiencia sera desativada e nao aparecera mais na lista de premios disponiveis.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeletarExperiencia} className="bg-red-600">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VISAO FARMER (INDIVIDUAL) - SEM ABAS
  // ═══════════════════════════════════════════════════════════════
  if (!farmerAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="w-12 h-12 text-amber-400" />
        <p className="text-slate-400">Dados nao encontrados para esta unidade</p>
      </div>
    );
  }

  const iniciais = farmerAtual.farmers.apelidos.split(' & ').map(n => n.charAt(0));
  const pontos = farmerAtual.pontuacao?.total || 0;
  const posicao = farmerAtual.posicao || 1;

  return (
    <div className="space-y-6">
      {/* Header do Farmer */}
      <div className={cn(
        "bg-gradient-to-r rounded-2xl p-6 border",
        pontos >= (config?.nota_corte || 60)
          ? "from-emerald-900/30 to-emerald-600/10 border-emerald-500/30"
          : "from-amber-900/30 to-amber-600/10 border-amber-500/30"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              {iniciais.map((inicial, i) => (
                <div key={i} className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold",
                  pontos >= (config?.nota_corte || 60) 
                    ? "bg-emerald-500/20 text-emerald-400" 
                    : "bg-amber-500/20 text-amber-400"
                )}>
                  {inicial}
                </div>
              ))}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                Ola, {farmerAtual.farmers.apelidos}!
              </h2>
              <p className="text-slate-400">
                {farmerAtual.unidade_nome} • Programa Fideliza+ LA {ano}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className={cn(
              "text-5xl font-bold",
              pontos >= (config?.nota_corte || 60) ? "text-emerald-400" : "text-amber-400"
            )}>
              {pontos}
            </div>
            <div className="text-slate-400">pontos</div>
            <div className={cn(
              "text-sm mt-1",
              pontos >= (config?.nota_corte || 60) ? "text-emerald-400" : "text-amber-400"
            )}>
              Q{trimestreEfetivo} - {ano}
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Metricas */}
      <div className="grid grid-cols-2 gap-4">
        <MetricaCardFarmer
          titulo="Churn Premiado"
          meta={`Meta: <= ${config?.metas.churn_maximo || 4}%`}
          valor={`${farmerAtual.metricas.churn_rate.toFixed(1)}%`}
          pontos={config?.pontuacao.churn || 25}
          bateu={farmerAtual.metricas.churn_rate <= (config?.metas.churn_maximo || 4)}
          mensagem={farmerAtual.metricas.churn_rate <= (config?.metas.churn_maximo || 4)
            ? 'Meta batida! Excelente retencao!'
            : 'Atencao: churn acima da meta'
          }
          icon={<TrendingUp className="w-5 h-5" />}
        />

        <MetricaCardFarmer
          titulo="Inadimplencia Zero"
          meta={`Meta: <= ${config?.metas.inadimplencia_maxima || 1}%`}
          valor={`${farmerAtual.metricas.inadimplencia_pct.toFixed(1)}%`}
          pontos={config?.pontuacao.inadimplencia || 20}
          bateu={farmerAtual.metricas.inadimplencia_pct <= (config?.metas.inadimplencia_maxima || 1)}
          mensagem={farmerAtual.metricas.inadimplencia_pct <= (config?.metas.inadimplencia_maxima || 1)
            ? 'Cobranca em dia!'
            : 'Atencao: inadimplencia acima da meta'
          }
          icon={<Percent className="w-5 h-5" />}
        />

        <MetricaCardFarmer
          titulo="Max Renovacao"
          meta={`Meta: >= ${config?.metas.renovacao_minima || 90}%`}
          valor={`${farmerAtual.metricas.taxa_renovacao.toFixed(0)}%`}
          pontos={config?.pontuacao.renovacao || 25}
          bateu={farmerAtual.metricas.taxa_renovacao >= (config?.metas.renovacao_minima || 90)}
          mensagem={farmerAtual.metricas.taxa_renovacao >= (config?.metas.renovacao_minima || 90)
            ? 'Renovacoes em dia!'
            : 'Foco nas renovacoes pendentes'
          }
          icon={<Target className="w-5 h-5" />}
        />

        <MetricaCardFarmer
          titulo="Reajuste Campeao"
          meta={`Meta: >= ${config?.metas.reajuste_minimo || 7}%`}
          valor={`${farmerAtual.metricas.reajuste_medio.toFixed(1)}%`}
          pontos={config?.pontuacao.reajuste || 15}
          bateu={farmerAtual.metricas.reajuste_medio >= (config?.metas.reajuste_minimo || 7)}
          mensagem={farmerAtual.metricas.reajuste_medio >= (config?.metas.reajuste_minimo || 7)
            ? 'Media de reajuste acima da meta!'
            : 'Busque reajustes maiores'
          }
          icon={<TrendingUp className="w-5 h-5" />}
        />

        <MetricaCardFarmer
          titulo="Mestres da Lojinha"
          meta={`Meta: R$ ${getMetaLojinha(farmerAtual.unidade_id).toLocaleString('pt-BR')}`}
          valor={`R$ ${farmerAtual.metricas.vendas_lojinha.toLocaleString('pt-BR')}`}
          pontos={config?.pontuacao.lojinha || 15}
          bateu={farmerAtual.metricas.vendas_lojinha >= getMetaLojinha(farmerAtual.unidade_id)}
          mensagem="Vendas da lojinha no trimestre"
          icon={<ShoppingBag className="w-5 h-5" />}
        />

        {/* Penalidades */}
        <div className={cn(
          "bg-slate-900 rounded-xl p-5 border",
          farmerAtual.penalidades.total_pontos === 0 ? 'border-emerald-500/30' : 'border-red-500/30'
        )}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className={cn(
                "font-medium",
                farmerAtual.penalidades.total_pontos === 0 ? 'text-emerald-400' : 'text-red-400'
              )}>Penalidades</h4>
              <p className="text-sm text-slate-400">Avaliacao do lider administrativo</p>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-2xl font-bold",
                farmerAtual.penalidades.total_pontos === 0 ? 'text-emerald-400' : 'text-red-400'
              )}>{farmerAtual.penalidades.total_pontos}</span>
              <span className="text-slate-400 text-sm block">pts descontados</span>
            </div>
          </div>
          <div className="text-sm text-slate-400">
            {farmerAtual.penalidades.total_pontos === 0 
              ? <span className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-400" /> Nenhuma penalidade este trimestre!</span>
              : `${farmerAtual.penalidades.quantidade} penalidade(s) registrada(s)`
            }
          </div>
        </div>
      </div>

      {/* Historico Trimestral - Tabela e Grafico */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Historico Trimestral - {ano}
          </h3>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setHistoricoView('tabela')}
              className={cn(
                "px-3 py-1 rounded text-sm transition-colors",
                historicoView === 'tabela' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              Tabela
            </button>
            <button
              onClick={() => setHistoricoView('grafico')}
              className={cn(
                "px-3 py-1 rounded text-sm transition-colors",
                historicoView === 'grafico' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              Grafico
            </button>
          </div>
        </div>

        {historicoView === 'tabela' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-3">Trimestre</th>
                  <th className="text-center py-3">Churn</th>
                  <th className="text-center py-3">Inadimpl.</th>
                  <th className="text-center py-3">Renovacao</th>
                  <th className="text-center py-3">Reajuste</th>
                  <th className="text-center py-3">Lojinha</th>
                  <th className="text-center py-3 bg-emerald-500/10">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {TRIMESTRES.map(trim => {
                  const hist = historico.find(h => h.trimestre === trim.value && h.unidade_id === farmerAtual.unidade_id);
                  const isAtual = trim.value === trimestreAtual;
                  
                  // Se e trimestre atual, usar dados em tempo real do farmerAtual
                  const dadosTrimestre = isAtual ? {
                    churn_rate: farmerAtual.metricas.churn_rate,
                    inadimplencia_pct: farmerAtual.metricas.inadimplencia_pct,
                    taxa_renovacao: farmerAtual.metricas.taxa_renovacao,
                    reajuste_medio: farmerAtual.metricas.reajuste_medio,
                    vendas_lojinha: farmerAtual.metricas.vendas_lojinha,
                    pontos_total: pontos,
                    bateu_churn: farmerAtual.metricas.churn_rate <= (config?.metas.churn_maximo || 4),
                    bateu_inadimplencia: farmerAtual.metricas.inadimplencia_pct <= (config?.metas.inadimplencia_maxima || 1),
                    bateu_renovacao: farmerAtual.metricas.taxa_renovacao >= (config?.metas.renovacao_minima || 90),
                    bateu_reajuste: farmerAtual.metricas.reajuste_medio >= (config?.metas.reajuste_minimo || 7),
                  } : hist;
                  
                  return (
                    <tr key={trim.value} className={cn(
                      "border-b border-slate-800",
                      isAtual && "bg-cyan-500/5"
                    )}>
                      <td className={cn("py-3 font-medium", isAtual && "text-cyan-400")}>
                        {trim.label} {isAtual && "(atual)"}
                      </td>
                      {dadosTrimestre ? (
                        <>
                          <td className={cn("text-center", dadosTrimestre.bateu_churn ? 'text-emerald-400' : 'text-red-400')}>
                            {dadosTrimestre.churn_rate.toFixed(1)}% {dadosTrimestre.bateu_churn ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                          </td>
                          <td className={cn("text-center", dadosTrimestre.bateu_inadimplencia ? 'text-emerald-400' : 'text-red-400')}>
                            {dadosTrimestre.inadimplencia_pct.toFixed(1)}% {dadosTrimestre.bateu_inadimplencia ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                          </td>
                          <td className={cn("text-center", dadosTrimestre.bateu_renovacao ? 'text-emerald-400' : 'text-red-400')}>
                            {dadosTrimestre.taxa_renovacao.toFixed(0)}% {dadosTrimestre.bateu_renovacao ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                          </td>
                          <td className={cn("text-center", dadosTrimestre.bateu_reajuste ? 'text-emerald-400' : 'text-red-400')}>
                            {dadosTrimestre.reajuste_medio.toFixed(1)}% {dadosTrimestre.bateu_reajuste ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
                          </td>
                          <td className="text-center text-slate-400">
                            R$ {dadosTrimestre.vendas_lojinha?.toLocaleString('pt-BR') || '0'}
                          </td>
                          <td className="text-center bg-emerald-500/10 font-bold text-emerald-400">
                            {dadosTrimestre.pontos_total} pts
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="text-center text-slate-600">-</td>
                          <td className="text-center text-slate-600">-</td>
                          <td className="text-center text-slate-600">-</td>
                          <td className="text-center text-slate-600">-</td>
                          <td className="text-center text-slate-600">-</td>
                          <td className="text-center bg-emerald-500/10 text-slate-600">-</td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {/* Media Anual */}
                <tr className="font-bold border-t-2 border-slate-600">
                  <td className="py-3">MEDIA ANUAL</td>
                  {(() => {
                    // Incluir dados do trimestre atual nos calculos
                    const historicoUnidade = historico.filter(h => h.unidade_id === farmerAtual.unidade_id);
                    const dadosParaMedia = [...historicoUnidade];
                    
                    // Adicionar trimestre atual se nao estiver no historico
                    if (!historicoUnidade.find(h => h.trimestre === trimestreAtual)) {
                      dadosParaMedia.push({
                        ano,
                        trimestre: trimestreAtual,
                        unidade_id: farmerAtual.unidade_id,
                        unidade_nome: farmerAtual.unidade_nome,
                        churn_rate: farmerAtual.metricas.churn_rate,
                        inadimplencia_pct: farmerAtual.metricas.inadimplencia_pct,
                        taxa_renovacao: farmerAtual.metricas.taxa_renovacao,
                        reajuste_medio: farmerAtual.metricas.reajuste_medio,
                        vendas_lojinha: farmerAtual.metricas.vendas_lojinha,
                        bateu_churn: farmerAtual.metricas.churn_rate <= (config?.metas.churn_maximo || 4),
                        bateu_inadimplencia: farmerAtual.metricas.inadimplencia_pct <= (config?.metas.inadimplencia_maxima || 1),
                        bateu_renovacao: farmerAtual.metricas.taxa_renovacao >= (config?.metas.renovacao_minima || 90),
                        bateu_reajuste: farmerAtual.metricas.reajuste_medio >= (config?.metas.reajuste_minimo || 7),
                        bateu_lojinha: false,
                        pontos_total: pontos,
                        posicao: posicao,
                        experiencia_tipo: farmerAtual.experiencia_tipo || null,
                      });
                    }
                    
                    if (dadosParaMedia.length > 0) {
                      return (
                        <>
                          <td className="text-center">
                            {(dadosParaMedia.reduce((acc, h) => acc + h.churn_rate, 0) / dadosParaMedia.length).toFixed(1)}%
                          </td>
                          <td className="text-center">
                            {(dadosParaMedia.reduce((acc, h) => acc + h.inadimplencia_pct, 0) / dadosParaMedia.length).toFixed(1)}%
                          </td>
                          <td className="text-center">
                            {(dadosParaMedia.reduce((acc, h) => acc + h.taxa_renovacao, 0) / dadosParaMedia.length).toFixed(0)}%
                          </td>
                          <td className="text-center">
                            {(dadosParaMedia.reduce((acc, h) => acc + h.reajuste_medio, 0) / dadosParaMedia.length).toFixed(1)}%
                          </td>
                          <td className="text-center">
                            R$ {(dadosParaMedia.reduce((acc, h) => acc + (h.vendas_lojinha || 0), 0) / dadosParaMedia.length).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="text-center bg-emerald-500/10 text-emerald-400">
                            {(dadosParaMedia.reduce((acc, h) => acc + h.pontos_total, 0) / dadosParaMedia.length).toFixed(0)} pts
                          </td>
                        </>
                      );
                    }
                    return (
                      <>
                        <td className="text-center text-slate-600">-</td>
                        <td className="text-center text-slate-600">-</td>
                        <td className="text-center text-slate-600">-</td>
                        <td className="text-center text-slate-600">-</td>
                        <td className="text-center text-slate-600">-</td>
                        <td className="text-center bg-emerald-500/10 text-slate-600">-</td>
                      </>
                    );
                  })()}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-64">
            <p className="text-sm text-slate-400 mb-4">
              Evolucao do Churn (Criterio de Desempate) - Meta: ≤ {config?.metas.churn_maximo}%
            </p>
            <div className="relative h-48 border-l border-b border-slate-700">
              {/* Linha de meta */}
              <div 
                className="absolute left-0 right-0 border-t-2 border-dashed border-amber-500/50"
                style={{ bottom: `${((config?.metas.churn_maximo || 4) / 10) * 100}%` }}
              >
                <span className="absolute right-0 -top-4 text-xs text-amber-400">
                  Meta: {config?.metas.churn_maximo}%
                </span>
              </div>
              
              {/* Barras dos trimestres */}
              <div className="absolute inset-0 flex items-end justify-around px-4">
                {TRIMESTRES.map(trim => {
                  const hist = historico.find(h => h.trimestre === trim.value && h.unidade_id === farmerAtual.unidade_id);
                  const isAtual = trim.value === trimestreAtual;
                  const churn = isAtual ? farmerAtual.metricas.churn_rate : (hist?.churn_rate || 0);
                  const height = Math.min((churn / 10) * 100, 100);
                  const bateu = churn <= (config?.metas.churn_maximo || 4);
                  const temDados = hist || isAtual;
                  
                  return (
                    <div key={trim.value} className="flex flex-col items-center gap-1 w-16">
                      {temDados ? (
                        <>
                          <span className={cn(
                            "text-sm font-bold",
                            bateu ? 'text-emerald-400' : 'text-red-400'
                          )}>
                            {churn.toFixed(1)}%
                          </span>
                          <div 
                            className={cn(
                              "w-10 rounded-t transition-all",
                              bateu ? 'bg-emerald-500' : 'bg-red-500',
                              isAtual && 'ring-2 ring-cyan-400'
                            )}
                            style={{ height: `${height}%`, minHeight: '4px' }}
                          />
                        </>
                      ) : (
                        <div className="w-10 h-1 bg-slate-700 rounded" />
                      )}
                      <span className={cn(
                        "text-xs",
                        isAtual ? 'text-cyan-400 font-bold' : 'text-slate-500'
                      )}>
                        Q{trim.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Evolucao Trimestral - Cards */}
      <div className="bg-slate-900 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-emerald-400" />
          Evolucao Trimestral - {ano}
        </h3>
        <div className="grid grid-cols-4 gap-4 text-center text-sm">
          {TRIMESTRES.map(t => {
            const hist = historico.find(h => h.trimestre === t.value && h.unidade_id === farmerAtual.unidade_id);
            const isAtual = t.value === trimestreAtual;
            const pontosQ = hist?.pontos_total || (isAtual ? pontos : 0);
            
            return (
              <div key={t.value} className={cn(
                "rounded-lg p-4 border",
                hist || isAtual
                  ? 'bg-emerald-500/20 border-emerald-500/30'
                  : 'bg-slate-700/50 border-slate-700'
              )}>
                <div className={cn(
                  "font-bold",
                  hist || isAtual ? 'text-emerald-400' : 'text-slate-500'
                )}>Q{t.value}</div>
                <div className={cn(
                  "text-2xl font-bold",
                  hist || isAtual ? 'text-white' : 'text-slate-500'
                )}>
                  {pontosQ || '-'}
                </div>
                <div className="text-xs text-slate-400">pontos</div>
                {!hist && !isAtual && (
                  <div className="text-xs text-slate-500 mt-1">pendente</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ═══════════════════════════════════════════════════════════════

function MetricaRow({ 
  label, 
  valor, 
  bateu, 
  semMeta = false 
}: { 
  label: string; 
  valor: string; 
  bateu: boolean;
  semMeta?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={cn(
        semMeta ? 'text-slate-400' : bateu ? 'text-emerald-400' : 'text-red-400'
      )}>
        {valor} {!semMeta && (bateu ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />)}
      </span>
    </div>
  );
}

function MetricaCardFarmer({
  titulo,
  meta,
  valor,
  pontos,
  bateu,
  mensagem,
  icon
}: {
  titulo: string;
  meta: string;
  valor: string;
  pontos: number;
  bateu: boolean;
  mensagem: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium flex items-center gap-2">
            {icon}
            {titulo}
          </h4>
          <p className="text-sm text-slate-400">{meta}</p>
        </div>
        <div className="text-right">
          <span className={cn(
            "text-2xl font-bold",
            bateu ? 'text-emerald-400' : 'text-red-400'
          )}>{valor}</span>
          <span className={cn(
            "text-sm block",
            bateu ? 'text-emerald-400' : 'text-red-400'
          )}>
            {bateu ? `+${pontos} pts` : '0 pts'}
            {bateu ? <Check className="w-3 h-3 inline ml-1" /> : <X className="w-3 h-3 inline ml-1" />}
          </span>
        </div>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-3">
        <div 
          className={cn("h-3 rounded-full", bateu ? 'bg-emerald-500' : 'bg-red-500')} 
          style={{ width: bateu ? '100%' : '50%' }}
        />
      </div>
      <p className={cn(
        "text-xs mt-2",
        bateu ? 'text-emerald-400' : 'text-red-400'
      )}>{mensagem}</p>
    </div>
  );
}
