import { useState, useEffect } from 'react';
import { Users, DollarSign, Percent, Clock, AlertTriangle, Wallet, Calendar, TrendingDown, RefreshCw, UserMinus } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { RankingTable } from '@/components/ui/RankingTable';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface TabGestaoProps {
  ano: number;
  mes: number;
  unidade: string;
}

type SubTabId = 'alunos' | 'financeiro' | 'retencao' | 'indicadores';

const subTabs = [
  { id: 'alunos' as const, label: 'Alunos', icon: Users },
  { id: 'financeiro' as const, label: 'Financeiro', icon: DollarSign },
  { id: 'retencao' as const, label: 'Retenção', icon: TrendingDown },
  { id: 'indicadores' as const, label: 'Indicadores', icon: Percent },
];

interface DadosGestao {
  // Alunos
  total_alunos_ativos: number;
  total_alunos_pagantes: number;
  total_bolsistas_integrais: number;
  total_bolsistas_parciais: number;
  total_banda: number;
  novas_matriculas: number;
  evasoes: number;
  saldo_liquido: number;
  
  // Financeiro
  ticket_medio: number;
  mrr: number;
  arr: number;
  faturamento_previsto: number;
  faturamento_realizado: number;
  inadimplencia: number;
  inadimplencia_pct: number;
  ltv_medio: number;
  ticket_medio_passaporte: number;
  reajuste_pct: number;
  
  // Retenção
  churn_rate: number;
  renovacoes: number;
  nao_renovacoes: number;
  renovacoes_pct: number;
  cancelamentos: number;
  cancelamento_pct: number;
  aviso_previo: number;
  mrr_perdido: number;
  
  // Indicadores
  tempo_permanencia: number;
  nps_evasoes: number;
  renovacoes_pendentes: number;
  total_evasoes: number;
  
  // Distribuições (gráficos)
  matriculas_por_curso: { name: string; value: number }[];
  matriculas_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  evasoes_por_professor: { id: number; nome: string; valor: number; subvalor?: string }[];
  evasoes_por_curso: { name: string; value: number }[];
  motivos_nao_renovacao: { name: string; value: number }[];
  motivos_cancelamento: { name: string; value: number }[];
}

