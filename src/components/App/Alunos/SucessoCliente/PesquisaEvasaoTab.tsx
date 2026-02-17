import { Fragment, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  Send, MessageSquare, CheckCircle, XCircle, Clock,
  Loader2, Phone, Search, ChevronDown, ChevronUp,
  TrendingUp, Users, MessageCircle, BarChart3
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
import { Check, X, FlaskConical } from 'lucide-react';

interface EvadidoPesquisa {
  evasao_id: number;
  aluno_id: number | null;
  nome: string;
  telefone: string;
  curso: string | null;
  professor: string | null;
  tempo_meses: number;
  data_evasao: string;
  motivo_cadastrado: string | null;
  pesquisa_status: string;
  pesquisa_id: string | null;
  resposta_texto: string | null;
  resposta_audio_url: string | null;
  resposta_tipo: string | null;
  respondido_em: string | null;
  is_menor: boolean;
  responsavel_nome: string | null;
}

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

export function PesquisaEvasaoTab({ unidadeAtual }: Props) {
  const toast = useToast();
  
  const [evadidos, setEvadidos] = useState<EvadidoPesquisa[]>([]);
  const [stats, setStats] = useState<StatsPesquisa | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [editandoTelefone, setEditandoTelefone] = useState<number | null>(null);
  const [novoTelefone, setNovoTelefone] = useState('');
  const [modoTeste, setModoTeste] = useState(false);
  const [telefoneTeste, setTelefoneTeste] = useState('');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroAno, setFiltroAno] = useState<number>(new Date().getFullYear());
  const [filtroMes, setFiltroMes] = useState<number | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    carregarDados();
  }, [unidadeAtual, filtroStatus, filtroAno, filtroMes]);

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
          // Recarregar dados quando houver mudança
          carregarDados();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [unidadeAtual, filtroStatus, filtroAno, filtroMes]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Buscar evadidos com pesquisa
      const { data: evadidosData, error: evadidosError } = await supabase.rpc(
        'listar_evadidos_para_pesquisa',
        { 
          p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
          p_limite: 100,
          p_offset: 0,
          p_status: filtroStatus === 'todos' ? null : filtroStatus,
          p_ano: filtroAno,
          p_mes: filtroMes
        }
      );

      if (evadidosError) throw evadidosError;
      setEvadidos(evadidosData || []);

      // Buscar stats
      const { data: statsData, error: statsError } = await supabase.rpc(
        'stats_pesquisa_evasao',
        { 
          p_unidade_id: unidadeAtual === 'todos' ? null : unidadeAtual,
          p_ano: new Date().getFullYear(),
          p_mes: new Date().getMonth() + 1
        }
      );

      if (statsError) throw statsError;
      if (statsData && statsData.length > 0) {
        setStats(statsData[0]);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados da pesquisa');
    } finally {
      setLoading(false);
    }
  };

  const enviarPesquisa = async (evasaoId: number, telefoneOverride?: string) => {
    setEnviando(evasaoId);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-pesquisa-evasao', {
        body: { 
          evasao_id: evasaoId,
          operador: 'sistema',
          telefone_override: telefoneOverride // Para modo teste
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Pesquisa enviada com sucesso!');
        await carregarDados();
      } else {
        toast.error(data?.error || 'Erro ao enviar pesquisa');
      }
    } catch (error: any) {
      console.error('Erro ao enviar pesquisa:', error);
      toast.error(error.message || 'Erro ao enviar pesquisa');
    } finally {
      setEnviando(null);
    }
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

  const salvarTelefone = async (movimentacaoId: number, telefone: string) => {
    try {
      // Buscar a movimentação para encontrar o aluno_id e data
      const { data: mov } = await supabase
        .from('movimentacoes_admin')
        .select('aluno_id, unidade_id, data')
        .eq('id', movimentacaoId)
        .single();

      if (!mov) {
        toast.error('Movimentação não encontrada');
        return;
      }

      // Atualizar evasoes_v2 correspondente
      const { error: evasaoError } = await supabase
        .from('evasoes_v2')
        .update({ telefone_snapshot: telefone, updated_at: new Date().toISOString() })
        .eq('aluno_id', mov.aluno_id)
        .eq('unidade_id', mov.unidade_id)
        .eq('data_evasao', mov.data);

      // Também atualizar na tabela alunos (whatsapp)
      if (mov.aluno_id) {
        await supabase
          .from('alunos')
          .update({ whatsapp: telefone, updated_at: new Date().toISOString() })
          .eq('id', mov.aluno_id);
      }

      if (evasaoError) throw evasaoError;

      toast.success('Telefone atualizado com sucesso!');
      await carregarDados();
    } catch (error) {
      console.error('Erro ao salvar telefone:', error);
      toast.error('Erro ao atualizar telefone');
    }
  };
  const evadidosFiltrados = evadidos.filter(e => {
    if (filtroBusca) {
      const busca = filtroBusca.toLowerCase();
      return (
        e.nome?.toLowerCase().includes(busca) ||
        e.curso?.toLowerCase().includes(busca) ||
        e.professor?.toLowerCase().includes(busca) ||
        e.motivo_cadastrado?.toLowerCase().includes(busca)
      );
    }
    return true;
  });

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
              {evadidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500">
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
                evadidosFiltrados.map((evadido) => (
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
                      <td className="px-4 py-3 group">
                        <div className="flex items-center gap-2">
                          {editandoTelefone === evadido.evasao_id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={novoTelefone}
                                onChange={(e) => setNovoTelefone(e.target.value)}
                                className="w-36 h-7 text-xs bg-slate-900 border-slate-600 text-white"
                                autoFocus
                              />
                              <button
                                onClick={() => {
                                  salvarTelefone(evadido.evasao_id, novoTelefone);
                                  setEditandoTelefone(null);
                                }}
                                className="p-1 text-green-400 hover:text-green-300"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditandoTelefone(null)}
                                className="p-1 text-red-400 hover:text-red-300"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditandoTelefone(evadido.evasao_id);
                                setNovoTelefone(evadido.telefone || '');
                              }}
                              className="text-slate-300 text-sm font-mono hover:text-white hover:underline underline-offset-2"
                            >
                              {evadido.telefone || '—'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{evadido.curso || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{evadido.professor || '—'}</td>
                      <td className="text-center px-4 py-3 text-slate-300">
                        {evadido.tempo_meses}m
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        {evadido.motivo_cadastrado || '—'}
                      </td>
                      <td className="text-center px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(evadido.pesquisa_status)}`}>
                          {getStatusIcon(evadido.pesquisa_status)}
                          {getStatusLabel(evadido.pesquisa_status)}
                        </span>
                      </td>
                      <td className="text-center px-4 py-3">
                        {evadido.pesquisa_status === 'pendente' ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              if (modoTeste && telefoneTeste) {
                                enviarPesquisa(evadido.evasao_id, telefoneTeste);
                              } else {
                                enviarPesquisa(evadido.evasao_id);
                              }
                            }}
                            disabled={enviando === evadido.evasao_id}
                            className={`${modoTeste ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-violet-500 hover:bg-violet-600'} text-white`}
                          >
                            {enviando === evadido.evasao_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Send className="w-4 h-4 mr-1.5" />
                                {modoTeste ? 'Testar' : 'Enviar'}
                              </>
                            )}
                          </Button>
                        ) : evadido.pesquisa_status === 'respondido' ? (
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
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                    
                    {/* Expandir resposta */}
                    {expandido === evadido.pesquisa_id && (evadido.resposta_texto || evadido.resposta_audio_url) && (
                      <tr className="bg-slate-900/30">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                            <p className="text-sm font-medium text-slate-400 mb-2">
                              Resposta do {evadido.is_menor ? 'Responsável' : 'Aluno'}:
                            </p>
                            {evadido.resposta_tipo === 'audio' ? (
                              <div className="space-y-3">
                                {evadido.resposta_texto ? (
                                  <>
                                    <p className="text-white text-base leading-relaxed">
                                      "{evadido.resposta_texto}"
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
                                    {evadido.resposta_audio_url && (
                                      <audio controls className="h-10">
                                        <source src={evadido.resposta_audio_url} type="audio/ogg" />
                                        Seu navegador não suporta áudio.
                                      </audio>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-white text-base leading-relaxed">
                                "{evadido.resposta_texto}"
                              </p>
                            )}
                            {evadido.respondido_em && (
                              <p className="text-xs text-slate-500 mt-2">
                                Respondido em: {format(new Date(evadido.respondido_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
