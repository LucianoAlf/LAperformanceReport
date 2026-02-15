import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  Users, Wallet, TrendingUp, GraduationCap, Baby, School,
  ChevronDown, ChevronRight, Search, ArrowUpDown, Eye,
  Loader2, Calendar, Clock, AlertTriangle, Heart
} from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModalCarteiraProfessor } from './ModalCarteiraProfessor';
import { Tooltip } from '@/components/ui/Tooltip';
import { calcularHealthScore } from '@/hooks/useHealthScore';

// Interface para carteira do professor
interface CarteiraProfessor {
  id: number;
  nome: string;
  foto_url: string | null;
  total_alunos: number;
  alunos_lamk: number;
  alunos_emla: number;
  mrr_total: number;
  ticket_medio: number;
  tempo_medio_meses: number;
  total_turmas: number;
  media_alunos_turma: number;
  cursos: string[];
  unidades: string[];
  health_score: number;
  health_status: 'critico' | 'atencao' | 'saudavel';
}

// Interface para aluno na carteira
interface AlunoCarteira {
  id: number;
  nome: string;
  classificacao: 'LAMK' | 'EMLA';
  idade_atual: number | null;
  curso: string;
  dia_aula: string;
  horario_aula: string;
  valor_parcela: number;
  tempo_permanencia_meses: number;
  data_fim_contrato: string | null;
  status: string;
  health_score?: 'verde' | 'amarelo' | 'vermelho' | null;
}

interface Props {
  unidadeAtual: UnidadeId;
}

type OrdenacaoTipo = 'alunos' | 'mrr' | 'ticket' | 'media_turma';
type OrdenacaoDirecao = 'asc' | 'desc';

