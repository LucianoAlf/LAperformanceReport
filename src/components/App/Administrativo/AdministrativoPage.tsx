'use client';

import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  Users, DollarSign, BookOpen, GraduationCap, UserPlus,
  FileText, Calendar, Plus, Pause, RefreshCw, XCircle, AlertTriangle, LogOut,
  Zap, BarChart3, CheckCircle, DoorOpen, PauseCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KPICard } from '@/components/ui/KPICard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';

import { QuickInputCard } from './QuickInputCard';
import { TabelaRenovacoes } from './TabelaRenovacoes';
import { TabelaAvisosPrevios } from './TabelaAvisosPrevios';
import { TabelaEvasoes } from './TabelaEvasoes';
import { ModalRenovacao } from './ModalRenovacao';
import { ModalNaoRenovacao } from './ModalNaoRenovacao';
import { ModalAvisoPrevio } from './ModalAvisoPrevio';
import { ModalEvasao } from './ModalEvasao';
import { ModalTrancamento } from './ModalTrancamento';
import { ModalRelatorio } from './ModalRelatorio';
import { TabelaTrancamentos } from './TabelaTrancamentos';

import type { UnidadeId } from '@/components/ui/UnidadeFilter';

// Tipos
export interface MovimentacaoAdmin {
  id?: number;
  tipo: 'renovacao' | 'nao_renovacao' | 'aviso_previo' | 'evasao' | 'trancamento';
  data: string;
  aluno_nome: string;
  professor_id?: number | null;
  professor_nome?: string;
  valor_parcela_anterior?: number | null;
  valor_parcela_novo?: number | null;
  forma_pagamento_id?: number | null;
  forma_pagamento_nome?: string;
  agente_comercial?: string | null;
  motivo?: string | null;
  mes_saida?: string | null;
  tipo_evasao?: string | null;
  tempo_permanencia_meses?: number | null;
  valor_parcela_evasao?: number | null;
  previsao_retorno?: string | null;
  created_at?: string;
}

export interface ResumoMes {
  alunos_ativos: number;
  alunos_pagantes: number;
  alunos_nao_pagantes: number;
  alunos_trancados: number;
  bolsistas_integrais: number;
  bolsistas_parciais: number;
  alunos_novos: number;
  matriculas_ativas: number;
  matriculas_banda: number;
  matriculas_2_curso: number;
  renovacoes_previstas: number;
  renovacoes_realizadas: number;
  renovacoes_pendentes: number;
  nao_renovacoes: number;
  avisos_previos: number;
  evasoes_total: number;
  evasoes_interrompido: number;
  evasoes_nao_renovou: number;
  ticket_medio: number;
  faturamento: number;
  churn_rate: number;
  ltv_meses: number;
}

type TabId = 'renovacoes' | 'avisos' | 'evasoes' | 'trancamentos';

const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'renovacoes', label: 'Renovações', icon: CheckCircle },
  { id: 'avisos', label: 'Avisos Prévios', icon: AlertTriangle },
  { id: 'evasoes', label: 'Evasões', icon: DoorOpen },
  { id: 'trancamentos', label: 'Trancamentos', icon: PauseCircle },
];

