import { useState, useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { PageTitleProvider } from '@/contexts/PageTitleContext';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { useUnidadeFiltro } from '@/hooks/useUnidadeFiltro';
import { supabase } from '@/lib/supabase';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileHeader } from './MobileHeader';
import { MobileMaisSheet } from './MobileMaisSheet';

// Copiado de AppSidebar.tsx — mesma lista, mesma consulta.
// Unificar num useMenuVisibilidade() compartilhado é trabalho da etapa 2 (LAPE-32).
const TRAFEGO_PAGO_EMAILS = ['hugo@gmail.com', 'lucianoalf.la@gmail.com'];
const DEV_EMAIL = 'hugo@lamusic.com.br';

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
  const { usuario, isAdmin } = useAuth();

  const [periodoLabelOverride, setPeriodoLabelOverride] = useState<string | null>(null);
  const setPeriodoLabel = useCallback((label: string | null) => setPeriodoLabelOverride(label), []);

  const [maisAberto, setMaisAberto] = useState(false);

  const [campanhasVisivel, setCampanhasVisivel] = useState(false);
  useEffect(() => {
    const isDev = usuario?.email === DEV_EMAIL;
    supabase.from('campanhas_config').select('visibilidade_global').single()
      .then(({ data }) => setCampanhasVisivel(isDev || data?.visibilidade_global === true));
  }, [usuario?.email]);

  const contextoVisibilidade = {
    isAdmin,
    campanhasVisivel,
    trafegoPagoVisivel: TRAFEGO_PAGO_EMAILS.includes((usuario?.email ?? '').toLowerCase()),
  };

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

        <MobileBottomNav onAbrirMais={() => setMaisAberto(true)} />

        <MobileMaisSheet
          aberto={maisAberto}
          onFechar={() => setMaisAberto(false)}
          contexto={contextoVisibilidade}
        />
      </div>
    </PageTitleProvider>
  );
}

export default MobileLayout;
