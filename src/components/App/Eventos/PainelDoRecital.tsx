import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { MOLA_CURTA } from './ControlesComMovimento';

/**
 * Peças dos painéis do recital (abas Alunos e Revisão) — pedido do Hugo em 09/10: os cartões
 * de número solto "ocupam muito espaço e dizem muito pouco". Inspiração: race bar chart do
 * uiarc.dev (barras que crescem com mola, números que contam até o valor), no tema do sistema.
 */

const MOLA_BARRA = { type: 'spring', stiffness: 170, damping: 26, mass: 0.9 } as const;

/** Número que conta até o valor quando muda (sem animação para quem pede menos movimento). */
export function NumeroAnimado({ valor, className }: { valor: number; className?: string }) {
  const reduzir = useReducedMotion();
  const [exibido, setExibido] = useState(reduzir ? valor : 0);
  const anterior = useRef(reduzir ? valor : 0);
  useEffect(() => {
    if (reduzir) {
      setExibido(valor);
      anterior.current = valor;
      return;
    }
    const controle = animate(anterior.current, valor, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setExibido(Math.round(v)),
    });
    anterior.current = valor;
    return () => controle.stop();
  }, [valor, reduzir]);
  return <span className={cn('tabular-nums', className)}>{exibido.toLocaleString('pt-BR')}</span>;
}

/** Moldura comum dos painéis: título pequeno em caixa alta, valor de destaque opcional. */
export function Painel({
  titulo,
  destaque,
  children,
  className,
}: {
  titulo: string;
  destaque?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-slate-800 bg-slate-900/60 p-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</h3>
        {destaque}
      </div>
      {/* Um bloco só: com o painel esticado (flex-1 + justify-between), o título fica no topo
          e o conteúdo inteiro desce junto, em vez de se espalhar pela altura. */}
      <div>{children}</div>
    </section>
  );
}

export interface FatiaEmpilhada {
  chave: string;
  rotulo: string;
  valor: number;
  /** Classe de fundo da fatia e do ponto da legenda (ex.: 'bg-emerald-400'). */
  cor: string;
}

