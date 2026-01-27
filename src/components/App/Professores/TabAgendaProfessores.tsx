import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isToday, isTomorrow, isPast, isSameWeek, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, CheckCircle2, Clock,
  AlertTriangle, Users, BookOpen, Target, MessageSquare, Loader2,
  LayoutList, CalendarDays, Columns, RefreshCw, Trash2, Edit2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/toast';
import { ModalNovaAcao } from './ModalNovaAcao';
import { ModalTreinamento } from './ModalTreinamento';

interface Acao {
  id: string;
  professor_id: number;
  professor_nome: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  data_agendada: string;
  duracao_minutos: number;
  local: string | null;
  status: string;
  meta_id: string | null;
  responsavel: string | null;
}

interface Treinamento {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  foco: string;
  icone: string;
}

interface MetaEmAndamento {
  id: string;
  professor_id: number;
  professor_nome: string;
  tipo: string;
  valor_atual: number | null;
  valor_meta: number;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  acoes: Acao[];
}

interface ResumoSemana {
  treinamentos: number;
  reunioes: number;
  checkpoints: number;
  atrasados: number;
  concluidos: number;
}

interface Props {
  unidadeAtual: UnidadeId;
  competencia: string;
}

export function TabAgendaProfessores({ unidadeAtual, competencia }: Props) {
  const toast = useToast();

  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [metas, setMetas] = useState<MetaEmAndamento[]>([]);
  const [treinamentos, setTreinamentos] = useState<Treinamento[]>([]);
  const [professores, setProfessores] = useState<{ id: number; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [semanaAtual, setSemanaAtual] = useState(new Date());
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroProfessor, setFiltroProfessor] = useState('todos');
  const [filtroResponsavel, setFiltroResponsavel] = useState<'todos' | 'juliana' | 'quintela'>('todos');
  const [visualizacao, setVisualizacao] = useState<'lista' | 'calendario' | 'kanban'>('lista');
  const [modoCalendario, setModoCalendario] = useState<'semana' | 'mes'>('semana');

  const [modalAcao, setModalAcao] = useState<{ 
    open: boolean; 
    professorId: number | null; 
    dataInicial?: Date; 
    responsavelInicial?: string;
    acaoParaEditar?: Acao | null;
  }>({
    open: false,
    professorId: null,
    acaoParaEditar: null
  });
  const [mostrarTodosTreinamentos, setMostrarTodosTreinamentos] = useState(false);
  const [modalTreinamento, setModalTreinamento] = useState<{ open: boolean; slug: string }>({
    open: false,
    slug: ''
  });

  useEffect(() => {
    carregarDados();
  }, [unidadeAtual, semanaAtual]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const inicioSemana = startOfWeek(semanaAtual, { weekStartsOn: 1 });
      const fimSemana = endOfWeek(addWeeks(semanaAtual, 1), { weekStartsOn: 1 });

      // Carregar ações da semana
      let queryAcoes = supabase
        .from('professor_acoes')
        .select(`
          id, professor_id, tipo, titulo, descricao, data_agendada, 
          duracao_minutos, local, status, meta_id,
          professores:professor_id (nome)
        `)
        .gte('data_agendada', inicioSemana.toISOString())
        .lte('data_agendada', fimSemana.toISOString())
        .order('data_agendada');

      // Também carregar atrasados (antes da semana atual, ainda pendentes)
      const { data: acoesData } = await queryAcoes;

      const { data: atrasadosData } = await supabase
        .from('professor_acoes')
        .select(`
          id, professor_id, tipo, titulo, descricao, data_agendada, 
          duracao_minutos, local, status, meta_id,
          professores:professor_id (nome)
        `)
        .lt('data_agendada', inicioSemana.toISOString())
        .eq('status', 'pendente')
        .order('data_agendada');

      const todasAcoes: Acao[] = [...(atrasadosData || []), ...(acoesData || [])].map((a: any) => ({
        ...a,
        professor_nome: a.professores?.nome || 'Professor'
      }));

      setAcoes(todasAcoes);

      // Carregar catálogo de treinamentos
      const { data: treinamentosData } = await supabase
        .from('catalogo_treinamentos')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      setTreinamentos(treinamentosData || []);

      // Carregar professores para filtro
      const { data: professoresData } = await supabase
        .from('professores')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

      setProfessores(professoresData || []);

      // Carregar metas em andamento com ações relacionadas
      const { data: metasData } = await supabase
        .from('professor_metas')
        .select(`
          id, professor_id, tipo, valor_atual, valor_meta, 
          data_inicio, data_fim, status,
          professores:professor_id (nome)
        `)
        .eq('status', 'em_andamento')
        .order('data_fim');

      if (metasData) {
        // Para cada meta, buscar ações relacionadas
        const metasComAcoes: MetaEmAndamento[] = await Promise.all(
          metasData.map(async (meta: any) => {
            const { data: acoesMetaData } = await supabase
              .from('professor_acoes')
              .select('id, tipo, titulo, data_agendada, status')
              .eq('professor_id', meta.professor_id)
              .order('data_agendada');

            return {
              ...meta,
              professor_nome: meta.professores?.nome || 'Professor',
              acoes: (acoesMetaData || []).map((a: any) => ({
                ...a,
                professor_id: meta.professor_id,
                professor_nome: meta.professores?.nome || 'Professor',
                descricao: null,
                duracao_minutos: 60,
                local: null,
                meta_id: meta.id
              }))
            };
          })
        );
        setMetas(metasComAcoes);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar agenda');
    } finally {
      setLoading(false);
    }
  };

  const handleConcluirAcao = async (acaoId: string) => {
    try {
      const { error } = await supabase
        .from('professor_acoes')
        .update({ status: 'concluida', data_conclusao: new Date().toISOString() })
        .eq('id', acaoId);

      if (error) throw error;

      toast.success('Ação concluída!');
      carregarDados();
    } catch (error) {
      console.error('Erro ao concluir ação:', error);
      toast.error('Erro ao concluir ação');
    }
  };

  const handleReagendarAcao = async (acaoId: string) => {
    // Por simplicidade, reagenda para amanhã
    try {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      amanha.setHours(10, 0, 0, 0);

      const { error } = await supabase
        .from('professor_acoes')
        .update({ data_agendada: amanha.toISOString(), status: 'reagendada' })
        .eq('id', acaoId);

      if (error) throw error;

      toast.success('Ação reagendada!');
      carregarDados();
    } catch (error) {
      console.error('Erro ao reagendar ação:', error);
      toast.error('Erro ao reagendar ação');
    }
  };

  const handleExcluirAcao = async (acaoId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta ação?')) return;
    
    try {
      const { error } = await supabase
        .from('professor_acoes')
        .delete()
        .eq('id', acaoId);

      if (error) throw error;

      toast.success('Ação excluída!');
      carregarDados();
    } catch (error) {
      console.error('Erro ao excluir ação:', error);
      toast.error('Erro ao excluir ação');
    }
  };

  // Filtrar ações
  const acoesFiltradas = useMemo(() => {
    let resultado = [...acoes];

    if (filtroTipo !== 'todos') {
      resultado = resultado.filter(a => a.tipo === filtroTipo);
    }

    if (filtroProfessor !== 'todos') {
      resultado = resultado.filter(a => a.professor_id === parseInt(filtroProfessor));
    }

    if (filtroResponsavel !== 'todos') {
      resultado = resultado.filter(a => a.responsavel === filtroResponsavel);
    }

    return resultado;
  }, [acoes, filtroTipo, filtroProfessor, filtroResponsavel]);

  // Função para obter cor do responsável
  const getResponsavelColor = (responsavel: string | null) => {
    if (responsavel === 'juliana') return 'border-l-purple-500 bg-purple-500/10';
    if (responsavel === 'quintela') return 'border-l-emerald-500 bg-emerald-500/10';
    if (responsavel === 'ambos') return 'border-l-cyan-500 bg-gradient-to-r from-purple-500/10 to-emerald-500/10';
    return 'border-l-slate-500 bg-slate-700/50';
  };

  // Função para abrir modal com data específica
  const abrirModalNovaAcao = (data?: Date) => {
    setModalAcao({ 
      open: true, 
      professorId: null, 
      dataInicial: data,
      responsavelInicial: filtroResponsavel !== 'todos' ? filtroResponsavel : undefined,
      acaoParaEditar: null
    });
  };

  // Função para abrir modal de edição
  const abrirModalEditarAcao = (acao: Acao) => {
    setModalAcao({
      open: true,
      professorId: acao.professor_id,
      acaoParaEditar: acao
    });
  };

  // Agrupar ações por período
  const acoesAgrupadas = useMemo(() => {
    const hoje: Acao[] = [];
    const amanha: Acao[] = [];
    const atrasados: Acao[] = [];
    const proximaSemana: Acao[] = [];

    acoesFiltradas.forEach(acao => {
      const dataAcao = new Date(acao.data_agendada);

      if (acao.status === 'pendente' && isPast(dataAcao) && !isToday(dataAcao)) {
        atrasados.push(acao);
      } else if (isToday(dataAcao)) {
        hoje.push(acao);
      } else if (isTomorrow(dataAcao)) {
        amanha.push(acao);
      } else {
        proximaSemana.push(acao);
      }
    });

    return { hoje, amanha, atrasados, proximaSemana };
  }, [acoesFiltradas]);

  // Resumo da semana
  const resumo = useMemo<ResumoSemana>(() => {
    const inicioSemana = startOfWeek(semanaAtual, { weekStartsOn: 1 });
    const fimSemana = endOfWeek(semanaAtual, { weekStartsOn: 1 });

    const acoesSemana = acoes.filter(a => {
      const data = new Date(a.data_agendada);
      return data >= inicioSemana && data <= fimSemana;
    });

    return {
      treinamentos: acoesSemana.filter(a => a.tipo === 'treinamento').length,
      reunioes: acoesSemana.filter(a => a.tipo === 'reuniao').length,
      checkpoints: acoesSemana.filter(a => a.tipo === 'checkpoint').length,
      atrasados: acoes.filter(a => a.status === 'pendente' && isPast(new Date(a.data_agendada)) && !isToday(new Date(a.data_agendada))).length,
      concluidos: acoesSemana.filter(a => a.status === 'concluida').length
    };
  }, [acoes, semanaAtual]);

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'treinamento': return 'bg-blue-500';
      case 'reuniao': return 'bg-purple-500';
      case 'checkpoint': return 'bg-green-500';
      case 'remanejamento': return 'bg-amber-500';
      case 'feedback': return 'bg-cyan-500';
      case 'mentoria': return 'bg-pink-500';
      default: return 'bg-slate-500';
    }
  };

  const getTipoBadgeColor = (tipo: string) => {
    switch (tipo) {
      case 'treinamento': return 'bg-blue-500/20 text-blue-400';
      case 'reuniao': return 'bg-purple-500/20 text-purple-400';
      case 'checkpoint': return 'bg-green-500/20 text-green-400';
      case 'remanejamento': return 'bg-amber-500/20 text-amber-400';
      case 'feedback': return 'bg-cyan-500/20 text-cyan-400';
      case 'mentoria': return 'bg-pink-500/20 text-pink-400';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const formatarSemana = () => {
    const inicio = startOfWeek(semanaAtual, { weekStartsOn: 1 });
    const fim = endOfWeek(semanaAtual, { weekStartsOn: 1 });
    return `${format(inicio, 'dd/MM')} - ${format(fim, 'dd/MM')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo da Semana */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            Resumo da Semana ({formatarSemana()})
          </h2>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSemanaAtual(subWeeks(semanaAtual, 1))}>
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSemanaAtual(addWeeks(semanaAtual, 1))}>
              Próxima
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{resumo.treinamentos}</p>
            <p className="text-xs text-slate-400">Treinamentos</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{resumo.reunioes}</p>
            <p className="text-xs text-slate-400">Reuniões</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{resumo.checkpoints}</p>
            <p className="text-xs text-slate-400">Checkpoints</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold ${resumo.atrasados > 0 ? 'text-yellow-400' : 'text-white'}`}>
              {resumo.atrasados}
            </p>
            <p className="text-xs text-slate-400">Atrasados</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{resumo.concluidos}</p>
            <p className="text-xs text-slate-400">Concluídos</p>
          </div>
        </div>
      </div>

      {/* Filtro de Coordenadores */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Agenda de:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFiltroResponsavel('juliana')}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition ${
                  filtroResponsavel === 'juliana'
                    ? 'bg-purple-500/20 text-purple-300 border-2 border-purple-500'
                    : 'bg-slate-700/50 text-slate-400 border-2 border-transparent hover:border-purple-500/50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                Juliana
              </button>
              <button
                onClick={() => setFiltroResponsavel('quintela')}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition ${
                  filtroResponsavel === 'quintela'
                    ? 'bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500'
                    : 'bg-slate-700/50 text-slate-400 border-2 border-transparent hover:border-emerald-500/50'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                Quintela
              </button>
              <button
                onClick={() => setFiltroResponsavel('todos')}
                className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition ${
                  filtroResponsavel === 'todos'
                    ? 'bg-blue-500/20 text-blue-300 border-2 border-blue-500'
                    : 'bg-slate-700/50 text-slate-400 border-2 border-transparent hover:border-blue-500/50'
                }`}
              >
                Ambos
              </button>
            </div>
          </div>
          <Button
            onClick={() => abrirModalNovaAcao()}
            className="bg-gradient-to-r from-blue-500 to-purple-500"
          >
            <Plus className="w-4 h-4 mr-1" />
            Nova Ação
          </Button>
        </div>
      </div>

      {/* Filtros e Visualização */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Visualização:</span>
          <div className="flex gap-1">
            {[
              { value: 'lista', icon: LayoutList, label: 'Lista' },
              { value: 'calendario', icon: CalendarDays, label: 'Calendário' },
              { value: 'kanban', icon: Columns, label: 'Kanban' }
            ].map((v) => (
              <button
                key={v.value}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition ${
                  visualizacao === v.value
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white'
                }`}
                onClick={() => setVisualizacao(v.value as any)}
              >
                <v.icon className="w-3 h-3" />
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="treinamento">Treinamentos</SelectItem>
              <SelectItem value="reuniao">Reuniões</SelectItem>
              <SelectItem value="checkpoint">Checkpoints</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroProfessor} onValueChange={setFiltroProfessor}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Professor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os prof.</SelectItem>
              {professores.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Visualização Lista */}
      {visualizacao === 'lista' && (
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
        {/* Atrasados */}
        {acoesAgrupadas.atrasados.length > 0 && (
          <div className="border-b border-slate-700 bg-red-500/5">
            <div className="px-4 py-3 bg-red-500/10">
              <p className="text-sm font-medium text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Atrasados ({acoesAgrupadas.atrasados.length})
              </p>
            </div>
            <div className="divide-y divide-slate-700/50">
              {acoesAgrupadas.atrasados.map((acao) => (
                <AcaoItem
                  key={acao.id}
                  acao={acao}
                  isAtrasado
                  getTipoColor={getTipoColor}
                  getTipoBadgeColor={getTipoBadgeColor}
                  onConcluir={handleConcluirAcao}
                  onReagendar={handleReagendarAcao}
                  onEditar={abrirModalEditarAcao}
                />
              ))}
            </div>
          </div>
        )}

        {/* Hoje */}
        <div className="border-b border-slate-700">
          <div className="px-4 py-3 bg-slate-800/50">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              📌 Hoje - {format(new Date(), "EEEE, dd/MM", { locale: ptBR })}
            </p>
          </div>
          {acoesAgrupadas.hoje.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">
              Nenhuma ação para hoje
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {acoesAgrupadas.hoje.map((acao) => (
                <AcaoItem
                  key={acao.id}
                  acao={acao}
                  getTipoColor={getTipoColor}
                  getTipoBadgeColor={getTipoBadgeColor}
                  onConcluir={handleConcluirAcao}
                  onReagendar={handleReagendarAcao}
                  onEditar={abrirModalEditarAcao}
                />
              ))}
            </div>
          )}
        </div>

        {/* Amanhã */}
        <div className="border-b border-slate-700">
          <div className="px-4 py-3 bg-slate-800/50">
            <p className="text-sm font-medium text-white">
              Amanhã - {format(new Date(Date.now() + 86400000), "EEEE, dd/MM", { locale: ptBR })}
            </p>
          </div>
          {acoesAgrupadas.amanha.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">
              Nenhuma ação para amanhã
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {acoesAgrupadas.amanha.map((acao) => (
                <AcaoItem
                  key={acao.id}
                  acao={acao}
                  getTipoColor={getTipoColor}
                  getTipoBadgeColor={getTipoBadgeColor}
                  onConcluir={handleConcluirAcao}
                  onReagendar={handleReagendarAcao}
                  onEditar={abrirModalEditarAcao}
                />
              ))}
            </div>
          )}
        </div>

        {/* Próxima Semana */}
        {acoesAgrupadas.proximaSemana.length > 0 && (
          <div>
            <div className="px-4 py-3 bg-slate-800/50">
              <p className="text-sm font-medium text-slate-400">Próximos dias</p>
            </div>
            <div className="divide-y divide-slate-700/50">
              {acoesAgrupadas.proximaSemana.map((acao) => (
                <AcaoItem
                  key={acao.id}
                  acao={acao}
                  getTipoColor={getTipoColor}
                  getTipoBadgeColor={getTipoBadgeColor}
                  onConcluir={handleConcluirAcao}
                  onReagendar={handleReagendarAcao}
                  onEditar={abrirModalEditarAcao}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Visualização Calendário */}
      {visualizacao === 'calendario' && (() => {
        const inicioSemana = startOfWeek(semanaAtual, { weekStartsOn: 0 });
        const diasSemana = Array.from({ length: 7 }).map((_, i) => {
          const dia = new Date(inicioSemana);
          dia.setDate(dia.getDate() + i);
          return dia;
        });

        // Para visualização mensal
        const inicioMes = startOfMonth(semanaAtual);
        const fimMes = endOfMonth(semanaAtual);
        const primeiroDiaSemana = getDay(inicioMes); // 0 = domingo
        const totalDiasMes = fimMes.getDate();
        const diasCalendarioMes = Array.from({ length: 42 }).map((_, i) => {
          const diaNumero = i - primeiroDiaSemana + 1;
          if (diaNumero < 1 || diaNumero > totalDiasMes) return null;
          const dia = new Date(inicioMes);
          dia.setDate(diaNumero);
          return dia;
        });

        return (
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
            {/* Header com navegação e toggle */}
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => modoCalendario === 'semana' 
                    ? setSemanaAtual(subWeeks(semanaAtual, 1))
                    : setSemanaAtual(subMonths(semanaAtual, 1))
                  }
                  className="p-1.5 hover:bg-slate-700 rounded-lg transition"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-400" />
                </button>
                <h3 className="text-lg font-semibold text-white min-w-[200px] text-center">
                  {modoCalendario === 'semana' 
                    ? `${format(inicioSemana, "d 'de' MMM", { locale: ptBR })} - ${format(diasSemana[6], "d 'de' MMM", { locale: ptBR })}`
                    : format(semanaAtual, "MMMM 'de' yyyy", { locale: ptBR })
                  }
                </h3>
                <button
                  onClick={() => modoCalendario === 'semana'
                    ? setSemanaAtual(addWeeks(semanaAtual, 1))
                    : setSemanaAtual(addMonths(semanaAtual, 1))
                  }
                  className="p-1.5 hover:bg-slate-700 rounded-lg transition"
                >
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
                <button
                  onClick={() => setSemanaAtual(new Date())}
                  className="ml-2 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition"
                >
                  Hoje
                </button>
              </div>
              
              {/* Toggle Semana/Mês */}
              <div className="flex bg-slate-700/50 rounded-lg p-1">
                <button
                  onClick={() => setModoCalendario('semana')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    modoCalendario === 'semana' 
                      ? 'bg-blue-500 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Semana
                </button>
                <button
                  onClick={() => setModoCalendario('mes')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                    modoCalendario === 'mes' 
                      ? 'bg-blue-500 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mês
                </button>
              </div>
            </div>

            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 border-b border-slate-700/50">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia) => (
                <div key={dia} className="p-2 text-center text-xs font-medium text-slate-400 uppercase">
                  {dia}
                </div>
              ))}
            </div>

            {/* VISUALIZAÇÃO SEMANAL */}
            {modoCalendario === 'semana' && (
              <>
                {/* Header com números dos dias */}
                <div className="grid grid-cols-7 border-b border-slate-700/50">
                  {diasSemana.map((dia, i) => {
                    const isDiaHoje = isToday(dia);
                    const acoesNoDia = acoesFiltradas.filter(a => 
                      format(new Date(a.data_agendada), 'yyyy-MM-dd') === format(dia, 'yyyy-MM-dd')
                    );
                    
                    return (
                      <div 
                        key={i} 
                        className={`p-3 text-center border-r border-slate-700/50 last:border-r-0 ${
                          isDiaHoje ? 'bg-blue-500/10' : ''
                        }`}
                      >
                        <div className={`text-2xl font-bold ${
                          isDiaHoje ? 'text-blue-400' : 'text-white'
                        }`}>
                          {format(dia, 'd')}
                        </div>
                        {acoesNoDia.length > 0 && (
                          <div className="text-xs text-cyan-400 mt-1">
                            {acoesNoDia.length} ação{acoesNoDia.length > 1 ? 'ões' : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Corpo com ações por dia */}
                <div className="grid grid-cols-7 min-h-[350px]">
                  {diasSemana.map((dia, i) => {
                    const isDiaHoje = isToday(dia);
                    const acoesNoDia = acoesFiltradas
                      .filter(a => format(new Date(a.data_agendada), 'yyyy-MM-dd') === format(dia, 'yyyy-MM-dd'))
                      .sort((a, b) => new Date(a.data_agendada).getTime() - new Date(b.data_agendada).getTime());
                    
                    return (
                      <div 
                        key={i} 
                        className={`p-2 border-r border-slate-700/50 last:border-r-0 ${
                          isDiaHoje ? 'bg-blue-500/5' : ''
                        }`}
                      >
                        {acoesNoDia.length === 0 ? (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-xs text-slate-600">-</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {acoesNoDia.map(acao => (
                              <div 
                                key={acao.id}
                                onClick={() => abrirModalEditarAcao(acao)}
                                className={`p-2 rounded-lg border cursor-pointer hover:scale-[1.02] transition-all border-l-4 ${
                                  acao.responsavel === 'juliana'
                                    ? 'border-l-purple-500 bg-purple-500/10 border-purple-500/30'
                                    : acao.responsavel === 'quintela'
                                    ? 'border-l-emerald-500 bg-emerald-500/10 border-emerald-500/30'
                                    : acao.responsavel === 'ambos'
                                    ? 'border-l-cyan-500 bg-gradient-to-r from-purple-500/10 to-emerald-500/10 border-cyan-500/30'
                                    : 'border-l-slate-500 bg-slate-700/50 border-slate-600/50'
                                } hover:shadow-lg`}
                              >
                                <div className="flex items-center gap-1 mb-1">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getTipoBadgeColor(acao.tipo)}`}>
                                    {acao.tipo}
                                  </span>
                                </div>
                                <p className="text-xs font-medium text-white truncate">{acao.titulo}</p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {acao.professor_nome || 'Professor'}
                                </p>
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(acao.data_agendada), 'HH:mm')}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* VISUALIZAÇÃO MENSAL */}
            {modoCalendario === 'mes' && (
              <div className="grid grid-cols-7">
                {diasCalendarioMes.map((dia, i) => {
                  if (!dia) {
                    return (
                      <div key={i} className="min-h-[100px] p-2 border-r border-b border-slate-700/30 last:border-r-0 bg-slate-900/30" />
                    );
                  }
                  
                  const isDiaHoje = isToday(dia);
                  const acoesNoDia = acoesFiltradas
                    .filter(a => format(new Date(a.data_agendada), 'yyyy-MM-dd') === format(dia, 'yyyy-MM-dd'))
                    .sort((a, b) => new Date(a.data_agendada).getTime() - new Date(b.data_agendada).getTime());
                  
                  return (
                    <div 
                      key={i} 
                      onClick={() => abrirModalNovaAcao(dia)}
                      className={`min-h-[100px] p-2 border-r border-b border-slate-700/30 last:border-r-0 cursor-pointer transition ${
                        isDiaHoje ? 'bg-blue-500/10' : 'hover:bg-slate-800/70'
                      }`}
                    >
                      <div className={`text-sm font-medium mb-1 flex items-center justify-between ${
                        isDiaHoje ? 'text-blue-400' : 'text-slate-400'
                      }`}>
                        <span>{format(dia, 'd')}</span>
                        <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 text-slate-500" />
                      </div>
                      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                        {acoesNoDia.slice(0, 3).map(acao => (
                          <div 
                            key={acao.id}
                            onClick={() => abrirModalEditarAcao(acao)}
                            className={`px-1.5 py-0.5 rounded text-[10px] truncate cursor-pointer border-l-2 hover:opacity-80 transition ${
                              acao.responsavel === 'juliana'
                                ? 'border-l-purple-500 bg-purple-500/20 text-purple-200'
                                : acao.responsavel === 'quintela'
                                ? 'border-l-emerald-500 bg-emerald-500/20 text-emerald-200'
                                : acao.responsavel === 'ambos'
                                ? 'border-l-cyan-500 bg-gradient-to-r from-purple-500/20 to-emerald-500/20 text-cyan-200'
                                : 'border-l-slate-500 bg-slate-700 text-slate-300'
                            }`}
                            title={`Clique para editar: ${acao.titulo} - ${format(new Date(acao.data_agendada), 'HH:mm')} (${acao.responsavel === 'ambos' ? 'Juliana e Quintela' : acao.responsavel || 'Sem responsável'})`}
                          >
                            {format(new Date(acao.data_agendada), 'HH:mm')} {acao.titulo}
                          </div>
                        ))}
                        {acoesNoDia.length > 3 && (
                          <div className="text-[10px] text-cyan-400 px-1">
                            +{acoesNoDia.length - 3} mais
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legenda */}
            <div className="p-3 border-t border-slate-700/50 flex items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-purple-500/20 border-l-2 border-l-purple-500" />
                <span>Juliana</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-emerald-500/20 border-l-2 border-l-emerald-500" />
                <span>Quintela</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-gradient-to-r from-purple-500/20 to-emerald-500/20 border-l-2 border-l-cyan-500" />
                <span>Ambos</span>
              </div>
              <div className="border-l border-slate-600 h-4 mx-2" />
              <span className="text-slate-500">Clique em um dia para adicionar ação</span>
              <div className="flex-1" />
              <span className="text-slate-500">
                {acoesFiltradas.length} ação{acoesFiltradas.length !== 1 ? 'ões' : ''} no período
              </span>
            </div>
          </div>
        );
      })()}

      {/* Visualização Kanban */}
      {visualizacao === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pendente */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="font-medium text-white">Pendente</h3>
              <span className="ml-auto text-xs text-slate-400">
                {acoesFiltradas.filter(a => a.status === 'pendente').length}
              </span>
            </div>
            <div className="space-y-2">
              {acoesFiltradas.filter(a => a.status === 'pendente').length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Nenhuma ação pendente
                </div>
              ) : (
                acoesFiltradas
                  .filter(a => a.status === 'pendente')
                  .map(acao => (
                    <div key={acao.id} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30 hover:border-slate-600 transition group">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium text-white mb-1">{acao.titulo}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button 
                            onClick={() => handleConcluirAcao(acao.id)}
                            className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400"
                            title="Concluir"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleExcluirAcao(acao.id)}
                            className="p-1 hover:bg-red-500/20 rounded text-red-400"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">{acao.professor_nome || 'Geral'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${getTipoBadgeColor(acao.tipo)}`}>
                          {acao.tipo}
                        </span>
                        <span className="text-xs text-slate-500">
                          {format(new Date(acao.data_agendada), 'dd/MM HH:mm')}
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Em Andamento */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="w-4 h-4 text-blue-400" />
              <h3 className="font-medium text-white">Em Andamento</h3>
              <span className="ml-auto text-xs text-slate-400">0</span>
            </div>
            <div className="text-center py-8 text-slate-500 text-sm">
              Nenhuma ação em andamento
            </div>
          </div>

          {/* Concluída */}
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="font-medium text-white">Concluída</h3>
              <span className="ml-auto text-xs text-slate-400">
                {acoesFiltradas.filter(a => a.status === 'concluida').length}
              </span>
            </div>
            <div className="space-y-2">
              {acoesFiltradas.filter(a => a.status === 'concluida').length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Nenhuma ação concluída
                </div>
              ) : (
                acoesFiltradas
                  .filter(a => a.status === 'concluida')
                  .map(acao => (
                    <div key={acao.id} className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30 opacity-60">
                      <p className="text-sm font-medium text-white mb-1 line-through">{acao.titulo}</p>
                      <p className="text-xs text-slate-400">{acao.professor_nome}</p>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metas e Ações em Andamento */}
      {metas.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              🎯 Metas e Ações em Andamento
            </h2>
            <span className="text-xs text-slate-400">{metas.length} meta{metas.length > 1 ? 's' : ''} ativa{metas.length > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-4">
            {metas.map((meta) => {
              const diasRestantes = meta.data_fim 
                ? Math.max(0, Math.floor((new Date(meta.data_fim).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                : null;
              const progresso = meta.valor_meta > 0 && meta.valor_atual !== null
                ? Math.min(100, ((meta.valor_atual - (meta.valor_atual * 0.8)) / (meta.valor_meta - (meta.valor_atual * 0.8))) * 100)
                : 0;
              const acoesConcluidas = meta.acoes.filter(a => a.status === 'concluida');
              const acoesPendentes = meta.acoes.filter(a => a.status === 'pendente');

              const getTipoMetaLabel = (tipo: string) => {
                switch (tipo) {
                  case 'media_turma': return 'Média de turma';
                  case 'retencao': return 'Retenção';
                  case 'conversao': return 'Conversão';
                  case 'nps': return 'NPS';
                  case 'presenca': return 'Presença';
                  default: return tipo;
                }
              };

              const formatarValor = (valor: number | null, tipo: string) => {
                if (valor === null) return '-';
                if (tipo === 'media_turma' || tipo === 'nps') return valor.toFixed(1);
                return `${valor.toFixed(0)}%`;
              };

              return (
                <div key={meta.id} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/30">
                  {/* Header da Meta */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">👤</span>
                        <span className="text-white font-semibold">{meta.professor_nome}</span>
                      </div>
                      <p className="text-slate-300 text-sm">
                        Meta: {getTipoMetaLabel(meta.tipo)} {formatarValor(meta.valor_atual, meta.tipo)} → {formatarValor(meta.valor_meta, meta.tipo)}
                      </p>
                    </div>
                    {diasRestantes !== null && (
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        diasRestantes <= 7 ? 'bg-red-500/20 text-red-400' :
                        diasRestantes <= 30 ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {diasRestantes} dias restantes
                      </span>
                    )}
                  </div>

                  {/* Prazo */}
                  {meta.data_fim && (
                    <p className="text-xs text-slate-400 mb-3">
                      Prazo: {format(new Date(meta.data_fim), "MMM/yyyy", { locale: ptBR })}
                    </p>
                  )}

                  {/* Barra de Progresso */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Progresso</span>
                      <span className="text-slate-300">{Math.round(progresso)}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2.5">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-2.5 rounded-full transition-all"
                        style={{ width: `${Math.max(5, progresso)}%` }}
                      />
                    </div>
                  </div>

                  {/* Checkpoints / Ações */}
                  {meta.acoes.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Checkpoints:</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {acoesConcluidas.slice(0, 3).map((acao) => (
                          <div key={acao.id} className="flex items-center gap-2 text-xs">
                            <span className="text-green-400">✅</span>
                            <span className="text-slate-300">
                              {format(new Date(acao.data_agendada), "dd/MM")} - {acao.titulo}
                            </span>
                          </div>
                        ))}
                        {acoesPendentes.slice(0, 3).map((acao) => (
                          <div key={acao.id} className="flex items-center gap-2 text-xs">
                            <span className="text-yellow-400">⏳</span>
                            <span className="text-slate-400">
                              {format(new Date(acao.data_agendada), "dd/MM")} - {acao.titulo}
                            </span>
                          </div>
                        ))}
                        {meta.acoes.length > 6 && (
                          <p className="text-slate-500 text-xs pl-5">
                            + {meta.acoes.length - 6} outras ações
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Catálogo de Treinamentos */}
      <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            Catálogo de Treinamentos
          </h2>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-blue-400"
            onClick={() => setMostrarTodosTreinamentos(!mostrarTodosTreinamentos)}
          >
            {mostrarTodosTreinamentos ? '← Ver menos' : 'Ver todos →'}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(mostrarTodosTreinamentos ? treinamentos : treinamentos.slice(0, 3)).map((treinamento) => (
            <div
              key={treinamento.id}
              className="bg-slate-800/50 rounded-xl p-4 hover:bg-slate-800/70 cursor-pointer transition"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{treinamento.icone}</span>
                <p className="text-white font-medium">{treinamento.nome}</p>
              </div>
              <p className="text-slate-400 text-xs mb-3 line-clamp-2">{treinamento.descricao}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">⏱️ {treinamento.duracao_minutos} min</span>
                <div className="flex items-center gap-2">
                  {treinamento.nome === 'Conversão de Experimentais' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 text-xs"
                      onClick={() => setModalTreinamento({ open: true, slug: 'conversao-experimentais' })}
                    >
                      Ver Treinamento
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-400 text-xs"
                    onClick={() => setModalAcao({ open: true, professorId: null })}
                  >
                    Agendar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Nova Ação / Editar Ação */}
      <ModalNovaAcao
        open={modalAcao.open}
        onClose={() => setModalAcao({ open: false, professorId: null, acaoParaEditar: null })}
        professorId={modalAcao.professorId}
        dataInicial={modalAcao.dataInicial}
        responsavelInicial={modalAcao.responsavelInicial}
        acaoParaEditar={modalAcao.acaoParaEditar}
        professores={professores}
        onSave={() => {
          setModalAcao({ open: false, professorId: null, acaoParaEditar: null });
          toast.success(modalAcao.acaoParaEditar ? 'Ação atualizada!' : 'Ação agendada!');
          carregarDados();
        }}
        onDelete={() => {
          setModalAcao({ open: false, professorId: null, acaoParaEditar: null });
          toast.success('Ação excluída!');
          carregarDados();
        }}
      />

      {/* Modal Treinamento */}
      <ModalTreinamento
        isOpen={modalTreinamento.open}
        onClose={() => setModalTreinamento({ open: false, slug: '' })}
        treinamentoSlug={modalTreinamento.slug}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}

// Componente de item de ação
function AcaoItem({
  acao,
  isAtrasado = false,
  getTipoColor,
  getTipoBadgeColor,
  onConcluir,
  onReagendar,
  onEditar
}: {
  acao: Acao;
  isAtrasado?: boolean;
  getTipoColor: (tipo: string) => string;
  getTipoBadgeColor: (tipo: string) => string;
  onConcluir: (id: string) => void;
  onReagendar: (id: string) => void;
  onEditar?: (acao: Acao) => void;
}) {
  const dataAcao = new Date(acao.data_agendada);

  // Cor baseada no responsável
  const getResponsavelBorderColor = () => {
    if (isAtrasado) return 'border-l-red-500';
    if (acao.responsavel === 'juliana') return 'border-l-purple-500';
    if (acao.responsavel === 'quintela') return 'border-l-emerald-500';
    if (acao.responsavel === 'ambos') return 'border-l-cyan-500';
    return 'border-l-slate-500';
  };

  const getResponsavelBgColor = () => {
    if (acao.responsavel === 'juliana') return 'bg-purple-500/5';
    if (acao.responsavel === 'quintela') return 'bg-emerald-500/5';
    if (acao.responsavel === 'ambos') return 'bg-gradient-to-r from-purple-500/5 to-emerald-500/5';
    return '';
  };

  return (
    <div 
      onClick={() => onEditar?.(acao)}
      className={`px-4 py-3 hover:bg-slate-700/30 cursor-pointer flex items-center gap-4 border-l-4 ${getResponsavelBorderColor()} ${getResponsavelBgColor()} transition-all hover:shadow-md`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 rounded text-xs ${getTipoBadgeColor(acao.tipo)}`}>
            {acao.tipo.charAt(0).toUpperCase() + acao.tipo.slice(1)}
          </span>
          <span className="text-white font-medium">{acao.titulo}</span>
          {isAtrasado && (
            <span className="text-red-400 text-xs bg-red-500/20 px-2 py-0.5 rounded">
              {Math.floor((Date.now() - dataAcao.getTime()) / (1000 * 60 * 60 * 24))} dias atrasado
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>🕐 {format(dataAcao, "HH:mm")} - {format(new Date(dataAcao.getTime() + acao.duracao_minutos * 60000), "HH:mm")}</span>
          <span>👤 {acao.professor_nome || 'Professor'}</span>
          {acao.local && <span>📍 {acao.local}</span>}
          {acao.responsavel && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              acao.responsavel === 'juliana' ? 'bg-purple-500/20 text-purple-300' :
              acao.responsavel === 'quintela' ? 'bg-emerald-500/20 text-emerald-300' :
              acao.responsavel === 'ambos' ? 'bg-cyan-500/20 text-cyan-300' : ''
            }`}>
              {acao.responsavel === 'ambos' ? 'Juliana e Quintela' : acao.responsavel.charAt(0).toUpperCase() + acao.responsavel.slice(1)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {acao.status === 'pendente' && (
          <>
            {isAtrasado ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-yellow-400 hover:text-yellow-300"
                onClick={(e) => { e.stopPropagation(); onReagendar(acao.id); }}
              >
                📅 Reagendar
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-green-400 hover:text-green-300"
                onClick={(e) => { e.stopPropagation(); onConcluir(acao.id); }}
              >
                ✓ Concluir
              </Button>
            )}
          </>
        )}
        {acao.status === 'concluida' && (
          <span className="text-green-400 text-xs">✅ Concluída</span>
        )}
      </div>
    </div>
  );
}