export function TabCarteiraProfessores({ unidadeAtual }: Props) {
  const [carteiras, setCarteiras] = useState<CarteiraProfessor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroCurso, setFiltroCurso] = useState('todos');
  const [cursos, setCursos] = useState<{ id: number; nome: string }[]>([]);
  
  // Ordenação
  const [ordenacao, setOrdenacao] = useState<OrdenacaoTipo>('alunos');
  const [direcao, setDirecao] = useState<OrdenacaoDirecao>('desc');
  
  // Accordion expandido
  const [expandido, setExpandido] = useState<number | null>(null);
  const [alunosExpandido, setAlunosExpandido] = useState<AlunoCarteira[]>([]);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  
  // Modal de detalhes
  const [modalDetalhes, setModalDetalhes] = useState<{ open: boolean; professor: CarteiraProfessor | null }>({
    open: false,
    professor: null
  });

  useEffect(() => {
    carregarDados();
  }, [unidadeAtual]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Buscar cursos para filtro
      const { data: cursosData } = await supabase
        .from('cursos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      setCursos(cursosData || []);

      // Buscar professores ativos
      let queryProfs = supabase
        .from('professores')
        .select('id, nome, foto_url, ativo')
        .eq('ativo', true)
        .order('nome');

      const { data: professoresData } = await queryProfs;

      if (!professoresData) {
        setCarteiras([]);
        return;
      }

      // Buscar alunos ativos agrupados por professor
      let queryAlunos = supabase
        .from('alunos')
        .select(`
          id, nome, classificacao, valor_parcela, tempo_permanencia_meses,
          professor_atual_id, unidade_id, curso_id,
          unidades(nome), cursos(nome)
        `)
        .eq('status', 'ativo');

      if (unidadeAtual !== 'todos') {
        queryAlunos = queryAlunos.eq('unidade_id', unidadeAtual);
      }

      const { data: alunosData } = await queryAlunos;

      // Buscar turmas da view vw_turmas_implicitas (mesma fonte da aba Performance)
      // Isso garante consistência entre Carteira e Performance
      let queryTurmas = supabase
        .from('vw_turmas_implicitas')
        .select('professor_id, total_alunos, unidade_id');

      if (unidadeAtual !== 'todos') {
        queryTurmas = queryTurmas.eq('unidade_id', unidadeAtual);
      }

      const { data: turmasData } = await queryTurmas;

      // Buscar KPIs de performance para calcular Health Score (mesma fonte da aba Performance)
      const agora = new Date();
      const ano = agora.getFullYear();
      const mes = agora.getMonth() + 1;
      
      let kpisQuery = supabase
        .from('vw_kpis_professor_mensal')
        .select('professor_id, media_alunos_turma, taxa_cancelamento, taxa_conversao, media_presenca, evasoes, unidade_id')
        .eq('ano', ano)
        .eq('mes', mes);
      
      if (unidadeAtual !== 'todos') {
        kpisQuery = kpisQuery.eq('unidade_id', unidadeAtual);
      }
      
      const { data: kpisData } = await kpisQuery;
      
      // Criar mapa de KPIs por professor
      const kpisPorProfessor = new Map<number, any>();
      (kpisData || []).forEach((kpi: any) => {
        if (!kpisPorProfessor.has(kpi.professor_id)) {
          kpisPorProfessor.set(kpi.professor_id, kpi);
        }
      });

      // Calcular turmas e alunos por professor (mesma lógica da aba Performance)
      const turmasPorProfessor = new Map<number, number>();
      const alunosPorProfessorTurma = new Map<number, number>();
      (turmasData || []).forEach((t: any) => {
        const profId = t.professor_id;
        if (profId) {
          turmasPorProfessor.set(profId, (turmasPorProfessor.get(profId) || 0) + 1);
          alunosPorProfessorTurma.set(profId, (alunosPorProfessorTurma.get(profId) || 0) + (t.total_alunos || 0));
        }
      });

      // Agrupar alunos por professor
      const alunosPorProfessor = new Map<number, any[]>();
      (alunosData || []).forEach((a: any) => {
        if (a.professor_atual_id) {
          if (!alunosPorProfessor.has(a.professor_atual_id)) {
            alunosPorProfessor.set(a.professor_atual_id, []);
          }
          alunosPorProfessor.get(a.professor_atual_id)!.push(a);
        }
      });

      // Montar carteiras
      const carteirasCalculadas: CarteiraProfessor[] = professoresData.map((prof: any) => {
        const alunos = alunosPorProfessor.get(prof.id) || [];
        const turmas = turmasPorProfessor.get(prof.id) || 0;
        
        const totalAlunos = alunos.length;
        const alunosLamk = alunos.filter((a: any) => a.classificacao === 'LAMK').length;
        const alunosEmla = alunos.filter((a: any) => a.classificacao === 'EMLA').length;
        const mrrTotal = alunos.reduce((acc: number, a: any) => acc + (Number(a.valor_parcela) || 0), 0);
        const ticketMedio = totalAlunos > 0 ? mrrTotal / totalAlunos : 0;
        const tempoMedio = totalAlunos > 0 
          ? alunos.reduce((acc: number, a: any) => acc + (a.tempo_permanencia_meses || 0), 0) / totalAlunos 
          : 0;
        const mediaAlunosTurma = turmas > 0 ? totalAlunos / turmas : 0;

        // Cursos únicos
        const cursosUnicos = [...new Set(alunos.map((a: any) => (a.cursos as any)?.nome).filter(Boolean))];
        
        // Unidades únicas
        const unidadesUnicas = [...new Set(alunos.map((a: any) => (a.unidades as any)?.nome).filter(Boolean))];

        // Calcular Health Score usando os KPIs reais (mesma lógica da aba Performance)
        const kpis = kpisPorProfessor.get(prof.id);
        const taxaRetencao = kpis?.taxa_cancelamento 
          ? 100 - Number(kpis.taxa_cancelamento) 
          : (totalAlunos > 0 ? 100 : 0);
        const taxaConversao = kpis?.taxa_conversao ? Number(kpis.taxa_conversao) : 0;
        const taxaPresenca = kpis?.media_presenca ? Number(kpis.media_presenca) : 75;
        const evasoesMes = kpis?.evasoes || 0;
        
        const healthResult = calcularHealthScore({
          mediaTurma: mediaAlunosTurma,
          retencao: taxaRetencao,
          conversao: taxaConversao,
          presenca: taxaPresenca,
          evasoes: evasoesMes,
          taxaCrescimentoAjustada: 0,
          taxaEvasao: totalAlunos > 0 ? (evasoesMes / totalAlunos) * 100 : 0,
          carteiraAlunos: totalAlunos
        });

        return {
          id: prof.id,
          nome: prof.nome,
          foto_url: prof.foto_url,
          total_alunos: totalAlunos,
          alunos_lamk: alunosLamk,
          alunos_emla: alunosEmla,
          mrr_total: mrrTotal,
          ticket_medio: ticketMedio,
          tempo_medio_meses: tempoMedio,
          total_turmas: turmas,
          media_alunos_turma: mediaAlunosTurma,
          cursos: cursosUnicos,
          unidades: unidadesUnicas,
          health_score: healthResult.score,
          health_status: healthResult.status
        };
      });

      // Filtrar apenas professores com alunos (ou todos se quiser mostrar vazios)
      setCarteiras(carteirasCalculadas.filter(c => c.total_alunos > 0));
    } catch (error) {
      console.error('Erro ao carregar carteiras:', error);
    } finally {
      setLoading(false);
    }
  };

  // Carregar alunos quando expandir accordion
  const carregarAlunosProfessor = async (professorId: number) => {
    setLoadingAlunos(true);
    try {
      let query = supabase
        .from('alunos')
        .select(`
          id, nome, classificacao, idade_atual, valor_parcela, tempo_permanencia_meses,
          dia_aula, horario_aula, data_fim_contrato, data_matricula, status, health_score,
          cursos(nome)
        `)
        .eq('professor_atual_id', professorId)
        .eq('status', 'ativo')
        .order('nome');

      if (unidadeAtual !== 'todos') {
        query = query.eq('unidade_id', unidadeAtual);
      }

      const { data } = await query;

      const alunosFormatados: AlunoCarteira[] = (data || []).map((a: any) => {
        // Calcular data_fim_contrato se não existir: data_matricula + 12 meses
        let fimContrato = a.data_fim_contrato;
        if (!fimContrato && a.data_matricula) {
          const dataMatricula = new Date(a.data_matricula);
          const fimCalculado = new Date(dataMatricula);
          fimCalculado.setFullYear(fimCalculado.getFullYear() + 1);
          fimContrato = fimCalculado.toISOString().split('T')[0];
        }

        return {
          id: a.id,
          nome: a.nome,
          classificacao: a.classificacao || 'EMLA',
          idade_atual: a.idade_atual || null,
          curso: (a.cursos as any)?.nome || '-',
          dia_aula: a.dia_aula || '-',
          horario_aula: a.horario_aula ? a.horario_aula.substring(0, 5) : '-',
          valor_parcela: Number(a.valor_parcela) || 0,
          tempo_permanencia_meses: a.tempo_permanencia_meses || 0,
          data_fim_contrato: fimContrato,
          status: a.status,
          health_score: a.health_score || null
        };
      });

      setAlunosExpandido(alunosFormatados);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
    } finally {
      setLoadingAlunos(false);
    }
  };

  // Toggle accordion
  const toggleExpansao = (professorId: number) => {
    if (expandido === professorId) {
      setExpandido(null);
      setAlunosExpandido([]);
    } else {
      setExpandido(professorId);
      carregarAlunosProfessor(professorId);
    }
  };

  // Filtrar e ordenar
  const carteirasFiltradas = useMemo(() => {
    let resultado = [...carteiras];

    // Filtro por busca
    if (filtroBusca) {
      const termo = filtroBusca.toLowerCase();
      resultado = resultado.filter(c => c.nome.toLowerCase().includes(termo));
    }

    // Filtro por curso
    if (filtroCurso !== 'todos') {
      resultado = resultado.filter(c => c.cursos.includes(filtroCurso));
    }

    // Ordenação
    resultado.sort((a, b) => {
      let valorA = 0, valorB = 0;
      switch (ordenacao) {
        case 'alunos': valorA = a.total_alunos; valorB = b.total_alunos; break;
        case 'mrr': valorA = a.mrr_total; valorB = b.mrr_total; break;
        case 'ticket': valorA = a.ticket_medio; valorB = b.ticket_medio; break;
        case 'media_turma': valorA = a.media_alunos_turma; valorB = b.media_alunos_turma; break;
      }
      return direcao === 'desc' ? valorB - valorA : valorA - valorB;
    });

    return resultado;
  }, [carteiras, filtroBusca, filtroCurso, ordenacao, direcao]);

  // KPIs consolidados
  const kpis = useMemo(() => {
    const dados = carteirasFiltradas;
    const totalProfs = dados.length;
    const totalAlunos = dados.reduce((acc, c) => acc + c.total_alunos, 0);
    const mrrTotal = dados.reduce((acc, c) => acc + c.mrr_total, 0);
    const ticketMedio = totalAlunos > 0 ? mrrTotal / totalAlunos : 0;
    const mediaAlunos = totalProfs > 0 ? totalAlunos / totalProfs : 0;

    return { totalProfs, totalAlunos, mrrTotal, ticketMedio, mediaAlunos };
  }, [carteirasFiltradas]);

  // Cor do indicador de média/turma
  const getCorMediaTurma = (media: number) => {
    if (media >= 1.8) return 'text-green-400';
    if (media >= 1.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getIndicadorMediaTurma = (media: number) => {
    if (media >= 1.8) return '🟢';
    if (media >= 1.5) return '🟡';
    return '🔴';
  };

  // Iniciais do nome
  const getIniciais = (nome: string) => {
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  // Verificar contrato próximo do vencimento
  const contratoProximoVencer = (dataFim: string | null) => {
    if (!dataFim) return false;
    const hoje = new Date();
    const fim = new Date(dataFim);
    const diasRestantes = Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diasRestantes <= 30 && diasRestantes >= 0;
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
      {/* KPIs Consolidados */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          icon={Users}
          label="Professores"
          value={kpis.totalProfs}
          subvalue="com alunos ativos"
          variant="violet"
        />
        <KPICard
          icon={GraduationCap}
          label="Alunos Ativos"
          value={kpis.totalAlunos}
          subvalue="na carteira"
          variant="emerald"
        />
        <KPICard
          icon={Wallet}
          label="MRR Total"
          value={kpis.mrrTotal}
          format="currency"
          subvalue="receita mensal"
          variant="cyan"
        />
        <KPICard
          icon={TrendingUp}
          label="Ticket Médio"
          value={kpis.ticketMedio}
          format="currency"
          subvalue="por aluno"
          variant="amber"
        />
        <KPICard
          icon={Users}
          label="Média/Professor"
          value={kpis.mediaAlunos.toFixed(1)}
          subvalue="alunos por prof"
          variant="rose"
        />
      </div>

      {/* Filtros e Ordenação */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="flex flex-wrap items-center gap-4">
          {/* Busca */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar professor..."
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-700"
            />
          </div>

          {/* Filtro por Curso */}
          <Select value={filtroCurso} onValueChange={setFiltroCurso}>
            <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-700">
              <SelectValue placeholder="Todos os cursos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os cursos</SelectItem>
              {cursos.map(c => (
                <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Ordenação */}
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as OrdenacaoTipo)}>
            <SelectTrigger className="w-[160px] bg-slate-900/50 border-slate-700">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alunos">Total Alunos</SelectItem>
              <SelectItem value="mrr">MRR</SelectItem>
              <SelectItem value="ticket">Ticket Médio</SelectItem>
              <SelectItem value="media_turma">Média/Turma</SelectItem>
            </SelectContent>
          </Select>

          {/* Direção */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDirecao(d => d === 'desc' ? 'asc' : 'desc')}
            className="border-slate-700"
          >
            <ArrowUpDown className="w-4 h-4 mr-1" />
            {direcao === 'desc' ? 'Maior' : 'Menor'}
          </Button>
        </div>
      </div>

      {/* Lista de Professores (Accordion) */}
      <div className="space-y-2">
        {carteirasFiltradas.map((carteira) => (
          <div key={carteira.id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            {/* Header do Accordion */}
            <div
              className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-700/30 transition"
              onClick={() => toggleExpansao(carteira.id)}
            >
              {/* Chevron */}
              <div className="text-slate-400">
                {expandido === carteira.id ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </div>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                {getIniciais(carteira.nome)}
              </div>

              {/* Nome e Cursos */}
              <div className="flex-1 min-w-0">
                <p 
                  className="font-medium text-white truncate cursor-pointer hover:text-violet-400 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalDetalhes({ open: true, professor: carteira });
                  }}
                >
                  {carteira.nome}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {carteira.cursos.slice(0, 3).join(', ')}
                  {carteira.cursos.length > 3 && ` +${carteira.cursos.length - 3}`}
                </p>
              </div>

              {/* Badges com métricas */}
              <div className="hidden md:flex items-center gap-2">
                {/* Badge Alunos */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <Users className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-sm font-semibold text-white">{carteira.total_alunos}</span>
                  <span className="text-xs text-slate-400">alunos</span>
                </div>

                {/* Badge MRR */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">
                    {carteira.mrr_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs text-slate-400">MRR</span>
                </div>

                {/* Badge Ticket */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-sm font-semibold text-cyan-400">
                    {carteira.ticket_medio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs text-slate-400">ticket</span>
                </div>

                {/* Badge Média/Turma */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                  carteira.media_alunos_turma >= 1.8 
                    ? 'bg-green-500/10 border-green-500/20' 
                    : carteira.media_alunos_turma >= 1.5 
                      ? 'bg-yellow-500/10 border-yellow-500/20' 
                      : 'bg-red-500/10 border-red-500/20'
                }`}>
                  <span className="text-sm">
                    {getIndicadorMediaTurma(carteira.media_alunos_turma)}
                  </span>
                  <span className={`text-sm font-semibold ${getCorMediaTurma(carteira.media_alunos_turma)}`}>
                    {carteira.media_alunos_turma.toFixed(1)}
                  </span>
                  <span className="text-xs text-slate-400">al/turma</span>
                </div>

                {/* Badge Health Score */}
                <Tooltip content={`Health Score: ${carteira.health_score} (${carteira.health_status === 'saudavel' ? 'Saudável' : carteira.health_status === 'atencao' ? 'Atenção' : 'Crítico'})`}>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                    carteira.health_status === 'saudavel' 
                      ? 'bg-emerald-500/10 border-emerald-500/20' 
                      : carteira.health_status === 'atencao' 
                        ? 'bg-amber-500/10 border-amber-500/20' 
                        : 'bg-rose-500/10 border-rose-500/20'
                  }`}>
                    <Heart className={`w-3.5 h-3.5 ${
                      carteira.health_status === 'saudavel' ? 'text-emerald-400' : 
                      carteira.health_status === 'atencao' ? 'text-amber-400' : 'text-rose-400'
                    }`} />
                    <span className={`text-sm font-bold ${
                      carteira.health_status === 'saudavel' ? 'text-emerald-400' : 
                      carteira.health_status === 'atencao' ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {Math.round(carteira.health_score)}
                    </span>
                  </div>
                </Tooltip>
              </div>

              {/* Botão Ver Detalhes */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalDetalhes({ open: true, professor: carteira });
                }}
                className="text-slate-400 hover:text-white"
              >
                <Eye className="w-4 h-4" />
              </Button>
            </div>

            {/* Conteúdo Expandido - Tabela de Alunos */}
            {expandido === carteira.id && (
              <div className="border-t border-slate-700/50 p-4 bg-slate-900/30">
                {loadingAlunos ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                  </div>
                ) : alunosExpandido.length === 0 ? (
                  <p className="text-center text-slate-400 py-4">Nenhum aluno encontrado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-700/50">
                          <th className="pb-2 font-medium">Nome</th>
                          <th className="pb-2 font-medium">Escola</th>
                          <th className="pb-2 font-medium text-center">Idade</th>
                          <th className="pb-2 font-medium">Curso</th>
                          <th className="pb-2 font-medium">Dia/Horário</th>
                          <th className="pb-2 font-medium text-right">Parcela</th>
                          <th className="pb-2 font-medium text-center">Perm.</th>
                          <th className="pb-2 font-medium text-center">Fim Contrato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alunosExpandido.map((aluno) => (
                          <tr key={aluno.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="py-2 text-white flex items-center gap-2">
                              {aluno.health_score && (
                                <Tooltip content={
                                  aluno.health_score === 'verde' ? 'Aluno saudável' :
                                  aluno.health_score === 'amarelo' ? 'Aluno em alerta' :
                                  'Aluno em situação emergente'
                                }>
                                  <span className="text-base">
                                    {aluno.health_score === 'verde' ? '💚' :
                                     aluno.health_score === 'amarelo' ? '💛' : '❤️'}
                                  </span>
                                </Tooltip>
                              )}
                              {aluno.nome}
                            </td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                aluno.classificacao === 'LAMK' 
                                  ? 'bg-cyan-500/20 text-cyan-400' 
                                  : 'bg-violet-500/20 text-violet-400'
                              }`}>
                                {aluno.classificacao}
                              </span>
                            </td>
                            <td className="py-2 text-center text-slate-300">
                              {aluno.idade_atual ? `${aluno.idade_atual} anos` : '-'}
                            </td>
                            <td className="py-2 text-slate-300">{aluno.curso}</td>
                            <td className="py-2 text-slate-300">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {aluno.dia_aula}
                                <Clock className="w-3 h-3 ml-2" />
                                {aluno.horario_aula}
                              </span>
                            </td>
                            <td className="py-2 text-right text-emerald-400">
                              {aluno.valor_parcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="py-2 text-center text-slate-300">{aluno.tempo_permanencia_meses}m</td>
                            <td className="py-2 text-center">
                              {aluno.data_fim_contrato ? (
                                <span className={`flex items-center justify-center gap-1 ${
                                  contratoProximoVencer(aluno.data_fim_contrato) 
                                    ? 'text-yellow-400' 
                                    : 'text-slate-400'
                                }`}>
                                  {contratoProximoVencer(aluno.data_fim_contrato) && (
                                    <AlertTriangle className="w-3 h-3" />
                                  )}
                                  {new Date(aluno.data_fim_contrato).toLocaleDateString('pt-BR')}
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {carteirasFiltradas.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum professor encontrado com os filtros aplicados</p>
          </div>
        )}
      </div>

      {/* Modal de Detalhes */}
      <ModalCarteiraProfessor
        open={modalDetalhes.open}
        onClose={() => setModalDetalhes({ open: false, professor: null })}
        professor={modalDetalhes.professor}
        unidadeAtual={unidadeAtual}
      />
    </div>
  );
}
