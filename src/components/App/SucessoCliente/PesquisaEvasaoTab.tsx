import { Fragment, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  Send, MessageSquare, CheckCircle, XCircle, Clock,
  Loader2, Phone, Search, ChevronDown, ChevronUp,
  TrendingUp, Users, MessageCircle, BarChart3,
  ChevronLeft, ChevronRight, History, LockKeyhole,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FlaskConical } from 'lucide-react';
import { useWidgetOverlapSentinel } from '@/contexts/WidgetVisibilityContext';
import { ModalPreviewPesquisaEvasao } from './ModalPreviewPesquisaEvasao';
import type {
  PesquisaEvasaoConfirmacao,
  PesquisaEvasaoListagemItem,
  PesquisaEvasaoPreview,
  PesquisaEvasaoTeste,
} from './pesquisaEvasao.types';

type EvadidoPesquisa = PesquisaEvasaoListagemItem & {
  // Alias temporario somente de leitura para manter a transicao dos consumidores.
  pesquisa_status: string;
  pesquisa_id: string | null;
  resposta_texto: string | null;
  resposta_audio_url: string | null;
  resposta_tipo: string | null;
  respondido_em: string | null;
};

interface StatsPesquisa {
  total_evadidos: number;
  total_com_telefone: number;
  total_pendentes: number;
  total_enviados: number;
  total_respondidos: number;
  total_falhas: number;
  taxa_resposta: number;
  respondidos_texto: number;
  respondidos_audio: number;
}

interface Props {
  unidadeAtual: UnidadeId;
}

interface StatusPesquisaInterpretado {
  statusBase: string;
  registroTeste: boolean;
}

const TAMANHO_PAGINA = 50;

function interpretarPesquisaStatus(status: string): StatusPesquisaInterpretado {
  const prefixoTeste = 'TESTE:';
  if (status.startsWith(prefixoTeste)) {
    return {
      statusBase: status.slice(prefixoTeste.length) || 'pendente',
      registroTeste: true,
    };
  }

  return { statusBase: status, registroTeste: false };
}

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

