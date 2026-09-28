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
  INTERVALO_ENTRE_APRESENTACOES_PADRAO_SEGUNDOS,
  chaveDoItem,
  consolidarItensDoPalco,
  diasDoEvento,
  divergenciasDoProfessor,
  formatarDataCurta,
  formatarDuracao,
  horaParaSegundos,
  idadeHoje,
  palcoDosNumeros,
  rotuloIdade,
  segundosParaHora,
  type BlocoComHorario,
} from '@/lib/eventos';
import {
  useGradeDoEvento,
  useAlunosDoEvento,
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
  type ApresentacaoDaGrade,
  type BlocoDaGrade,
  type EventoComResumo,
} from '@/hooks/useEventos';
import { SeletorApresentacao } from './SeletorApresentacao';
import { PalcoApresentacao } from './PalcoApresentacao';

/* ─────────────────────────── número ─────────────────────────── */

/**
 * Linha entre um número e o seguinte: a troca de palco que o horário já conta.
 *
 * Sem ela, a grade mostra 09:00 numa apresentação de 3 min e 09:08 na próxima, e quem lê não
 * sabe de onde saíram os 5 minutos (pedido do Hugo, 28/09). Não é item arrastável — fica fora
 * do `SortableContext`, só entre os cartões.
 */
function TrocaDePalco({ termina, segundos }: { termina: string | null; segundos: number }) {
  return (
    <div className="flex items-center gap-2 px-2 text-[10.5px] text-slate-500">
      <span className="h-px flex-1 bg-slate-700/60" />
      <Clock className="h-3 w-3 shrink-0 text-slate-600" />
      <span className="tabular-nums">
        {termina ? `termina ${termina} · ` : ''}
        {formatarDuracao(segundos)} de troca de palco
      </span>
      <span className="h-px flex-1 bg-slate-700/60" />
    </div>
  );
}

