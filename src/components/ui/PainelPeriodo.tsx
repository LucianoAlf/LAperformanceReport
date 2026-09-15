import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { DatePicker } from '@/components/ui/date-picker';
import type { TipoCompetencia, CompetenciaFiltro, CompetenciaRange } from '@/hooks/useCompetenciaFiltro';
import { cn } from '@/lib/utils';

/**
 * Os dois eixos da escolha de periodo — ESCOPO (mes? trimestre? ano?) e VALOR
 * (qual mes?) — separados, com o valor numa grade onde um toque resolve.
 *
 * ⚠️ Extraido do SeletorPeriodo da Agenda (03/08/2026) para que a folha do
 * celular use O MESMO painel, e nao uma terceira versao das listas de meses,
 * trimestres e semestres. O diagnostico que criou aquele componente vale
 * inteiro no telefone, e por escrito desde entao: o `CompetenciaFilter`
 * "empilha tres metaforas na mesma faixa" e "escolher um mes exige dois
 * cliques em dois controles diferentes, porque os 12 meses so existem dentro
 * de um `<select>`". Num `<select>` dentro de uma folha, isso vira ainda
 * camada sobre camada.
 *
 * Isto e' APRESENTACAO: dirige exatamente as mesmas funcoes de
 * `useCompetenciaFiltro`, entao o periodo continua sendo o mesmo objeto que o
 * layout distribui. O `CompetenciaFilter` segue intocado nas paginas irmas.
 */

const ESCOPOS: Array<{ id: TipoCompetencia; rotulo: string }> = [
  { id: 'mensal', rotulo: 'Mês' },
  { id: 'trimestral', rotulo: 'Trimestre' },
  { id: 'semestral', rotulo: 'Semestre' },
  { id: 'anual', rotulo: 'Ano' },
  { id: 'personalizado', rotulo: 'Personalizado' },
];

// Separados dos demais: nao sao recortes que se escolhe num calendario, sao
// atalhos. Ficam depois de uma divisoria para nao competirem com os escopos.
const ATALHOS: Array<{ id: TipoCompetencia; rotulo: string }> = [
  { id: 'diario', rotulo: 'Hoje' },
  { id: 'todos', rotulo: 'Tudo' },
];

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const TRIMESTRES = [
  { valor: 1 as const, rotulo: 'T1', meses: 'Jan – Mar' },
  { valor: 2 as const, rotulo: 'T2', meses: 'Abr – Jun' },
  { valor: 3 as const, rotulo: 'T3', meses: 'Jul – Set' },
  { valor: 4 as const, rotulo: 'T4', meses: 'Out – Dez' },
];

const SEMESTRES = [
  { valor: 1 as const, rotulo: '1º semestre', meses: 'Jan – Jun' },
  { valor: 2 as const, rotulo: '2º semestre', meses: 'Jul – Dez' },
];

/**
 * Intervalo por extenso. "T3" nao diz a ninguem quais meses entram — escrever
 * as datas evita que o usuario tenha de decorar a convencao da escola.
 */
