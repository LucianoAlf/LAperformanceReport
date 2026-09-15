import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PainelPeriodo } from '@/components/ui/PainelPeriodo';
import type { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { cn } from '@/lib/utils';

type Competencia = ReturnType<typeof useCompetenciaFiltro>;

/**
 * Seletor de periodo da Agenda: o gatilho e o popover.
 *
 * ⚠️ Por que NAO e o `CompetenciaFilter` compartilhado: aquele empilha tres
 * metaforas na mesma faixa horizontal — 7 pilhas de escopo, dois dropdowns e
 * rotulos truncados ("Trim", "Sem"). Custa uma linha inteira do topo numa tela
 * cuja materia-prima e altura, e escolher um mes exige dois cliques em dois
 * controles diferentes, porque os 12 meses so existem dentro de um `<select>`.
 *
 * O painel em si (escopo + grade de valores) mora em
 * `@/components/ui/PainelPeriodo` desde 14/09/2026, porque a folha de periodo
 * do celular precisa exatamente do mesmo conteudo em outra embalagem — e uma
 * copia das listas de meses/trimestres/semestres seria a terceira versao das
 * mesmas opcoes.
 *
 * ⚠️ O componente compartilhado continua intocado nas paginas irmas. Este
 * substitui a APRESENTACAO, nao o estado: dirige exatamente as mesmas funcoes
 * de `useCompetenciaFiltro`, entao o periodo continua sendo o mesmo objeto que
 * o `AppLayout` distribui — inclusive quando o usuario chega aqui vindo de
 * outra tela com um periodo ja escolhido.
 */

/** Qualquer camada flutuante do design system (o calendario do DatePicker). */
const PORTAL_FLUTUANTE = '[data-radix-popper-content-wrapper],[role="dialog"],[role="listbox"]';

export function SeletorPeriodo({ competencia }: { competencia: Competencia }) {
  const [aberto, setAberto] = useState(false);
  const { filtro, range, anosDisponiveis } = competencia;

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
        {/* Escolher um VALOR fecha (a decisao terminou); trocar de ESCOPO nao,
            porque o proximo clique ainda esta por vir na grade ao lado. */}
        <PainelPeriodo
          layout="colunas"
          filtro={filtro}
          range={range}
          anosDisponiveis={anosDisponiveis}
          setTipo={competencia.setTipo}
          setAno={competencia.setAno}
          setMes={competencia.setMes}
          setTrimestre={competencia.setTrimestre}
          setSemestre={competencia.setSemestre}
          setDataInicio={competencia.setDataInicio}
          setDataFim={competencia.setDataFim}
          onEscolheuValor={() => setAberto(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export default SeletorPeriodo;
