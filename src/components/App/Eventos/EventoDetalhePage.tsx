import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Mic2,
  ArrowLeft,
  CalendarDays,
  MapPin,
  Users,
  LayoutList,
  Speaker,
  Ticket,
  ClipboardCheck,
  UserCheck,
  Pencil,
  Sheet,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { supabase } from '@/lib/supabase';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { AvisoNaoOtimizado } from '@/mobile/AvisoNaoOtimizado';
import { abaFoiPortada } from '@/mobile/abasPortadas';
import { useShellMobile } from '@/hooks/useShellMobile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useEvento,
  useRelatoriosDoEvento,
  sincronizarRecital,
  EVENTO_STATUS_LABEL,
  type EventoStatus,
} from '@/hooks/useEventos';
import { ModalEditarEvento } from './ModalEditarEvento';
import { AlunosTab } from './AlunosTab';
import { GradeTab } from './GradeTab';
import { PalcoTab } from './PalcoTab';
import { RevisaoTab } from './RevisaoTab';
import { CheckinTab } from './CheckinTab';
import { DocumentosTab } from './DocumentosTab';
import { BilheteriaTab } from './BilheteriaTab';

// O id 'grade' fica mesmo com o rótulo "Blocos" (08/10/2026): links salvos com ?tab=grade continuam abrindo.
type TabAtiva = 'alunos' | 'grade' | 'palco' | 'bilheteria' | 'revisao' | 'documentos' | 'checkin';

const STATUS_VARIANT: Record<EventoStatus, 'default' | 'success' | 'warning' | 'error'> = {
  rascunho: 'warning',
  publicado: 'default',
  realizado: 'success',
  cancelado: 'error',
};

const TABS_VALIDAS: TabAtiva[] = ['alunos', 'grade', 'palco', 'bilheteria', 'revisao', 'documentos', 'checkin'];

/**
 * Fila de alocacao: quem ja tem trabalho do professor no LA Teacher e nao tem
 * apresentacao na grade. O quadro vive no topo do evento porque e a pergunta que a
 * coordenacao responde primeiro — some sozinho quando a fila zera. Um clique abre a
 * aba Alunos ja filtrada nessas pessoas.
 */
function QuadroFaltaAlocar({ eventoId, onAbrir }: { eventoId: number; onAbrir: () => void }) {
  const { relatorios } = useRelatoriosDoEvento(eventoId);
  const faixas = { musica: 0, enviado: 0, aprovado: 0 };
  // Uma pessoa pode ter relatorio em dois cursos: conta pela faixa MAIS urgente dela.
  const porPessoa = new Map<string, number>();
  for (const r of relatorios) {
    if (r.apresentacao_id !== null) continue;
    const tier = r.aprovado_em || r.relatorio_status === 'aprovado' ? 3
      : r.enviado_em || r.relatorio_status === 'enviado' ? 2
      : r.musica_lancada ? 1 : 0;
    if (tier > (porPessoa.get(r.pessoa_chave) ?? 0)) porPessoa.set(r.pessoa_chave, tier);
  }
  for (const t of porPessoa.values()) {
    if (t === 3) faixas.aprovado += 1;
    else if (t === 2) faixas.enviado += 1;
    else faixas.musica += 1;
  }
  const total = faixas.musica + faixas.enviado + faixas.aprovado;
  if (total === 0) return null;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-left sm:px-4 transition-colors hover:bg-amber-500/15"
    >
      <span className="text-[13px] font-medium text-amber-200">
        {total} aluno{total > 1 ? 's' : ''} com trabalho do professor no LA Teacher ainda sem lugar nos blocos
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
        {faixas.musica > 0 && (
          <span className="text-yellow-300">● {faixas.musica} música lançada</span>
        )}
        {faixas.enviado > 0 && (
          <span className="text-amber-300">● {faixas.enviado} enviado{faixas.enviado > 1 ? 's' : ''}</span>
        )}
        {faixas.aprovado > 0 && (
          <span className="font-medium text-rose-300">● {faixas.aprovado} aprovado{faixas.aprovado > 1 ? 's' : ''} — só falta cadeira</span>
        )}
      </span>
      <span className="ml-auto text-[12px] sm:text-[11.5px] text-amber-400/80">abrir a fila →</span>
    </button>
  );
}

// O `AbaFutura` (placeholder "Fase N — em breve") foi removido: as quatro abas passaram a
// ter tela de verdade. Ele nao fica "por via das duvidas" porque placeholder esquecido e o
// defeito que ele mesmo causou — a aba Palco anunciou a fase 4 como futura por dois commits
// depois de ela estar no ar.

