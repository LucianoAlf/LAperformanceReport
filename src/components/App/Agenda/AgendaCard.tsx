import { AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
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
  // A aula ja terminou. Portao para exibir PRESENCA — ver ResumoDaAula.
  jaOcorreu?: boolean;
}

/**
 * Conflito de presenca: algum aluno da aula tem resposta humana que diverge
 * do bruto do Emusys. Nao e falta nem presenca — e a divergencia que a
 * secretaria precisa ver para retificar. Ver `temConflito` em chamadaUtils.
 */
function temConflitoAula(aula: AulaAgenda): boolean {
  for (const a of aula.alunos) {
    if (!a.emusys_presenca_bruta || !a.respondido_por) continue;
    const humanas = new Set([
      'professor_la_teacher', 'professor_whatsapp', 'manual', 'fabio_audio', 'agenda_secretaria',
    ]);
    if (!humanas.has(a.respondido_por)) continue;
    const humanoPresente = a.status_presenca === 'presente';
    const emusysPresente = a.emusys_presenca_bruta === 'presente';
    if (humanoPresente !== emusysPresente) return true;
  }
  return false;
}

/** Soma de creditos de reposicao pendentes entre os alunos da aula. */
function reposicoesPendentesAula(aula: AulaAgenda): number {
  return aula.alunos.reduce((s, a) => s + (a.reposicoes_pendentes ?? 0), 0);
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

const ROTULO_ESTADO: Partial<Record<EstadoAula, string>> = {
  cancelada: 'Cancelada',
  experimental: 'Experimental',
  reagendada: 'Reagendada',
  andamento: 'Acontecendo agora',
  vago: 'Sem aluno vinculado',
};

/**
 * Resumo que aparece ao passar o mouse. Existe porque o card e estreito e corta
 * o nome quase sempre: a grade mostra "Manuela Dan…" e so o clique revelava
 * quem e. O tooltip responde sem tirar o usuario da grade; o drawer continua
 * sendo o lugar do detalhe completo.
 *
 * Cobre o mesmo conjunto do tooltip do Emusys (turma, curso, horario, duracao,
 * sala, nr da aula, modalidade, quantos alunos, inadimplencia) e acrescenta o
 * que la nao tem: o nome INTEIRO de cada aluno, risco de evasao e aluno novo.
 *
 * ⚠️ O Emusys escreve "1 fatura atrasada". Aqui NAO da para dizer isso: o que
 * temos e o booleano `inadimplente` por aluno (espelho de
 * `contrato_atual.inadimplente`), nunca a contagem de faturas. Por isso o texto
 * fala de ALUNOS inadimplentes — inventar o numero de faturas seria precisao
 * falsa numa informacao de cobranca.
 */
const MAX_ALUNOS_NO_RESUMO = 6;

/** `tipo` e a modalidade contratada da disciplina, nao a lotacao do horario. */
function rotuloModalidade(tipo: string | null): string | null {
  if (tipo === 'turma') return 'Grupo/Turma';
  if (tipo === 'individual') return 'Individual';
  return null;
}

/**
 * Presenca so depois que a aula terminou.
 *
 * ⚠️ Regra do Emusys, ja registrada no CLAUDE.md: `professor_presenca` vem
 * `'ausente'` por DEFAULT — 100% das aulas futuras chegam assim sem ninguem
 * ter faltado. Mostrar antes da hora acusaria falta de metade do corpo docente
 * todo dia. A presenca do ALUNO e menos contaminada (vem de `aluno_presenca`,
 * que quase so tem linha de aula passada), mas medido em 03/08/2026 existem 6
 * linhas de aula FUTURA ja marcadas como 'falta' — poucas, e erradas o
 * bastante para valer o mesmo portao.
 */
function ResumoPresenca({ aula }: { aula: AulaAgenda }) {
  const comStatus = aula.alunos.filter((a) => a.status_presenca);

  // A presenca chega pelo sync (a cada 15 min, com defasagem de horas), nao em
  // tempo real: numa aula que acabou de terminar ela normalmente AINDA nao
  // existe. Medido em 03/08/2026: dias passados tem 85-95% de cobertura, mas o
  // proprio dia tinha 2,7%. Sumir em silencio faz o usuario procurar um recurso
  // que esta la — foi a primeira pergunta que ele fez. Entao diz que falta
  // sincronizar, em vez de nao dizer nada.
  if (!aula.professor_presenca && comStatus.length === 0) {
    if (aula.alunos.length === 0) return null;
    return (
      <div className="mt-0.5 border-t border-slate-700 pt-1.5 text-[11px] text-slate-500">
        Presença ainda não sincronizada
      </div>
    );
  }

  const presentes = comStatus.filter((a) => a.status_presenca === 'presente').length;
  const faltas = comStatus.length - presentes;

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-700 pt-1.5 text-[11px]">
      {aula.professor_presenca && (
        <span
          className={cn(
            aula.professor_presenca === 'presente' ? 'text-emerald-300' : 'text-rose-300',
          )}
        >
          Professor {aula.professor_presenca === 'presente' ? 'presente' : 'ausente'}
        </span>
      )}
      {comStatus.length > 0 && (
        <span className="text-slate-400">
          {presentes > 0 && <span className="text-emerald-300">{presentes} presente{presentes > 1 ? 's' : ''}</span>}
          {presentes > 0 && faltas > 0 && ' · '}
          {faltas > 0 && <span className="text-rose-300">{faltas} falta{faltas > 1 ? 's' : ''}</span>}
        </span>
      )}
    </div>
  );
}

