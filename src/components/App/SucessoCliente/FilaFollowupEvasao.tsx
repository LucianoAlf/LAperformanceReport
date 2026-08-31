import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Archive,
  Ban,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Inbox,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Search,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { ConversaPesquisaEvasao } from './ConversaPesquisaEvasao';
import { ModalRegistrarFollowupEvasao } from './ModalRegistrarFollowupEvasao';
import { useFollowupsEvasao } from './hooks/useFollowupsEvasao';
import { useRepescagemEvasao } from './hooks/useRepescagemEvasao';
import {
  rotuloMotivoRecusaRepescagem,
  type PesquisaEvasaoFollowupAcao,
  type PesquisaEvasaoFollowupFiltro,
  type PesquisaEvasaoFollowupGrupo,
  type PesquisaEvasaoFollowupItem,
  type RepescagemEnfileiramentoResultado,
  type RepescagemEstado,
} from './pesquisaEvasao.types';

interface Props {
  unidadeAtual: UnidadeId;
  ano: number;
  mes: number | null;
  filtroInicial: PesquisaEvasaoFollowupFiltro;
  onAlteracao?: () => void;
  /**
   * Leva para a Caixa de Entrada do Sucesso do Aluno, na conversa daquele aluno.
   * O painel "Ver conversa" mostra so o que a familia RESPONDEU — quando ninguem
   * respondeu ele fica vazio, e vazio nao distingue "nao respondeu" de "quebrou".
   */
  onAbrirConversa?: (alunoId: number | null, telefone?: string | null) => void;
}

const ROTULOS_ESTADO: Record<string, string> = {
  aguardando_resposta: 'Aguardando resposta',
  followup_pendente: 'Follow-up pendente',
  followup_avisado: 'Follow-up avisado',
  followup_realizado: 'Follow-up realizado',
  followup_dispensado: 'Follow-up dispensado',
  respondendo: 'Interagindo',
  pronta_para_revisao: 'Pronta para revisão',
  em_revisao: 'Em revisão',
  nova_rodada: 'Nova rodada',
  revisada: 'Revisada',
  concluida: 'Concluída',
  opt_out: 'Opt-out',
};

const CLASSES_ESTADO: Record<string, string> = {
  aguardando_resposta: 'border-slate-600/70 bg-slate-700/30 text-slate-300',
  followup_pendente: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  followup_avisado: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  followup_realizado: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  followup_dispensado: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  respondendo: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  pronta_para_revisao: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  em_revisao: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  nova_rodada: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  // `revisada` NAO e o fim da linha -- ainda falta classificar e registrar desfecho.
  // Ficava em esmeralda, a mesma cor de quem ja terminou, e verde comunica "pronto":
  // e parte do motivo de ninguem conseguir dizer o que ainda faltava numa pesquisa.
  // Etapa intermediaria usa a familia violeta, como as outras etapas de revisao.
  revisada: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  // Terminal: preenchimento mais solido que os estados de passagem.
  concluida: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100',
  opt_out: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
};

/**
 * As duas abas da secao. Qual estado pertence a qual grupo e decidido NO BANCO, por
 * `fn_pesquisa_evasao_followup_encerrada` — o filtro `em_aberto`/`encerradas` roda
 * no servidor e a paginacao vem de la. Esta lista e so o menu de refino de cada aba:
 * se um estado for parar no grupo errado, ele aparece sob o rotulo errado e devolve
 * lista vazia. Visivel, nao silencioso — mas, ao mexer na particao, mexa nos dois.
 *
 * `revisada` fica em ABERTO de proposito: a analise foi revisada, mas ainda falta
 * classificar e registrar o desfecho. `followup_realizado` fica em ENCERRADAS porque
 * naquele ramo do `case` do banco a pesquisa nao teve resposta nenhuma — o operador
 * ligou, registrou, e a fila nao tem mais o que pedir dela.
 */
const OPCOES_POR_ABA: Record<
  PesquisaEvasaoFollowupGrupo,
  { valor: PesquisaEvasaoFollowupFiltro; rotulo: string }[]