export function EventoDetalhePage() {
  const { eventoId } = useParams<{ eventoId: string }>();
  const navigate = useNavigate();
  const id = Number(eventoId);
  const { evento, loading, erro, recarregar } = useEvento(Number.isFinite(id) ? id : null);
  const [editando, setEditando] = useState(false);
  /** Sobe quando o sync do LA Teacher gravou algo — remonta a aba para ler o novo dado. */
  const [syncTick, setSyncTick] = useState(0);
  const [sincSheets, setSincSheets] = useState(false);
  /** Cada clique no quadro "falta alocar" sobe — a aba Alunos aplica o filtro de novo. */
  const [pedidoFaltaAlocar, setPedidoFaltaAlocar] = useState(0);

  /** Botao manual — forca uma corrida da edge de planilhas (o cron roda a cada 15 min). */
  const atualizarPlanilhas = async () => {
    if (!evento?.id || sincSheets) return;
    setSincSheets(true);
    const { data, error } = await supabase.functions.invoke('recital-sheets-sync', {
      body: { evento_id: evento.id, origem: 'manual' },
    });
    setSincSheets(false);
    if (error) {
      toast.error(`Não consegui atualizar as planilhas: ${error.message}`);
      return;
    }
    if (data?.erros?.length) {
      toast.warning(`Planilhas atualizadas com ${data.erros.length} pendência(s) — a equipe confere o log.`);
      return;
    }
    toast.success(`Planilhas atualizadas — ${data?.planilhas ?? 0} aba(s) reescrita(s).`);
  };

  // Canal professor: ao abrir a sala, puxa o que o LA Teacher ja tem. A RPC e idempotente
  // e barata (uma passada sobre a view); a remontagem so acontece quando algo MUDOU, para
  // nao derrubar um campo que a pessoa esta digitando no mesmo instante.
  useEffect(() => {
    if (!evento?.id) return;
    let vivo = true;
    sincronizarRecital(evento.id).then(({ data, error }) => {
      if (!vivo || error || !data) return;
      if (data.apresentacoes_atualizadas > 0 || data.itens_professor > 0) {
        setSyncTick((t) => t + 1);
      }
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento?.id]);

  const ehCelular = useShellMobile() === 'mobile';
  const [searchParams, setSearchParams] = useSearchParams();
  const tabUrl = searchParams.get('tab');
  const [tabAtiva, setTabAtiva] = useState<TabAtiva>(() =>
    TABS_VALIDAS.includes(tabUrl as TabAtiva) ? (tabUrl as TabAtiva) : 'alunos',
  );

  useEffect(() => {
    if (tabUrl && TABS_VALIDAS.includes(tabUrl as TabAtiva)) setTabAtiva(tabUrl as TabAtiva);
  }, [tabUrl]);

  useSetPageTitle({
    titulo: evento?.titulo ?? 'Evento',
    subtitulo: evento
      ? `${evento.unidade_nome ?? ''} · ${
          evento.data_fim && evento.data_fim !== evento.data_evento
            ? `${format(parseISO(evento.data_evento), 'd')} – ${format(parseISO(evento.data_fim), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
            : format(parseISO(evento.data_evento), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
        }`
      : 'Carregando…',
    icone: Mic2,
    iconeCor: 'text-white',
    iconeWrapperCor: 'bg-gradient-to-br from-amber-500 to-orange-500',
  });

  const alterarTab = (tab: TabAtiva) => {
    setTabAtiva(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'alunos') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const tabs: PageTab<TabAtiva>[] = [
    { id: 'alunos', label: 'Alunos', shortLabel: 'Alunos', icon: Users },
    { id: 'grade', label: 'Blocos', shortLabel: 'Blocos', icon: LayoutList },
    { id: 'palco', label: 'Palco', shortLabel: 'Palco', icon: Speaker },
    // Bilheteria antes da Revisao: a revisao confere o recital inteiro, inclusive vendas
    { id: 'bilheteria', label: 'Bilheteria', shortLabel: 'Bilheteria', icon: Ticket },
    { id: 'revisao', label: 'Revisão', shortLabel: 'Revisão', icon: ClipboardCheck },
    // Documentos depois da Revisão: confere, depois imprime (reunião de 08/10/2026).
    { id: 'documentos', label: 'Documentos', shortLabel: 'Documentos', icon: FileText },
    // Ultima aba de proposito: a ordem das abas e a ordem do trabalho, e o check-in so
    // acontece no dia — depois de participacao, grade, palco e revisao estarem prontos.
    { id: 'checkin', label: 'Check-in', shortLabel: 'Check-in', icon: UserCheck },
  ];

  if (loading) {
    return <p className="p-8 text-center text-sm text-slate-400">Carregando evento…</p>;
  }

  // Inexistente e "de outra unidade" dao a mesma tela de proposito — dizer qual dos dois
  // e informaria a existencia de um evento que a policy acabou de esconder.
  if (erro || !evento) {
    return (
      <div className="rounded-xl border border-slate-700 p-10 text-center">
        <p className="text-sm text-slate-300">Evento não encontrado.</p>
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => navigate('/app/eventos')}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para os eventos
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* No celular: voltar + ações na 1ª linha, data/local/status na 2ª. As ações viram só
          ícone (com aria-label) — o texto empurrava a data para uma 3ª linha. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" onClick={() => navigate('/app/eventos')}>
          <ArrowLeft className="h-4 w-4" />
          Eventos
        </Button>

        <div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-300 sm:order-none sm:ml-auto sm:w-auto">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
            {evento.data_fim && evento.data_fim !== evento.data_evento
              ? `${format(parseISO(evento.data_evento), 'd')} – ${format(parseISO(evento.data_fim), 'd MMM yyyy', { locale: ptBR })}`
              : format(parseISO(evento.data_evento), 'd MMM yyyy', { locale: ptBR })}
            <span className="text-slate-500">·</span>
            {evento.horario_inicio?.slice(0, 5)}
          </span>
          {evento.local && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-slate-500" />
              {evento.local}
            </span>
          )}
          <Badge variant={STATUS_VARIANT[evento.status]}>{EVENTO_STATUS_LABEL[evento.status]}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2 text-[12px]"
            onClick={atualizarPlanilhas}
            disabled={sincSheets}
            title="Reescreve as planilhas do Drive agora (o cron roda a cada 15 min)"
            aria-label="Atualizar planilhas"
          >
            <Sheet className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">{sincSheets ? 'Atualizando…' : 'Atualizar planilhas'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2 text-[12px]"
            onClick={() => setEditando(true)}
            aria-label="Editar evento"
          >
            <Pencil className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
        </div>
      </div>

      <ModalEditarEvento
        aberto={editando}
        evento={evento}
        onFechar={() => setEditando(false)}
        onSalvo={recarregar}
      />

      <QuadroFaltaAlocar
        eventoId={evento.id}
        onAbrir={() => {
          setPedidoFaltaAlocar((t) => t + 1);
          alterarTab('alunos');
        }}
      />

      {/* Sete abas não cabem num trilho de 390px sem esconder metade: no celular vira um
          botão com a aba atual que abre a lista inteira (mesmo padrão da Agenda/Alunos). */}
      {/* Faixa por aba: o shell suprime a dele nesta rota (ROTAS_COM_FAIXA_POR_ABA). */}
      {ehCelular && !abaFoiPortada('/app/eventos/*', tabAtiva) && <AvisoNaoOtimizado />}

      <PageTabs
        tabs={tabs}
        activeTab={tabAtiva}
        onTabChange={alterarTab}
        seletorNoCelular="Seções do evento"
      />

      {/* `key={syncTick}`: remonta a aba quando o sync gravou algo do professor. Sem ela a
          Grade continuaria mostrando o estado de antes da sincronizacao ate o F5. */}
      {tabAtiva === 'alunos' && (
        <AlunosTab
          key={`alunos-${syncTick}`}
          evento={evento}
          onEventoMudou={() => recarregar({ silencioso: true })}
          eventoId={evento.id}
          unidadeId={evento.unidade_id}
          pedidoFaltaAlocar={pedidoFaltaAlocar}
        />
      )}
      {tabAtiva === 'grade' && <GradeTab
          key={`grade-${syncTick}`}
          evento={evento}
          onEventoMudou={() => recarregar({ silencioso: true })}
        />}
      {tabAtiva === 'palco' && <PalcoTab key={`palco-${syncTick}`} evento={evento} />}
      {tabAtiva === 'bilheteria' && <BilheteriaTab key={`bilheteria-${syncTick}`} evento={evento} />}
      {tabAtiva === 'revisao' && (
        <RevisaoTab key={`revisao-${syncTick}`} evento={evento} onIrPara={alterarTab} />
      )}
      {tabAtiva === 'documentos' && <DocumentosTab key={`documentos-${syncTick}`} evento={evento} />}
      {tabAtiva === 'checkin' && (
        <CheckinTab key={`checkin-${syncTick}`} evento={evento} onIrPara={alterarTab} />
      )}
    </div>
  );
}

export default EventoDetalhePage;
