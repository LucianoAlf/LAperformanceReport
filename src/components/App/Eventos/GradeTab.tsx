import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Clock, X, AlertTriangle, LayoutList, Music } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  calcularHorariosDaGrade,
  formatarDuracao,
  type BlocoComHorario,
} from '@/lib/eventos';
import {
  useGradeDoEvento,
  useAlunosDoEvento,
  criarBloco,
  excluirBloco,
  atualizarBloco,
  removerApresentacao,
  atualizarApresentacao,
  reordenarGrade,
  reordenarBlocos as reordenarBlocos_rpc,
  type ApresentacaoDaGrade,
  type BlocoDaGrade,
  type EventoComResumo,
} from '@/hooks/useEventos';
import { SeletorApresentacao } from './SeletorApresentacao';

/* ─────────────────────────── apresentação ─────────────────────────── */

function CartaoApresentacao({
  apresentacao,
  horario,
  onRemover,
  onSalvarCampo,
}: {
  apresentacao: ApresentacaoDaGrade;
  horario: string | undefined;
  onRemover: () => void;
  onSalvarCampo: (campos: { musica?: string | null; duracao_segundos?: number | null }) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: apresentacao.id,
  });
  const [musica, setMusica] = useState(apresentacao.musica ?? '');

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border border-slate-700/60 bg-slate-900/50 p-2.5',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        {/* O handle é SÓ a alça: com o listener no cartão inteiro, clicar no campo de
            música iniciaria um arrasto e o input nunca receberia foco. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Mover ${apresentacao.aluno_nome}`}
          className="mt-0.5 cursor-grab touch-none text-slate-600 hover:text-slate-400 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className="mt-px rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-300">
          {horario ?? '--:--'}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="truncate text-[13px] font-medium text-white">
              {apresentacao.aluno_nome}
            </span>
            <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10.5px] text-amber-300">
              {apresentacao.curso_nome}
            </span>
          </div>
          {apresentacao.professor_nome && (
            <p className="text-[11.5px] text-slate-500">{apresentacao.professor_nome}</p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Input
              value={musica}
              onChange={(e) => setMusica(e.target.value)}
              // Salva ao sair do campo, não a cada tecla: um PATCH por caractere numa
              // grade de 270 apresentações é o tipo de coisa que derruba a tela.
              onBlur={() => {
                const valor = musica.trim();
                if (valor !== (apresentacao.musica ?? '')) onSalvarCampo({ musica: valor || null });
              }}
              placeholder="Música (ex: Asa Branca)"
              className="h-7 flex-1 text-[12.5px]"
            />
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-600" />
              <Input
                type="number"
                min={1}
                defaultValue={
                  apresentacao.duracao_segundos ? Math.round(apresentacao.duracao_segundos / 60) : ''
                }
                onBlur={(e) => {
                  const min = Number(e.target.value);
                  // Campo vazio volta para a duração padrão do evento (null), em vez de
                  // gravar zero e sumir com a apresentação do cálculo.
                  onSalvarCampo({ duracao_segundos: min > 0 ? min * 60 : null });
                }}
                placeholder="5"
                className="h-7 w-14 text-[12.5px]"
                title="Duração em minutos (vazio = padrão do evento)"
              />
              <span className="text-[11px] text-slate-600">min</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover ${apresentacao.aluno_nome} da grade`}
          className="mt-0.5 text-slate-600 transition-colors hover:text-rose-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── bloco ───────────────────────────── */

