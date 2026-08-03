import { cn } from '@/lib/utils';
import type { AulaAgenda } from '@/hooks/useAgendaDia';

interface Props {
  aula: AulaAgenda;
  selecionada: boolean;
  estilo: React.CSSProperties;
  onSelecionar: (aula: AulaAgenda) => void;
  // Trilho esticado (dia com poucas aulas): ha espaco para nome completo e uma
  // terceira linha, em vez do resumo espremido do dia cheio.
  amplo?: boolean;
  // Acontecendo neste minuto. Calculado no trilho (que ja tem o relogio) para
  // nao existir um setInterval por card.
  emAndamento?: boolean;
}

/**
 * Estado visual do card. UM valor, nao varias condicoes independentes: `cn()`
 * usa twMerge, entao com duas condicoes verdadeiras ao mesmo tempo quem vence
 * e a ULTIMA classe conflitante da lista, nao a regra de negocio que a ordem
 * sugere. Isso ja produziu bug real aqui — experimental cancelada renderizava
 * com a cor contradizendo o proprio badge.
 *
 * A ordem abaixo E a precedencia: cancelada apaga qualquer outra leitura
 * (nao vai acontecer), e experimental importa mais que reagendada.
 */
type EstadoAula = 'cancelada' | 'experimental' | 'reagendada' | 'andamento' | 'vago' | 'normal';

function estadoDaAula(aula: AulaAgenda, emAndamento: boolean): EstadoAula {
  if (aula.cancelada) return 'cancelada';
  if (aula.categoria === 'experimental') return 'experimental';
  if (aula.reagendada) return 'reagendada';
  if (emAndamento) return 'andamento';
  if (aula.alunos.length === 0) return 'vago';
  return 'normal';
}

// Aluno em risco a partir daqui. Mesmo corte do KPI "Alunos em risco" da
// AgendaPage — dois numeros na mesma tela nao podem usar reguas diferentes.
const CORTE_RISCO = 40;

