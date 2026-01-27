import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  Target, RefreshCw, Users, TrendingUp, TrendingDown, DollarSign, 
  Percent, Clock, BarChart3, ShoppingCart, UserCheck, Star,
  AlertCircle, LucideIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { MetaInput, FormatoMeta } from '@/components/ui/MetaInput';
import { SimuladorPage } from './Simulador/SimuladorPage';
import { SimuladorTurmaPage } from './SimuladorTurma';

// Interface do contexto do layout
interface OutletContextType {
  filtroAtivo: string | null;
  unidadeSelecionada: string | null;
  competencia: {
    ano: number;
    mes: number;
    range: { label: string };
  };
}

interface Meta {
  id?: number;
  ano: number;
  mes: number;
  unidade_id: string;
  tipo: string;
  valor: number;
}

// Tipo de agregação: como o KPI se comporta ao agregar períodos
type TipoAgregacao = 'soma' | 'media' | 'snapshot';

interface KPIConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  formato: FormatoMeta;
  cor: string;
  descricao?: string;
  agregacao: TipoAgregacao; // Como agregar ao mudar período
}

// KPIs por aba - com tipo de agregação definido
const KPIS_GESTAO: KPIConfig[] = [
  { id: 'alunos_pagantes', label: 'Alunos Pagantes', icon: Users, formato: 'numero', cor: 'emerald', descricao: 'Meta de alunos no fim do período', agregacao: 'snapshot' },
  { id: 'ticket_medio', label: 'Ticket Médio', icon: DollarSign, formato: 'moeda', cor: 'violet', descricao: 'Valor médio por aluno', agregacao: 'media' },
  { id: 'churn_rate', label: 'Churn Rate (%)', icon: TrendingDown, formato: 'percentual', cor: 'rose', descricao: 'Taxa de cancelamento (meta máxima)', agregacao: 'media' },
  { id: 'taxa_renovacao', label: 'Taxa Renovação (%)', icon: RefreshCw, formato: 'percentual', cor: 'amber', descricao: 'Percentual de renovações', agregacao: 'media' },
  { id: 'tempo_permanencia', label: 'Tempo Permanência (meses)', icon: Clock, formato: 'numero', cor: 'cyan', descricao: 'Média de meses que aluno fica', agregacao: 'media' },
  { id: 'inadimplencia', label: 'Inadimplência (%)', icon: AlertCircle, formato: 'percentual', cor: 'rose', descricao: 'Taxa de inadimplência (meta máxima)', agregacao: 'media' },
  { id: 'reajuste_medio', label: 'Reajuste Médio (%)', icon: TrendingUp, formato: 'percentual', cor: 'emerald', descricao: 'Percentual médio de reajuste', agregacao: 'media' },
];

const KPIS_COMERCIAL: KPIConfig[] = [
  { id: 'leads', label: 'Leads', icon: TrendingUp, formato: 'numero', cor: 'cyan', descricao: 'Novos contatos recebidos', agregacao: 'soma' },
  { id: 'experimentais', label: 'Aulas Experimentais', icon: Star, formato: 'numero', cor: 'amber', descricao: 'Aulas experimentais agendadas', agregacao: 'soma' },
  { id: 'matriculas', label: 'Matrículas', icon: UserCheck, formato: 'numero', cor: 'emerald', descricao: 'Novas matrículas no mês', agregacao: 'soma' },
  { id: 'taxa_lead_exp', label: 'Taxa Lead → Exp (%)', icon: Percent, formato: 'percentual', cor: 'cyan', descricao: 'Conversão de lead para experimental', agregacao: 'media' },
  { id: 'taxa_exp_mat', label: 'Taxa Exp → Mat (%)', icon: Percent, formato: 'percentual', cor: 'emerald', descricao: 'Conversão de experimental para matrícula', agregacao: 'media' },
  { id: 'taxa_conversao', label: 'Taxa Conversão Total (%)', icon: TrendingUp, formato: 'percentual', cor: 'violet', descricao: 'Conversão total do funil', agregacao: 'media' },
  { id: 'ticket_parcela', label: 'Ticket Parcela', icon: DollarSign, formato: 'moeda', cor: 'emerald', descricao: 'Valor médio da parcela de matrícula', agregacao: 'media' },
];