> = {
  em_aberto: [
    { valor: 'em_aberto', rotulo: 'Todas em aberto' },
    { valor: 'followup_pendente', rotulo: 'Follow-up pendente' },
    { valor: 'followup_avisado', rotulo: 'Follow-up avisado' },
    { valor: 'aguardando_resposta', rotulo: 'Aguardando resposta' },
    { valor: 'revisada', rotulo: 'Revisada — falta desfecho' },
  ],
  encerradas: [
    { valor: 'encerradas', rotulo: 'Tudo no arquivo' },
    { valor: 'concluida', rotulo: 'Concluídas — com desfecho' },
    { valor: 'followup_realizado', rotulo: 'Follow-up realizado' },
    { valor: 'followup_dispensado', rotulo: 'Dispensadas' },
    { valor: 'opt_out', rotulo: 'Opt-out' },
  ],
};

/**
 * O QUE colocou esta pesquisa no arquivo — nomeando o ato, o autor e a data.
 *
 * ⚠️ A 1a versão explicava a REGRA do sistema ("sem resposta não há análise para
 * classificar") e não respondia a pergunta que a pessoa faz olhando a tela: "por que
 * ESTE caso foi parar aqui?". Quem move uma pesquisa para o arquivo é sempre um ato
 * humano datado — o clique da operadora, ou o desfecho registrado. É isso que a linha
 * precisa dizer; a regra de fundo vai no comentário, não na tela.
 *
 * ⚠️ E a 1a versão afirmava uma coisa FALSA: que a pesquisa "não chega a receber
 * desfecho". Ela não chega COM OS DADOS DE HOJE. O 2o toque (repescagem) pode não ter
 * saído — no caso que motivou isto, não tinha saído — e uma resposta nele abre análise,
 * classificação e desfecho normalmente. Não afirmar impossibilidade onde só há ausência.
 *
 * ⚠️ "Ninguém respondeu" continua sendo fato, não suposição: no `case` de
 * `fn_pesquisa_evasao_followup_estado`, todo status que abre rodada de análise
 * (`coletando`, `pronta_para_revisao`, `em_revisao`, `revisada`) é capturado ANTES, e
 * `concluida`/`opt_out` também. Chegar em `followup_realizado`/`followup_dispensado`
 * só acontece com pesquisa sem resposta nenhuma.
 */
function motivoDoArquivamento(item: PesquisaEvasaoFollowupItem): string | null {
  const quem = item.acao_operador_nome ?? 'a equipe';
  const quando = item.acao_registrada_em ? ` em ${formatarData(item.acao_registrada_em)}` : '';
  const canal = item.acao_canal ? ` (${item.acao_canal})` : '';

  switch (item.estado_visivel) {
    case 'concluida':
      return 'Está aqui porque o desfecho foi registrado: a família respondeu e o motivo da saída ficou documentado.';
    case 'followup_realizado':
      return `Está aqui porque ${quem} marcou o follow-up como realizado${quando}${canal}. Ninguém respondeu à pesquisa, então o motivo da saída não chegou a ser capturado.`;
    case 'followup_dispensado':
      return `Está aqui porque ${quem} dispensou o follow-up${quando}. Ninguém respondeu à pesquisa, e a equipe decidiu não insistir.`;
    case 'opt_out':
      return 'Está aqui porque a pessoa pediu para não receber mais mensagens. Não há novo contato a fazer.';
    default:
      return null;
  }
}

const ABAS: {
  valor: PesquisaEvasaoFollowupGrupo;
  rotulo: string;
  Icone: typeof Inbox;
}[] = [
  { valor: 'em_aberto', rotulo: 'Em aberto', Icone: Inbox },
  { valor: 'encerradas', rotulo: 'Arquivo', Icone: Archive },
];

/**
 * Onde um filtro vindo de fora (deep link, prop) deve abrir.
 *
 * ⚠️ O `estado` devolvido precisa existir no menu da aba: o Select do Radix com um
 * `value` fora das opções renderiza o gatilho VAZIO — parece filtro nenhum e a lista
 * volta recortada. Valor que não está no menu (o legado `'todos'`, por exemplo) cai
 * para o próprio grupo.
 */
function resolverFiltroInicial(filtro: PesquisaEvasaoFollowupFiltro): {
  aba: PesquisaEvasaoFollowupGrupo;
  estado: PesquisaEvasaoFollowupFiltro;
} {
  const aba: PesquisaEvasaoFollowupGrupo =
    OPCOES_POR_ABA.encerradas.some((opcao) => opcao.valor === filtro)
      ? 'encerradas'
      : 'em_aberto';
  const noMenu = OPCOES_POR_ABA[aba].some((opcao) => opcao.valor === filtro);
  return { aba, estado: noMenu ? filtro : aba };
}

