import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AGENDA_ALTURA_FAIXA_AMPLA_PX,
  AGENDA_ALTURA_FAIXA_MAX_PX,
  AGENDA_ALTURA_FAIXA_PX,
  AGENDA_GAP_FAIXA_PX,
  AGENDA_LARGURA_HORA_AMPLA_PX,
  alocarFaixas,
  aulaEmAndamento,
  aulaJaOcorreu,
  contarFaixas,
  cursoPredominante,
  formatarRelogio,
  iniciaisDoNome,
  janelaDeHoras,
  larguraDaHora,
  larguraPx,
  ocupacaoPct,
  posicaoPx,
  resumoSobreposicao,
  segundosAgora,
} from '@/lib/agenda';
import type { AulaAgenda } from '@/hooks/useAgendaDia';
import { AgendaCard } from './AgendaCard';

const PADDING_TRILHO = 7;
const LARGURA_ROTULO = 172;

interface Props {
  aulas: AulaAgenda[];
  agruparPor: 'professor' | 'sala';
  selecionada: AulaAgenda | null;
  onSelecionar: (aula: AulaAgenda) => void;
  // Agenda consolidada (sem unidade selecionada no header): o trilho passa a
  // dizer de qual escola e cada professor/sala. Alem de rotular, isso muda a
  // CHAVE do agrupamento — sem unidade na chave, "Sala 1" das tres unidades
  // vira um trilho so e as aulas se sobrepoem como se fosse a mesma sala.
  // Com unidade selecionada fica desligado: repetir o nome dela seria ruido.
  mostrarUnidade?: boolean;
  // Dia exibido ('yyyy-MM-dd'). A regua de "agora" so faz sentido no dia de
  // hoje: desenhada num dia passado ou futuro ela marcaria um instante que nao
  // tem relacao nenhuma com as aulas ali.
  ehHoje?: boolean;
  // Dia exibido ('yyyy-MM-dd'). `ehHoje` sozinho nao basta para saber se uma
  // aula ja aconteceu: com ele falso, o dia pode ser passado OU futuro — e a
  // presenca so pode ser exibida no primeiro caso.
  data: string;
}

