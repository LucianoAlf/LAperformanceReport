import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { format, differenceInMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { 
  Users, GraduationCap, Building2, BookOpen, Award, TrendingUp,
  Plus, Search, RotateCcw, Edit2, Trash2, Eye, MoreHorizontal,
  ChevronDown, Filter, Music, BarChart3, Table, LayoutGrid, MapPin, Clock,
  Calendar, Target, Settings
} from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/Tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { ModalProfessor } from './ModalProfessor';
import { ModalDetalhesProfessor } from './ModalDetalhesProfessor';
import { CardProfessor } from './CardProfessor';
import { TabPerformanceProfessores } from './TabPerformanceProfessores';
import { TabAgendaProfessores } from './TabAgendaProfessores';
import { TabCarteiraProfessores } from './TabCarteiraProfessores';
import { Tab360Professores } from './Tab360Professores';
import { HealthScoreConfig } from './HealthScoreConfig';
import { FatorDemandaCursos } from './FatorDemandaCursos';
import type { 
  Professor, Unidade, Curso, KPIsProfessores, 
  FiltrosProfessores, ProfessorFormData
} from './types';

type AbaAtiva = 'cadastro' | 'performance' | 'carteira' | 'agenda' | '360' | 'configuracoes';

export function ProfessoresPage() {
  const context = useOutletContext<{ filtroAtivo: boolean; unidadeSelecionada: UnidadeId }>();
  const unidadeAtual = context?.unidadeSelecionada || 'todos';
  const toast = useToast();

  // Estado da aba ativa (com persistência no localStorage)
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>(() => {
    const saved = localStorage.getItem('professores_aba');
    return (saved === 'cadastro' || saved === 'performance' || saved === 'carteira' || saved === 'agenda' || saved === '360' || saved === 'configuracoes') ? saved : 'cadastro';
  });

  // Competência selecionada para a aba 360°
  const [competencia360, setCompetencia360] = useState(() => format(new Date(), 'yyyy-MM'));

  // Competência atual para a aba de Agenda
  const competenciaAtual = format(new Date(), 'yyyy-MM');

  // Estados principais
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados de filtros
  const [filtros, setFiltros] = useState<FiltrosProfessores>({
    nome: '',
    unidade_id: '',
    curso_id: '',
    status: 'todos',
    multiUnidade: 'todos'
  });

  // Estado de visualização (com persistência no localStorage)
  const [visualizacao, setVisualizacao] = useState<'tabela' | 'cards'>(() => {
    const saved = localStorage.getItem('professores_visualizacao');
    return (saved === 'cards' || saved === 'tabela') ? saved : 'tabela';
  });

  // Salvar preferência de aba no localStorage
  useEffect(() => {
    localStorage.setItem('professores_aba', abaAtiva);
  }, [abaAtiva]);

  // Estados de modais
  const [modalProfessor, setModalProfessor] = useState<{ open: boolean; modo: 'novo' | 'editar'; professor: Professor | null }>({
    open: false,
    modo: 'novo',
    professor: null
  });
  const [modalDetalhes, setModalDetalhes] = useState<{ open: boolean; professor: Professor | null }>({
    open: false,
    professor: null
  });
  const [professorParaExcluir, setProfessorParaExcluir] = useState<Professor | null>(null);

  // Salvar preferência de visualização no localStorage
  useEffect(() => {
    localStorage.setItem('professores_visualizacao', visualizacao);
  }, [visualizacao]);

  // Carregar dados iniciais
  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Carregar unidades
      const { data: unidadesData } = await supabase
        .from('unidades')
        .select('*')
        .order('nome');
      
      if (unidadesData) setUnidades(unidadesData);

      // Carregar cursos
      const { data: cursosData } = await supabase
        .from('cursos')
        .select('id, nome')
        .order('nome');
      
      if (cursosData) setCursos(cursosData);

      // Carregar professores com relacionamentos
      await carregarProfessores();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados', 'Tente novamente mais tarde');
    } finally {
      setLoading(false);
    }
  };

  const carregarProfessores = async () => {
    try {
      // Buscar professores
      const { data: professoresData, error: profError } = await supabase
        .from('professores')
        .select('*')
        .order('nome');

      if (profError) throw profError;

      // Buscar relacionamentos de unidades
      const { data: unidadesRelData } = await supabase
        .from('professores_unidades')
        .select(`
          id,
          professor_id,
          unidade_id,
          unidades:unidade_id (nome, codigo)
        `);

      // Buscar relacionamentos de cursos
      const { data: cursosRelData } = await supabase
        .from('professores_cursos')
        .select(`
          id,
          professor_id,
          curso_id,
          cursos:curso_id (nome)
        `);

      // Buscar turmas da view vw_turmas_implicitas (mesma fonte da aba Distribuição)
      const { data: turmasImplicitas } = await supabase
        .from('vw_turmas_implicitas')
        .select('professor_id, total_alunos');

      // Buscar turmas explícitas também
      const { data: turmasExplicitas } = await supabase
        .from('turmas_explicitas')
        .select('professor_id, id')
        .eq('ativo', true);

      // Buscar alunos de turmas explícitas
      const { data: alunosTurmasExplicitas } = await supabase
        .from('turmas_alunos')
        .select('turma_id, aluno_id, turmas_explicitas!inner(professor_id)')
        .eq('turmas_explicitas.ativo', true);

      // Montar mapa de contagens por professor
      const turmasPorProfessor = new Map<number, number>();
      const alunosPorProfessor = new Map<number, number>();
      const totalAlunosTurmasPorProfessor = new Map<number, number[]>(); // Para calcular média

      // Processar turmas implícitas
      turmasImplicitas?.forEach(t => {
        const profId = t.professor_id;
        turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
        alunosPorProfessor.set(profId, (alunosPorProfessor.get(profId) || 0) + (t.total_alunos || 0));
        
        const turmasAlunos = totalAlunosTurmasPorProfessor.get(profId) || [];
        turmasAlunos.push(t.total_alunos || 0);
        totalAlunosTurmasPorProfessor.set(profId, turmasAlunos);
      });

      // Processar turmas explícitas
      const alunosPorTurmaExplicita = new Map<number, number>();
      alunosTurmasExplicitas?.forEach(a => {
        const turmaId = a.turma_id;
        alunosPorTurmaExplicita.set(turmaId, (alunosPorTurmaExplicita.get(turmaId) || 0) + 1);
      });

      turmasExplicitas?.forEach(t => {
        const profId = t.professor_id;
        const alunosTurma = alunosPorTurmaExplicita.get(t.id) || 0;
        
        turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
        alunosPorProfessor.set(profId, (alunosPorProfessor.get(profId) || 0) + alunosTurma);
        
        const turmasAlunos = totalAlunosTurmasPorProfessor.get(profId) || [];
        turmasAlunos.push(alunosTurma);
        totalAlunosTurmasPorProfessor.set(profId, turmasAlunos);
      });

      // Calcular média de alunos por turma para cada professor
      const mediaAlunosTurmaPorProfessor = new Map<number, number>();
      totalAlunosTurmasPorProfessor.forEach((turmasAlunos, profId) => {
        if (turmasAlunos.length > 0) {
          const media = turmasAlunos.reduce((sum, n) => sum + n, 0) / turmasAlunos.length;
          mediaAlunosTurmaPorProfessor.set(profId, Math.round(media * 10) / 10);
        }
      });

      // Montar professores com relacionamentos
      const professoresCompletos: Professor[] = (professoresData || []).map(prof => {
        const unidadesProf = unidadesRelData?.filter(u => u.professor_id === prof.id).map(u => ({
          id: u.id,
          professor_id: u.professor_id,
          unidade_id: u.unidade_id,
          unidade_nome: (u.unidades as any)?.nome,
          unidade_codigo: (u.unidades as any)?.codigo,
          created_at: ''
        })) || [];

        const cursosProf = cursosRelData?.filter(c => c.professor_id === prof.id).map(c => ({
          id: c.id,
          professor_id: c.professor_id,
          curso_id: c.curso_id,
          curso_nome: (c.cursos as any)?.nome,
          created_at: ''
        })) || [];

        return {
          ...prof,
          unidades: unidadesProf,
          cursos: cursosProf,
          total_turmas: turmasPorProfessor.get(prof.id) || 0,
          total_alunos: alunosPorProfessor.get(prof.id) || 0,
          media_alunos_turma: mediaAlunosTurmaPorProfessor.get(prof.id) || 0
        };
      });

      setProfessores(professoresCompletos);
    } catch (error) {
      console.error('Erro ao carregar professores:', error);
      toast.error('Erro ao carregar professores');
    }
  };

  // Filtrar professores
  const professoresFiltrados = useMemo(() => {
    let resultado = [...professores];

    // Filtro por unidade global (do header)
    if (unidadeAtual !== 'todos') {
      resultado = resultado.filter(p => 
        p.unidades?.some(u => u.unidade_id === unidadeAtual)
      );
    }

    // Filtro por nome
    if (filtros.nome) {
      const termo = filtros.nome.toLowerCase();
      resultado = resultado.filter(p => p.nome.toLowerCase().includes(termo));
    }

    // Filtro por unidade específica
    if (filtros.unidade_id) {
      resultado = resultado.filter(p => 
        p.unidades?.some(u => u.unidade_id === filtros.unidade_id)
      );
    }

    // Filtro por curso
    if (filtros.curso_id) {
      const cursoId = parseInt(filtros.curso_id);
      resultado = resultado.filter(p => 
        p.cursos?.some(c => c.curso_id === cursoId)
      );
    }

    // Filtro por status
    if (filtros.status === 'ativo') {
      resultado = resultado.filter(p => p.ativo);
    } else if (filtros.status === 'inativo') {
      resultado = resultado.filter(p => !p.ativo);
    }

    // Filtro por multi-unidade
    if (filtros.multiUnidade === 'sim') {
      resultado = resultado.filter(p => (p.unidades?.length || 0) > 1);
    } else if (filtros.multiUnidade === 'nao') {
      resultado = resultado.filter(p => (p.unidades?.length || 0) <= 1);
    }

    return resultado;
  }, [professores, filtros, unidadeAtual]);

  // Calcular KPIs
  const kpis = useMemo<KPIsProfessores>(() => {
    // Filtrar por unidade se não for "todos"
    let professoresFiltradosUnidade = professores;
    if (unidadeAtual && unidadeAtual !== 'todos') {
      professoresFiltradosUnidade = professores.filter(p => 
        p.unidades?.some(u => u.unidade_id === unidadeAtual)
      );
    }

    const ativos = professoresFiltradosUnidade.filter(p => p.ativo);
    const inativos = professoresFiltradosUnidade.filter(p => !p.ativo);
    const multiUnidade = ativos.filter(p => (p.unidades?.length || 0) > 1);
    
    const totalAlunos = ativos.reduce((sum, p) => sum + (p.total_alunos || 0), 0);
    const totalTurmas = ativos.reduce((sum, p) => sum + (p.total_turmas || 0), 0);
    
    // Veteranos: >5 anos (60 meses)
    const veteranos = ativos.filter(p => {
      if (!p.data_admissao) return false;
      const meses = differenceInMonths(new Date(), new Date(p.data_admissao));
      return meses >= 60; // 5 anos
    });

    // Super veteranos: >10 anos (120 meses)
    const superVeteranos = ativos.filter(p => {
      if (!p.data_admissao) return false;
      const meses = differenceInMonths(new Date(), new Date(p.data_admissao));
      return meses >= 120; // 10 anos
    });

    const professoresComNps = ativos.filter(p => p.nps_medio !== null);
    const npsMedio = professoresComNps.length > 0
      ? professoresComNps.reduce((sum, p) => sum + (p.nps_medio || 0), 0) / professoresComNps.length
      : 0;

    // Média de alunos por turma (geral)
    const professoresComTurmas = ativos.filter(p => (p.total_turmas || 0) > 0);
    const mediaAlunosTurmaGeral = totalTurmas > 0 ? totalAlunos / totalTurmas : 0;

    return {
      totalAtivos: ativos.length,
      totalInativos: inativos.length,
      mediaAlunosPorProfessor: ativos.length > 0 ? totalAlunos / ativos.length : 0,
      professoresMultiUnidade: multiUnidade.length,
      totalTurmas,
      mediaTurmasPorProfessor: ativos.length > 0 ? totalTurmas / ativos.length : 0,
      veteranos: veteranos.length,
      superVeteranos: superVeteranos.length,
      mediaAlunosTurmaGeral,
      npsMedio
    };
  }, [professores, unidadeAtual]);

  // Handlers de CRUD
  const handleSaveProfessor = async (data: ProfessorFormData) => {
    try {
      const professorData = {
        nome: data.nome.trim(),
        data_admissao: data.data_admissao ? format(data.data_admissao, 'yyyy-MM-dd') : null,
        comissao_percentual: data.comissao_percentual,
        observacoes: data.observacoes || null,
        foto_url: data.foto_url || null,
        ativo: true
      };

      if (modalProfessor.modo === 'novo') {
        // Inserir professor
        const { data: novoProfessor, error } = await supabase
          .from('professores')
          .insert(professorData)
          .select()
          .single();

        if (error) throw error;

        // Inserir relacionamentos de unidades
        if (data.unidades_ids.length > 0) {
          const unidadesInsert = data.unidades_ids.map(unidade_id => ({
            professor_id: novoProfessor.id,
            unidade_id
          }));
          await supabase.from('professores_unidades').insert(unidadesInsert);
        }

        // Inserir relacionamentos de cursos
        if (data.cursos_ids.length > 0) {
          const cursosInsert = data.cursos_ids.map(curso_id => ({
            professor_id: novoProfessor.id,
            curso_id
          }));
          await supabase.from('professores_cursos').insert(cursosInsert);
        }

        toast.success('Professor cadastrado!', `${data.nome} foi adicionado com sucesso`);
      } else {
        // Atualizar professor existente
        const professorId = modalProfessor.professor!.id;

        const { error } = await supabase
          .from('professores')
          .update(professorData)
          .eq('id', professorId);

        if (error) throw error;

        // Atualizar unidades (deletar e reinserir)
        await supabase.from('professores_unidades').delete().eq('professor_id', professorId);
        if (data.unidades_ids.length > 0) {
          const unidadesInsert = data.unidades_ids.map(unidade_id => ({
            professor_id: professorId,
            unidade_id
          }));
          await supabase.from('professores_unidades').insert(unidadesInsert);
        }

        // Atualizar cursos (deletar e reinserir)
        await supabase.from('professores_cursos').delete().eq('professor_id', professorId);
        if (data.cursos_ids.length > 0) {
          const cursosInsert = data.cursos_ids.map(curso_id => ({
            professor_id: professorId,
            curso_id
          }));
          await supabase.from('professores_cursos').insert(cursosInsert);
        }

        toast.success('Professor atualizado!', `${data.nome} foi atualizado com sucesso`);
      }

      await carregarProfessores();
    } catch (error: any) {
      console.error('Erro ao salvar professor:', error);
      toast.error('Erro ao salvar', error.message || 'Tente novamente');
      throw error;
    }
  };

  const handleToggleStatus = async (professor: Professor) => {
    try {
      const novoStatus = !professor.ativo;
      const { error } = await supabase
        .from('professores')
        .update({ ativo: novoStatus })
        .eq('id', professor.id);

      if (error) throw error;

      toast.success(
        novoStatus ? 'Professor ativado!' : 'Professor desativado!',
        `${professor.nome} foi ${novoStatus ? 'ativado' : 'desativado'}`
      );
      await carregarProfessores();
    } catch (error: any) {
      toast.error('Erro ao alterar status', error.message);
    }
  };

  const handleExcluirProfessor = async () => {
    if (!professorParaExcluir) return;

    try {
      // Deletar relacionamentos primeiro
      await supabase.from('professores_unidades').delete().eq('professor_id', professorParaExcluir.id);
      await supabase.from('professores_cursos').delete().eq('professor_id', professorParaExcluir.id);

      // Deletar professor
      const { error } = await supabase
        .from('professores')
        .delete()
        .eq('id', professorParaExcluir.id);

      if (error) throw error;

      toast.success('Professor excluído!', `${professorParaExcluir.nome} foi removido`);
      setProfessorParaExcluir(null);
      await carregarProfessores();
    } catch (error: any) {
      toast.error('Erro ao excluir', error.message || 'Professor pode ter turmas vinculadas');
    }
  };

  const limparFiltros = () => {
    setFiltros({
      nome: '',
      unidade_id: '',
      curso_id: '',
      status: 'ativo',
      multiUnidade: 'todos'
    });
  };

  // Calcular tempo de casa formatado
  const formatarTempoCasa = (dataAdmissao: string | null) => {
    if (!dataAdmissao) return '-';
    const meses = differenceInMonths(new Date(), new Date(dataAdmissao));
    const anos = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    if (anos === 0) return `${mesesRestantes}m`;
    if (mesesRestantes === 0) return `${anos}a`;
    return `${anos}a ${mesesRestantes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <GraduationCap className="w-7 h-7 text-violet-400" />
            Gestão de Professores
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Cadastro, turmas e performance da equipe pedagógica
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 border-b border-slate-700 pb-1">
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
            abaAtiva === 'cadastro'
              ? 'bg-slate-800 text-white border-b-2 border-purple-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
          onClick={() => setAbaAtiva('cadastro')}
        >
          <Users className="w-4 h-4" />
          Cadastro
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
            abaAtiva === 'performance'
              ? 'bg-slate-800 text-white border-b-2 border-purple-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
          onClick={() => setAbaAtiva('performance')}
        >
          <Target className="w-4 h-4" />
          Performance
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
            abaAtiva === 'carteira'
              ? 'bg-slate-800 text-white border-b-2 border-purple-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
          onClick={() => setAbaAtiva('carteira')}
        >
          <Users className="w-4 h-4" />
          Carteira
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
            abaAtiva === 'agenda'
              ? 'bg-slate-800 text-white border-b-2 border-purple-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
          onClick={() => setAbaAtiva('agenda')}
        >
          <Calendar className="w-4 h-4" />
          Agenda
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
            abaAtiva === '360'
              ? 'bg-slate-800 text-white border-b-2 border-purple-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
          onClick={() => setAbaAtiva('360')}
        >
          <BarChart3 className="w-4 h-4" />
          360°
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition ${
            abaAtiva === 'configuracoes'
              ? 'bg-slate-800 text-white border-b-2 border-purple-500'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
          onClick={() => setAbaAtiva('configuracoes')}
        >
          <Settings className="w-4 h-4" />
          Configurações
        </button>
      </div>

      {/* Conteúdo da aba Performance */}
      {abaAtiva === 'performance' && (
        <TabPerformanceProfessores unidadeAtual={unidadeAtual} />
      )}

      {/* Conteúdo da aba Carteira */}
      {abaAtiva === 'carteira' && (
        <TabCarteiraProfessores unidadeAtual={unidadeAtual} />
      )}

      {/* Conteúdo da aba Agenda */}
      {abaAtiva === 'agenda' && (
        <TabAgendaProfessores unidadeAtual={unidadeAtual} competencia={competenciaAtual} />
      )}

      {/* Conteúdo da aba 360° */}
      {abaAtiva === '360' && (
        <Tab360Professores 
          unidadeSelecionada={unidadeAtual}
          competencia={competencia360}
          onCompetenciaChange={setCompetencia360}
        />
      )}

      {/* Conteúdo da aba Configurações */}
      {abaAtiva === 'configuracoes' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-xl font-bold text-white">Configurações de Performance</h2>
              <p className="text-slate-400 text-sm">Configure os pesos e parâmetros do Health Score dos professores</p>
            </div>
          </div>
          
          <HealthScoreConfig 
            onSave={(weights) => {
              console.log('Pesos salvos:', weights);
              toast.success('Configuração salva!', 'Os pesos do Health Score foram atualizados');
            }}
          />

          {/* Fator de Demanda por Curso */}
          <FatorDemandaCursos 
            unidadeId={unidadeAtual !== 'todos' ? unidadeAtual : undefined}
          />

          {/* NOTA: Configurações do Professor 360° foram movidas para a aba 360° */}

          {/* Referência de Metas */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-5 h-5 text-violet-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wide">Referência de Metas</span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {/* Média/Turma */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">Média/Turma</p>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> &lt;1.3 Crítico</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> 1.3-1.5 Atenção</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> &gt;1.5 Excelente</p>
                </div>
              </div>

              {/* Retenção */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">Retenção</p>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> &lt;70% Crítico</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> 70-95% Regular</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> &gt;95% Excelente</p>
                </div>
              </div>

              {/* Conversão */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">Conversão</p>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> &lt;70% Ruim</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> 70-90% Bom</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> &gt;90% Mestre</p>
                </div>
              </div>

              {/* Presença */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">Presença</p>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> &lt;70% Crítico</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> 70-80% Atenção</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> &gt;80% Ideal</p>
                </div>
              </div>

              {/* Evasões */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">Evasões</p>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> 0 Excelente</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> 1-2 Atenção</p>
                  <p className="flex items-center gap-2 text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> &gt;3 Crítico</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo da aba Cadastro (conteúdo original) */}
      {abaAtiva === 'cadastro' && (
        <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          label="Total Ativos"
          value={kpis.totalAtivos}
          icon={Users}
          variant="violet"
          subvalue={kpis.totalInativos > 0 ? `${kpis.totalInativos} inativos` : undefined}
        />
        <KPICard
          label="Média Alunos"
          value={kpis.mediaAlunosPorProfessor.toFixed(1)}
          icon={Users}
          variant="cyan"
          subvalue="por professor"
        />
        <KPICard
          label="Multi-Unidade"
          value={kpis.professoresMultiUnidade}
          icon={Building2}
          variant="amber"
          subvalue={kpis.totalAtivos > 0 ? `${((kpis.professoresMultiUnidade / kpis.totalAtivos) * 100).toFixed(0)}% do total` : undefined}
        />
        <KPICard
          label="Total Turmas"
          value={kpis.totalTurmas}
          icon={BookOpen}
          variant="emerald"
          subvalue={`${kpis.mediaTurmasPorProfessor.toFixed(1)} por prof.`}
        />
        <KPICard
          label="Média Alunos/Turma"
          value={kpis.mediaAlunosTurmaGeral > 0 ? kpis.mediaAlunosTurmaGeral.toFixed(2) : '-'}
          icon={Users}
          variant="purple"
          subvalue="por turma"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-2 text-slate-400">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filtros:</span>
        </div>

        {/* Busca por nome */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome..."
            value={filtros.nome}
            onChange={(e) => setFiltros(prev => ({ ...prev, nome: e.target.value }))}
            className="pl-9"
          />
        </div>

        {/* Filtro por unidade - só aparece para admin (Consolidado) */}
        {unidadeAtual === 'todos' && (
          <Select
            value={filtros.unidade_id || 'todas'}
            onValueChange={(value) => setFiltros(prev => ({ ...prev, unidade_id: value === 'todas' ? '' : value }))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {unidades.filter(u => u.ativo).map((unidade) => (
                <SelectItem key={unidade.id} value={unidade.id}>
                  {unidade.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filtro por curso */}
        <Select
          value={filtros.curso_id || 'todos'}
          onValueChange={(value) => setFiltros(prev => ({ ...prev, curso_id: value === 'todos' ? '' : value }))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Curso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {cursos.map((curso) => (
              <SelectItem key={curso.id} value={curso.id.toString()}>
                {curso.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro por status */}
        <Select
          value={filtros.status}
          onValueChange={(value) => setFiltros(prev => ({ ...prev, status: value }))}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>

        {/* Filtro multi-unidade - só aparece para admin (Consolidado) */}
        {unidadeAtual === 'todos' && (
          <Select
            value={filtros.multiUnidade}
            onValueChange={(value) => setFiltros(prev => ({ ...prev, multiUnidade: value }))}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Multi-unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="sim">Multi-unidade</SelectItem>
              <SelectItem value="nao">Uma unidade</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Limpar filtros */}
        <Button variant="ghost" size="sm" onClick={limparFiltros}>
          <RotateCcw className="w-3 h-3 mr-1" />
          Limpar
        </Button>

        {/* Toggle de visualização e Botão Novo Professor */}
        <div className="flex-1 flex justify-end items-center gap-2">
          {/* Toggle Tabela/Cards */}
          <div className="flex items-center gap-1 bg-slate-700/30 rounded-lg p-1">
            <Tooltip content="Visualização em tabela" side="top">
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 w-8 p-0 ${visualizacao === 'tabela' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => setVisualizacao('tabela')}
              >
                <Table className="w-4 h-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Visualização em cards" side="top">
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 w-8 p-0 ${visualizacao === 'cards' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => setVisualizacao('cards')}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </Tooltip>
          </div>

          <Button 
            onClick={() => setModalProfessor({ open: true, modo: 'novo', professor: null })}
            className="bg-violet-600 hover:bg-violet-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Professor
          </Button>
        </div>
      </div>

      {/* Visualização: Tabela ou Cards */}
      {visualizacao === 'tabela' ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Professor</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Unidades</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Cursos</th>
                <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Turmas</th>
                <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Alunos</th>
                <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Média/Turma</th>
                <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Tempo Casa</th>
                <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {professoresFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    Nenhum professor encontrado com os filtros aplicados
                  </td>
                </tr>
              ) : (
                professoresFiltrados.map((professor) => (
                  <tr 
                    key={professor.id} 
                    className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                    onClick={() => setModalDetalhes({ open: true, professor })}
                  >
                    {/* Professor (foto + nome) */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
                          {professor.foto_url ? (
                            <img src={professor.foto_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-lg font-medium text-slate-400">
                              {professor.nome.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-white">{professor.nome}</div>
                          {professor.comissao_percentual > 0 && (
                            <div className="text-xs text-emerald-400">{professor.comissao_percentual}% comissão</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Unidades */}
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {professor.unidades && professor.unidades.length > 0 ? (
                          professor.unidades.slice(0, 3).map((u) => (
                            <span 
                              key={u.id}
                              className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/20 text-violet-300"
                            >
                              {u.unidade_codigo || u.unidade_nome}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                        {(professor.unidades?.length || 0) > 3 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-600 text-slate-300">
                            +{(professor.unidades?.length || 0) - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Cursos */}
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {professor.cursos && professor.cursos.length > 0 ? (
                          professor.cursos.slice(0, 2).map((c) => (
                            <span 
                              key={c.id}
                              className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-300"
                            >
                              {c.curso_nome}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                        {(professor.cursos?.length || 0) > 2 && (
                          <Tooltip
                            content={professor.cursos.slice(2).map(c => c.curso_nome).join(', ')}
                            side="top"
                          >
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-600 text-slate-300 cursor-help">
                              +{(professor.cursos?.length || 0) - 2}
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </td>

                    {/* Turmas */}
                    <td className="p-4 text-center">
                      <span className="font-medium text-white">{professor.total_turmas || 0}</span>
                    </td>

                    {/* Alunos */}
                    <td className="p-4 text-center">
                      <span className="font-medium text-white">{professor.total_alunos || 0}</span>
                    </td>

                    {/* Média Alunos/Turma */}
                    <td className="p-4 text-center">
                      <span className={`font-medium ${
                        (professor.media_alunos_turma || 0) >= 2.0 
                          ? 'text-emerald-400' 
                          : (professor.media_alunos_turma || 0) >= 1.5 
                            ? 'text-yellow-400' 
                            : (professor.media_alunos_turma || 0) > 0 
                              ? 'text-red-400' 
                              : 'text-slate-500'
                      }`}>
                        {professor.total_turmas > 0 ? (professor.media_alunos_turma || 0).toFixed(1) : '-'}
                      </span>
                    </td>

                    {/* Tempo de Casa */}
                    <td className="p-4 text-center">
                      <span className="text-slate-300">{formatarTempoCasa(professor.data_admissao)}</span>
                    </td>

                    {/* Status */}
                    <td className="p-4 text-center">
                      <span className={`
                        px-2 py-1 rounded-full text-xs font-medium
                        ${professor.ativo 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-slate-500/20 text-slate-400'
                        }
                      `}>
                        {professor.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Tooltip content="Ver detalhes" side="top">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setModalDetalhes({ open: true, professor })}
                          >
                            <Eye className="w-4 h-4 text-slate-400" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Editar" side="top">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setModalProfessor({ open: true, modo: 'editar', professor })}
                          >
                            <Edit2 className="w-4 h-4 text-slate-400" />
                          </Button>
                        </Tooltip>
                        <Tooltip content={professor.ativo ? 'Desativar' : 'Ativar'} side="top">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleToggleStatus(professor)}
                          >
                            {professor.ativo ? (
                              <span className="text-amber-400 text-xs font-bold">⏸</span>
                            ) : (
                              <span className="text-emerald-400 text-xs font-bold">▶</span>
                            )}
                          </Button>
                        </Tooltip>
                        <Tooltip content="Excluir" side="top">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => setProfessorParaExcluir(professor)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da tabela */}
        <div className="p-4 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400">
          <span>
            Mostrando {professoresFiltrados.length} de {professores.length} professores
          </span>
        </div>
      </div>
      ) : (
        <div>
          {professoresFiltrados.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-12 text-center">
              <p className="text-slate-400">Nenhum professor encontrado com os filtros aplicados</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {professoresFiltrados.map((professor) => (
                  <CardProfessor
                    key={professor.id}
                    professor={professor}
                    onVerDetalhes={(prof) => setModalDetalhes({ open: true, professor: prof })}
                    onEditar={(prof) => setModalProfessor({ open: true, modo: 'editar', professor: prof })}
                    onPausar={handleToggleStatus}
                    onExcluir={setProfessorParaExcluir}
                    formatarTempoCasa={formatarTempoCasa}
                  />
                ))}
              </div>
              
              {/* Rodapé dos cards */}
              <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center text-sm text-slate-400">
                <span>
                  Mostrando {professoresFiltrados.length} de {professores.length} professores
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modais */}
      <ModalProfessor
        open={modalProfessor.open}
        onClose={() => setModalProfessor({ open: false, modo: 'novo', professor: null })}
        onSave={handleSaveProfessor}
        professor={modalProfessor.professor}
        unidades={unidades}
        cursos={cursos}
        modo={modalProfessor.modo}
      />

      <ModalDetalhesProfessor
        open={modalDetalhes.open}
        onClose={() => setModalDetalhes({ open: false, professor: null })}
        onEdit={() => {
          setModalDetalhes({ open: false, professor: null });
          if (modalDetalhes.professor) {
            setModalProfessor({ open: true, modo: 'editar', professor: modalDetalhes.professor });
          }
        }}
        professor={modalDetalhes.professor}
      />

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!professorParaExcluir} onOpenChange={() => setProfessorParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Professor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{professorParaExcluir?.nome}</strong>?
              <br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirProfessor}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}

      {/* Toast Container */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
