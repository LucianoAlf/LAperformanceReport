import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { addDays, addWeeks, format, isValid, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CalendarClock,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { useAgendaDia, type AulaAgenda } from '@/hooks/useAgendaDia';
import { alunoSemDestino } from './Chamada/chamadaUtils';
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
import {
  Select as SelectRaiz,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { AgendaTimeline } from './AgendaTimeline';
import { SeletorPeriodo } from './SeletorPeriodo';
import { AgendaDrawer } from './AgendaDrawer';
import { ChamadaView } from './Chamada';
import { cn } from '@/lib/utils';

/**
 * Rotulo do dia tolerante a data invalida. `format` da date-fns lanca
 * RangeError com data invalida, e como isso acontece no corpo do componente
 * derruba a pagina inteira — um valor ruim vindo de um filtro externo nao pode
 * ter esse poder.
 */
function rotuloDoDia(data: string): { dia: string; ano: string } {
  const d = parseISO(data);
  if (!isValid(d)) return { dia: data, ano: '' };
  return {
    // "-feira" sai: ocupa quatro caracteres numa barra disputada e nao
    // acrescenta nada que "Segunda" ja nao diga.
    dia: format(d, "EEEE, d 'de' MMMM", { locale: ptBR }).replace('-feira', ''),
    // Ano em separado para ficar apagado: quase sempre e o ano corrente e
    // repeti-lo em destaque so rouba atencao do dia, que e o que muda.
    ano: format(d, 'yyyy'),
  };
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
  const [visao, setVisao] = useState<'professor' | 'sala' | 'chamada'>('professor');
  const ehChamada = visao === 'chamada';
  // Sub-visao da Chamada (dia/semana/lista). Quando 'semana', as setas do
  // topo movem 7 dias e o rotulo mostra o intervalo da semana.
  const [subVisaoChamada, setSubVisaoChamada] = useState<'dia' | 'semana' | 'lista'>('dia');
  const ehSemanaChamada = ehChamada && subVisaoChamada === 'semana';
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

  const { aulas: todasAsAulas, carregando, erro, frescor, recarregar, prefetch } = useAgendaDia({
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

  // Pendencias da chamada: alunos em aulas JA OCORRIDAS sem destino humano
  // (presente/falta/justificada/cancelamento). E o que o digest diario cobra.
  // Mostrar aqui faz a equipe saltar para a visao Chamada antes do digest.
  const pendenciasChamada = useMemo(() => {
    let count = 0;
    const agora = new Date();
    for (const aula of aulas) {
      if (aula.cancelada) continue;
      if (!aulaJaOcorreu(data, aula.hora_fim, agora)) continue;
      for (const aluno of aula.alunos) {
        if (aluno.aluno_id != null && alunoSemDestino(aula, aluno, data, agora)) count++;
      }
    }
    return count;
  }, [aulas, data]);

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
    // Na visao Semana (dentro da Chamada), as setas movem de semana em semana.
    if (ehSemanaChamada) {
      irPara(format(addWeeks(parseISO(data), dias), 'yyyy-MM-dd'));
      return;
    }
    irPara(format(addDays(parseISO(data), dias), 'yyyy-MM-dd'));
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Barra de comando unica: navegacao do dia a esquerda, periodo a direita.
          Antes eram DUAS faixas empilhadas (competencia numa, comandos noutra) e
          as duas juntas comiam ~90px antes de a grade comecar — numa tela cuja
          materia-prima e altura. Aqui e uma faixa so; `flex-wrap` devolve a
          segunda linha sozinho quando a janela e estreita demais.

          A competencia continua sendo o componente compartilhado das paginas
          irmas e continua a DIREITA, que e onde o usuario aprendeu a procurar.
          Como a Agenda e diaria, ela funciona como salto: escolher Ago/2026 leva
          ao dia de hoje se ele cair no mes, senao ao dia 1. As setas seguem
          movendo dia a dia. */}
      <header className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => mover(-1)} aria-label="Dia anterior"
          className="grid h-[30px] w-[30px] place-items-center rounded-md border border-slate-700 text-slate-300 hover:text-white">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => mover(1)} aria-label="Próximo dia"
          className="grid h-[30px] w-[30px] place-items-center rounded-md border border-slate-700 text-slate-300 hover:text-white">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="px-1 font-semibold first-letter:uppercase">
          {ehSemanaChamada ? (
            <>
              {(() => {
                const d = parseISO(data);
                const ini = startOfWeek(d, { weekStartsOn: 1 });
                const fim = endOfWeek(d, { weekStartsOn: 1 });
                // "10 a 15 de agosto" — compacto para a barra de comando.
                const mesmoMes = ini.getMonth() === fim.getMonth();
                return mesmoMes
                  ? `${format(ini, 'd')} a ${format(fim, "d 'de' MMMM", { locale: ptBR })}`
                  : `${format(ini, "d 'de' MMMM", { locale: ptBR })} a ${format(fim, "d 'de' MMMM", { locale: ptBR })}`;
              })()}{' '}
              <span className="font-normal text-slate-500">{format(parseISO(data), 'yyyy')}</span>
            </>
          ) : (
            <>
              {rotuloDoDia(data).dia}{' '}
              <span className="font-normal text-slate-500">{rotuloDoDia(data).ano}</span>
            </>
          )}
        </span>

        {data !== hoje && (
          <button
            type="button"
            onClick={() => irPara(hoje)}
            className="h-[30px] rounded-md border border-slate-700 px-2.5 text-[12.5px] text-slate-300 hover:text-white"
          >
            Hoje
          </button>
        )}

        {competencia && <SeletorPeriodo competencia={competencia} />}

        <span className="mx-1 h-5 w-px bg-slate-700" aria-hidden="true" />

        <Grupo
          opcoes={[
            { valor: 'professor', rotulo: 'Professores' },
            { valor: 'sala', rotulo: 'Salas' },
            { valor: 'chamada', rotulo: 'Chamada' },
          ]}
          valor={visao}
          onChange={(v) => {
            setVisao(v as 'professor' | 'sala' | 'chamada');
            if (v !== 'professor' && v !== 'sala') return;
            setAgruparPor(v);
          }}
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
      {/* Banner de pendencias da chamada — alunos sem destino em aulas que ja
          ocorreram. Aparece em TODAS as visoes (Professores/Salas/Chamada) para
          cobrar acao da equipe antes do digest diario. Clicar leva a visao
          Chamada, onde o banner detalha aluno a aluno. */}
      {pendenciasChamada > 0 && !ehChamada && (
        <button
          type="button"
          onClick={() => setVisao('chamada')}
          className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-left transition-colors hover:bg-amber-500/15"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-200">
              {pendenciasChamada} {pendenciasChamada === 1 ? 'aluno sem destino' : 'alunos sem destino'}{' '}
              em aulas que já ocorreram
            </p>
            <p className="text-xs text-amber-300/80">
              Ninguém registrou presença, falta ou justificativa. Abrir a visão Chamada para resolver.
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-semibold text-amber-300">
            Abrir Chamada
          </span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-700 bg-slate-700 sm:grid-cols-3 lg:grid-cols-6">
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
        <Kpi
          rotulo="Sem destino"
          valor={String(pendenciasChamada)}
          destaque={pendenciasChamada > 0 ? 'text-amber-400' : undefined}
          rodape={pendenciasChamada > 0 ? 'chamada pendente' : 'tudo resolvido'}
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
      ) : ehChamada ? (
        <ChamadaView
          data={data}
          unidadeId={unidadeId}
          aulas={aulas}
          recarregar={recarregar}
          onIrParaDia={irPara}
          onSubVisaoChange={setSubVisaoChamada}
        />
      ) : (
        <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-slate-700">
          <div className="min-w-0 flex-1">
            <AgendaTimeline
              data={data}
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
      <p className={cn('text-2xl font-bold leading-tight tabular-nums', destaque)}>
        {valor}
        {nota && (
          <span className="ml-1 text-[11px] font-normal text-slate-500">· {nota}</span>
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
/**
 * Token de "sem filtro" nos selects. Existe porque o Radix trata `''` como
 * "nenhum valor" e lanca excecao se um item declarar `value=""` — nao da para
 * usar a string vazia como sentinela, que era o padrao com o `<select>` nativo.
 */
const SEM_FILTRO = '__todos';

/**
 * Seletor de qualquer camada flutuante aberta do design system — dropdown do
 * Select e popover do combobox. O Radix monta as duas num portal no `<body>`,
 * entao elas NAO estao dentro do popover de filtros, e sem esta guarda o
 * clique numa opcao contaria como "clique fora".
 */
const PORTAL_FLUTUANTE = '[data-radix-popper-content-wrapper],[role="listbox"]';

/** Gatilho do design system em versao densa, com a borda ciano quando o filtro esta ativo. */
function gatilhoDeFiltro(valor: string | null): string {
  return cn(
    'h-9 text-[12.5px]',
    valor === null ? 'text-slate-400' : 'border-cyan-600 text-white',
  );
}

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
      const alvo = e.target as Element | null;
      // O dropdown do Select vive num portal no <body>, fora de `caixaRef`.
      // Sem esta guarda, escolher uma opcao contaria como "clique fora" e
      // fecharia o popover no mesmo gesto em que a opcao seria selecionada.
      if (alvo?.closest?.(PORTAL_FLUTUANTE)) return;
      if (!caixaRef.current?.contains(alvo as Node)) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Com um dropdown aberto, Esc pertence a ele: fecha a lista, nao o
      // popover inteiro. Sem isto o primeiro Esc levaria os dois embora.
      if (document.querySelector(PORTAL_FLUTUANTE)) return;
      setAberto(false);
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
            <ComboboxFiltro
              rotulo="Todos"
              valor={filtros.professor}
              opcoes={professores}
              onChange={(v) => setFiltros((f) => ({ ...f, professor: v }))}
            />
          </Campo>
          <Campo rotulo="Curso">
            <ComboboxFiltro
              rotulo="Todos"
              valor={filtros.curso}
              opcoes={cursos}
              onChange={(v) => setFiltros((f) => ({ ...f, curso: v }))}
            />
          </Campo>
          <Campo rotulo="Turma">
            <ComboboxFiltro
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
    <SelectRaiz
      value={valor ?? SEM_FILTRO}
      onValueChange={(v) => onChange(v === SEM_FILTRO ? null : v)}
    >
      <SelectTrigger aria-label="Categoria da aula" className={gatilhoDeFiltro(valor)}>
        <SelectValue placeholder="Todas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_FILTRO}>Todas</SelectItem>
        {opcoes.map((o) => (
          <SelectItem key={o.valor} value={o.valor} disabled={o.qtd === 0}>
            {o.rotulo} ({o.qtd})
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRaiz>
  );
}

/**
 * Combobox com busca (`Command` + `Popover` do design system), no lugar de um
 * select simples: professor passa de 20 opcoes numa unidade e de 40 na visao
 * consolidada, e rolar uma lista alfabetica atras de um nome e mais lento do
 * que digitar tres letras. Mesmo padrao de `combobox-nome`/`combobox-telefone`.
 *
 * Curso e turma usam o mesmo componente de proposito: tres controles vizinhos
 * com comportamentos diferentes obrigariam o usuario a descobrir, um a um,
 * qual deles aceita digitacao.
 */
function ComboboxFiltro({ rotulo, valor, opcoes, onChange, formatar }: {
  rotulo: string;
  valor: string | null;
  opcoes: string[];
  onChange: (v: string | null) => void;
  // Traduz o valor cru do banco para exibicao (ex.: 'experimental' -> 'Experimental').
  formatar?: (v: string) => string;
}) {
  const [aberto, setAberto] = useState(false);
  // O filtro sobrevive a troca de dia, mas as opcoes sao do dia atual: sem isto
  // um professor que nao da aula hoje sumiria da lista e o controle pareceria
  // "sem filtro" enquanto ainda filtra tudo fora.
  const ausente = valor !== null && !opcoes.includes(valor);
  const exibir = formatar ?? ((v: string) => v);

  const escolher = (v: string | null) => {
    onChange(v);
    setAberto(false);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={aberto}
          aria-label={rotulo}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-1 rounded-xl border border-slate-700',
            'bg-slate-800/50 px-3 text-left text-[12.5px] ring-offset-slate-950',
            'focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2',
            valor === null ? 'text-slate-400' : 'border-cyan-600 text-white',
          )}
        >
          <span className="truncate">{valor === null ? rotulo : exibir(valor)}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[240px] border-slate-700 bg-slate-900 p-0"
        style={{ zIndex: 999999 }}
      >
        <Command className="bg-transparent">
          <CommandInput placeholder={`Buscar ${rotulo.toLowerCase()}...`} className="h-9 text-white" />
          <CommandList>
            <CommandEmpty className="px-3 py-3 text-[12.5px] text-slate-400">
              Nada encontrado
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value={rotulo} onSelect={() => escolher(null)} className="cursor-pointer">
                <Check className={cn('mr-2 h-4 w-4', valor === null ? 'opacity-100' : 'opacity-0')} />
                {rotulo}
              </CommandItem>
              {ausente && (
                <CommandItem value={valor} onSelect={() => escolher(valor)} className="cursor-pointer">
                  <Check className="mr-2 h-4 w-4 opacity-100" />
                  <span className="truncate">{exibir(valor)}</span>
                  <span className="ml-1 shrink-0 text-[10px] text-slate-500">(sem aula neste dia)</span>
                </CommandItem>
              )}
              {opcoes.map((o) => (
                <CommandItem
                  key={o}
                  value={exibir(o)}
                  onSelect={() => escolher(o)}
                  className="cursor-pointer"
                >
                  <Check className={cn('mr-2 h-4 w-4', valor === o ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{exibir(o)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