async function extrairMensagemErro(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (
    ehRegistro(error) &&
    error.context instanceof Response
  ) {
    const payload: unknown = await error.context.clone().json().catch(() => null);
    if (ehRegistro(payload)) {
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function PesquisaEvasaoTab({ unidadeAtual }: Props) {
  const toast = useToast();
  const sentinelRef = useWidgetOverlapSentinel();

  const [evadidos, setEvadidos] = useState<EvadidoPesquisa[]>([]);
  const [stats, setStats] = useState<StatsPesquisa | null>(null);
  const [loading, setLoading] = useState(true);
  const [previsualizando, setPrevisualizando] = useState<number | null>(null);
  const [preview, setPreview] = useState<PesquisaEvasaoPreview | null>(null);
  const [modalPreviewAberto, setModalPreviewAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const previsualizandoRef = useRef(false);
  const confirmandoRef = useRef(false);
  const [modoTeste, setModoTeste] = useState(false);
  const [telefoneTeste, setTelefoneTeste] = useState('');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroAno, setFiltroAno] = useState<number>(new Date().getFullYear());
  const [filtroMes, setFiltroMes] = useState<number | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [historicoTesteExpandido, setHistoricoTesteExpandido] = useState<number | null>(null);
  const [historicosTeste, setHistoricosTeste] = useState<Record<number, PesquisaEvasaoTeste[]>>({});
  const [carregandoHistorico, setCarregandoHistorico] = useState<number | null>(null);
  const filtroServidorChave = [
    unidadeAtual,
    filtroStatus,
    filtroAno,
    filtroMes ?? 'todos',
    filtroBusca.trim(),
  ].join(':');
  const filtroServidorAnteriorRef = useRef(filtroServidorChave);
  const carregamentoDadosSequenciaRef = useRef(0);
  const consultaDadosAtualRef = useRef({
    chave: `${filtroServidorChave}:${pagina}`,
    unidadeAtual,
    pagina,
    filtroStatus,
    filtroAno,
    filtroMes,
    filtroBusca: filtroBusca.trim(),
  });
  consultaDadosAtualRef.current = {
    chave: `${filtroServidorChave}:${pagina}`,
    unidadeAtual,
    pagina,
    filtroStatus,
    filtroAno,
    filtroMes,
    filtroBusca: filtroBusca.trim(),
  };

  useEffect(() => {
    setPagina(1);
  }, [unidadeAtual, filtroStatus, filtroAno, filtroMes, filtroBusca]);

  useEffect(() => {
    const filtrosMudaram =
      filtroServidorAnteriorRef.current !== filtroServidorChave;
    if (filtrosMudaram && pagina !== 1) return;
    filtroServidorAnteriorRef.current = filtroServidorChave;
    carregarDados();
  }, [filtroServidorChave, pagina]);

  // Realtime: atualizar automaticamente quando pesquisa_evasao mudar
  useEffect(() => {
    const channel = supabase
      .channel('pesquisa_evasao_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pesquisa_evasao'
        },
        (payload) => {
          console.log('[Realtime] Mudança em pesquisa_evasao:', payload);
          if (!confirmandoRef.current) carregarDados();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filtroServidorChave, pagina]);

  const carregarDados = async () => {
    const sequencia = ++carregamentoDadosSequenciaRef.current;
    const consulta = consultaDadosAtualRef.current;
    const requisicaoAindaAtual = () =>
      sequencia === carregamentoDadosSequenciaRef.current &&
      consulta.chave === consultaDadosAtualRef.current.chave;

    setLoading(true);
    try {
      const { data: evadidosData, error: evadidosError } = await supabase.rpc(
        'listar_evadidos_para_pesquisa_v2',
        { 
          p_unidade_id: consulta.unidadeAtual === 'todos' ? null : consulta.unidadeAtual,
          p_limite: TAMANHO_PAGINA,
          p_offset: (consulta.pagina - 1) * TAMANHO_PAGINA,
          p_status: consulta.filtroStatus === 'todos' ? null : consulta.filtroStatus,
          p_ano: consulta.filtroAno,
          p_mes: consulta.filtroMes,
          p_busca: consulta.filtroBusca || null,
        }
      );

      if (evadidosError) throw evadidosError;
      if (!requisicaoAindaAtual()) return;

      const linhas = (evadidosData || []) as PesquisaEvasaoListagemItem[];
      setTotalRegistros(Number(linhas[0]?.total_count ?? 0));
      setEvadidos(linhas.map((item) => ({
        ...item,
        pesquisa_status: item.pesquisa_producao_status,
        pesquisa_id: item.pesquisa_producao_id,
        resposta_texto: item.resposta_producao_texto,
        resposta_audio_url: item.resposta_producao_audio_url,
        resposta_tipo: item.resposta_producao_tipo,
        respondido_em: item.respondido_producao_em,
      })));

      // Buscar stats
      const { data: statsData, error: statsError } = await supabase.rpc(
        'stats_pesquisa_evasao',
        { 
          p_unidade_id: consulta.unidadeAtual === 'todos' ? null : consulta.unidadeAtual,
          p_ano: new Date().getFullYear(),
          p_mes: new Date().getMonth() + 1
        }
      );

      if (statsError) throw statsError;
      if (!requisicaoAindaAtual()) return;

      if (statsData && statsData.length > 0) {
        setStats(statsData[0]);
      }
    } catch (error) {
      if (!requisicaoAindaAtual()) return;

      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados da pesquisa');
    } finally {
      if (requisicaoAindaAtual()) setLoading(false);
    }
  };

  const previsualizarPesquisa = async (evasaoId: number) => {
    if (previsualizandoRef.current || confirmandoRef.current) return;

    if (modoTeste && !telefoneTeste.trim()) {
      toast.error('Informe o número para o teste');
      return;
    }

    if (modoTeste) {
      const telefoneNormalizado = telefoneTeste.replace(/\D/g, '');
      if (!/^(?:55)?\d{10,11}$/.test(telefoneNormalizado)) {
        toast.error('Informe um telefone de teste válido com DDD');
        return;
      }
    }

    previsualizandoRef.current = true;
    setPrevisualizando(evasaoId);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-pesquisa-evasao', {
        body: {
          acao: 'previsualizar',
          evasao_id: evasaoId,
          modo_teste: modoTeste,
          telefone_teste: modoTeste ? telefoneTeste : undefined,
        }
      });

      if (error) throw error;

      const resposta = data as unknown;
      if (
        !ehRegistro(resposta) ||
        typeof resposta.preview_id !== 'string' ||
        typeof resposta.expira_em !== 'string'
      ) {
        throw new Error('A Edge retornou uma prévia inválida');
      }

      setPreview(resposta as unknown as PesquisaEvasaoPreview);
      setModalPreviewAberto(true);
    } catch (error: unknown) {
      console.error('Erro ao gerar prévia da pesquisa:', error);
      const mensagem = await extrairMensagemErro(
        error,
        'Erro ao gerar prévia da pesquisa',
      );
      toast.error(mensagem);
    } finally {
      previsualizandoRef.current = false;
      setPrevisualizando(null);
    }
  };

  const confirmarEnvio = async () => {
    if (!preview || confirmandoRef.current) return;

    if (
      !Number.isFinite(Date.parse(preview.expira_em)) ||
      Date.parse(preview.expira_em) <= Date.now()
    ) {
      toast.error('A prévia expirou. Gere uma nova prévia antes de confirmar.');
      return;
    }

    const preview_id = preview.preview_id;
    confirmandoRef.current = true;
    setConfirmando(true);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-pesquisa-evasao', {
        body: {
          acao: 'confirmar',
          preview_id: preview_id,
        },
      });

      if (error) throw error;

      const resposta = data as unknown as PesquisaEvasaoConfirmacao | null;
      if (resposta?.success === true && resposta.envio_status === 'enviado') {
        toast.success(
          resposta.modo_teste
            ? 'Teste enviado com sucesso!'
            : 'Pesquisa enviada com sucesso!',
        );
        if (
          resposta.modo_teste !== true &&
          resposta.captura_resposta_preparada === false
        ) {
          toast.warning(
            'Mensagem enviada, mas a captura da resposta não foi preparada',
            resposta.warning ||
              'Não reenvie. A equipe deve verificar a conversa antes de qualquer ação.',
          );
        }
        setModalPreviewAberto(false);
        setPreview(null);
        await carregarDados();
        return;
      }

      const detalhe =
        resposta?.error ||
        resposta?.message ||
        resposta?.mensagem;
      if (
        resposta?.envio_status === 'incerto' ||
        resposta?.envio_status === 'bloqueado'
      ) {
        toast.warning(
          'Envio sem confirmação segura',
          detalhe ||
            'Não tente novamente. A tentativa precisa ser reconciliada pela equipe.',
        );
        return;
      }

      toast.error(
        detalhe ||
          'O envio não foi concluído. Gere uma nova prévia somente após verificar o status.',
      );
    } catch (error: unknown) {
      console.error('Erro ao confirmar pesquisa:', error);
      const mensagem = await extrairMensagemErro(
        error,
        'Não foi possível confirmar o envio',
      );
      toast.error(mensagem);
    } finally {
      confirmandoRef.current = false;
      setConfirmando(false);
    }
  };

  const alterarModalPreview = (aberto: boolean) => {
    if (!aberto && confirmandoRef.current) return;
    setModalPreviewAberto(aberto);
    if (!aberto) setPreview(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pendente':
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
      case 'enviado':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'respondido':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'sem_whatsapp':
      case 'falha_envio':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'ignorado':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pendente':
        return 'Pendente';
      case 'enviado':
        return 'Enviado';
      case 'respondido':
        return 'Respondido';
      case 'sem_whatsapp':
        return 'Sem WhatsApp';
      case 'falha_envio':
        return 'Falha';
      case 'ignorado':
        return 'Ignorado';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Clock className="w-4 h-4" />;
      case 'enviado':
        return <Send className="w-4 h-4" />;
      case 'respondido':
        return <CheckCircle className="w-4 h-4" />;
      case 'sem_whatsapp':
      case 'falha_envio':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const carregarHistoricoTeste = async (evasaoId: number) => {
    if (historicoTesteExpandido === evasaoId) {
      setHistoricoTesteExpandido(null);
      return;
    }

    setHistoricoTesteExpandido(evasaoId);
    if (historicosTeste[evasaoId]) return;

    setCarregandoHistorico(evasaoId);
    try {
      const { data, error } = await supabase.rpc(
        'listar_pesquisas_evasao_teste_v1',
        { p_evasao_id: evasaoId },
      );
      if (error) throw error;

      const testes = ((data || []) as PesquisaEvasaoTeste[])
        .filter((item) => item.modo_teste === true);
      setHistoricosTeste((atual) => ({ ...atual, [evasaoId]: testes }));
    } catch (error) {
      console.error('Erro ao carregar histórico de testes:', error);
      setHistoricoTesteExpandido(null);
      toast.error('Erro ao carregar histórico de testes');
    } finally {
      setCarregandoHistorico(null);
    }
  };

  const getBloqueioLabel = (codigo: PesquisaEvasaoListagemItem['bloqueio_codigo']) => {
    switch (codigo) {
      case 'sem_aluno':
        return 'Aluno não localizado';
      case 'sem_telefone':
        return 'Sem telefone';
      case 'telefone_invalido':
        return 'Telefone inválido';
      case 'motivo_nao_catalogado':
        return 'Motivo não catalogado';
      case 'publico_interno':
        return 'Público interno';
      case 'pesquisa_aberta_no_mesmo_numero':
        return 'Pesquisa aberta no mesmo número';
      default:
        return null;
    }
  };

  const getElegibilidadeLabel = (regra: string) => {
    switch (regra) {
      case 'status_producao_nao_enviavel':
        return 'Envio produtivo já processado';
      default:
        return getBloqueioLabel(regra as PesquisaEvasaoListagemItem['bloqueio_codigo']);
    }
  };
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / TAMANHO_PAGINA));
  const inicioPagina = totalRegistros === 0
    ? 0
    : (pagina - 1) * TAMANHO_PAGINA + 1;
  const fimPagina = Math.min(pagina * TAMANHO_PAGINA, totalRegistros);

  return (
    <div className="space-y-6">
      {/* Header e Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Evadidos */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Evadidos</p>
              <p className="text-2xl font-bold text-white mt-1">
                {stats?.total_evadidos || 0}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {stats?.total_com_telefone || 0} com telefone
          </p>
        </div>

        {/* Pendentes */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Pendentes</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                {stats?.total_pendentes || 0}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Aguardando envio
          </p>
        </div>

        {/* Enviados */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Enviados</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                {stats?.total_enviados || 0}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Send className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Aguardando resposta
          </p>
        </div>

        {/* Respondidos */}
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Respondidos</p>
              <p className="text-2xl font-bold text-green-400 mt-1">
                {stats?.total_respondidos || 0}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-green-400" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Taxa: {stats?.taxa_resposta?.toFixed(1) || 0}%
          </p>
        </div>
      </div>

      {/* Insights */}
      {stats && stats.total_respondidos > 0 && (
        <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            <h3 className="font-medium text-white">Insights das Respostas</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-sm text-slate-300 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              {stats.respondidos_texto} respostas em texto
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-sm text-slate-300 flex items-center gap-2">
              <Phone className="w-4 h-4 text-green-400" />
              {stats.respondidos_audio} respostas em áudio
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-sm text-slate-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-400" />
              Taxa de resposta: {stats.taxa_resposta?.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, curso, professor..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700">
              <FlaskConical className={`w-4 h-4 ${modoTeste ? 'text-yellow-400' : 'text-slate-500'}`} />
              <span className="text-sm text-slate-400">Modo Teste</span>
              <button
                onClick={() => setModoTeste(!modoTeste)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  modoTeste ? 'bg-yellow-500' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    modoTeste ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {modoTeste && (
              <Input
                placeholder="Número p/ teste (ex: 5521981278047)"
                value={telefoneTeste}
                onChange={(e) => setTelefoneTeste(e.target.value)}
                className="w-64 bg-slate-900/50 border-slate-700 text-white text-sm"
              />
            )}
          </div>

          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-700 text-white">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="respondido">Respondido</SelectItem>
              <SelectItem value="sem_whatsapp">Sem WhatsApp</SelectItem>
              <SelectItem value="falha_envio">Falha</SelectItem>
            </SelectContent>
          </Select>

          <Select 
            value={filtroAno.toString()} 
            onValueChange={(v) => setFiltroAno(parseInt(v))}
          >
            <SelectTrigger className="w-[120px] bg-slate-900/50 border-slate-700 text-white">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>

          <Select 
            value={filtroMes?.toString() || 'todos'} 
            onValueChange={(v) => setFiltroMes(v === 'todos' ? null : parseInt(v))}
          >
            <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-700 text-white">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="todos">Todos os meses</SelectItem>
              <SelectItem value="1">Janeiro</SelectItem>
              <SelectItem value="2">Fevereiro</SelectItem>
              <SelectItem value="3">Março</SelectItem>
              <SelectItem value="4">Abril</SelectItem>
              <SelectItem value="5">Maio</SelectItem>
              <SelectItem value="6">Junho</SelectItem>
              <SelectItem value="7">Julho</SelectItem>
              <SelectItem value="8">Agosto</SelectItem>
              <SelectItem value="9">Setembro</SelectItem>
              <SelectItem value="10">Outubro</SelectItem>
              <SelectItem value="11">Novembro</SelectItem>
              <SelectItem value="12">Dezembro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela de Evadidos */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/80 border-b-2 border-slate-600">
              <tr>
                <th className="text-left px-4 py-3 text-slate-400 text-sm font-medium">Aluno</th>
                <th className="text-left px-4 py-3 text-slate-400 text-sm font-medium">Responsável</th>
                <th className="text-left px-4 py-3 text-slate-400 text-sm font-medium">WhatsApp</th>
                <th className="text-left px-4 py-3 text-slate-400 text-sm font-medium">Curso</th>
                <th className="text-left px-4 py-3 text-slate-400 text-sm font-medium">Professor</th>
                <th className="text-center px-4 py-3 text-slate-400 text-sm font-medium">Tempo</th>
                <th className="text-left px-4 py-3 text-slate-400 text-sm font-medium">Motivo</th>
                <th className="text-center px-4 py-3 text-slate-400 text-sm font-medium">Status</th>
                <th className="text-center px-4 py-3 text-slate-400 text-sm font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {evadidos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-500">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Carregando...
                      </div>
                    ) : (
                      'Nenhum evadido encontrado'
                    )}
                  </td>
                </tr>
              ) : (
                evadidos.map((evadido) => {
                  const { statusBase, registroTeste } =
                    interpretarPesquisaStatus(evadido.pesquisa_status);
                  const statusProducaoPermiteEnvio =
                    !registroTeste && ['pendente', 'falha_envio', 'sem_whatsapp'].includes(statusBase);
                  const podeGerarPreview = modoTeste
                    ? !registroTeste &&
                      !['sem_aluno', 'publico_interno'].includes(evadido.bloqueio_codigo || '') &&
                      !['colaborador', 'professor'].includes(evadido.publico_tipo)
                    : evadido.elegivel_envio && statusProducaoPermiteEnvio;

                  return (
                    <Fragment key={evadido.evasao_id}>
                    <tr 
                      className="hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-white">{evadido.nome}</p>
                          <p className="text-xs text-slate-500">
                            {format(new Date(evadido.data_evasao), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        {evadido.is_menor ? (
                          evadido.responsavel_nome && evadido.responsavel_nome !== '—' ? (
                            <span className="text-amber-400">{evadido.responsavel_nome}</span>
                          ) : (
                            <span className="text-red-400 text-xs">Não cadastrado</span>
                          )
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <p className="text-slate-300 text-sm font-mono">
                            {evadido.telefone || 'Não informado'}
                          </p>
                          {['sem_aluno', 'sem_telefone', 'telefone_invalido']
                            .includes(evadido.bloqueio_codigo || '') && (
                            <Button
                              disabled
                              size="sm"
                              variant="ghost"
                              title="A ficha de aluno ainda não possui navegação contextual segura."
                              className="h-auto p-0 text-[11px] text-amber-300/80 disabled:opacity-100"
                            >
                              <LockKeyhole className="mr-1 h-3 w-3" />
                              Corrigir no cadastro do aluno
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{evadido.curso || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{evadido.professor || '—'}</td>
                      <td className="text-center px-4 py-3 text-slate-300">
                        {evadido.tempo_meses}m
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        {evadido.motivo_catalogado || evadido.motivo_legado || '—'}
                        {!evadido.motivo_catalogado && evadido.motivo_legado && (
                          <span className="mt-1 block text-[10px] uppercase tracking-wide text-amber-400">
                            Motivo legado
                          </span>
                        )}
                      </td>
                      <td className="text-center px-4 py-3">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          {registroTeste && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400/35 bg-yellow-400/15 px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-yellow-200">
                              <FlaskConical className="h-3 w-3" />
                              TESTE
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(statusBase)}`}>
                            {getStatusIcon(statusBase)}
                            {getStatusLabel(statusBase)}
                          </span>
                          {evadido.bloqueio_codigo && (
                            <span className="inline-flex rounded-full border border-red-400/30 bg-red-400/10 px-2 py-1 text-[10px] font-medium text-red-200">
                              {getBloqueioLabel(evadido.bloqueio_codigo)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-center px-4 py-3">
                        <div className="flex min-w-40 flex-col items-center gap-1">
                          {podeGerarPreview ? (
                            <Button
                              size="sm"
                              onClick={() => previsualizarPesquisa(evadido.evasao_id)}
                              disabled={previsualizando !== null || confirmando}
                              className={`${modoTeste ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-violet-500 hover:bg-violet-600'} text-white`}
                            >
                              {previsualizando === evadido.evasao_id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Send className="w-4 h-4 mr-1.5" />
                                  {modoTeste
                                    ? 'Testar'
                                    : statusBase === 'pendente'
                                      ? 'Enviar'
                                      : 'Tentar novamente'}
                                </>
                              )}
                            </Button>
                          ) : !registroTeste && statusBase === 'respondido' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandido(expandido === evadido.pesquisa_id ? null : evadido.pesquisa_id)}
                              className="text-green-400 hover:text-green-300"
                            >
                              {expandido === evadido.pesquisa_id ? (
                                <>
                                  <ChevronUp className="w-4 h-4 mr-1" />
                                  Ocultar
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4 mr-1" />
                                  Ver Resposta
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="max-w-44 text-xs text-slate-500">
                              {getElegibilidadeLabel(evadido.elegibilidade_regra) || '—'}
                            </span>
                          )}
                          {evadido.possui_historico_teste && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => carregarHistoricoTeste(evadido.evasao_id)}
                              disabled={carregandoHistorico === evadido.evasao_id}
                              className="h-7 text-yellow-300 hover:text-yellow-200"
                            >
                              {carregandoHistorico === evadido.evasao_id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <History className="mr-1 h-3.5 w-3.5" />
                              )}
                              Histórico de testes
                              <span className="ml-1">TESTE</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    
                    {/* Expandir resposta */}
                    {!registroTeste && expandido === evadido.pesquisa_id && (evadido.resposta_texto || evadido.resposta_audio_url) && (
                      <tr className="bg-slate-900/30">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                            <p className="text-sm font-medium text-slate-400 mb-2">
                              Resposta do {evadido.is_menor ? 'Responsável' : 'Aluno'}:
                            </p>
                            {evadido.resposta_producao_tipo === 'audio' ? (
                              <div className="space-y-3">
                                {evadido.resposta_producao_texto ? (
                                  <>
                                    <p className="text-white text-base leading-relaxed">
                                      "{evadido.resposta_producao_texto}"
                                    </p>
                                    <div className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg inline-flex items-center gap-2">
                                      <MessageCircle className="w-4 h-4" />
                                      <span className="text-sm">Transcrição do áudio</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    <div className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg flex items-center gap-2">
                                      <MessageCircle className="w-4 h-4" />
                                      <span className="text-sm">Áudio recebido</span>
                                    </div>
                                    {evadido.resposta_producao_audio_url && (
                                      <audio controls className="h-10">
                                        <source src={evadido.resposta_producao_audio_url} type="audio/ogg" />
                                        Seu navegador não suporta áudio.
                                      </audio>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-white text-base leading-relaxed">
                                "{evadido.resposta_producao_texto}"
                              </p>
                            )}
                            {evadido.respondido_producao_em && (
                              <p className="text-xs text-slate-500 mt-2">
                                Respondido em: {format(new Date(evadido.respondido_producao_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    {historicoTesteExpandido === evadido.evasao_id && (
                      <tr className="bg-yellow-400/[0.04]">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="rounded-xl border border-yellow-400/20 bg-slate-900/50 p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <History className="h-4 w-4 text-yellow-300" />
                              <p className="text-sm font-medium text-white">Histórico de testes</p>
                              <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-yellow-200">TESTE</span>
                            </div>
                            {(historicosTeste[evadido.evasao_id] || []).length === 0 ? (
                              <p className="text-sm text-slate-500">Nenhum teste disponível.</p>
                            ) : (
                              <div className="space-y-2">
                                {historicosTeste[evadido.evasao_id]
                                  .filter((teste) => teste.modo_teste)
                                  .map((teste) => (
                                    <div
                                      key={teste.pesquisa_id}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-2"
                                    >
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="rounded bg-yellow-400/10 px-1.5 py-0.5 font-bold text-yellow-200">TESTE</span>
                                        <span className="text-slate-300">Envio: {teste.envio_status}</span>
                                        <span className="text-slate-500">Resposta: {teste.resposta_status}</span>
                                      </div>
                                      <span className="text-xs text-slate-500">
                                        {teste.enviado_em
                                          ? format(new Date(teste.enviado_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                                          : 'Sem horário de envio'}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/60 bg-slate-900/40 px-4 py-3">
          <p className="text-sm text-slate-400">
            Mostrando {inicioPagina}–{fimPagina} de {totalRegistros}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Página anterior"
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              disabled={loading || pagina <= 1}
              className="border-slate-700 bg-slate-800 text-slate-200"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="min-w-24 text-center text-xs text-slate-500">
              Página {pagina} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Próxima página"
              onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}
              disabled={loading || pagina >= totalPaginas}
              className="border-slate-700 bg-slate-800 text-slate-200"
            >
              Próxima
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <ModalPreviewPesquisaEvasao
        aberto={modalPreviewAberto}
        preview={preview}
        confirmando={confirmando}
        onAbertoChange={alterarModalPreview}
        onConfirmar={confirmarEnvio}
      />
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
    </div>
  );
}