/** Uma barra só, dividida em fatias proporcionais, com legenda clicável embaixo. */
export function BarraEmpilhada({
  fatias,
  onEscolher,
}: {
  fatias: FatiaEmpilhada[];
  onEscolher?: (chave: string) => void;
}) {
  const reduzir = useReducedMotion();
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-800">
        {fatias.map((f) =>
          f.valor > 0 ? (
            <motion.div
              key={f.chave}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', f.cor)}
              initial={reduzir ? false : { width: 0 }}
              animate={{ width: `${total ? (f.valor / total) * 100 : 0}%` }}
              transition={reduzir ? { duration: 0 } : MOLA_BARRA}
              title={`${f.rotulo}: ${f.valor}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {fatias.map((f) => {
          const conteudo = (
            <>
              <span className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
                <span className={cn('h-2 w-2 rounded-full', f.cor)} />
                {f.rotulo}
              </span>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <NumeroAnimado valor={f.valor} className="text-[20px] font-semibold leading-none text-white" />
                <span className="text-[11.5px] tabular-nums text-slate-500">
                  {total ? Math.round((f.valor / total) * 100) : 0}%
                </span>
              </span>
            </>
          );
          return onEscolher ? (
            <button
              key={f.chave}
              type="button"
              onClick={() => onEscolher(f.chave)}
              className="flex min-h-[44px] flex-col items-start rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
            >
              {conteudo}
            </button>
          ) : (
            <div key={f.chave} className="flex flex-col px-1.5 py-1">
              {conteudo}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface LinhaDaCorrida {
  chave: string;
  rotulo: string;
  /** Tamanho total da barra (ex.: apresentações previstas). */
  total: number;
  /** Parte já feita, desenhada por cima em cor cheia (ex.: já nos blocos). */
  feito?: number;
  /** Texto à direita; sem ele, mostra `feito/total` ou `total`. */
  valorTexto?: string;
  /** Linha secundária pequena embaixo do rótulo. */
  detalhe?: string;
  cor?: string;
}

/**
 * Barras horizontais ranqueadas (race bar chart): a maior ocupa a largura toda, as outras na
 * proporção. Reordenar anima a troca de lugar (layout), crescer anima com mola.
 */
export function BarrasCorrida({
  linhas,
  ativa,
  onEscolher,
  corPadrao = 'bg-violet-500',
  compacta = false,
}: {
  /** Barras mais baixas (h-6) — para caber ao lado de painéis curtos. */
  compacta?: boolean;
  linhas: LinhaDaCorrida[];
  ativa?: string | null;
  onEscolher?: (chave: string) => void;
  corPadrao?: string;
}) {
  const reduzir = useReducedMotion();
  const maior = Math.max(1, ...linhas.map((l) => l.total));
  return (
    <ul className={compacta ? 'space-y-1' : 'space-y-1.5'}>
      {linhas.map((l) => {
        const largura = (l.total / maior) * 100;
        const feito = l.feito ?? null;
        const cor = l.cor ?? corPadrao;
        const conteudo = (
          <>
            <div className={cn('relative flex-1 overflow-hidden rounded-md bg-slate-800/60', compacta ? 'h-6' : 'h-7')}>
              <motion.div
                className={cn('absolute inset-y-0 left-0 rounded-md opacity-30', cor)}
                initial={reduzir ? false : { width: 0 }}
                animate={{ width: `${largura}%` }}
                transition={reduzir ? { duration: 0 } : MOLA_BARRA}
              />
              {feito !== null && (
                <motion.div
                  className={cn('absolute inset-y-0 left-0 rounded-md', cor)}
                  initial={reduzir ? false : { width: 0 }}
                  animate={{ width: `${(Math.min(feito, l.total) / maior) * 100}%` }}
                  transition={reduzir ? { duration: 0 } : { ...MOLA_BARRA, delay: 0.08 }}
                />
              )}
              <span className="relative flex h-full items-center gap-2 truncate px-2 text-[12.5px] font-medium text-white">
                <span className="truncate">{l.rotulo}</span>
                {l.detalhe && <span className="truncate text-[11px] font-normal text-slate-300/80">{l.detalhe}</span>}
              </span>
            </div>
            <span className="w-16 shrink-0 text-right text-[12.5px] tabular-nums text-slate-300">
              {l.valorTexto ?? (feito !== null ? `${feito}/${l.total}` : l.total)}
            </span>
          </>
        );
        return (
          <motion.li key={l.chave} layout={!reduzir} transition={MOLA_CURTA}>
            {onEscolher ? (
              <button
                type="button"
                onClick={() => onEscolher(l.chave)}
                aria-pressed={ativa === l.chave}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg p-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60',
                  ativa === l.chave ? 'ring-1 ring-amber-500/60' : 'hover:bg-slate-800/40',
                )}
              >
                {conteudo}
              </button>
            ) : (
              <div className="flex items-center gap-2 p-0.5">{conteudo}</div>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

/** Barra de progresso fina com o percentual ao lado. */
export function Progresso({ feito, total, cor = 'bg-violet-500' }: { feito: number; total: number; cor?: string }) {
  const reduzir = useReducedMotion();
  const pct = total > 0 ? Math.min(100, (feito / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
        <motion.div
          className={cn('h-full rounded-full', cor)}
          initial={reduzir ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduzir ? { duration: 0 } : MOLA_BARRA}
        />
      </div>
      <span className="w-10 text-right text-[12px] tabular-nums text-slate-400">{Math.round(pct)}%</span>
    </div>
  );
}

/* ─────────────────────── painéis prontos das abas ─────────────────────── */

export interface CursoNoPainel {
  cursoId: string;
  curso: string;
  /** Apresentações previstas desse curso (quem confirmou). */
  previstas: number;
  /** Quantas delas já estão nos blocos. */
  nosBlocos: number;
}

/**
 * Aba Alunos: confirmação, montagem dos blocos e ranking por curso, no lugar dos cinco
 * cartões de número solto. Os cliques reaproveitam os filtros que a aba já tem.
 */
export function PainelAlunos({
  elegiveis,
  participam,
  indefinidos,
  naoParticipam,
  previstas,
  nosBlocos,
  confirmadosSemBloco,
  pessoasEmBloco,
  pessoasCompletas,
  convidados,
  convidadosComNome,
  cursos,
  cursoAtivo,
  onFiltroStatus,
  onSoSemBloco,
  onCurso,
}: {
  elegiveis: number;
  participam: number;
  indefinidos: number;
  naoParticipam: number;
  previstas: number;
  nosBlocos: number;
  confirmadosSemBloco: number;
  /** Confirmados com ao menos um curso num bloco. */
  pessoasEmBloco: number;
  /** Confirmados com TODOS os cursos nos blocos. */
  pessoasCompletas: number;
  convidados: number;
  convidadosComNome: number;
  cursos: CursoNoPainel[];
  cursoAtivo?: string | null;
  onFiltroStatus?: (status: 'participa' | 'indefinido' | 'nao') => void;
  onSoSemBloco?: () => void;
  onCurso?: (cursoId: string) => void;
}) {
  const [todosCursos, setTodosCursos] = useState(false);
  const ordenados = [...cursos].sort(
    (a, b) => b.previstas - a.previstas || a.curso.localeCompare(b.curso, 'pt-BR'),
  );
  const visiveis = todosCursos ? ordenados : ordenados.slice(0, 6);
  const faltam = Math.max(0, previstas - nosBlocos);

  const fatias = [
    { chave: 'participa' as const, rotulo: 'Participam', valor: participam, cor: 'bg-emerald-400' },
    { chave: 'indefinido' as const, rotulo: 'Indefinidos', valor: indefinidos, cor: 'bg-amber-400' },
    { chave: 'nao' as const, rotulo: 'Não vão', valor: naoParticipam, cor: 'bg-rose-400' },
  ];
  const totalFatias = participam + indefinidos + naoParticipam;

  // Duas colunas: à esquerda confirmação + montagem empilhadas (compactas), à direita o
  // ranking — assim as alturas se casam e nenhum painel fica com sobra (Hugo, 09/10).
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Painel
        titulo="Caminho até o palco"
        className="flex h-full flex-col justify-between p-3"
        destaque={<span className="text-[11.5px] text-slate-500">pessoas · ↓ = quem ficou entre uma etapa e outra</span>}
      >
        <FunilFluxo
          etapas={[
            { chave: 'elegiveis', rotulo: 'Elegíveis', valor: elegiveis, detalhe: 'alunos ativos da unidade' },
            { chave: 'participa', rotulo: 'Confirmados', valor: participam },
            { chave: 'em_bloco', rotulo: 'Em algum bloco', valor: pessoasEmBloco },
          ]}
          onEscolher={(c) => {
            if (c === 'participa') onFiltroStatus?.('participa');
            if (c === 'em_bloco' && onSoSemBloco) onSoSemBloco();
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-[12px] text-slate-400">
          {fatias.slice(1).map((f) => (
            <button
              key={f.chave}
              type="button"
              disabled={!onFiltroStatus}
              onClick={() => onFiltroStatus?.(f.chave)}
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors enabled:hover:bg-slate-800/70"
            >
              <span className={cn('h-2 w-2 rounded-full', f.cor)} />
              {f.rotulo} <span className="font-semibold tabular-nums text-slate-200">{f.valor}</span>
            </button>
          ))}
          <span>
            Faltam alocar <span className="font-semibold tabular-nums text-amber-300">{faltam}</span> apresentações
          </span>
          <span>
            Convidados <span className="font-semibold tabular-nums text-slate-200">{convidados}</span>
            {convidados > 0 && (
              <span className={convidadosComNome >= convidados ? 'text-emerald-400' : 'text-amber-400'}>
                {' '}({convidadosComNome >= convidados ? 'todos com nome' : `${convidadosComNome} com nome`})
              </span>
            )}
          </span>
        </div>
      </Painel>

      <Painel
        titulo="Por curso"
        className="h-full p-3"
        destaque={
          <span className="flex items-center gap-3 text-[11.5px] text-slate-500">
            <span>cheia = nos blocos · clara = confirmados</span>
            {ordenados.length > 6 && (
              <button
                type="button"
                onClick={() => setTodosCursos((v) => !v)}
                className="text-[12px] text-violet-300 hover:text-violet-200"
              >
                {todosCursos ? 'só os 6 maiores' : `ver os ${ordenados.length}`}
              </button>
            )}
          </span>
        }
      >
        {visiveis.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">Ninguém confirmou ainda.</p>
        ) : (
          <BarrasCorrida
            compacta
            linhas={visiveis.map((c) => ({
              chave: c.cursoId,
              rotulo: c.curso,
              total: c.previstas,
              feito: c.nosBlocos,
            }))}
            ativa={cursoAtivo}
            onEscolher={onCurso}
          />
        )}
      </Painel>
    </div>
  );
}

/** Barra empilhada só a faixa, sem legenda (a legenda do painel é compacta, em linha). */
function BarraFina({ fatias, total }: { fatias: FatiaEmpilhada[]; total: number }) {
  const reduzir = useReducedMotion();
  return (
    <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-800">
      {fatias.map((f) =>
        f.valor > 0 ? (
          <motion.div
            key={f.chave}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', f.cor)}
            initial={reduzir ? false : { width: 0 }}
            animate={{ width: `${total ? (f.valor / total) * 100 : 0}%` }}
            transition={reduzir ? { duration: 0 } : MOLA_BARRA}
            title={`${f.rotulo}: ${f.valor}`}
          />
        ) : null,
      )}
    </div>
  );
}

export interface BlocoNoPainel {
  id: number;
  nome: string;
  inicio: string;
  fim: string;
  duracaoSegundos: number;
  numeros: number;
  conflito?: boolean;
  /** Dia do bloco ('AAAA-MM-DD') — recital de vários dias ganha uma linha por dia. */
  dia?: string | null;
}

function duracaoCurta(seg: number) {
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Aba Revisão: totais compactos + a linha do recital, uma barra por bloco. */
export function PainelRevisao({
  participantes,
  apresentacoes,
  inicio,
  termino,
  duracaoSegundos,
  semDuracaoPropria,
  blocos,
  rotuloDoDia,
}: {
  rotuloDoDia?: (dia: string) => string;
  participantes: number;
  apresentacoes: number;
  inicio: string | null;
  termino: string | null;
  duracaoSegundos: number;
  semDuracaoPropria: number;
  blocos: BlocoNoPainel[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Painel titulo="O recital" className="p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[24px] font-semibold leading-none tabular-nums text-white">{inicio ?? '--:--'}</span>
          <span className="text-[13px] text-slate-500">→</span>
          <span className="text-[24px] font-semibold leading-none tabular-nums text-amber-300">
            {termino ?? '--:--'}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          {duracaoSegundos > 0 ? `${duracaoCurta(duracaoSegundos)} de recital` : 'nenhum bloco montado'}
          {semDuracaoPropria > 0 &&
            apresentacoes > 0 &&
            ` · término estimado (${semDuracaoPropria} sem duração própria)`}
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-800 pt-2">
          {[
            { rotulo: 'participantes', valor: participantes },
            { rotulo: 'apresentações', valor: apresentacoes },
            { rotulo: 'blocos', valor: blocos.length },
          ].map((k) => (
            <div key={k.rotulo}>
              <NumeroAnimado valor={k.valor} className="text-[16px] font-semibold text-white" />
              <p className="text-[11.5px] text-slate-500">{k.rotulo}</p>
            </div>
          ))}
        </div>
      </Painel>

      <Painel
        titulo="Linha do recital"
        className="p-3 lg:col-span-2"
        destaque={<span className="text-[12px] text-slate-500">posição e tamanho = horário real</span>}
      >
        {blocos.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">Monte os blocos na aba Blocos.</p>
        ) : (
          <LinhaDoTempo
            rotuloDoDia={rotuloDoDia}
            faixas={blocos.map((b) => ({
              id: b.id,
              nome: b.nome,
              inicio: b.inicio,
              fim: b.fim,
              numeros: b.numeros,
              conflito: b.conflito,
              dia: b.dia ?? null,
            }))}
          />
        )}
      </Painel>
    </div>
  );
}

export interface BlocoNaChegadaDoPainel {
  id: number;
  nome: string;
  inicio: string;
  pessoas: number;
  chegaram: number;
}

/**
 * Aba Check-in: chegada geral com progresso, apresentações com a pessoa no teatro e o
 * andamento por bloco — no lugar dos quatro cartões de número solto (Hugo, 09/10).
 */
export function PainelCheckin({
  esperados,
  chegaram,
  apresentacoes,
  apresentacoesSemChegada,
  blocos,
}: {
  esperados: number;
  chegaram: number;
  apresentacoes: number;
  apresentacoesSemChegada: number;
  blocos: BlocoNaChegadaDoPainel[];
}) {
  const faltam = Math.max(0, esperados - chegaram);
  const prontas = Math.max(0, apresentacoes - apresentacoesSemChegada);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Painel titulo="Chegada" className="flex h-full flex-col justify-center p-3">
        <div className="flex items-center gap-5">
          <Anel feito={chegaram} total={esperados} rotulo="chegaram" />
          <div className="min-w-0 space-y-2.5">
            <div>
              <p className="text-[11.5px] text-slate-500">No teatro</p>
              <p className="text-[15px] text-slate-300">
                <NumeroAnimado valor={chegaram} className="text-[22px] font-semibold text-emerald-300" /> de{' '}
                <span className="tabular-nums">{esperados}</span>
              </p>
            </div>
            <div>
              <p className="text-[11.5px] text-slate-500">Faltam chegar</p>
              <NumeroAnimado valor={faltam} className="text-[18px] font-semibold text-amber-300" />
            </div>
            <div>
              <p className="text-[11.5px] text-slate-500">Apresentações prontas</p>
              <p className="text-[13px] text-slate-300">
                <span className="font-semibold tabular-nums text-white">{prontas}</span> de{' '}
                <span className="tabular-nums">{apresentacoes}</span>
                {apresentacoesSemChegada > 0 && (
                  <span className="text-slate-500"> · {apresentacoesSemChegada} com a pessoa fora</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </Painel>

      <Painel
        titulo="Por bloco"
        className="h-full p-3"
        destaque={<span className="text-[11.5px] text-slate-500">cheia = chegaram · clara = esperados</span>}
      >
        {blocos.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">Nenhum bloco montado.</p>
        ) : (
          <BarrasCorrida
            compacta
            corPadrao="bg-emerald-500"
            linhas={blocos.map((b) => ({
              chave: String(b.id),
              rotulo: b.nome,
              detalhe: b.inicio,
              total: Math.max(b.pessoas, 1),
              feito: b.chegaram,
              valorTexto: `${b.chegaram}/${b.pessoas}`,
            }))}
          />
        )}
      </Painel>
    </div>
  );
}

/* ─────────────────────── gráficos alternativos (09/10) ─────────────────────── */

export interface EtapaDoFunil {
  chave: string;
  rotulo: string;
  valor: number;
  /** Texto curto embaixo do rótulo (ex.: o que a etapa significa). */
  detalhe?: string;
}

/**
 * Funil: cada etapa é uma barra centrada, do tamanho proporcional à primeira, com a
 * passagem (%) entre uma e outra. Mostra num olhar onde a fila trava.
 */
export function Funil({
  etapas,
  cores = ['bg-slate-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-400'],
  onEscolher,
}: {
  etapas: EtapaDoFunil[];
  cores?: string[];
  onEscolher?: (chave: string) => void;
}) {
  const reduzir = useReducedMotion();
  const topo = Math.max(1, etapas[0]?.valor ?? 1);
  return (
    <ol className="space-y-1">
      {etapas.map((e, i) => {
        const largura = Math.max(8, (e.valor / topo) * 100);
        const anterior = i > 0 ? etapas[i - 1].valor : null;
        const passagem = anterior ? Math.round((e.valor / anterior) * 100) : null;
        const conteudo = (
          <div className="flex items-center gap-3">
            <div className="w-36 shrink-0 text-left">
              <p className="text-[12.5px] font-medium text-slate-200">{e.rotulo}</p>
              {e.detalhe && <p className="truncate text-[11px] text-slate-500">{e.detalhe}</p>}
            </div>
            <div className="flex h-8 flex-1 items-center justify-center">
              <motion.div
                className={cn('flex h-full items-center justify-center rounded-md', cores[i % cores.length])}
                initial={reduzir ? false : { width: 0 }}
                animate={{ width: `${largura}%` }}
                transition={reduzir ? { duration: 0 } : { ...MOLA_BARRA, delay: i * 0.06 }}
              >
                <NumeroAnimado valor={e.valor} className="text-[13px] font-semibold text-slate-950" />
              </motion.div>
            </div>
            <span className="w-12 shrink-0 text-right text-[11.5px] tabular-nums text-slate-500">
              {passagem !== null ? `${passagem}%` : ''}
            </span>
          </div>
        );
        return (
          <li key={e.chave}>
            {onEscolher ? (
              <button
                type="button"
                onClick={() => onEscolher(e.chave)}
                className="w-full rounded-lg p-0.5 transition-colors hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
              >
                {conteudo}
              </button>
            ) : (
              <div className="p-0.5">{conteudo}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export interface FaixaDaLinha {
  id: number;
  nome: string;
  inicio: string;
  fim: string;
  numeros: number;
  conflito?: boolean;
  /** Dia do bloco ('AAAA-MM-DD'); separa uma linha por dia em recital de vários dias. */
  dia?: string | null;
}

function minutos(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Linha do tempo do dia: régua de horas, blocos como faixas na posição e no tamanho reais,
 * intervalos como vãos. Um dia por linha.
 */
export function LinhaDoTempo({ faixas, rotuloDoDia }: { faixas: FaixaDaLinha[]; rotuloDoDia?: (dia: string) => string }) {
  const reduzir = useReducedMotion();
  const validas = faixas.filter((f) => /^\d{1,2}:\d{2}/.test(f.inicio) && /^\d{1,2}:\d{2}/.test(f.fim));
  const dias = [...new Set(validas.map((f) => f.dia ?? ''))];
  return (
    <div className="space-y-4">
      {dias.map((dia) => {
        const doDia = validas.filter((f) => (f.dia ?? '') === dia);
        const ini = Math.floor(Math.min(...doDia.map((f) => minutos(f.inicio))) / 60) * 60;
        const fim = Math.ceil(Math.max(...doDia.map((f) => Math.max(minutos(f.fim), minutos(f.inicio) + 1))) / 60) * 60;
        const span = Math.max(60, fim - ini);
        const horas = Array.from({ length: span / 60 + 1 }, (_, i) => ini + i * 60);
        const pos = (m: number) => ((m - ini) / span) * 100;
        return (
          <div key={dia || 'unico'}>
            {dias.length > 1 && rotuloDoDia && (
              <p className="mb-1 text-[11.5px] font-medium text-slate-400">{rotuloDoDia(dia)}</p>
            )}
            <div className="relative h-14 rounded-lg bg-slate-800/40">
              {horas.map((h) => (
                <div key={h} className="absolute inset-y-0 border-l border-slate-700/60" style={{ left: `${pos(h)}%` }}>
                  <span className="absolute -bottom-4 -translate-x-1/2 text-[10.5px] tabular-nums text-slate-500">
                    {String(Math.floor(h / 60)).padStart(2, '0')}h
                  </span>
                </div>
              ))}
              {doDia.map((f, i) => {
                const a = minutos(f.inicio);
                const b = Math.max(minutos(f.fim), a + 1);
                return (
                  <motion.div
                    key={f.id}
                    title={`${f.nome} · ${f.inicio}–${f.fim} · ${f.numeros} números`}
                    className={cn(
                      'absolute inset-y-1.5 flex flex-col justify-center overflow-hidden rounded-md px-1.5 ring-1 ring-inset',
                      f.conflito
                        ? 'bg-rose-500/30 ring-rose-400/60'
                        : f.numeros === 0
                          ? 'bg-slate-700/50 ring-slate-500/40'
                          : 'bg-amber-500/25 ring-amber-400/50',
                    )}
                    style={{ left: `${pos(a)}%` }}
                    initial={reduzir ? false : { width: 0, opacity: 0 }}
                    animate={{ width: `${Math.max(1.2, pos(b) - pos(a))}%`, opacity: 1 }}
                    transition={reduzir ? { duration: 0 } : { ...MOLA_BARRA, delay: i * 0.05 }}
                  >
                    <span className="truncate text-[11.5px] font-semibold text-white">{f.nome}</span>
                    <span className="truncate text-[10.5px] tabular-nums text-slate-300">
                      {f.inicio}–{f.fim} · {f.numeros}
                    </span>
                  </motion.div>
                );
              })}
            </div>
            <div className="h-4" />
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-amber-500/40" /> bloco</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-slate-600" /> bloco vazio</span>
        <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-rose-500/50" /> começa antes do anterior terminar</span>
        <span>· vão = intervalo</span>
      </div>
    </div>
  );
}

/** Anel de progresso (SVG), com o percentual e um rótulo no meio. */
export function Anel({
  feito,
  total,
  tamanho = 132,
  espessura = 12,
  cor = 'stroke-emerald-400',
  rotulo,
}: {
  feito: number;
  total: number;
  tamanho?: number;
  espessura?: number;
  cor?: string;
  rotulo?: string;
}) {
  const reduzir = useReducedMotion();
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, feito / total) : 0;
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" strokeWidth={espessura} className="stroke-slate-800" />
        <motion.circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          strokeWidth={espessura}
          strokeLinecap="round"
          className={cor}
          strokeDasharray={c}
          initial={reduzir ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={reduzir ? { duration: 0 } : MOLA_BARRA}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-semibold tabular-nums text-white', tamanho >= 100 ? 'text-[26px]' : 'text-[14px]')}>
          {Math.round(pct * 100)}%
        </span>
        {rotulo && <span className="text-[11px] text-slate-500">{rotulo}</span>}
      </div>
    </div>
  );
}

/* ─────────────── funil afunilado com fluxo (inspirado no Funnel chart do uiarc) ─────────────── */

const LARGURA_FUNIL = 1000;
const ALTURA_FUNIL = 180;
const TRANSICAO = 0.32; // fração do segmento usada na curva até a etapa seguinte

/** Meia altura da faixa em cada etapa (px do viewBox), com piso para a última não sumir. */
function meiasAlturas(valores: number[]) {
  const topo = Math.max(1, valores[0] ?? 1);
  return valores.map((v) => Math.max(5, (v / topo) * (ALTURA_FUNIL / 2 - 4)));
}

/** Meia altura da faixa numa posição x (mesma curva do desenho, para os pontos ficarem dentro). */
function meiaAlturaEm(x: number, meias: number[]) {
  const seg = LARGURA_FUNIL / meias.length;
  const i = Math.min(meias.length - 1, Math.floor(x / seg));
  const local = x - i * seg;
  const inicioCurva = seg * (1 - TRANSICAO);
  if (i === meias.length - 1 || local <= inicioCurva) return meias[i];
  const t = (local - inicioCurva) / (seg - inicioCurva);
  const suave = t * t * (3 - 2 * t);
  return meias[i] + (meias[i + 1] - meias[i]) * suave;
}

function caminhoDaFaixa(meias: number[]) {
  const seg = LARGURA_FUNIL / meias.length;
  const c = ALTURA_FUNIL / 2;
  let topo = `M 0 ${c - meias[0]}`;
  meias.forEach((m, i) => {
    const fimPlano = i * seg + seg * (1 - TRANSICAO);
    const fim = (i + 1) * seg;
    topo += ` L ${fimPlano} ${c - m}`;
    if (i < meias.length - 1) {
      const prox = meias[i + 1];
      const meio = (fimPlano + fim) / 2;
      topo += ` C ${meio} ${c - m}, ${meio} ${c - prox}, ${fim} ${c - prox}`;
    } else {
      topo += ` L ${fim} ${c - m}`;
    }
  });
  let base = '';
  for (let i = meias.length - 1; i >= 0; i--) {
    const m = meias[i];
    const inicio = i * seg;
    const fimPlano = i * seg + seg * (1 - TRANSICAO);
    if (i === meias.length - 1) base += ` L ${LARGURA_FUNIL} ${c + m} L ${fimPlano} ${c + m}`;
    else {
      const prox = meias[i + 1];
      const fim = (i + 1) * seg;
      const meio = (fimPlano + fim) / 2;
      base += ` C ${meio} ${c + prox}, ${meio} ${c + m}, ${fimPlano} ${c + m}`;
    }
    if (i > 0) base += ` L ${inicio} ${c + m}`;
    else base += ` L 0 ${c + m}`;
  }
  return `${topo}${base} Z`;
}

interface Ponto {
  x: number;
  r: number; // posição vertical relativa (-1..1) dentro da faixa
  vel: number;
  morreEm: number; // índice da passagem em que sai do funil (meias.length = chega ao fim)
  alfa: number;
}

/**
 * Funil afunilado: faixa contínua que estreita de etapa em etapa, números em cima, perda
 * embaixo de cada passagem e pontos que correm pela faixa — os que "ficam pelo caminho"
 * apagam na passagem onde a pessoa saiu (proporcional à perda real).
 */
export function FunilFluxo({
  etapas,
  onEscolher,
}: {
  etapas: { chave: string; rotulo: string; valor: number; detalhe?: string }[];
  onEscolher?: (chave: string) => void;
}) {
  const reduzir = useReducedMotion();
  const valores = etapas.map((e) => e.valor);
  const meias = meiasAlturas(valores);
  const inicio = Math.max(1, valores[0] ?? 1);
  const seg = LARGURA_FUNIL / Math.max(1, etapas.length);
  const pontosRef = useRef<SVGGElement>(null);
  const chaveValores = valores.join(',');

  useEffect(() => {
    if (reduzir || etapas.length < 2) return;
    const g = pontosRef.current;
    if (!g) return;
    const vals = chaveValores.split(',').map(Number);
    const mh = meiasAlturas(vals);
    const sorteiaMorte = () => {
      // Chance de passar por cada passagem = conversão real daquela etapa.
      for (let i = 0; i < vals.length - 1; i++) {
        const passa = vals[i] > 0 ? vals[i + 1] / vals[i] : 0;
        if (Math.random() > passa) return i;
      }
      return vals.length;
    };
    const novo = (x = 0): Ponto => ({
      x,
      r: (Math.random() * 2 - 1) * 0.8,
      vel: 0.9 + Math.random() * 0.9,
      morreEm: sorteiaMorte(),
      alfa: 1,
    });
    const pontos: Ponto[] = Array.from({ length: 46 }, () => novo(Math.random() * LARGURA_FUNIL));
    const circulos = pontos.map(() => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '2.6');
      c.setAttribute('class', 'fill-slate-200');
      g.appendChild(c);
      return c;
    });
    const segL = LARGURA_FUNIL / vals.length;
    let quadro = 0;
    const passo = () => {
      pontos.forEach((p, i) => {
        p.x += p.vel;
        const passagem = (p.morreEm + 1) * segL - segL * TRANSICAO * 0.5;
        if (p.morreEm < vals.length - 1 && p.x > passagem) p.alfa -= 0.06;
        if (p.x > LARGURA_FUNIL || p.alfa <= 0) Object.assign(p, novo(0));
        const y = ALTURA_FUNIL / 2 + p.r * meiaAlturaEm(p.x, mh);
        circulos[i].setAttribute('cx', p.x.toFixed(1));
        circulos[i].setAttribute('cy', y.toFixed(1));
        circulos[i].setAttribute('opacity', String(Math.max(0, p.alfa) * 0.75));
      });
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(quadro);
      circulos.forEach((c) => c.remove());
    };
  }, [reduzir, chaveValores, etapas.length]);

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}>
        {etapas.map((e) => {
          const conteudo = (
            <>
              <span className="block truncate text-[12px] text-slate-400">{e.rotulo}</span>
              <NumeroAnimado valor={e.valor} className="block text-[22px] font-semibold leading-tight text-white" />
              <span className="block truncate text-[11px] text-slate-500">
                {e === etapas[0] ? (e.detalhe ?? 'início') : `${Math.round((e.valor / inicio) * 100)}% do início`}
              </span>
            </>
          );
          return onEscolher ? (
            <button
              key={e.chave}
              type="button"
              onClick={() => onEscolher(e.chave)}
              className="min-w-0 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
            >
              {conteudo}
            </button>
          ) : (
            <div key={e.chave} className="min-w-0 px-1.5 py-1">
              {conteudo}
            </div>
          );
        })}
      </div>

      <svg
        viewBox={`0 0 ${LARGURA_FUNIL} ${ALTURA_FUNIL}`}
        preserveAspectRatio="none"
        className="mt-2 h-28 w-full"
        role="img"
        aria-label={etapas.map((e) => `${e.rotulo} ${e.valor}`).join(', ')}
      >
        <defs>
          <linearGradient id="funil-faixa" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgb(139 92 246 / 0.55)" />
            <stop offset="100%" stopColor="rgb(16 185 129 / 0.45)" />
          </linearGradient>
        </defs>
        <motion.path
          d={caminhoDaFaixa(meias)}
          fill="url(#funil-faixa)"
          initial={reduzir ? false : { opacity: 0 }}
          animate={{ opacity: 1, d: caminhoDaFaixa(meias) }}
          transition={reduzir ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        <g ref={pontosRef} />
      </svg>

      <div className="relative mt-1 h-4">
        {etapas.slice(1).map((e, i) => {
          const antes = etapas[i].valor;
          const perda = antes > 0 ? Math.round((1 - e.valor / antes) * 100) : 0;
          return (
            <span
              key={e.chave}
              className="absolute -translate-x-1/2 text-[11.5px] tabular-nums text-slate-500"
              style={{ left: `${(((i + 1) * seg - seg * TRANSICAO * 0.5) / LARGURA_FUNIL) * 100}%` }}
              title={`${antes - e.valor} ficaram entre ${etapas[i].rotulo} e ${e.rotulo}`}
            >
              ↓ {perda}%
            </span>
          );
        })}
      </div>
    </div>
  );
}
