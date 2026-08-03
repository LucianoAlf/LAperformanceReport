import { useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatePicker } from '@/components/ui/date-picker';
import type { TipoCompetencia, useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { cn } from '@/lib/utils';

type Competencia = ReturnType<typeof useCompetenciaFiltro>;

/**
 * Seletor de periodo da Agenda.
 *
 * ⚠️ Por que NAO e o `CompetenciaFilter` compartilhado: aquele empilha tres
 * metaforas na mesma faixa horizontal — 7 pilhas de escopo, dois dropdowns e
 * rotulos truncados ("Trim", "Sem"). Custa uma linha inteira do topo numa tela
 * cuja materia-prima e altura, e escolher um mes exige dois cliques em dois
 * controles diferentes, porque os 12 meses so existem dentro de um `<select>`.
 *
 * Aqui os dois eixos da decisao ficam separados: ESCOPO na coluna da esquerda
 * (por extenso, sempre visivel) e VALOR na grade da direita. Trocar de escopo
 * troca so a grade.
 *
 * ⚠️ O componente compartilhado continua intocado nas paginas irmas. Este
 * substitui a APRESENTACAO, nao o estado: dirige exatamente as mesmas funcoes
 * de `useCompetenciaFiltro`, entao o periodo continua sendo o mesmo objeto que
 * o `AppLayout` distribui — inclusive quando o usuario chega aqui vindo de
 * outra tela com um periodo ja escolhido.
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

/** Qualquer camada flutuante do design system (o calendario do DatePicker). */
const PORTAL_FLUTUANTE = '[data-radix-popper-content-wrapper],[role="dialog"],[role="listbox"]';

/**
 * Intervalo por extenso. "T3" nao diz a ninguem quais meses entram — escrever
 * as datas evita que o usuario tenha de decorar a convencao da escola.
 */
function intervaloPorExtenso(inicio: string, fim: string): string | null {
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

export function SeletorPeriodo({ competencia }: { competencia: Competencia }) {
  const [aberto, setAberto] = useState(false);
  const { filtro, range, anosDisponiveis } = competencia;

  const anos = anosDisponiveis.length > 0 ? anosDisponiveis : [filtro.ano];
  const anoMin = Math.min(...anos);
  const anoMax = Math.max(...anos);

  // Escolher um VALOR fecha (a decisao terminou); trocar de ESCOPO nao, porque
  // o proximo clique ainda esta por vir na grade ao lado.
  const escolher = (aplicar: () => void) => {
    aplicar();
    setAberto(false);
  };

  const escopoAtivo = (id: TipoCompetencia) => filtro.tipo === id;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Período: ${range.label}`}
          className={cn(
            'flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[12.5px]',
            aberto
              ? 'border-cyan-500 text-white'
              : 'border-slate-700 text-slate-300 hover:text-white',
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {range.label}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[468px] overflow-hidden border-slate-700 bg-slate-900 p-0"
        style={{ zIndex: 999999 }}
        // O calendario do DatePicker (escopo Personalizado) e portalado para o
        // <body>, fora deste popover: sem isto, clicar num dia contaria como
        // "interacao fora" e fecharia o painel inteiro no mesmo gesto.
        onInteractOutside={(e) => {
          if ((e.target as Element | null)?.closest?.(PORTAL_FLUTUANTE)) e.preventDefault();
        }}
      >
        <div className="grid grid-cols-[128px_1fr]">
          <nav className="flex flex-col gap-px border-r border-slate-800 bg-slate-950/40 p-2">
            {ESCOPOS.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => competencia.setTipo(e.id)}
                aria-pressed={escopoAtivo(e.id)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors',
                  escopoAtivo(e.id)
                    ? 'bg-cyan-500/15 font-semibold text-cyan-400'
                    : 'text-slate-400 hover:bg-slate-400/10 hover:text-slate-200',
                )}
              >
                {e.rotulo}
              </button>
            ))}

            <span className="mx-1 my-1.5 h-px bg-slate-800" aria-hidden="true" />

            {ATALHOS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => escolher(() => competencia.setTipo(a.id))}
                aria-pressed={escopoAtivo(a.id)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors',
                  escopoAtivo(a.id)
                    ? 'bg-cyan-500/15 font-semibold text-cyan-400'
                    : 'text-slate-400 hover:bg-slate-400/10 hover:text-slate-200',
                )}
              >
                {a.rotulo}
              </button>
            ))}
          </nav>

          <div className="flex flex-col gap-3 p-3.5">
            {/* O passo de ano nao aparece onde nao significa nada: em "Ano" o
                proprio grid escolhe o ano, e nos atalhos nao ha ano nenhum. */}
            {(filtro.tipo === 'mensal' ||
              filtro.tipo === 'trimestral' ||
              filtro.tipo === 'semestral') && (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Ano anterior"
                  disabled={filtro.ano <= anoMin}
                  onClick={() => competencia.setAno(filtro.ano - 1)}
                  className="grid h-[26px] w-[26px] place-items-center rounded-md border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[15px] font-semibold tabular-nums">{filtro.ano}</span>
                <button
                  type="button"
                  aria-label="Próximo ano"
                  disabled={filtro.ano >= anoMax}
                  onClick={() => competencia.setAno(filtro.ano + 1)}
                  className="grid h-[26px] w-[26px] place-items-center rounded-md border border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
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
                    onClick={() => escolher(() => competencia.setMes(i + 1))}
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
                    onClick={() => escolher(() => competencia.setTrimestre(t.valor))}
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
                    onClick={() => escolher(() => competencia.setSemestre(s.valor))}
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
                    onClick={() => escolher(() => competencia.setAno(a))}
                  />
                ))}
              </div>
            )}

            {filtro.tipo === 'personalizado' && (
              <div className="flex items-center gap-2">
                <DatePicker
                  date={filtro.dataInicio}
                  onDateChange={competencia.setDataInicio}
                  placeholder="Início"
                  maxDate={filtro.dataFim}
                  className="flex-1 border-slate-700 bg-slate-950/50"
                />
                <span className="shrink-0 text-[12px] text-slate-500">até</span>
                <DatePicker
                  date={filtro.dataFim}
                  onDateChange={competencia.setDataFim}
                  placeholder="Fim"
                  minDate={filtro.dataInicio}
                  className="flex-1 border-slate-700 bg-slate-950/50"
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
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SeletorPeriodo;
