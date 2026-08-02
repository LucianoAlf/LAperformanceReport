import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDays, format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarClock, Search, X } from 'lucide-react';
import { useAgendaDia, type AulaAgenda } from '@/hooks/useAgendaDia';
import {
  contarEmAulaAgora,
  filtrarAulas,
  filtroAtivo,
  formatarDataCalculo,
  minutosAgora,
  opcoesDoCampo,
  riscoDesatualizado,
  FILTROS_AGENDA_VAZIOS,
  type FiltrosAgenda,
  type TipoAula,
} from '@/lib/agenda';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { AgendaTimeline } from './AgendaTimeline';
import { AgendaDrawer } from './AgendaDrawer';
import { cn } from '@/lib/utils';

/**
 * Rotulo do dia tolerante a data invalida. `format` da date-fns lanca
 * RangeError com data invalida, e como isso acontece no corpo do componente
 * derruba a pagina inteira — um valor ruim vindo de um filtro externo nao pode
 * ter esse poder.
 */
function rotuloDoDia(data: string): string {
  const d = parseISO(data);
  if (!isValid(d)) return data;
  return format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
}

// Retorno de useCompetenciaFiltro, repassado pelo AppLayout via Outlet. A
// Agenda navega por DIA, entao o periodo escolhido so define para onde saltar.
// ⚠️ O objeto NAO tem `ano`/`mes` no topo — eles vivem em `filtro`. Usamos
// `range`, que ja resolve mensal, trimestral, semestral, anual e personalizado
// num par de datas.
type Competencia = ReturnType<typeof useCompetenciaFiltro>;

interface OutletContext {
  unidadeSelecionada: string | null;
  competencia?: Competencia;
}