function formatarData(valor: string) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Data indisponível' : format(data, 'dd/MM HH:mm');
}

function formatarHoraBRT(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(data);
}

function formatarDiaMesBRT(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '--/--';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(data);
}

// Item 6 do review final: o worker fecha a linha como 'falhou' com um destes
// motivos quando o desfecho e o DESEJADO -- a pessoa respondeu na espera, ou
// pediu para nao receber mais, ou a repescagem ja saiu por outra execucao
// concorrente. Nao e falha, e apresentacao (a tela e a unica coisa que muda
// aqui; nenhum estado novo entra no banco).
const MOTIVOS_ENCERRAMENTO_NORMAL: Record<string, string> = {
  respondeu_durante_a_espera: 'respondeu antes do reenvio',
  opt_out: 'pediu para não receber mais',
  ja_enviada: 'reenvio já feito',
  telefone_ja_respondeu: 'irmão(ã) já respondeu',
};

/**
 * Estados em que a repescagem impede um novo reenvio: a mensagem está a caminho
 * (`pendente`/`enviando`) ou já saiu (`enviada`). `cancelada` e `falhou` ficam
 * de fora de propósito — cancelar desfaz, não consome o toque.
 */
const REPESCAGEM_BLOQUEIA_REENVIO = new Set(['pendente', 'enviando', 'enviada']);

/** Rótulo do badge de repescagem (2º toque) por linha — status vem direto de `pesquisa_evasao_envios_fila`. */
function rotuloBadgeRepescagem(estado: RepescagemEstado | undefined): string | null {
  if (!estado) return null;
  if (estado.status === 'falhou' && estado.ultimo_erro && MOTIVOS_ENCERRAMENTO_NORMAL[estado.ultimo_erro]) {
    return MOTIVOS_ENCERRAMENTO_NORMAL[estado.ultimo_erro];
  }
  switch (estado.status) {
    case 'pendente':
      return `na fila · sai ${formatarHoraBRT(estado.agendada_para)}`;
    case 'enviando':
      return 'enviando';
    case 'enviada':
      return `reenviada ${formatarDiaMesBRT(estado.enviada_em ?? estado.agendada_para)}`;
    case 'falhou':
      return `falhou${estado.ultimo_erro ? ` · ${estado.ultimo_erro}` : ''}`;
    case 'cancelada':
      return 'cancelada';
    default:
      return null;
  }
}

const CLASSES_BADGE_REPESCAGEM: Record<RepescagemEstado['status'], string> = {
  pendente: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  enviando: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  enviada: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  falhou: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  cancelada: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
};

/** Cor do badge — encerramento normal usa a MESMA classe neutra de 'cancelada', nunca o vermelho de falha. */
function classeBadgeRepescagem(estado: RepescagemEstado): string {
  if (estado.status === 'falhou' && estado.ultimo_erro && MOTIVOS_ENCERRAMENTO_NORMAL[estado.ultimo_erro]) {
    return CLASSES_BADGE_REPESCAGEM.cancelada;
  }
  return CLASSES_BADGE_REPESCAGEM[estado.status];
}

