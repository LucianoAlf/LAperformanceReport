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

/**
 * Mesmas cores do `AgendaCard`: a pessoa alterna entre celular e computador no
 * mesmo dia, e uma segunda paleta faria violeta querer dizer duas coisas.
 *
 * 🔴 A linha NORMAL tem a borda TRANSPARENTE, nao cinza. Ela era
 * `border-l-slate-600` — uma barrinha pintada nas 158 linhas do dia, ou seja, o
 * vocabulario de excecao aplicado justamente ao que nao e excecao. Com tudo
 * marcado, nada fica marcado. A borda continua existindo (transparente) para o
 * texto da linha normal alinhar com o da linha excepcional; sem isso as
 * coloridas ficariam 3px deslocadas.
 */
const BORDA: Record<string, string> = {
  cancelada: 'border-l-rose-400 bg-rose-500/[0.07]',
  experimental: 'border-l-violet-400 bg-violet-500/[0.09]',
  reagendada: 'border-l-amber-400 bg-amber-500/[0.09]',
  vago: 'border-l-slate-500 bg-slate-800/40',
  normal: 'border-l-transparent',
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
   * Nao repetir o professor na linha.
   *
   * Com um professor escolhido no trilho, o nome dele em TODAS as linhas nao
   * informa nada — e o filtro se repetindo trinta vezes.
   */
  ocultarProfessor?: boolean;
  /**
   * Duracao a exibir, ou `null` quando o cabecalho do grupo ja a declarou.
   *
   * Quase toda aula da casa dura 50 min, entao o normal e o cabecalho dizer
   * "09:00 · 50 min" uma vez e as linhas nao repetirem. A duracao volta para a
   * linha so quando o grupo tem durações diferentes — que e exatamente quando
   * ela deixa de ser obvia.
   */
  duracao?: number | null;
  /**
   * Ha alguma aula AINDA POR VIR na lista?
   *
   * 🔴 O esmaecido de "ja ocorreu" so informa alguma coisa se houver, na mesma
   * tela, algo que ainda nao ocorreu. Medido as 21h de um dia util: 130 das 158
   * linhas apagadas a 50% — quatro quintos da tela ilegiveis para marcar uma
   * distincao que ja nao existia; num dia passado seriam 100%. Quando o dia
   * acabou, todas as linhas voltam ao contraste cheio.
   */
  esmaecerPassado?: boolean;
  onAbrir: (aula: AulaAgenda) => void;
}

export function LinhaAula({
  aula,
  data,
  agora,
  ehHoje,
  colisao,
  ocultarProfessor = false,
  duracao = null,
  esmaecerPassado = true,
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
    /* 🔴 Isto e uma LINHA de lista, nao um cartao.
       Cada aula era um retangulo com borda, fundo proprio e cantos
       arredondados: 158 caixas cinza empilhadas, 82px cada, todas com o mesmo
       peso visual — uma parede. E o cartao cobrava 24px de padding lateral mais
       a coluna de hora, deixando 272px de texto util num telefone de 390, que e
       por que o nome do curso truncava.
       Agora o fundo e o da pagina, a separacao e um fio, e o unico elemento que
       ganha cor e fundo e a EXCECAO. Sobram ~350px para o texto. */
    <button
      type="button"
      onClick={() => onAbrir(aula)}
      className={cn(
        'flex w-full min-h-[44px] flex-col border-b border-l-[3px] border-b-slate-800/70 py-2 pl-2.5 pr-1 text-left leading-tight',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
        BORDA[excecao ?? 'normal'],
        emAndamento && excecao === null && 'border-l-emerald-500 bg-emerald-500/[0.07]',
        jaOcorreu && !emAndamento && esmaecerPassado && 'opacity-70',
      )}
    >
      <div className="flex w-full items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-100">
          {aula.curso_nome ?? 'Aula'}
        </span>
        {duracao !== null && (
          <span className="flex-shrink-0 text-[11px] tabular-nums text-slate-500">
            {duracao} min
          </span>
        )}
        {emAndamento && (
          <span className="flex-shrink-0 rounded-full border border-emerald-500/50 px-1.5 text-[10px] font-bold text-emerald-300">
            AGORA
          </span>
        )}
      </div>

      {!ocultarProfessor && (
        <span className="mt-0.5 w-full truncate text-[12.5px] text-slate-300">
          {aula.professor_nome ?? 'sem professor'}
        </span>
      )}

      <span className="mt-0.5 w-full truncate text-[12px] text-slate-400">{detalhe}</span>

      {legendaExcecao && (
        <span className={cn('mt-1 text-[11.5px] font-medium', TEXTO_EXCECAO[excecao ?? 'normal'])}>
          {legendaExcecao}
        </span>
      )}

      {colisao && (
        <span className="mt-1.5 inline-flex items-center gap-1.5 self-start rounded-md border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {colisao}
        </span>
      )}
    </button>
  );
}

export default LinhaAula;