function primeiroENome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1]}` : partes[0];
}

export function AgendaCard({
  aula,
  selecionada,
  estilo,
  onSelecionar,
  amplo = false,
  emAndamento = false,
}: Props) {
  const estado = estadoDaAula(aula, emAndamento);
  const nomeDoAluno = (nome: string) => (amplo ? nome : primeiroENome(nome));

  let titulo: string;
  if (aula.alunos.length === 1) titulo = nomeDoAluno(aula.alunos[0].nome);
  else if (aula.alunos.length > 1) {
    titulo = `${nomeDoAluno(aula.alunos[0].nome)} +${aula.alunos.length - 1}`;
  } else if (estado === 'experimental') titulo = 'Experimental';
  else titulo = aula.turma_nome || aula.curso_nome || 'Aula';

  // O subtitulo diz o que o cartao ja nao mostra. Em estado excepcional o mais
  // util e a propria excecao escrita por extenso — a cor sozinha nao informa
  // "reagendada de que horario".
  let subtitulo: string;
  if (estado === 'cancelada') subtitulo = 'cancelada';
  else if (estado === 'reagendada') {
    subtitulo = aula.hora_original ? `reagendada · era ${aula.hora_original}` : 'reagendada';
  } else if (estado === 'experimental') subtitulo = 'experimental';
  else if (estado === 'vago') subtitulo = 'sem aluno vinculado';
  else if (aula.nr_da_aula) subtitulo = `${aula.sala_nome ?? 'sem sala'} · aula ${aula.nr_da_aula}`;
  else {
    subtitulo = `${aula.sala_nome ?? 'sem sala'}${aula.qtd_alunos ? ` · ${aula.qtd_alunos} alunos` : ''}`;
  }

  // Terceira linha so no modo amplo: curso e o dado mais util que nao cabe no
  // card compacto, e o horario evita ter que conferir contra a regua do topo.
  const detalhe = [`${aula.hora_inicio}–${aula.hora_fim}`, aula.curso_nome, aula.turma_nome]
    .filter(Boolean)
    .join(' · ');

  const risco = Math.max(0, ...aula.alunos.map((a) => a.risco_pct ?? 0));
  const emRisco = risco >= CORTE_RISCO;
  const inadimplentes = aula.alunos.filter((a) => a.inadimplente).length;
  // Aluno novo: 1a aula regular dele na escola. NAO e `nr_da_aula === 1`, que
  // tambem vale para renovacao (contrato novo zera o contador).
  const calouros = aula.alunos.filter((a) => a.aluno_novo).length;
  // Sinal de aluno nao faz sentido em aula cancelada: ninguem vai estar la.
  const mostrarSinais = estado !== 'cancelada';

  return (
    <button
      type="button"
      style={estilo}
      onClick={() => onSelecionar(aula)}
      aria-current={selecionada}
      title={`${aula.hora_inicio}–${aula.hora_fim} · ${aula.curso_nome ?? ''}`}
      className={cn(
        'absolute flex items-center gap-1.5 overflow-hidden rounded-md border border-l-[3px] px-2 text-left',
        'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500',
        // Normal e o caso da esmagadora maioria: fica NEUTRO de proposito. Cor
        // aqui e vocabulario de excecao — quando tudo esta destacado, nada esta.
        estado === 'normal' && 'border-slate-700 border-l-slate-600 bg-slate-800 hover:border-slate-500',
        estado === 'andamento' && 'border-slate-700 border-l-emerald-500 bg-emerald-500/10',
        estado === 'experimental' && 'border-slate-700 border-l-violet-400 bg-violet-500/15',
        estado === 'reagendada' && 'border-slate-700 border-l-amber-400 bg-amber-500/15',
        estado === 'cancelada' && 'border-slate-700 border-l-rose-400 bg-rose-500/10 opacity-70',
        // Tracejado (e nao mais uma cor) para "pendente": o vocabulario de cor
        // ja esta lotado, e o Tailwind so tem estilo de borda para os 4 lados.
        estado === 'vago' && 'border-dashed border-slate-600 border-l-slate-500 bg-slate-800/60',
        selecionada && 'ring-1 ring-cyan-500',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <span
          className={cn(
            'block truncate font-semibold',
            amplo ? 'text-[13px]' : 'text-xs',
            estado === 'cancelada' && 'font-medium line-through',
            estado === 'vago' && 'font-medium italic text-slate-300',
          )}
        >
          {titulo}
        </span>
        <span className="block truncate text-[10.5px] text-slate-400">{subtitulo}</span>
        {amplo && <span className="block truncate text-[10.5px] text-slate-500">{detalhe}</span>}
      </span>

      {/* Pontos e estrela no lugar das marcas E / ✕ / R / ! — uma letra so
          significa algo para quem construiu a tela. O estado da aula ja esta na
          borda esquerda e escrito no subtitulo; o que sobra aqui e sinal de
          ALUNO, que a legenda do rodape da timeline decodifica. */}
      {mostrarSinais && (emRisco || inadimplentes > 0 || calouros > 0 || aula.alunos.length > 1) && (
        <span className="flex shrink-0 items-center gap-1">
          {emRisco && (
            <span
              title={`Risco de evasão ${Math.round(risco)}%`}
              className="h-[7px] w-[7px] rounded-full bg-amber-400"
            />
          )}
          {inadimplentes > 0 && (
            <span
              title={inadimplentes === 1 ? 'Inadimplente' : `${inadimplentes} inadimplentes`}
              className="h-[7px] w-[7px] rounded-full bg-rose-400"
            />
          )}
          {calouros > 0 && (
            <span
              title={calouros === 1 ? '1 aluno novo' : `${calouros} alunos novos`}
              className="text-[11px] leading-none text-amber-300"
            >
              ★{calouros > 1 && <span className="ml-0.5 text-[9px] font-bold">{calouros}</span>}
            </span>
          )}
          {aula.alunos.length > 1 && (
            <span className="rounded bg-slate-700 px-1 text-[10px] font-semibold tabular-nums text-slate-300">
              {aula.alunos.length}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