export function AgendaTimeline({
  aulas,
  agruparPor,
  selecionada,
  onSelecionar,
  mostrarUnidade = false,
  ehHoje = false,
  data,
}: Props) {
  // Relogio proprio, de segundo em segundo, isolado neste componente: a regua
  // e a unica coisa que precisa dessa resolucao, e re-renderizar a pagina
  // inteira (com todos os cards) uma vez por segundo seria desperdicio.
  const [segundos, setSegundos] = useState(() => segundosAgora(new Date()));
  useEffect(() => {
    if (!ehHoje) return;
    const id = setInterval(() => setSegundos(segundosAgora(new Date())), 1000);
    return () => clearInterval(id);
  }, [ehHoje]);

  // Largura util para decidir a escala. Medida em vez de fixa porque o mesmo
  // trilho aparece em telas bem diferentes e com o drawer aberto ou fechado.
  const containerRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entrada]) => {
      setLargura(entrada.contentRect.width);
    });
    observer.observe(el);
    setLargura(el.clientWidth);
    return () => observer.disconnect();
  }, []);


  const janela = useMemo(
    () => janelaDeHoras(aulas, ehHoje ? segundos : null),
    // `segundos` anda a cada tique, mas a janela so pode mudar quando muda de
    // HORA — depender do segundo cru recalcularia (e reposicionaria os cards)
    // 60 vezes por minuto sem necessidade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aulas, ehHoje, Math.floor(segundos / 3600)],
  );

  const horas = Array.from({ length: janela.fim - janela.inicio }, (_, i) => janela.inicio + i);
  const larguraHora = larguraDaHora(largura - LARGURA_ROTULO, horas.length);
  const amplo = larguraHora >= AGENDA_LARGURA_HORA_AMPLA_PX;

  // Altura minima da grade para ela ENCOSTAR no fim da viewport em vez de parar
  // no ultimo trilho e deixar uma faixa morta embaixo — num dia de 6 professores
  // sobrava quase um terco da tela.
  //
  // ⚠️ Medida aqui, e nao com `h-full` numa cadeia de flex: o AppLayout usa
  // rolagem de DOCUMENTO (`min-h-screen`, `<main>` sem altura), entao `h-full`
  // resolveria para `auto` e nao mudaria nada. Converter o layout inteiro para
  // altura limitada mexeria na rolagem das ~75 telas do app — caro demais para
  // resolver uma folga numa pagina so.
  //
  // E `minHeight` (nao `height`) de proposito: com muitos trilhos — a visao
  // consolidada passa de 40 professores — o conteudo continua mandando e a
  // pagina rola normalmente, como antes.
  const rodapeRef = useRef<HTMLDivElement>(null);
  const cabecalhoRef = useRef<HTMLDivElement>(null);
  const [alturaMinima, setAlturaMinima] = useState(0);
  // Medido, e nao chutado: entra na conta de quanto cada card pode crescer, e
  // um erro aqui vira sobra ou estouro proporcional ao numero de trilhos.
  const [alturaCabecalho, setAlturaCabecalho] = useState(30);
  useLayoutEffect(() => {
    const medir = () => {
      const el = containerRef.current;
      if (!el) return;
      const topo = el.getBoundingClientRect().top;
      const rodape = rodapeRef.current?.offsetHeight ?? 0;
      setAlturaCabecalho(cabecalhoRef.current?.offsetHeight ?? 30);
      // FOLGA cobre o padding inferior do <main> (p-6 = 24px) mais uma margem
      // pequena, para a borda do quadro nao ficar colada no fim da janela.
      const FOLGA = 32;
      setAlturaMinima(Math.max(0, window.innerHeight - topo - rodape - FOLGA));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
    // Remede quando muda o que esta ACIMA da grade (filtros e KPIs podem
    // reflowar e mover o topo) ou a densidade das faixas.
  }, [aulas, amplo, agruparPor]);

  const grupos = new Map<string, { rotulo: string; unidade: string | null; aulas: AulaAgenda[] }>();
  for (const aula of aulas) {
    const rotulo =
      (agruparPor === 'professor' ? aula.professor_nome : aula.sala_nome) ?? 'Sem alocação';
    const unidade = mostrarUnidade ? aula.unidade_nome : null;
    const chave = unidade ? `${aula.unidade_id}|${rotulo}` : rotulo;
    const grupo = grupos.get(chave);
    if (grupo) grupo.aulas.push(aula);
    else grupos.set(chave, { rotulo, unidade, aulas: [aula] });
  }

  // Faixas resolvidas ANTES de decidir a altura: para saber quanto cada card
  // pode crescer e preciso saber quantas faixas empilhadas existem no total.
  const trilhos = [...grupos.entries()].map(([chave, g]) => {
    const comFaixa = alocarFaixas(g.aulas);
    return { chave, ...g, comFaixa, nFaixas: contarFaixas(comFaixa) };
  });

  // Sobra de altura vira CARD MAIOR, nao grade vazia.
  //
  // Antes o espaco livre virava trilho em branco no fim da tela — ocupava a
  // viewport sem entregar nada. Distribuindo a mesma sobra na altura da faixa,
  // o card ganha corpo e o texto que vivia truncado passa a caber.
  //
  // Resolve  alturaMinima = fixo + nFaixasTotal * altura  para `altura`, onde
  // `fixo` e o que nao escala (cabecalho das horas, padding e gaps dos trilhos).
  const nFaixasTotal = trilhos.reduce((s, t) => s + t.nFaixas, 0);
  const fixo =
    alturaCabecalho +
    trilhos.reduce((s, t) => s + PADDING_TRILHO * 2 + (t.nFaixas - 1) * AGENDA_GAP_FAIXA_PX, 0);
  const alturaBase = amplo ? AGENDA_ALTURA_FAIXA_AMPLA_PX : AGENDA_ALTURA_FAIXA_PX;
  const alturaFaixa =
    alturaMinima > 0 && nFaixasTotal > 0
      ? Math.min(
          AGENDA_ALTURA_FAIXA_MAX_PX,
          Math.max(alturaBase, Math.floor((alturaMinima - fixo) / nFaixasTotal)),
        )
      : alturaBase;

  // Card alto comporta a 3a linha (horario · curso · turma) igual card largo —
  // e o ganho que o usuario pediu: sobra de espaco virando texto legivel.
  const cardAmplo = amplo || alturaFaixa >= AGENDA_ALTURA_FAIXA_AMPLA_PX;

  const relogio = formatarRelogio(segundos);
  const horaDaRegua = segundos / 3600;
  const reguaVisivel = ehHoje && horaDaRegua >= janela.inicio && horaDaRegua <= janela.fim;
  // A regua anda por segundo: posiciona pela fracao de hora, nao por 'HH:MM'.
  const posicaoRegua = (horaDaRegua - janela.inicio) * larguraHora;
  // Minutos de agora, ou null quando o dia exibido nao e hoje — o card usa isso
  // para saber se esta em andamento, e num outro dia a resposta e sempre nao.
  const minutosAgoraOuNulo = ehHoje ? Math.floor(segundos / 60) : null;
  // Largura do que ja passou, recortada na janela visivel.
  const larguraVeu = reguaVisivel ? Math.max(0, posicaoRegua) : 0;
  const horaCorrente = Math.floor(segundos / 3600);

  const larguraTrilho = horas.length * larguraHora;

  return (
    <div className="flex min-w-0 flex-col">
      <div ref={containerRef} className="relative overflow-x-auto">
        {/* O minHeight vai AQUI, no bloco interno, e nao no container rolavel:
            as gridlines, o veu do passado e a regua sao `absolute` com
            `top-0 bottom-0` deste elemento. Esticar so o container deixaria as
            linhas parando no ultimo trilho, com um vazio escuro embaixo. */}
        <div
          style={{ minWidth: LARGURA_ROTULO + larguraTrilho, minHeight: alturaMinima || undefined }}
          className="relative"
        >
          <div
            ref={cabecalhoRef}
            className="sticky top-0 z-10 grid border-b border-slate-700 bg-slate-800/95"
            style={{
              gridTemplateColumns: `${LARGURA_ROTULO}px repeat(${horas.length}, ${larguraHora}px)`,
            }}
          >
            <div className="border-r border-slate-700 px-3.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              {agruparPor === 'professor' ? 'Professor' : 'Sala'}
            </div>
            {horas.map((h) => (
              <div
                key={h}
                className={
                  ehHoje && h === horaCorrente
                    ? 'border-l border-slate-800 py-1.5 pl-2 text-[11.5px] font-semibold tabular-nums text-emerald-400'
                    : ehHoje && h < horaCorrente
                      ? 'border-l border-slate-800 py-1.5 pl-2 text-[11.5px] tabular-nums text-slate-600'
                      : 'border-l border-slate-800 py-1.5 pl-2 text-[11.5px] tabular-nums text-slate-400'
                }
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Veu do que ja passou. O dia inteiro pintado igual nao diz onde
              estamos; a regua sozinha e um traco de 2px que se perde numa grade
              cheia. Aqui a metade vencida do dia recua e o que resta fica em
              primeiro plano — le-se antes de qualquer numero. */}
          {larguraVeu > 0 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-0 z-[1] bg-slate-950/35"
              style={{ left: LARGURA_ROTULO, width: larguraVeu }}
            />
          )}

          {/* Gridlines. Antes eram um repeating-linear-gradient no fundo de cada
              trilho, e isso dava dois defeitos: a repeticao acumulava erro de
              sub-pixel e o navegador engolia parte das linhas, e cada trilho
              desenhava as suas, entao a linha "quebrava" em toda borda de linha.
              Aqui sao elementos proprios, posicionados na MESMA conta que os
              cards usam (posicaoPx), atravessando a altura inteira da grade.
              Vem antes dos trilhos no DOM de proposito: como sao posicionados,
              pintam sobre as bordas horizontais (linha continua) e por ordem de
              arvore ficam sob os cards, que sao posicionados e vem depois. */}
          {horas.map((h, indice) => (
            <div
              key={`grade-${h}`}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-0 z-[2] w-px bg-slate-700"
              style={{ left: LARGURA_ROTULO + indice * larguraHora }}
            />
          ))}

          {trilhos.map(({ chave, rotulo, unidade, aulas: doGrupo, comFaixa, nFaixas }) => {
            const altura = PADDING_TRILHO * 2 + nFaixas * alturaFaixa + (nFaixas - 1) * AGENDA_GAP_FAIXA_PX;
            const vivas = doGrupo.filter((a) => !a.cancelada);
            const conflito = resumoSobreposicao(doGrupo);
            // Agrupado por SALA o curso predominante nao diz nada (uma sala
            // recebe qualquer instrumento); agrupado por professor, e o dado
            // que hoje so aparece abrindo cada aula.
            const curso = agruparPor === 'professor' ? cursoPredominante(doGrupo) : null;
            const ocupacao = ocupacaoPct(doGrupo, janela);

            return (
              <div
                key={chave}
                className="relative z-[3] grid border-b border-slate-800"
                // Largura explicita em vez de `1fr`: com `1fr` o trilho estica
                // alem de horas * larguraHora quando o piso de 88px entra em
                // acao, e as gridlines deixam de casar com o cabecalho.
                style={{ gridTemplateColumns: `${LARGURA_ROTULO}px ${larguraTrilho}px` }}
              >
                <div className="flex items-center gap-2.5 border-r border-slate-700 bg-slate-900 px-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-slate-800 text-[10.5px] font-semibold text-slate-300"
                  >
                    {iniciaisDoNome(rotulo)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold">{rotulo}</span>
                    <span className="truncate text-[11px] text-slate-400">
                      {unidade && <span className="text-cyan-400">{unidade} · </span>}
                      {curso && `${curso} · `}
                      {vivas.length} {vivas.length === 1 ? 'aula' : 'aulas'}
                    </span>
                    {/* Ocupacao: da para ver quem esta com o dia cheio sem
                        contar cartao a cartao. Uniao de intervalos, entao aula
                        sobreposta nao infla o numero. */}
                    <span
                      aria-hidden="true"
                      title={`${ocupacao}% da janela do dia ocupada`}
                      className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-slate-800"
                    >
                      <span
                        className="block h-full rounded-full bg-cyan-500/60"
                        style={{ width: `${ocupacao}%` }}
                      />
                    </span>
                    {/* O empilhamento em faixas ja acontece, mas so deixa o
                        trilho mais alto — quem varre a grade de cima nao
                        percebe. A etiqueta nomeia o conflito onde o olho esta.
                        Nao vai no card: as bordas coloridas ja carregam estado
                        e dois codigos de cor no mesmo lugar se anulam. */}
                    {conflito && (
                      <span className="mt-1 self-start rounded border border-amber-500/50 bg-amber-500/10 px-1.5 text-[9.5px] font-semibold text-amber-300">
                        {conflito.qtd} às {conflito.hora}
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative" style={{ height: Math.max(52, altura) }}>
                  {comFaixa.map((aula) => (
                    <AgendaCard
                      key={aula.chave}
                      aula={aula}
                      selecionada={selecionada?.chave === aula.chave}
                      onSelecionar={onSelecionar}
                      amplo={cardAmplo}
                      emAndamento={aulaEmAndamento(aula, minutosAgoraOuNulo)}
                      jaOcorreu={aulaJaOcorreu(data, aula.hora_fim, new Date())}
                      estilo={{
                        left: posicaoPx(aula.hora_inicio, larguraHora, janela.inicio),
                        width: Math.max(46, larguraPx(aula.duracao_minutos, larguraHora) - 4),
                        top: PADDING_TRILHO + aula.faixa * (alturaFaixa + AGENDA_GAP_FAIXA_PX),
                        height: alturaFaixa,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {reguaVisivel && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-rose-500"
              style={{ left: LARGURA_ROTULO + posicaoRegua }}
            >
              <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b bg-rose-500 px-1.5 text-[10.5px] font-bold tabular-nums text-white">
                {relogio}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Legenda permanente. As marcas E / ✕ / R / ! que existiam antes so
          significavam algo para quem construiu a tela; sinal sem legenda visivel
          e enigma. Fica FORA do bloco rolavel para as gridlines nao a cruzarem
          e para nao sumir quando a grade rola na horizontal. */}
      <div
        ref={rodapeRef}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-700 bg-slate-900 px-3.5 py-1.5 text-[10.5px] text-slate-400"
      >
        <Verbete cor="bg-emerald-500">acontecendo agora</Verbete>
        <Verbete cor="bg-violet-400">experimental</Verbete>
        <Verbete cor="bg-amber-400">reagendada</Verbete>
        <Verbete cor="bg-rose-400">cancelada</Verbete>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-amber-400" />
          risco ≥ 40%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-rose-400" />
          inadimplente
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="text-amber-300">★</span>
          aluno novo
        </span>
      </div>
    </div>
  );
}

function Verbete({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-[3px] w-3 rounded-full ${cor}`} />
      {children}
    </span>
  );
}
