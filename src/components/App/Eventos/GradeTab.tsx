import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Plus,
  Trash2,
  Clock,
  X,
  AlertTriangle,
  LayoutList,
  Music,
  Settings2,
  MapPin,
  RefreshCw,
  Link2,
  Play,
  Unlink,
  UserPlus,
  Check,
  Users,
  GraduationCap,
  ArrowRightLeft,
  Mic2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimePicker24h } from '@/components/ui/time-picker-24h';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  agruparEmNumeros,
  calcularHorariosDaGrade,
  chaveDoItem,
  consolidarItensDoPalco,
  diasDoEvento,
  divergenciasDoProfessor,
  formatarDataCurta,
  formatarDuracao,
  horaParaSegundos,
  idadeHoje,
  palcoDosNumeros,
  moverNumero,
  rotuloIdade,
  segundosParaHora,
  type BlocoComHorario,
} from '@/lib/eventos';
import {
  useGradeDoEvento,
  useAlunosDoEvento,
  atualizarEvento,
  criarBloco,
  excluirBloco,
  atualizarBloco,
  removerApresentacao,
  atualizarApresentacoes,
  separarApresentacao,
  reordenarGrade,
  reordenarBlocos as reordenarBlocos_rpc,
  sincronizarRecital,
  criarUrlDePlayback,
  useTocaJunto,
  useProfessoresDaUnidade,
  definirProfessorNoPalco,
  trocarProfessorDaApresentacao,
  decidirTocaJunto,
  type PedidoTocaJunto,
  type ApresentacaoDaGrade,
  type BlocoDaGrade,
  type EventoComResumo,
} from '@/hooks/useEventos';
import { SeletorApresentacao } from './SeletorApresentacao';
import { PalcoApresentacao } from './PalcoApresentacao';

/* ─────────────────────────── número ─────────────────────────── */

/**
 * Tempo padrão de cada apresentação da unidade (`evento.duracao_padrao_segundos` — um recital
 * por unidade). Fica à vista na Grade porque é o número que mais mexe no horário; antes só
 * existia dentro de "Editar evento". O cartão continua podendo ter tempo próprio.
 */
function TempoPadraoApresentacao({
  evento,
  onSalvo,
}: {
  evento: EventoComResumo;
  onSalvo: () => void;
}) {
  const atual = Math.round(evento.duracao_padrao_segundos / 60);
  const [valor, setValor] = useState(String(atual));
  useEffect(() => setValor(String(atual)), [atual]);

  const salvar = async () => {
    const min = Number(valor);
    if (!(min > 0) || !Number.isInteger(min)) {
      toast.error('O tempo padrão precisa ser um número inteiro de minutos, maior que zero');
      setValor(String(atual));
      return;
    }
    if (min === atual) return;
    const { error } = await atualizarEvento(evento.id, { duracao_padrao_segundos: min * 60 });
    if (error) {
      toast.error('Não consegui salvar o tempo padrão', { description: error.message });
      setValor(String(atual));
      return;
    }
    toast.success(`Tempo padrão: ${min} min por apresentação`);
    onSalvo();
  };

  return (
    <label
      className="flex items-center gap-1.5 text-[12.5px] text-slate-400"
      title="Vale para toda apresentação sem tempo próprio. Para mudar só uma, use o campo de minutos no cartão dela."
    >
      <Clock className="h-3.5 w-3.5 text-slate-500" />
      <span className="hidden sm:inline">Tempo padrão</span>
      <Input
        type="number"
        min={1}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-14 text-[16px] sm:h-7 sm:text-[12.5px]"
      />
      <span className="sm:hidden">min por número</span>
      <span className="hidden sm:inline">min por apresentação</span>
    </label>
  );
}

/**
 * Fila de pedidos "toca junto" que os professores fizeram no LA Teacher.
 *
 * Aprovar junta os dois no mesmo número da grade e confirma o pedido numa RPC só —
 * se a junção falhar (um deles já está em grupo), a transação desfaz e o pedido
 * continua 'pedido' para a coordenação resolver. Recusar exige um motivo, que vai
 * de volta para o professor ler no app dele.
 */