function ResumoDaAula({
  aula,
  estado,
  jaOcorreu,
}: {
  aula: AulaAgenda;
  estado: EstadoAula;
  jaOcorreu: boolean;
}) {
  const rotuloEstado = ROTULO_ESTADO[estado];
  const modalidade = rotuloModalidade(aula.tipo);
  const inadimplentes = aula.alunos.filter((a) => a.inadimplente).length;
  // Anotacao do Emusys (o "conteudo da aula" que o professor escreve) e a do
  // LA Teacher. A do Emusys existe em ~19% das aulas; a do Fabio e rara hoje.
  const observacoes = [aula.anotacoes, aula.anotacoes_fabio]
    .map((t) => t?.trim())
    .filter((t): t is string => !!t);
  // Numa experimental o `alunos` vem VAZIO (nao ha vinculo em aula_alunos_emusys),
  // entao quem vem e o que o consultor anotou saem daqui.
  const leads = aula.experimental_leads ?? [];

  // Titulo pela turma, como no Emusys: numa aula de grupo "B_Seg_16" identifica
  // o encontro melhor do que o nome de um dos alunos. Sem turma, cai no curso.
  const titulo = aula.turma_nome || aula.curso_nome || 'Aula';
  const linhaCurso = [
    aula.turma_nome ? aula.curso_nome : null,
    `${aula.hora_inicio}–${aula.hora_fim}`,
    aula.duracao_minutos ? `${aula.duracao_minutos}min` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{titulo}</span>
        {rotuloEstado && (
          <span
            className={cn(
              'text-[11px] font-medium',
              estado === 'cancelada' && 'text-rose-300',
              estado === 'experimental' && 'text-violet-300',
              estado === 'reagendada' && 'text-amber-300',
              estado === 'andamento' && 'text-emerald-300',
              estado === 'vago' && 'text-slate-400',
            )}
          >
            {rotuloEstado}
            {estado === 'reagendada' && aula.hora_original ? ` · era ${aula.hora_original}` : ''}
          </span>
        )}
      </div>

      <div className="text-[12px] tabular-nums text-slate-300">{linhaCurso}</div>
      <div className="text-[11px] text-slate-400">
        {aula.sala_nome ?? 'sem sala'}
        {aula.nr_da_aula
          ? ` · aula ${aula.nr_da_aula}${aula.qtd_aulas_contrato ? ` de ${aula.qtd_aulas_contrato}` : ''}`
          : ''}
      </div>
      <div className="text-[11px] text-slate-400">{aula.professor_nome ?? 'sem professor'}</div>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {modalidade && (
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span
              aria-hidden="true"
              className={cn(
                'h-[7px] w-[7px] rounded-full',
                aula.tipo === 'turma' ? 'bg-emerald-400' : 'bg-sky-400',
              )}
            />
            {modalidade}
          </span>
        )}
        {/* Na experimental o denominador e o lead, nao o aluno — dizer "0 alunos"
            numa aula que tem alguem marcado seria falso. */}
        {aula.alunos.length === 0 && leads.length > 0 ? (
          <span className="text-slate-400">
            {leads.length === 1 ? '1 experimental marcada' : `${leads.length} experimentais marcadas`}
          </span>
        ) : (
          <span className="text-slate-400">
            {aula.alunos.length === 1 ? '1 aluno nessa aula' : `${aula.alunos.length} alunos nessa aula`}
          </span>
        )}
        {/* Agregado so quando ha mais de um aluno: com um so, a marca na linha
            dele logo abaixo ja diz isso, e repetir gasta duas das poucas
            linhas do tooltip para a mesma informacao. */}
        {inadimplentes > 0 && aula.alunos.length > 1 && (
          <span className="inline-flex items-center gap-1.5 text-rose-300">
            <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-rose-400" />
            {inadimplentes} inadimplentes
          </span>
        )}
      </div>

      {aula.alunos.length > 0 && (
        <ul className="mt-0.5 flex flex-col gap-0.5 border-t border-slate-700 pt-1.5">
          {aula.alunos.slice(0, MAX_ALUNOS_NO_RESUMO).map((a, i) => (
            <li key={`${a.aluno_id ?? a.nome}-${i}`} className="flex items-baseline gap-1.5 text-[12px]">
              {/* Presenca do ALUNO, aluno a aluno. Mesmo portao do agregado
                  abaixo: so depois que a aula terminou. */}
              {jaOcorreu && a.status_presenca && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'shrink-0 text-[11px] leading-none',
                    a.status_presenca === 'presente' ? 'text-emerald-400' : 'text-rose-400',
                  )}
                >
                  {a.status_presenca === 'presente' ? '✓' : '✕'}
                </span>
              )}
              <span className="min-w-0 flex-1 text-slate-100">{a.nome}</span>
              {jaOcorreu && a.status_presenca && (
                <span className="sr-only">
                  {a.status_presenca === 'presente' ? 'presente' : 'faltou'}
                </span>
              )}
              {a.aluno_novo && <span className="shrink-0 text-[10px] text-amber-300">★ novo</span>}
              {a.inadimplente && <span className="shrink-0 text-[10px] text-rose-300">inadimplente</span>}
              {a.risco_pct !== null && a.risco_pct >= CORTE_RISCO && (
                <span className="shrink-0 text-[10px] tabular-nums text-amber-300">
                  risco {Math.round(a.risco_pct)}%
                </span>
              )}
            </li>
          ))}
          {aula.alunos.length > MAX_ALUNOS_NO_RESUMO && (
            <li className="text-[11px] text-slate-500">
              +{aula.alunos.length - MAX_ALUNOS_NO_RESUMO} — abrir para ver todos
            </li>
          )}
        </ul>
      )}

      {leads.length > 0 && (
        <ul className="mt-0.5 flex flex-col gap-1 border-t border-slate-700 pt-1.5">
          {leads.map((l) => (
            <li key={l.experimental_id} className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5 text-[12px]">
                <span className="min-w-0 flex-1 text-slate-100">{l.nome}</span>
                {l.curso && <span className="shrink-0 text-[10px] text-violet-300">{l.curso}</span>}
              </div>
              {l.observacoes && (
                <p className="line-clamp-3 text-[11px] italic leading-snug text-slate-300">
                  {l.observacoes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {jaOcorreu && <ResumoPresenca aula={aula} />}

      {observacoes.length > 0 && (
        <div className="mt-0.5 border-t border-slate-700 pt-1.5">
          {observacoes.map((texto, i) => (
            // `line-clamp-3`: a anotacao e texto livre e ja apareceu com
            // paragrafos inteiros. O tooltip da o indicio; o texto completo
            // fica no painel de detalhe.
            <p key={i} className="line-clamp-3 text-[11px] italic leading-snug text-slate-300">
              {texto}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgendaCard({
  aula,
  selecionada,
  estilo,
  onSelecionar,
  amplo = false,
  emAndamento = false,
  jaOcorreu = false,
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
  // Sinais da chamada (Fase 2): conflito Emusys x humano e reposicoes pendentes.
  // So fazem sentido em aula que tem aluno e nao esta cancelada.
  const conflito = estado !== 'cancelada' && temConflitoAula(aula);
  const reposicoes = estado !== 'cancelada' ? reposicoesPendentesAula(aula) : 0;
  // Sinal de aluno nao faz sentido em aula cancelada: ninguem vai estar la.
  const mostrarSinais = estado !== 'cancelada';

  return (
    <Tooltip side="top" content={<ResumoDaAula aula={aula} estado={estado} jaOcorreu={jaOcorreu} />}>
      <button
        type="button"
        style={estilo}
        onClick={() => onSelecionar(aula)}
        aria-current={selecionada}
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
            ALUNO, que a legenda do rodape da timeline decodifica.
            ⚠️ Sem `title` aqui: o tooltip nativo do SO apareceria POR CIMA do
            resumo do card, com atraso e estilo do Windows. Quem decodifica os
            sinais e a legenda fixa do rodape, e o resumo os escreve por extenso. */}
        {mostrarSinais && (emRisco || inadimplentes > 0 || calouros > 0 || aula.alunos.length > 1 || conflito || reposicoes > 0) && (
          <span className="flex shrink-0 items-center gap-1">
            {conflito && (
              <AlertTriangle className="h-3 w-3 text-amber-400" aria-label="conflito com Emusys" />
            )}
            {reposicoes > 0 && (
              <span className="inline-flex items-center text-amber-400" aria-label="reposição pendente">
                <RotateCcw className="h-3 w-3" />
                {reposicoes > 1 && <span className="ml-0.5 text-[9px] font-bold">{reposicoes}</span>}
              </span>
            )}
            {emRisco && <span className="h-[7px] w-[7px] rounded-full bg-amber-400" />}
            {inadimplentes > 0 && <span className="h-[7px] w-[7px] rounded-full bg-rose-400" />}
            {calouros > 0 && (
              <span className="text-[11px] leading-none text-amber-300">
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
    </Tooltip>
  );
}
