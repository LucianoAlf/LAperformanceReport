import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, Users, Check, HelpCircle, X, Music, AlertTriangle, Guitar, LayoutList, UserPlus, Trash2, GraduationCap, FileCheck } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { KPICard } from '@/components/ui/KPICard';
import { cn } from '@/lib/utils';
import { normalizarBusca } from '@/lib/agenda';
import { avaliarElegibilidade, resumirParticipacao, resumirAlocacao } from '@/lib/eventos';
import {
  useAlunosDoEvento,
  definirParticipacao,
  definirConvidados,
  useConvidadosDoEvento,
  type ConvidadoDaPorta,
  definirParticipacaoEmLote,
  definirFormando,
  removerAlunoDeOutraUnidade,
  type AlocacaoDoCurso,
  type AlunoElegivel,
  type ParticipacaoStatus,
} from '@/hooks/useEventos';
import { ModalAlunoOutraUnidade } from './ModalAlunoOutraUnidade';
import { ModalConvidadosDoAluno } from './ModalConvidadosDoAluno';
import { PainelAlunos, type CursoNoPainel } from './PainelDoRecital';

type FiltroStatus = 'todos' | ParticipacaoStatus;

const FILTROS: { id: FiltroStatus; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'indefinido', label: 'Indefinidos' },
  { id: 'participa', label: 'Participam' },
  { id: 'nao', label: 'Não participam' },
];

/**
 * Tri-state: as tres opcoes sempre a vista, a escolhida preenchida.
 *
 * ⚠️ "Indefinido" e um estado LEGITIMO, nao a ausencia de resposta — e por isso tem botao
 * proprio em vez de ser o "nenhum selecionado". A coordenacao precisa distinguir "ainda
 * nao perguntei" de "perguntei e ele nao vai", que e a diferenca entre ligar e nao ligar.
 */
