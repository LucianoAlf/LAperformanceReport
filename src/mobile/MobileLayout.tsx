import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { PageTitleProvider } from '@/contexts/PageTitleContext';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { useUnidadeFiltro } from '@/hooks/useUnidadeFiltro';
import { MobileHeader } from './MobileHeader';

function iniciaisDoNome(nome: string | null | undefined): string {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/u);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase() || '?';
}

export function MobileLayout() {
  const { unidadeSelecionada, setUnidadeSelecionada, filtroAtivo, unidadesDisponiveis } = useUnidadeFiltro();
  const competencia = useCompetenciaFiltro();
  const { usuario } = useAuth();

  const [periodoLabelOverride, setPeriodoLabelOverride] = useState<string | null>(null);
  const setPeriodoLabel = useCallback((label: string | null) => setPeriodoLabelOverride(label), []);

  const unidadeNome =
    unidadesDisponiveis.find((u) => u.id === unidadeSelecionada)?.nome ?? null;

  return (
    <PageTitleProvider>
      <div className="flex h-[100dvh] flex-col bg-slate-950">
        <MobileHeader
          unidadeNome={unidadeNome}
          onAbrirUnidades={() => { /* Task 6 liga a folha de unidades */ }}
          iniciais={iniciaisDoNome(usuario?.nome ?? usuario?.email ?? null)}
        />

        <main className="min-h-0 flex-1 overflow-y-auto p-3">
          <Outlet context={{ filtroAtivo, unidadeSelecionada, setUnidadeSelecionada, competencia, setPeriodoLabel }} />
        </main>
      </div>
    </PageTitleProvider>
  );
}

export default MobileLayout;