export default function AgendaPage() {
  useSetPageTitle({
    titulo: 'Agenda',
    subtitulo: 'Aulas do dia por professor ou sala, ao vivo',
    icone: CalendarClock,
    iconeCor: 'text-white',
    iconeWrapperCor: 'bg-gradient-to-br from-cyan-500 to-blue-500',
  });

  // Mesmo seletor de unidade do header (admin) que as paginas irmas consomem —
  // null = consolidado ("todas"); usuario de unidade ja vem travado na sua.
  const context = useOutletContext<OutletContext | undefined>();
  const unidadeId = context?.unidadeSelecionada ?? null;
  const competencia = context?.competencia;

  const hoje = format(new Date(), 'yyyy-MM-dd');
  const [data, setData] = useState(hoje);
  const [agruparPor, setAgruparPor] = useState<'professor' | 'sala'>('professor');
  const [selecionada, setSelecionada] = useState<AulaAgenda | null>(null);
  const [filtros, setFiltros] = useState<FiltrosAgenda>(FILTROS_AGENDA_VAZIOS);

  // A barra de competencia e a agenda tem de contar a MESMA historia: e
  // confuso ver "Jul/2026" no topo com aulas de agosto na tela. Por isso a
  // sincronia e nos DOIS sentidos.
  //
  // (1) Trocar o periodo salta a agenda para dentro dele: o dia de hoje quando
  //     ele cai no periodo, senao o primeiro dia.
  // (2) Navegar para um dia fora do periodo (setas, "Hoje") reposiciona o
  //     periodo no mes daquele dia — ver `irPara`.
  //
  // Nao ha laco: (1) escolhe um dia DENTRO do periodo, entao (2) nao dispara;
  // e (2) escolhe um periodo que CONTEM o dia, entao (1) nao dispara.
  const inicio = competencia?.range?.startDate || null;
  const fim = competencia?.range?.endDate || null;
  useEffect(() => {
    if (!inicio || !fim) return;
    if (data >= inicio && data <= fim) return;
    setData(hoje >= inicio && hoje <= fim ? hoje : inicio);
    setSelecionada(null);
    // `data` fica fora das deps de proposito: este efeito reage a troca de
    // PERIODO. A navegacao por dia e tratada por `irPara`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, hoje]);

  const { aulas: todasAsAulas, carregando, erro, frescor, prefetch } = useAgendaDia({
    data,
    unidadeId,
  });

  // Adianta os vizinhos assim que o dia atual termina de carregar (nunca junto,
  // pra nao competir com a consulta que o usuario esta de fato esperando).
  useEffect(() => {
    if (carregando) return;
    const id = setTimeout(() => {
      prefetch(format(addDays(parseISO(data), 1), 'yyyy-MM-dd'));
      prefetch(format(addDays(parseISO(data), -1), 'yyyy-MM-dd'));
    }, 300);
    return () => clearTimeout(id);
  }, [data, carregando, prefetch]);

  // Os selects sao montados a partir do dia INTEIRO, nao do resultado filtrado:
  // senao escolher um professor esvaziaria a lista de cursos para so aquele
  // professor e o usuario ficaria preso sem conseguir trocar de opcao.
  const cursos = useMemo(() => opcoesDoCampo(todasAsAulas, 'curso_nome'), [todasAsAulas]);
  const professores = useMemo(() => opcoesDoCampo(todasAsAulas, 'professor_nome'), [todasAsAulas]);
  const turmas = useMemo(() => opcoesDoCampo(todasAsAulas, 'turma_nome'), [todasAsAulas]);

  const aulas = useMemo(() => filtrarAulas(todasAsAulas, filtros), [todasAsAulas, filtros]);
  const filtrando = filtroAtivo(filtros);

  // Distinguir a PRIMEIRA carga (nao ha nada na tela, entao "Carregando" e a
  // unica coisa honesta a mostrar) de uma RECARGA por troca de dia/unidade, em
  // que o dia anterior continua valido como imagem enquanto o novo chega.
  const primeiraCarga = carregando && todasAsAulas.length === 0;
  const recarregando = carregando && !primeiraCarga;

  // O KPI "em aula agora" precisa andar junto com a regua, nao so quando a
  // lista de aulas muda — senao congela no minuto em que a pagina abriu.
  // O mesmo estado tambem alimenta a regua da AgendaTimeline (prop `minutos`),
  // pra existir um unico relogio em vez de dois setInterval desalinhados.
  const [minutos, setMinutos] = useState(() => minutosAgora(new Date()));
  useEffect(() => {
    const id = setInterval(() => setMinutos(minutosAgora(new Date())), 30000);
    return () => clearInterval(id);
  }, []);

  const agora = useMemo(() => contarEmAulaAgora(aulas, minutos), [aulas, minutos]);
  const canceladas = aulas.filter((a) => a.cancelada).length;
  const experimentais = aulas.filter((a) => a.categoria === 'experimental').length;

  // Alunos DISTINTOS em risco (>=40%), nao aulas: um aluno em 2 aulas no dia
  // ou uma turma com varios alunos em risco nao pode inflar a contagem.
  // aluno_id nulo (participante e lead, sem cadastro) nunca conta aqui.
  const emRisco = useMemo(() => {
    const idsEmRisco = new Set<number>();
    for (const aula of aulas) {
      for (const aluno of aula.alunos) {
        if (aluno.aluno_id != null && (aluno.risco_pct ?? 0) >= 40) {
          idsEmRisco.add(aluno.aluno_id);
        }
      }
    }
    return idsEmRisco.size;
  }, [aulas]);

  // O KPI conta risco calculado pelo modelo (cron calcular-risco-evasao-3d),
  // que pode estar pausado ha dias — nesse caso o numero acima nao e "agora".
  // Usa a data de calculo mais recente entre os alunos do dia como referencia
  // (todos sao pontuados no mesmo lote, entao normalmente coincidem).
  const dataCalculoRisco = useMemo(() => {
    let maisRecente: string | null = null;
    for (const aula of aulas) {
      for (const aluno of aula.alunos) {
        if (aluno.risco_calculado_em && (!maisRecente || aluno.risco_calculado_em > maisRecente)) {
          maisRecente = aluno.risco_calculado_em;
        }
      }
    }
    return maisRecente;
  }, [aulas]);
  const riscoGeralDesatualizado = riscoDesatualizado(dataCalculoRisco, new Date());

  // Trocar de unidade no header troca o conjunto de aulas: a selecao antiga
  // sumiu da timeline, mas o drawer continuaria mostrando ela. Mesmo motivo
  // pelo qual `mover()` limpa a selecao ao trocar de dia.
  useEffect(() => {
    setSelecionada(null);
  }, [unidadeId]);

  // Mesma razao para o filtro: a aula selecionada pode sair da timeline sem que
  // o usuario clique em nada, e o drawer continuaria aberto mostrando uma aula
  // que nao esta mais na tela.
  useEffect(() => {
    if (selecionada && !aulas.some((a) => a.chave === selecionada.chave)) {
      setSelecionada(null);
    }
  }, [aulas, selecionada]);

  function irPara(novaData: string) {
    setData(novaData);
    setSelecionada(null);

    // Saiu do periodo selecionado (ex.: seta que atravessa a virada do mes):
    // reposiciona a barra no mes do novo dia, senao o topo diria "Jul/2026"
    // com a tela mostrando agosto.
    if (!competencia || !inicio || !fim) return;
    if (novaData >= inicio && novaData <= fim) return;

    const [ano, mes] = novaData.split('-').map(Number);
    competencia.setTipo('mensal');
    competencia.setAno(ano);
    competencia.setMes(mes);
  }

  function mover(dias: number) {
    irPara(format(addDays(parseISO(data), dias), 'yyyy-MM-dd'));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => mover(-1)} aria-label="Dia anterior"
            className="h-7 w-7 rounded-md border border-slate-700 text-slate-300 hover:text-white">
            <ChevronLeft className="mx-auto h-4 w-4" />
          </button>
          <button type="button" onClick={() => mover(1)} aria-label="Próximo dia"
            className="h-7 w-7 rounded-md border border-slate-700 text-slate-300 hover:text-white">
            <ChevronRight className="mx-auto h-4 w-4" />
          </button>
          <span className="font-semibold">{rotuloDoDia(data)}</span>

          {data !== hoje && (
            <button
              type="button"
              onClick={() => irPara(hoje)}
              className="h-7 rounded-md border border-slate-700 px-2.5 text-[12.5px] text-slate-300 hover:text-white"
            >
              Hoje
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Sincronizado {frescor}
        </div>
      </header>

      {/* Mesma barra de competencia das paginas irmas. Como a Agenda e diaria,
          ela funciona como salto: escolher Ago/2026 leva ao dia de hoje se ele
          cair no mes, senao ao dia 1; "Personalizado" leva a data inicial. As
          setas seguem movendo dia a dia a partir dai. */}
      {competencia && (
        <CompetenciaFilter
          filtro={competencia.filtro}
          range={competencia.range}
          anosDisponiveis={competencia.anosDisponiveis}
          onTipoChange={competencia.setTipo}
          onAnoChange={competencia.setAno}
          onMesChange={competencia.setMes}
          onTrimestreChange={competencia.setTrimestre}
          onSemestreChange={competencia.setSemestre}
          onDataInicioChange={competencia.setDataInicio}
          onDataFimChange={competencia.setDataFim}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Grupo
          opcoes={[
            { valor: 'professor', rotulo: 'Professores' },
            { valor: 'sala', rotulo: 'Salas' },
          ]}
          valor={agruparPor}
          onChange={(v) => setAgruparPor(v as 'professor' | 'sala')}
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            placeholder="Aluno, professor, turma, sala…"
            aria-label="Buscar na agenda"
            className="h-[30px] w-56 rounded-md border border-slate-700 bg-slate-900 pl-7 pr-2 text-[12.5px] text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <Select
          rotulo="Todos os professores"
          valor={filtros.professor}
          opcoes={professores}
          onChange={(v) => setFiltros((f) => ({ ...f, professor: v }))}
        />
        <Select
          rotulo="Todos os cursos"
          valor={filtros.curso}
          opcoes={cursos}
          onChange={(v) => setFiltros((f) => ({ ...f, curso: v }))}
        />
        <Select
          rotulo="Todas as turmas"
          valor={filtros.turma}
          opcoes={turmas}
          onChange={(v) => setFiltros((f) => ({ ...f, turma: v }))}
        />

        <Grupo
          opcoes={[
            { valor: '', rotulo: 'Todas' },
            { valor: 'individual', rotulo: 'Individual' },
            { valor: 'turma', rotulo: 'Turma' },
          ]}
          valor={filtros.tipo ?? ''}
          onChange={(v) => setFiltros((f) => ({ ...f, tipo: v === '' ? null : (v as TipoAula) }))}
        />

        <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-slate-400">
          <input
            type="checkbox"
            checked={filtros.ocultarCanceladas}
            onChange={(e) => setFiltros((f) => ({ ...f, ocultarCanceladas: e.target.checked }))}
            className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-cyan-500"
          />
          Ocultar canceladas
        </label>

        {filtrando && (
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_AGENDA_VAZIOS)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>

      {/* Enquanto o proximo dia carrega, o dia anterior continua na tela
          esmaecido em vez de virar tela em branco: a troca fica continua e
          `aria-busy` avisa o leitor de tela que o conteudo esta defasado. */}
      <div
        aria-busy={carregando}
        className={cn(
          'flex min-w-0 flex-col gap-4 transition-opacity',
          recarregando && 'pointer-events-none opacity-50',
        )}
      >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-700 sm:grid-cols-5">
        <Kpi
          rotulo="Aulas no dia"
          valor={String(aulas.length)}
          nota={filtrando ? `de ${todasAsAulas.length}` : undefined}
        />
        <Kpi rotulo="Em aula agora" valor={String(agora.aulas)} nota={`${agora.salas} salas`} destaque="text-emerald-400" />
        <Kpi rotulo="Canceladas" valor={String(canceladas)} destaque="text-rose-400" />
        <Kpi rotulo="Experimentais" valor={String(experimentais)} />
        <Kpi
          rotulo="Alunos em risco"
          valor={String(emRisco)}
          destaque="text-amber-400"
          rodape={
            riscoGeralDesatualizado
              ? `modelo pausado desde ${formatarDataCalculo(dataCalculoRisco)}`
              : undefined
          }
        />
      </div>

      {erro ? (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
          Não foi possível carregar a agenda: {erro}
        </p>
      ) : primeiraCarga ? (
        <p className="p-8 text-center text-sm text-slate-400">Carregando agenda…</p>
      ) : aulas.length === 0 && filtrando ? (
        <p className="p-8 text-center text-sm text-slate-400">
          Nenhuma aula corresponde ao filtro.
        </p>
      ) : aulas.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">Nenhuma aula neste dia.</p>
      ) : (
        <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-slate-700">
          <div className="min-w-0 flex-1">
            <AgendaTimeline
              aulas={aulas}
              agruparPor={agruparPor}
              selecionada={selecionada}
              onSelecionar={setSelecionada}
              ehHoje={data === hoje}
              mostrarUnidade={unidadeId === null}
            />
          </div>
          <AgendaDrawer aula={selecionada} data={data} mostrarUnidade={unidadeId === null} />
        </div>
      )}
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, nota, destaque, rodape }: {
  rotulo: string; valor: string; nota?: string; destaque?: string; rodape?: string;
}) {
  return (
    <div className="bg-slate-900 px-4 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{rotulo}</p>
      <p className={cn('text-xl font-semibold tabular-nums', destaque)}>
        {valor} {nota && <span className="text-[11.5px] font-normal text-slate-400">{nota}</span>}
      </p>
      {rodape && <p className="text-[10.5px] text-slate-500">{rodape}</p>}
    </div>
  );
}

/** Select nativo: string vazia no <option> representa "sem filtro" (null). */
function Select({ rotulo, valor, opcoes, onChange }: {
  rotulo: string;
  valor: string | null;
  opcoes: string[];
  onChange: (v: string | null) => void;
}) {
  // O filtro sobrevive a troca de dia, mas as opcoes sao do dia atual: sem isto
  // um professor que nao da aula hoje sumiria da lista e o <select> cairia para
  // o primeiro item, aparentando "sem filtro" enquanto ainda filtra tudo fora.
  const ausente = valor !== null && !opcoes.includes(valor);

  return (
    <select
      value={valor ?? ''}
      aria-label={rotulo}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      className={cn(
        'h-[30px] max-w-[180px] rounded-md border bg-slate-900 px-2 text-[12.5px] focus:border-cyan-500 focus:outline-none',
        valor === null ? 'border-slate-700 text-slate-400' : 'border-cyan-600 text-white',
      )}
    >
      <option value="">{rotulo}</option>
      {ausente && <option value={valor}>{valor} (sem aula neste dia)</option>}
      {opcoes.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
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
