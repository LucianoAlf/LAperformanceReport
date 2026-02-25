import { useState, useEffect } from 'react';
import { UserMinus, RefreshCw, XCircle, Percent, DollarSign, AlertTriangle, ArrowRightLeft, Clock, Ban } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { DistributionChart } from '@/components/ui/DistributionChart';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { RankingTable } from '@/components/ui/RankingTable';
import { formatCurrency, getMesNomeCurto } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

interface TabRetencaoProps {
  ano: number;
  mes: number;
  unidade: UnidadeId;
}

interface Evasao {
  id: number;
  data_saida: string;
  aluno_id: number;
  aluno_nome: string;
  motivo_saida_id: number;
  motivo_nome: string;
  tipo_saida_id: number;
  tipo_nome: string;
  valor_parcela: number;
  professor_id: number;
  professor_nome: string;
  unidade_id: string;
}

interface Renovacao {
  id: number;
  data_vencimento: string;
  data_renovacao: string;
  aluno_id: number;
  status: string;
  unidade_id: string;
}

export function TabRetencao({ ano, mes, unidade }: TabRetencaoProps) {
  const [loading, setLoading] = useState(true);
  const [evasoes, setEvasoes] = useState<Evasao[]>([]);
  const [renovacoes, setRenovacoes] = useState<Renovacao[]>([]);
  const [motivosSaida, setMotivosSaida] = useState<{name: string; value: number}[]>([]);
  const [evasoesPorProfessor, setEvasoesPorProfessor] = useState<{id: number; nome: string; valor: number}[]>([]);
  const [totais, setTotais] = useState({
    evasoes: 0,
    evasoesInterrompidas: 0,
    avisosPrevios: 0,
    transferencias: 0,
    taxaEvasao: 0,
    renovacoes: 0,
    naoRenovacoes: 0,
    pendentes: 0,
    atrasadas: 0,
    taxaRenovacao: 0,
    taxaNaoRenovacao: 0,
    cancelamentos: 0,
    taxaCancelamento: 0,
    mrrPerdido: 0,
  });

  useEffect(() => {
    async function fetchDados() {
      setLoading(true);
      try {
        const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const endDate = `${ano}-${String(mes).padStart(2, '0')}-31`;

        // Buscar evasões do mês - query simplificada
        let evasoesQuery = supabase
          .from('movimentacoes_admin')
          .select('id, data, aluno_id, motivo_saida_id, tipo, tipo_evasao, valor_parcela_evasao, valor_parcela_anterior, professor_id, unidade_id')
          .in('tipo', ['evasao', 'nao_renovacao', 'aviso_previo'])
          .gte('data', startDate)
          .lte('data', endDate);

        // Buscar renovações do mês
        let renovacoesQuery = supabase
          .from('renovacoes')
          .select('*')
          .gte('data_vencimento', startDate)
          .lte('data_vencimento', endDate);

        // Filtrar por unidade se não for consolidado
        if (unidade !== 'todos') {
          evasoesQuery = evasoesQuery.eq('unidade_id', unidade);
          renovacoesQuery = renovacoesQuery.eq('unidade_id', unidade);
        }

        const [evasoesRes, renovacoesRes] = await Promise.all([
          evasoesQuery,
          renovacoesQuery,
        ]);

        if (evasoesRes.error) throw evasoesRes.error;
        if (renovacoesRes.error) throw renovacoesRes.error;

        // Processar evasões
        const evasoesData = (evasoesRes.data || []).map((e: any) => ({
          id: e.id,
          data_saida: e.data_evasao,
          aluno_id: e.aluno_id,
          aluno_nome: `Aluno ${e.aluno_id || 'N/A'}`,
          motivo_saida_id: e.motivo_saida_id,
          motivo_nome: `Motivo ${e.motivo_saida_id || 'N/A'}`,
          tipo_saida_id: e.tipo_saida_id,
          tipo_nome: e.tipo_saida_id === 1 ? 'Interrompido' : e.tipo_saida_id === 2 ? 'Não Renovou' : e.tipo_saida_id === 3 ? 'Aviso Prévio' : 'Outro',
          valor_parcela: e.valor_parcela || 0,
          professor_id: e.professor_id,
          professor_nome: `Professor ${e.professor_id || 'N/A'}`,
          unidade_id: e.unidade_id,
        }));

        setEvasoes(evasoesData);
        setRenovacoes(renovacoesRes.data || []);

        // Calcular totais de evasões por tipo
        const totalEvasoes = evasoesData.length;
        const evasoesInterrompidas = evasoesData.filter(e => e.tipo_nome?.toLowerCase().includes('interrompido')).length;
        const avisosPrevios = evasoesData.filter(e => e.tipo_nome?.toLowerCase().includes('aviso')).length;
        const transferencias = evasoesData.filter(e => e.tipo_nome?.toLowerCase().includes('transfer')).length;
        const mrrPerdido = evasoesData.reduce((acc, e) => acc + (e.valor_parcela || 0), 0);

        // Motivos de saída para gráfico
        const motivosMap = new Map<string, number>();
        evasoesData.forEach(e => {
          const motivo = e.motivo_nome || 'Outros';
          motivosMap.set(motivo, (motivosMap.get(motivo) || 0) + 1);
        });
        const motivosData = Array.from(motivosMap.entries()).map(([name, value]) => ({ name, value }));
        setMotivosSaida(motivosData);

        // Evasões por professor para ranking
        const evasoesProfMap = new Map<string, { id: number; count: number }>();
        evasoesData.forEach(e => {
          const nome = e.professor_nome || 'N/A';
          const current = evasoesProfMap.get(nome) || { id: e.professor_id, count: 0 };
          evasoesProfMap.set(nome, { id: current.id, count: current.count + 1 });
        });
        const evasoesProfData = Array.from(evasoesProfMap.entries())
          .map(([nome, data]) => ({ id: data.id, nome, valor: data.count }))
          .sort((a, b) => b.valor - a.valor);
        setEvasoesPorProfessor(evasoesProfData);

        // Calcular totais de renovações
        const renovacoesData = renovacoesRes.data || [];
        const renovadas = renovacoesData.filter(r => r.status === 'realizada').length;
        const naoRenovadas = renovacoesData.filter(r => r.status === 'nao_renovada').length;
        const pendentes = renovacoesData.filter(r => r.status === 'pendente').length;
        const atrasadas = renovacoesData.filter(r => {
          if (r.status !== 'pendente') return false;
          const vencimento = new Date(r.data_vencimento);
          return vencimento < new Date();
        }).length;
        const totalRenovacoes = renovadas + naoRenovadas;
        const taxaRenovacao = totalRenovacoes > 0 ? (renovadas / totalRenovacoes) * 100 : 0;
        const taxaNaoRenovacao = totalRenovacoes > 0 ? (naoRenovadas / totalRenovacoes) * 100 : 0;

        // Buscar total de alunos para calcular taxa de evasão (inclui trancados — consistente com aba Alunos e Dashboard)
        const { count: totalAlunos } = await supabase
          .from('alunos')
          .select('*', { count: 'exact', head: true })
          .in('status', ['ativo', 'trancado']);
        const taxaEvasao = totalAlunos && totalAlunos > 0 ? (totalEvasoes / totalAlunos) * 100 : 0;

        setTotais({
          evasoes: totalEvasoes,
          evasoesInterrompidas,
          avisosPrevios,
          transferencias,
          taxaEvasao,
          renovacoes: renovadas,
          naoRenovacoes: naoRenovadas,
          pendentes,
          atrasadas,
          taxaRenovacao,
          taxaNaoRenovacao,
          cancelamentos: evasoesInterrompidas, // cancelamentos = evasões interrompidas
          taxaCancelamento: totalAlunos && totalAlunos > 0 ? (evasoesInterrompidas / totalAlunos) * 100 : 0,
          mrrPerdido,
        });
      } catch (err) {
        console.error('Erro ao carregar dados de retenção:', err);
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

  return (
    <div className="space-y-6">
      {/* KPI Cards - Linha 1: Evasões */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          icon={UserMinus}
          label="Evasões (Mês)"
          value={totais.evasoes}
          variant="rose"
        />
        <KPICard
          icon={Ban}
          label="Interrompidas"
          value={totais.evasoesInterrompidas}
          variant="rose"
        />
        <KPICard
          icon={AlertTriangle}
          label="Avisos Prévios"
          value={totais.avisosPrevios}
          variant="amber"
        />
        <KPICard
          icon={ArrowRightLeft}
          label="Transferências"
          value={totais.transferencias}
          variant="cyan"
        />
        <KPICard
          icon={Percent}
          label="Taxa Evasão"
          value={`${totais.taxaEvasao.toFixed(1)}%`}
          variant="rose"
        />
        <KPICard
          icon={DollarSign}
          label="MRR Perdido"
          value={formatCurrency(totais.mrrPerdido)}
          variant="rose"
        />
      </div>

      {/* KPI Cards - Linha 2: Renovações */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          icon={RefreshCw}
          label="Renovações"
          value={totais.renovacoes}
          variant="emerald"
        />
        <KPICard
          icon={XCircle}
          label="Não Renovações"
          value={totais.naoRenovacoes}
          variant="amber"
        />
        <KPICard
          icon={Clock}
          label="Pendentes"
          value={totais.pendentes}
          variant="default"
        />
        <KPICard
          icon={AlertTriangle}
          label="Atrasadas"
          value={totais.atrasadas}
          variant="rose"
        />
        <KPICard
          icon={Percent}
          label="Taxa Renovação"
          value={`${totais.taxaRenovacao.toFixed(1)}%`}
          variant="emerald"
        />
        <KPICard
          icon={Percent}
          label="Taxa Não Renovação"
          value={`${totais.taxaNaoRenovacao.toFixed(1)}%`}
          variant="amber"
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionChart
          data={motivosSaida}
          title="Motivos de Saída"
        />
        <RankingTable
          data={evasoesPorProfessor}
          title="⚠️ Evasões por Professor"
          valorLabel="Evasões"
          variant="gold"
          valorFormatter={(v) => `${v} evasões`}
          maxItems={5}
        />
      </div>

      {/* Tabela de Evasões */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-700/50">
          <h3 className="text-lg font-bold text-white">Evasões do Mês</h3>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-800">
              <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 text-left">Data</th>
                <th className="py-3 px-4 text-left">Aluno</th>
                <th className="py-3 px-4 text-left">Tipo</th>
                <th className="py-3 px-4 text-left">Motivo</th>
                <th className="py-3 px-4 text-left">Professor</th>
                <th className="py-3 px-4 text-right">Parcela</th>
              </tr>
            </thead>
            <tbody>
              {evasoes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Nenhuma evasão registrada neste período 🎉
                  </td>
                </tr>
              ) : (
                evasoes.slice(0, 15).map((e) => (
                  <tr key={e.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                    <td className="py-2 px-4 text-slate-300 text-sm">
                      {new Date(e.data_saida).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2 px-4 text-white font-medium text-sm">{e.aluno_nome}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        e.tipo_nome?.toLowerCase().includes('interrompido') ? 'bg-rose-500/20 text-rose-400' :
                        e.tipo_nome?.toLowerCase().includes('aviso') ? 'bg-amber-500/20 text-amber-400' :
                        e.tipo_nome?.toLowerCase().includes('transfer') ? 'bg-cyan-500/20 text-cyan-400' :
                        'bg-slate-500/20 text-slate-400'
                      }`}>
                        {e.tipo_nome}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-slate-400 text-sm">{e.motivo_nome}</td>
                    <td className="py-2 px-4 text-slate-300 text-sm">{e.professor_nome}</td>
                    <td className="py-2 px-4 text-right text-rose-400 font-medium text-sm">
                      {formatCurrency(e.valor_parcela)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TabRetencao;
