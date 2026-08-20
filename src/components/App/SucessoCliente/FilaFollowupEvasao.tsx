import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Loader2,
  MessagesSquare,
  Search,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
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
import type {
  PesquisaEvasaoFollowupAcao,
  PesquisaEvasaoFollowupFiltro,
  PesquisaEvasaoFollowupItem,
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
  revisada: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  opt_out: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
};

function formatarData(valor: string) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'Data indisponível' : format(data, 'dd/MM HH:mm');
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
  const [estado, setEstado] = useState<PesquisaEvasaoFollowupFiltro>(filtroInicial);
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [itemModal, setItemModal] = useState<PesquisaEvasaoFollowupItem | null>(null);
  const [acaoModal, setAcaoModal] = useState<PesquisaEvasaoFollowupAcao>('realizado');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setEstado(filtroInicial);
    setPagina(1);
  }, [filtroInicial]);

  useEffect(() => {
    setPagina(1);
  }, [ano, busca, estado, mes, unidadeAtual]);

  const {
    itens,
    total,
    totalPendente,
    loading,
    erro,
    tamanhoPagina,
    recarregar,
    registrarAcao,
  } = useFollowupsEvasao({ unidadeAtual, ano, mes, busca, estado, pagina });

  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-400/10">
              <BellRing className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-white">Acompanhamento de follow-up</h3>
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                  {totalPendente} pendente{totalPendente === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Os casos entram aqui exatamente 72 horas após o envio. A Lia reúne os lembretes em um resumo diário às 9h.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px]">
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
              <SelectItem value="followup_pendente">Pendentes</SelectItem>
              <SelectItem value="followup_avisado">Avisados</SelectItem>
              <SelectItem value="followup_realizado">Realizados</SelectItem>
              <SelectItem value="followup_dispensado">Dispensados</SelectItem>
              <SelectItem value="aguardando_resposta">Aguardando resposta</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
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
            <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-400" />
            <p className="text-sm font-medium text-slate-200">Nenhum caso neste filtro</p>
            <p className="mt-1 text-xs text-slate-500">A fila é atualizada automaticamente conforme o prazo vence.</p>
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
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
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
    </section>
  );
}
