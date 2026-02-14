import { useState, useEffect, useMemo } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { 
  Building2, Plus, Search, Edit2, Trash2, Users, Clock, AlertTriangle, Package, DoorOpen, Sparkles, Calendar
} from 'lucide-react';
import { PageTour, TourHelpButton } from '@/components/Onboarding';
import { salasTourSteps } from '@/components/Onboarding/tours';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ModalEditarSala } from './ModalEditarSala';
import { ModalOcupacaoSala } from './ModalOcupacaoSala';
import { InventarioTab } from './inventario/InventarioTab';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Interface para Sala
export interface Sala {
  id: number;
  nome: string;
  codigo: string | null;
  unidade_id: string;
  unidade_nome?: string;
  capacidade_maxima: number;
  tipo_sala: string | null;
  buffer_operacional: number;
  recursos: string[];
  sala_coringa: boolean;
  cursos_permitidos: string[] | null;
  descricao: string | null;
  ativo: boolean;
}

// Interface para Unidade
interface Unidade {
  id: string;
  nome: string;
  codigo: string;
}

// Mapeamento de tipos de sala para cores e emojis
const TIPOS_SALA_CONFIG: Record<string, { emoji: string; cor: string; bgCor: string }> = {
  'Piano/Teclado': { emoji: '🎹', cor: 'text-blue-400', bgCor: 'bg-blue-500/20' },
  'Bateria/Percussão': { emoji: '🥁', cor: 'text-red-400', bgCor: 'bg-red-500/20' },
  'Cordas': { emoji: '🎸', cor: 'text-green-400', bgCor: 'bg-green-500/20' },
  'Sopro': { emoji: '🎷', cor: 'text-orange-400', bgCor: 'bg-orange-500/20' },
  'Canto/Vocal': { emoji: '🎤', cor: 'text-yellow-400', bgCor: 'bg-yellow-500/20' },
  'Teoria Musical': { emoji: '📚', cor: 'text-purple-400', bgCor: 'bg-purple-500/20' },
  'Multiuso/Coringa': { emoji: '🎭', cor: 'text-emerald-400', bgCor: 'bg-emerald-500/20' },
  'Violino': { emoji: '🎻', cor: 'text-cyan-400', bgCor: 'bg-cyan-500/20' },
};

function getTipoConfig(tipo: string | null) {
  if (!tipo) return { emoji: '🏢', cor: 'text-slate-400', bgCor: 'bg-slate-500/20' };
  return TIPOS_SALA_CONFIG[tipo] || { emoji: '🏢', cor: 'text-slate-400', bgCor: 'bg-slate-500/20' };
}

type TabAtiva = 'salas' | 'inventario';

const salasTabs: PageTab<TabAtiva>[] = [
  { id: 'salas', label: 'Salas', shortLabel: 'Salas', icon: DoorOpen },
  { id: 'inventario', label: 'Inventário', shortLabel: 'Invent.', icon: Package },
];