/** Nome, idade, curso, professor e selos de UM integrante do número. */
function LinhaIntegrante({
  apresentacao,
  emGrupo,
  onSeparar,
  onRemover,
}: {
  apresentacao: ApresentacaoDaGrade;
  emGrupo: boolean;
  onSeparar: () => void;
  onRemover: () => void;
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
            {idade && <span className="text-[11.5px] text-slate-500">{idade}</span>}
            <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10.5px] text-amber-300">
              {apresentacao.curso_nome}
            </span>
            {/* O selo mostra que o professor já lançou no LA Teacher — a divergência explica
                QUANDO o conteúdo daqui difere do dele. */}
            {apresentacao.professor?.musica_lancada_em && (
              <span
                className="rounded bg-sky-500/15 px-1.5 py-px text-[10.5px] text-sky-300"
                title="Relatório do LA Teacher lançado"
              >
                prof. lançou
              </span>
            )}
            {apresentacao.certificado_status === 'emitido' && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[10.5px] text-emerald-300">
                cert. emitido
              </span>
            )}
          </div>
          {apresentacao.professor_nome && (
            // "Prof." explícito: sem ele o nome fica solto embaixo do nome do aluno e a
            // programação impressa vira dois nomes sem papel declarado.
            <p className="text-[11.5px] text-slate-500">Prof. {apresentacao.professor_nome}</p>
          )}
        </div>

        {emGrupo && (
          <button
            type="button"
            onClick={onSeparar}
            title="Tirar deste número — passa a tocar sozinho, logo depois dele"
            className="mt-0.5 flex items-center gap-1 rounded px-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            <Unlink className="h-3.5 w-3.5" />
            separar
          </button>
        )}
        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover ${apresentacao.aluno_nome} da grade`}
          title="Remover da grade"
          className="mt-0.5 text-slate-600 transition-colors hover:text-rose-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Divergência professor x grade: cada campo que o ADM sobrescreveu depois do professor
          lançar. Informa; nunca bloqueia — o ADM pode ter razão. */}
      {divergencias.length > 0 && (
        <div className="mt-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11.5px] text-amber-200/90">
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
function CartaoNumero({
  numero,
  horario,
  sugestoes,
  eventoId,
  unidadeId,
  blocoId,
  onMudou,
}: {
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
  const emGrupo = numero.length > 1;

  // A alça move o NÚMERO inteiro: o id arrastável é o do primeiro integrante.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: principal.id,
  });
  const [musica, setMusica] = useState(principal.musica ?? '');
  const [musicaLink, setMusicaLink] = useState(principal.musica_link ?? '');
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
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border bg-slate-900/50 p-2.5',
        emGrupo ? 'border-violet-500/40' : 'border-slate-700/60',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        {/* O handle é SÓ a alça: com o listener no cartão inteiro, clicar no campo de música
            iniciaria um arrasto e o input nunca receberia foco. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Mover ${numero.map((a) => a.aluno_nome).join(' e ')}`}
          className="mt-0.5 cursor-grab touch-none text-slate-600 hover:text-slate-400 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Início e fim do número: é o que responde "quanto tempo isto ocupa" sem conta. */}
        <span
          className="mt-px shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-300"
          title={duracaoMin !== null ? `${duracaoMin} min` : undefined}
        >
          {horario ? `${horario.inicio}–${termina}` : '--:--'}
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          {emGrupo && (
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-violet-300/80">
              sobem juntos · {numero.length} alunos
            </p>
          )}

          {numero.map((ap) => (
            <LinhaIntegrante
              key={ap.id}
              apresentacao={ap}
              emGrupo={emGrupo}
              onSeparar={() => separar(ap)}
              onRemover={() => remover(ap)}
            />
          ))}

          {musicaDivergente && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11.5px] text-amber-200/90">
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
              // Salva ao sair do campo, não a cada tecla: um PATCH por caractere numa grade de
              // 270 apresentações é o tipo de coisa que derruba a tela.
              onBlur={() => {
                const valor = musica.trim();
                const mudou = numero.some((a) => (a.musica ?? '') !== valor);
                if (mudou) salvarNoNumero({ musica: valor || null });
              }}
              placeholder="Música (ex: Asa Branca)"
              className="h-7 flex-1 text-[12.5px]"
            />
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-600" />
              <Input
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
                className="h-7 w-14 text-[12.5px]"
                title="Duração em minutos (vazio = padrão do evento)"
              />
              <span className="text-[11px] text-slate-600">min</span>
            </div>

            {/* Fonte do playback: link externo abre direto; arquivo do bucket pede a URL
                assinada da edge — a policy do recital-playback não conhece o ADM. */}
            {links.map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-sky-400 transition-colors hover:bg-sky-500/10"
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
                className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11.5px] text-emerald-300 transition-colors hover:bg-emerald-500/25"
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
                onBlur={() => {
                  const valor = musicaLink.trim();
                  const mudou = numero.some((a) => (a.musica_link ?? '') !== valor);
                  if (mudou) salvarNoNumero({ musica_link: valor || null });
                }}
                placeholder="Link da música (YouTube, Spotify…)"
                className="h-6 flex-1 text-[11.5px]"
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
                  'rounded px-1.5 py-0.5 text-[11.5px]',
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
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {palcoAberto ? 'fechar palco' : palco.length > 0 ? 'editar palco' : 'palco'}
            </button>
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
                  className="flex w-full gap-1.5 rounded px-1.5 py-1 text-left text-[11.5px] text-slate-400 transition-colors hover:bg-slate-800/60"
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
                className="flex items-center gap-1.5 px-1.5 text-[11.5px] text-slate-600 transition-colors hover:text-slate-400"
              >
                <MapPin className="h-3.5 w-3.5" />
                adicionar observação / mapa de palco
              </button>
            ))}

          {/* O palco é de cada integrante — é o que cada um pede para tocar. */}
          {palcoAberto &&
            numero.map((ap) => (
              <div key={ap.id}>
                {emGrupo && (
                  <p className="mt-1 text-[11px] font-medium text-slate-400">
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
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-violet-300/80 transition-colors hover:bg-violet-500/10 hover:text-violet-200"
              title="Colocar outro aluno para tocar junto neste número"
            >
              <UserPlus className="h-3.5 w-3.5" />
              adicionar aluno a este número
            </button>
          )}
        </div>
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
  sugestoes,
  dias,
  dataEvento,
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
  onMudou: () => void;
}) {
  const [adicionando, setAdicionando] = useState(false);
  // O que sobe ao palco de uma vez. A consolidação do palco do bloco inteiro continua na aba
  // Palco e na folha impressa; aqui cada número mostra o dele (pedido do Hugo, 28/09).
  const numeros = useMemo(() => agruparEmNumeros(bloco.apresentacoes), [bloco.apresentacoes]);
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

        {/* Dia do bloco. Em recital de uma data so o selo seria a mesma data repetida —
            por isso so aparece quando ha mais de um dia para escolher. */}
        {dias.length > 1 && (
          <Select
            value={bloco.data ?? dataEvento}
            onValueChange={async (v) => {
              const { error } = await atualizarBloco(bloco.id, { data: v === dataEvento ? null : v });
              if (error) toast.error(`Não consegui salvar o dia do bloco: ${error.message}`);
              else onMudou();
            }}
          >
            <SelectTrigger
              className="h-7 w-[110px] text-[11.5px]"
              aria-label={`Dia do ${bloco.nome}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dias.map((d) => (
                <SelectItem key={d} value={d}>
                  {formatarDataCurta(d)}
                  {d === dataEvento ? ' (1º dia)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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
          {numeros.length} {numeros.length === 1 ? 'número' : 'números'}
          {numeros.length !== bloco.apresentacoes.length &&
            ` (${bloco.apresentacoes.length} apresentações)`}
          {horario && horario.duracaoSegundos > 0 && ` · ${formatarDuracao(horario.duracaoSegundos)}`}
        </span>

        {horario?.conflitaComAnterior && (
          <span className="flex items-center gap-1 text-[11.5px] text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            começa antes do bloco anterior terminar
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
            Início manual
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
              placeholder="automático"
              className="h-7 w-[112px] text-[12px]"
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
                className="text-slate-600 transition-colors hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
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
            numeros.map((numero, i) => {
              const h = horario?.apresentacoes.find((x) => x.id === numero[0].id);
              const ini = horaParaSegundos(h?.inicio);
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
                  {/* Troca de palco entre este número e o seguinte — não depois do último, onde
                      o bloco já termina e quem manda é o intervalo entre blocos. */}
                  {i < numeros.length - 1 && (
                    <TrocaDePalco
                      termina={h && ini !== null ? segundosParaHora(ini + h.duracaoSegundos) : null}
                      segundos={INTERVALO_ENTRE_APRESENTACOES_PADRAO_SEGUNDOS}
                    />
                  )}
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

export function GradeTab({ evento }: { evento: EventoComResumo }) {
  const { blocos, loading, erro, recarregar } = useGradeDoEvento(evento.id);
  const { alunos, recarregar: recarregarAlunos } = useAlunosDoEvento(evento.id, evento.unidade_id);
  const [sincronizando, setSincronizando] = useState(false);
  // Os dias que um bloco pode ocupar — um evento de uma data so devolve lista de 1 e o
  // seletor nem aparece.
  const dias = useMemo(
    () => diasDoEvento(evento.data_evento, evento.data_fim),
    [evento.data_evento, evento.data_fim],
  );

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
        `${data.nao_casadas.length} relatório${data.nao_casadas.length === 1 ? '' : 's'} sem apresentação na grade`,
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
        blocos.map((b) => ({
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
    [evento, blocos],
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

    // O alvo pode ser outro número OU o corpo de um bloco vazio.
    const alvoId = idDeBloco(over.id);
    const alvoBloco =
      alvoId !== null ? blocos.find((b) => b.id === alvoId) : blocoDoItem(Number(over.id));
    if (!alvoBloco) return;

    // O que se arrasta é o NÚMERO: quem sobe junto vai junto, senão a trava do banco recusa
    // o número partido em dois blocos. A conta é por número e só no fim vira apresentação.
    const numerosOrigem = agruparEmNumeros(origem.apresentacoes);
    const movido = numerosOrigem.find((n) => n.some((a) => a.id === Number(active.id)));
    if (!movido) return;
    const restantes = numerosOrigem.filter((n) => n !== movido);
    const destino =
      alvoBloco.id === origem.id ? restantes : agruparEmNumeros(alvoBloco.apresentacoes);

    // Soltar no corpo do bloco (id com prefixo) põe no fim; soltar sobre um número põe na
    // posição dele.
    const posicao =
      alvoId !== null
        ? destino.length
        : destino.findIndex((n) => n.some((a) => a.id === Number(over.id)));
    destino.splice(posicao < 0 ? destino.length : posicao, 0, movido);

    // Reenumera os DOIS blocos: mover para fora deixa buracos na origem, e a ordem com
    // buraco funciona até alguém inserir no meio.
    const itens = [
      ...destino.flat().map((a, i) => ({ id: a.id, bloco_id: alvoBloco.id, ordem: i + 1 })),
      ...(alvoBloco.id === origem.id
        ? []
        : restantes.flat().map((a, i) => ({ id: a.id, bloco_id: origem.id, ordem: i + 1 }))),
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
          {formatarDuracao(evento.intervalo_entre_blocos_segundos ?? 2700)} entre blocos e{' '}
          {formatarDuracao(INTERVALO_ENTRE_APRESENTACOES_PADRAO_SEGUNDOS)} entre apresentações
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={sincronizando}
            onClick={sincronizar}
            title="Puxa música, playback e rider que os professores lançaram no LA Teacher"
          >
            <RefreshCw className={cn('h-4 w-4', sincronizando && 'animate-spin')} />
            {sincronizando ? 'Sincronizando…' : 'Sincronizar LA Teacher'}
          </Button>
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
                    sugestoes={sugestoesDeItem}
                    dias={dias}
                    dataEvento={evento.data_evento}
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