function FilaTocaJunto({ eventoId, onMudou }: { eventoId: number; onMudou: () => void }) {
  const { pedidos, loading, recarregar } = useTocaJunto(eventoId);
  const [decidindo, setDecidindo] = useState<number | null>(null);
  const pendentes = pedidos.filter((p) => p.status === 'pedido');

  if (loading || pendentes.length === 0) return null;

  const decidir = async (pedido: PedidoTocaJunto, aprovar: boolean) => {
    let motivo: string | undefined;
    if (!aprovar) {
      const texto = window.prompt(
        `Motivo da recusa — ${pedido.aluno_nome} com ${pedido.com_aluno_nome}:`,
      );
      if (texto === null || texto.trim() === '') return;
      motivo = texto.trim();
    }
    setDecidindo(pedido.id);
    const { error } = await decidirTocaJunto(pedido.id, aprovar, motivo);
    setDecidindo(null);
    if (error) {
      // TOCA_JUNTO_SEM_APRESENTACAO = um dos dois ainda não está na grade — criar a
      // apresentação (ou recusar com motivo). As demais mensagens já vêm prontas do banco.
      const msg =
        error.message === 'TOCA_JUNTO_SEM_APRESENTACAO'
          ? 'Um dos dois ainda não tem apresentação nos blocos — adicione antes de aprovar, ou recuse.'
          : error.message;
      toast.error(`Não consegui ${aprovar ? 'confirmar' : 'recusar'}: ${msg}`);
      return;
    }
    toast.success(
      aprovar
        ? `${pedido.aluno_nome} e ${pedido.com_aluno_nome} agora tocam juntos no mesmo número`
        : 'Pedido recusado',
    );
    recarregar();
    // Aprovar mexeu na grade (o juntar) — recarrega as apresentações também.
    if (aprovar) onMudou();
  };

  return (
    <div className="rounded-xl border border-violet-500/40 bg-violet-500/5 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-violet-300">
        <Users className="h-3.5 w-3.5" />
        {pendentes.length === 1
          ? '1 pedido de tocar junto'
          : `${pendentes.length} pedidos de tocar junto`}
        <span className="font-normal text-violet-300/70">— professores pediram no LA Teacher</span>
      </p>
      <ul className="mt-2 space-y-1.5">
        {pendentes.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]">
            <span className="text-white">
              <span className="font-medium">{p.aluno_nome}</span>
              <span className="text-slate-400"> ({p.curso_chave})</span>
              <span className="text-slate-400"> toca com </span>
              <span className="font-medium">{p.com_aluno_nome}</span>
              <span className="text-slate-400"> ({p.com_curso_chave})</span>
            </span>
            {p.pedido_por_professor_nome && (
              <span className="text-[12px] sm:text-[11px] text-slate-500">
                Prof. {p.pedido_por_professor_nome}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1 border-emerald-500/40 px-2 text-[12px] sm:text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                disabled={decidindo === p.id}
                onClick={() => decidir(p, true)}
              >
                <Check className="h-3 w-3" />
                aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1 border-rose-500/40 px-2 text-[12px] sm:text-[11px] text-rose-300 hover:bg-rose-500/10"
                disabled={decidindo === p.id}
                onClick={() => decidir(p, false)}
              >
                <X className="h-3 w-3" />
                recusar
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Botões do rodapé do cartão (palco, observação, tocar junto) no desktop. Eram texto cinza de
 * 11px sem borda e ninguém os achava na demonstração de 08/10 ("botões mais visíveis no
 * rodapé do cartão"); agora são pílulas com borda, do mesmo tamanho, lado a lado.
 */
const PILULA_RODAPE =
  'sm:inline-flex sm:h-7 sm:min-h-0 sm:items-center sm:gap-1.5 sm:rounded-md sm:border sm:px-2.5 sm:text-[12px] sm:font-medium sm:transition-colors';
const PILULA_NEUTRA = 'sm:border-slate-700 sm:bg-slate-800/60 sm:text-slate-300 sm:hover:border-slate-500 sm:hover:text-white';

/** Valor do Select para "ninguém": o Radix proíbe `value=""`. */
const SEM_PROFESSOR_NO_PALCO = 'sem-professor-no-palco';

/**
 * Professor que sobe ao palco com o aluno, quando não é o do aluno (pedido da reunião de
 * 08/10/2026: "professor substituto por apresentação, sem trocar o professor do aluno").
 *
 * Fica por INTEGRANTE, não por número: dois alunos que tocam juntos podem ter professores
 * diferentes, e cada um pode precisar de um substituto diferente. O professor do aluno não
 * entra na lista — escolhê-lo seria registrar o que já é o padrão.
 */
function ProfessorNoPalco({
  apresentacao,
  unidadeId,
  onMudou,
}: {
  apresentacao: ApresentacaoDaGrade;
  unidadeId: string;
  onMudou: () => void;
}) {
  const { professores, erro } = useProfessoresDaUnidade(unidadeId);
  const [salvando, setSalvando] = useState(false);
  const opcoes = professores.filter((p) => p.id !== apresentacao.professor_id);

  const salvar = async (professorId: number | null) => {
    setSalvando(true);
    const { error } = await definirProfessorNoPalco(apresentacao.id, professorId);
    setSalvando(false);
    if (error) toast.error(`Não consegui salvar o professor no palco: ${error.message}`);
    else onMudou();
  };

  if (apresentacao.professor_palco_id) {
    return (
      <span className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-md bg-sky-500/10 py-0.5 pl-1.5 pr-0.5 text-[12px] sm:text-[11.5px] text-sky-200 ring-1 ring-inset ring-sky-500/25">
        <Mic2 className="h-3 w-3 shrink-0 text-sky-300" />
        <span className="truncate">
          No palco: <span className="font-medium">Prof. {apresentacao.professor_palco_nome ?? '—'}</span>
        </span>
        <button
          type="button"
          onClick={() => salvar(null)}
          disabled={salvando}
          aria-label="Tirar o professor no palco"
          title="Tirar — volta a ser o professor do aluno"
          className="flex h-11 w-11 items-center justify-center rounded text-sky-300/70 transition-colors hover:bg-sky-500/15 hover:text-sky-100 disabled:opacity-50 sm:h-5 sm:w-5"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <Select
      value={SEM_PROFESSOR_NO_PALCO}
      onValueChange={(v) => v !== SEM_PROFESSOR_NO_PALCO && salvar(Number(v))}
      disabled={salvando || (opcoes.length === 0 && !erro)}
    >
      <SelectTrigger
        aria-label={`Professor no palco com ${apresentacao.aluno_nome}`}
        title={erro ?? 'Outro professor sobe ao palco com este aluno (o professor do aluno não muda)'}
        className="mt-0.5 h-11 w-auto gap-1 border-dashed border-slate-700 bg-transparent px-2 text-[12px] text-slate-500 hover:border-slate-500 hover:text-slate-300 sm:h-6 sm:text-[11px] [&>svg]:h-3 [&>svg]:w-3"
      >
        <Mic2 className="h-3 w-3" />
        <span>{salvando ? 'salvando…' : erro ? 'professores indisponíveis' : 'professor no palco'}</span>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {opcoes.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            {p.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Professor DO ALUNO nesta apresentação, trocável no cartão (pedido do Arthur, 09/10).
 * Parece texto ("Prof. Fulano ▾") para não pesar no cartão; abre a lista da unidade.
 */
function ProfessorDoAluno({
  apresentacao,
  unidadeId,
  onMudou,
}: {
  apresentacao: ApresentacaoDaGrade;
  unidadeId: string;
  onMudou: () => void;
}) {
  const { professores } = useProfessoresDaUnidade(unidadeId);
  const [salvando, setSalvando] = useState(false);

  const trocar = async (valor: string) => {
    const novo = Number(valor);
    if (!novo || novo === apresentacao.professor_id) return;
    const nome = professores.find((p) => p.id === novo)?.nome ?? 'o novo professor';
    const jaLancou = Boolean(apresentacao.professor?.musica_lancada_em);
    const ok = window.confirm(
      `Trocar o professor de ${apresentacao.aluno_nome} no recital para ${nome}?

` +
        'A matrícula não muda. No LA Teacher, o aluno passa para a lista de relatórios de ' +
        `${nome.split(' ')[0]}` +
        (jaLancou ? ' — e o que o professor atual já lançou (música, relatório) vai junto.' : '.'),
    );
    if (!ok) return;
    setSalvando(true);
    const { error } = await trocarProfessorDaApresentacao(
      apresentacao.id,
      novo,
      apresentacao.professor_palco_id,
    );
    setSalvando(false);
    if (error) toast.error(`Não consegui trocar o professor: ${error.message}`);
    else {
      toast.success(`Professor de ${apresentacao.aluno_nome.split(' ')[0]} agora é ${nome}`);
      onMudou();
    }
  };

  return (
    <Select value={apresentacao.professor_id ? String(apresentacao.professor_id) : undefined} onValueChange={trocar} disabled={salvando}>
      <SelectTrigger
        aria-label={`Professor de ${apresentacao.aluno_nome}`}
        title="Trocar o professor do aluno neste recital"
        className="h-auto w-auto max-w-full gap-1 border-0 bg-transparent p-0 text-[12px] text-slate-500 shadow-none hover:text-slate-300 focus:ring-0 focus:ring-offset-0 sm:text-[11.5px] [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60"
      >
        <span className="truncate">
          {salvando ? 'salvando…' : `Prof. ${apresentacao.professor_nome ?? 'sem professor'}`}
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {apresentacao.professor_id && !professores.some((p) => p.id === apresentacao.professor_id) && (
          // Professor de outra unidade (aluno visitante): continua na lista para não sumir.
          <SelectItem value={String(apresentacao.professor_id)}>
            {apresentacao.professor_nome ?? 'Professor atual'}
          </SelectItem>
        )}
        {professores.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            {p.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Nome, idade, curso, professor e selos de UM integrante do número. */
function LinhaIntegrante({
  apresentacao,
  emGrupo,
  unidadeId,
  onSeparar,
  onRemover,
  onMudou,
}: {
  apresentacao: ApresentacaoDaGrade;
  emGrupo: boolean;
  unidadeId: string;
  onSeparar: () => void;
  onRemover: () => void;
  onMudou: () => void;
}) {
  const idade = rotuloIdade(idadeHoje(apresentacao.aluno_data_nascimento));
  // O que o professor lançou difere do que vale aqui? Só existe quando o ADM tomou posse dos
  // campos — senão o sync já teria igualado os dois lados.
  const divergencias = divergenciasDoProfessor(apresentacao);

  return (
    <div className={cn(emGrupo && 'rounded border border-slate-700/50 bg-slate-950/30 px-2 py-1.5')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="truncate text-[13px] font-medium text-white">
              {apresentacao.aluno_nome}
            </span>
            {/* Mesmo formato da aba Alunos e do seletor — idade de hoje, não do recital. */}
            {idade && <span className="text-[12px] sm:text-[11.5px] text-slate-500">{idade}</span>}
            <span className="rounded bg-amber-500/15 px-1.5 py-px text-[12px] sm:text-[10.5px] text-amber-300">
              {apresentacao.curso_nome}
            </span>
            {/* O selo mostra que o professor já lançou no LA Teacher — a divergência explica
                QUANDO o conteúdo daqui difere do dele. */}
            {apresentacao.professor?.musica_lancada_em && (
              <span
                className="rounded bg-sky-500/15 px-1.5 py-px text-[12px] sm:text-[10.5px] text-sky-300"
                title="Relatório do LA Teacher lançado"
              >
                prof. lançou
              </span>
            )}
            {/* O professor pode mexer na música e no palco depois de enviar — o selo avisa
                que vale uma conferida antes de aprovar ou imprimir. */}
            {apresentacao.editado_apos_envio_em && (
              <span
                className="rounded bg-amber-500/15 px-1.5 py-px text-[12px] sm:text-[10.5px] text-amber-300"
                title={`Editado em ${new Date(apresentacao.editado_apos_envio_em).toLocaleString('pt-BR')}`}
              >
                editou após envio
              </span>
            )}
            {/* Formando (passagem de ciclo): é o ritual da beca — o bloco conta quantos
                tem no cabeçalho e a linha diz para onde a pessoa vai. */}
            {apresentacao.formatura_tipo && (
              <span
                className="flex items-center gap-0.5 rounded bg-violet-500/15 px-1.5 py-px text-[12px] sm:text-[10.5px] font-medium text-violet-300"
                title={apresentacao.formatura_tipo === 'kids' ? 'Passa para a LA Music School' : apresentacao.formatura_tipo === 'bebes' ? 'Passa para a Musicalização Preparatória' : 'Formando'}
              >
                <GraduationCap className="h-3 w-3" />
                formando
              </span>
            )}
            {apresentacao.certificado_status === 'emitido' && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[12px] sm:text-[10.5px] text-emerald-300">
                cert. emitido
              </span>
            )}
          </div>
          {/* "Prof." explícito: sem ele o nome fica solto embaixo do nome do aluno e a
              programação impressa vira dois nomes sem papel declarado. */}
          <div>
            <ProfessorDoAluno apresentacao={apresentacao} unidadeId={unidadeId} onMudou={onMudou} />
          </div>
          <ProfessorNoPalco apresentacao={apresentacao} unidadeId={unidadeId} onMudou={onMudou} />
        </div>

        {emGrupo && (
          <button
            type="button"
            onClick={onSeparar}
            title="Tirar deste número — passa a tocar sozinho, logo depois dele"
            className="-my-1 flex min-h-[44px] items-center gap-1 rounded px-1.5 text-[12px] sm:text-[11px] text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 sm:my-0 sm:mt-0.5 sm:min-h-0 sm:px-1"
          >
            <Unlink className="h-3.5 w-3.5" />
            separar
          </button>
        )}
        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover ${apresentacao.aluno_nome} dos blocos`}
          title="Remover dos blocos"
          // 36px de alvo no celular: o X de 16px ao lado do nome era o toque mais facil de errar.
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-slate-600 transition-colors hover:text-rose-400 sm:m-0 sm:mt-0.5 sm:block sm:h-auto sm:w-auto"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Divergência professor x grade: cada campo que o ADM sobrescreveu depois do professor
          lançar. Informa; nunca bloqueia — o ADM pode ter razão. */}
      {divergencias.length > 0 && (
        <div className="mt-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[12px] sm:text-[11.5px] text-amber-200/90">
          <span className="font-medium">Prof. pediu: </span>
          {divergencias.map((d, i) => (
            <span key={d.campo}>
              {i > 0 && ' · '}
              {d.rotulo} “{d.professor ?? '—'}”
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Um NÚMERO do recital: o que sobe ao palco de uma vez.
 *
 * Quase sempre é uma apresentação sozinha. Quando alunos tocam juntos (a Ana no Violão
 * acompanhando o Pedro no Canto), o número tem vários integrantes — cada um continua sendo a
 * apresentação dele (certificado por curso, canal do LA Teacher), mas a grade mostra um cartão,
 * um horário, uma música.
 *
 * ⚠️ Música, link e duração são DO NÚMERO e gravam em todos os integrantes: gravar só no
 * primeiro deixaria a planilha e o certificado dos outros com a música vazia. Palco e mapa
 * continuam por integrante — é o que cada um pede para tocar.
 */
type PropsDoNumero = {
  numero: ApresentacaoDaGrade[];
  horario: { inicio: string; duracaoSegundos: number } | undefined;
  sugestoes: { instrumento: string[]; equipamento: string[] };
  eventoId: number;
  unidadeId: string;
  blocoId: number;
  onMudou: () => void;
};

/**
 * Casca arrastável do número. Só ela re-renderiza a cada movimento do mouse durante um
 * arrasto (o dnd-kit atualiza todo `useSortable`); o conteúdo pesado — campos, seletores,
 * palco — fica em `CorpoDoNumero`, memorizado. Com ~250 cartões, redesenhar o corpo de todos
 * a cada pixel era a lentidão ao arrastar (reunião de 08/10).
 */
function CartaoNumero(props: PropsDoNumero) {
  const { numero } = props;
  const emGrupo = numero.length > 1;
  // A alça move o NÚMERO inteiro: o id arrastável é o do primeiro integrante.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: numero[0].id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // Celular: cartão de roteiro (16px de raio, superfície mais densa, borda discreta).
        'rounded-2xl border bg-slate-900/80 p-3 shadow-sm shadow-black/20 sm:rounded-lg sm:bg-slate-900/50 sm:p-2.5 sm:shadow-none',
        emGrupo ? 'border-violet-500/40' : 'border-slate-800 sm:border-slate-700/60',
        // O vão de onde o cartão vai cair: tracejado violeta, conteúdo apagado.
        isDragging && 'border-dashed border-violet-400/70 bg-violet-500/10 [&>*]:opacity-25',
      )}
    >
      <CorpoDoNumero {...props} alca={attributes} alcaEventos={listeners} />
    </div>
  );
}

const CorpoDoNumero = memo(function CorpoDoNumero({
  numero,
  horario,
  sugestoes,
  eventoId,
  unidadeId,
  blocoId,
  onMudou,
  alca,
  alcaEventos,
}: PropsDoNumero & {
  /** `attributes`/`listeners` do useSortable da casca — vão nas duas alças do cartão. */
  alca: ReturnType<typeof useSortable>['attributes'];
  alcaEventos: ReturnType<typeof useSortable>['listeners'];
} & {
  numero: ApresentacaoDaGrade[];
  horario: { inicio: string; duracaoSegundos: number } | undefined;
  sugestoes: { instrumento: string[]; equipamento: string[] };
  eventoId: number;
  unidadeId: string;
  blocoId: number;
  onMudou: () => void;
}) {
  const principal = numero[0];
  const ids = numero.map((a) => a.id);
  const [ehCelular] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  );
  const emGrupo = numero.length > 1;

  const [musica, setMusica] = useState(principal.musica ?? '');
  const [musicaLink, setMusicaLink] = useState(principal.musica_link ?? '');
  // O banco muda por fora do campo (sync do LA Teacher, outro integrante do número). Sem
  // acompanhar, o campo seguia vazio com a música já gravada, e o blur seguinte gravava
  // vazio por cima — foi o que apagou a música da Stella em 02/10. Enquanto a pessoa
  // edita, o que ela digita manda.
  const focoMusica = useRef<string | null>(null);
  const focoLink = useRef<string | null>(null);
  useEffect(() => {
    if (focoMusica.current === null) setMusica(principal.musica ?? '');
  }, [principal.musica]);
  useEffect(() => {
    if (focoLink.current === null) setMusicaLink(principal.musica_link ?? '');
  }, [principal.musica_link]);
  const [palcoAberto, setPalcoAberto] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [abrindoPlayback, setAbrindoPlayback] = useState<number | null>(null);

  const salvarNoNumero = async (campos: Parameters<typeof atualizarApresentacoes>[1]) => {
    const { error } = await atualizarApresentacoes(ids, campos);
    if (error) toast.error(`Não consegui salvar: ${error.message}`);
    else onMudou();
  };

  // O que o número inteiro leva ao palco, somado entre os integrantes — eles tocam ao mesmo
  // tempo. Mesma fonte da aba Palco e da folha impressa (`palcoDosNumeros`).
  const palco = useMemo(() => consolidarItensDoPalco(palcoDosNumeros(numero)), [numero]);

  // O sync do LA Teacher grava por integrante; se os professores lançaram músicas diferentes
  // para o mesmo número, a tela diz — a equipe decide qual vale digitando no campo.
  const musicasDistintas = [
    ...new Set(numero.map((a) => (a.musica ?? '').trim()).filter((m) => m !== '')),
  ];
  const musicaDivergente = emGrupo && musicasDistintas.length > 1;

  const inicioSeg = horaParaSegundos(horario?.inicio);
  const termina =
    horario && inicioSeg !== null ? segundosParaHora(inicioSeg + horario.duracaoSegundos) : null;

  const noNumero = useMemo(
    () => new Set(numero.map((a) => `${a.pessoa_chave}|${a.curso_id}`)),
    [numero],
  );

  const abrirPlayback = async (ap: ApresentacaoDaGrade) => {
    if (!ap.playback_path) return;
    setAbrindoPlayback(ap.id);
    const { url, error } = await criarUrlDePlayback(ap.playback_path);
    setAbrindoPlayback(null);
    if (error || !url) {
      toast.error(`Não consegui abrir o playback: ${error?.message ?? 'sem link'}`);
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  const remover = async (ap: ApresentacaoDaGrade) => {
    const { error } = await removerApresentacao(ap.id);
    if (error) toast.error(`Não consegui remover: ${error.message}`);
    else onMudou();
  };

  const separar = async (ap: ApresentacaoDaGrade) => {
    const { error } = await separarApresentacao(ap.id);
    if (error) toast.error(error.message, { description: error.hint ?? undefined });
    else onMudou();
  };

  const comPlayback = numero.filter((a) => a.playback_path);
  const links = [...new Set(numero.map((a) => a.musica_link).filter(Boolean))] as string[];
  const observacoes = numero.filter((a) => (a.observacao_mapa ?? '').trim() !== '');
  const duracaoMin = horario ? Math.round(horario.duracaoSegundos / 60) : null;
  const duracaoPropria = numero.some((a) => a.duracao_segundos !== null);
  const primeiroNome = (ap: ApresentacaoDaGrade) => ap.aluno_nome.split(' ')[0];

  return (
      <div className="flex items-start gap-2">
        {/* O handle é SÓ a alça: com o listener no cartão inteiro, clicar no campo de música
            iniciaria um arrasto e o input nunca receberia foco. */}
        <button
          type="button"
          {...alca}
          {...alcaEventos}
          aria-label={`Mover ${numero.map((a) => a.aluno_nome).join(' e ')}`}
          className="mt-0.5 hidden cursor-grab touch-none text-slate-600 hover:text-slate-400 active:cursor-grabbing sm:block"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Início e fim do número: é o que responde "quanto tempo isto ocupa" sem conta. */}
        {/* No celular o selo sai da coluna da esquerda e vira a 1a linha do conteudo: na
            coluna ele comia ~90px de 390 e o nome do aluno truncava. */}
        <span
          className="mt-px hidden shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[12px] sm:text-[11px] font-medium tabular-nums text-slate-300 sm:inline"
          title={duracaoMin !== null ? `${duracaoMin} min` : undefined}
        >
          {horario ? `${horario.inicio}–${termina}` : '--:--'}
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Celular: o horário abre o cartão, como numa programação impressa. */}
          <div className="-mt-1 flex items-center gap-2 sm:hidden">
            <span className="text-[17px] font-semibold tabular-nums tracking-tight text-amber-300">
              {horario?.inicio ?? '--:--'}
            </span>
            <span className="text-[12px] tabular-nums text-slate-500">
              até {termina ?? '--:--'}
              {duracaoMin !== null && ` · ${duracaoMin} min`}
            </span>
            <button
              type="button"
              {...alca}
              {...alcaEventos}
              aria-label={`Mover ${numero.map((a) => a.aluno_nome).join(' e ')} (celular)`}
              className="-mr-2 ml-auto flex h-11 w-11 cursor-grab touch-none items-center justify-center rounded-xl text-slate-500 active:bg-slate-800"
            >
              <GripVertical className="h-5 w-5" />
            </button>
          </div>
          {emGrupo && (
            <p className="text-[12px] sm:text-[10.5px] font-medium uppercase tracking-wide text-violet-300/80">
              sobem juntos · {numero.length} alunos
            </p>
          )}

          {numero.map((ap) => (
            <LinhaIntegrante
              key={ap.id}
              apresentacao={ap}
              emGrupo={emGrupo}
              unidadeId={unidadeId}
              onSeparar={() => separar(ap)}
              onRemover={() => remover(ap)}
              onMudou={onMudou}
            />
          ))}

          {musicaDivergente && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[12px] sm:text-[11.5px] text-amber-200/90">
              <span className="font-medium">Músicas diferentes no número: </span>
              {numero
                .filter((a) => (a.musica ?? '').trim() !== '')
                .map((a) => `${primeiroNome(a)} “${a.musica}”`)
                .join(' · ')}
              <span className="text-amber-200/70"> — digite a que vale e ela grava para todos.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={musica}
              onChange={(e) => setMusica(e.target.value)}
              onFocus={() => {
                focoMusica.current = musica;
              }}
              // Salva ao sair do campo, não a cada tecla: um PATCH por caractere numa grade de
              // 270 apresentações é o tipo de coisa que derruba a tela.
              onBlur={() => {
                const digitouAlgo = musica !== focoMusica.current;
                focoMusica.current = null;
                // Só entrar e sair do campo não é decisão: grava apenas o que foi digitado.
                if (!digitouAlgo) {
                  setMusica(principal.musica ?? '');
                  return;
                }
                const valor = musica.trim();
                const mudou = numero.some((a) => (a.musica ?? '') !== valor);
                if (mudou) salvarNoNumero({ musica: valor || null });
              }}
              // A 16px (celular) o exemplo não cabe e sai cortado no meio da palavra.
              placeholder={ehCelular ? 'Música' : 'Música (ex: Asa Branca)'}
              // Linha inteira no celular; fonte de 16px evita o zoom automatico do iOS no foco.
              className="h-11 min-w-[140px] flex-1 rounded-xl border-slate-800 bg-slate-950/60 text-[16px] sm:h-7 sm:min-w-0 sm:rounded-md sm:border-input sm:bg-transparent sm:text-[12.5px]"
            />
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-600" />
              <Input
                // defaultValue só vale na montagem: a chave remonta o campo quando a duração
                // muda no banco (sync do LA Teacher), senão ele seguia mostrando o valor velho.
                key={`duracao-${duracaoPropria && duracaoMin !== null ? duracaoMin : ''}`}
                type="number"
                min={1}
                defaultValue={duracaoPropria && duracaoMin !== null ? duracaoMin : ''}
                onBlur={(e) => {
                  const min = Number(e.target.value);
                  const valor = min > 0 ? min * 60 : null;
                  const mudou = numero.some((a) => a.duracao_segundos !== valor);
                  // Campo vazio volta para a duração padrão do evento (null), em vez de gravar
                  // zero e sumir com a apresentação do cálculo.
                  if (mudou) salvarNoNumero({ duracao_segundos: valor });
                }}
                placeholder="5"
                className="h-11 w-16 rounded-xl border-slate-800 bg-slate-950/60 text-center text-[16px] sm:h-7 sm:w-14 sm:rounded-md sm:border-input sm:bg-transparent sm:text-left sm:text-[12.5px]"
                title="Duração em minutos (vazio = padrão do evento)"
              />
              <span className="text-[12px] sm:text-[11px] text-slate-600">min</span>
            </div>

            {/* Fonte do playback: link externo abre direto; arquivo do bucket pede a URL
                assinada da edge — a policy do recital-playback não conhece o ADM. */}
            {links.map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] sm:text-[11.5px] text-sky-400 transition-colors hover:bg-sky-500/10"
                title={link}
              >
                <Link2 className="h-3.5 w-3.5" />
                link
              </a>
            ))}
            {comPlayback.map((ap) => (
              <button
                key={ap.id}
                type="button"
                onClick={() => abrirPlayback(ap)}
                disabled={abrindoPlayback === ap.id}
                className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[12px] sm:text-[11.5px] text-emerald-300 transition-colors hover:bg-emerald-500/25"
                title={ap.playback_path ?? undefined}
              >
                <Play className="h-3.5 w-3.5" />
                {abrindoPlayback === ap.id
                  ? 'abrindo…'
                  : emGrupo
                    ? `playback (${primeiroNome(ap)})`
                    : 'ouvir playback'}
              </button>
            ))}
          </div>

          {/* Link da música: segundo campo curto, só quando já tem playback/relatório ou algo
              digitado — expor sempre adicionaria um input morto em 270 cartões. */}
          {(musicaLink || links.length > 0 || numero.some((a) => a.tem_playback)) && (
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3 w-3 shrink-0 text-slate-600" />
              <Input
                value={musicaLink}
                onChange={(e) => setMusicaLink(e.target.value)}
                onFocus={() => {
                  focoLink.current = musicaLink;
                }}
                onBlur={() => {
                  const digitouAlgo = musicaLink !== focoLink.current;
                  focoLink.current = null;
                  if (!digitouAlgo) {
                    setMusicaLink(principal.musica_link ?? '');
                    return;
                  }
                  const valor = musicaLink.trim();
                  const mudou = numero.some((a) => (a.musica_link ?? '') !== valor);
                  if (mudou) salvarNoNumero({ musica_link: valor || null });
                }}
                placeholder="Link da música (YouTube, Spotify…)"
                className="h-11 flex-1 text-[16px] sm:h-6 sm:text-[11.5px]"
              />
            </div>
          )}

          {/* Instrumentos NO cartão, e não no rodapé do bloco (pedido do Hugo, 28/09): quem
              monta o palco precisa saber o que ESTE número pede na hora em que ele entra. O
              tracejado vem do curso do aluno; o cheio, alguém escolheu. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {palco.map((item) => (
              <span
                key={`${item.tipo}-${item.nome}`}
                title={item.doCurso ? 'veio do curso, ninguém digitou' : undefined}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[12px] sm:text-[11.5px]',
                  item.tipo === 'instrumento'
                    ? 'bg-amber-500/10 text-amber-300/90'
                    : 'bg-sky-500/10 text-sky-300/90',
                  // Cor nomeada, não `border-current/30` — opacidade sobre `currentColor` não
                  // gera classe no Tailwind e a borda sairia sem estilo nenhum.
                  item.doCurso && 'border border-dashed border-slate-600',
                )}
              >
                {item.quantidade}× {item.nome}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setPalcoAberto((v) => !v)}
              aria-expanded={palcoAberto}
              className={cn(
                'flex min-h-[44px] items-center gap-1.5 rounded-full bg-slate-800/70 px-3.5 py-0.5 text-[12px] text-slate-300 transition-colors hover:bg-slate-800',
                PILULA_RODAPE,
                palcoAberto
                  ? 'sm:border-amber-500/50 sm:bg-amber-500/10 sm:text-amber-200'
                  : PILULA_NEUTRA,
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {palcoAberto ? 'fechar palco' : palco.length > 0 ? 'editar palco' : (
                <>
                  palco
                  {/* No celular o convite vazio de observacao some (abaixo); o botao avisa que
                      o mapa mora aqui dentro. */}
                  {observacoes.length === 0 && <span className="sm:hidden">e mapa</span>}
                </>
              )}
            </button>
            {/* Celular: "tocar junto" na MESMA linha do palco — empilhados, os dois botões de
                44px somavam 88px em cada um dos 24 cartões. */}
            {!adicionando && (
              <button
                type="button"
                onClick={() => setAdicionando(true)}
                className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-violet-500/10 px-3.5 text-[12px] text-violet-200 transition-colors active:bg-violet-500/20 sm:hidden"
                title="Colocar outro aluno para tocar junto neste número"
              >
                <UserPlus className="h-3.5 w-3.5" />
                tocar junto
              </button>
            )}
          </div>

          {/* A observação fica FORA do painel, sempre à vista, como no protótipo do Arthur. É a
              única parte do palco que se lê em voz alta na montagem — escondê-la atrás de um
              clique faz quem confere a grade não saber que ela existe. */}
          {!palcoAberto &&
            (observacoes.length > 0 ? (
              observacoes.map((ap) => (
                <button
                  key={ap.id}
                  type="button"
                  onClick={() => setPalcoAberto(true)}
                  className="flex w-full gap-1.5 rounded px-1.5 py-1 text-left text-[12px] sm:text-[11.5px] text-slate-400 transition-colors hover:bg-slate-800/60"
                >
                  <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    {emGrupo && <span className="text-slate-500">{primeiroNome(ap)}: </span>}
                    {ap.observacao_mapa}
                  </span>
                </button>
              ))
            ) : (
              <button
                type="button"
                onClick={() => setPalcoAberto(true)}
                // Convite vazio: no celular ocupava uma linha de 36px em cada um dos 24 cartoes.
                className={cn('hidden w-fit', PILULA_RODAPE, PILULA_NEUTRA)}
              >
                <MapPin className="h-3.5 w-3.5" />
                observação / mapa de palco
              </button>
            ))}

          {/* O palco é de cada integrante — é o que cada um pede para tocar. */}
          {palcoAberto &&
            numero.map((ap) => (
              <div key={ap.id}>
                {emGrupo && (
                  <p className="mt-1 text-[12px] sm:text-[11px] font-medium text-slate-400">
                    Palco de {ap.aluno_nome} · {ap.curso_nome}
                  </p>
                )}
                <PalcoApresentacao apresentacao={ap} sugestoes={sugestoes} onMudou={onMudou} />
              </div>
            ))}

          {adicionando ? (
            <SeletorApresentacao
              eventoId={eventoId}
              unidadeId={unidadeId}
              blocoId={blocoId}
              juntarCom={{ alvoId: principal.id, noNumero }}
              onFechar={() => setAdicionando(false)}
              onAdicionado={() => {
                setAdicionando(false);
                onMudou();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className={cn(
                'hidden w-fit',
                PILULA_RODAPE,
                'sm:border-violet-500/40 sm:bg-violet-500/10 sm:text-violet-200 sm:hover:border-violet-400 sm:hover:bg-violet-500/20',
              )}
              title="Colocar outro aluno para tocar junto neste número"
            >
              <UserPlus className="h-3.5 w-3.5" />
              tocar junto (adicionar aluno)
            </button>
          )}
        </div>
      </div>
  );
});

/* ───────────────────────────── bloco ───────────────────────────── */

function CartaoBloco({
  bloco,
  horario,
  eventoId,
  unidadeId,
  sugestoes,
  dias,
  dataEvento,
  compacto = false,
  onMudou,
}: {
  bloco: BlocoDaGrade;
  horario: BlocoComHorario | undefined;
  eventoId: number;
  unidadeId: string;
  sugestoes: { instrumento: string[]; equipamento: string[] };
  /** Todos os dias do recital — vazio/1 dia = o seletor de data nem aparece. */
  dias: string[];
  dataEvento: string;
  /**
   * Enquanto um BLOCO é arrastado, todos mostram só o cabeçalho. Com o bloco inteiro aberto,
   * trocar dois blocos deslocava os outros pela altura de dezenas de cartões e eles saíam da
   * tela — o "bloco que some" da reunião de 08/10.
   */
  compacto?: boolean;
  onMudou: () => void;
}) {
  const [adicionando, setAdicionando] = useState(false);
  // O que sobe ao palco de uma vez. A consolidação do palco do bloco inteiro continua na aba
  // Palco e na folha impressa; aqui cada número mostra o dele (pedido do Hugo, 28/09).
  const numeros = useMemo(() => agruparEmNumeros(bloco.apresentacoes), [bloco.apresentacoes]);
  // Ritual da beca (pedido do Marcos, 30/09): QUANTOS formandos por bloco. É por
  // PESSOA — quem toca dois cursos no mesmo bloco conta uma vez só.
  const formandosDoBloco = useMemo(() => {
    const pessoas = new Set<string>();
    for (const a of bloco.apresentacoes) if (a.formatura_tipo) pessoas.add(a.pessoa_chave);
    return pessoas.size;
  }, [bloco.apresentacoes]);
  // `useSortable` faz as DUAS coisas: o bloco é item arrastável (trocar de ordem com os
  // outros) e alvo de soltura (receber apresentação, inclusive vazio). Antes eu usava
  // `useDroppable` e o bloco só recebia — não dava para reordenar os blocos entre si.
  //
  // ⚠️ Isso só funciona dentro de um `SortableContext` de blocos; sem ele, o `useSortable`
  // não registra nada e o arrasto morre em silêncio. Foi exatamente o que aconteceu.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: `bloco-${bloco.id}`, data: { tipo: 'bloco', blocoId: bloco.id } });

  const remover = async () => {
    const n = bloco.apresentacoes.length;
    const aviso =
      n > 0
        ? `Excluir "${bloco.nome}"? As ${n} apresentações dele saem junto.`
        : `Excluir "${bloco.nome}"?`;
    if (!window.confirm(aviso)) return;
    const { error } = await excluirBloco(bloco.id);
    if (error) toast.error(`Não consegui excluir: ${error.message}`);
    else onMudou();
  };

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // Celular: o bloco é a "seção" do roteiro — sem caixa em volta, o cartão de cada número
        // já é a superfície; caixa dentro de caixa comia 40px de largura.
        'transition-colors sm:rounded-xl sm:border sm:bg-slate-800/40',
        isOver && !isDragging ? 'border-violet-500' : 'border-slate-700',
        isDragging && 'opacity-40',
      )}
    >
      {/* No celular: alca, nome, horario e lixeira na 1a linha; dia e inicio manual na 2a
          (`order`); contagens embaixo. No desktop vale a ordem do codigo, numa faixa so. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-700/60 px-0.5 pb-3 pt-1 sm:px-3 sm:py-2.5">
        {/* A alça move o BLOCO inteiro. Precisa ser só a alça: com os listeners no
            cabeçalho, clicar no campo de hora ou no botão de excluir viraria arrasto. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Mover ${bloco.nome}`}
          title="Arraste para trocar a ordem dos blocos"
          className="-m-1.5 cursor-grab touch-none p-1.5 text-slate-600 hover:text-slate-400 active:cursor-grabbing sm:m-0 sm:p-0"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h3 className="text-[18px] font-semibold tracking-tight text-white sm:text-[14px]">{bloco.nome}</h3>

        {/* Dia do bloco = a ABA em que ele está; aqui só se MOVE para outro dia. Um seletor
            com o dia atual repetia a aba de cima (Hugo, 06/10: "dois botões que fazem a
            mesma coisa"). Com 2 dias é um botão; com 3+, a lista só dos OUTROS dias. */}
        {dias.length > 1 && (() => {
          const diaAtual = bloco.data ?? dataEvento;
          const outros = dias.filter((d) => d !== diaAtual);
          const rotulo = (d: string) => `${dias.indexOf(d) + 1}º dia · ${formatarDataCurta(d)}`;
          const mover = async (v: string) => {
            const { error } = await atualizarBloco(bloco.id, { data: v === dataEvento ? null : v });
            if (error) {
              toast.error(`Não consegui mover o ${bloco.nome}: ${error.message}`);
              return;
            }
            // O bloco sai desta aba e vai para a do outro dia — sem o aviso parece que sumiu.
            toast.success(`${bloco.nome} foi para o ${rotulo(v)}`, {
              description: 'Abra a aba desse dia na Grade para vê-lo.',
            });
            onMudou();
          };
          const classe =
            'order-5 flex h-11 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 sm:order-none sm:h-7 sm:px-2 sm:text-[11.5px]';
          return outros.length === 1 ? (
            <button
              type="button"
              className={classe}
              onClick={() => mover(outros[0])}
              title={`Mover o ${bloco.nome} para o ${rotulo(outros[0])}`}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Mover p/ {dias.indexOf(outros[0]) + 1}º dia
            </button>
          ) : (
            <Select value="" onValueChange={mover}>
              <SelectTrigger
                className={cn(classe, 'w-auto border-0 bg-transparent')}
                aria-label={`Mover o ${bloco.nome} para outro dia`}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <SelectValue placeholder="Mover para…" />
              </SelectTrigger>
              <SelectContent>
                {outros.map((d) => (
                  <SelectItem key={d} value={d}>
                    {rotulo(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })()}

        {horario && (
          <span
            className={cn(
              'rounded px-2 py-0.5 text-[12px] font-medium tabular-nums',
              horario.conflitaComAnterior
                ? 'bg-rose-500/20 text-rose-300'
                : 'bg-amber-500/20 text-amber-300',
            )}
          >
            {horario.inicio} – {horario.fim}
          </span>
        )}

        <span className="order-7 text-[12px] text-slate-400 sm:order-none">
          {numeros.length} {numeros.length === 1 ? 'número' : 'números'}
          {numeros.length !== bloco.apresentacoes.length &&
            ` (${bloco.apresentacoes.length} apresentações)`}
          {horario && horario.duracaoSegundos > 0 && ` · ${formatarDuracao(horario.duracaoSegundos)}`}
        </span>

        {formandosDoBloco > 0 && (
          <span
            className="order-7 flex items-center gap-1 rounded bg-violet-500/15 px-2 py-0.5 text-[12px] sm:text-[11px] font-medium text-violet-300 sm:order-none"
            title="Formandos neste bloco — passagem de ciclo (ritual da beca)"
          >
            <GraduationCap className="h-3 w-3" />
            {formandosDoBloco} {formandosDoBloco === 1 ? 'formando' : 'formandos'}
          </span>
        )}

        {horario?.conflitaComAnterior && (
          <span className="order-8 flex items-center gap-1 text-[12px] sm:text-[11.5px] text-rose-300 sm:order-none">
            <AlertTriangle className="h-3.5 w-3.5" />
            começa antes do bloco anterior terminar
          </span>
        )}

        <div className="contents sm:ml-auto sm:flex sm:items-center sm:gap-2">
          {/* Início do bloco: o horário calculado já aparece na pílula âmbar; aqui só se FIXA
              um início à mão. "Início manual: automático" lia como contradição (Hugo, 06/10) —
              agora é uma ação ("Fixar início") ou, fixado, "Início fixo 10:00 ✕". */}
          <span className="order-6 flex items-center gap-1 text-[12px] text-slate-400 sm:order-none sm:text-[11.5px]">
            {bloco.horario_inicial && <span className="text-amber-300/80">Início fixo</span>}
            <TimePicker24h
              value={bloco.horario_inicial?.slice(0, 5) ?? ''}
              onChange={async (valor) => {
                const { error } = await atualizarBloco(bloco.id, {
                  horario_inicial: valor || null,
                  inicio_manual: Boolean(valor),
                });
                if (error) toast.error(`Não consegui salvar o horário: ${error.message}`);
                else onMudou();
              }}
              placeholder="Fixar início"
              className={cn(
                'h-11 w-auto gap-0 px-2.5 text-[12px] sm:h-7 sm:px-2 sm:text-[11.5px] [&_svg]:mr-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5',
                bloco.horario_inicial
                  ? 'border-amber-500/40 bg-amber-500/10 tabular-nums text-amber-200 [&_svg]:text-amber-300'
                  : 'border-0 bg-transparent text-slate-400 hover:bg-slate-800 [&_svg]:text-slate-400',
              )}
            />
            {/* Voltar ao encadeamento automático = tirar o horario manual. Sem este
                botao, quem digitou uma hora nunca mais voltava atras. */}
            {bloco.horario_inicial && (
              <button
                type="button"
                aria-label="Voltar ao horário automático"
                title="Voltar ao horário automático"
                onClick={async () => {
                  const { error } = await atualizarBloco(bloco.id, {
                    horario_inicial: null,
                    inicio_manual: false,
                  });
                  if (error) toast.error(`Não consegui limpar o horário: ${error.message}`);
                  else onMudou();
                }}
                className="-m-2 flex h-11 w-11 items-center justify-center text-slate-500 transition-colors hover:text-slate-300 sm:m-0 sm:h-auto sm:w-auto"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={remover}
            aria-label={`Excluir ${bloco.nome}`}
            className="order-4 -m-2 ml-auto flex h-11 w-11 items-center justify-center text-slate-600 transition-colors hover:text-rose-400 sm:order-none sm:m-0 sm:block sm:h-auto sm:w-auto"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className={cn('space-y-2.5 py-3 sm:space-y-2 sm:p-3', compacto && 'hidden')}>
        {adicionando ? (
          <SeletorApresentacao
            eventoId={eventoId}
            unidadeId={unidadeId}
            blocoId={bloco.id}
            onFechar={() => setAdicionando(false)}
            onAdicionado={() => {
              setAdicionando(false);
              onMudou();
            }}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-12 w-full gap-1.5 rounded-2xl border-dashed text-[14px] sm:h-9 sm:rounded-md sm:text-sm"
            onClick={() => setAdicionando(true)}
          >
            <Plus className="h-4 w-4" />
            Adicionar apresentação
          </Button>
        )}

        {/* O item arrastável é o NÚMERO, identificado pelo id do primeiro integrante: quem sobe
            junto se move junto. */}
        <SortableContext
          items={numeros.map((n) => n[0].id)}
          strategy={verticalListSortingStrategy}
        >
          {numeros.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-slate-500">
              Nenhuma apresentação neste bloco ainda.
            </p>
          ) : (
            numeros.map((numero) => {
              const h = horario?.apresentacoes.find((x) => x.id === numero[0].id);
              // Chave pelos ids dos integrantes: entrar ou sair alguém do número remonta o
              // cartão, e os campos voltam a ler o que o banco gravou.
              const chave = numero.map((a) => a.id).join('-');
              return (
                <div key={chave} className="space-y-2">
                  <CartaoNumero
                    numero={numero}
                    horario={h}
                    sugestoes={sugestoes}
                    eventoId={eventoId}
                    unidadeId={unidadeId}
                    blocoId={bloco.id}
                    onMudou={onMudou}
                  />
                </div>
              );
            })
          )}
        </SortableContext>
      </div>

    </section>
  );
}

/* ───────────────────────────── aba ───────────────────────────── */

export function GradeTab({
  evento,
  onEventoMudou,
}: {
  evento: EventoComResumo;
  /** Recarrega o evento (tempo padrão mudou) — o horário de toda a grade depende dele. */
  onEventoMudou: () => void;
}) {
  const { blocos, loading, erro, recarregar, aplicarLocal } = useGradeDoEvento(evento.id);
  const { alunos, recarregar: recarregarAlunos } = useAlunosDoEvento(evento.id, evento.unidade_id);
  const [sincronizando, setSincronizando] = useState(false);
  // Os dias que um bloco pode ocupar — um evento de uma data so devolve lista de 1 e o
  // seletor nem aparece.
  const dias = useMemo(
    () => diasDoEvento(evento.data_evento, evento.data_fim),
    [evento.data_evento, evento.data_fim],
  );
  /**
   * Dia aberto na Grade. Cada dia do recital é uma programação própria (pedido do Arthur,
   * 06/10): a aba mostra só os blocos daquele dia. Bloco sem `data` é do 1º dia.
   */
  const [diaAtivo, setDiaAtivo] = useState<string>(evento.data_evento);
  const diaDoBloco = (b: { data: string | null }) => b.data ?? evento.data_evento;
  const multiDia = dias.length > 1;
  const diaVisivel = multiDia && dias.includes(diaAtivo) ? diaAtivo : evento.data_evento;
  /**
   * Prévia do arrastar: enquanto um cartão é arrastado, a tela desenha esta cópia, em que o
   * número já entrou no bloco sobre o qual está — os outros cartões abrem espaço e o vão
   * tracejado mostra onde ele vai ficar ANTES do drop (pedido do Hugo, 09/10). `null` fora
   * do arrasto.
   */
  const [previa, setPrevia] = useState<BlocoDaGrade[] | null>(null);
  const blocosTela = previa ?? blocos;
  const blocosVisiveis = multiDia ? blocosTela.filter((b) => diaDoBloco(b) === diaVisivel) : blocosTela;

  /** Releitura manual do canal professor — o automatico ja roda ao abrir a sala. */
  const sincronizar = async () => {
    setSincronizando(true);
    const { data, error } = await sincronizarRecital(evento.id);
    setSincronizando(false);
    if (error) {
      toast.error(`Não consegui puxar do LA Teacher: ${error.message}`);
      return;
    }
    recarregar();
    recarregarAlunos();
    if (!data) return;
    const partes = [
      `${data.relatorios_lidos} relatório${data.relatorios_lidos === 1 ? '' : 's'} lido${data.relatorios_lidos === 1 ? '' : 's'}`,
      `${data.casadas} casada${data.casadas === 1 ? '' : 's'}`,
      `${data.apresentacoes_atualizadas} atualizada${data.apresentacoes_atualizadas === 1 ? '' : 's'}`,
    ];
    if (data.itens_professor > 0) partes.push(`${data.itens_professor} itens de palco`);
    toast.success('LA Teacher sincronizado', { description: partes.join(' · ') });
    if (data.nao_casadas.length > 0) {
      toast.warning(
        `${data.nao_casadas.length} relatório${data.nao_casadas.length === 1 ? '' : 's'} sem apresentação nos blocos`,
        {
          description:
            'O professor lançou para alguém que ainda não está em nenhum bloco — a Revisão lista quem.',
        },
      );
    }
  };
  // O overlay mostra bloco OU apresentação — guardar só o rótulo evita carregar duas
  // formas diferentes de objeto por um estado que só serve para desenhar.
  const [arrastando, setArrastando] = useState<{
    tipo: 'bloco' | 'apresentacao';
    rotulo: string;
    detalhe?: string | null;
  } | null>(null);

  const sensors = useSensors(
    // 8px antes de considerar arrasto: sem isso, um clique no botão de remover vira
    // arrasto de 1px e o clique se perde.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const horarios = useMemo(
    () =>
      calcularHorariosDaGrade(
        {
          data_evento: evento.data_evento,
          horario_inicio: evento.horario_inicio,
          duracao_padrao_segundos: evento.duracao_padrao_segundos,
          intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
        },
        blocosTela.map((b) => ({
          id: b.id,
          ordem: b.ordem,
          // A data do bloco decide quando o dia vira — sem ela um bloco de domingo
          // herdaria o relogio de sabado e comecaria "45 min depois" do ultimo.
          data: b.data,
          horario_inicial: b.horario_inicial,
          inicio_manual: b.inicio_manual,
          apresentacoes: b.apresentacoes.map((a) => ({
            id: a.id,
            ordem: a.ordem,
            duracao_segundos: a.duracao_segundos,
            grupo_id: a.grupo_id,
          })),
        })),
      ),
    [evento, blocosTela],
  );

  /**
   * Nomes já usados no evento inteiro, para o `datalist` do palco.
   *
   * Varre todos os blocos, não só o atual: quem digita "Violão nylon" no bloco 1 tem de
   * ver a mesma opção no bloco 3, senão a convergência de grafia só valeria dentro do
   * bloco e a consolidação voltaria a repetir o mesmo instrumento.
   */
  const sugestoesDeItem = useMemo(() => {
    const vistos = { instrumento: new Map<string, string>(), equipamento: new Map<string, string>() };
    for (const b of blocos) {
      for (const ap of b.apresentacoes) {
        for (const item of ap.itens) {
          const nome = item.nome.trim();
          if (nome !== '') vistos[item.tipo].set(chaveDoItem(nome), nome);
        }
      }
    }
    return {
      instrumento: [...vistos.instrumento.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      equipamento: [...vistos.equipamento.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  }, [blocos]);

  const totalApresentacoes = blocos.reduce((s, b) => s + b.apresentacoes.length, 0);
  const participantes = alunos.filter((a) => a.status === 'participa');
  const faltamAlocar = participantes.reduce(
    (s, a) => s + Math.max(0, a.cursos_no_recital - a.cursos_alocados),
    0,
  );

  // Estável de propósito: vai até o corpo memorizado de cada cartão (`CorpoDoNumero`); uma
  // função nova a cada render desfaria a memorização e a lentidão ao arrastar voltava.
  const aoMudarBloco = useCallback(() => {
    recarregar();
    recarregarAlunos();
  }, [recarregar, recarregarAlunos]);

  const blocoDoItem = (id: number) => blocos.find((b) => b.apresentacoes.some((a) => a.id === id));

  /** `bloco-7` -> 7. Devolve `null` quando o id é de uma apresentação (número puro). */
  const idDeBloco = (id: string | number): number | null =>
    typeof id === 'string' && id.startsWith('bloco-') ? Number(id.replace('bloco-', '')) : null;

  /**
   * Arrastar BLOCO e arrastar APRESENTAÇÃO dividem o mesmo DndContext, então o handler
   * precisa decidir qual dos dois está acontecendo — pelo prefixo do id.
   */
  const reordenarBlocos = async (activeId: number, overId: string | number) => {
    // Soltar sobre uma apresentação de outro bloco conta como soltar sobre aquele bloco:
    // com contextos aninhados o `over` costuma cair no item mais próximo, não no container.
    const alvo = idDeBloco(overId) ?? blocoDoItem(Number(overId))?.id;
    if (!alvo || alvo === activeId) return;

    const atual = blocos.map((b) => b.id);
    const de = atual.indexOf(activeId);
    const para = atual.indexOf(alvo);
    if (de < 0 || para < 0) return;

    const nova = [...atual];
    nova.splice(de, 1);
    nova.splice(para, 0, activeId);

    // Na tela já, antes do banco: a ordem nova vale também para o cálculo do horário.
    aplicarLocal((bs) =>
      nova
        .map((id, i) => {
          const b = bs.find((x) => x.id === id);
          return b ? { ...b, ordem: i + 1 } : null;
        })
        .filter((b): b is BlocoDaGrade => b !== null),
    );
    const { error } = await reordenarBlocos_rpc(evento.id, nova);
    if (error) toast.error(`Não consegui salvar a ordem dos blocos: ${error.message}`);
    recarregar();
  };

  const aoSoltar = async (e: DragEndEvent) => {
    setArrastando(null);
    const { active, over } = e;
    if (!over) {
      setPrevia(null);
      return;
    }
    // Soltar sobre si mesmo ainda pode ser fim de uma troca de bloco feita pela prévia.
    if (active.id === over.id && !previa) return;

    const blocoArrastado = idDeBloco(active.id);
    if (blocoArrastado !== null) {
      await reordenarBlocos(blocoArrastado, over.id);
      return;
    }

    // A prévia já levou o número para o bloco certo (`aoPassar`). Aqui falta só a posição
    // DENTRO do bloco onde ele caiu: o índice do alvo na lista completa = arrayMove.
    const base = previa ?? blocos;
    setPrevia(null);
    const idAtivo = Number(active.id);
    const contem = (id: number) => (b: BlocoDaGrade) => b.apresentacoes.some((a) => a.id === id);
    const atual = base.find(contem(idAtivo));
    const alvoBlocoId = idDeBloco(over.id);
    const alvo =
      alvoBlocoId !== null ? base.find((b) => b.id === alvoBlocoId) : base.find(contem(Number(over.id)));
    if (!atual || !alvo) return;
    let final = base;
    const numerosAlvo = agruparEmNumeros(alvo.apresentacoes);
    const naLista = numerosAlvo.findIndex((n) => n.some((a) => a.id === Number(over.id)));
    if (alvo.id === atual.id) {
      const de = numerosAlvo.findIndex((n) => n.some((a) => a.id === idAtivo));
      if (alvoBlocoId === null && naLista >= 0 && naLista !== de) {
        final = moverNumero(base, idAtivo, atual.id, naLista);
      }
    } else {
      // A prévia não chegou a mover (soltou rápido demais): entra antes do alvo ou no fim.
      final = moverNumero(base, idAtivo, alvo.id, naLista < 0 ? numerosAlvo.length : naLista);
    }

    // Só os blocos tocados vão ao banco, inteiros e renumerados (o RPC espera a ordem cheia).
    const antes = new Map(blocos.flatMap((b) => b.apresentacoes).map((a) => [a.id, a]));
    const tocados = new Set<number>();
    for (const a of final.flatMap((b) => b.apresentacoes)) {
      const o = antes.get(a.id);
      if (!o || o.bloco_id !== a.bloco_id || o.ordem !== a.ordem) {
        tocados.add(a.bloco_id);
        if (o) tocados.add(o.bloco_id);
      }
    }
    if (tocados.size === 0) return;
    const itens = final
      .filter((b) => tocados.has(b.id))
      .flatMap((b) => b.apresentacoes.map((a) => ({ id: a.id, bloco_id: b.id, ordem: a.ordem })));

    // Na tela já, antes do banco (ver `aplicarLocal`). Em erro, o `recarregar` devolve tudo.
    aplicarLocal(() => final);
    const { error } = await reordenarGrade(evento.id, itens);
    if (error) toast.error(`Não consegui salvar a nova ordem: ${error.message}`);
    recarregar();
  };

  /**
   * Durante o arrasto: quando o cartão passa sobre OUTRO bloco, a prévia o leva para lá —
   * em cima ou embaixo do cartão sob o mouse, conforme a metade. Dentro do mesmo bloco quem
   * abre espaço é o próprio dnd-kit; aqui não se mexe.
   */
  const aoPassar = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!previa || !over || idDeBloco(active.id) !== null || active.id === over.id) return;
    const idAtivo = Number(active.id);
    const contem = (id: number) => (b: BlocoDaGrade) => b.apresentacoes.some((a) => a.id === id);
    const atual = previa.find(contem(idAtivo));
    const alvoBlocoId = idDeBloco(over.id);
    const alvo =
      alvoBlocoId !== null ? previa.find((b) => b.id === alvoBlocoId) : previa.find(contem(Number(over.id)));
    if (!atual || !alvo || alvo.id === atual.id) return;
    const numerosAlvo = agruparEmNumeros(alvo.apresentacoes);
    let indice = numerosAlvo.length;
    if (alvoBlocoId === null) {
      const i = numerosAlvo.findIndex((n) => n.some((a) => a.id === Number(over.id)));
      const r = active.rect.current.translated;
      const abaixo = r !== null && r.top + r.height / 2 > over.rect.top + over.rect.height / 2;
      indice = i < 0 ? numerosAlvo.length : i + (abaixo ? 1 : 0);
    }
    setPrevia(moverNumero(previa, idAtivo, alvo.id, indice));
  };

  if (erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar a grade: {erro}
      </p>
    );
  }

  return (
    // pb-24 no celular: folga para o botão flutuante "Novo bloco" não cobrir o último número.
    <div className="space-y-4 pb-24 sm:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-slate-400">
          {totalApresentacoes} na grade
          {faltamAlocar > 0 && (
            <>
              {' · '}
              <span className="text-amber-400">
                {faltamAlocar} de quem participa ainda fora
              </span>
            </>
          )}
          {' · intervalo de '}
          {formatarDuracao(evento.intervalo_entre_blocos_segundos ?? 2700)} entre blocos
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <TempoPadraoApresentacao evento={evento} onSalvo={onEventoMudou} />
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1.5 sm:ml-0"
            aria-label="Sincronizar LA Teacher"
            disabled={sincronizando}
            onClick={sincronizar}
            title="Puxa música, playback e rider que os professores lançaram no LA Teacher"
          >
            <RefreshCw className={cn('h-4 w-4', sincronizando && 'animate-spin')} />
            <span className="sm:hidden">{sincronizando ? '…' : 'LA Teacher'}</span>
            <span className="hidden sm:inline">
              {sincronizando ? 'Sincronizando…' : 'Sincronizar LA Teacher'}
            </span>
          </Button>
          <Button
            size="sm"
            // Celular: flutua acima da barra inferior, na zona do polegar (TouchFlow).
            className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-30 h-14 gap-1.5 rounded-full px-5 text-[15px] shadow-lg shadow-black/40 sm:static sm:z-auto sm:h-9 sm:rounded-md sm:px-3 sm:text-sm sm:shadow-none"
            onClick={async () => {
              // `ordem` segue global (o horário é calculado sobre todos os blocos, dia a dia);
              // o nome conta só os blocos do dia aberto.
              const { error } = await criarBloco(
                evento.id,
                `Bloco ${blocosVisiveis.length + 1}`,
                Math.max(0, ...blocos.map((b) => b.ordem)) + 1,
                multiDia && diaVisivel !== evento.data_evento ? diaVisivel : null,
              );
              if (error) toast.error(`Não consegui criar o bloco: ${error.message}`);
              else recarregar();
            }}
          >
            <Plus className="h-4 w-4" />
            Novo bloco
          </Button>
        </div>
      </div>

      {/* Pedidos de toca junto pendentes — ficam em cima da grade porque cada aprovação
          muda a grade embaixo (o juntar). Sem pedido o componente some sozinho. */}
      <FilaTocaJunto eventoId={evento.id} onMudou={recarregar} />

      {multiDia && (
        <div className="flex gap-1 rounded-2xl bg-slate-900/80 p-1 sm:flex-wrap sm:gap-1.5 sm:rounded-none sm:border-b sm:border-slate-800 sm:bg-transparent sm:p-0 sm:pb-2">
          {dias.map((d, i) => {
            const doDia = blocos.filter((b) => diaDoBloco(b) === d);
            const apresentacoes = doDia.reduce((s, b) => s + b.apresentacoes.length, 0);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDiaAtivo(d)}
                className={cn(
                  'flex min-h-[48px] flex-1 flex-col items-center justify-center rounded-xl px-2 py-1 text-[13px] font-medium transition-colors sm:min-h-0 sm:flex-none sm:flex-row sm:rounded-md sm:px-3 sm:py-1.5 sm:text-[12.5px] sm:font-normal',
                  d === diaVisivel
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                )}
              >
                {i + 1}º dia · {formatarDataCurta(d)}
                <span className="text-[12px] opacity-75 sm:ml-2 sm:text-[11px]">
                  {doDia.length} {doDia.length === 1 ? 'bloco' : 'blocos'} · {apresentacoes}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading && blocos.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">Carregando grade…</p>
      ) : blocosVisiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
          <LayoutList className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-300">
            {multiDia
              ? `Nenhum bloco em ${formatarDataCurta(diaVisivel)} ainda — use “Novo bloco”.`
              : 'Nenhum bloco criado ainda.'}
          </p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Os blocos organizam a ordem do recital. O horário de cada um é calculado a partir
            do anterior.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          // Remede os alvos durante o arrasto: ao arrastar um BLOCO todos se recolhem (ver
          // `compacto`), e as medidas da hora do clique já não valeriam.
          // Só ao arrastar BLOCO: remedir tudo a cada quadro custa caro com ~250 cartões.
          measuring={{
            droppable: {
              strategy: arrastando?.tipo === 'bloco' ? MeasuringStrategy.Always : MeasuringStrategy.WhileDragging,
            },
          }}
          onDragCancel={() => {
            setArrastando(null);
            setPrevia(null);
          }}
          onDragOver={aoPassar}
          onDragStart={(e: DragStartEvent) => {
            const blocoId = idDeBloco(e.active.id);
            if (blocoId !== null) {
              setArrastando({ tipo: 'bloco', rotulo: blocos.find((b) => b.id === blocoId)?.nome ?? 'Bloco' });
              return;
            }
            setPrevia(blocos);
            const bloco = blocoDoItem(Number(e.active.id));
            const numero = bloco
              ? agruparEmNumeros(bloco.apresentacoes).find((n) =>
                  n.some((a) => a.id === Number(e.active.id)),
                )
              : undefined;
            setArrastando(
              numero
                ? {
                    tipo: 'apresentacao',
                    rotulo: numero.map((a) => a.aluno_nome).join(' + '),
                    detalhe: numero.map((a) => a.curso_nome).filter(Boolean).join(' + '),
                  }
                : null,
            );
          }}
          onDragEnd={aoSoltar}
        >
          {/* SortableContext dos BLOCOS, por fora. Sem ele o `useSortable` de cada bloco
              não registra nada e arrastar o cabeçalho não faz absolutamente nada — sem
              erro, sem aviso. Os SortableContext das apresentações ficam aninhados dentro
              de cada bloco; é o padrão multi-container do dnd-kit. */}
          <SortableContext
            items={blocosVisiveis.map((b) => `bloco-${b.id}`)}
            strategy={verticalListSortingStrategy}
          >
          <div className="space-y-3">
            {blocosVisiveis.map((b, i) => {
              const h = horarios.find((x) => x.blocoId === b.id);
              return (
                <div key={b.id} className="space-y-3">
                  {/* Separador de intervalo, como no protótipo. Só quando há folga real:
                      "INTERVALO — 0 MIN" seria uma linha que não informa nada. */}
                  {i > 0 && h && h.intervaloAntesSegundos !== null && h.intervaloAntesSegundos > 0 && (
                    <p className="text-center text-[12px] sm:text-[10.5px] uppercase tracking-wider text-slate-600">
                      intervalo — {formatarDuracao(h.intervaloAntesSegundos)}
                    </p>
                  )}
                  <CartaoBloco
                    bloco={b}
                    horario={h}
                    eventoId={evento.id}
                    unidadeId={evento.unidade_id}
                    sugestoes={sugestoesDeItem}
                    dias={dias}
                    dataEvento={evento.data_evento}
                    compacto={arrastando?.tipo === 'bloco'}
                    onMudou={aoMudarBloco}
                  />
                </div>
              );
            })}
          </div>
          </SortableContext>

          {/* Sem animação de volta ao soltar: a prévia já pôs o cartão no lugar novo, e os
              250 ms do fantasma voltando eram a "travada" depois do drop. */}
          <DragOverlay dropAnimation={null}>
            {arrastando && (
              <div className="flex items-center gap-2 rounded-lg border border-violet-500/60 bg-slate-900 px-3 py-2 shadow-2xl">
                {arrastando.tipo === 'bloco' ? (
                  <LayoutList className="h-4 w-4 text-violet-400" />
                ) : (
                  <Music className="h-4 w-4 text-violet-400" />
                )}
                <span className="text-[13px] font-medium text-white">{arrastando.rotulo}</span>
                {arrastando.detalhe && (
                  <span className="text-[12px] sm:text-[11.5px] text-slate-400">{arrastando.detalhe}</span>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