export function FilaFollowupEvasao({
  unidadeAtual,
  ano,
  mes,
  filtroInicial,
  onAlteracao,
  onAbrirConversa,
}: Props) {
  const toast = useToast();
  const [aba, setAba] = useState<PesquisaEvasaoFollowupGrupo>(
    () => resolverFiltroInicial(filtroInicial).aba,
  );
  const [estado, setEstado] = useState<PesquisaEvasaoFollowupFiltro>(
    () => resolverFiltroInicial(filtroInicial).estado,
  );
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [itemModal, setItemModal] = useState<PesquisaEvasaoFollowupItem | null>(null);
  const [acaoModal, setAcaoModal] = useState<PesquisaEvasaoFollowupAcao>('realizado');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const inicial = resolverFiltroInicial(filtroInicial);
    setAba(inicial.aba);
    setEstado(inicial.estado);
    setPagina(1);
  }, [filtroInicial]);

  useEffect(() => {
    setPagina(1);
  }, [ano, busca, estado, mes, unidadeAtual]);

  /** Trocar de aba volta ao "todos" daquele grupo — um refino da aba anterior nao sobrevive a ela. */
  const trocarAba = (proxima: PesquisaEvasaoFollowupGrupo) => {
    setAba(proxima);
    setEstado(proxima);
  };

  const {
    itens,
    total,
    totalEmAberto,
    totalEncerradas,
    totalPendente,
    loading,
    erro,
    tamanhoPagina,
    recarregar,
    registrarAcao,
  } = useFollowupsEvasao({ unidadeAtual, ano, mes, busca, estado, pagina });

  // Todos os ids da pagina: e o que o hook precisa consultar para saber o
  // estado da repescagem de cada linha (inclusive das ja reenviadas).
  const pesquisaIds = useMemo(() => itens.map((item) => item.pesquisa_id), [itens]);
  const nomePorPesquisa = useMemo(
    () => Object.fromEntries(itens.map((item) => [item.pesquisa_id, item.aluno_nome])),
    [itens],
  );
  const {
    estadoPorPesquisa,
    enfileirar: enfileirarRepescagem,
    cancelar: cancelarRepescagem,
  } = useRepescagemEvasao(pesquisaIds);

  // So linha VIVA (`pendente`/`enviando`) ou ja CONCLUIDA (`enviada`) bloqueia
  // um novo reenvio -- nessas a mensagem esta a caminho ou ja saiu.
  // `cancelada` e `falhou` NAO bloqueiam: cancelar e desfazer, nao gastar o
  // toque. Bloquear tirava a pessoa da repescagem para sempre por causa de um
  // clique errado -- o oposto do que cancelar significa. A RPC reativa a linha
  // (o unique de (pesquisa_id, toque) impede criar uma segunda).
  // Sem este recorte o contador do botao mentiria sobre quantas sairiam.
  // ⚠️ Derivado DEPOIS de `useRepescagemEvasao`, nunca antes: `pesquisaIds` e a
  // entrada do hook e `estadoPorPesquisa` e a saida -- calcular um a partir do
  // outro fecharia um ciclo (e leria a variavel antes da declaracao).
  const pesquisaIdsElegiveis = useMemo(
    () => pesquisaIds.filter((id) => !REPESCAGEM_BLOQUEIA_REENVIO.has(
      estadoPorPesquisa[id]?.status ?? '',
    )),
    [pesquisaIds, estadoPorPesquisa],
  );

  const [alvoRepescagem, setAlvoRepescagem] = useState<string[] | null>(null);
  const [resultadoRepescagem, setResultadoRepescagem] = useState<RepescagemEnfileiramentoResultado | null>(null);
  const [processandoRepescagem, setProcessandoRepescagem] = useState(false);
  const [cancelandoRepescagemId, setCancelandoRepescagemId] = useState<string | null>(null);

  const abrirConfirmacaoRepescagem = (ids: string[]) => {
    if (ids.length === 0) return;
    setResultadoRepescagem(null);
    setAlvoRepescagem(ids);
  };

  const fecharModalRepescagem = () => {
    setAlvoRepescagem(null);
    setResultadoRepescagem(null);
  };

  const confirmarRepescagem = async () => {
    if (!alvoRepescagem) return;
    setProcessandoRepescagem(true);
    try {
      const resultado = await enfileirarRepescagem(alvoRepescagem);
      setResultadoRepescagem(resultado);
    } catch (error) {
      console.error('Erro ao enfileirar repescagem:', error);
      toast.error('Não foi possível enfileirar o reenvio');
      setAlvoRepescagem(null);
    } finally {
      setProcessandoRepescagem(false);
    }
  };

  const cancelarEnvioRepescagem = async (pesquisaId: string) => {
    setCancelandoRepescagemId(pesquisaId);
    try {
      await cancelarRepescagem(pesquisaId);
      toast.success('Repescagem cancelada');
    } catch (error) {
      console.error('Erro ao cancelar repescagem:', error);
      toast.error('Não foi possível cancelar o reenvio');
    } finally {
      setCancelandoRepescagemId(null);
    }
  };

  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));

  /**
   * Registrar um desfecho no último caso de uma página o tira do grupo — e a página
   * deixa de existir. A tela mostrava "Nenhum caso neste filtro" com 31 casos vivos,
   * porque `total` vem das linhas devolvidas e uma página vazia devolve zero.
   *
   * ⚠️ Quem desempata é o CONTADOR do grupo, que não passa pela paginação: só ele
   * distingue "acabou a lista" de "acabou esta página".
   */
  const totalDoGrupo = aba === 'em_aberto' ? totalEmAberto : totalEncerradas;
  useEffect(() => {
    if (!loading && itens.length === 0 && pagina > 1 && totalDoGrupo > 0) {
      setPagina(1);
    }
  }, [itens.length, loading, pagina, totalDoGrupo]);
  const intervalo = useMemo(() => {
    if (total === 0) return '0 casos';
    const inicio = (pagina - 1) * tamanhoPagina + 1;
    const fim = Math.min(pagina * tamanhoPagina, total);
    return `${inicio}–${fim} de ${total}`;
  }, [pagina, tamanhoPagina, total]);

  const abrirModal = (item: PesquisaEvasaoFollowupItem, acao: PesquisaEvasaoFollowupAcao) => {
    setItemModal(item);
    setAcaoModal(acao);
  };

  const confirmarAcao = async (dados: Parameters<typeof registrarAcao>[0]) => {
    if (!itemModal) return;
    setSalvando(true);
    try {
      await registrarAcao({ ...dados, pesquisaId: itemModal.pesquisa_id });
      setItemModal(null);
      toast.success(
        dados.acao === 'realizado' ? 'Follow-up registrado' : 'Follow-up dispensado',
      );
      onAlteracao?.();
    } catch (error) {
      console.error('Erro ao registrar follow-up:', error);
      toast.error('Não foi possível registrar o follow-up');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-400/20 bg-slate-900/55 shadow-lg shadow-black/10">
      <div className="border-b border-slate-700/60 bg-gradient-to-r from-amber-400/[0.09] via-slate-900/30 to-slate-900/20 p-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-400/10">
            <BellRing className="h-5 w-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-white">Acompanhamento de follow-up</h3>
              {totalPendente > 0 && (
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                  {totalPendente} pendente{totalPendente === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              {aba === 'em_aberto'
                ? 'Os casos entram aqui exatamente 72 horas após o envio. A Lia reúne os lembretes em um resumo diário às 9h.'
                : 'O que não pede mais ação sua: quem fechou com desfecho, e também quem nunca respondeu e já teve o follow-up feito ou dispensado. Arquivo não quer dizer concluída — cada linha diz por que está aqui.'}
            </p>
          </div>
        </div>

        {/* Abas. A partição vem do banco (`fn_pesquisa_evasao_followup_encerrada`);
            aqui ficam só o rótulo e a contagem de cada lado. */}
        <div className="mt-4 inline-flex rounded-xl border border-slate-700/70 bg-slate-950/40 p-1">
          {ABAS.map(({ valor, rotulo, Icone }) => {
            const ativa = aba === valor;
            const contagem = valor === 'em_aberto' ? totalEmAberto : totalEncerradas;
            return (
              <button
                key={valor}
                type="button"
                aria-pressed={ativa}
                onClick={() => trocarAba(valor)}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  ativa
                    ? 'bg-slate-800 text-white shadow-sm shadow-black/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icone className="h-4 w-4" />
                {rotulo}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    ativa ? 'bg-slate-700 text-slate-100' : 'bg-slate-800/70 text-slate-400'
                  }`}
                >
                  {contagem}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(220px,1fr)_260px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={busca}
              placeholder="Buscar aluno, unidade ou operador..."
              className="border-slate-700 bg-slate-950/45 pl-9 text-white"
              onChange={(event) => setBusca(event.target.value)}
            />
          </div>
          <Select
            value={estado}
            onValueChange={(valor) => setEstado(valor as PesquisaEvasaoFollowupFiltro)}
          >
            <SelectTrigger className="border-slate-700 bg-slate-950/45 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPCOES_POR_ABA[aba].map((opcao) => (
                <SelectItem key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Só na aba de trabalho, e o rótulo diz "desta página" porque é o que ele
              sempre alcançou: os ids carregados. Com página de 50 contra 35 casos isso
              coincidia com "todos" e o texto passava; com 8 por página, não passaria. */}
          {aba === 'em_aberto' && pesquisaIdsElegiveis.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-10 border-sky-400/30 text-sky-200 hover:bg-sky-400/10"
              onClick={() => abrirConfirmacaoRepescagem(pesquisaIdsElegiveis)}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Reenviar os {pesquisaIdsElegiveis.length} desta página
            </Button>
          )}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando follow-ups...
          </div>
        ) : erro ? (
          <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-center">
            <p className="text-sm text-rose-200">Não foi possível carregar a fila de follow-up.</p>
            <Button variant="outline" size="sm" onClick={() => void recarregar()}>
              Tentar novamente
            </Button>
          </div>
        ) : itens.length === 0 ? (
          <div className="flex min-h-28 flex-col items-center justify-center text-center">
            {aba === 'em_aberto' ? (
              <>
                <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-400" />
                <p className="text-sm font-medium text-slate-200">Nenhum caso neste filtro</p>
                <p className="mt-1 text-xs text-slate-500">A fila é atualizada automaticamente conforme o prazo vence.</p>
              </>
            ) : (
              <>
                <Archive className="mb-2 h-6 w-6 text-slate-500" />
                <p className="text-sm font-medium text-slate-200">Nada no arquivo com este filtro</p>
                <p className="mt-1 max-w-md text-xs text-slate-500">
                  Uma pesquisa chega aqui quando o desfecho é registrado, quando o follow-up é marcado como
                  realizado ou dispensado, ou quando a pessoa pede para não receber mais.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {itens.map((item) => (
              <article key={item.pesquisa_id} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950/35">
                <div className="flex flex-wrap items-center justify-between gap-4 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{item.aluno_nome}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CLASSES_ESTADO[item.estado_visivel] ?? CLASSES_ESTADO.aguardando_resposta}`}>
                        {ROTULOS_ESTADO[item.estado_visivel] ?? item.estado_visivel}
                      </span>
                      {item.interagiu_sem_resposta_valida && (
                        <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
                          Interagiu sem resposta válida
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>{item.unidade_nome}</span>
                      <span>Enviado em {formatarData(item.enviado_em)} por {item.operador_nome}</span>
                      <span className="flex items-center gap-1 text-amber-200/80">
                        <Clock3 className="h-3.5 w-3.5" />
                        Prazo em {formatarData(item.vencido_em)}
                      </span>
                    </div>
                    {item.acao_registrada_em && (
                      <p className="mt-2 text-xs text-slate-500">
                        Registrado em {formatarData(item.acao_registrada_em)} por {item.acao_operador_nome ?? 'operador interno'}
                        {item.acao_canal ? ` · ${item.acao_canal}` : ''}
                      </p>
                    )}
                    {aba === 'encerradas' && motivoDoArquivamento(item) && (
                      <p className="mt-2 max-w-2xl border-l-2 border-slate-600 pl-2.5 text-xs text-slate-400">
                        <span className="font-semibold text-slate-300">Por que está no arquivo: </span>
                        {motivoDoArquivamento(item)}
                      </p>
                    )}
                    {(() => {
                      const estadoRepescagem = estadoPorPesquisa[item.pesquisa_id];
                      const rotulo = rotuloBadgeRepescagem(estadoRepescagem);
                      if (!rotulo) return null;
                      return (
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${classeBadgeRepescagem(estadoRepescagem!)}`}>
                            Repescagem: {rotulo}
                          </span>
                          {estadoRepescagem!.status === 'pendente' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px] text-slate-400 hover:text-rose-300"
                              disabled={cancelandoRepescagemId === item.pesquisa_id}
                              onClick={() => void cancelarEnvioRepescagem(item.pesquisa_id)}
                            >
                              <Ban className="mr-1 h-3 w-3" />
                              Cancelar
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {(() => {
                      const jaTeveRepescagem = REPESCAGEM_BLOQUEIA_REENVIO.has(
                        estadoPorPesquisa[item.pesquisa_id]?.status ?? '',
                      );
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={jaTeveRepescagem}
                          title={
                            jaTeveRepescagem
                              ? 'A repescagem desta pesquisa já saiu ou está a caminho. A régua é de dois toques.'
                              : undefined
                          }
                          className={
                            jaTeveRepescagem
                              ? 'border-slate-700/60 text-slate-500'
                              : 'border-sky-500/30 text-sky-200 hover:bg-sky-400/10'
                          }
                          onClick={() => abrirConfirmacaoRepescagem([item.pesquisa_id])}
                        >
                          <RefreshCw className="mr-1.5 h-4 w-4" />
                          {jaTeveRepescagem ? 'Reenviada' : 'Reenviar'}
                        </Button>
                      );
                    })()}
                    {item.followup_pendente && !item.acao && (
                      <>
                        <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => abrirModal(item, 'realizado')}>
                          <UserRoundCheck className="mr-1.5 h-4 w-4" />
                          Marcar realizado
                        </Button>
                        <Button size="sm" variant="outline" className="border-slate-600 text-slate-300" onClick={() => abrirModal(item, 'dispensado')}>
                          <XCircle className="mr-1.5 h-4 w-4" />
                          Dispensar
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-violet-300 hover:text-violet-200"
                      onClick={() => setExpandida(expandida === item.pesquisa_id ? null : item.pesquisa_id)}
                    >
                      {expandida === item.pesquisa_id ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                      Ver resposta
                    </Button>
                    {onAbrirConversa && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-sky-300 hover:text-sky-200 disabled:text-slate-600"
                        disabled={!item.aluno_id && !item.telefone_destino}
                        title={
                          item.aluno_id || item.telefone_destino
                            ? 'Abrir a conversa completa na Caixa de Entrada'
                            : 'Sem vínculo com o cadastro e sem telefone — não há conversa para abrir'
                        }
                        onClick={() =>
                          (item.aluno_id || item.telefone_destino) &&
                          onAbrirConversa(item.aluno_id, item.telefone_destino)
                        }
                      >
                        <MessagesSquare className="mr-1 h-4 w-4" />
                        Ir para a conversa
                      </Button>
                    )}
                  </div>
                </div>

                {expandida === item.pesquisa_id && (
                  <div className="border-t border-slate-700/60 p-3">
                    <ConversaPesquisaEvasao pesquisaId={item.pesquisa_id} onAlteracao={() => void recarregar()} />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-slate-700/50 pt-3">
          <span className="text-xs text-slate-500">{intervalo}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pagina <= 1 || loading} onClick={() => setPagina((atual) => Math.max(1, atual - 1))}>
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Página anterior</span>
            </Button>
            <span className="min-w-14 text-center text-xs text-slate-400">{pagina}/{totalPaginas}</span>
            <Button variant="outline" size="sm" disabled={pagina >= totalPaginas || loading} onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}>
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Próxima página</span>
            </Button>
          </div>
        </div>
      </div>

      <ModalRegistrarFollowupEvasao
        aberto={itemModal !== null}
        item={itemModal}
        acaoInicial={acaoModal}
        salvando={salvando}
        onAbertoChange={(aberto) => {
          if (!aberto) setItemModal(null);
        }}
        onConfirmar={(dados) => void confirmarAcao(dados)}
      />

      <AlertDialog
        open={alvoRepescagem !== null}
        onOpenChange={(aberto) => {
          if (!aberto) fecharModalRepescagem();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resultadoRepescagem ? 'Resultado do reenvio' : 'Confirmar reenvio'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resultadoRepescagem
                ? `${resultadoRepescagem.enfileiradas.length} enfileirada${resultadoRepescagem.enfileiradas.length === 1 ? '' : 's'} · ${resultadoRepescagem.recusadas.length} recusada${resultadoRepescagem.recusadas.length === 1 ? '' : 's'}.`
                : `Reenviar a pesquisa para ${alvoRepescagem?.length ?? 0} pessoa${(alvoRepescagem?.length ?? 0) === 1 ? '' : 's'}? Sai um por vez, entre 9h e 19h em dia útil. Quem já respondeu, pediu para não receber mais ou não é elegível por outro motivo é recusado automaticamente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {resultadoRepescagem && resultadoRepescagem.recusadas.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
              <ul className="space-y-1.5 text-xs text-slate-300">
                {resultadoRepescagem.recusadas.map((recusa) => (
                  <li key={recusa.pesquisa_id} className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-slate-200">
                      {nomePorPesquisa[recusa.pesquisa_id] ?? recusa.pesquisa_id}
                    </span>
                    <span className="text-rose-200/90">{rotuloMotivoRecusaRepescagem(recusa.motivo)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AlertDialogFooter>
            {resultadoRepescagem ? (
              <Button onClick={fecharModalRepescagem}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" disabled={processandoRepescagem} onClick={fecharModalRepescagem}>
                  Cancelar
                </Button>
                <Button disabled={processandoRepescagem} onClick={() => void confirmarRepescagem()}>
                  {processandoRepescagem ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
