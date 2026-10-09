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
      <div className="flex flex-col gap-3">
        <Painel
          titulo="Confirmação"
          // flex-1: as duas dividem a altura da coluna, que a grade iguala à do ranking —
          // topo e base alinhados com o painel da direita.
          className="flex flex-1 flex-col justify-between p-3"
          destaque={
            <span className="text-[12px] text-slate-500">
              <NumeroAnimado valor={elegiveis} className="font-semibold text-slate-300" /> elegíveis
              {' · '}
              convidados <span className="font-semibold tabular-nums text-slate-300">{convidados}</span>
              {convidados > 0 && (
                <span className={convidadosComNome >= convidados ? 'text-emerald-400' : 'text-amber-400'}>
                  {' '}({convidadosComNome >= convidados ? 'todos com nome' : `${convidadosComNome} com nome`})
                </span>
              )}
            </span>
          }
        >
          <BarraFina fatias={fatias} total={totalFatias} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {fatias.map((f) => (
              <button
                key={f.chave}
                type="button"
                disabled={!onFiltroStatus}
                onClick={() => onFiltroStatus?.(f.chave)}
                className="flex items-baseline gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors enabled:hover:bg-slate-800/70"
              >
                <span className={cn('h-2 w-2 self-center rounded-full', f.cor)} />
                <span className="text-[12px] text-slate-400">{f.rotulo}</span>
                <NumeroAnimado valor={f.valor} className="text-[16px] font-semibold text-white" />
                <span className="text-[11px] tabular-nums text-slate-500">
                  {totalFatias ? Math.round((f.valor / totalFatias) * 100) : 0}%
                </span>
              </button>
            ))}
          </div>
        </Painel>

        <Painel
          titulo="Montagem dos blocos"
          // flex-1: as duas dividem a altura da coluna, que a grade iguala à do ranking —
          // topo e base alinhados com o painel da direita.
          className="flex flex-1 flex-col justify-between p-3"
          destaque={
            <span className="text-[12px] text-slate-500">
              <NumeroAnimado valor={nosBlocos} className="font-semibold text-white" /> de{' '}
              <span className="tabular-nums">{previstas}</span> nos blocos
            </span>
          }
        >
          <Progresso feito={nosBlocos} total={previstas} cor="bg-violet-500" />
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-slate-400">
            <span>
              Faltam alocar <NumeroAnimado valor={faltam} className="text-[16px] font-semibold text-amber-300" />
            </span>
            {onSoSemBloco ? (
              <button
                type="button"
                onClick={onSoSemBloco}
                className="rounded-md px-1 py-0.5 transition-colors hover:bg-slate-800/70"
                title="Mostrar só quem confirmou e ainda não está em nenhum bloco"
              >
                Confirmados sem bloco{' '}
                <NumeroAnimado valor={confirmadosSemBloco} className="text-[16px] font-semibold text-slate-200" /> →
              </button>
            ) : (
              <span>
                Confirmados sem bloco{' '}
                <NumeroAnimado valor={confirmadosSemBloco} className="text-[16px] font-semibold text-slate-200" />
              </span>
            )}
          </div>
        </Painel>
      </div>

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
}: {
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
        destaque={<span className="text-[12px] text-slate-500">tamanho = duração do bloco</span>}
      >
        {blocos.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">Monte os blocos na aba Blocos.</p>
        ) : (
          <BarrasCorrida
            compacta
            linhas={blocos.map((b) => ({
              chave: String(b.id),
              rotulo: b.nome,
              detalhe: `${b.inicio}–${b.fim}`,
              total: Math.max(b.duracaoSegundos, 1),
              valorTexto: `${b.numeros} núm.`,
              cor: b.conflito ? 'bg-rose-500' : 'bg-amber-500',
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
      <div className="flex flex-col gap-3">
        <Painel
          titulo="Chegada"
          className="flex flex-1 flex-col justify-between p-3"
          destaque={
            <span className="text-[12px] text-slate-500">
              <NumeroAnimado valor={chegaram} className="font-semibold text-emerald-300" /> de{' '}
              <span className="tabular-nums">{esperados}</span> no teatro
            </span>
          }
        >
          <Progresso feito={chegaram} total={esperados} cor="bg-emerald-400" />
          <p className="mt-2 text-[12px] text-slate-400">
            Faltam <NumeroAnimado valor={faltam} className="text-[16px] font-semibold text-amber-300" />{' '}
            {faltam === 1 ? 'pessoa' : 'pessoas'}
          </p>
        </Painel>
        <Painel
          titulo="Quem sobe ao palco"
          className="flex flex-1 flex-col justify-between p-3"
          destaque={
            <span className="text-[12px] text-slate-500">
              <NumeroAnimado valor={prontas} className="font-semibold text-white" /> de{' '}
              <span className="tabular-nums">{apresentacoes}</span> apresentações prontas
            </span>
          }
        >
          <Progresso feito={prontas} total={apresentacoes} cor="bg-violet-500" />
          <p className="mt-2 text-[12px] text-slate-400">
            {apresentacoes === 0
              ? 'Nenhum bloco montado.'
              : apresentacoesSemChegada > 0
                ? `${apresentacoesSemChegada} com a pessoa ainda fora do teatro`
                : 'Todo mundo que sobe ao palco chegou.'}
          </p>
        </Painel>
      </div>

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
