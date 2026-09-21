import { useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { PageTitleProvider } from '@/contexts/PageTitleContext';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { useUnidadeFiltro } from '@/hooks/useUnidadeFiltro';
import { useUnidadesAtivas } from '@/hooks/useUnidadesAtivas';
import { podeVerEventos } from '@/lib/menuVisibilidade';
import { supabase } from '@/lib/supabase';
import { AvisoNaoOtimizado } from './AvisoNaoOtimizado';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileHeader } from './MobileHeader';
import { MobileMaisSheet } from './MobileMaisSheet';
import { FolhaUnidades } from './FolhaUnidades';
import { rotaTemFaixaPorAba } from './abasPortadas';
import { rotaFoiPortada } from './rotasPortadas';
import { labelDaUnidade, opcoesDeUnidade } from './unidadeLabel';

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
  const { unidadeSelecionada, setUnidadeSelecionada, filtroAtivo, canChangeUnidade } =
    useUnidadeFiltro();
  const competencia = useCompetenciaFiltro();
  const { usuario, isAdmin, unidadesPermitidas } = useAuth();
  const location = useLocation();

  const [periodoLabelOverride, setPeriodoLabelOverride] = useState<string | null>(null);
  const setPeriodoLabel = useCallback((label: string | null) => setPeriodoLabelOverride(label), []);

  const [maisAberto, setMaisAberto] = useState(false);
  const [unidadesAberto, setUnidadesAberto] = useState(false);

  // ⚠️ So consulta a rede para admin: `unidadesPermitidas` vem VAZIA para
  // ele (vinculo RBAC global), entao a lista dele nao sai do contexto de
  // autenticacao. Quem nao e admin escolhe entre as unidades dele mesmo.
  const { unidades: unidadesDaRede, erro: erroUnidades } = useUnidadesAtivas(isAdmin);
  const opcoesUnidade = opcoesDeUnidade(isAdmin, unidadesPermitidas, unidadesDaRede);

  // O "voltar" do Android troca a rota sem passar pelo onClick do NavLink
  // (ou pelo scrim) que fecham a folha — sem isto, ela ficaria por cima da
  // tela nova, porque MobileLayout nao desmonta ao navegar.
  useEffect(() => {
    setMaisAberto(false);
    setUnidadesAberto(false);
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
    // Eventos nao repete a regra aqui: ela mora em podeVerEventos (LAPE-39), que e o
    // unico ponto a trocar quando o modulo virar RBAC.
    eventosVisivel: podeVerEventos(usuario?.email),
  };

  // "Consolidado" so quando filtroAtivo e' null (rede inteira, escopo de
  // admin) — nunca por ausencia de nome. unidadesDisponiveis e' SEMPRE []
  // para admin (por desenho de useUnidadeFiltro) e `nome` pode ser null pro
  // fallback legado de nao-admin; nenhum dos dois casos e' consolidado.
  // ⚠️ O rotulo le das MESMAS opcoes que a folha oferece. Antes ele recebia
  // `unidadesDisponiveis`, que e' [] para admin — entao o admin que
  // escolhesse Campo Grande veria "Unidade" no cabecalho, sem nome.
  const unidadeLabel = labelDaUnidade(filtroAtivo, unidadeSelecionada, opcoesUnidade);

  // Uma leitura so: o aviso e a politica de rolagem sao a MESMA decisao
  // ("esta tela foi adaptada?"), e ler duas vezes deixa as duas livres para
  // divergir num refactor futuro.
  const portada = rotaFoiPortada(location.pathname);

  // Rota com abas decide a faixa por ABA, la dentro — o shell nao tem como
  // saber qual aba esta aberta. /app/alunos tem 8 abas em estagios diferentes
  // de adaptacao, e uma faixa unica mentiria nos dois sentidos: dizendo
  // "adaptada" na aba que ainda nao e, ou o contrario.
  // ⚠️ So a FAIXA muda de lugar; a rolagem lateral NAO. Numa rota mista, 7 das
  // 8 abas ainda precisam rolar para o lado — travar o <main> em
  // overflow-x-hidden cortaria justamente as que dependem da degradacao.
  const faixaPorAba = rotaTemFaixaPorAba(location.pathname);

  return (
    <PageTitleProvider>
      <div className="flex h-[100dvh] flex-col bg-slate-950">
        <MobileHeader
          unidadeNome={unidadeLabel}
          // Quem so tem uma unidade nao ganha botao: o MobileHeader renderiza
          // texto quando `onAbrirUnidades` vem ausente. `canChangeUnidade` e a
          // mesma regra do desktop (admin OU 2+ vinculos), lida do hook
          // canonico em vez de reescrita aqui.
          onAbrirUnidades={canChangeUnidade ? () => setUnidadesAberto(true) : undefined}
          iniciais={iniciaisDoUsuario(usuario?.nome ?? usuario?.email ?? null)}
        />

        {/* A rolagem lateral e a DEGRADACAO das telas ainda nao portadas (spec
            §8: "funciona, mas rola para o lado"). Aplicada ao <main> sem
            condicao, ela valia tambem para as telas ja adaptadas — e ali ela
            nao degrada nada, so ESCONDE estouro: qualquer filho alguns pixels
            largo demais vira rolagem horizontal em vez de aparecer como o
            defeito de layout que e. Tela portada que rola para o lado nao esta
            portada. */}
        <main
          className={`min-h-0 flex-1 overflow-y-auto p-3 ${
            portada ? 'overflow-x-hidden' : 'overflow-x-auto'
          }`}
        >
          {!portada && !faixaPorAba && <AvisoNaoOtimizado />}
          <Outlet context={{ filtroAtivo, unidadeSelecionada, setUnidadeSelecionada, competencia, setPeriodoLabel }} />
        </main>

        <MobileBottomNav onAbrirMais={() => setMaisAberto(true)} />

        <FolhaUnidades
          aberto={unidadesAberto}
          onFechar={() => setUnidadesAberto(false)}
          opcoes={opcoesUnidade}
          selecionada={unidadeSelecionada}
          onEscolher={setUnidadeSelecionada}
          erro={erroUnidades}
        />

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
