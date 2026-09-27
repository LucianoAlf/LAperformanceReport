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
  ClipboardCheck,
  UserCheck,
  Pencil,
} from 'lucide-react';

import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useEvento,
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
import { AvisoEmDesenvolvimento } from './AvisoEmDesenvolvimento';

type TabAtiva = 'alunos' | 'grade' | 'palco' | 'revisao' | 'checkin';

const STATUS_VARIANT: Record<EventoStatus, 'default' | 'success' | 'warning' | 'error'> = {
  rascunho: 'warning',
  publicado: 'default',
  realizado: 'success',
  cancelado: 'error',
};

const TABS_VALIDAS: TabAtiva[] = ['alunos', 'grade', 'palco', 'revisao', 'checkin'];

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
    { id: 'grade', label: 'Grade', shortLabel: 'Grade', icon: LayoutList },
    { id: 'palco', label: 'Palco', shortLabel: 'Palco', icon: Speaker },
    { id: 'revisao', label: 'Revisão', shortLabel: 'Revisão', icon: ClipboardCheck },
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" onClick={() => navigate('/app/eventos')}>
          <ArrowLeft className="h-4 w-4" />
          Eventos
        </Button>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-300">
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
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2 text-[12px]"
            onClick={() => setEditando(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      </div>

      <ModalEditarEvento
        aberto={editando}
        evento={evento}
        onFechar={() => setEditando(false)}
        onSalvo={recarregar}
      />

      <AvisoEmDesenvolvimento />

      <PageTabs tabs={tabs} activeTab={tabAtiva} onTabChange={alterarTab} />

      {/* `key={syncTick}`: remonta a aba quando o sync gravou algo do professor. Sem ela a
          Grade continuaria mostrando o estado de antes da sincronizacao ate o F5. */}
      {tabAtiva === 'alunos' && (
        <AlunosTab key={`alunos-${syncTick}`} eventoId={evento.id} unidadeId={evento.unidade_id} />
      )}
      {tabAtiva === 'grade' && <GradeTab key={`grade-${syncTick}`} evento={evento} />}
      {tabAtiva === 'palco' && <PalcoTab key={`palco-${syncTick}`} evento={evento} />}
      {tabAtiva === 'revisao' && (
        <RevisaoTab key={`revisao-${syncTick}`} evento={evento} onIrPara={alterarTab} />
      )}
      {tabAtiva === 'checkin' && <CheckinTab key={`checkin-${syncTick}`} evento={evento} />}
    </div>
  );
}

export default EventoDetalhePage;