function CartaoBloco({
  bloco,
  horario,
  eventoId,
  unidadeId,
  onMudou,
}: {
  bloco: BlocoDaGrade;
  horario: BlocoComHorario | undefined;
  eventoId: number;
  unidadeId: string;
  onMudou: () => void;
}) {
  const [adicionando, setAdicionando] = useState(false);
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
        ? `Excluir "${bloco.nome}"? As ${n} apresentações dele saem da grade junto.`
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
        'rounded-xl border bg-slate-800/40 transition-colors',
        isOver && !isDragging ? 'border-violet-500' : 'border-slate-700',
        isDragging && 'opacity-40',
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-700/60 px-3 py-2.5">
        {/* A alça move o BLOCO inteiro. Precisa ser só a alça: com os listeners no
            cabeçalho, clicar no campo de hora ou no botão de excluir viraria arrasto. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Mover ${bloco.nome}`}
          title="Arraste para trocar a ordem dos blocos"
          className="cursor-grab touch-none text-slate-600 hover:text-slate-400 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h3 className="text-[14px] font-semibold text-white">{bloco.nome}</h3>

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

        <span className="text-[12px] text-slate-400">
          {bloco.apresentacoes.length}{' '}
          {bloco.apresentacoes.length === 1 ? 'apresentação' : 'apresentações'}
          {horario && horario.duracaoSegundos > 0 && ` · ${formatarDuracao(horario.duracaoSegundos)}`}
        </span>

        {horario?.conflitaComAnterior && (
          <span className="flex items-center gap-1 text-[11.5px] text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            começa antes do bloco anterior terminar
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
            Início manual
            <Input
              type="time"
              defaultValue={bloco.horario_inicial?.slice(0, 5) ?? ''}
              onBlur={async (e) => {
                const valor = e.target.value;
                // Apagar o campo devolve o bloco ao encadeamento automático — é o jeito de
                // desfazer um horário digitado sem precisar de um segundo controle.
                const { error } = await atualizarBloco(bloco.id, {
                  horario_inicial: valor || null,
                  inicio_manual: Boolean(valor),
                });
                if (error) toast.error(`Não consegui salvar o horário: ${error.message}`);
                else onMudou();
              }}
              className="h-7 w-[104px] text-[12px]"
            />
          </label>
          <button
            type="button"
            onClick={remover}
            aria-label={`Excluir ${bloco.nome}`}
            className="text-slate-600 transition-colors hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="space-y-2 p-3">
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
            className="w-full gap-1.5 border-dashed"
            onClick={() => setAdicionando(true)}
          >
            <Plus className="h-4 w-4" />
            Adicionar apresentação
          </Button>
        )}

        <SortableContext
          items={bloco.apresentacoes.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {bloco.apresentacoes.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-slate-500">
              Nenhuma apresentação neste bloco ainda.
            </p>
          ) : (
            bloco.apresentacoes.map((ap) => (
              <CartaoApresentacao
                key={ap.id}
                apresentacao={ap}
                horario={horario?.apresentacoes.find((h) => h.id === ap.id)?.inicio}
                onRemover={async () => {
                  const { error } = await removerApresentacao(ap.id);
                  if (error) toast.error(`Não consegui remover: ${error.message}`);
                  else onMudou();
                }}
                onSalvarCampo={async (campos) => {
                  const { error } = await atualizarApresentacao(ap.id, campos);
                  if (error) toast.error(`Não consegui salvar: ${error.message}`);
                  else onMudou();
                }}
              />
            ))
          )}
        </SortableContext>
      </div>
    </section>
  );
}

/* ───────────────────────────── aba ───────────────────────────── */

export function GradeTab({ evento }: { evento: EventoComResumo }) {
  const { blocos, loading, erro, recarregar } = useGradeDoEvento(evento.id);
  const { alunos, recarregar: recarregarAlunos } = useAlunosDoEvento(evento.id, evento.unidade_id);
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
          horario_inicio: evento.horario_inicio,
          duracao_padrao_segundos: evento.duracao_padrao_segundos,
          intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
        },
        blocos.map((b) => ({
          id: b.id,
          ordem: b.ordem,
          horario_inicial: b.horario_inicial,
          inicio_manual: b.inicio_manual,
          apresentacoes: b.apresentacoes.map((a) => ({
            id: a.id,
            ordem: a.ordem,
            duracao_segundos: a.duracao_segundos,
          })),
        })),
      ),
    [evento, blocos],
  );

  const totalApresentacoes = blocos.reduce((s, b) => s + b.apresentacoes.length, 0);
  const participantes = alunos.filter((a) => a.status === 'participa');
  const faltamAlocar = participantes.reduce(
    (s, a) => s + Math.max(0, a.cursos_no_recital - a.cursos_alocados),
    0,
  );

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

    const { error } = await reordenarBlocos_rpc(evento.id, nova);
    if (error) toast.error(`Não consegui salvar a ordem dos blocos: ${error.message}`);
    recarregar();
  };

  const aoSoltar = async (e: DragEndEvent) => {
    setArrastando(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const blocoArrastado = idDeBloco(active.id);
    if (blocoArrastado !== null) {
      await reordenarBlocos(blocoArrastado, over.id);
      return;
    }

    const origem = blocoDoItem(Number(active.id));
    if (!origem) return;

    // O alvo pode ser outra apresentação OU o corpo de um bloco vazio.
    const alvoId = idDeBloco(over.id);
    const alvoBloco =
      alvoId !== null ? blocos.find((b) => b.id === alvoId) : blocoDoItem(Number(over.id));
    if (!alvoBloco) return;

    const movido = origem.apresentacoes.find((a) => a.id === Number(active.id))!;
    const restantes = origem.apresentacoes.filter((a) => a.id !== movido.id);
    const destino =
      alvoBloco.id === origem.id ? restantes : alvoBloco.apresentacoes.filter((a) => a.id !== movido.id);

    // Soltar no corpo do bloco (id com prefixo) põe no fim; soltar sobre uma apresentação
    // põe na posição dela.
    const posicao =
      alvoId !== null ? destino.length : destino.findIndex((a) => a.id === Number(over.id));
    destino.splice(posicao < 0 ? destino.length : posicao, 0, movido);

    // Reenumera os DOIS blocos: mover para fora deixa buracos na origem, e a ordem com
    // buraco funciona até alguém inserir no meio.
    const itens = [
      ...destino.map((a, i) => ({ id: a.id, bloco_id: alvoBloco.id, ordem: i + 1 })),
      ...(alvoBloco.id === origem.id
        ? []
        : restantes.map((a, i) => ({ id: a.id, bloco_id: origem.id, ordem: i + 1 }))),
    ];

    const { error } = await reordenarGrade(evento.id, itens);
    if (error) toast.error(`Não consegui salvar a nova ordem: ${error.message}`);
    recarregar();
  };

  if (erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar a grade: {erro}
      </p>
    );
  }

  return (
    <div className="space-y-4">
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
        <Button
          size="sm"
          className="gap-1.5"
          onClick={async () => {
            const { error } = await criarBloco(
              evento.id,
              `Bloco ${blocos.length + 1}`,
              blocos.length + 1,
            );
            if (error) toast.error(`Não consegui criar o bloco: ${error.message}`);
            else recarregar();
          }}
        >
          <Plus className="h-4 w-4" />
          Novo bloco
        </Button>
      </div>

      {loading && blocos.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">Carregando grade…</p>
      ) : blocos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
          <LayoutList className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-300">Nenhum bloco criado ainda.</p>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Os blocos organizam a ordem do recital. O horário de cada um é calculado a partir
            do anterior.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e: DragStartEvent) => {
            const blocoId = idDeBloco(e.active.id);
            if (blocoId !== null) {
              setArrastando({ tipo: 'bloco', rotulo: blocos.find((b) => b.id === blocoId)?.nome ?? 'Bloco' });
              return;
            }
            const ap = blocoDoItem(Number(e.active.id))?.apresentacoes.find(
              (a) => a.id === Number(e.active.id),
            );
            setArrastando(
              ap ? { tipo: 'apresentacao', rotulo: ap.aluno_nome, detalhe: ap.curso_nome } : null,
            );
          }}
          onDragEnd={aoSoltar}
        >
          {/* SortableContext dos BLOCOS, por fora. Sem ele o `useSortable` de cada bloco
              não registra nada e arrastar o cabeçalho não faz absolutamente nada — sem
              erro, sem aviso. Os SortableContext das apresentações ficam aninhados dentro
              de cada bloco; é o padrão multi-container do dnd-kit. */}
          <SortableContext
            items={blocos.map((b) => `bloco-${b.id}`)}
            strategy={verticalListSortingStrategy}
          >
          <div className="space-y-3">
            {blocos.map((b, i) => {
              const h = horarios.find((x) => x.blocoId === b.id);
              return (
                <div key={b.id} className="space-y-3">
                  {/* Separador de intervalo, como no protótipo. Só quando há folga real:
                      "INTERVALO — 0 MIN" seria uma linha que não informa nada. */}
                  {i > 0 && h && h.intervaloAntesSegundos !== null && h.intervaloAntesSegundos > 0 && (
                    <p className="text-center text-[10.5px] uppercase tracking-wider text-slate-600">
                      intervalo — {formatarDuracao(h.intervaloAntesSegundos)}
                    </p>
                  )}
                  <CartaoBloco
                    bloco={b}
                    horario={h}
                    eventoId={evento.id}
                    unidadeId={evento.unidade_id}
                    onMudou={() => {
                      recarregar();
                      recarregarAlunos();
                    }}
                  />
                </div>
              );
            })}
          </div>
          </SortableContext>

          <DragOverlay>
            {arrastando && (
              <div className="flex items-center gap-2 rounded-lg border border-violet-500/60 bg-slate-900 px-3 py-2 shadow-2xl">
                {arrastando.tipo === 'bloco' ? (
                  <LayoutList className="h-4 w-4 text-violet-400" />
                ) : (
                  <Music className="h-4 w-4 text-violet-400" />
                )}
                <span className="text-[13px] font-medium text-white">{arrastando.rotulo}</span>
                {arrastando.detalhe && (
                  <span className="text-[11.5px] text-slate-400">{arrastando.detalhe}</span>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
