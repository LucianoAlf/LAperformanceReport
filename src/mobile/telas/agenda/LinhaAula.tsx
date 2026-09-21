import { AlertTriangle } from 'lucide-react';

import type { AulaAgenda } from '@/hooks/useAgendaDia';
import { aulaEmAndamento, aulaJaOcorreu, minutosAgora } from '@/lib/agenda';
import { cn } from '@/lib/utils';

/**
 * A EXCECAO da aula — a mesma cascata de `estadoDaAula` do desktop, com uma
 * diferenca deliberada: "acontecendo agora" NAO entra aqui.
 *
 * No desktop os dois disputam a mesma borda de 3px e so um pode vencer, entao
 * uma experimental em andamento sai violeta e o "agora" se perde. A linha tem
 * ~350px: a borda carrega a excecao e o selo carrega o agora, sem disputa.
 */
type Excecao = 'cancelada' | 'experimental' | 'reagendada' | 'vago' | null;

function excecaoDaAula(aula: AulaAgenda): Excecao {
  if (aula.cancelada) return 'cancelada';
  if (aula.categoria === 'experimental') return 'experimental';
  if (aula.reagendada) return 'reagendada';
  if (aula.alunos.length === 0) return 'vago';
  return null;
}

// Mesmas cores do AgendaCard: a pessoa alterna entre celular e computador no
// mesmo dia, e uma segunda paleta faria violeta querer dizer duas coisas.
const BORDA: Record<string, string> = {
  cancelada: 'border-l-rose-400 bg-rose-500/10 opacity-70',
  experimental: 'border-l-violet-400 bg-violet-500/15',
  reagendada: 'border-l-amber-400 bg-amber-500/15',
  vago: 'border-dashed border-l-slate-500 bg-slate-800/60',
  normal: 'border-l-slate-600 bg-slate-800',
};

const TEXTO_EXCECAO: Record<string, string> = {
  cancelada: 'text-rose-300',
  experimental: 'text-violet-300',
  reagendada: 'text-amber-300',
  vago: 'text-slate-400',
  normal: 'text-slate-400',
};

interface Props {
  aula: AulaAgenda;
  /** Dia exibido, 'yyyy-MM-dd'. Necessario para saber se a aula ja passou. */
  data: string;
  agora: Date;
  /** O dia exibido e hoje? Fora disso nada pode estar "acontecendo agora". */
  ehHoje: boolean;
  /** Texto de colisao de sala, de `colisoesDeSala`. */
  colisao?: string;
  /**
   * A aula comeca no mesmo horario da linha de cima.
   *
   * A hora continua escrita — ela e a unica coordenada desta lista e some da
   * tela junto com o bloco inteiro quando se rola —, mas apagada, e a duracao
   * sai: assim as simultaneas se leem como um bloco sem o horario batendo seis
   * vezes seguidas.
   */
  horaRepetida?: boolean;
  /**
   * Nao repetir o professor na linha.
   *
   * Com um professor escolhido no trilho, o nome dele em TODAS as linhas nao
   * informa nada — e o filtro se repetindo trinta vezes. A linha devolve a
   * altura para o que muda de aula para aula.
   */
  ocultarProfessor?: boolean;
  onAbrir: (aula: AulaAgenda) => void;
}

export function LinhaAula({
  aula,
  data,
  agora,
  ehHoje,
  colisao,
  ocultarProfessor = false,
  horaRepetida = false,
  onAbrir,
}: Props) {
  const excecao = excecaoDaAula(aula);
  // ⚠️ `aulaEmAndamento` recebe MINUTOS, nao a data — e `null` quando o dia
  // exibido nao e hoje. Passar a data aqui nao compila.
  const emAndamento = aulaEmAndamento(aula, ehHoje ? minutosAgora(agora) : null);
  const jaOcorreu = aulaJaOcorreu(data, aula.hora_fim, agora);

  const quem =
    aula.alunos.length === 1
      ? aula.alunos[0].nome
      : aula.alunos.length > 1
        ? `${aula.alunos[0].nome} +${aula.alunos.length - 1}`
        : aula.turma_nome ?? 'sem aluno vinculado';

  // O aluno vem ANTES da sala: e por ele que se procura uma aula na lista.
  const detalhe = [quem, aula.sala_nome ?? 'sem sala'].filter(Boolean).join(' · ');

  const legendaExcecao =
    excecao === 'reagendada' && aula.hora_original
      ? `reagendada · era ${aula.hora_original}`
      : excecao === 'cancelada'
        ? 'cancelada'
        : excecao === 'experimental'
          ? 'experimental'
          : excecao === 'vago'
            ? 'sem aluno vinculado'
            : null;

  return (
    <div className={cn('flex gap-2.5', jaOcorreu && !emAndamento && 'opacity-45')}>
      <div className="w-[50px] flex-shrink-0 pt-2 text-right">
        <div
          className={cn(
            'text-[13px] tabular-nums',
            horaRepetida ? 'font-normal text-slate-600' : 'font-semibold text-slate-300',
          )}
        >
          {aula.hora_inicio.slice(0, 5)}
        </div>
        {!horaRepetida && (
          <div className="text-[10.5px] text-slate-400">{aula.duracao_minutos} min</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onAbrir(aula)}
        className={cn(
          'min-h-[44px] min-w-0 flex-1 rounded-[10px] border border-l-[3px] border-slate-700 px-3 py-2.5 text-left',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
          BORDA[excecao ?? 'normal'],
          emAndamento && excecao === null && 'border-l-emerald-500 bg-emerald-500/10',
        )}
      >
        {/* ⚠️ Curso e professor em LINHAS SEPARADAS, nao "Curso · Professor".
            Juntos eles nunca cabiam: "Musicalizacao Infantil T · Adriana ..."
            cortava exatamente no nome da pessoa — o dado pelo qual se procura
            a aula, e o mesmo que o trilho de chips usa para filtrar. Duas
            linhas custam 16px e nao cortam nenhum dos dois. */}
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-100">
            {aula.curso_nome ?? 'Aula'}
          </span>
          {emAndamento && (
            <span className="flex-shrink-0 rounded-full border border-emerald-500/50 px-1.5 text-[10px] font-bold text-emerald-300">
              AGORA
            </span>
          )}
        </div>

        {!ocultarProfessor && (
          <div className="mt-0.5 truncate text-[12.5px] text-slate-300">
            {aula.professor_nome ?? 'sem professor'}
          </div>
        )}

        {legendaExcecao && (
          <div className={cn('mt-0.5 text-[12px]', TEXTO_EXCECAO[excecao ?? 'normal'])}>
            {legendaExcecao}
          </div>
        )}

        <div className="mt-0.5 truncate text-[11.5px] text-slate-400">{detalhe}</div>

        {colisao && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {colisao}
          </div>
        )}
      </button>
    </div>
  );
}

export default LinhaAula;