function SeletorParticipacao({
  valor,
  desabilitado,
  onEscolher,
}: {
  valor: ParticipacaoStatus;
  desabilitado: boolean;
  onEscolher: (s: ParticipacaoStatus) => void;
}) {
  const opcoes: { id: ParticipacaoStatus; icone: typeof Check; titulo: string; ativo: string }[] = [
    { id: 'participa', icone: Check, titulo: 'Participa', ativo: 'bg-emerald-500 text-white' },
    { id: 'indefinido', icone: HelpCircle, titulo: 'Indefinido', ativo: 'bg-amber-500 text-white' },
    { id: 'nao', icone: X, titulo: 'Não participa', ativo: 'bg-rose-500 text-white' },
  ];

  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-700">
      {opcoes.map((o) => {
        const Icone = o.icone;
        const selecionado = valor === o.id;
        return (
          <button
            key={o.id}
            type="button"
            title={o.titulo}
            aria-label={o.titulo}
            aria-pressed={selecionado}
            disabled={desabilitado && o.id === 'participa'}
            onClick={() => onEscolher(o.id)}
            className={cn(
              'flex h-11 w-12 items-center justify-center transition-colors sm:h-8 sm:w-9',
              selecionado ? o.ativo : 'text-slate-500 hover:bg-slate-700/60 hover:text-slate-300',
              desabilitado && o.id === 'participa' && 'cursor-not-allowed opacity-30 hover:bg-transparent',
            )}
          >
            <Icone className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

/** Selo de bloco de UM curso. `null` quando aquele curso ainda nao entrou na grade. */
function SeloBloco({ alocacao }: { alocacao: AlocacaoDoCurso | undefined }) {
  if (!alocacao) {
    return <span className="text-[12px] sm:text-[11px] text-slate-600">· não alocado</span>;
  }
  return (
    <span
      className="rounded bg-violet-500/15 px-1.5 py-px text-[12px] sm:text-[10.5px] font-medium text-violet-300"
      title={alocacao.horario_inicial ? `Início ${alocacao.horario_inicial.slice(0, 5)}` : undefined}
    >
      {alocacao.bloco_nome}
      {alocacao.horario_inicial && ` · ${alocacao.horario_inicial.slice(0, 5)}`}
    </span>
  );
}

/** Rótulo do selo de formando: o tipo diz PARA ONDE a pessoa passa. */
const FORMATURA_ROTULO: Record<string, string> = {
  kids: 'Kids → School',
  bebes: 'Bebês → Preparatória',
  la: 'formando',
};

function LinhaAluno({
  aluno,
  nomeados,
  onEscolher,
  onNomes,
  onFormando,
  onRemover,
}: {
  aluno: AlunoElegivel;
  /** Quantos convidados desta pessoa já têm nome (cortesia + vendido). */
  nomeados: number;
  onEscolher: (s: ParticipacaoStatus) => void;
  /** Abre a janela de convidados (quantos leva + nomes). */
  onNomes: () => void;
  /** Marca/desmarca formando à mão ('manual' prevalece sobre a rotina). */
  onFormando: () => void;
  /** So para aluno de outra unidade: tira do evento (participacao + apresentacoes). */
  onRemover?: () => void;
}) {
  const avaliacao = avaliarElegibilidade(aluno);
  const alocacao = resumirAlocacao(aluno.cursos_no_recital, aluno.cursos_alocados);
  const alocacaoPorCurso = new Map(aluno.alocacoes.map((a) => [a.curso_id, a]));

  return (
    <div
      className={cn(
        // Celular: nome e cursos ocupam a linha inteira; bloco, convidados e o tri-state
        // descem para a linha de baixo — lado a lado, o nome ficava com 0px.
        'group flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-800 px-3 py-3 last:border-b-0 sm:flex-nowrap sm:py-2.5',
        aluno.status === 'participa' && 'bg-emerald-500/[0.04]',
        aluno.status === 'nao' && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1 basis-full sm:basis-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium text-white sm:truncate sm:text-[13.5px]">{aluno.nome}</span>
          {aluno.idade_anos != null && (
            <span className="text-[12px] sm:text-[11.5px] text-slate-500">{aluno.idade_anos} anos</span>
          )}
          {aluno.unidade_origem_nome && (
            <span
              className="rounded bg-sky-500/15 px-1.5 py-px text-[12px] sm:text-[10.5px] font-medium text-sky-300"
              title="Aluno de outra unidade que se apresenta neste evento"
            >
              de {aluno.unidade_origem_nome}
            </span>
          )}
          {aluno.faz_banda && (
            <Badge variant="outline" className="gap-1 text-[12px] sm:text-[10px]">
              <Guitar className="h-2.5 w-2.5" />
              banda
            </Badge>
          )}
          {/* Selo de formando: clicável porque a coordenação pode marcar/desmarcar à
              mão — 'manual' prevalece e a rotina do LA Teacher não sobrescreve. */}
          <button
            type="button"
            onClick={onFormando}
            title={
              aluno.formatura_tipo
                ? `Formando (${aluno.formatura_origem === 'manual' ? 'marcado à mão' : 'marcado pela regra'}) — clique para desmarcar`
                : 'Marcar como formando (passa de ciclo este ano)'
            }
            className={cn(
              // Celular: área de toque de 44px por pseudo-elemento — a pílula continua do mesmo tamanho.
              `relative flex items-center gap-1 rounded px-1.5 py-px text-[12px] font-medium transition-colors after:absolute after:inset-x-0 after:-inset-y-3 after:content-[''] sm:text-[10.5px] sm:after:hidden`,
              aluno.formatura_tipo
                ? 'bg-violet-500/15 text-violet-300 hover:bg-violet-500/25'
                : // Marcacao manual e excecao — o botao fantasma so aparece no hover da
                  // linha, senao seria um controle morto em 270 alunos.
                  // No celular não existe hover: o botão invisível seria um toque fantasma.
                  'hidden text-slate-600 opacity-0 hover:bg-slate-800 hover:text-slate-400 group-hover:opacity-100 sm:flex',
            )}
          >
            <GraduationCap className="h-3 w-3" />
            {aluno.formatura_tipo ? `formando · ${FORMATURA_ROTULO[aluno.formatura_tipo] ?? ''}` : ''}
          </button>
          {/* O professor ja mexeu no relatorio do LA Teacher e a pessoa nao tem
              apresentacao: e a fila que a coordenacao precisa zerar primeiro — alocar
              aqui e o que traz musica, palco e playback pra dentro da grade. A cor
              escala com a urgencia: aprovado (vermelho) > enviado (ambar) > musica
              lancada (amarelo). */}
          {aluno.relatorio_falta_alocar && (
            <span
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-px text-[12px] sm:text-[10.5px] font-medium',
                aluno.relatorio_falta_alocar === 'aprovado' && 'bg-rose-500/15 text-rose-300',
                aluno.relatorio_falta_alocar === 'enviado' && 'bg-amber-500/15 text-amber-300',
                aluno.relatorio_falta_alocar === 'musica' && 'bg-yellow-500/15 text-yellow-300',
              )}
              title={
                aluno.relatorio_falta_alocar === 'aprovado'
                  ? 'Relatório já APROVADO pelo revisor — só falta alocar num bloco'
                  : aluno.relatorio_falta_alocar === 'enviado'
                    ? 'Relatório enviado pelo professor, aguardando revisão — falta alocar num bloco'
                    : 'O professor já lançou a música no LA Teacher — falta alocar num bloco'
              }
            >
              <FileCheck className="h-3 w-3" />
              {aluno.relatorio_falta_alocar === 'aprovado'
                ? 'aprovado · falta alocar'
                : aluno.relatorio_falta_alocar === 'enviado'
                  ? 'enviado · falta alocar'
                  : 'música lançada · falta alocar'}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] sm:text-[11.5px] text-slate-400">
          {aluno.cursos.map((c) => (
            <span key={c.curso_id} className="flex items-center gap-1">
              <Music className="h-3 w-3 text-slate-600" />
              {c.curso_nome}
              {c.professor_nome && <span className="text-slate-600">· {c.professor_nome}</span>}
              {/* Selo por curso so quando ALGUMA apresentacao ja existe: enquanto a grade
                  esta vazia, um "nao alocado" em cada curso e ruido em 100% das linhas. */}
              {alocacao.detalharPorCurso && <SeloBloco alocacao={alocacaoPorCurso.get(c.curso_id)} />}
            </span>
          ))}
          {avaliacao.aviso && (
            <span
              className={cn(
                'flex items-center gap-1',
                avaliacao.situacao === 'cadastro_incompleto' ? 'text-amber-400' : 'text-slate-500',
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {avaliacao.aviso}
            </span>
          )}
        </div>
      </div>

      {aluno.cursos_no_recital > 1 && (
        <span
          className="shrink-0 rounded bg-slate-700/70 px-1.5 py-0.5 text-[12px] sm:text-[10.5px] font-medium tabular-nums text-slate-300"
          title={`${aluno.cursos_no_recital} cursos = ${aluno.cursos_no_recital} apresentações`}
        >
          {aluno.cursos_no_recital}×
        </span>
      )}

      {/* Coluna "Bloco / Horário" do prototipo. Estado unico (`situacao`), nunca condicoes
          soltas: com twMerge a ultima classe conflitante vence, e cartao pintado por flags
          independentes ja contradisse o proprio rotulo no modulo Agenda. */}
      <div className="mr-auto min-w-0 sm:mr-0 sm:w-[116px] sm:shrink-0 sm:text-right">
        {alocacao.situacao === 'completa' && aluno.cursos_no_recital === 1 ? (
          <SeloBloco alocacao={aluno.alocacoes[0]} />
        ) : alocacao.rotulo ? (
          <span
            className={cn(
              'text-[12px] sm:text-[11.5px]',
              alocacao.situacao === 'completa' && 'text-violet-300',
              alocacao.situacao === 'parcial' && 'text-amber-400',
              alocacao.situacao === 'nenhuma' && 'text-slate-600',
            )}
          >
            {alocacao.rotulo}
          </span>
        ) : null}
      </div>

      {/* Convidados: um controle só (pedido do Hugo, 09/10) — quantos a família leva e quem
          são ficam juntos na janela. Só aparece para quem vai: nos demais seria ruído. */}
      {aluno.status === 'participa' && (
        <button
          type="button"
          onClick={onNomes}
          title="Quantos convidados a família leva e quem são (para o check-in da porta)"
          aria-label={`Convidados de ${aluno.nome}`}
          className={cn(
            'flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] tabular-nums transition-colors sm:h-7 sm:text-[11.5px]',
            aluno.convidados > 0
              ? 'border-slate-600 bg-slate-800/60 text-slate-200 hover:border-amber-500/50 hover:text-white'
              : 'border-dashed border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300',
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {aluno.convidados > 0 ? (
            <>
              <span>Convidados: {aluno.convidados}</span>
              <span
                className={cn(
                  nomeados >= aluno.convidados ? 'text-emerald-400' : 'text-amber-400',
                )}
              >
                · {nomeados >= aluno.convidados ? 'todos com nome' : `${nomeados} com nome`}
              </span>
            </>
          ) : (
            <span>Convidados</span>
          )}
        </button>
      )}

      <SeletorParticipacao
        valor={aluno.status}
        desabilitado={!avaliacao.podeParticipar}
        onEscolher={onEscolher}
      />

      {onRemover && (
        <button
          type="button"
          onClick={onRemover}
          title="Tirar do evento (aluno de outra unidade)"
          aria-label={`Tirar ${aluno.nome} do evento`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-300 sm:h-8 sm:w-8"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function AlunosTab({ eventoId, unidadeId, pedidoFaltaAlocar }: {
  eventoId: number;
  unidadeId: string;
  /** Sobe a cada clique no quadro do topo: abre a aba ja com o filtro "falta alocar". */
  pedidoFaltaAlocar?: number;
}) {
  const { alunos, loading, erro, recarregar } = useAlunosDoEvento(eventoId, unidadeId);
  // Convidados pelo nome, agrupados por PESSOA (irmãos dividem o mesmo convidado).
  const { convidados, recarregar: recarregarConvidados } = useConvidadosDoEvento(eventoId);
  const convidadosPorPessoa = useMemo(() => {
    const mapa = new Map<string, ConvidadoDaPorta[]>();
    for (const c of convidados) {
      for (const chave of c.pessoas) mapa.set(chave, [...(mapa.get(chave) ?? []), c]);
    }
    return mapa;
  }, [convidados]);
  const [convidadosDe, setConvidadosDe] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroStatus>('todos');
  const [filtroProfessor, setFiltroProfessor] = useState('todos');
  const [filtroCurso, setFiltroCurso] = useState('todos');
  const [soSemAlocar, setSoSemAlocar] = useState(false);
  const [soRelatorioPronto, setSoRelatorioPronto] = useState(false);

  // O quadro do topo manda um "tick": cada clique religa o filtro — mesmo se a
  // pessoa ja tiver desligado, o proximo clique precisa reaplicar.
  useEffect(() => {
    if (pedidoFaltaAlocar) setSoRelatorioPronto(true);
  }, [pedidoFaltaAlocar]);
  const [gravando, setGravando] = useState<string | null>(null);
  const [modalOutraUnidade, setModalOutraUnidade] = useState(false);
  // Alvos congelados no clique: o modal promete N pessoas e a confirmacao grava
  // exatamente essas N — recomputar no confirmar poderia mudar a conta por baixo da frase.
  const [lotePendente, setLotePendente] = useState<AlunoElegivel[] | null>(null);

  const resumo = useMemo(() => resumirParticipacao(alunos), [alunos]);
  // Ranking por curso de quem confirmou: previstas × já nos blocos (painel "Por curso").
  const porCurso = useMemo<CursoNoPainel[]>(() => {
    const mapa = new Map<string, CursoNoPainel>();
    for (const a of alunos) {
      if (a.status !== 'participa') continue;
      const alocados = new Set(a.alocacoes.map((x) => x.curso_id));
      for (const c of a.cursos) {
        const chave = String(c.curso_id);
        const atual = mapa.get(chave) ?? { cursoId: chave, curso: c.curso_nome ?? 'Curso', previstas: 0, nosBlocos: 0 };
        atual.previstas += 1;
        if (alocados.has(c.curso_id)) atual.nosBlocos += 1;
        mapa.set(chave, atual);
      }
    }
    return [...mapa.values()];
  }, [alunos]);
  // O botao so aparece quando existe alguem no estado — um filtro que nunca filtra
  // nada e controle morto na barra.
  const temRelatorioPronto = useMemo(() => alunos.some((a) => a.relatorio_falta_alocar), [alunos]);

  // Opcoes dos filtros saem da PROPRIA lista: um professor sem aluno elegivel no recital
  // nao pode ter aluno para filtrar, entao oferece-lo seria um caminho para o vazio.
  const { professores, cursos } = useMemo(() => {
    const profs = new Map<string, string>();
    const crs = new Map<string, string>();
    for (const a of alunos) {
      for (const c of a.cursos) {
        if (c.curso_nome) crs.set(String(c.curso_id), c.curso_nome);
        if (c.professor_id !== null && c.professor_nome) {
          profs.set(String(c.professor_id), c.professor_nome);
        }
      }
    }
    const porNome = (x: [string, string], y: [string, string]) => x[1].localeCompare(y[1], 'pt-BR');
    return {
      professores: [...profs.entries()].sort(porNome),
      cursos: [...crs.entries()].sort(porNome),
    };
  }, [alunos]);

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return alunos.filter((a) => {
      if (filtro !== 'todos' && a.status !== filtro) return false;
      // Professor e curso filtram por CURSO da pessoa: quem faz dois cursos continua na
      // lista quando um dos dois casa — esconder o outro e trabalho do olho, nao do filtro.
      if (filtroProfessor !== 'todos' && !a.cursos.some((c) => String(c.professor_id) === filtroProfessor)) {
        return false;
      }
      if (filtroCurso !== 'todos' && !a.cursos.some((c) => String(c.curso_id) === filtroCurso)) {
        return false;
      }
      // Eixo SEPARADO do status — participacao e alocacao sao perguntas diferentes, e
      // juntar as duas num radio so faria "Participam" e "Sem alocar" se excluirem.
      // Quem nao tem curso nenhum nao entra: ele nao esta esperando ser alocado.
      if (soSemAlocar && (a.cursos_alocados >= a.cursos_no_recital || a.cursos_no_recital === 0)) {
        return false;
      }
      if (soRelatorioPronto && !a.relatorio_falta_alocar) return false;
      if (!termo) return true;
      const alvo = normalizarBusca(
        `${a.nome} ${a.cursos.map((c) => `${c.curso_nome} ${c.professor_nome ?? ''}`).join(' ')}`,
      );
      return alvo.includes(termo);
    });
  }, [alunos, busca, filtro, filtroProfessor, filtroCurso, soSemAlocar, soRelatorioPronto]);

  const escolher = async (aluno: AlunoElegivel, status: ParticipacaoStatus) => {
    setGravando(aluno.pessoa_chave);
    const { error } = await definirParticipacao(eventoId, aluno.aluno_id_referencia, status);
    setGravando(null);
    // Erro de escrita nunca some em silencio: sem isto o clique parece ter funcionado
    // e a decisao da coordenacao se perde entre um recarregamento e outro.
    if (error) toast.error(`Não consegui gravar ${aluno.nome}: ${error.message}`);
    else recarregar();
  };

  // Convidados e por PESSOA, nao por curso: a cadeira do teatro nao sabe em quantas
  // apresentacoes a familia vai se dividir.
  const salvarConvidados = async (aluno: AlunoElegivel, n: number) => {
    const { error } = await definirConvidados(eventoId, aluno.aluno_id_referencia, n);
    if (error) toast.error(`Não consegui gravar os convidados de ${aluno.nome}: ${error.message}`);
    else recarregar();
  };

  // Formando: o selo vem da regra do LA Teacher (idade no ano + curso); o clique é o
  // override da coordenação — grava 'manual' e a rotina automática não sobrescreve.
  const alternarFormando = async (aluno: AlunoElegivel) => {
    if (aluno.formatura_tipo) {
      if (!window.confirm(`Tirar o selo de formando de ${aluno.nome}? A rotina não vai marcá-lo de novo.`)) return;
      const { error } = await definirFormando(eventoId, aluno.pessoa_chave, aluno.aluno_id_referencia, null);
      if (error) toast.error(`Não consegui desmarcar: ${error.message}`);
      else recarregar();
      return;
    }
    const tipo = window.prompt(
      `Marcar ${aluno.nome} como formando. Qual passagem?\n` +
        'kids — fez 12 anos no ano (Kids → LA Music School)\n' +
        'bebes — fez 2 anos e está em Musicalização para Bebês (→ Preparatória)',
      'kids',
    );
    if (tipo === null) return;
    const normalizado = tipo.trim().toLowerCase();
    if (normalizado !== 'kids' && normalizado !== 'bebes') {
      toast.error('Tipo inválido — use "kids" ou "bebes".');
      return;
    }
    const { error } = await definirFormando(
      eventoId, aluno.pessoa_chave, aluno.aluno_id_referencia, normalizado,
    );
    if (error) toast.error(`Não consegui marcar: ${error.message}`);
    else recarregar();
  };

  // Visitante sai por inteiro (apresentacoes + participacao): marcar "nao participa"
  // deixaria na lista da unidade alguem que nem estuda nela.
  const removerVisitante = async (aluno: AlunoElegivel) => {
    if (!window.confirm(`Tirar ${aluno.nome} (${aluno.unidade_origem_nome}) deste evento? As apresentações dele nos blocos também saem.`)) {
      return;
    }
    setGravando(aluno.pessoa_chave);
    const { error } = await removerAlunoDeOutraUnidade(eventoId, aluno.pessoa_chave);
    setGravando(null);
    if (error) toast.error(`Não consegui tirar ${aluno.nome}: ${error.message}`);
    else {
      toast.success(`${aluno.nome} saiu do evento`);
      recarregar();
    }
  };

  // Lote respeita o que esta FILTRADO na tela, nao a base inteira: marcar 400 pessoas
  // quando a coordenacao olhava para 12 e o tipo de surpresa que nao se desfaz num clique.
  // Por isso o clique abre confirmacao em vez de gravar — e a gravacao devolve um Desfazer.
  const marcarLote = async (status: ParticipacaoStatus, alvos: AlunoElegivel[]) => {
    // Foto do estado anterior de cada alvo: o Desfazer devolve cada um ao status que
    // tinha, nao a um generico — quem ja era 'nao' nao pode voltar como 'indefinido'.
    const antes = new Map(alvos.map((a) => [a.aluno_id_referencia, a.status] as const));
    setGravando('__lote__');
    const { error } = await definirParticipacaoEmLote(
      eventoId,
      alvos.map((a) => a.aluno_id_referencia),
      status,
    );
    setGravando(null);
    if (error) {
      toast.error(`Não consegui gravar o lote: ${error.message}`);
      return;
    }
    recarregar();
    toast.success(`${alvos.length} ${alvos.length === 1 ? 'aluno atualizado' : 'alunos atualizados'}`, {
      // 15s: a janela do Desfazer e o tempo do toast. Depois disso a reversao continua
      // possivel pelo log de auditoria, nao por este botao.
      duration: 15000,
      action: { label: 'Desfazer', onClick: () => desfazerLote(antes) },
    });
  };

  const desfazerLote = async (antes: Map<number, ParticipacaoStatus>) => {
    // Um upsert por status anterior (tres no maximo), em vez de um por aluno — 400
    // restauracoes individuais travariam a aba por minutos.
    const grupos = new Map<ParticipacaoStatus, number[]>();
    for (const [alunoId, status] of antes) {
      const g = grupos.get(status) ?? [];
      g.push(alunoId);
      grupos.set(status, g);
    }
    setGravando('__lote__');
    let falha: string | null = null;
    for (const [status, ids] of grupos) {
      const { error } = await definirParticipacaoEmLote(eventoId, ids, status);
      if (error) falha = error.message;
    }
    setGravando(null);
    if (falha) {
      toast.error(`Não consegui desfazer tudo: ${falha}. Confira a lista antes de seguir.`);
    } else {
      toast.success('Marcação em lote desfeita.');
      recarregar();
    }
  };

  if (erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar os alunos: {erro}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Celular: os 5 indicadores numa faixa compacta — em cartões eles ocupavam a
          primeira tela inteira antes de a lista começar. */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 sm:hidden">
        {[
          { rotulo: 'elegíveis', valor: resumo.total, cor: 'text-white' },
          { rotulo: 'participam', valor: resumo.participam, cor: 'text-emerald-300' },
          { rotulo: 'indefinidos', valor: resumo.indefinidos, cor: 'text-amber-300' },
          {
            rotulo: `apresentações · ${resumo.apresentacoesAlocadas} nos blocos`,
            valor: resumo.apresentacoesPrevistas,
            cor: 'text-violet-300',
            largo: true,
          },
          { rotulo: 'convidados', valor: resumo.convidadosTotal, cor: 'text-white' },
        ].map((k) => (
          <div key={k.rotulo} className={cn('bg-slate-900 px-3 py-2', k.largo && 'col-span-2')}>
            <p className={cn('text-[18px] font-semibold tabular-nums leading-tight', k.cor)}>{k.valor}</p>
            <p className="text-[12px] leading-tight text-slate-500">{k.rotulo}</p>
          </div>
        ))}
      </div>

      <div className="hidden sm:block">
        <PainelAlunos
          elegiveis={resumo.total}
          participam={resumo.participam}
          indefinidos={resumo.indefinidos}
          naoParticipam={resumo.naoParticipam}
          previstas={resumo.apresentacoesPrevistas}
          nosBlocos={resumo.apresentacoesAlocadas}
          confirmadosSemBloco={resumo.participamSemAlocacao}
          convidados={resumo.convidadosTotal}
          convidadosComNome={alunos
            .filter((a) => a.status === 'participa')
            .reduce((t, a) => t + (convidadosPorPessoa.get(a.pessoa_chave)?.length ?? 0), 0)}
          cursos={porCurso}
          cursoAtivo={filtroCurso === 'todos' ? null : filtroCurso}
          onFiltroStatus={(st) => setFiltro((atual) => (atual === st ? 'todos' : st))}
          onSoSemBloco={() => {
            setFiltro('participa');
            setSoSemAlocar(true);
          }}
          onCurso={(c) => setFiltroCurso((atual) => (atual === c ? 'todos' : c))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-[220px] flex-1 sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno, curso ou professor…"
            className="h-11 pl-8 text-[16px] sm:h-10 sm:text-sm"
          />
        </div>

        <div className="flex w-full overflow-hidden rounded-lg border border-slate-700 sm:w-auto">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={cn(
                'min-h-[44px] flex-auto whitespace-nowrap px-2 py-1.5 text-[13px] transition-colors sm:min-h-0 sm:flex-none sm:px-3 sm:text-[12.5px]',
                filtro === f.id
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Filtros dedicados: a planilha do recital e organizada por professor e por
            instrumento — sem os dois selects a resposta seria digitar nome por nome. */}
        {professores.length > 1 && (
          <Select value={filtroProfessor} onValueChange={setFiltroProfessor}>
            <SelectTrigger className="h-11 min-w-0 flex-1 basis-[45%] text-[13px] sm:h-9 sm:w-[170px] sm:flex-none sm:basis-auto sm:text-[12.5px]">
              <SelectValue placeholder="Professor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Professor: todos</SelectItem>
              {professores.map(([id, nome]) => (
                <SelectItem key={id} value={id}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {cursos.length > 1 && (
          <Select value={filtroCurso} onValueChange={setFiltroCurso}>
            <SelectTrigger className="h-11 min-w-0 flex-1 basis-[45%] text-[13px] sm:h-9 sm:w-[150px] sm:flex-none sm:basis-auto sm:text-[12.5px]">
              <SelectValue placeholder="Curso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Curso: todos</SelectItem>
              {cursos.map(([id, nome]) => (
                <SelectItem key={id} value={id}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* So aparece quando ha grade montada: antes disso ele filtraria a lista inteira
            e nao responderia pergunta nenhuma. */}
        {resumo.apresentacoesAlocadas > 0 && (
          <Button
            variant={soSemAlocar ? 'default' : 'outline'}
            size="sm"
            className="h-11 flex-1 gap-1.5 sm:h-9 sm:flex-none"
            onClick={() => setSoSemAlocar((v) => !v)}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Sem alocar
          </Button>
        )}
        {/* Quem o professor ja entregou relatorio e falta cadeira — a fila que a
            coordenacao zera primeiro (Caio do Isaque foi o caso que originou). */}
        {temRelatorioPronto && (
          <Button
            variant={soRelatorioPronto ? 'default' : 'outline'}
            size="sm"
            className="h-11 flex-1 gap-1.5 sm:h-9 sm:flex-none"
            onClick={() => setSoRelatorioPronto((v) => !v)}
          >
            <FileCheck className="h-3.5 w-3.5" />
            Relatório pronto
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 sm:h-9 sm:flex-none"
          disabled={gravando === '__lote__' || visiveis.length === 0}
          onClick={() => {
            const alvos = visiveis.filter((a) => avaliarElegibilidade(a).podeParticipar);
            if (alvos.length > 0) setLotePendente(alvos);
          }}
        >
          Marcar os {visiveis.length} visíveis
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 gap-1.5 sm:h-9 sm:flex-none"
          onClick={() => setModalOutraUnidade(true)}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Aluno de outra unidade
        </Button>
      </div>

      <ModalAlunoOutraUnidade
        eventoId={eventoId}
        aberto={modalOutraUnidade}
        onFechar={() => setModalOutraUnidade(false)}
        onAdicionado={recarregar}
      />

      <ModalConvidadosDoAluno
        aberto={convidadosDe !== null}
        eventoId={eventoId}
        aluno={alunos.find((x) => x.pessoa_chave === convidadosDe) ?? null}
        convidados={convidadosDe ? convidadosPorPessoa.get(convidadosDe) ?? [] : []}
        onLeva={(aluno, n) => salvarConvidados(aluno, n)}
        onFechar={() => setConvidadosDe(null)}
        // O número "leva N" pode subir junto (o banco o acompanha), então os dois recarregam.
        onMudou={() => {
          recarregarConvidados();
          recarregar();
        }}
      />

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/40">
        {loading && alunos.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">Carregando alunos…</p>
        ) : visiveis.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">
            {alunos.length === 0
              ? 'Nenhum aluno ativo nesta unidade.'
              : 'Nenhum aluno com esse filtro.'}
          </p>
        ) : (
          <div className={cn('transition-opacity', gravando && 'opacity-60')}>
            {visiveis.map((a) => (
              <LinhaAluno
                key={a.pessoa_chave}
                aluno={a}
                nomeados={convidadosPorPessoa.get(a.pessoa_chave)?.length ?? 0}
                onEscolher={(s) => escolher(a, s)}
                onNomes={() => setConvidadosDe(a.pessoa_chave)}
                onFormando={() => alternarFormando(a)}
                onRemover={a.unidade_origem_nome ? () => removerVisitante(a) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <ModalConfirmacao
        aberto={lotePendente !== null}
        onClose={() => setLotePendente(null)}
        onConfirmar={() => {
          const alvos = lotePendente;
          setLotePendente(null);
          if (alvos) void marcarLote('participa', alvos);
        }}
        titulo="Marcar participação em lote"
        mensagem={`Marcar ${lotePendente?.length ?? 0} ${(lotePendente?.length ?? 0) === 1 ? 'aluno' : 'alunos'} como participando do recital? Depois de gravar, o aviso na tela oferece Desfazer por alguns segundos.`}
        tipo="warning"
        textoConfirmar="Marcar todos"
        carregando={gravando === '__lote__'}
      />
    </div>
  );
}
