import React, { useState } from 'react';
import { 
  Trophy, 
  Target, 
  TrendingUp, 
  AlertTriangle,
  Settings,
  Plus,
  Trash2,
  Medal,
  Star,
  Award,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Plane,
  BarChart3
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMatriculadorPrograma, HunterDados, Penalidade } from '@/hooks/useMatriculadorPrograma';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CelulaEditavelInline } from '@/components/ui/CelulaEditavelInline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
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
import { supabase } from '@/lib/supabase';

interface TabProgramaMatriculadorProps {
  unidadeId: string | null;
  ano?: number;
}

// Componente de Input com Auto-Save
interface ConfigInputProps {
  value: number;
  campo: string;
  ano: number;
  tipo?: 'numero' | 'percentual' | 'moeda';
  onSaved?: () => void;
}

function ConfigInput({ value, campo, ano, tipo = 'numero', onSaved }: ConfigInputProps) {
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
        .from('programa_matriculador_config')
        .update({ [campo]: novoValor, updated_at: new Date().toISOString() })
        .eq('ano', ano);

      if (error) throw error;

      setStatus('saved');
      originalValue.current = novoValor;
      onSaved?.();
      
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      console.error('Erro ao salvar config:', err);
      toast.error('Erro ao salvar configuração');
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
          "w-full border rounded-lg px-3 py-2 text-sm transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-cyan-500/40",
          getStatusStyles()
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

// Tipos de penalidade disponíveis
const TIPOS_PENALIDADE = [
  { value: 'nao_preencheu_emusys', label: 'Não preencheu Emusys', pontos: 3 },
  { value: 'nao_preencheu_lareport', label: 'Não preencheu LA Report', pontos: 3 },
  { value: 'lead_abandonado', label: 'Lead abandonado', pontos: 2 },
  { value: 'tarefas_atrasadas', label: 'Tarefas atrasadas', pontos: 3 },
  { value: 'reincidencia', label: 'Reincidência no mês', pontos: 5 },
  { value: 'outro', label: 'Outro (personalizado)', pontos: 0 },
];

// Cores por posição
const POSICAO_CORES = {
  1: { bg: 'from-yellow-900/30 to-yellow-600/10', border: 'border-yellow-500/50', text: 'text-yellow-400', icon: '🥇' },
  2: { bg: 'from-slate-700/30 to-slate-600/10', border: 'border-slate-500/50', text: 'text-slate-300', icon: '🥈' },
  3: { bg: 'from-orange-900/30 to-orange-600/10', border: 'border-orange-500/50', text: 'text-orange-400', icon: '🥉' },
};

export function TabProgramaMatriculador({ unidadeId, ano = 2026 }: TabProgramaMatriculadorProps) {
  const { isAdmin, usuario } = useAuth();
  const isSuperAdmin = isAdmin && (!unidadeId || unidadeId === 'todos');
  
  const { 
    dados, 
    historico,
    loading, 
    error, 
    recarregar,
    registrarPenalidade,
    deletarPenalidade,
    atualizarPenalidade
  } = useMatriculadorPrograma(ano, unidadeId);

  // Estados para modais
  const [modalPenalidadeOpen, setModalPenalidadeOpen] = useState(false);
  const [modalConfigOpen, setModalConfigOpen] = useState(false);
  const [deletePenalidadeId, setDeletePenalidadeId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Estados do formulário de penalidade
  const [formPenalidade, setFormPenalidade] = useState({
    unidade_id: '',
    tipo: '',
    descricao: '',
    pontos: 0,
    data: new Date(),
  });

  // Abas internas (para admin)
  const [abaInterna, setAbaInterna] = useState<'ranking' | 'penalidades' | 'config'>('ranking');

  // Configuração das abas
  const ABAS_CONFIG = [
    { id: 'ranking' as const, label: 'Ranking', icon: Trophy },
    { id: 'penalidades' as const, label: 'Penalidades Emusys', icon: AlertTriangle },
    { id: 'config' as const, label: 'Configurações', icon: Settings },
  ];

  // Encontrar o Hunter da unidade atual (para visão individual)
  const hunterAtual = dados?.hunters?.find(h => h.unidade_id === unidadeId);

  // Handler para registrar penalidade
  const handleRegistrarPenalidade = async () => {
    if (!formPenalidade.unidade_id || !formPenalidade.tipo) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const resultado = await registrarPenalidade(
        formPenalidade.unidade_id,
        formPenalidade.tipo,
        formPenalidade.descricao,
        formPenalidade.pontos,
        formPenalidade.data,
        usuario?.nome || 'Líder Comercial'
      );

      if (resultado.success) {
        toast.success('Penalidade registrada com sucesso!');
        setModalPenalidadeOpen(false);
        setFormPenalidade({
          unidade_id: '',
          tipo: '',
          descricao: '',
          pontos: 0,
          data: new Date(),
        });
      } else {
        toast.error(resultado.error || 'Erro ao registrar penalidade');
      }
    } finally {
      setSaving(false);
    }
  };

  // Handler para deletar penalidade
  const handleDeletarPenalidade = async () => {
    if (!deletePenalidadeId) return;

    setSaving(true);
    try {
      const resultado = await deletarPenalidade(deletePenalidadeId);
      if (resultado.success) {
        toast.success('Penalidade removida!');
      } else {
        toast.error(resultado.error || 'Erro ao remover penalidade');
      }
    } finally {
      setSaving(false);
      setDeletePenalidadeId(null);
    }
  };

  // Atualizar pontos quando tipo de penalidade muda
  const handleTipoPenalidadeChange = (tipo: string) => {
    const tipoPenalidade = TIPOS_PENALIDADE.find(t => t.value === tipo);
    setFormPenalidade(prev => ({
      ...prev,
      tipo,
      pontos: tipoPenalidade?.pontos || 0,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="w-12 h-12 text-red-400" />
        <p className="text-red-400">{error}</p>
        <Button onClick={recarregar} variant="outline">
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-400">Nenhum dado disponível</p>
      </div>
    );
  }

  const { config, hunters, penalidades } = dados;

  // ═══════════════════════════════════════════════════════════════
  // VISÃO ADMIN (CONSOLIDADO) - RANKING
  // ═══════════════════════════════════════════════════════════════
  if (isSuperAdmin) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-400" />
              Programa Matriculador+ LA {ano}
            </h2>
            <p className="text-slate-400 mt-1">
              Competição anual de Janeiro a Novembro • Prêmio: Viagem com acompanhante ✈️
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalPenalidadeOpen(true)}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Registrar Penalidade
            </Button>
          </div>
        </div>

        {/* Abas internas */}
        <div className="flex gap-2 border-b border-slate-700 pb-2">
          {ABAS_CONFIG.map(aba => {
            const Icon = aba.icon;
            const isActive = abaInterna === aba.id;
            const bgColor = aba.id === 'ranking' ? 'bg-emerald-600' : aba.id === 'penalidades' ? 'bg-red-600' : 'bg-slate-600';
            
            return (
              <button
                key={aba.id}
                onClick={() => setAbaInterna(aba.id)}
                className={cn(
                  "px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-2",
                  isActive 
                    ? `${bgColor} text-white` 
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                )}
              >
                <Icon size={16} />
                {aba.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo da aba */}
        {abaInterna === 'ranking' && (
          <>
            {/* Cards de Ranking (Pódio) */}
            <div className="grid grid-cols-3 gap-4">
              {hunters.slice(0, 3).map((hunter) => {
                const cores = POSICAO_CORES[hunter.posicao as 1 | 2 | 3] || POSICAO_CORES[3];
                return (
                  <div
                    key={hunter.unidade_id}
                    className={cn(
                      "bg-gradient-to-br rounded-2xl p-6 relative border-2",
                      cores.bg,
                      cores.border
                    )}
                  >
                    <div className={cn(
                      "absolute -top-3 -right-3 font-bold px-3 py-1 rounded-full text-sm",
                      hunter.posicao === 1 ? "bg-yellow-500 text-black" :
                      hunter.posicao === 2 ? "bg-slate-400 text-black" :
                      "bg-orange-600 text-white"
                    )}>
                      {cores.icon} {hunter.posicao}º Lugar
                    </div>
                    
                    <div className="flex items-center gap-4 mb-4">
                      <div className={cn(
                        "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold",
                        hunter.posicao === 1 ? "bg-yellow-500/20 text-yellow-400" :
                        hunter.posicao === 2 ? "bg-slate-500/20 text-slate-300" :
                        "bg-orange-500/20 text-orange-400"
                      )}>
                        {hunter.hunter_nome?.charAt(0) || 'H'}
                      </div>
                      <div>
                        <h3 className={cn("text-xl font-bold", cores.text)}>
                          {hunter.hunter_nome}
                        </h3>
                        <p className="text-slate-400 text-sm">{hunter.unidade_nome}</p>
                      </div>
                    </div>

                    <div className="text-center mb-4">
                      <span className={cn("text-5xl font-bold", cores.text)}>
                        {hunter.pontuacao?.total || 0}
                      </span>
                      <span className="text-slate-400 text-lg"> pontos</span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Taxa Geral</span>
                        <span className={hunter.metricas.taxa_geral >= config.metas.taxa_lead_matricula ? "text-emerald-400" : "text-red-400"}>
                          {hunter.metricas.taxa_geral.toFixed(1)}% {hunter.metricas.taxa_geral >= config.metas.taxa_lead_matricula ? '✓' : '✗'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Média Matrículas</span>
                        <span className="text-slate-300">
                          {hunter.metricas.media_matriculas_mes}/mês
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Ticket Médio</span>
                        <span className="text-slate-300">
                          R$ {hunter.metricas.media_ticket.toFixed(0)}
                        </span>
                      </div>
                      {hunter.penalidades.total_pontos > 0 && (
                        <div className="flex justify-between text-red-400">
                          <span>Penalidades</span>
                          <span>-{hunter.penalidades.total_pontos} pts</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tabela Comparativa Detalhada */}
            <div className="bg-slate-900 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                Comparativo Detalhado - Médias Anuais (Jan-Nov {ano})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-3">Métrica</th>
                      <th className="text-center py-3">Meta</th>
                      {hunters.map(h => (
                        <th key={h.unidade_id} className="text-center py-3">
                          {h.hunter_nome} ({h.unidade_nome?.substring(0, 3).toUpperCase()})
                        </th>
                      ))}
                      <th className="text-center py-3">Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Taxa Show-up → Experimental</td>
                      <td className="text-center text-slate-400">{config.metas.taxa_showup_experimental}%</td>
                      {hunters.map(h => (
                        <td key={h.unidade_id} className={cn(
                          "text-center",
                          h.metricas.taxa_showup_exp >= config.metas.taxa_showup_experimental 
                            ? "text-emerald-400" : "text-red-400"
                        )}>
                          {h.metricas.taxa_showup_exp.toFixed(1)}% 
                          {h.metricas.taxa_showup_exp >= config.metas.taxa_showup_experimental ? ' ✓' : ' ✗'}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config.pontuacao.taxa_showup} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Taxa Experimental → Matrícula</td>
                      <td className="text-center text-slate-400">{config.metas.taxa_experimental_matricula}%</td>
                      {hunters.map(h => (
                        <td key={h.unidade_id} className={cn(
                          "text-center",
                          h.metricas.taxa_exp_mat >= config.metas.taxa_experimental_matricula 
                            ? "text-emerald-400" : "text-red-400"
                        )}>
                          {h.metricas.taxa_exp_mat.toFixed(1)}% 
                          {h.metricas.taxa_exp_mat >= config.metas.taxa_experimental_matricula ? ' ✓' : ' ✗'}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config.pontuacao.taxa_exp_mat} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Taxa Lead → Matrícula (Geral)</td>
                      <td className="text-center text-slate-400">{config.metas.taxa_lead_matricula}%</td>
                      {hunters.map(h => (
                        <td key={h.unidade_id} className={cn(
                          "text-center font-bold",
                          h.metricas.taxa_geral >= config.metas.taxa_lead_matricula 
                            ? "text-emerald-400" : "text-red-400"
                        )}>
                          {h.metricas.taxa_geral.toFixed(1)}% 
                          {h.metricas.taxa_geral >= config.metas.taxa_lead_matricula ? ' ✓' : ' ✗'}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config.pontuacao.taxa_geral} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Volume Médio Matrículas/Mês</td>
                      <td className="text-center text-slate-400">
                        {config.metas.volume_campo_grande} / {config.metas.volume_recreio} / {config.metas.volume_barra}
                      </td>
                      {hunters.map(h => (
                        <td key={h.unidade_id} className="text-center text-slate-300">
                          {h.metricas.media_matriculas_mes}/mês
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config.pontuacao.volume_medio} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800">
                      <td className="py-3 font-medium">Ticket Médio Anual</td>
                      <td className="text-center text-slate-400">
                        R${config.metas.ticket_campo_grande} / R${config.metas.ticket_recreio} / R${config.metas.ticket_barra}
                      </td>
                      {hunters.map(h => (
                        <td key={h.unidade_id} className="text-center text-slate-300">
                          R$ {h.metricas.media_ticket.toFixed(0)}
                        </td>
                      ))}
                      <td className="text-center text-slate-400">{config.pontuacao.ticket_medio} pts</td>
                    </tr>
                    <tr className="border-b border-slate-800 bg-red-500/10">
                      <td className="py-3 font-medium text-red-400">Penalidades Emusys</td>
                      <td className="text-center text-slate-400">-</td>
                      {hunters.map(h => (
                        <td key={h.unidade_id} className="text-center text-red-400">
                          -{h.penalidades.total_pontos} pts
                        </td>
                      ))}
                      <td className="text-center text-red-400">Desconto</td>
                    </tr>
                    <tr className="bg-slate-800/50 font-bold">
                      <td className="py-3">TOTAL DE PONTOS</td>
                      <td className="text-center">100 pts</td>
                      {hunters.map(h => (
                        <td key={h.unidade_id} className={cn(
                          "text-center",
                          h.posicao === 1 ? "text-yellow-400" :
                          h.posicao === 2 ? "text-slate-300" :
                          "text-orange-400"
                        )}>
                          {h.pontuacao?.total || 0} pts {POSICAO_CORES[h.posicao as 1 | 2 | 3]?.icon}
                        </td>
                      ))}
                      <td className="text-center">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Nota de Corte */}
            {hunters.some(h => !h.acima_corte) && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                  <div>
                    <p className="font-medium text-amber-400">Nota de Corte: {config.nota_corte} pontos</p>
                    <p className="text-sm text-slate-400">
                      Hunters abaixo de {config.nota_corte} pontos não participam da premiação final.
                      {hunters.filter(h => !h.acima_corte).map(h => ` ${h.hunter_nome}`).join(',')} 
                      {hunters.filter(h => !h.acima_corte).length === 1 ? ' está' : ' estão'} abaixo do corte!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {abaInterna === 'penalidades' && (
          <div className="space-y-6">
            {/* Resumo por Hunter */}
            <div className="grid grid-cols-3 gap-4">
              {hunters.map(hunter => (
                <div key={hunter.unidade_id} className="bg-slate-900 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                        hunter.posicao === 1 ? "bg-yellow-500/20 text-yellow-400" :
                        hunter.posicao === 2 ? "bg-slate-500/20 text-slate-300" :
                        "bg-orange-500/20 text-orange-400"
                      )}>
                        {hunter.hunter_nome?.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-medium text-white">{hunter.hunter_nome}</h4>
                        <p className="text-xs text-slate-400">{hunter.unidade_nome}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-bold text-red-400">
                        -{hunter.penalidades.total_pontos}
                      </span>
                      <span className="text-xs text-slate-400 block">pts</span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-400">
                    {hunter.penalidades.quantidade} penalidade{hunter.penalidades.quantidade !== 1 ? 's' : ''} este ano
                  </div>
                </div>
              ))}
            </div>

            {/* Histórico de Penalidades */}
            <div className="bg-slate-900 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Histórico de Penalidades - {ano}</h3>
              {penalidades.length === 0 ? (
                <p className="text-slate-400 text-center py-8">Nenhuma penalidade registrada</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-3">Data</th>
                      <th className="text-left py-3">Hunter</th>
                      <th className="text-left py-3">Tipo</th>
                      <th className="text-left py-3">Descrição</th>
                      <th className="text-center py-3">Pontos</th>
                      <th className="text-left py-3">Registrado por</th>
                      <th className="text-center py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {penalidades.map(p => (
                      <tr key={p.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        {/* Data - Edição inline com DatePicker */}
                        <td className="py-2 px-1">
                          <CelulaEditavelInline
                            value={p.data_ocorrencia}
                            onChange={async (valor) => {
                              await atualizarPenalidade(p.id, 'data_ocorrencia', valor);
                            }}
                            tipo="data"
                            placeholder="-"
                          />
                        </td>
                        {/* Hunter - Edição inline */}
                        <td className="py-2 px-1">
                          <CelulaEditavelInline
                            value={p.unidade_id}
                            onChange={async (valor) => {
                              await atualizarPenalidade(p.id, 'unidade_id', valor);
                            }}
                            tipo="select"
                            opcoes={hunters.map(h => ({ value: h.unidade_id, label: h.hunter_nome }))}
                            placeholder="-"
                            className="min-w-[120px]"
                          />
                        </td>
                        {/* Tipo - Edição inline */}
                        <td className="py-2 px-1">
                          <CelulaEditavelInline
                            value={p.tipo}
                            onChange={async (valor) => {
                              await atualizarPenalidade(p.id, 'tipo', valor);
                            }}
                            tipo="select"
                            opcoes={TIPOS_PENALIDADE}
                            placeholder="-"
                            className="min-w-[140px]"
                          />
                        </td>
                        {/* Descrição - Edição inline */}
                        <td className="py-2 px-1">
                          <CelulaEditavelInline
                            value={p.descricao}
                            onChange={async (valor) => {
                              await atualizarPenalidade(p.id, 'descricao', valor);
                            }}
                            tipo="texto"
                            placeholder="-"
                            className="min-w-[150px]"
                          />
                        </td>
                        {/* Pontos - Edição inline */}
                        <td className="py-2 px-1 text-center">
                          <CelulaEditavelInline
                            value={p.pontos_descontados}
                            onChange={async (valor) => {
                              await atualizarPenalidade(p.id, 'pontos_descontados', valor);
                            }}
                            tipo="numero"
                            placeholder="0"
                            formatarExibicao={(val) => `-${val}`}
                            className="min-w-[50px] text-red-400 font-bold"
                          />
                        </td>
                        {/* Registrado por - Edição inline */}
                        <td className="py-2 px-1">
                          <CelulaEditavelInline
                            value={p.registrado_por}
                            onChange={async (valor) => {
                              await atualizarPenalidade(p.id, 'registrado_por', valor);
                            }}
                            tipo="texto"
                            placeholder="-"
                            className="min-w-[100px]"
                          />
                        </td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => setDeletePenalidadeId(p.id)}
                            className="text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {abaInterna === 'config' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Configurações do Programa Matriculador+ LA
                </h2>
                <p className="text-slate-400">Edite as metas, pontuações e nota de corte • <span className="text-emerald-400">Salvo automaticamente</span></p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Metas de Conversão */}
              <div className="bg-slate-900 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Metas de Taxa de Conversão</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-400">Taxa Show-up → Experimental</Label>
                    <div className="flex gap-2 mt-1">
                      <ConfigInput value={config.metas.taxa_showup_experimental} campo="meta_taxa_showup_experimental" ano={ano} />
                      <span className="flex items-center text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Taxa Experimental → Matrícula</Label>
                    <div className="flex gap-2 mt-1">
                      <ConfigInput value={config.metas.taxa_experimental_matricula} campo="meta_taxa_experimental_matricula" ano={ano} />
                      <span className="flex items-center text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Taxa Lead → Matrícula (Geral/Desempate)</Label>
                    <div className="flex gap-2 mt-1">
                      <ConfigInput value={config.metas.taxa_lead_matricula} campo="meta_taxa_lead_matricula" ano={ano} />
                      <span className="flex items-center text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Volume Médio por Unidade */}
              <div className="bg-slate-900 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Volume Médio Matrículas/Mês</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-400">Campo Grande (Vitória)</Label>
                    <div className="flex gap-2 mt-1">
                      <ConfigInput value={config.metas.volume_campo_grande} campo="meta_volume_campo_grande" ano={ano} />
                      <span className="flex items-center text-slate-400">matrículas</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Recreio (Clayton)</Label>
                    <div className="flex gap-2 mt-1">
                      <ConfigInput value={config.metas.volume_recreio} campo="meta_volume_recreio" ano={ano} />
                      <span className="flex items-center text-slate-400">matrículas</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Barra (Kailane)</Label>
                    <div className="flex gap-2 mt-1">
                      <ConfigInput value={config.metas.volume_barra} campo="meta_volume_barra" ano={ano} />
                      <span className="flex items-center text-slate-400">matrículas</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ticket Médio por Unidade */}
              <div className="bg-slate-900 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Ticket Médio Anual</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-400">Campo Grande (Vitória)</Label>
                    <div className="flex gap-2 mt-1">
                      <span className="flex items-center text-slate-400">R$</span>
                      <ConfigInput value={config.metas.ticket_campo_grande} campo="meta_ticket_campo_grande" ano={ano} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Recreio (Clayton)</Label>
                    <div className="flex gap-2 mt-1">
                      <span className="flex items-center text-slate-400">R$</span>
                      <ConfigInput value={config.metas.ticket_recreio} campo="meta_ticket_recreio" ano={ano} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Barra (Kailane)</Label>
                    <div className="flex gap-2 mt-1">
                      <span className="flex items-center text-slate-400">R$</span>
                      <ConfigInput value={config.metas.ticket_barra} campo="meta_ticket_barra" ano={ano} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sistema de Pontuação */}
              <div className="bg-slate-900 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Sistema de Pontuação</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-400">Pontos - Taxa Show-up → Exp</Label>
                    <div className="mt-1">
                      <ConfigInput value={config.pontuacao.taxa_showup} campo="pontos_taxa_showup" ano={ano} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Pontos - Taxa Exp → Matrícula</Label>
                    <div className="mt-1">
                      <ConfigInput value={config.pontuacao.taxa_exp_mat} campo="pontos_taxa_exp_mat" ano={ano} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Pontos - Taxa Geral (Desempate)</Label>
                    <div className="mt-1">
                      <ConfigInput value={config.pontuacao.taxa_geral} campo="pontos_taxa_geral" ano={ano} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Pontos - Volume Médio</Label>
                    <div className="mt-1">
                      <ConfigInput value={config.pontuacao.volume_medio} campo="pontos_volume_medio" ano={ano} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Pontos - Ticket Médio</Label>
                    <div className="mt-1">
                      <ConfigInput value={config.pontuacao.ticket_medio} campo="pontos_ticket_medio" ano={ano} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Penalidades Emusys */}
              <div className="bg-slate-900 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Penalidades Emusys</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-400">Não preencheu Emusys</Label>
                    <div className="flex gap-2 mt-1">
                      <span className="flex items-center text-red-400">-</span>
                      <ConfigInput value={config.penalidades?.nao_preencheu_emusys || 3} campo="penalidade_nao_preencheu_emusys" ano={ano} />
                      <span className="flex items-center text-slate-400">pts</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Não preencheu LA Report</Label>
                    <div className="flex gap-2 mt-1">
                      <span className="flex items-center text-red-400">-</span>
                      <ConfigInput value={config.penalidades?.nao_preencheu_lareport || 3} campo="penalidade_nao_preencheu_lareport" ano={ano} />
                      <span className="flex items-center text-slate-400">pts</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Leads abandonados (por lead)</Label>
                    <div className="flex gap-2 mt-1">
                      <span className="flex items-center text-red-400">-</span>
                      <ConfigInput value={config.penalidades?.lead_abandonado || 2} campo="penalidade_lead_abandonado" ano={ano} />
                      <span className="flex items-center text-slate-400">pts</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-400">Reincidência no mês</Label>
                    <div className="flex gap-2 mt-1">
                      <span className="flex items-center text-red-400">-</span>
                      <ConfigInput value={config.penalidades?.reincidencia_mes || 5} campo="penalidade_reincidencia_mes" ano={ano} />
                      <span className="flex items-center text-slate-400">pts</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nota de Corte */}
              <div className="bg-slate-900 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Nota de Corte</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-400">Pontuação mínima para participar</Label>
                    <div className="flex gap-2 mt-1">
                      <ConfigInput value={config.nota_corte} campo="nota_corte" ano={ano} />
                      <span className="flex items-center text-slate-400">pontos</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Hunters abaixo desta pontuação não participam da premiação final</p>
                  </div>
                  <div>
                    <Label className="text-slate-400">Período do Programa</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Select defaultValue={String(config.periodo?.mes_inicio || 1)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Janeiro</SelectItem>
                          <SelectItem value="2">Fevereiro</SelectItem>
                          <SelectItem value="3">Março</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-slate-400">até</span>
                      <Select defaultValue={String(config.periodo?.mes_fim || 11)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">Outubro</SelectItem>
                          <SelectItem value="11">Novembro</SelectItem>
                          <SelectItem value="12">Dezembro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Registrar Penalidade */}
        <Dialog open={modalPenalidadeOpen} onOpenChange={setModalPenalidadeOpen}>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle>Registrar Penalidade Emusys</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Hunter</Label>
                <Select
                  value={formPenalidade.unidade_id}
                  onValueChange={(v) => setFormPenalidade(prev => ({ ...prev, unidade_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o Hunter" />
                  </SelectTrigger>
                  <SelectContent>
                    {hunters.map(h => (
                      <SelectItem key={h.unidade_id} value={h.unidade_id}>
                        {h.hunter_nome} - {h.unidade_nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Penalidade</Label>
                <Select
                  value={formPenalidade.tipo}
                  onValueChange={handleTipoPenalidadeChange}
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
                  value={formPenalidade.pontos}
                  onChange={(e) => setFormPenalidade(prev => ({ ...prev, pontos: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={formPenalidade.descricao}
                  onChange={(e) => setFormPenalidade(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descreva o motivo da penalidade..."
                />
              </div>
              <div>
                <Label>Data</Label>
                <DatePicker
                  date={formPenalidade.data}
                  onDateChange={(d) => d && setFormPenalidade(prev => ({ ...prev, data: d }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalPenalidadeOpen(false)}>
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

        {/* AlertDialog de Confirmar Exclusão */}
        <AlertDialog open={!!deletePenalidadeId} onOpenChange={() => setDeletePenalidadeId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Penalidade?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. A penalidade será removida e os pontos serão restaurados.
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
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // VISÃO HUNTER (INDIVIDUAL)
  // ═══════════════════════════════════════════════════════════════
  if (!hunterAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="w-12 h-12 text-amber-400" />
        <p className="text-slate-400">Dados não encontrados para esta unidade</p>
      </div>
    );
  }

  const metaVolume = 
    hunterAtual.unidade_nome?.toLowerCase().includes('campo') ? config.metas.volume_campo_grande :
    hunterAtual.unidade_nome?.toLowerCase().includes('recreio') ? config.metas.volume_recreio :
    config.metas.volume_barra;

  const metaTicket = 
    hunterAtual.unidade_nome?.toLowerCase().includes('campo') ? config.metas.ticket_campo_grande :
    hunterAtual.unidade_nome?.toLowerCase().includes('recreio') ? config.metas.ticket_recreio :
    config.metas.ticket_barra;

  return (
    <div className="space-y-6">
      {/* Header do Hunter */}
      <div className={cn(
        "bg-gradient-to-r rounded-2xl p-6 border",
        hunterAtual.acima_corte 
          ? "from-emerald-900/30 to-emerald-600/10 border-emerald-500/30"
          : "from-amber-900/30 to-amber-600/10 border-amber-500/30"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold",
              hunterAtual.acima_corte ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
            )}>
              {hunterAtual.hunter_nome?.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                Olá, {hunterAtual.hunter_apelido}! 🚀
              </h2>
              <p className="text-slate-400">
                {hunterAtual.unidade_nome} • Programa Matriculador+ LA {ano}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className={cn(
              "text-5xl font-bold",
              hunterAtual.acima_corte ? "text-emerald-400" : "text-amber-400"
            )}>
              {hunterAtual.pontuacao?.total || 0}
            </div>
            <div className="text-slate-400">pontos</div>
            <div className={cn(
              "text-sm mt-1",
              hunterAtual.acima_corte ? "text-emerald-400" : "text-amber-400"
            )}>
              {hunterAtual.acima_corte 
                ? `✓ Acima do corte (${config.nota_corte})` 
                : `⚠ Abaixo do corte (${config.nota_corte})`}
            </div>
          </div>
        </div>
      </div>

      {/* Progresso das Metas */}
      <div className="grid grid-cols-2 gap-4">
        {/* Taxa Show-up → Experimental */}
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-medium">Taxa Show-up → Experimental</h4>
              <p className="text-sm text-slate-400">Meta: {config.metas.taxa_showup_experimental}%</p>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-2xl font-bold",
                hunterAtual.metricas.taxa_showup_exp >= config.metas.taxa_showup_experimental 
                  ? "text-emerald-400" : "text-red-400"
              )}>
                {hunterAtual.metricas.taxa_showup_exp.toFixed(1)}%
              </span>
              <span className={cn(
                "text-sm block",
                hunterAtual.pontuacao?.taxa_showup ? "text-emerald-400" : "text-slate-400"
              )}>
                {hunterAtual.pontuacao?.taxa_showup ? `+${hunterAtual.pontuacao.taxa_showup} pts ✓` : '0 pts'}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div 
              className={cn(
                "h-3 rounded-full transition-all",
                hunterAtual.metricas.taxa_showup_exp >= config.metas.taxa_showup_experimental 
                  ? "bg-emerald-500" : "bg-amber-500"
              )}
              style={{ 
                width: `${Math.min(100, (hunterAtual.metricas.taxa_showup_exp / config.metas.taxa_showup_experimental) * 100)}%` 
              }}
            />
          </div>
        </div>

        {/* Taxa Experimental → Matrícula */}
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-medium">Taxa Experimental → Matrícula</h4>
              <p className="text-sm text-slate-400">Meta: {config.metas.taxa_experimental_matricula}%</p>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-2xl font-bold",
                hunterAtual.metricas.taxa_exp_mat >= config.metas.taxa_experimental_matricula 
                  ? "text-emerald-400" : "text-red-400"
              )}>
                {hunterAtual.metricas.taxa_exp_mat.toFixed(1)}%
              </span>
              <span className={cn(
                "text-sm block",
                hunterAtual.pontuacao?.taxa_exp_mat ? "text-emerald-400" : "text-slate-400"
              )}>
                {hunterAtual.pontuacao?.taxa_exp_mat ? `+${hunterAtual.pontuacao.taxa_exp_mat} pts ✓` : '0 pts'}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div 
              className={cn(
                "h-3 rounded-full transition-all",
                hunterAtual.metricas.taxa_exp_mat >= config.metas.taxa_experimental_matricula 
                  ? "bg-emerald-500" : "bg-amber-500"
              )}
              style={{ 
                width: `${Math.min(100, (hunterAtual.metricas.taxa_exp_mat / config.metas.taxa_experimental_matricula) * 100)}%` 
              }}
            />
          </div>
        </div>

        {/* Taxa Lead → Matrícula (Geral) - DESTAQUE */}
        <div className="bg-slate-900 rounded-xl p-5 border border-yellow-500/30">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-medium">Taxa Lead → Matrícula (Geral)</h4>
              <p className="text-sm text-yellow-400">Meta: {config.metas.taxa_lead_matricula}% • Critério de desempate!</p>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-2xl font-bold",
                hunterAtual.metricas.taxa_geral >= config.metas.taxa_lead_matricula 
                  ? "text-emerald-400" : "text-red-400"
              )}>
                {hunterAtual.metricas.taxa_geral.toFixed(1)}%
              </span>
              <span className={cn(
                "text-sm block",
                hunterAtual.pontuacao?.taxa_geral ? "text-emerald-400" : "text-slate-400"
              )}>
                {hunterAtual.pontuacao?.taxa_geral ? `+${hunterAtual.pontuacao.taxa_geral} pts ✓` : '0 pts'}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div 
              className={cn(
                "h-3 rounded-full transition-all",
                hunterAtual.metricas.taxa_geral >= config.metas.taxa_lead_matricula 
                  ? "bg-emerald-500" : "bg-amber-500"
              )}
              style={{ 
                width: `${Math.min(100, (hunterAtual.metricas.taxa_geral / config.metas.taxa_lead_matricula) * 100)}%` 
              }}
            />
          </div>
          <p className="text-xs text-yellow-400 mt-2">⭐ Esta é a métrica de desempate!</p>
        </div>

        {/* Volume Médio Matrículas/Mês */}
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-medium">Volume Médio Matrículas/Mês</h4>
              <p className="text-sm text-slate-400">Meta: {metaVolume} matrículas/mês</p>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-2xl font-bold",
                hunterAtual.metricas.media_matriculas_mes >= metaVolume 
                  ? "text-emerald-400" : "text-red-400"
              )}>
                {hunterAtual.metricas.media_matriculas_mes}
              </span>
              <span className={cn(
                "text-sm block",
                hunterAtual.pontuacao?.volume ? "text-emerald-400" : "text-slate-400"
              )}>
                {hunterAtual.pontuacao?.volume ? `+${hunterAtual.pontuacao.volume} pts ✓` : '0 pts'}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div 
              className={cn(
                "h-3 rounded-full transition-all",
                hunterAtual.metricas.media_matriculas_mes >= metaVolume 
                  ? "bg-emerald-500" : "bg-amber-500"
              )}
              style={{ 
                width: `${Math.min(100, (hunterAtual.metricas.media_matriculas_mes / metaVolume) * 100)}%` 
              }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Média de Jan-{new Date().toLocaleString('pt-BR', { month: 'short' })}: {hunterAtual.metricas.total_matriculas} matrículas / {hunterAtual.metricas.meses_com_dados || 1} meses
          </p>
        </div>

        {/* Ticket Médio Anual */}
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-medium">Ticket Médio Anual</h4>
              <p className="text-sm text-slate-400">Meta: R$ {metaTicket}</p>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-2xl font-bold",
                hunterAtual.metricas.media_ticket >= metaTicket 
                  ? "text-emerald-400" : "text-red-400"
              )}>
                R$ {hunterAtual.metricas.media_ticket.toFixed(0)}
              </span>
              <span className={cn(
                "text-sm block",
                hunterAtual.pontuacao?.ticket ? "text-emerald-400" : "text-slate-400"
              )}>
                {hunterAtual.pontuacao?.ticket ? `+${hunterAtual.pontuacao.ticket} pts ✓` : '0 pts'}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div 
              className={cn(
                "h-3 rounded-full transition-all",
                hunterAtual.metricas.media_ticket >= metaTicket 
                  ? "bg-emerald-500" : "bg-amber-500"
              )}
              style={{ 
                width: `${Math.min(100, (hunterAtual.metricas.media_ticket / metaTicket) * 100)}%` 
              }}
            />
          </div>
        </div>

        {/* Penalidades Emusys */}
        <div className={cn(
          "bg-slate-900 rounded-xl p-5",
          hunterAtual.penalidades.total_pontos > 0 && "border border-red-500/30"
        )}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-medium text-red-400">Penalidades Emusys</h4>
              <p className="text-sm text-slate-400">Avaliação da líder comercial</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-red-400">
                -{hunterAtual.penalidades.total_pontos}
              </span>
              <span className="text-red-400 text-sm block">pts descontados</span>
            </div>
          </div>
          {hunterAtual.penalidades.quantidade > 0 ? (
            <div className="text-sm text-slate-400">
              {hunterAtual.penalidades.quantidade} penalidade{hunterAtual.penalidades.quantidade !== 1 ? 's' : ''} registrada{hunterAtual.penalidades.quantidade !== 1 ? 's' : ''}
            </div>
          ) : (
            <div className="text-sm text-emerald-400">✓ Nenhuma penalidade!</div>
          )}
        </div>
      </div>

      {/* Histórico Mensal - sempre exibe, mesmo sem dados */}
      <HistoricoMensal 
        historico={historico?.historico?.filter(h => h.unidade_id === unidadeId) || []}
        mediaGrupo={historico?.media_grupo || { taxa_geral: 0, volume_medio: 0, ticket_medio: 0 }}
        config={config}
        metaVolume={metaVolume}
        metaTicket={metaTicket}
      />

      {/* Mensagem Motivacional */}
      <div className={cn(
        "rounded-xl p-6 border",
        hunterAtual.acima_corte
          ? "bg-gradient-to-r from-emerald-900/20 to-emerald-600/10 border-emerald-500/30"
          : "bg-gradient-to-r from-cyan-900/20 to-cyan-600/10 border-cyan-500/30"
      )}>
        <div className="flex items-center gap-4">
          <Plane className={cn("w-10 h-10", hunterAtual.acima_corte ? "text-emerald-400" : "text-cyan-400")} />
          <div>
            <h4 className={cn(
              "font-bold text-lg",
              hunterAtual.acima_corte ? "text-emerald-400" : "text-cyan-400"
            )}>
              {hunterAtual.acima_corte
                ? `Mandando bem, ${hunterAtual.hunter_apelido}!`
                : `Foco total, ${hunterAtual.hunter_apelido}!`}
            </h4>
            <p className="text-slate-300">
              {hunterAtual.acima_corte
                ? `Você está com ${hunterAtual.pontuacao?.total} pontos, acima do corte! Continue assim para garantir a viagem!`
                : `Você está com ${hunterAtual.pontuacao?.total || 0} pontos. Precisa de mais ${config.nota_corte - (hunterAtual.pontuacao?.total || 0)} pontos para ficar acima do corte. A viagem com acompanhante pode ser sua! Bora melhorar essas métricas!`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE DE HISTÓRICO MENSAL
// ═══════════════════════════════════════════════════════════════
interface HistoricoMensalProps {
  historico: Array<{
    mes: number;
    unidade_id: string;
    unidade_nome: string;
    total_leads: number;
    total_experimentais: number;
    total_matriculas: number;
    ticket_medio: number;
    taxa_showup: number;
    taxa_exp_mat: number;
    taxa_geral: number;
  }>;
  mediaGrupo: {
    taxa_geral: number;
    volume_medio: number;
    ticket_medio: number;
  };
  config: any;
  metaVolume: number;
  metaTicket: number;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov'];
const MESES_COMPLETO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro'];

function HistoricoMensal({ historico, mediaGrupo, config, metaVolume, metaTicket }: HistoricoMensalProps) {
  const [viewMode, setViewMode] = useState<'tabela' | 'grafico'>('grafico');
  
  // Calcular médias anuais
  const mediasAnuais = {
    leads: historico.length > 0 ? Math.round(historico.reduce((acc, h) => acc + h.total_leads, 0) / historico.length) : 0,
    experimentais: historico.length > 0 ? Math.round(historico.reduce((acc, h) => acc + h.total_experimentais, 0) / historico.length) : 0,
    matriculas: historico.length > 0 ? (historico.reduce((acc, h) => acc + h.total_matriculas, 0) / historico.length).toFixed(1) : 0,
    taxa_showup: historico.length > 0 ? (historico.reduce((acc, h) => acc + h.taxa_showup, 0) / historico.length).toFixed(1) : 0,
    taxa_exp_mat: historico.length > 0 ? (historico.reduce((acc, h) => acc + h.taxa_exp_mat, 0) / historico.length).toFixed(1) : 0,
    taxa_geral: historico.length > 0 ? (historico.reduce((acc, h) => acc + h.taxa_geral, 0) / historico.length).toFixed(1) : 0,
    ticket_medio: historico.length > 0 ? Math.round(historico.filter(h => h.ticket_medio).reduce((acc, h) => acc + (h.ticket_medio || 0), 0) / historico.filter(h => h.ticket_medio).length) || 0 : 0,
  };

  // Calcular volume médio mensal
  const volumeMedio = historico.length > 0 
    ? historico.reduce((acc, h) => acc + h.total_matriculas, 0) / historico.length 
    : 0;

  // Calcular ticket médio
  const ticketMedio = historico.filter(h => h.ticket_medio).length > 0
    ? historico.filter(h => h.ticket_medio).reduce((acc, h) => acc + (h.ticket_medio || 0), 0) / historico.filter(h => h.ticket_medio).length
    : 0;

  // Calcular taxa geral média
  const taxaGeralMedia = historico.length > 0
    ? historico.reduce((acc, h) => acc + h.taxa_geral, 0) / historico.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Histórico Mensal */}
      <div className="bg-slate-900 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Histórico Mensal - 2026
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('tabela')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                viewMode === 'tabela' ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              )}
            >
              Tabela
            </button>
            <button
              onClick={() => setViewMode('grafico')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                viewMode === 'grafico' ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              )}
            >
              Gráfico
            </button>
          </div>
        </div>

        {viewMode === 'grafico' && (
          <div className="mb-6">
            <p className="text-sm text-slate-400 mb-4">Evolução da Taxa Geral (Lead → Matrícula) - Critério de Desempate</p>
            <div className="relative">
              {/* Linha da meta */}
              <div className="absolute w-full border-t-2 border-dashed border-yellow-500/50" style={{ bottom: `${(config.metas.taxa_lead_matricula / 20) * 100}%` }}>
                <span className="absolute text-xs text-yellow-400 bg-slate-900 px-1 right-0 -top-3">Meta: {config.metas.taxa_lead_matricula}%</span>
              </div>
              
              <div className="flex items-end gap-2 h-40">
                {MESES.map((mes, idx) => {
                  const dadosMes = historico.find(h => h.mes === idx + 1);
                  const taxa = dadosMes?.taxa_geral || 0;
                  const temDados = dadosMes && dadosMes.total_leads > 0;
                  const atingiuMeta = taxa >= config.metas.taxa_lead_matricula;
                  
                  return (
                    <div key={mes} className={cn("flex-1 flex flex-col items-center", !temDados && "opacity-30")}>
                      <div 
                        className={cn(
                          "w-full rounded-t transition-all",
                          temDados 
                            ? atingiuMeta ? "bg-emerald-500/80" : taxa >= config.metas.taxa_lead_matricula * 0.9 ? "bg-amber-500/80" : "bg-red-500/80"
                            : "bg-slate-600"
                        )}
                        style={{ height: temDados ? `${Math.max(10, (taxa / 20) * 100)}%` : '10%' }}
                      />
                      <span className="text-xs text-slate-400 mt-2">{mes}</span>
                      <span className={cn(
                        "text-xs",
                        temDados 
                          ? atingiuMeta ? "text-emerald-400" : "text-red-400"
                          : "text-slate-500"
                      )}>
                        {temDados ? `${taxa}%` : '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'tabela' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-3">Mês</th>
                  <th className="text-center py-3">Leads</th>
                  <th className="text-center py-3">Exp.</th>
                  <th className="text-center py-3">Mat.</th>
                  <th className="text-center py-3">Taxa Showup</th>
                  <th className="text-center py-3">Taxa Exp→Mat</th>
                  <th className="text-center py-3 bg-yellow-500/10">Taxa Geral</th>
                  <th className="text-center py-3">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h, idx) => {
                  const isAtual = idx === historico.length - 1;
                  return (
                    <tr key={h.mes} className={cn("border-b border-slate-800", isAtual && "bg-cyan-500/5")}>
                      <td className={cn("py-3 font-medium", isAtual && "text-cyan-400")}>
                        {MESES_COMPLETO[h.mes - 1]} {isAtual && '(atual)'}
                      </td>
                      <td className={cn("text-center", isAtual && "text-cyan-400")}>{h.total_leads}</td>
                      <td className={cn("text-center", isAtual && "text-cyan-400")}>{h.total_experimentais}</td>
                      <td className={cn("text-center", isAtual && "text-cyan-400")}>{h.total_matriculas}</td>
                      <td className={cn("text-center", h.taxa_showup >= config.metas.taxa_showup_experimental ? "text-emerald-400" : "text-red-400")}>
                        {h.taxa_showup}% {h.taxa_showup >= config.metas.taxa_showup_experimental ? <Check className="inline w-3 h-3" /> : <X className="inline w-3 h-3" />}
                      </td>
                      <td className={cn("text-center", h.taxa_exp_mat >= config.metas.taxa_experimental_matricula ? "text-emerald-400" : "text-red-400")}>
                        {h.taxa_exp_mat}% {h.taxa_exp_mat >= config.metas.taxa_experimental_matricula ? <Check className="inline w-3 h-3" /> : <X className="inline w-3 h-3" />}
                      </td>
                      <td className={cn("text-center bg-yellow-500/10 font-bold", h.taxa_geral >= config.metas.taxa_lead_matricula ? "text-emerald-400" : "text-red-400")}>
                        {h.taxa_geral}% {h.taxa_geral >= config.metas.taxa_lead_matricula ? <Check className="inline w-3 h-3" /> : <X className="inline w-3 h-3" />}
                      </td>
                      <td className={cn("text-center", isAtual && "text-cyan-400")}>
                        {h.ticket_medio ? `R$ ${h.ticket_medio}` : '-'}
                      </td>
                    </tr>
                  );
                })}
                {/* Linha de média */}
                <tr className="bg-slate-800/50 font-bold">
                  <td className="py-3">MÉDIA ANUAL</td>
                  <td className="text-center">{mediasAnuais.leads}</td>
                  <td className="text-center">{mediasAnuais.experimentais}</td>
                  <td className="text-center">{mediasAnuais.matriculas}</td>
                  <td className={cn("text-center", Number(mediasAnuais.taxa_showup) >= config.metas.taxa_showup_experimental ? "text-emerald-400" : "text-red-400")}>
                    {mediasAnuais.taxa_showup}%
                  </td>
                  <td className={cn("text-center", Number(mediasAnuais.taxa_exp_mat) >= config.metas.taxa_experimental_matricula ? "text-emerald-400" : "text-red-400")}>
                    {mediasAnuais.taxa_exp_mat}%
                  </td>
                  <td className={cn("text-center bg-yellow-500/10", Number(mediasAnuais.taxa_geral) >= config.metas.taxa_lead_matricula ? "text-emerald-400" : "text-red-400")}>
                    {mediasAnuais.taxa_geral}%
                  </td>
                  <td className="text-center">R$ {mediasAnuais.ticket_medio}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Evolução Mensal - Cards de Matrículas */}
      <div className="bg-slate-900 rounded-2xl p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Evolução Mensal - 2026
        </h3>
        <div className="grid grid-cols-11 gap-2 text-center text-sm">
          {MESES.map((mes, idx) => {
            const dadosMes = historico.find(h => h.mes === idx + 1);
            const temDados = dadosMes && dadosMes.total_matriculas > 0;
            const matriculas = dadosMes?.total_matriculas || 0;
            
            return (
              <div 
                key={mes} 
                className={cn(
                  "rounded-lg p-3",
                  temDados ? "bg-emerald-500/20" : "bg-slate-700/50"
                )}
              >
                <div className={cn("font-bold", temDados ? "text-emerald-400" : "text-slate-500")}>
                  {mes}
                </div>
                <div className={cn("text-lg font-bold", temDados ? "text-white" : "text-slate-500")}>
                  {temDados ? matriculas : '-'}
                </div>
                <div className={cn("text-xs", temDados ? "text-slate-400" : "text-slate-500")}>
                  {temDados ? 'matrículas' : 'pendente'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparativo com Média do Grupo */}
      <div className="bg-slate-900 rounded-2xl p-6">
        <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
          <Target className="w-5 h-5" />
          Suas Metas vs Média do Grupo
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Compare seu desempenho com a média dos Hunters (sem revelar posições individuais)
        </p>
        <div className="grid grid-cols-3 gap-4">
          {/* Taxa Geral */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm text-slate-400 mb-3">Taxa Geral (Desempate)</div>
            <div className="flex items-end gap-3 h-24">
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Você</div>
                <div 
                  className={cn("w-full rounded-t flex items-end justify-center pb-2", taxaGeralMedia >= config.metas.taxa_lead_matricula ? "bg-emerald-500" : "bg-red-500")}
                  style={{ height: `${Math.min(100, (taxaGeralMedia / 20) * 100)}%` }}
                >
                  <span className="text-white font-bold text-sm">{taxaGeralMedia.toFixed(1)}%</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Média</div>
                <div 
                  className="w-full bg-slate-600 rounded-t flex items-end justify-center pb-2"
                  style={{ height: `${Math.min(100, (mediaGrupo.taxa_geral / 20) * 100)}%` }}
                >
                  <span className="text-slate-300 font-bold text-sm">{mediaGrupo.taxa_geral}%</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Meta</div>
                <div 
                  className="w-full bg-yellow-500/50 rounded-t flex items-end justify-center pb-2"
                  style={{ height: `${Math.min(100, (config.metas.taxa_lead_matricula / 20) * 100)}%` }}
                >
                  <span className="text-yellow-300 font-bold text-sm">{config.metas.taxa_lead_matricula}%</span>
                </div>
              </div>
            </div>
            <div className={cn("text-center mt-2 text-sm", taxaGeralMedia >= mediaGrupo.taxa_geral ? "text-emerald-400" : "text-amber-400")}>
              {taxaGeralMedia >= mediaGrupo.taxa_geral 
                ? `+${(taxaGeralMedia - mediaGrupo.taxa_geral).toFixed(1)}% acima da média!`
                : `${(mediaGrupo.taxa_geral - taxaGeralMedia).toFixed(1)}% abaixo da média`}
            </div>
          </div>

          {/* Volume Médio */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm text-slate-400 mb-3">Volume Médio/Mês</div>
            <div className="flex items-end gap-3 h-24">
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Você</div>
                <div 
                  className={cn("w-full rounded-t flex items-end justify-center pb-2", volumeMedio >= metaVolume ? "bg-emerald-500" : "bg-red-500")}
                  style={{ height: `${Math.min(100, (volumeMedio / metaVolume) * 80)}%` }}
                >
                  <span className="text-white font-bold text-sm">{volumeMedio.toFixed(1)}</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Média</div>
                <div 
                  className="w-full bg-slate-600 rounded-t flex items-end justify-center pb-2"
                  style={{ height: `${Math.min(100, (mediaGrupo.volume_medio / metaVolume) * 80)}%` }}
                >
                  <span className="text-slate-300 font-bold text-sm">{mediaGrupo.volume_medio}</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Meta</div>
                <div 
                  className="w-full bg-yellow-500/50 rounded-t flex items-end justify-center pb-2"
                  style={{ height: '100%' }}
                >
                  <span className="text-yellow-300 font-bold text-sm">{metaVolume}</span>
                </div>
              </div>
            </div>
            <div className={cn("text-center mt-2 text-sm", volumeMedio >= metaVolume ? "text-emerald-400" : "text-amber-400")}>
              {volumeMedio >= metaVolume 
                ? `Meta batida!`
                : `Faltam ${(metaVolume - volumeMedio).toFixed(1)} para bater a meta!`}
            </div>
          </div>

          {/* Ticket Médio */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="text-sm text-slate-400 mb-3">Ticket Médio</div>
            <div className="flex items-end gap-3 h-24">
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Você</div>
                <div 
                  className={cn("w-full rounded-t flex items-end justify-center pb-2", ticketMedio >= metaTicket ? "bg-emerald-500" : "bg-red-500")}
                  style={{ height: `${Math.min(100, (ticketMedio / metaTicket) * 80)}%` }}
                >
                  <span className="text-white font-bold text-xs">R${Math.round(ticketMedio)}</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Média</div>
                <div 
                  className="w-full bg-slate-600 rounded-t flex items-end justify-center pb-2"
                  style={{ height: `${Math.min(100, (mediaGrupo.ticket_medio / metaTicket) * 80)}%` }}
                >
                  <span className="text-slate-300 font-bold text-xs">R${mediaGrupo.ticket_medio}</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">Meta</div>
                <div 
                  className="w-full bg-yellow-500/50 rounded-t flex items-end justify-center pb-2"
                  style={{ height: '100%' }}
                >
                  <span className="text-yellow-300 font-bold text-xs">R${metaTicket}</span>
                </div>
              </div>
            </div>
            <div className={cn("text-center mt-2 text-sm", ticketMedio >= metaTicket ? "text-emerald-400" : "text-amber-400")}>
              {ticketMedio >= metaTicket 
                ? `+R$${Math.round(ticketMedio - metaTicket)} acima da meta!`
                : `Faltam R$${Math.round(metaTicket - ticketMedio)} para a meta`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
