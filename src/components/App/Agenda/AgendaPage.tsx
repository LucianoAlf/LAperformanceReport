import { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useAgendaDia, type AulaAgenda } from '@/hooks/useAgendaDia';
import { contarEmAulaAgora, diaIncompleto, minutosAgora } from '@/lib/agenda';
import { AgendaTimeline } from './AgendaTimeline';
import { AgendaDrawer } from './AgendaDrawer';
import { cn } from '@/lib/utils';

export default function AgendaPage() {
  const [data, setData] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  // Unidade fica travada em "todas" nesta entrega — o UnidadeFilter do app
  // entra no passo seguinte, plugando aqui.
  const [unidadeId] = useState<string | null>(null);
  const [agruparPor, setAgruparPor] = useState<'professor' | 'sala'>('professor');
  const [selecionada, setSelecionada] = useState<AulaAgenda | null>(null);

  const { aulas, carregando, erro, frescor } = useAgendaDia({ data, unidadeId });

  // O KPI "em aula agora" precisa andar junto com a regua, nao so quando a
  // lista de aulas muda — senao congela no minuto em que a pagina abriu.
  const [minutos, setMinutos] = useState(() => minutosAgora(new Date()));
  useEffect(() => {
    const id = setInterval(() => setMinutos(minutosAgora(new Date())), 30000);
    return () => clearInterval(id);
  }, []);

  const agora = useMemo(() => contarEmAulaAgora(aulas, minutos), [aulas, minutos]);
  const canceladas = aulas.filter((a) => a.cancelada).length;
  const experimentais = aulas.filter((a) => a.categoria === 'experimental').length;
  const emRisco = aulas.filter((a) => a.alunos.some((al) => (al.risco_pct ?? 0) >= 40)).length;

  function mover(dias: number) {
    setData(format(addDays(parseISO(data), dias), 'yyyy-MM-dd'));
    setSelecionada(null);
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Agenda</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => mover(-1)} aria-label="Dia anterior"
            className="h-7 w-7 rounded-md border border-slate-700 text-slate-300 hover:text-white">
            <ChevronLeft className="mx-auto h-4 w-4" />
          </button>
          <button type="button" onClick={() => mover(1)} aria-label="Próximo dia"
            className="h-7 w-7 rounded-md border border-slate-700 text-slate-300 hover:text-white">
            <ChevronRight className="mx-auto h-4 w-4" />
          </button>
          <span className="font-semibold">
            {format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Sincronizado {frescor}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Grupo
          opcoes={[
            { valor: 'professor', rotulo: 'Professores' },
            { valor: 'sala', rotulo: 'Salas' },
          ]}
          valor={agruparPor}
          onChange={(v) => setAgruparPor(v as 'professor' | 'sala')}
        />
      </div>

      {diaIncompleto(data) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[13px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Este dia está incompleto no banco. Aulas entre 19/07 e 01/08/2026 foram perdidas por uma
            falha de sincronização e não foram recuperadas — o que aparece aqui é parcial.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-700 sm:grid-cols-5">
        <Kpi rotulo="Aulas no dia" valor={String(aulas.length)} />
        <Kpi rotulo="Em aula agora" valor={String(agora.aulas)} nota={`${agora.salas} salas`} destaque="text-emerald-400" />
        <Kpi rotulo="Canceladas" valor={String(canceladas)} destaque="text-rose-400" />
        <Kpi rotulo="Experimentais" valor={String(experimentais)} />
        <Kpi rotulo="Alunos em risco" valor={String(emRisco)} destaque="text-amber-400" />
      </div>

      {erro && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
          Não foi possível carregar a agenda: {erro}
        </p>
      )}

      {carregando ? (
        <p className="p-8 text-center text-sm text-slate-400">Carregando agenda…</p>
      ) : aulas.length === 0 && !diaIncompleto(data) ? (
        <p className="p-8 text-center text-sm text-slate-400">Nenhuma aula neste dia.</p>
      ) : aulas.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">
          Nenhuma aula recuperada para este dia (janela de dados incompleta).
        </p>
      ) : (
        <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-slate-700">
          <div className="min-w-0 flex-1">
            <AgendaTimeline
              aulas={aulas}
              agruparPor={agruparPor}
              selecionada={selecionada}
              onSelecionar={setSelecionada}
            />
          </div>
          <AgendaDrawer aula={selecionada} />
        </div>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, nota, destaque }: {
  rotulo: string; valor: string; nota?: string; destaque?: string;
}) {
  return (
    <div className="bg-slate-900 px-4 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{rotulo}</p>
      <p className={cn('text-xl font-semibold tabular-nums', destaque)}>
        {valor} {nota && <span className="text-[11.5px] font-normal text-slate-400">{nota}</span>}
      </p>
    </div>
  );
}

function Grupo({ opcoes, valor, onChange }: {
  opcoes: Array<{ valor: string; rotulo: string }>;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-md border border-slate-700 bg-slate-900 p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'rounded px-3 py-1 text-[12.5px]',
            valor === o.valor ? 'bg-slate-800 font-semibold text-white' : 'text-slate-400',
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