export function AdministrativoPage() {
  const context = useOutletContext<{ filtroAtivo: boolean; unidadeSelecionada: UnidadeId }>();
  const unidade = context?.unidadeSelecionada || 'todos';
  
  // Hook de filtro de competência (período)
  const competenciaFiltro = useCompetenciaFiltro();
  
  // Estado
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('renovacoes');
  
  // Dados
  const [resumo, setResumo] = useState<ResumoMes | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoAdmin[]>([]);
  const [professores, setProfessores] = useState<{ id: number; nome: string }[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<{ id: number; nome: string; sigla: string }[]>([]);
  
  // Modais
  const [modalRenovacao, setModalRenovacao] = useState(false);
  const [modalNaoRenovacao, setModalNaoRenovacao] = useState(false);
  const [modalAvisoPrevio, setModalAvisoPrevio] = useState(false);
  const [modalEvasao, setModalEvasao] = useState(false);
  const [modalTrancamento, setModalTrancamento] = useState(false);
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [editingItem, setEditingItem] = useState<MovimentacaoAdmin | null>(null);

  // Extrair ano e mês do filtro de competência
  const ano = competenciaFiltro.filtro.ano;
  const mes = competenciaFiltro.filtro.mes;
  const { startDate, endDate } = competenciaFiltro.range;
  
  // Competência formatada para os modais (YYYY-MM)
  const competencia = `${ano}-${String(mes).padStart(2, '0')}`;

  // Carregar dados
  useEffect(() => {
    loadData();
  }, [startDate, endDate, unidade]);

  async function loadData() {
    setLoading(true);
    try {
      // Usar range de datas do filtro de competência
      const { startDate: start, endDate: end } = competenciaFiltro.range;

      // Carregar movimentações do mês
      let query = supabase
        .from('movimentacoes_admin')
        .select('*')
        .gte('data', startDate)
        .lte('data', endDate)
        .order('data', { ascending: false });

      if (unidade !== 'todos') {
        query = query.eq('unidade_id', unidade);
      }

      const { data: movData, error: movError } = await query;
      if (movError) throw movError;

      // Carregar professores
      const { data: profData } = await supabase
        .from('professores')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

      // Carregar formas de pagamento
      const { data: fpData } = await supabase
        .from('formas_pagamento')
        .select('id, nome, sigla')
        .order('nome');

      // Carregar KPIs da view de gestão
      let kpisQuery = supabase
        .from('vw_kpis_gestao_mensal')
        .select('*')
        .eq('ano', ano)
        .eq('mes', mes);

      if (unidade !== 'todos') {
        kpisQuery = kpisQuery.eq('unidade_id', unidade);
      }

      const { data: kpisData } = await kpisQuery;

      // Consolidar KPIs
      const kpis = kpisData?.reduce((acc, k) => ({
        alunos_ativos: (acc.alunos_ativos || 0) + (k.total_alunos_ativos || 0),
        alunos_pagantes: (acc.alunos_pagantes || 0) + (k.total_alunos_pagantes || 0),
        alunos_nao_pagantes: (acc.alunos_nao_pagantes || 0) + ((k.total_alunos_ativos || 0) - (k.total_alunos_pagantes || 0)),
        alunos_trancados: (acc.alunos_trancados || 0) + (k.total_trancados || 0),
        bolsistas_integrais: (acc.bolsistas_integrais || 0) + (k.total_bolsistas_integrais || 0),
        bolsistas_parciais: (acc.bolsistas_parciais || 0) + (k.total_bolsistas_parciais || 0),
        alunos_novos: (acc.alunos_novos || 0) + (k.novas_matriculas || 0),
        matriculas_ativas: (acc.matriculas_ativas || 0) + (k.total_matriculas || 0),
        matriculas_banda: (acc.matriculas_banda || 0) + (k.total_banda || 0),
        matriculas_2_curso: 0, // Calcular separadamente se necessário
        ticket_medio: k.ticket_medio || acc.ticket_medio || 0,
        faturamento: (acc.faturamento || 0) + (k.faturamento_estimado || 0),
        churn_rate: k.churn_rate || acc.churn_rate || 0,
        ltv_meses: k.tempo_permanencia || acc.ltv_meses || 0,
      }), {} as any) || {};

      // Contar movimentações por tipo
      const renovacoes = movData?.filter(m => m.tipo === 'renovacao') || [];
      const naoRenovacoes = movData?.filter(m => m.tipo === 'nao_renovacao') || [];
      const avisosPrevios = movData?.filter(m => m.tipo === 'aviso_previo') || [];
      const evasoes = movData?.filter(m => m.tipo === 'evasao') || [];
      const trancamentos = movData?.filter(m => m.tipo === 'trancamento') || [];

      // Enriquecer movimentações com nomes
      const profMap = new Map(profData?.map(p => [p.id, p.nome]) || []);
      const fpMap = new Map(fpData?.map(f => [f.id, { nome: f.nome, sigla: f.sigla }]) || []);

      const movimentacoesEnriquecidas = (movData || []).map(m => ({
        ...m,
        professor_nome: m.professor_id ? profMap.get(m.professor_id) : undefined,
        forma_pagamento_nome: m.forma_pagamento_id ? fpMap.get(m.forma_pagamento_id)?.sigla : undefined,
      }));

      setMovimentacoes(movimentacoesEnriquecidas);
      setProfessores(profData || []);
      setFormasPagamento(fpData || []);

      // Montar resumo
      setResumo({
        ...kpis,
        renovacoes_previstas: 25, // TODO: Calcular baseado em alunos que completam aniversário
        renovacoes_realizadas: renovacoes.length,
        renovacoes_pendentes: 25 - renovacoes.length,
        nao_renovacoes: naoRenovacoes.length,
        avisos_previos: avisosPrevios.length,
        evasoes_total: evasoes.length,
        evasoes_interrompido: evasoes.filter(e => e.tipo_evasao === 'interrompido').length,
        evasoes_nao_renovou: evasoes.filter(e => e.tipo_evasao === 'nao_renovou').length,
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  // Handlers para salvar
  async function handleSaveMovimentacao(data: Partial<MovimentacaoAdmin>) {
    try {
      const payload = {
        ...data,
        unidade_id: unidade === 'todos' ? null : unidade,
      };

      if (editingItem?.id) {
        const { error } = await supabase
          .from('movimentacoes_admin')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('movimentacoes_admin')
          .insert(payload);
        if (error) throw error;
      }

      await loadData();
      setEditingItem(null);
      return true;
    } catch (error) {
      console.error('Erro ao salvar:', error);
      return false;
    }
  }

  async function handleDeleteMovimentacao(id: number) {
    try {
      const { error } = await supabase
        .from('movimentacoes_admin')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Erro ao excluir:', error);
    }
  }

  function handleEdit(item: MovimentacaoAdmin) {
    setEditingItem(item);
    switch (item.tipo) {
      case 'renovacao':
        setModalRenovacao(true);
        break;
      case 'nao_renovacao':
        setModalNaoRenovacao(true);
        break;
      case 'aviso_previo':
        setModalAvisoPrevio(true);
        break;
      case 'evasao':
        setModalEvasao(true);
        break;
      case 'trancamento':
        setModalTrancamento(true);
        break;
    }
  }

  // Filtrar movimentações por tipo
  const renovacoes = movimentacoes.filter(m => m.tipo === 'renovacao');
  const avisosPrevios = movimentacoes.filter(m => m.tipo === 'aviso_previo');
  const evasoes = movimentacoes.filter(m => m.tipo === 'evasao');
  const naoRenovacoes = movimentacoes.filter(m => m.tipo === 'nao_renovacao');
  const trancamentos = movimentacoes.filter(m => m.tipo === 'trancamento');

  // Gerar opções de competência (últimos 12 meses)
  const competenciaOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

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
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-violet-400" />
            Administrativo
          </h1>
          <p className="text-slate-400 mt-1">Gestão de Renovações, Avisos e Evasões</p>
        </div>
        <div className="flex items-center gap-4">
          <CompetenciaFilter
            filtro={competenciaFiltro.filtro}
            range={competenciaFiltro.range}
            anosDisponiveis={competenciaFiltro.anosDisponiveis}
            onTipoChange={competenciaFiltro.setTipo}
            onAnoChange={competenciaFiltro.setAno}
            onMesChange={competenciaFiltro.setMes}
            onTrimestreChange={competenciaFiltro.setTrimestre}
            onSemestreChange={competenciaFiltro.setSemestre}
          />
          <button
            onClick={() => setModalRelatorio(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20"
          >
            <FileText className="w-4 h-4" />
            Gerar Relatório WhatsApp
          </button>
        </div>
      </div>

      {/* Resumo do Mês - KPIs */}
      <section className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-cyan-500/20 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Resumo do Mês</h2>
              <p className="text-sm text-cyan-400 capitalize">{competenciaOptions.find(o => o.value === competencia)?.label}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard
            icon={Users}
            label="Alunos Ativos"
            value={resumo?.alunos_ativos || 0}
            variant="cyan"
          />
          <KPICard
            icon={DollarSign}
            label="Pagantes"
            value={resumo?.alunos_pagantes || 0}
            subvalue={`${resumo?.alunos_nao_pagantes || 0} não pagantes`}
            variant="emerald"
          />
          <KPICard
            icon={BookOpen}
            label="Matrículas Ativas"
            value={resumo?.matriculas_ativas || 0}
            subvalue={`${resumo?.matriculas_banda || 0} banda | ${resumo?.matriculas_2_curso || 0} 2º curso`}
            variant="violet"
          />
          <KPICard
            icon={GraduationCap}
            label="Bolsistas"
            value={(resumo?.bolsistas_integrais || 0) + (resumo?.bolsistas_parciais || 0)}
            subvalue={`${resumo?.bolsistas_integrais || 0} integrais | ${resumo?.bolsistas_parciais || 0} parciais`}
            variant="amber"
          />
          <KPICard
            icon={Pause}
            label="Trancados"
            value={resumo?.alunos_trancados || 0}
            variant="default"
          />
          <KPICard
            icon={UserPlus}
            label="Novos no Mês"
            value={resumo?.alunos_novos || 0}
            variant="green"
          />
        </div>
        </div>
      </section>

      {/* Quick Input */}
      <section className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-violet-500/20 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-violet-500/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Lançamento Rápido</h2>
              <p className="text-sm text-violet-400">Registre renovações, avisos e evasões</p>
            </div>
          </div>
        </div>
        <div className="p-6">
        <p className="text-sm text-slate-400 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Clique para adicionar um novo registro
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <QuickInputCard
            icon={RefreshCw}
            title="Renovação"
            count={resumo?.renovacoes_realizadas || 0}
            variant="emerald"
            onClick={() => { setEditingItem(null); setModalRenovacao(true); }}
          />
          <QuickInputCard
            icon={XCircle}
            title="Não Renovação"
            count={naoRenovacoes.length}
            variant="amber"
            onClick={() => { setEditingItem(null); setModalNaoRenovacao(true); }}
          />
          <QuickInputCard
            icon={AlertTriangle}
            title="Aviso Prévio"
            count={resumo?.avisos_previos || 0}
            variant="orange"
            onClick={() => { setEditingItem(null); setModalAvisoPrevio(true); }}
          />
          <QuickInputCard
            icon={PauseCircle}
            title="Trancamento"
            count={trancamentos.length}
            variant="amber"
            onClick={() => { setEditingItem(null); setModalTrancamento(true); }}
          />
          <QuickInputCard
            icon={LogOut}
            title="Evasão"
            count={resumo?.evasoes_total || 0}
            variant="rose"
            onClick={() => { setEditingItem(null); setModalEvasao(true); }}
          />
        </div>
        </div>
      </section>

      {/* Detalhamento - Tabs */}
      <section className="bg-slate-800/50 border border-emerald-500/20 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-emerald-500/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Detalhamento do Mês</h2>
              <p className="text-sm text-emerald-400">{renovacoes.length + avisosPrevios.length + evasoes.length} movimentações</p>
            </div>
          </div>
        </div>
        <div className="p-6">

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {tabs.map(tab => {
            const count = tab.id === 'renovacoes' ? renovacoes.length 
              : tab.id === 'avisos' ? avisosPrevios.length 
              : tab.id === 'evasoes' ? evasoes.length
              : trancamentos.length;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                    : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Conteúdo da Tab */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-700/30 overflow-hidden mt-4">
          {activeTab === 'renovacoes' && (
            <TabelaRenovacoes 
              data={renovacoes} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
            />
          )}
          {activeTab === 'avisos' && (
            <TabelaAvisosPrevios 
              data={avisosPrevios} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
            />
          )}
          {activeTab === 'evasoes' && (
            <TabelaEvasoes 
              data={evasoes} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
            />
          )}
          {activeTab === 'trancamentos' && (
            <TabelaTrancamentos 
              data={trancamentos} 
              onEdit={handleEdit}
              onDelete={handleDeleteMovimentacao}
            />
          )}
        </div>
        </div>
      </section>

      {/* Modais */}
      <ModalRenovacao
        open={modalRenovacao}
        onOpenChange={setModalRenovacao}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        formasPagamento={formasPagamento}
        competencia={competencia}
      />
      <ModalNaoRenovacao
        open={modalNaoRenovacao}
        onOpenChange={setModalNaoRenovacao}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        professores={professores}
        competencia={competencia}
      />
      <ModalAvisoPrevio
        open={modalAvisoPrevio}
        onOpenChange={setModalAvisoPrevio}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        professores={professores}
        competencia={competencia}
      />
      <ModalEvasao
        open={modalEvasao}
        onOpenChange={setModalEvasao}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        professores={professores}
        competencia={competencia}
      />
      <ModalTrancamento
        open={modalTrancamento}
        onOpenChange={setModalTrancamento}
        onSave={handleSaveMovimentacao}
        editingItem={editingItem}
        professores={professores}
        competencia={competencia}
      />
      <ModalRelatorio
        open={modalRelatorio}
        onOpenChange={setModalRelatorio}
        resumo={resumo}
        renovacoes={renovacoes}
        naoRenovacoes={naoRenovacoes}
        avisosPrevios={avisosPrevios}
        evasoes={evasoes}
        competencia={competencia}
        unidade={unidade}
      />
    </div>
  );
}

export default AdministrativoPage;