export function intervaloPorExtenso(inicio: string, fim: string): string | null {
  const a = parseISO(inicio);
  const b = parseISO(fim);
  if (!isValid(a) || !isValid(b)) return null;
  const mesmoAno = a.getFullYear() === b.getFullYear();
  return `${format(a, "d 'de' MMMM", { locale: ptBR })}${mesmoAno ? '' : ` de ${a.getFullYear()}`} – ${format(b, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
}

function Celula({
  rotulo,
  secundario,
  ligado,
  onClick,
}: {
  rotulo: string;
  secundario?: string;
  ligado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ligado}
      className={cn(
        'rounded-md border px-1 py-2 text-center text-[12.5px] tabular-nums transition-colors',
        // O alvo cresce so no toque: no desktop a celula da Agenda continua
        // com a altura que py-2 sempre deu.
        '[@media(pointer:coarse)]:min-h-[44px]',
        ligado
          ? 'border-cyan-500 bg-cyan-500/15 font-semibold text-white'
          : 'border-transparent bg-slate-400/5 text-slate-300 hover:bg-slate-400/15 hover:text-white',
      )}
    >
      {rotulo}
      {secundario && (
        <span className={cn('mt-px block text-[10px]', ligado ? 'text-slate-200/70' : 'text-slate-500')}>
          {secundario}
        </span>
      )}
    </button>
  );
}

export interface PainelPeriodoProps {
  filtro: CompetenciaFiltro;
  range: CompetenciaRange;
  anosDisponiveis: number[];
  setTipo: (tipo: TipoCompetencia) => void;
  setAno: (ano: number) => void;
  setMes: (mes: number) => void;
  setTrimestre: (trimestre: 1 | 2 | 3 | 4) => void;
  setSemestre: (semestre: 1 | 2) => void;
  setDataInicio?: (data: Date | undefined) => void;
  setDataFim?: (data: Date | undefined) => void;
  /**
   * Chamado quando um VALOR e escolhido (a decisao terminou) — nunca ao trocar
   * de escopo, porque ali o proximo toque ainda esta por vir na grade.
   */
  onEscolheuValor?: () => void;
  /**
   * Restringe os escopos oferecidos, como no `CompetenciaFilter`. Telas que
   * so fazem sentido em recorte mensal nao podem ganhar "Semestre" de brinde
   * so porque a apresentacao mudou para a folha do celular.
   */
  tiposPermitidos?: TipoCompetencia[];
  /**
   * `colunas`: escopo a esquerda, grade a direita (painel largo, Agenda).
   * `empilhado`: escopo em chips no topo, grade abaixo — em ~350px nao ha
   * largura para duas colunas sem espremer a grade dos meses.
   */
  layout?: 'colunas' | 'empilhado';
}

export function PainelPeriodo({
  filtro,
  range,
  anosDisponiveis,
  setTipo,
  setAno,
  setMes,
  setTrimestre,
  setSemestre,
  setDataInicio,
  setDataFim,
  onEscolheuValor,
  layout = 'colunas',
  tiposPermitidos,
}: PainelPeriodoProps) {
  // `undefined` = todos (o padrao de antes de a prop existir); lista vazia
  // tambem cai em "todos", porque um painel sem nenhum escopo nao permitiria
  // escolher nada — falha muda pior que o defeito.
  const permitido = (id: TipoCompetencia) =>
    !tiposPermitidos || tiposPermitidos.length === 0 || tiposPermitidos.includes(id);
  const anos = anosDisponiveis.length > 0 ? anosDisponiveis : [filtro.ano];
  const anoMin = Math.min(...anos);
  const anoMax = Math.max(...anos);
  const empilhado = layout === 'empilhado';

  const escolher = (aplicar: () => void) => {
    aplicar();
    onEscolheuValor?.();
  };

  const escopoAtivo = (id: TipoCompetencia) => filtro.tipo === id;

  const botaoEscopo = (item: { id: TipoCompetencia; rotulo: string }, fecha: boolean) => (
    <button
      key={item.id}
      type="button"
      onClick={() => (fecha ? escolher(() => setTipo(item.id)) : setTipo(item.id))}
      aria-pressed={escopoAtivo(item.id)}
      className={cn(
        'rounded-md transition-colors',
        empilhado
          ? 'px-3 py-2 text-[13px] [@media(pointer:coarse)]:min-h-[44px]'
          : 'px-2.5 py-1.5 text-left text-[13px]',
        escopoAtivo(item.id)
          ? 'bg-cyan-500/15 font-semibold text-cyan-400'
          : 'text-slate-400 hover:bg-slate-400/10 hover:text-slate-200',
      )}
    >
      {item.rotulo}
    </button>
  );

  const escopos = (
    <nav
      className={cn(
        empilhado
          ? 'flex flex-wrap items-center gap-1 rounded-lg bg-slate-950/40 p-1'
          : 'flex flex-col gap-px border-r border-slate-800 bg-slate-950/40 p-2',
      )}
    >
      {ESCOPOS.filter((e) => permitido(e.id)).map((e) => botaoEscopo(e, false))}
      <span
        className={cn('bg-slate-800', empilhado ? 'mx-0.5 h-5 w-px' : 'mx-1 my-1.5 h-px')}
        aria-hidden="true"
      />
      {ATALHOS.filter((a) => permitido(a.id)).map((a) => botaoEscopo(a, true))}
    </nav>
  );

  const valores = (
    <div className={cn('flex flex-col gap-3', empilhado ? 'pt-3' : 'p-3.5')}>
      {/* O passo de ano nao aparece onde nao significa nada: em "Ano" o
          proprio grid escolhe o ano, e nos atalhos nao ha ano nenhum. */}
      {(filtro.tipo === 'mensal' || filtro.tipo === 'trimestral' || filtro.tipo === 'semestral') && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Ano anterior"
            disabled={filtro.ano <= anoMin}
            onClick={() => setAno(filtro.ano - 1)}
            className={cn(
              'grid place-items-center rounded-md border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400',
              empilhado ? 'h-11 w-11' : 'h-[26px] w-[26px]',
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className={cn('font-semibold tabular-nums', empilhado ? 'text-base' : 'text-[15px]')}>
            {filtro.ano}
          </span>
          <button
            type="button"
            aria-label="Próximo ano"
            disabled={filtro.ano >= anoMax}
            onClick={() => setAno(filtro.ano + 1)}
            className={cn(
              'grid place-items-center rounded-md border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400',
              empilhado ? 'h-11 w-11' : 'h-[26px] w-[26px]',
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {filtro.tipo === 'mensal' && (
        <div className="grid grid-cols-4 gap-1.5">
          {MESES_CURTO.map((m, i) => (
            <Celula
              key={m}
              rotulo={m}
              ligado={filtro.mes === i + 1}
              onClick={() => escolher(() => setMes(i + 1))}
            />
          ))}
        </div>
      )}

      {filtro.tipo === 'trimestral' && (
        <div className="grid grid-cols-2 gap-1.5">
          {TRIMESTRES.map((t) => (
            <Celula
              key={t.valor}
              rotulo={t.rotulo}
              secundario={t.meses}
              ligado={filtro.trimestre === t.valor}
              onClick={() => escolher(() => setTrimestre(t.valor))}
            />
          ))}
        </div>
      )}

      {filtro.tipo === 'semestral' && (
        <div className="grid grid-cols-2 gap-1.5">
          {SEMESTRES.map((s) => (
            <Celula
              key={s.valor}
              rotulo={s.rotulo}
              secundario={s.meses}
              ligado={filtro.semestre === s.valor}
              onClick={() => escolher(() => setSemestre(s.valor))}
            />
          ))}
        </div>
      )}

      {filtro.tipo === 'anual' && (
        <div className="grid grid-cols-4 gap-1.5">
          {anos.map((a) => (
            <Celula
              key={a}
              rotulo={String(a)}
              ligado={filtro.ano === a}
              onClick={() => escolher(() => setAno(a))}
            />
          ))}
        </div>
      )}

      {filtro.tipo === 'personalizado' && (
        <div className={cn('flex gap-2', empilhado ? 'flex-col' : 'items-center')}>
          <DatePicker
            date={filtro.dataInicio}
            onDateChange={setDataInicio ?? (() => {})}
            placeholder="Início"
            maxDate={filtro.dataFim}
            className={cn('border-slate-700 bg-slate-950/50', empilhado ? 'w-full' : 'flex-1')}
          />
          <span className={cn('shrink-0 text-[12px] text-slate-500', empilhado && 'text-center')}>até</span>
          <DatePicker
            date={filtro.dataFim}
            onDateChange={setDataFim ?? (() => {})}
            placeholder="Fim"
            minDate={filtro.dataInicio}
            className={cn('border-slate-700 bg-slate-950/50', empilhado ? 'w-full' : 'flex-1')}
          />
        </div>
      )}

      {(filtro.tipo === 'diario' || filtro.tipo === 'todos') && (
        <p className="px-1 py-3 text-[12.5px] leading-snug text-slate-500">
          {filtro.tipo === 'todos'
            ? 'Sem recorte de período — a agenda continua navegando dia a dia pelas setas.'
            : 'Recortado no dia de hoje.'}
        </p>
      )}

      <div className="border-t border-slate-800 pt-2.5 text-[11.5px] tabular-nums text-slate-500">
        {intervaloPorExtenso(range.startDate, range.endDate) ?? range.label}
      </div>
    </div>
  );

  if (empilhado) {
    return (
      <div>
        {escopos}
        {valores}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[128px_1fr]">
      {escopos}
      {valores}
    </div>
  );
}

export default PainelPeriodo;
