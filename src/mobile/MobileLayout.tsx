import { useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { PageTitleProvider } from '@/contexts/PageTitleContext';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { useUnidadeFiltro } from '@/hooks/useUnidadeFiltro';
import { supabase } from '@/lib/supabase';
import { AvisoNaoOtimizado } from './AvisoNaoOtimizado';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileHeader } from './MobileHeader';
import { MobileMaisSheet } from './MobileMaisSheet';
import { rotaFoiPortada } from './rotasPortadas';
import { labelDaUnidade } from './unidadeLabel';

// Copiado de AppSidebar.tsx — mesma lista, mesma consulta.
// Unificar num useMenuVisibilidade() compartilhado é trabalho da etapa 2 (LAPE-32).
const TRAFEGO_PAGO_EMAILS = ['hugo@gmail.com', 'lucianoalf.la@gmail.com'];
const DEV_EMAIL = 'hugo@lamusic.com.br';

// Nome local (nao a `iniciaisDoNome` de src/lib/agenda.ts): a de agenda.ts
// devolve 2 letras pra nome de uma palavra so; esta devolve 1. Comportamentos
// diferentes com o mesmo nome convidam a "deduplicar" e quebrar a Agenda.
function iniciaisDoUsuario(nome: string | null | undefined): string {
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
  const location = useLocation();

  const [periodoLabelOverride, setPeriodoLabelOverride] = useState<string | null>(null);
  const setPeriodoLabel = useCallback((label: string | null) => setPeriodoLabelOverride(label), []);

  const [maisAberto, setMaisAberto] = useState(false);

  // O "voltar" do Android troca a rota sem passar pelo onClick do NavLink
  // (ou pelo scrim) que fecham a folha — sem isto, ela ficaria por cima da
  // tela nova, porque MobileLayout nao desmonta ao navegar.
  useEffect(() => {
    setMaisAberto(false);
  }, [location.pathname]);

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

  // "Consolidado" so quando filtroAtivo e' null (rede inteira, escopo de
  // admin) — nunca por ausencia de nome. unidadesDisponiveis e' SEMPRE []
  // para admin (por desenho de useUnidadeFiltro) e `nome` pode ser null pro
  // fallback legado de nao-admin; nenhum dos dois casos e' consolidado.
  const unidadeLabel = labelDaUnidade(filtroAtivo, unidadeSelecionada, unidadesDisponiveis);

  return (
    <PageTitleProvider>
      <div className="flex h-[100dvh] flex-col bg-slate-950">
        <MobileHeader
          unidadeNome={unidadeLabel}
          // A folha de unidades e' da etapa 2 — enquanto nao existir, o
          // MobileHeader recebe onAbrirUnidades ausente e renderiza texto,
          // nao botao (ver MobileHeader.tsx).
          iniciais={iniciaisDoUsuario(usuario?.nome ?? usuario?.email ?? null)}
        />

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-auto p-3">
          {!rotaFoiPortada(location.pathname) && <AvisoNaoOtimizado />}
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
