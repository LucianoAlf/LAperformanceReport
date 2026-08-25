import { useMemo } from 'react';
import { Guitar, Users, Clock, AlertTriangle } from 'lucide-react';
import { KPIGrid } from '@/components/ui/KPIGrid';
import { KPICard } from '@/components/ui/KPICard';
import { DonutChart } from '@/components/ui/DonutChart';
import { BarChartHorizontal } from '@/components/ui/BarChartHorizontal';
import { CORES_UNIDADES } from '@/types/comercial';
import { useBandasKpis } from '@/hooks/useBandas';

/** Cor fixa por unidade (mesma convenção do Comercial) — a unidade tem a MESMA cor nos 3 gráficos */
function corUnidade(nome: string): string | undefined {
  return CORES_UNIDADES[nome as keyof typeof CORES_UNIDADES];
}

interface DashboardBandasTabProps {
  unidadeAtual: string;
}

export function DashboardBandasTab({ unidadeAtual }: DashboardBandasTabProps) {
  const { kpis, loading } = useBandasKpis(unidadeAtual);

  const totais = useMemo(() => {
    const totalBandas = kpis.reduce((acc, k) => acc + k.total_bandas, 0);
    const alunosEmBanda = kpis.reduce((acc, k) => acc + k.alunos_em_banda, 0);
    const bandasComVaga = kpis.reduce((acc, k) => acc + k.bandas_com_vaga, 0);
    const comPermanencia = kpis.filter((k) => k.permanencia_media != null && k.alunos_em_banda > 0);
    const permanenciaPonderada = comPermanencia.length > 0
      ? comPermanencia.reduce((acc, k) => acc + Number(k.permanencia_media) * k.alunos_em_banda, 0)
        / comPermanencia.reduce((acc, k) => acc + k.alunos_em_banda, 0)
      : null;
    return { totalBandas, alunosEmBanda, bandasComVaga, permanenciaPonderada };
  }, [kpis]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-400">Carregando KPIs...</div>;
  }

  return (
    <div className="space-y-6">
      <KPIGrid columns={4}>
        <KPICard
          title="Bandas ativas"
          value={totais.totalBandas}
          icon={Guitar}
          variant="violet"
          tooltip="Bandas com status ativa, criadas a partir das turmas de Power Kids, Minha Banda e GarageBand"
        />
        <KPICard
          title="Alunos em banda"
          value={totais.alunosEmBanda}
          icon={Users}
          variant="cyan"
          tooltip="Pessoas únicas com matrícula ativa em curso de banda"
        />
        <KPICard
          title="Permanência média"
          value={totais.permanenciaPonderada != null ? `${totais.permanenciaPonderada.toFixed(1).replace('.', ',')} meses` : '—'}
          icon={Clock}
          variant="emerald"
          tooltip="Tempo médio de escola dos alunos em banda (ponderado por unidade)"
        />
        <KPICard
          title="Bandas com vaga"
          value={totais.bandasComVaga}
          icon={AlertTriangle}
          variant="amber"
          tooltip="Bandas ativas com menos de 3 integrantes — ver aba Garimpar"
        />
      </KPIGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <DonutChart
          title="Bandas por unidade"
          centerLabel="bandas"
          data={kpis.map((k) => ({ name: k.unidade_nome, value: k.total_bandas, color: corUnidade(k.unidade_nome) }))}
        />
        <BarChartHorizontal
          title="Alunos em banda por unidade"
          data={kpis.map((k) => ({ name: k.unidade_nome, value: k.alunos_em_banda, color: corUnidade(k.unidade_nome) }))}
        />
      </div>

      <BarChartHorizontal
        title="Permanência média por unidade (meses)"
        valueFormatter={(v) => `${Number(v).toFixed(1).replace('.', ',')} meses`}
        data={kpis
          .filter((k) => k.permanencia_media != null)
          .map((k) => ({ name: k.unidade_nome, value: Number(k.permanencia_media), color: corUnidade(k.unidade_nome) }))}
      />
    </div>
  );
}