export function SalasPage() {
  useSetPageTitle({
    titulo: 'Gestão de Salas',
    subtitulo: 'Configure espaços físicos e recursos da escola',
    icone: Building2,
    iconeCor: 'text-white',
    iconeWrapperCor: 'bg-gradient-to-br from-purple-500 to-pink-500',
  });

  const context = useOutletContext<{ filtroAtivo: boolean; unidadeSelecionada: UnidadeId }>();
  const unidadeAtual = context?.unidadeSelecionada || 'todos';
  
  // Estados
  const [tabAtiva, setTabAtiva] = useState<TabAtiva>('salas');
  const [salas, setSalas] = useState<Sala[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [ocupacaoSalas, setOcupacaoSalas] = useState<Record<number, number>>({});
  const [horasOcupadasSalas, setHorasOcupadasSalas] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState<string>('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroCoringa, setFiltroCoringa] = useState<string>('');
  const [modalAberto, setModalAberto] = useState(false);
  const [salaParaEditar, setSalaParaEditar] = useState<Sala | null>(null);
  const [alertDialogAberto, setAlertDialogAberto] = useState(false);
  const [salaParaExcluir, setSalaParaExcluir] = useState<{ id: number; nome: string } | null>(null);
  const [modalOcupacaoAberto, setModalOcupacaoAberto] = useState(false);
  const [salaParaOcupacao, setSalaParaOcupacao] = useState<Sala | null>(null);

  // Carregar dados
  useEffect(() => {
    carregarDados();
  }, [unidadeAtual]);

  async function carregarDados() {
    setLoading(true);
    try {
      // Carregar unidades
      const { data: unidadesData } = await supabase
        .from('unidades')
        .select('id, nome, codigo')
        .eq('ativo', true)
        .order('nome');
      
      if (unidadesData) {
        setUnidades(unidadesData);
      }

      // Carregar salas
      let query = supabase
        .from('salas')
        .select(`
          id,
          nome,
          codigo,
          unidade_id,
          capacidade_maxima,
          tipo_sala,
          buffer_operacional,
          recursos,
          sala_coringa,
          cursos_permitidos,
          descricao,
          ativo,
          unidades!inner(nome)
        `)
        .eq('ativo', true)
        .order('nome');

      if (unidadeAtual && unidadeAtual !== 'todos') {
        query = query.eq('unidade_id', unidadeAtual);
      }

      const { data: salasData, error } = await query;

      if (error) {
        console.error('Erro ao carregar salas:', error);
        return;
      }

      if (salasData) {
        const salasFormatadas: Sala[] = salasData.map((sala: any) => ({
          ...sala,
          unidade_nome: sala.unidades?.nome || '',
          recursos: sala.recursos || [],
          buffer_operacional: sala.buffer_operacional || 10,
          sala_coringa: sala.sala_coringa || false,
        }));
        setSalas(salasFormatadas);
      }

      // Carregar ocupação das salas (turmas ativas com horários)
      const { data: turmasData } = await supabase
        .from('turmas')
        .select('sala_id, capacidade_maxima, dia_semana, horario_inicio')
        .eq('ativo', true);

      if (turmasData) {
        // Calcular ocupação por sala (capacidade máxima das turmas)
        const ocupacao: Record<number, number> = {};
        // Calcular horas ocupadas por sala (número de turmas = horas ocupadas)
        const horasOcupadas: Record<number, number> = {};
        
        turmasData.forEach((turma: any) => {
          if (turma.sala_id) {
            // Usar capacidade máxima da turma como estimativa de ocupação
            ocupacao[turma.sala_id] = (ocupacao[turma.sala_id] || 0) + (turma.capacidade_maxima || 0);
            // Contar horas ocupadas (cada turma = 1 hora por semana)
            horasOcupadas[turma.sala_id] = (horasOcupadas[turma.sala_id] || 0) + 1;
          }
        });
        setOcupacaoSalas(ocupacao);
        setHorasOcupadasSalas(horasOcupadas);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrar salas
  const salasFiltradas = useMemo(() => {
    return salas.filter(sala => {
      // Filtro por unidade (do contexto global)
      if (unidadeAtual && unidadeAtual !== 'todos' && sala.unidade_id !== unidadeAtual) {
        return false;
      }
      
      // Filtro por unidade (filtro local - só para admin)
      if (filtroUnidade && filtroUnidade !== 'todos' && sala.unidade_id !== filtroUnidade) {
        return false;
      }
      
      // Filtro por tipo de sala
      if (filtroTipo && filtroTipo !== 'todos') {
        if (filtroTipo === 'sem_tipo' && sala.tipo_sala !== null) {
          return false;
        }
        if (filtroTipo !== 'sem_tipo' && sala.tipo_sala !== filtroTipo) {
          return false;
        }
      }
      
      // Filtro por sala coringa
      if (filtroCoringa && filtroCoringa !== 'todos') {
        if (filtroCoringa === 'apenas_coringas' && !sala.sala_coringa) {
          return false;
        }
        if (filtroCoringa === 'apenas_especificas' && sala.sala_coringa) {
          return false;
        }
      }
      
      // Filtro por busca
      if (busca) {
        const termoBusca = busca.toLowerCase();
        const matchNome = sala.nome.toLowerCase().includes(termoBusca);
        const matchUnidade = sala.unidade_nome?.toLowerCase().includes(termoBusca);
        if (!matchNome && !matchUnidade) {
          return false;
        }
      }
      
      return true;
    });
  }, [salas, unidadeAtual, busca, filtroUnidade, filtroTipo, filtroCoringa]);

  // KPIs
  const kpis = useMemo(() => {
    const totalSalas = salasFiltradas.length;
    const capacidadeTotal = salasFiltradas.reduce((acc, sala) => acc + sala.capacidade_maxima, 0);
    const salasCoringa = salasFiltradas.filter(sala => sala.sala_coringa).length;
    
    // Calcular ocupação total (soma de alunos em todas as salas filtradas)
    const ocupacaoTotal = salasFiltradas.reduce((acc, sala) => {
      return acc + (ocupacaoSalas[sala.id] || 0);
    }, 0);
    
    // Calcular percentual de ocupação (alunos)
    const percentualOcupacao = capacidadeTotal > 0 
      ? Math.round((ocupacaoTotal / capacidadeTotal) * 100) 
      : 0;
    
    // Horário de funcionamento padrão (seg-sex: 8-21h = 13h, sáb: 8-16h = 8h)
    // Total semanal por sala: 5 dias × 13h + 1 dia × 8h = 73 horas
    const horasSemanaPorSala = (5 * 13) + (1 * 8); // 73 horas
    
    // Capacidade semanal total (horas disponíveis)
    const horasDisponiveisSemana = totalSalas * horasSemanaPorSala;
    
    // Capacidade diária (considerando seg-sex, média de 13h/dia)
    const horasDia = 13;
    const capacidadeDiaria = capacidadeTotal * horasDia;
    
    // Horas ocupadas total (soma de todas as turmas)
    const horasOcupadasTotal = salasFiltradas.reduce((acc, sala) => {
      return acc + (horasOcupadasSalas[sala.id] || 0);
    }, 0);
    
    // Taxa de utilização real (horas ocupadas / horas disponíveis)
    const taxaUtilizacao = horasDisponiveisSemana > 0 
      ? Math.round((horasOcupadasTotal / horasDisponiveisSemana) * 100) 
      : 0;
    
    return { 
      totalSalas, 
      capacidadeTotal, 
      ocupacaoTotal,
      percentualOcupacao,
      salasCoringa,
      capacidadeDiaria,
      taxaUtilizacao,
      horasOcupadasTotal,
      horasDisponiveisSemana
    };
  }, [salasFiltradas, ocupacaoSalas, horasOcupadasSalas]);

  // Abrir modal para nova sala
  function handleNovaSala() {
    setSalaParaEditar(null);
    setModalAberto(true);
  }

  // Abrir modal para editar sala
  function handleEditarSala(sala: Sala) {
    setSalaParaEditar(sala);
    setModalAberto(true);
  }

  // Abrir dialog de confirmação de exclusão
  function handleAbrirDialogExcluir(salaId: number, salaNome: string) {
    setSalaParaExcluir({ id: salaId, nome: salaNome });
    setAlertDialogAberto(true);
  }

  // Abrir modal de ocupação da sala
  function handleVerOcupacao(sala: Sala) {
    setSalaParaOcupacao(sala);
    setModalOcupacaoAberto(true);
  }

  // Navegar para grade completa filtrada por sala
  function handleAbrirGradeCompleta(salaId: number) {
    // Fechar modal e navegar para a página de alunos com filtro de sala
    setModalOcupacaoAberto(false);
    setSalaParaOcupacao(null);
    window.location.href = `/app/alunos?tab=grade&sala=${salaId}`;
  }

  // Confirmar exclusão da sala
  async function handleConfirmarExclusao() {
    if (!salaParaExcluir) return;

    try {
      const { error } = await supabase
        .from('salas')
        .update({ ativo: false })
        .eq('id', salaParaExcluir.id);

      if (error) {
        console.error('Erro ao excluir sala:', error);
        alert('Erro ao excluir sala: ' + error.message);
        return;
      }

      // Fechar dialog e limpar estado
      setAlertDialogAberto(false);
      setSalaParaExcluir(null);
      
      // Recarregar dados
      await carregarDados();
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao excluir sala. Tente novamente.');
    }
  }

  // Callback quando salvar no modal
  function handleSalvarSala() {
    setModalAberto(false);
    setSalaParaEditar(null);
    carregarDados();
  }

  return (
    <div className="space-y-6">
      {/* Abas */}
      <PageTabs
        tabs={salasTabs}
        activeTab={tabAtiva}
        onTabChange={setTabAtiva}
        data-tour="salas-abas"
      />

      {/* Conteúdo da Aba de Salas */}
      {tabAtiva === 'salas' && (
        <>
          {/* KPI Cards */}
          <div data-tour="salas-kpis" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <DoorOpen className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase">Total de Salas</p>
                  <p className="text-xl font-bold text-white">{kpis.totalSalas}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase">Capacidade Total</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-xl font-bold text-white">{kpis.ocupacaoTotal}</p>
                    <p className="text-sm text-slate-400">/ {kpis.capacidadeTotal}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Ocupação</span>
                  <span className={`font-medium ${
                    kpis.percentualOcupacao >= 90 ? 'text-red-400' :
                    kpis.percentualOcupacao >= 70 ? 'text-yellow-400' :
                    'text-emerald-400'
                  }`}>
                    {kpis.percentualOcupacao}%
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full transition-all ${
                      kpis.percentualOcupacao >= 90 ? 'bg-red-500' :
                      kpis.percentualOcupacao >= 70 ? 'bg-yellow-500' :
                      'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(kpis.percentualOcupacao, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase">Salas Coringa</p>
                  <p className="text-xl font-bold text-white">{kpis.salasCoringa}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase">Taxa de Utilização</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-xl font-bold text-white">{kpis.horasOcupadasTotal}h</p>
                    <p className="text-sm text-slate-400">/ {kpis.horasDisponiveisSemana}h</p>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Semanal</span>
                  <span className={`font-medium ${
                    kpis.taxaUtilizacao >= 80 ? 'text-emerald-400' :
                    kpis.taxaUtilizacao >= 50 ? 'text-amber-400' :
                    'text-red-400'
                  }`}>
                    {kpis.taxaUtilizacao}%
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full transition-all ${
                      kpis.taxaUtilizacao >= 80 ? 'bg-emerald-500' :
                      kpis.taxaUtilizacao >= 50 ? 'bg-amber-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(kpis.taxaUtilizacao, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase">Capacidade Diária</p>
                  <p className="text-xl font-bold text-white">{kpis.capacidadeDiaria}</p>
                  <p className="text-xs text-slate-500">alunos × hora</p>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div data-tour="salas-filtros" className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Busca */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar por nome..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
                  />
                </div>
              </div>

              {/* Filtro Unidade (só para admin) */}
              {unidadeAtual === 'todos' && (
                <div className="w-40">
                  <Select value={filtroUnidade} onValueChange={setFiltroUnidade}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Filtro Tipo */}
              <div className="w-44">
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {Object.keys(TIPOS_SALA_CONFIG).map((tipo) => {
                      const config = TIPOS_SALA_CONFIG[tipo];
                      return (
                        <SelectItem key={tipo} value={tipo}>
                          {config.emoji} {tipo}
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="sem_tipo">⚠️ Sem tipo definido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro Coringa */}
              <div className="w-44">
                <Select value={filtroCoringa} onValueChange={setFiltroCoringa}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Coringa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="apenas_coringas">✨ Apenas Coringas</SelectItem>
                    <SelectItem value="apenas_especificas">🎯 Apenas Específicas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Botão Nova Sala */}
              <button 
                data-tour="btn-nova-sala"
                onClick={handleNovaSala}
                className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nova Sala
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
          ) : salasFiltradas.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">
                {busca ? 'Nenhuma sala encontrada para esta busca.' : 'Nenhuma sala cadastrada.'}
              </p>
              <button 
                onClick={handleNovaSala}
                className="mt-4 bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                Cadastrar primeira sala
              </button>
            </div>
          ) : (
            /* Grid de Cards de Salas */
            <div data-tour="salas-cards" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {salasFiltradas.map((sala) => {
            const tipoConfig = getTipoConfig(sala.tipo_sala);
            const isSalaCoringa = sala.sala_coringa;
            
            return (
              <div 
                key={sala.id}
                className={`
                  bg-slate-800/50 rounded-2xl p-6 transition
                  ${isSalaCoringa 
                    ? 'border-2 border-emerald-500/50 hover:border-emerald-500' 
                    : 'border border-slate-700 hover:border-purple-500/50'
                  }
                `}
              >
                {/* Header do Card */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 ${tipoConfig.bgCor} rounded-xl flex items-center justify-center`}>
                      <span className="text-2xl">{tipoConfig.emoji}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{sala.nome}</h3>
                      <p className="text-xs text-slate-400">{sala.unidade_nome}</p>
                      {isSalaCoringa && (
                        <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-medium mt-1 inline-block">
                          ✨ Sala Coringa
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Capacidade com Ocupação Real */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400 uppercase font-medium">Capacidade</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-white">{ocupacaoSalas[sala.id] || 0}</span>
                      <span className="text-xs text-slate-400">/ {sala.capacidade_maxima}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Ocupação</span>
                      <span className={`font-medium ${
                        ((ocupacaoSalas[sala.id] || 0) / sala.capacidade_maxima * 100) >= 90 ? 'text-red-400' :
                        ((ocupacaoSalas[sala.id] || 0) / sala.capacidade_maxima * 100) >= 70 ? 'text-yellow-400' :
                        'text-emerald-400'
                      }`}>
                        {Math.round(((ocupacaoSalas[sala.id] || 0) / sala.capacidade_maxima) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full transition-all ${
                          ((ocupacaoSalas[sala.id] || 0) / sala.capacidade_maxima * 100) >= 90 ? 'bg-red-500' :
                          ((ocupacaoSalas[sala.id] || 0) / sala.capacidade_maxima * 100) >= 70 ? 'bg-yellow-500' :
                          'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(((ocupacaoSalas[sala.id] || 0) / sala.capacidade_maxima) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Tipo */}
                <div className="mb-4">
                  <span className="text-xs text-slate-400 uppercase font-medium block mb-2">Tipo</span>
                  <span className={`${tipoConfig.bgCor} ${tipoConfig.cor} px-3 py-1 rounded-lg text-xs font-medium`}>
                    {tipoConfig.emoji} {sala.tipo_sala || 'Não definido'}
                  </span>
                </div>

                {/* Recursos */}
                {sala.recursos && sala.recursos.length > 0 && (
                  <div className="mb-4">
                    <span className="text-xs text-slate-400 uppercase font-medium block mb-2">Recursos Disponíveis</span>
                    <div className="flex flex-wrap gap-2">
                      {sala.recursos.slice(0, 3).map((recurso, idx) => (
                        <span key={idx} className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs">
                          {recurso}
                        </span>
                      ))}
                      {sala.recursos.length > 3 && (
                        <span className="bg-slate-700 text-slate-400 px-2 py-1 rounded text-xs">
                          +{sala.recursos.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Buffer */}
                <div className="mb-4 pb-4 border-b border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Buffer Operacional</span>
                    <span className="text-sm text-white font-medium">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {sala.buffer_operacional} min
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleVerOcupacao(sala)}
                    className="bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/50 px-3 py-2 rounded-lg text-sm font-medium text-cyan-400 transition flex items-center gap-1"
                    title="Ver ocupação da sala"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleEditarSala(sala)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar
                  </button>
                  <button 
                    onClick={() => handleAbrirDialogExcluir(sala.id, sala.nome)}
                    className="bg-red-900/20 hover:bg-red-900/30 border border-red-500/50 px-4 py-2 rounded-lg text-sm font-medium text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
            </div>
          )}
        </>
      )}

      {/* Conteúdo da Aba de Inventário */}
      {tabAtiva === 'inventario' && (
        <InventarioTab
          unidadeAtual={unidadeAtual}
          salas={salas}
          unidades={unidades}
        />
      )}

      {/* Modal Editar/Nova Sala */}
      {modalAberto && (
        <ModalEditarSala
          sala={salaParaEditar}
          unidades={unidades}
          onClose={() => {
            setModalAberto(false);
            setSalaParaEditar(null);
          }}
          onSalvar={handleSalvarSala}
        />
      )}

      {/* Modal de Ocupação da Sala */}
      {modalOcupacaoAberto && salaParaOcupacao && (
        <ModalOcupacaoSala
          sala={salaParaOcupacao}
          unidadeNome={unidades.find(u => u.id === salaParaOcupacao.unidade_id)?.nome || 'Unidade'}
          onClose={() => {
            setModalOcupacaoAberto(false);
            setSalaParaOcupacao(null);
          }}
          onAbrirGradeCompleta={handleAbrirGradeCompleta}
        />
      )}

      {/* AlertDialog de Confirmação de Exclusão */}
      <AlertDialog open={alertDialogAberto} onOpenChange={setAlertDialogAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <AlertDialogTitle>Excluir Sala</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a sala <strong className="text-white">"{salaParaExcluir?.nome}"</strong>?
              <br />
              <br />
              Esta ação não pode ser desfeita. A sala será desativada e não aparecerá mais na listagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSalaParaExcluir(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarExclusao}>
              Sim, excluir sala
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tour e Botão de Ajuda */}
      <PageTour tourName="salas" steps={salasTourSteps} />
      <TourHelpButton tourName="salas" />
    </div>
  );
}