export function TabGestao({ ano, mes, unidade }: TabGestaoProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('alunos');
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<DadosGestao | null>(null);
  const [evolucao, setEvolucao] = useState<any[]>([]);
  const [distribuicao, setDistribuicao] = useState<any[]>([]);

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        // Buscar dados da view de gestão
        let query = supabase
          .from('vw_kpis_gestao_mensal')
          .select('*');

        if (unidade !== 'todos') {
          query = query.eq('unidade_id', unidade);
        }

        const { data: gestaoData, error: gestaoError } = await query;

        if (gestaoError) throw gestaoError;

        // Buscar dados de retenção
        let retencaoQuery = supabase
          .from('vw_kpis_retencao_mensal')
          .select('*');

        if (unidade !== 'todos') {
          retencaoQuery = retencaoQuery.eq('unidade_id', unidade);
        }

        const { data: retencaoData, error: retencaoError } = await retencaoQuery;

        if (retencaoError) throw retencaoError;

        // Consolidar dados
        if (gestaoData && gestaoData.length > 0) {
          const g = gestaoData.reduce((acc, item) => ({
            total_alunos_ativos: acc.total_alunos_ativos + (item.total_alunos_ativos || 0),
            total_alunos_pagantes: acc.total_alunos_pagantes + (item.total_alunos_pagantes || 0),
            total_bolsistas_integrais: acc.total_bolsistas_integrais + (item.total_bolsistas_integrais || 0),
            total_bolsistas_parciais: acc.total_bolsistas_parciais + (item.total_bolsistas_parciais || 0),
            total_banda: acc.total_banda + (item.total_banda || 0),
            ticket_medio: acc.ticket_medio + (Number(item.ticket_medio) || 0),
            mrr: acc.mrr + (Number(item.mrr) || 0),
            arr: acc.arr + (Number(item.arr) || 0),
            tempo_permanencia_medio: acc.tempo_permanencia_medio + (Number(item.tempo_permanencia_medio) || 0),
            ltv_medio: acc.ltv_medio + (Number(item.ltv_medio) || 0),
            inadimplencia_pct: acc.inadimplencia_pct + (Number(item.inadimplencia_pct) || 0),
            faturamento_previsto: acc.faturamento_previsto + (Number(item.faturamento_previsto) || 0),
            faturamento_realizado: acc.faturamento_realizado + (Number(item.faturamento_realizado) || 0),
            churn_rate: acc.churn_rate + (Number(item.churn_rate) || 0),
            total_evasoes: acc.total_evasoes + (item.total_evasoes || 0),
            count: acc.count + 1,
          }), {
            total_alunos_ativos: 0, total_alunos_pagantes: 0, total_bolsistas_integrais: 0,
            total_bolsistas_parciais: 0, total_banda: 0, ticket_medio: 0, mrr: 0, arr: 0,
            tempo_permanencia_medio: 0, ltv_medio: 0, inadimplencia_pct: 0,
            faturamento_previsto: 0, faturamento_realizado: 0, churn_rate: 0, total_evasoes: 0, count: 0
          });

          const r = retencaoData?.reduce((acc, item) => ({
            total_evasoes: acc.total_evasoes + (item.total_evasoes || 0),
            evasoes_interrompidas: acc.evasoes_interrompidas + (item.evasoes_interrompidas || 0),
            avisos_previos: acc.avisos_previos + (item.avisos_previos || 0),
            mrr_perdido: acc.mrr_perdido + (Number(item.mrr_perdido) || 0),
            renovacoes_realizadas: acc.renovacoes_realizadas + (item.renovacoes_realizadas || 0),
            nao_renovacoes: acc.nao_renovacoes + (item.nao_renovacoes || 0),
            renovacoes_pendentes: acc.renovacoes_pendentes + (item.renovacoes_pendentes || 0),
            taxa_renovacao: acc.taxa_renovacao + (Number(item.taxa_renovacao) || 0),
            count: acc.count + 1,
          }), {
            total_evasoes: 0, evasoes_interrompidas: 0, avisos_previos: 0, mrr_perdido: 0,
            renovacoes_realizadas: 0, nao_renovacoes: 0, renovacoes_pendentes: 0, taxa_renovacao: 0, count: 0
          }) || { total_evasoes: 0, evasoes_interrompidas: 0, avisos_previos: 0, mrr_perdido: 0,
            renovacoes_realizadas: 0, nao_renovacoes: 0, renovacoes_pendentes: 0, taxa_renovacao: 0, count: 1 };

          // Buscar dados mensais para novas matrículas
          const { data: dadosMensais } = await supabase
            .from('dados_mensais')
            .select('*')
            .eq('ano', ano)
            .eq('mes', mes);

          const novasMatriculas = dadosMensais?.reduce((acc, d) => acc + (d.novas_matriculas || 0), 0) || 0;
          const evasoes = dadosMensais?.reduce((acc, d) => acc + (d.evasoes || 0), 0) || 0;

          // Buscar matrículas por curso e professor
          const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
          const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;

          let matriculasQuery = supabase
            .from('alunos')
            .select('cursos(nome), professores:professor_experimental_id(nome), unidade_id')
            .gte('data_matricula', startDate)
            .lte('data_matricula', endDate);

          if (unidade !== 'todos') {
            matriculasQuery = matriculasQuery.eq('unidade_id', unidade);
          }

          const { data: matriculasData } = await matriculasQuery;

          const cursoMatMap = new Map<string, number>();
          const profMatMap = new Map<string, { id: number; count: number }>();
          matriculasData?.forEach(m => {
            const curso = (m.cursos as any)?.nome || 'Não informado';
            cursoMatMap.set(curso, (cursoMatMap.get(curso) || 0) + 1);
            const prof = (m.professores as any)?.nome || 'Sem Professor';
            const current = profMatMap.get(prof) || { id: 0, count: 0 };
            current.count += 1;
            profMatMap.set(prof, current);
          });

          // Buscar evasões por curso e professor
          let evasoesQuery = supabase
            .from('evasoes_v2')
            .select('cursos(nome), professores:professor_id(nome), motivos_saida(nome), tipo_evasao, unidade_id')
            .gte('data_evasao', startDate)
            .lte('data_evasao', endDate);

          if (unidade !== 'todos') {
            evasoesQuery = evasoesQuery.eq('unidade_id', unidade);
          }

          const { data: evasoesData } = await evasoesQuery;

          const cursoEvasaoMap = new Map<string, number>();
          const profEvasaoMap = new Map<string, { id: number; count: number }>();
          const motivosNaoRenovMap = new Map<string, number>();
          const motivosCancelMap = new Map<string, number>();
          evasoesData?.forEach(e => {
            const curso = (e.cursos as any)?.nome || 'Não informado';
            cursoEvasaoMap.set(curso, (cursoEvasaoMap.get(curso) || 0) + 1);
            const prof = (e.professores as any)?.nome || 'Sem Professor';
            const current = profEvasaoMap.get(prof) || { id: 0, count: 0 };
            current.count += 1;
            profEvasaoMap.set(prof, current);
            const motivo = (e.motivos_saida as any)?.nome || 'Não informado';
            if (e.tipo_evasao === 'nao_renovacao') {
              motivosNaoRenovMap.set(motivo, (motivosNaoRenovMap.get(motivo) || 0) + 1);
            } else {
              motivosCancelMap.set(motivo, (motivosCancelMap.get(motivo) || 0) + 1);
            }
          });

          setDados({
            // Alunos
            total_alunos_ativos: g.total_alunos_ativos,
            total_alunos_pagantes: g.total_alunos_pagantes,
            total_bolsistas_integrais: g.total_bolsistas_integrais,
            total_bolsistas_parciais: g.total_bolsistas_parciais,
            total_banda: g.total_banda,
            novas_matriculas: novasMatriculas,
            evasoes: evasoes,
            saldo_liquido: novasMatriculas - evasoes,
            
            // Financeiro
            ticket_medio: g.count > 0 ? g.ticket_medio / g.count : 0,
            mrr: g.mrr,
            arr: g.arr,
            faturamento_previsto: g.faturamento_previsto,
            faturamento_realizado: g.faturamento_realizado,
            inadimplencia: g.faturamento_previsto - g.faturamento_realizado,
            inadimplencia_pct: g.count > 0 ? g.inadimplencia_pct / g.count : 0,
            ltv_medio: g.count > 0 ? g.ltv_medio / g.count : 0,
            ticket_medio_passaporte: 0, // TODO: buscar de outra fonte
            reajuste_pct: 0, // TODO: buscar de outra fonte
            
            // Retenção
            churn_rate: g.count > 0 ? g.churn_rate / g.count : 0,
            renovacoes: r.renovacoes_realizadas,
            nao_renovacoes: r.nao_renovacoes,
            renovacoes_pct: r.count > 0 ? r.taxa_renovacao / r.count : 0,
            cancelamentos: r.evasoes_interrompidas,
            cancelamento_pct: g.total_alunos_ativos > 0 ? (r.evasoes_interrompidas / g.total_alunos_ativos) * 100 : 0,
            aviso_previo: r.avisos_previos,
            mrr_perdido: r.mrr_perdido,
            
            // Indicadores
            tempo_permanencia: g.count > 0 ? g.tempo_permanencia_medio / g.count : 0,
            nps_evasoes: 0, // TODO: buscar de outra fonte
            renovacoes_pendentes: r.renovacoes_pendentes,
            total_evasoes: r.total_evasoes,
            
            // Distribuições (gráficos)
            matriculas_por_curso: Array.from(cursoMatMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            matriculas_por_professor: Array.from(profMatMap.entries()).map(([nome, data]) => ({
              id: data.id,
              nome,
              valor: data.count,
            })).sort((a, b) => b.valor - a.valor),
            evasoes_por_professor: Array.from(profEvasaoMap.entries()).map(([nome, data]) => ({
              id: data.id,
              nome,
              valor: data.count,
            })).sort((a, b) => b.valor - a.valor),
            evasoes_por_curso: Array.from(cursoEvasaoMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            motivos_nao_renovacao: Array.from(motivosNaoRenovMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            motivos_cancelamento: Array.from(motivosCancelMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
          });

          // Distribuição por unidade
          setDistribuicao(gestaoData.map(item => ({
            name: item.unidade_nome || 'N/A',
            value: item.total_alunos_ativos || 0,
          })));
        }

        // Buscar evolução mensal
        const { data: evolucaoData } = await supabase
          .from('dados_mensais')
          .select('mes, alunos_pagantes, novas_matriculas, evasoes')
          .eq('ano', ano)
          .order('mes', { ascending: true });

        if (evolucaoData) {
          // Agrupar por mês
          const porMes = evolucaoData.reduce((acc: any, item) => {
            if (!acc[item.mes]) {
              acc[item.mes] = { alunos: 0, matriculas: 0, evasoes: 0 };
            }
            acc[item.mes].alunos += item.alunos_pagantes || 0;
            acc[item.mes].matriculas += item.novas_matriculas || 0;
            acc[item.mes].evasoes += item.evasoes || 0;
            return acc;
          }, {});

          setEvolucao(Object.entries(porMes).map(([mesNum, valores]: [string, any]) => ({
            name: getMesNomeCurto(parseInt(mesNum)),
            alunos: valores.alunos,
            matriculas: valores.matriculas,
            evasoes: valores.evasoes,
          })));
        }

      } catch (err) {
        console.error('Erro ao carregar dados de gestão:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDados();
  }, [ano, mes, unidade]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="text-center text-slate-400 py-12">
        Nenhum dado encontrado para o período selecionado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-abas */}
      <div className="bg-slate-800/50 p-1 rounded-lg inline-flex gap-1">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeSubTab === tab.id
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da Sub-aba */}
      {activeSubTab === 'alunos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Users}
              label="Total Alunos Ativos"
              value={dados.total_alunos_ativos}
              variant="cyan"
            />
            <KPICard
              icon={Users}
              label="Alunos Pagantes"
              value={dados.total_alunos_pagantes}
              subvalue={`${dados.total_bolsistas_integrais + dados.total_bolsistas_parciais} bolsistas`}
              variant="emerald"
            />
            <KPICard
              icon={TrendingDown}
              label="Novas Matrículas"
              value={dados.novas_matriculas}
              variant="green"
            />
            <KPICard
              icon={UserMinus}
              label="Evasões"
              value={dados.evasoes}
              variant="rose"
            />
            <KPICard
              icon={RefreshCw}
              label="Saldo Líquido"
              value={dados.saldo_liquido}
              variant={dados.saldo_liquido >= 0 ? 'emerald' : 'rose'}
            />
            <KPICard
              icon={Users}
              label="Bolsistas Integrais"
              value={dados.total_bolsistas_integrais}
              variant="amber"
            />
            <KPICard
              icon={Users}
              label="Bolsistas Parciais"
              value={dados.total_bolsistas_parciais}
              variant="amber"
            />
            <KPICard
              icon={Users}
              label="Banda"
              value={dados.total_banda}
              variant="violet"
            />
          </div>

          {/* Gráficos - Linha 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionChart
              data={distribuicao}
              title="Distribuição por Unidade"
            />
            <EvolutionChart
              data={evolucao}
              title="Evolução Mensal"
              lines={[
                { dataKey: 'alunos', color: '#06b6d4', name: 'Alunos' },
                { dataKey: 'matriculas', color: '#10b981', name: 'Matrículas' },
                { dataKey: 'evasoes', color: '#ef4444', name: 'Evasões' },
              ]}
            />
          </div>

          {/* Gráficos - Linha 2: Matrículas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionChart
              data={dados.matriculas_por_curso}
              title="Novas Matrículas por Curso"
            />
            <RankingTable
              data={dados.matriculas_por_professor.slice(0, 10)}
              title="🎯 Top Matriculadores"
              valorLabel="Matrículas"
            />
          </div>

          {/* Gráficos - Linha 3: Evasões */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionChart
              data={dados.evasoes_por_curso}
              title="Evasões por Curso"
            />
            <RankingTable
              data={dados.evasoes_por_professor.slice(0, 10)}
              title="⚠️ Evasões por Professor"
              valorLabel="Evasões"
            />
          </div>
        </div>
      )}

      {activeSubTab === 'financeiro' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={DollarSign}
              label="Ticket Médio"
              value={formatCurrency(dados.ticket_medio)}
              variant="violet"
            />
            <KPICard
              icon={Wallet}
              label="MRR"
              value={formatCurrency(dados.mrr)}
              subvalue="Receita Recorrente Mensal"
              variant="emerald"
            />
            <KPICard
              icon={Calendar}
              label="ARR"
              value={formatCurrency(dados.arr)}
              subvalue="Receita Recorrente Anual"
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="LTV Médio"
              value={formatCurrency(dados.ltv_medio)}
              subvalue="Lifetime Value"
              variant="violet"
            />
            <KPICard
              icon={DollarSign}
              label="Faturamento Previsto"
              value={formatCurrency(dados.faturamento_previsto)}
              variant="cyan"
            />
            <KPICard
              icon={DollarSign}
              label="Faturamento Realizado"
              value={formatCurrency(dados.faturamento_realizado)}
              variant="emerald"
            />
            <KPICard
              icon={AlertTriangle}
              label="Inadimplência"
              value={formatCurrency(dados.inadimplencia)}
              subvalue={`${dados.inadimplencia_pct.toFixed(1)}%`}
              variant="amber"
            />
            <KPICard
              icon={Percent}
              label="Reajuste Médio"
              value={`${dados.reajuste_pct.toFixed(1)}%`}
              variant="cyan"
            />
          </div>
        </div>
      )}

      {activeSubTab === 'retencao' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Percent}
              label="Churn Rate"
              value={`${dados.churn_rate.toFixed(1)}%`}
              variant="rose"
            />
            <KPICard
              icon={RefreshCw}
              label="Renovações"
              value={dados.renovacoes}
              subvalue={`${dados.renovacoes_pct.toFixed(0)}% taxa`}
              variant="emerald"
            />
            <KPICard
              icon={UserMinus}
              label="Não Renovações"
              value={dados.nao_renovacoes}
              variant="amber"
            />
            <KPICard
              icon={UserMinus}
              label="Cancelamentos"
              value={dados.cancelamentos}
              subvalue={`${dados.cancelamento_pct.toFixed(1)}%`}
              variant="rose"
            />
            <KPICard
              icon={Clock}
              label="Aviso Prévio"
              value={dados.aviso_previo}
              variant="amber"
            />
            <KPICard
              icon={DollarSign}
              label="MRR Perdido"
              value={formatCurrency(dados.mrr_perdido)}
              variant="rose"
            />
            <KPICard
              icon={UserMinus}
              label="Total Evasões"
              value={dados.total_evasoes}
              subvalue="Cancelamentos + Não Renovações"
              variant="rose"
            />
            <KPICard
              icon={RefreshCw}
              label="Renovações Pendentes"
              value={dados.renovacoes_pendentes}
              variant="amber"
            />
          </div>

          {/* Gráficos de Motivos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DistributionChart
              data={dados.motivos_nao_renovacao}
              title="Motivos de Não Renovação"
            />
            <DistributionChart
              data={dados.motivos_cancelamento}
              title="Motivos de Cancelamento"
            />
          </div>
        </div>
      )}

      {activeSubTab === 'indicadores' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Clock}
              label="Tempo Permanência"
              value={`${dados.tempo_permanencia.toFixed(1)} meses`}
              subvalue="Média (alunos 4+ meses)"
              variant="cyan"
            />
            <KPICard
              icon={Percent}
              label="NPS Evasões"
              value={dados.nps_evasoes.toFixed(1)}
              subvalue="Nota média das evasões"
              variant="amber"
            />
            <KPICard
              icon={DollarSign}
              label="LTV"
              value={formatCurrency(dados.ltv_medio)}
              subvalue="Ticket × Permanência"
              variant="violet"
            />
            <KPICard
              icon={Percent}
              label="Taxa Renovação"
              value={`${dados.renovacoes_pct.toFixed(0)}%`}
              variant="emerald"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default TabGestao;
