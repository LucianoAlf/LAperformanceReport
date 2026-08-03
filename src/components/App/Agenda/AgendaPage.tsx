import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDays, format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarClock, Filter, Search, X } from 'lucide-react';
import { useAgendaDia, type AulaAgenda } from '@/hooks/useAgendaDia';
import {
  aulaJaOcorreu,
  contarEmAulaAgora,
  contarFiltrosAvancados,
  contarJaOcorreram,
  distribuicaoPorHora,
  filtrarAulas,
  filtroAtivo,
  formatarDataCalculo,
  minutosAgora,
  opcoesDeCategoria,
  opcoesDoCampo,
  riscoDesatualizado,
  FILTROS_AGENDA_VAZIOS,
  type FiltrosAgenda,
  type LotacaoAula,
} from '@/lib/agenda';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { PageFilterBar } from '@/components/ui/page-filter-bar';
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
  // Categoria e o unico select montado de um conjunto FECHADO: lista as 5
  // conhecidas com a contagem do dia, mesmo as zeradas. Ver opcoesDeCategoria.
  const categorias = useMemo(() => opcoesDeCategoria(todasAsAulas), [todasAsAulas]);

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
  const justificadas = aulas.filter((a) => a.cancelada && a.justificada).length;
  const experimentais = aulas.filter((a) => a.categoria === 'experimental').length;
  // "Ainda por acontecer" so faz sentido no dia de hoje: num dia passado todas
  // ja aconteceram, e num dia futuro todas estao por acontecer — em ambos os
  // casos o numero seria repetir o total com outra palavra.
  const experimentaisPendentes =
    data === hoje
      ? aulas.filter(
          (a) => a.categoria === 'experimental' && !a.cancelada && !aulaJaOcorreu(data, a.hora_fim, new Date()),
        ).length
      : 0;

  // `minutos` nas deps: sem isso o "ja ocorreram" congela no minuto em que a
  // pagina abriu, igual ao que acontecia com o KPI de "em aula agora".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const jaOcorreram = useMemo(() => contarJaOcorreram(aulas, data, new Date()), [aulas, data, minutos]);
  const porHora = useMemo(() => distribuicaoPorHora(aulas), [aulas]);

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

  // Esc fecha o painel. Agora que ele so existe com aula selecionada, precisa
  // haver saida pelo teclado — antes nao havia estado "fechado" para alcancar.
  useEffect(() => {
    if (!selecionada) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelecionada(null);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [selecionada]);

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
      {/* Mesma barra de competencia das paginas irmas — componente compartilhado,
          intocado de proposito. Como a Agenda e diaria, ela funciona como salto:
          escolher Ago/2026 leva ao dia de hoje se ele cair no mes, senao ao dia 1;
          "Personalizado" leva a data inicial. As setas seguem movendo dia a dia. */}
      {competencia && (
        // Alinhado a direita como nas paginas irmas: `PageFilterBar` e o
        // `justify-end` compartilhado. Sem ele o filtro ficava a esquerda so
        // aqui, quebrando a expectativa de onde procurar o periodo.
        <PageFilterBar>
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
        </PageFilterBar>
      )}

      {/* Barra de comando unica. Antes eram duas faixas — navegacao do dia numa,
          oito controles de filtro noutra — e a grade so comecava depois. Aqui
          fica a vista o que se usa a cada minuto (dia, agrupamento, busca); o
          resto vai para o popover, que anuncia no badge quantos filtros estao
          ligados para nada ficar filtrando escondido. */}
      <header className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Dia anterior"
          className="grid h-[30px] w-[30px] place-items-center rounded-md border border-slate-700 text-slate-300 hover:text-white">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => mover(1)} aria-label="Próximo dia"
          className="grid h-[30px] w-[30px] place-items-center rounded-md border border-slate-700 text-slate-300 hover:text-white">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="px-1 font-semibold first-letter:uppercase">{rotuloDoDia(data)}</span>

        {data !== hoje && (
          <button
            type="button"
            onClick={() => irPara(hoje)}
            className="h-[30px] rounded-md border border-slate-700 px-2.5 text-[12.5px] text-slate-300 hover:text-white"
          >
            Hoje
          </button>
        )}

        <span className="mx-1 h-5 w-px bg-slate-700" aria-hidden="true" />

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

        <PopoverFiltros
          filtros={filtros}
          setFiltros={setFiltros}
          professores={professores}
          cursos={cursos}
          turmas={turmas}
          categorias={categorias}
        />

        {filtrando && (
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_AGENDA_VAZIOS)}
            className="flex h-[30px] items-center gap-1 rounded-md px-2 text-[12.5px] text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}

        <span className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Sincronizado {frescor}
        </span>
      </header>

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
          nota={filtrando ? `de ${todasAsAulas.length}` : `${jaOcorreram} já ocorreram`}
        >
          <Sparkline dados={porHora} horaCorrente={data === hoje ? Math.floor(minutos / 60) : null} />
        </Kpi>
        <Kpi
          rotulo="Em aula agora"
          valor={String(agora.aulas)}
          destaque="text-emerald-400"
          rodape={agora.aulas > 0 ? `${agora.salas} ${agora.salas === 1 ? 'sala ocupada' : 'salas ocupadas'}` : undefined}
        />
        <Kpi
          rotulo="Canceladas"
          valor={String(canceladas)}
          destaque="text-rose-400"
          // `justificada` e o unico qualificador que a API entrega sobre um
          // cancelamento. "Com reposicao pendente" seria mais util, mas esse
          // dado nao existe na nossa base — nao da para exibir o que nao temos.
          rodape={justificadas > 0 ? `${justificadas} justificadas` : undefined}
        />
        <Kpi
          rotulo="Experimentais"
          valor={String(experimentais)}
          rodape={
            experimentaisPendentes > 0
              ? `${experimentaisPendentes} ainda ${experimentaisPendentes === 1 ? 'por acontecer' : 'por acontecer'}`
              : undefined
          }
        />
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
          {/* Montado so quando ha selecao: sem aula escolhida ele nao ocupa os
              296px de largura, que e o recurso escasso numa grade horizontal. */}
          {selecionada && (
            <AgendaDrawer
              aula={selecionada}
              data={data}
              onFechar={() => setSelecionada(null)}
              mostrarUnidade={unidadeId === null}
            />
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Cartao de KPI. `nota` acompanha o numero na mesma linha (qualifica o proprio
 * numero: "23 · 9 ja ocorreram"); `rodape` e uma linha abaixo, para o que
 * qualifica o dado sem ser parte dele ("4 salas ocupadas", "modelo pausado").
 * Antes tudo virava nota inline e saia "5 4 salas", que se le como um numero so.
 */
function Kpi({ rotulo, valor, nota, destaque, rodape, children }: {
  rotulo: string;
  valor: string;
  nota?: string;
  destaque?: string;
  rodape?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-slate-900 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{rotulo}</p>
      <p className={cn('font-grotesk text-[23px] font-semibold leading-tight tabular-nums', destaque)}>
        {valor}
        {nota && (
          <span className="ml-1 font-sans text-[11.5px] font-normal text-slate-500">· {nota}</span>
        )}
      </p>
      {rodape && <p className="text-[10.5px] leading-snug text-slate-500">{rodape}</p>}
      {children}
    </div>
  );
}

/**
 * Distribuicao das aulas por hora. Nao substitui a timeline — responde de
 * relance se o movimento esta concentrado a tarde ou espalhado pelo dia, coisa
 * que "166 aulas" nao diz. A barra da hora corrente sai em esmeralda, mesma
 * cor de "acontecendo agora" no resto da tela.
 */
function Sparkline({
  dados,
  horaCorrente,
}: {
  dados: Array<{ hora: number; qtd: number }>;
  horaCorrente: number | null;
}) {
  if (dados.length === 0) return null;
  const pico = Math.max(...dados.map((d) => d.qtd));
  if (pico === 0) return null;

  return (
    <span aria-hidden="true" className="mt-1 flex h-4 items-end gap-[2px]">
      {dados.map((d) => (
        <span
          key={d.hora}
          title={`${String(d.hora).padStart(2, '0')}:00 — ${d.qtd} ${d.qtd === 1 ? 'aula' : 'aulas'}`}
          className={cn(
            'w-[5px] shrink-0 rounded-[1px]',
            d.hora === horaCorrente ? 'bg-emerald-400' : 'bg-cyan-500/50',
          )}
          // Piso de 2px para a hora vazia continuar desenhando o eixo — sem
          // isso o sparkline vira barras soltas sem nocao de continuidade.
          style={{ height: d.qtd === 0 ? 2 : Math.max(3, (d.qtd / pico) * 16) }}
        />
      ))}
    </span>
  );
}

/**
 * Filtros avancados num popover. Eles saem da barra porque sao usados de vez
 * em quando, mas custavam uma faixa inteira acima da grade o tempo todo.
 * O badge com a contagem existe para que nada fique filtrando escondido: sem
 * ele, um filtro esquecido de ontem faria o dia parecer vazio sem explicacao.
 */
function PopoverFiltros({
  filtros,
  setFiltros,
  professores,
  cursos,
  turmas,
  categorias,
}: {
  filtros: FiltrosAgenda;
  setFiltros: React.Dispatch<React.SetStateAction<FiltrosAgenda>>;
  professores: string[];
  cursos: string[];
  turmas: string[];
  categorias: Array<{ valor: string; rotulo: string; qtd: number }>;
}) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const quantos = contarFiltrosAvancados(filtros);

  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    // `mousedown` e nao `click`: com `click` o proprio clique que abriu o
    // popover chegaria ao document e o fecharia no mesmo gesto.
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={cn(
          'flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[12.5px]',
          quantos > 0
            ? 'border-cyan-600 text-white'
            : 'border-slate-700 text-slate-300 hover:text-white',
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        Filtros
        {quantos > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded bg-cyan-500 px-1 text-[10px] font-bold tabular-nums text-slate-950">
            {quantos}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 grid w-[340px] grid-cols-2 gap-2.5 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-2xl">
          <Campo rotulo="Professor">
            <Select
              rotulo="Todos"
              valor={filtros.professor}
              opcoes={professores}
              onChange={(v) => setFiltros((f) => ({ ...f, professor: v }))}
            />
          </Campo>
          <Campo rotulo="Curso">
            <Select
              rotulo="Todos"
              valor={filtros.curso}
              opcoes={cursos}
              onChange={(v) => setFiltros((f) => ({ ...f, curso: v }))}
            />
          </Campo>
          <Campo rotulo="Turma">
            <Select
              rotulo="Todas"
              valor={filtros.turma}
              opcoes={turmas}
              onChange={(v) => setFiltros((f) => ({ ...f, turma: v }))}
            />
          </Campo>
          <Campo rotulo="Categoria">
            <SelectCategoria
              valor={filtros.categoria}
              opcoes={categorias}
              onChange={(v) => setFiltros((f) => ({ ...f, categoria: v }))}
            />
          </Campo>

          <div className="col-span-2">
            {/* Lotacao, nao modalidade. A modalidade contratada e 'turma' em 164
                das 165 aulas — filtrar por ela devolveria quase tudo ou quase
                nada. O que se procura na grade e quem esta sozinho no horario.
                A modalidade continua visivel no painel de detalhe. */}
            <Campo rotulo="Lotação">
              <Grupo
                opcoes={[
                  { valor: '', rotulo: 'Todas' },
                  { valor: 'sozinho', rotulo: 'Sozinho' },
                  { valor: 'turma', rotulo: 'Com turma' },
                ]}
                valor={filtros.lotacao ?? ''}
                onChange={(v) =>
                  setFiltros((f) => ({ ...f, lotacao: v === '' ? null : (v as LotacaoAula) }))
                }
              />
            </Campo>
          </div>

          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-300">
            <input
              type="checkbox"
              checked={filtros.ocultarCanceladas}
              onChange={(e) => setFiltros((f) => ({ ...f, ocultarCanceladas: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-cyan-500"
            />
            Ocultar canceladas
          </label>
        </div>
      )}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {rotulo}
      </span>
      {children}
    </label>
  );
}

/**
 * Select de categoria. Diferente dos outros, lista TODAS as categorias
 * conhecidas com a contagem do dia, inclusive as zeradas (desabilitadas).
 * Categoria e um conjunto fechado de 5 valores: listar so o que existe faz o
 * usuario procurar "Experimental", nao achar, e nao saber se o filtro quebrou
 * ou se nao ha experimental naquele dia. Com "Experimental (0)" a ausencia
 * vira resposta. Ver `opcoesDeCategoria`.
 */
function SelectCategoria({
  valor,
  opcoes,
  onChange,
}: {
  valor: string | null;
  opcoes: Array<{ valor: string; rotulo: string; qtd: number }>;
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={valor ?? ''}
      aria-label="Categoria da aula"
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      className={cn(
        'h-[29px] w-full rounded-md border bg-slate-950 px-2 text-[12.5px] focus:border-cyan-500 focus:outline-none',
        valor === null ? 'border-slate-700 text-slate-400' : 'border-cyan-600 text-white',
      )}
    >
      <option value="">Todas</option>
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor} disabled={o.qtd === 0}>
          {o.rotulo} ({o.qtd})
        </option>
      ))}
    </select>
  );
}

/** Select nativo: string vazia no <option> representa "sem filtro" (null). */
function Select({ rotulo, valor, opcoes, onChange, formatar }: {
  rotulo: string;
  valor: string | null;
  opcoes: string[];
  onChange: (v: string | null) => void;
  // Traduz o valor cru do banco para exibicao (ex.: 'experimental' -> 'Experimental').
  formatar?: (v: string) => string;
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
        'h-[29px] w-full rounded-md border bg-slate-950 px-2 text-[12.5px] focus:border-cyan-500 focus:outline-none',
        valor === null ? 'border-slate-700 text-slate-400' : 'border-cyan-600 text-white',
      )}
    >
      <option value="">{rotulo}</option>
      {ausente && (
        <option value={valor}>{(formatar ?? ((v: string) => v))(valor)} (sem aula neste dia)</option>
      )}
      {opcoes.map((o) => (
        <option key={o} value={o}>{formatar ? formatar(o) : o}</option>
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