const KPIS_PROFESSORES: KPIConfig[] = [
  { id: 'media_alunos_turma', label: 'Média Alunos/Turma', icon: Users, formato: 'numero', cor: 'violet', descricao: 'Alunos por turma em média', agregacao: 'media' },
  { id: 'media_alunos_prof', label: 'Média Alunos/Professor', icon: Users, formato: 'numero', cor: 'emerald', descricao: 'Carteira média por professor', agregacao: 'media' },
  { id: 'taxa_renovacao_prof', label: 'Taxa Renovação Prof (%)', icon: RefreshCw, formato: 'percentual', cor: 'amber', descricao: 'Renovação média dos professores', agregacao: 'media' },
  { id: 'presenca_media', label: 'Presença Média (%)', icon: UserCheck, formato: 'percentual', cor: 'emerald', descricao: 'Taxa de presença nas aulas', agregacao: 'media' },
  { id: 'taxa_conversao_exp', label: 'Taxa Conversão Aula Exp (%)', icon: TrendingUp, formato: 'percentual', cor: 'cyan', descricao: 'Conversão de experimental do professor', agregacao: 'media' },
  { id: 'melhor_retencao', label: 'Melhor Retenção (Menor Churn %)', icon: TrendingDown, formato: 'percentual', cor: 'rose', descricao: 'Meta de menor churn por professor', agregacao: 'media' },
];

const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

// Configuração de períodos
type FiltroPeriodo = 'mes' | 'trimestre' | 'semestre' | 'ano';

interface PeriodoConfig {
  id: FiltroPeriodo;
  label: string;
  colunas: { id: string; label: string; meses: number[] }[];
}

