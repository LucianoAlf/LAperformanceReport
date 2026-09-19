import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Mic2, ArrowLeft, CalendarDays, MapPin, Users, LayoutList, Speaker, ClipboardCheck } from 'lucide-react';

import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEvento, EVENTO_STATUS_LABEL, type EventoStatus } from '@/hooks/useEventos';
import { AlunosTab } from './AlunosTab';
import { GradeTab } from './GradeTab';
import { PalcoTab } from './PalcoTab';
import { RevisaoTab } from './RevisaoTab';
import { AvisoEmDesenvolvimento } from './AvisoEmDesenvolvimento';

type TabAtiva = 'alunos' | 'grade' | 'palco' | 'revisao';

const STATUS_VARIANT: Record<EventoStatus, 'default' | 'success' | 'warning' | 'error'> = {
  rascunho: 'warning',
  publicado: 'default',
  realizado: 'success',
  cancelado: 'error',
};

const TABS_VALIDAS: TabAtiva[] = ['alunos', 'grade', 'palco', 'revisao'];

// O `AbaFutura` (placeholder "Fase N — em breve") foi removido: as quatro abas passaram a
// ter tela de verdade. Ele nao fica "por via das duvidas" porque placeholder esquecido e o
// defeito que ele mesmo causou — a aba Palco anunciou a fase 4 como futura por dois commits
// depois de ela estar no ar.

export function EventoDetalhePage() {
  const { eventoId } = useParams<{ eventoId: string }>();
  const navigate = useNavigate();
  const id = Number(eventoId);
  const { evento, loading, erro } = useEvento(Number.isFinite(id) ? id : null);

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
      ? `${evento.unidade_nome ?? ''} · ${format(parseISO(evento.data_evento), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
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
            {format(parseISO(evento.data_evento), "d MMM yyyy", { locale: ptBR })}
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
      </div>

      <AvisoEmDesenvolvimento />

      <PageTabs tabs={tabs} activeTab={tabAtiva} onTabChange={alterarTab} />

      {tabAtiva === 'alunos' && <AlunosTab eventoId={evento.id} unidadeId={evento.unidade_id} />}
      {tabAtiva === 'grade' && <GradeTab evento={evento} />}
      {tabAtiva === 'palco' && <PalcoTab evento={evento} />}
      {tabAtiva === 'revisao' && <RevisaoTab evento={evento} onIrPara={alterarTab} />}
    </div>
  );
}

export default EventoDetalhePage;