const PERIODOS: Record<FiltroPeriodo, PeriodoConfig> = {
  mes: {
    id: 'mes',
    label: 'Mês',
    colunas: MESES_ABREV.map((m, i) => ({ id: `m${i+1}`, label: m, meses: [i + 1] })),
  },
  trimestre: {
    id: 'trimestre',
    label: 'Trim',
    colunas: [
      { id: 'q1', label: 'Q1', meses: [1, 2, 3] },
      { id: 'q2', label: 'Q2', meses: [4, 5, 6] },
      { id: 'q3', label: 'Q3', meses: [7, 8, 9] },
      { id: 'q4', label: 'Q4', meses: [10, 11, 12] },
    ],
  },
  semestre: {
    id: 'semestre',
    label: 'Sem',
    colunas: [
      { id: 's1', label: 'S1', meses: [1, 2, 3, 4, 5, 6] },
      { id: 's2', label: 'S2', meses: [7, 8, 9, 10, 11, 12] },
    ],
  },
  ano: {
    id: 'ano',
    label: 'Ano',
    colunas: [
      { id: 'ano', label: 'Anual', meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    ],
  },
};

type AbaAtiva = 'gestao' | 'comercial' | 'professores' | 'simulador' | 'simulador-turma';

export function MetasPageNew() {
  // Pegar filtros do contexto do Outlet (vem do AppLayout)
  const context = useOutletContext<OutletContextType>();
  // Usar unidadeSelecionada diretamente (mesmo que o Simulador usa)
  const unidadeId = context?.unidadeSelecionada ?? context?.filtroAtivo ?? null;
  
  const [loading, setLoading] = useState(true);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('gestao');
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>('mes');

  // Determina se está em modo consolidado
  const isConsolidado = !unidadeId || unidadeId === 'consolidado' || unidadeId === 'todas';

  useEffect(() => {
    fetchDados();
  }, [anoSelecionado, abaAtiva]);

  async function fetchDados() {
    setLoading(true);
    try {
      const [metasRes, unidadesRes] = await Promise.all([
        supabase
          .from('metas_kpi')
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

  // Busca valor da meta
  const getMetaValue = useCallback((unidadeIdParam: string, mes: number, tipo: string): number | null => {
    const meta = metas.find(m => 
      m.unidade_id === unidadeIdParam && m.mes === mes && m.tipo === tipo
    );
    
    if (!meta?.valor) return null;
    // Converter para número (Supabase retorna numeric como string)
    const valor = typeof meta.valor === 'string' ? parseFloat(meta.valor) : meta.valor;
    return isNaN(valor) ? null : valor;
  }, [metas]);

  // Calcula soma consolidada (para modo consolidado)
  const getMetaConsolidada = useCallback((mes: number, tipo: string): number | null => {
    const valores = unidades
      .map(u => getMetaValue(u.id, mes, tipo))
      .filter((v): v is number => v !== null);
    
    if (valores.length === 0) return null;
    return valores.reduce((acc, v) => acc + v, 0);
  }, [unidades, getMetaValue]);

  // Agrega valores de múltiplos meses conforme tipo de agregação
  const agregarValores = useCallback((
    unidadeIdParam: string, 
    meses: number[], 
    tipo: string, 
    agregacao: TipoAgregacao
  ): number | null => {
    const valores = meses
      .map(m => getMetaValue(unidadeIdParam, m, tipo))
      .filter((v): v is number => v !== null);
    
    if (valores.length === 0) return null;
    
    switch (agregacao) {
      case 'soma':
        return valores.reduce((acc, v) => acc + v, 0);
      case 'media':
        return valores.reduce((acc, v) => acc + v, 0) / valores.length;
      case 'snapshot':
        // Para snapshot, pega o último mês do período
        return getMetaValue(unidadeIdParam, meses[meses.length - 1], tipo);
      default:
        return null;
    }
  }, [getMetaValue]);

  // Salva meta individual
  const salvarMeta = useCallback(async (
    unidadeIdParam: string, 
    mes: number, 
    tipo: string, 
    valor: number | null
  ) => {
    const key = `${unidadeIdParam}-${mes}-${tipo}`;
    setSalvando(prev => new Set(prev).add(key));

    try {
      const existing = metas.find(m => 
        m.unidade_id === unidadeIdParam && m.mes === mes && m.tipo === tipo
      );

      if (valor === null || valor === 0) {
        // Remove meta se valor for nulo/zero
        if (existing?.id) {
          await supabase.from('metas_kpi').delete().eq('id', existing.id);
        }
      } else if (existing?.id) {
        // Atualiza meta existente
        await supabase
          .from('metas_kpi')
          .update({ valor })
          .eq('id', existing.id);
      } else {
        // Insere nova meta
        await supabase
          .from('metas_kpi')
          .insert({
            ano: anoSelecionado,
            mes,
            unidade_id: unidadeIdParam,
            tipo,
            valor,
          });
      }

      // Atualiza estado local
      setMetas(prev => {
        const filtered = prev.filter(m => 
          !(m.unidade_id === unidadeIdParam && m.mes === mes && m.tipo === tipo)
        );
        if (valor !== null && valor !== 0) {
          return [...filtered, { 
            id: existing?.id, 
            ano: anoSelecionado, 
            mes, 
            unidade_id: unidadeIdParam, 
            tipo, 
            valor 
          }];
        }
        return filtered;
      });
    } catch (err) {
      console.error('Erro ao salvar meta:', err);
    } finally {
      setSalvando(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [metas, anoSelecionado]);

  // Distribui valor editado para os meses do período
  const distribuirValor = useCallback(async (
    unidadeIdParam: string,
    meses: number[],
    tipo: string,
    valor: number | null,
    agregacao: TipoAgregacao
  ) => {
    if (valor === null) {
      // Remove metas de todos os meses
      for (const mes of meses) {
        await salvarMeta(unidadeIdParam, mes, tipo, null);
      }
      return;
    }

    switch (agregacao) {
      case 'soma':
        // Divide igualmente entre os meses
        const valorPorMes = valor / meses.length;
        for (const mes of meses) {
          await salvarMeta(unidadeIdParam, mes, tipo, Math.round(valorPorMes * 100) / 100);
        }
        break;
      case 'media':
        // Replica o mesmo valor para todos os meses
        for (const mes of meses) {
          await salvarMeta(unidadeIdParam, mes, tipo, valor);
        }
        break;
      case 'snapshot':
        // Salva apenas no último mês do período
        await salvarMeta(unidadeIdParam, meses[meses.length - 1], tipo, valor);
        break;
    }
  }, [salvarMeta]);

  // Retorna KPIs da aba ativa
  const getKPIsAtivos = (): KPIConfig[] => {
    switch (abaAtiva) {
      case 'gestao': return KPIS_GESTAO;
      case 'comercial': return KPIS_COMERCIAL;
      case 'professores': return KPIS_PROFESSORES;
      default: return KPIS_GESTAO;
    }
  };

  // Unidade atual para exibição
  const unidadeAtual = unidades.find(u => u.id === unidadeId);

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
            Defina metas mensais para acompanhar o progresso dos KPIs
          </p>
        </div>
      </div>

      {/* Filtros: Período + Ano + Info da Unidade */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {/* Filtro de Período */}
          <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl">
            {(['mes', 'trimestre', 'semestre', 'ano'] as FiltroPeriodo[]).map(periodo => (
              <button
                key={periodo}
                onClick={() => setFiltroPeriodo(periodo)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  filtroPeriodo === periodo
                    ? "bg-violet-600 text-white shadow-lg"
                    : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                )}
              >
                {PERIODOS[periodo].label}
              </button>
            ))}
          </div>

          {/* Filtro de Ano */}
          <select
            value={anoSelecionado}
            onChange={(e) => setAnoSelecionado(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value={2024}>2024</option>
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>

        {/* Indicador de unidade */}
        <div className="text-sm">
          {isConsolidado ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertCircle size={16} className="text-amber-400" />
              <span className="text-amber-300">
                Consolidado — valores agregados (somente leitura)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <BarChart3 size={16} className="text-cyan-400" />
              <span className="text-cyan-300">
                Editando: <strong>{unidadeAtual?.nome || 'Unidade'}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl w-fit">
        {[
          { id: 'gestao' as const, label: 'Gestão', icon: BarChart3 },
          { id: 'comercial' as const, label: 'Comercial', icon: TrendingUp },
          { id: 'professores' as const, label: 'Professores', icon: Users },
          { id: 'simulador' as const, label: 'Simulador Metas', icon: Target },
          { id: 'simulador-turma' as const, label: 'Simulador Turma', icon: TrendingUp },
        ].map(aba => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              abaAtiva === aba.id
                ? "bg-slate-700 text-white shadow-lg"
                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
            )}
          >
            <aba.icon size={16} />
            {aba.label}
          </button>
        ))}
      </div>

      {/* Simulador de Metas - renderiza quando aba simulador está ativa */}
      {abaAtiva === 'simulador' && (
        <SimuladorPage />
      )}

      {/* Simulador de Turma - renderiza quando aba simulador-turma está ativa */}
      {abaAtiva === 'simulador-turma' && (
        <SimuladorTurmaPage />
      )}

      {/* Tabela de Metas - renderiza quando NÃO é simulador */}
      {abaAtiva !== 'simulador' && abaAtiva !== 'simulador-turma' && (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="py-4 px-4 text-left text-xs text-slate-400 uppercase tracking-wider w-56">
                  KPI
                </th>
                {PERIODOS[filtroPeriodo].colunas.map((coluna) => {
                  // Destaca período atual
                  const mesAtual = new Date().getMonth() + 1;
                  const isAtual = anoSelecionado === new Date().getFullYear() && 
                    coluna.meses.includes(mesAtual);
                  
                  return (
                    <th 
                      key={coluna.id} 
                      className={cn(
                        "py-4 px-2 text-center text-xs uppercase tracking-wider",
                        filtroPeriodo === 'mes' ? "w-20" : "w-28",
                        isAtual ? "text-cyan-400 font-bold" : "text-slate-400"
                      )}
                    >
                      {coluna.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {getKPIsAtivos().map((kpi, index) => (
                <tr 
                  key={kpi.id} 
                  className={cn(
                    "border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors",
                    index % 2 === 0 ? "bg-slate-900/20" : ""
                  )}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-1.5 rounded-lg",
                        `bg-${kpi.cor}-500/20`
                      )}>
                        <kpi.icon size={14} className={`text-${kpi.cor}-400`} />
                      </div>
                      <div>
                        <span className="text-white text-sm font-medium block">
                          {kpi.label}
                        </span>
                        {kpi.descricao && (
                          <span className="text-slate-500 text-xs">
                            {kpi.descricao}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {PERIODOS[filtroPeriodo].colunas.map((coluna) => {
                    const { meses } = coluna;
                    
                    if (isConsolidado) {
                      // Modo consolidado: mostra agregação de todas unidades (read-only) com visual de input
                      const valores = unidades
                        .map(u => agregarValores(u.id, meses, kpi.id, kpi.agregacao))
                        .filter((v): v is number => v !== null);
                      
                      let valorExibir: number | null = null;
                      if (valores.length > 0) {
                        if (kpi.agregacao === 'soma') {
                          valorExibir = valores.reduce((a, b) => a + b, 0);
                        } else {
                          valorExibir = valores.reduce((a, b) => a + b, 0) / valores.length;
                        }
                      }
                      
                      return (
                        <td key={coluna.id} className="py-2 px-1">
                          <div className="w-full text-center text-sm border border-slate-700/50 rounded-lg px-2 py-1.5 bg-slate-800/30 text-slate-500">
                            {valorExibir !== null ? (
                              <span className="text-slate-400">
                                {kpi.formato === 'percentual' 
                                  ? `${valorExibir.toFixed(1)}%`
                                  : kpi.formato === 'moeda' || kpi.formato === 'moeda_k'
                                    ? `R$ ${valorExibir >= 1000 ? `${(valorExibir/1000).toFixed(0)}k` : valorExibir.toFixed(0)}`
                                    : valorExibir.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
                                }
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    // Modo unidade: editável
                    const valorAgregado = agregarValores(unidadeId!, meses, kpi.id, kpi.agregacao);
                    const isSaving = meses.some(m => salvando.has(`${unidadeId}-${m}-${kpi.id}`));

                    return (
                      <td key={coluna.id} className="py-2 px-1">
                        <MetaInput
                          value={valorAgregado}
                          formato={kpi.formato}
                          onChange={(novoValor) => {
                            // Atualização otimista local - distribui para os meses
                            if (novoValor === null) {
                              setMetas(prev => prev.filter(m => 
                                !(m.unidade_id === unidadeId && meses.includes(m.mes) && m.tipo === kpi.id)
                              ));
                            } else {
                              setMetas(prev => {
                                const filtered = prev.filter(m => 
                                  !(m.unidade_id === unidadeId && meses.includes(m.mes) && m.tipo === kpi.id)
                                );
                                // Distribui conforme tipo de agregação
                                const novasMetas: Meta[] = [];
                                if (kpi.agregacao === 'soma') {
                                  const valorPorMes = novoValor / meses.length;
                                  meses.forEach(mes => {
                                    novasMetas.push({ ano: anoSelecionado, mes, unidade_id: unidadeId!, tipo: kpi.id, valor: valorPorMes });
                                  });
                                } else if (kpi.agregacao === 'media') {
                                  meses.forEach(mes => {
                                    novasMetas.push({ ano: anoSelecionado, mes, unidade_id: unidadeId!, tipo: kpi.id, valor: novoValor });
                                  });
                                } else {
                                  // snapshot - só último mês
                                  novasMetas.push({ ano: anoSelecionado, mes: meses[meses.length - 1], unidade_id: unidadeId!, tipo: kpi.id, valor: novoValor });
                                }
                                return [...filtered, ...novasMetas];
                              });
                            }
                          }}
                          autoSave
                          autoSaveDelay={1500}
                          onSave={async (novoValor) => {
                            await distribuirValor(unidadeId!, meses, kpi.id, novoValor, kpi.agregacao);
                          }}
                          disabled={isSaving}
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
      )}

      {/* Legenda - só mostra quando não é simulador */}
      {abaAtiva !== 'simulador' && abaAtiva !== 'simulador-turma' && (
      <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-500/20 border border-amber-500/50 rounded" />
          <span>Editando</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-emerald-500/20 border border-emerald-500/50 rounded" />
          <span>Salvo automaticamente</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-600">—</span>
          <span>Sem meta definida</span>
        </div>
        <div className="ml-auto text-slate-400">
          💡 Alterações são salvas automaticamente após 1.5 segundos
        </div>
      </div>
      )}
    </div>
  );
}

export default MetasPageNew;
