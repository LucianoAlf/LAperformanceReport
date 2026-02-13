import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  Smartphone, 
  Guitar, 
  Building2, 
  CheckCircle2, 
  Plus,
  Copy,
  TrendingUp,
  Calendar,
  X,
  Loader2,
  CalendarDays,
  BarChart3,
  Clock,
  Target,
  ArrowRight,
  Zap,
  Users,
  Pencil,
  Check,
  Trash2,
  FileText,
  RotateCcw,
  Send,
  GraduationCap,
  Trophy
} from 'lucide-react';
import { PageTour, TourHelpButton } from '@/components/Onboarding';
import { comercialTourSteps } from '@/components/Onboarding/tours';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePickerNascimento } from '@/components/ui/date-picker-nascimento';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { ComboboxNome, SugestaoLead } from '@/components/ui/combobox-nome';
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';
import { CelulaEditavelInline } from '@/components/ui/CelulaEditavelInline';
import { AlertasComercial } from './AlertasComercial';
import { PlanoAcaoComercial } from './PlanoAcaoComercial';
import { TabProgramaMatriculador } from './TabProgramaMatriculador';

// Tipos
interface LeadDiario {
  id?: number;
  unidade_id: string;
  data_contato: string;
  status: string;
  canal_origem_id: number | null;
  curso_interesse_id: number | null;
  quantidade: number;
  observacoes: string | null;
  nome: string | null;
  idade: number | null;
  professor_experimental_id: number | null;
  professor_fixo_id: number | null;
  agente_comercial: string | null;
  valor_passaporte: number | null;
  valor_parcela: number | null;
  forma_pagamento_id: number | null;
  forma_pagamento_passaporte_id: number | null;
  dia_vencimento: number | null;
  tipo_matricula: string | null;
  tipo_aluno: string | null;
  aluno_novo_retorno: string | null;
  unidades?: { codigo: string };
}

interface Option {
  value: number;
  label: string;
}

interface ResumoMes {
  leads: number;
  experimentais: number;
  visitas: number;
  matriculas: number;
  leadsPorCanal: { canal: string; quantidade: number }[];
  leadsPorCurso: { curso: string; quantidade: number }[];
  conversaoLeadExp: number;
  conversaoLeadMat: number;
  conversaoExpMat: number;
}

// Cards de Quick Input
const quickInputCards = [
  { 
    id: 'lead', 
    label: 'Leads Atendidos', 
    icon: Smartphone, 
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400'
  },
  { 
    id: 'experimental', 
    label: 'Experimental', 
    icon: Guitar, 
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-400'
  },
  { 
    id: 'visita', 
    label: 'Visita', 
    icon: Building2, 
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400'
  },
  { 
    id: 'matricula', 
    label: 'Matrícula', 
    icon: CheckCircle2, 
    color: 'from-emerald-500 to-teal-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400'
  },
];

const STATUS_EXPERIMENTAL = [
  { value: 'experimental_agendada', label: 'Agendada' },
  { value: 'experimental_realizada', label: 'Realizada' },
  { value: 'experimental_faltou', label: 'Faltou' },
];

const TIPOS_MATRICULA = [
  { value: 'EMLA', label: 'EMLA (Adulto)' },
  { value: 'LAMK', label: 'LAMK (Kids)' },
];

const TIPOS_ALUNO = [
  { value: 'pagante', label: 'Pagante' },
  { value: 'bolsista_integral', label: 'Bolsista Integral' },
  { value: 'bolsista_parcial', label: 'Bolsista Parcial' },
  { value: 'nao_pagante', label: 'Não Pagante' },
];

// Tipos que dispensam forma de pagamento e valores obrigatórios
const TIPOS_SEM_PAGAMENTO = ['bolsista_integral', 'nao_pagante'];

export function ComercialPage() {
  const { usuario, isAdmin, unidadeId } = useAuth();
  const context = useOutletContext<{ filtroAtivo: string | null; unidadeSelecionada: string | null }>();
  const filtroAtivo = context?.filtroAtivo;
  
  // Hook de filtro de competência (período)
  const competencia = useCompetenciaFiltro();
  
  // Para usuário de unidade: sempre usa sua unidade (unidadeId do auth)
  // Para admin: usa a unidade selecionada no dropdown do header (unidadeSelecionada do context)
  const unidadeParaSalvar = isAdmin 
    ? context?.unidadeSelecionada 
    : unidadeId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [abaPrincipal, setAbaPrincipal] = useState<'lancamentos' | 'programa'>('lancamentos');
  const [modalOpen, setModalOpen] = useState<'lead' | 'experimental' | 'visita' | 'matricula' | null>(null);
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [tipoRelatorio, setTipoRelatorio] = useState<'diario' | 'semanal' | 'mensal' | 'matriculas' | 'comparativo_mensal' | 'comparativo_anual' | null>(null);
  const [relatorioTexto, setRelatorioTexto] = useState('');
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [enviadoWhatsApp, setEnviadoWhatsApp] = useState(false);
  const [erroWhatsApp, setErroWhatsApp] = useState<string | null>(null);
  
  // Estado para período do relatório (simplificado)
  const [relatorioPeriodo, setRelatorioPeriodo] = useState<'hoje' | 'ontem' | 'personalizado'>('hoje');
  const [relatorioDataInicio, setRelatorioDataInicio] = useState<Date>(new Date());
  const [relatorioDataFim, setRelatorioDataFim] = useState<Date>(new Date());
  const [canais, setCanais] = useState<Option[]>([]);
  const [cursos, setCursos] = useState<Option[]>([]);
  const [professores, setProfessores] = useState<Option[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<Option[]>([]);
  const [unidades, setUnidades] = useState<Option[]>([]);
  
  // Resumo do mês
  const [resumo, setResumo] = useState<ResumoMes>({
    leads: 0,
    experimentais: 0,
    visitas: 0,
    matriculas: 0,
    leadsPorCanal: [],
    leadsPorCurso: [],
    conversaoLeadExp: 0,
    conversaoLeadMat: 0,
    conversaoExpMat: 0,
  });
  
  // Registros do dia
  const [registrosHoje, setRegistrosHoje] = useState<LeadDiario[]>([]);
  
  // Gerar relatório automaticamente quando o tipo ou período muda
  useEffect(() => {
    if (tipoRelatorio === 'diario') {
      gerarRelatorioDiario().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'semanal') {
      gerarRelatorioSemanal().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'mensal') {
      gerarRelatorioMensal().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'matriculas') {
      gerarRelatorioMatriculas().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'comparativo_mensal') {
      gerarRelatorioComparativoMensal().then(texto => setRelatorioTexto(texto));
    } else if (tipoRelatorio === 'comparativo_anual') {
      gerarRelatorioComparativoAnual().then(texto => setRelatorioTexto(texto));
    }
  }, [tipoRelatorio, relatorioPeriodo, relatorioDataInicio, relatorioDataFim]);
  
  // Matrículas do mês (para tabela)
  const [matriculasMes, setMatriculasMes] = useState<(LeadDiario & { 
    canal_nome?: string; 
    curso_nome?: string; 
    professor_exp_nome?: string;
    professor_fixo_nome?: string;
    forma_pagamento_nome?: string;
    forma_pagamento_passaporte_nome?: string;
  })[]>([]);
  
  // Registros do mês por tipo (para tabelas de detalhamento)
  const [leadsMes, setLeadsMes] = useState<(LeadDiario & { canal_nome?: string; curso_nome?: string })[]>([]);
  const [experimentaisMes, setExperimentaisMes] = useState<(LeadDiario & { canal_nome?: string; curso_nome?: string; professor_nome?: string })[]>([]);
  const [visitasMes, setVisitasMes] = useState<(LeadDiario & { canal_nome?: string; curso_nome?: string })[]>([]);
  
  // Aba selecionada no detalhamento
  const [abaDetalhamento, setAbaDetalhamento] = useState<'leads' | 'experimental' | 'visita' | 'matricula'>('matricula');
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Partial<LeadDiario>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Estados para lançamento em lote
  interface LoteLinha {
    id: string;
    aluno_nome?: string;
    canal_origem_id: number | null;
    curso_id: number | null;
    quantidade: number;
    status_experimental?: string;
    professor_id?: number | null;
    sabia_preco?: boolean | null;
  }
  
  const [loteData, setLoteData] = useState(new Date());
  const [loteLeads, setLoteLeads] = useState<LoteLinha[]>([
    { id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1 }
  ]);
  const [loteExperimentais, setLoteExperimentais] = useState<LoteLinha[]>([
    { id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1, status_experimental: 'experimental_agendada', professor_id: null, sabia_preco: null }
  ]);
  const [loteVisitas, setLoteVisitas] = useState<LoteLinha[]>([
    { id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1 }
  ]);
  
  // Sugestões de leads para autocomplete
  const [sugestoesLeads, setSugestoesLeads] = useState<SugestaoLead[]>([]);
  
  // Form states (para matrícula individual)
  const [formData, setFormData] = useState({
    data: new Date(),
    quantidade: 1,
    canal_origem_id: null as number | null,
    curso_id: null as number | null,
    status_experimental: 'experimental_agendada',
    professor_id: null as number | null,
    aluno_nome: '',
    aluno_data_nascimento: null as Date | null,
    tipo_matricula: 'EMLA',
    tipo_aluno: 'pagante',
    teve_experimental: false,
    professor_experimental_id: null as number | null,
    professor_fixo_id: null as number | null,
    valor_passaporte: null as number | null,
    valor_parcela: null as number | null,
    forma_pagamento_id: null as number | null,
    forma_pagamento_passaporte_id: null as number | null,
    forma_pagamento_passaporte: '' as string,
    parcelas_passaporte: 1 as number,
    dia_vencimento: 5 as number | null,
    unidade_id: null as string | null,
    // Novos campos para turma e flags
    dia_aula: '' as string,
    horario_aula: '' as string,
    is_ex_aluno: false,
    is_aluno_retorno: false,
    responsavel_nome: '',
    responsavel_telefone: '',
    responsavel_parentesco: '',
  });

  // Carregar dados mestres
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        // Determinar a unidade para filtrar cursos
        const unidadeFiltro = unidadeParaSalvar;
        
        const [canaisRes, professoresRes, formasRes, unidadesRes] = await Promise.all([
          supabase.from('canais_origem').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('formas_pagamento').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome'),
        ]);

        // Buscar cursos filtrados por unidade (se houver unidade selecionada)
        let cursosData: { value: string; label: string }[] = [];
        if (unidadeFiltro) {
          // Tentar buscar cursos ativos na unidade específica via unidades_cursos
          const { data: unidadesCursosData } = await supabase
            .from('unidades_cursos')
            .select(`
              curso_id,
              ativo,
              cursos (id, nome, ativo)
            `)
            .eq('unidade_id', unidadeFiltro)
            .eq('ativo', true);
          
          // Filtrar apenas cursos que também estão ativos globalmente
          cursosData = (unidadesCursosData || [])
            .filter((uc: any) => uc.cursos && uc.cursos.ativo)
            .map((uc: any) => ({ value: uc.cursos.id, label: uc.cursos.nome }))
            .sort((a, b) => a.label.localeCompare(b.label));
          
          // Fallback: se unidades_cursos estiver vazio, buscar todos os cursos ativos
          if (cursosData.length === 0) {
            const { data: cursosGlobais } = await supabase
              .from('cursos')
              .select('id, nome')
              .eq('ativo', true)
              .order('nome');
            cursosData = (cursosGlobais || []).map((c: any) => ({ value: c.id, label: c.nome }));
          }
        } else {
          // Sem unidade selecionada (admin consolidado) - buscar todos os cursos ativos
          const { data: cursosGlobais } = await supabase
            .from('cursos')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome');
          cursosData = (cursosGlobais || []).map((c: any) => ({ value: c.id, label: c.nome }));
        }

        if (canaisRes.data) setCanais(canaisRes.data.map((c: any) => ({ value: c.id, label: c.nome })));
        setCursos(cursosData);
        if (professoresRes.data) setProfessores(professoresRes.data.map((p: any) => ({ value: p.id, label: p.nome })));
        if (formasRes.data) setFormasPagamento(formasRes.data.map((f: any) => ({ value: f.id, label: f.nome })));
        if (unidadesRes.data) setUnidades(unidadesRes.data.map((u: any) => ({ value: u.id, label: u.nome })));
      } catch (error) {
        console.error('Erro ao carregar dados mestres:', error);
      }
    };

    loadMasterData();
  }, [unidadeParaSalvar]);

  // Carregar resumo do período e registros do dia
  const loadData = useCallback(async () => {
    if (!usuario?.unidade_id && usuario?.perfil !== 'admin') return;

    setLoading(true);
    try {
      const hoje = new Date().toISOString().split('T')[0];
      
      // Usar range de datas do filtro de competência
      const { startDate, endDate } = competencia.range;

      // Query base - buscar também cursos e unidades
      let query = supabase
        .from('leads')
        .select('*, canais_origem(nome), cursos(nome), unidades(codigo)')
        .gte('data_contato', startDate)
        .lte('data_contato', endDate)
        .order('data_contato', { ascending: false });

      // Aplicar filtro de unidade
      if (isAdmin) {
        // Admin: usa unidade selecionada no filtro (se não for "todos")
        if (context?.unidadeSelecionada && context.unidadeSelecionada !== 'todos') {
          query = query.eq('unidade_id', context.unidadeSelecionada);
        }
      } else {
        // Usuário de unidade: sempre filtra pela sua unidade
        if (usuario?.unidade_id) {
          query = query.eq('unidade_id', usuario.unidade_id);
        }
      }

      const { data, error } = await query;

      if (error) throw error;

      const registros = data || [];

      // Calcular resumo
      const leads = registros.filter(r => ['novo','agendado'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0);
      const experimentais = registros.filter(r => r.status?.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0);
      const visitas = registros.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0);
      const matriculas = registros.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0);

      // Leads por canal
      const canalMap = new Map<string, number>();
      registros.filter(r => ['novo','agendado'].includes(r.status)).forEach(r => {
        const canal = (r.canais_origem as any)?.nome || 'Não informado';
        canalMap.set(canal, (canalMap.get(canal) || 0) + r.quantidade);
      });
      const leadsPorCanal = Array.from(canalMap.entries())
        .map(([canal, quantidade]) => ({ canal, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade);

      // Leads por curso
      const cursoMap = new Map<string, number>();
      registros.filter(r => ['novo','agendado'].includes(r.status)).forEach(r => {
        const curso = (r.cursos as any)?.nome || 'Não informado';
        cursoMap.set(curso, (cursoMap.get(curso) || 0) + r.quantidade);
      });
      const leadsPorCurso = Array.from(cursoMap.entries())
        .map(([curso, quantidade]) => ({ curso, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade);

      // Conversões (3 métricas)
      const conversaoLeadExp = leads > 0 ? (experimentais / leads) * 100 : 0;
      const conversaoLeadMat = leads > 0 ? (matriculas / leads) * 100 : 0;
      const conversaoExpMat = experimentais > 0 ? (matriculas / experimentais) * 100 : 0;

      setResumo({
        leads,
        experimentais,
        visitas,
        matriculas,
        leadsPorCanal,
        leadsPorCurso,
        conversaoLeadExp,
        conversaoLeadMat,
        conversaoExpMat,
      });

      // Registros de hoje
      setRegistrosHoje(registros.filter(r => r.data_contato === hoje));

      // Matrículas do mês (com nomes dos relacionamentos)
      const matriculasDoMes = registros
        .filter(r => ['matriculado','convertido'].includes(r.status))
        .map(m => ({
          ...m,
          canal_nome: (m.canais_origem as any)?.nome || '',
          curso_nome: (m.cursos as any)?.nome || '',
        }));
      
      // Buscar nomes dos professores e formas de pagamento
      if (matriculasDoMes.length > 0) {
        const profIds = new Set<number>();
        const formaIds = new Set<number>();
        matriculasDoMes.forEach(m => {
          if (m.professor_experimental_id) profIds.add(m.professor_experimental_id);
          if (m.professor_fixo_id) profIds.add(m.professor_fixo_id);
          if (m.forma_pagamento_id) formaIds.add(m.forma_pagamento_id);
          if (m.forma_pagamento_passaporte_id) formaIds.add(m.forma_pagamento_passaporte_id);
        });
        
        const [profsData, formasData] = await Promise.all([
          profIds.size > 0 
            ? supabase.from('professores').select('id, nome').in('id', Array.from(profIds))
            : { data: [] },
          formaIds.size > 0 
            ? supabase.from('formas_pagamento').select('id, nome, sigla').in('id', Array.from(formaIds))
            : { data: [] },
        ]);
        
        const profMap = new Map<number, string>(profsData.data?.map(p => [p.id, p.nome] as [number, string]) || []);
        const formaMap = new Map<number, string>(formasData.data?.map(f => [f.id, f.sigla || f.nome] as [number, string]) || []);
        
        matriculasDoMes.forEach(m => {
          m.professor_exp_nome = m.professor_experimental_id ? profMap.get(m.professor_experimental_id) || '' : '';
          m.professor_fixo_nome = m.professor_fixo_id ? profMap.get(m.professor_fixo_id) || '' : '';
          m.forma_pagamento_nome = m.forma_pagamento_id ? formaMap.get(m.forma_pagamento_id) || '' : '';
          m.forma_pagamento_passaporte_nome = m.forma_pagamento_passaporte_id ? formaMap.get(m.forma_pagamento_passaporte_id) || '' : '';
        });
      }
      
      setMatriculasMes(matriculasDoMes);

      // Leads do mês (com nomes dos relacionamentos)
      const leadsDoMes = registros
        .filter(r => ['novo','agendado'].includes(r.status))
        .map(l => ({
          ...l,
          canal_nome: (l.canais_origem as any)?.nome || '',
          curso_nome: (l.cursos as any)?.nome || '',
        }));
      setLeadsMes(leadsDoMes);

      // Experimentais do mês (com nomes dos relacionamentos)
      const experimentaisDoMes = registros
        .filter(r => r.status?.startsWith('experimental'))
        .map(e => ({
          ...e,
          canal_nome: (e.canais_origem as any)?.nome || '',
          curso_nome: (e.cursos as any)?.nome || '',
        }));
      
      // Buscar nomes dos professores para experimentais
      if (experimentaisDoMes.length > 0) {
        const profExpIds = new Set<number>();
        experimentaisDoMes.forEach(e => {
          if (e.professor_experimental_id) profExpIds.add(e.professor_experimental_id);
        });
        
        if (profExpIds.size > 0) {
          const { data: profsExpData } = await supabase
            .from('professores')
            .select('id, nome')
            .in('id', Array.from(profExpIds));
          
          const profExpMap = new Map<number, string>(profsExpData?.map(p => [p.id, p.nome] as [number, string]) || []);
          experimentaisDoMes.forEach(e => {
            (e as any).professor_nome = e.professor_experimental_id ? profExpMap.get(e.professor_experimental_id) || '' : '';
          });
        }
      }
      setExperimentaisMes(experimentaisDoMes);

      // Visitas do mês (com nomes dos relacionamentos)
      const visitasDoMes = registros
        .filter(r => r.status === 'visita_escola')
        .map(v => ({
          ...v,
          canal_nome: (v.canais_origem as any)?.nome || '',
          curso_nome: (v.cursos as any)?.nome || '',
        }));
      setVisitasMes(visitasDoMes);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [usuario?.unidade_id, usuario?.perfil, isAdmin, context?.unidadeSelecionada, competencia.range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Carregar sugestões de leads para autocomplete
  const loadSugestoesLeads = useCallback(async () => {
    if (!unidadeParaSalvar) return;
    
    try {
      const { startDate, endDate } = competencia.range;
      
      const { data, error } = await supabase
        .from('leads')
        .select('id, nome, status, canal_origem_id, curso_interesse_id, professor_experimental_id, data_contato')
        .eq('unidade_id', unidadeParaSalvar)
        .gte('data_contato', startDate)
        .lte('data_contato', endDate)
        .not('nome', 'is', null)
        .neq('nome', '')
        .order('data_contato', { ascending: false });
      
      if (error) throw error;
      
      // Mapear para o formato do ComboboxNome
      const sugestoes: SugestaoLead[] = (data || []).map(item => ({
        id: item.id,
        nome: item.nome || '',
        tipo: item.status as SugestaoLead['tipo'],
        canal_origem_id: item.canal_origem_id,
        curso_id: item.curso_interesse_id,
        professor_id: item.professor_experimental_id,
        data: item.data_contato,
      }));
      
      setSugestoesLeads(sugestoes);
    } catch (error) {
      console.error('Erro ao carregar sugestões de leads:', error);
    }
  }, [unidadeParaSalvar, competencia.range]);

  useEffect(() => {
    loadSugestoesLeads();
  }, [loadSugestoesLeads]);

  // Funções de edição inline da tabela de matrículas
  const startEditing = (matricula: LeadDiario) => {
    setEditingId(matricula.id || null);
    setEditingData({
      nome: matricula.nome,
      idade: matricula.idade,
      curso_interesse_id: matricula.curso_interesse_id,
      canal_origem_id: matricula.canal_origem_id,
      professor_experimental_id: matricula.professor_experimental_id,
      professor_fixo_id: matricula.professor_fixo_id,
      valor_passaporte: matricula.valor_passaporte,
      valor_parcela: matricula.valor_parcela,
      tipo_matricula: matricula.tipo_matricula,
      agente_comercial: matricula.agente_comercial,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingData({});
  };

  const saveEditing = async () => {
    if (!editingId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update(editingData)
        .eq('id', editingId);

      if (error) throw error;

      toast.success('Matrícula atualizada!');
      setEditingId(null);
      setEditingData({});
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar matrícula');
    } finally {
      setSaving(false);
    }
  };

  // Função para salvar campo individual (edição inline por célula)
  const salvarCampoMatricula = useCallback(async (matriculaId: number, campo: string, valor: string | number | null) => {
    try {
      const updateData: Record<string, any> = {};
      updateData[campo] = valor;

      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', matriculaId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar');
    }
  }, [loadData]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      toast.success('Matrícula excluída!');
      setDeleteId(null);
      loadData();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir matrícula');
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      data: new Date(),
      quantidade: 1,
      canal_origem_id: null,
      curso_id: null,
      status_experimental: 'experimental_agendada',
      professor_id: null,
      aluno_nome: '',
      aluno_data_nascimento: null,
      tipo_matricula: 'EMLA',
      tipo_aluno: 'pagante',
      teve_experimental: false,
      professor_experimental_id: null,
      professor_fixo_id: null,
      valor_passaporte: null,
      valor_parcela: null,
      forma_pagamento_id: null,
      forma_pagamento_passaporte_id: null,
      forma_pagamento_passaporte: '',
      parcelas_passaporte: 1,
      dia_vencimento: 5,
      unidade_id: null,
      dia_aula: '',
      horario_aula: '',
      is_ex_aluno: false,
      is_aluno_retorno: false,
      responsavel_nome: '',
      responsavel_telefone: '',
      responsavel_parentesco: '',
    });
    // Reset lotes
    setLoteData(new Date());
    setLoteLeads([{ id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1 }]);
    setLoteExperimentais([{ id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1, status_experimental: 'experimental_agendada', professor_id: null }]);
    setLoteVisitas([{ id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1 }]);
  };

  // Salvar lote de leads atendidos
  const handleSaveLoteLeads = async () => {
    if (!unidadeParaSalvar) {
      toast.error('Selecione uma unidade no filtro acima');
      return;
    }

    // Validar que cada lead tem nome preenchido
    const linhasValidas = loteLeads.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0);
    if (linhasValidas.length === 0) {
      toast.error('Preencha o nome de pelo menos um lead');
      return;
    }

    // Verificar se há linhas sem nome
    const linhasSemNome = loteLeads.filter(l => !l.aluno_nome || l.aluno_nome.trim().length === 0);
    if (linhasSemNome.length > 0 && linhasValidas.length < loteLeads.length) {
      toast.warning(`${linhasSemNome.length} linha(s) sem nome serão ignoradas`);
    }

    setSaving(true);
    try {
      const dataLancamento = loteData.toISOString().split('T')[0];
      
      // Cada lead atendido é 1 registro (quantidade sempre 1)
      const registros = linhasValidas.map(linha => ({
        unidade_id: unidadeParaSalvar,
        data_contato: dataLancamento,
        status: 'novo',
        nome: linha.aluno_nome?.trim(),
        canal_origem_id: linha.canal_origem_id,
        curso_interesse_id: linha.curso_id,
        quantidade: 1, // Sempre 1 por lead atendido
      }));

      const { error } = await supabase.from('leads').insert(registros);
      if (error) throw error;

      toast.success(`${linhasValidas.length} lead(s) atendido(s) registrado(s)!`);
      setModalOpen(null);
      resetForm();
      loadData();
      loadSugestoesLeads(); // Recarregar sugestões após salvar leads
    } catch (error) {
      console.error('Erro ao salvar leads:', error);
      toast.error('Erro ao salvar leads');
    } finally {
      setSaving(false);
    }
  };

  // Salvar lote de experimentais
  const handleSaveLoteExperimentais = async () => {
    if (!unidadeParaSalvar) {
      toast.error('Selecione uma unidade no filtro acima');
      return;
    }

    // Validar que cada experimental tem nome preenchido
    const linhasValidas = loteExperimentais.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0);
    if (linhasValidas.length === 0) {
      toast.error('Preencha o nome de pelo menos uma experimental');
      return;
    }

    // Verificar se há linhas sem nome
    const linhasSemNome = loteExperimentais.filter(l => !l.aluno_nome || l.aluno_nome.trim().length === 0);
    if (linhasSemNome.length > 0 && linhasValidas.length < loteExperimentais.length) {
      toast.warning(`${linhasSemNome.length} linha(s) sem nome serão ignoradas`);
    }

    setSaving(true);
    try {
      const dataLancamento = loteData.toISOString().split('T')[0];
      
      // Cada experimental é 1 registro (quantidade sempre 1)
      const registros = linhasValidas.map(linha => ({
        unidade_id: unidadeParaSalvar,
        data_contato: dataLancamento,
        status: linha.status_experimental || 'experimental_agendada',
        nome: linha.aluno_nome?.trim(),
        canal_origem_id: linha.canal_origem_id,
        curso_interesse_id: linha.curso_id,
        quantidade: 1, // Sempre 1 por experimental
        professor_experimental_id: linha.professor_id,
        sabia_preco: linha.sabia_preco,
      }));

      const { error } = await supabase.from('leads').insert(registros);
      if (error) throw error;

      toast.success(`${linhasValidas.length} experimental(is) registrada(s)!`);
      setModalOpen(null);
      resetForm();
      loadData();
      loadSugestoesLeads(); // Recarregar sugestões após salvar
    } catch (error) {
      console.error('Erro ao salvar experimentais:', error);
      toast.error('Erro ao salvar experimentais');
    } finally {
      setSaving(false);
    }
  };

  // Salvar lote de visitas
  const handleSaveLoteVisitas = async () => {
    if (!unidadeParaSalvar) {
      toast.error('Selecione uma unidade no filtro acima');
      return;
    }

    if (loteVisitas.length === 0) {
      toast.error('Adicione pelo menos uma visita');
      return;
    }

    setSaving(true);
    try {
      const dataLancamento = loteData.toISOString().split('T')[0];
      
      const registros = loteVisitas.map(linha => ({
        unidade_id: unidadeParaSalvar,
        data_contato: dataLancamento,
        status: 'visita_escola',
        nome: linha.aluno_nome || null,
        canal_origem_id: linha.canal_origem_id,
        curso_interesse_id: linha.curso_id,
        quantidade: 1,
      }));

      const { error } = await supabase.from('leads').insert(registros);
      if (error) throw error;

      toast.success(`${loteVisitas.length} visita${loteVisitas.length !== 1 ? 's' : ''} registrada${loteVisitas.length !== 1 ? 's' : ''}!`);
      setModalOpen(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Erro ao salvar visitas:', error);
      toast.error('Erro ao salvar visitas');
    } finally {
      setSaving(false);
    }
  };

  // Funções auxiliares para manipular linhas do lote
  const addLinhaLead = () => {
    setLoteLeads([...loteLeads, { id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1 }]);
  };

  const removeLinhaLead = (id: string) => {
    if (loteLeads.length > 1) {
      setLoteLeads(loteLeads.filter(l => l.id !== id));
    }
  };

  const updateLinhaLead = (id: string, field: keyof LoteLinha, value: any) => {
    setLoteLeads(loteLeads.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const addLinhaExperimental = () => {
    setLoteExperimentais([...loteExperimentais, { id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1, status_experimental: 'experimental_agendada', professor_id: null, sabia_preco: null }]);
  };

  const removeLinhaExperimental = (id: string) => {
    if (loteExperimentais.length > 1) {
      setLoteExperimentais(loteExperimentais.filter(l => l.id !== id));
    }
  };

  const updateLinhaExperimental = (id: string, field: keyof LoteLinha, value: any) => {
    setLoteExperimentais(loteExperimentais.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const addLinhaVisita = () => {
    setLoteVisitas([...loteVisitas, { id: crypto.randomUUID(), aluno_nome: '', canal_origem_id: null, curso_id: null, quantidade: 1 }]);
  };

  const removeLinhaVisita = (id: string) => {
    if (loteVisitas.length > 1) {
      setLoteVisitas(loteVisitas.filter(l => l.id !== id));
    }
  };

  const updateLinhaVisita = (id: string, field: keyof LoteLinha, value: any) => {
    setLoteVisitas(loteVisitas.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // Salvar registro
  const handleSave = async () => {
    // Para admin: usar unidade do modal se preenchida, senão do filtro
    // Para usuário normal: usar sua unidade
    const unidadeFinal = isAdmin 
      ? (formData.unidade_id || unidadeParaSalvar)
      : unidadeParaSalvar;
      
    if (!unidadeFinal) {
      toast.error('Selecione uma unidade');
      return;
    }

    // Validação de campos obrigatórios para matrícula
    if (modalOpen === 'matricula') {
      if (!formData.aluno_data_nascimento) {
        toast.error('Informe a data de nascimento do aluno');
        return;
      }
      if (!TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno) && !formData.forma_pagamento_id) {
        toast.error('Selecione a forma de pagamento da parcela mensal');
        return;
      }
    }

    setSaving(true);
    try {
      // Usar a data selecionada no formulário (permite lançamento retroativo)
      const dataLancamento = formData.data.toISOString().split('T')[0];
      
      let tipo = modalOpen;
      if (modalOpen === 'experimental') {
        tipo = formData.status_experimental;
      }

      const registro: Partial<LeadDiario> = {
        unidade_id: unidadeFinal,
        data_contato: dataLancamento,
        status: tipo === 'matricula' ? 'convertido' : (tipo || 'novo'),
        canal_origem_id: formData.canal_origem_id,
        curso_interesse_id: formData.curso_id,
        quantidade: formData.quantidade,
        observacoes: null,
      };

      // Campos extras para matrícula
      if (modalOpen === 'matricula') {
        registro.nome = formData.aluno_nome;
        // Calcular idade a partir da data de nascimento
        registro.idade = formData.aluno_data_nascimento 
          ? Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null;
        registro.tipo_matricula = formData.tipo_matricula;
        registro.tipo_aluno = formData.tipo_aluno;
        registro.professor_experimental_id = formData.teve_experimental ? formData.professor_experimental_id : null;
        registro.professor_fixo_id = formData.professor_fixo_id;
        const dispensaPagamento = TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno);
        registro.valor_passaporte = formData.valor_passaporte || 0;
        registro.valor_parcela = dispensaPagamento ? 0 : (formData.valor_parcela || 0);
        registro.forma_pagamento_id = dispensaPagamento ? null : formData.forma_pagamento_id;
        registro.forma_pagamento_passaporte_id = formData.forma_pagamento_passaporte_id;
        registro.dia_vencimento = formData.dia_vencimento;
        registro.quantidade = 1; // Matrícula sempre é 1
      }

      // Campos extras para experimental
      if (modalOpen === 'experimental') {
        registro.professor_experimental_id = formData.professor_id;
      }

      const { data: leadData, error } = await supabase.from('leads').insert(registro).select().single();

      if (error) throw error;

      // Se for matrícula, criar também o registro na tabela alunos
      // A trigger calcular_campos_aluno() calcula automaticamente: idade_atual e classificacao (EMLA/LAMK)
      if (modalOpen === 'matricula' && formData.aluno_nome) {
        // Determinar tipo_matricula_id baseado em tipo_aluno
        let tipo_matricula_id = 1; // Regular por padrão
        if (formData.tipo_aluno === 'bolsista_integral') tipo_matricula_id = 2;
        else if (formData.tipo_aluno === 'bolsista_parcial') tipo_matricula_id = 3;
        else if (formData.tipo_aluno === 'nao_pagante') tipo_matricula_id = 4;

        // Calcular datas de contrato automaticamente (12 meses)
        const dataMatricula = formData.data.toISOString().split('T')[0];
        const dataFimContrato = new Date(formData.data);
        dataFimContrato.setFullYear(dataFimContrato.getFullYear() + 1);

        const novoAluno: Record<string, any> = {
          nome: formData.aluno_nome.trim(),
          unidade_id: unidadeFinal,
          data_nascimento: formData.aluno_data_nascimento?.toISOString().split('T')[0] || null,
          // idade_atual e classificacao são calculados automaticamente pela trigger baseado em data_nascimento
          status: 'ativo',
          tipo_aluno: formData.tipo_aluno || 'pagante',
          tipo_matricula_id,
          valor_parcela: TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno) ? 0 : (formData.valor_parcela || 0),
          valor_passaporte: formData.valor_passaporte || 0,
          forma_pagamento_id: TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno) ? null : (formData.forma_pagamento_id || null),
          dia_vencimento: formData.dia_vencimento || 5,
          data_matricula: dataMatricula,
          data_inicio_contrato: dataMatricula,
          data_fim_contrato: dataFimContrato.toISOString().split('T')[0],
          curso_id: formData.curso_id || null,
          professor_atual_id: formData.professor_fixo_id || null,
          canal_origem_id: formData.canal_origem_id || null,
          professor_experimental_id: formData.teve_experimental ? formData.professor_experimental_id : null,
          agente_comercial: usuario?.nome || usuario?.email || null,
          // Novos campos de turma e flags
          dia_aula: formData.dia_aula || null,
          horario_aula: formData.horario_aula || null,
          is_ex_aluno: formData.is_ex_aluno || false,
          is_aluno_retorno: formData.is_aluno_retorno || false,
          responsavel_nome: formData.responsavel_nome?.trim() || null,
          responsavel_telefone: formData.responsavel_telefone?.trim() || null,
          responsavel_parentesco: formData.responsavel_parentesco || null,
        };

        console.log('Inserindo aluno:', novoAluno);
        const { data: alunoData, error: alunoError } = await supabase.from('alunos').insert(novoAluno).select().single();
        
        if (alunoError) {
          console.error('Erro ao criar aluno:', alunoError);
          toast.error(`Erro ao criar aluno: ${alunoError.message}`);
        } else {
          console.log('Aluno criado com sucesso:', alunoData);
          toast.success('Aluno cadastrado com sucesso!');
        }
      }

      toast.success('Registro salvo com sucesso!');
      setModalOpen(null);
      resetForm();
      loadData();

    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar registro');
    } finally {
      setSaving(false);
    }
  };

  // Função auxiliar para calcular range de datas baseado no período
  const calcularRangeDatas = () => {
    const hoje = new Date();
    let dataInicio: Date;
    let dataFim: Date;

    switch (relatorioPeriodo) {
      case 'hoje':
        dataInicio = hoje;
        dataFim = hoje;
        break;
      case 'ontem':
        const ontem = new Date(hoje);
        ontem.setDate(hoje.getDate() - 1);
        dataInicio = ontem;
        dataFim = ontem;
        break;
      case 'personalizado':
        dataInicio = relatorioDataInicio;
        dataFim = relatorioDataFim;
        break;
      default:
        dataInicio = hoje;
        dataFim = hoje;
    }

    return {
      dataInicio: dataInicio.toISOString().split('T')[0],
      dataFim: dataFim.toISOString().split('T')[0],
      dataInicioObj: dataInicio,
      dataFimObj: dataFim
    };
  };

  // Gerar relatório diário
  const gerarRelatorioDiario = async () => {
    const { dataInicio, dataFim, dataInicioObj, dataFimObj } = calcularRangeDatas();
    const hoje = dataFimObj;
    const dia = hoje.getDate().toString().padStart(2, '0');
    const mesNome = hoje.toLocaleString('pt-BR', { month: 'long' });
    const ano = hoje.getFullYear();
    
    // Buscar informações da unidade incluindo o Hunter
    const unidadeId = filtroAtivo || usuario?.unidade_id;
    let unidadeNome = 'Unidade';
    let hunterNome = usuario?.nome || 'Usuário';
    
    if (unidadeId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados do período selecionado
    const { data: registrosPeriodo } = await supabase
      .from('leads')
      .select('status, quantidade')
      .eq('unidade_id', unidadeId)
      .gte('data_contato', dataInicio)
      .lte('data_contato', dataFim);

    const leadsPeriodo = registrosPeriodo?.filter(r => ['novo','agendado'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisPeriodo = registrosPeriodo?.filter(r => r.status?.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasPeriodo = registrosPeriodo?.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;

    // Buscar experimentais agendadas para o dia final do período
    const { data: experimentaisDia } = await supabase
      .from('leads')
      .select('quantidade')
      .eq('unidade_id', unidadeId)
      .eq('data_contato', dataFim)
      .like('status', 'experimental%');
    
    const experimentaisAgendadasDia = experimentaisDia?.reduce((acc, r) => acc + r.quantidade, 0) || 0;

    // Buscar visitas do dia final do período
    const { data: visitasDia } = await supabase
      .from('leads')
      .select('quantidade')
      .eq('unidade_id', unidadeId)
      .eq('data_contato', dataFim)
      .eq('status', 'visita_escola');
    
    const visitasDiaTotal = visitasDia?.reduce((acc, r) => acc + r.quantidade, 0) || 0;

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 *RELATÓRIO DIÁRIO*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📆 ${dia}/${mesNome}/${ano}\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    texto += `🎯 Leads no período: *${leadsPeriodo}*\n`;
    texto += `🎸 Experimentais no período: *${experimentaisPeriodo}*\n`;
    texto += `📆 Experimentais agendadas: *${experimentaisAgendadasDia}*\n`;
    texto += `🏫 Visitas: *${visitasDiaTotal}*\n`;
    texto += `✅ Matrículas no período: *${matriculasPeriodo}*\n\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório semanal
  const gerarRelatorioSemanal = async () => {
    const hoje = new Date();
    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(hoje.getDate() - 7);
    
    // Buscar informações da unidade incluindo o Hunter
    const unidadeId = filtroAtivo || usuario?.unidade_id;
    let unidadeNome = 'Unidade';
    let hunterNome = usuario?.nome || 'Usuário';
    
    if (unidadeId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados dos últimos 7 dias
    const { data: registrosSemana } = await supabase
      .from('leads')
      .select('status, quantidade, valor_passaporte, valor_parcela')
      .eq('unidade_id', unidadeId)
      .gte('data_contato', seteDiasAtras.toISOString().split('T')[0])
      .lte('data_contato', hoje.toISOString().split('T')[0]);

    const leadsSemana = registrosSemana?.filter(r => ['novo','agendado'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisSemana = registrosSemana?.filter(r => r.status?.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasSemana = registrosSemana?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasSemana = registrosSemana?.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;

    // Calcular conversões
    const conversaoLeadExp = leadsSemana > 0 ? (experimentaisSemana / leadsSemana) * 100 : 0;
    const conversaoExpMat = experimentaisSemana > 0 ? (matriculasSemana / experimentaisSemana) * 100 : 0;
    const conversaoLeadMat = leadsSemana > 0 ? (matriculasSemana / leadsSemana) * 100 : 0;

    // Calcular tickets médios
    const matriculas = registrosSemana?.filter(r => ['matriculado','convertido'].includes(r.status)) || [];
    const totalPassaporte = matriculas.reduce((acc, r) => acc + (r.valor_passaporte || 0), 0);
    const totalParcela = matriculas.reduce((acc, r) => acc + (r.valor_parcela || 0), 0);
    const ticketMedioPassaporte = matriculasSemana > 0 ? totalPassaporte / matriculasSemana : 0;
    const ticketMedioParcela = matriculasSemana > 0 ? totalParcela / matriculasSemana : 0;
    
    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📆 *RELATÓRIO SEMANAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 Últimos 7 dias\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    texto += `📈 *TOTAIS DA SEMANA*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🎯 Leads na semana: *${leadsSemana}*\n`;
    texto += `🎸 Experimentais na semana: *${experimentaisSemana}*\n`;
    texto += `🏫 Visitas na semana: *${visitasSemana}*\n`;
    texto += `✅ Matrículas na semana: *${matriculasSemana}*\n\n`;

    texto += `📊 *CONVERSÕES*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Lead → Experimental: *${conversaoLeadExp.toFixed(1)}%*\n`;
    texto += `Experimental → Matrícula: *${conversaoExpMat.toFixed(1)}%*\n`;
    texto += `Lead → Matrícula: *${conversaoLeadMat.toFixed(1)}%*\n\n`;

    texto += `💰 *FINANCEIRO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Ticket Médio Passaporte: R$ ${ticketMedioPassaporte.toFixed(2)}\n`;
    texto += `Ticket Médio Parcela: R$ ${ticketMedioParcela.toFixed(2)}\n\n`;

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  };

  // Gerar relatório mensal completo
  const gerarRelatorioMensal = async () => {
    const hoje = new Date();
    const dia = hoje.getDate().toString().padStart(2, '0');
    const mesNome = hoje.toLocaleString('pt-BR', { month: 'long' });
    const mesNomeUpper = mesNome.toUpperCase();
    const ano = hoje.getFullYear();
    
    // Buscar informações da unidade incluindo o Hunter
    const unidadeId = filtroAtivo || usuario?.unidade_id;
    let unidadeNome = 'Unidade';
    let hunterNome = usuario?.nome || 'Usuário';
    
    if (unidadeId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados do mês completo
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const { data: registrosMes } = await supabase
      .from('leads')
      .select('status, quantidade, canal_origem_id, curso_interesse_id, canais_origem(nome), cursos(nome)')
      .eq('unidade_id', unidadeId)
      .gte('data_contato', primeiroDiaMes.toISOString().split('T')[0])
      .lte('data_contato', hoje.toISOString().split('T')[0]);

    const leadsMes = registrosMes?.filter(r => ['novo','agendado'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisMes = registrosMes?.filter(r => r.status?.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasMes = registrosMes?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasMes = registrosMes?.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;

    // Calcular conversões
    const conversaoLeadExp = leadsMes > 0 ? (experimentaisMes / leadsMes) * 100 : 0;
    const conversaoExpMat = experimentaisMes > 0 ? (matriculasMes / experimentaisMes) * 100 : 0;
    const conversaoLeadMat = leadsMes > 0 ? (matriculasMes / leadsMes) * 100 : 0;

    // Buscar matrículas detalhadas do mês
    const { data: matriculasDetalhadas } = await supabase
      .from('leads')
      .select(`
        data_contato, 
        nome, 
        idade, 
        tipo_matricula,
        valor_passaporte, 
        valor_parcela,
        canais_origem(nome),
        cursos(nome)
      `)
      .eq('unidade_id', unidadeId)
      .in('status', ['matriculado','convertido'])
      .gte('data_contato', primeiroDiaMes.toISOString().split('T')[0])
      .lte('data_contato', hoje.toISOString().split('T')[0])
      .order('data_contato', { ascending: true });

    // Agrupar leads por canal
    const leadsPorCanal: { [key: string]: number } = {};
    registrosMes?.filter(r => ['novo','agendado'].includes(r.status)).forEach(r => {
      const canal = (r.canais_origem as any)?.nome || 'Não informado';
      leadsPorCanal[canal] = (leadsPorCanal[canal] || 0) + r.quantidade;
    });

    // Agrupar leads por curso
    const leadsPorCurso: { [key: string]: number } = {};
    registrosMes?.filter(r => ['novo','agendado'].includes(r.status)).forEach(r => {
      const curso = (r.cursos as any)?.nome || 'Não informado';
      leadsPorCurso[curso] = (leadsPorCurso[curso] || 0) + r.quantidade;
    });

    // Agrupar matrículas por canal
    const matriculasPorCanal: { [key: string]: number } = {};
    registrosMes?.filter(r => ['matriculado','convertido'].includes(r.status)).forEach(r => {
      const canal = (r.canais_origem as any)?.nome || 'Não informado';
      matriculasPorCanal[canal] = (matriculasPorCanal[canal] || 0) + r.quantidade;
    });

    // Agrupar matrículas por curso
    const matriculasPorCurso: { [key: string]: number } = {};
    registrosMes?.filter(r => ['matriculado','convertido'].includes(r.status)).forEach(r => {
      const curso = (r.cursos as any)?.nome || 'Não informado';
      matriculasPorCurso[curso] = (matriculasPorCurso[curso] || 0) + r.quantidade;
    });

    // Calcular totais financeiros
    const totalPassaporte = matriculasDetalhadas?.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0) || 0;
    const totalParcela = matriculasDetalhadas?.reduce((acc, m) => acc + (m.valor_parcela || 0), 0) || 0;
    const ticketMedioPass = matriculasMes > 0 ? totalPassaporte / matriculasMes : 0;
    const ticketMedioPar = matriculasMes > 0 ? totalParcela / matriculasMes : 0;

    // Contar matrículas por tipo
    const lamkCount = matriculasDetalhadas?.filter(m => m.tipo_matricula === 'LAMK').length || 0;
    const emlaCount = matriculasDetalhadas?.filter(m => m.tipo_matricula === 'EMLA').length || 0;

    // Cabeçalho
    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO MENSAL COMERCIAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Resumo Geral
    texto += `📈 *RESUMO GERAL DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🎯 Leads no mês: *${leadsMes}*\n`;
    texto += `🎸 Experimentais no mês: *${experimentaisMes}*\n`;
    texto += `🏫 Visitas no mês: *${visitasMes}*\n`;
    texto += `✅ Matrículas no mês: *${matriculasMes}*\n\n`;

    // Conversões
    texto += `📊 *TAXAS DE CONVERSÃO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Lead → Experimental: *${conversaoLeadExp.toFixed(1)}%*\n`;
    texto += `Experimental → Matrícula: *${conversaoExpMat.toFixed(1)}%*\n`;
    texto += `Lead → Matrícula: *${conversaoLeadMat.toFixed(1)}%*\n\n`;

    // Matrículas por tipo
    texto += `👥 *MATRÍCULAS DO MÊS (${matriculasMes})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🎨 LAMK (Kids): *${lamkCount}*\n`;
    texto += `🎸 EMLA (Adulto): *${emlaCount}*\n\n`;

    // Valores financeiros
    texto += `💰 *VALORES FINANCEIROS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total Passaportes: *R$ ${totalPassaporte.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `Total Parcelas: *R$ ${totalParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `Ticket Médio Pass.: *R$ ${ticketMedioPass.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `Ticket Médio Parc.: *R$ ${ticketMedioPar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n\n`;

    // Leads por Canal - sempre mostrar
    texto += `📲 *LEADS POR CANAIS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Object.keys(leadsPorCanal).length > 0) {
      Object.entries(leadsPorCanal)
        .sort(([, a], [, b]) => b - a)
        .forEach(([canal, qtd]) => {
          texto += `${canal}: ${qtd}\n`;
        });
    } else {
      texto += `Nenhum lead registrado\n`;
    }
    texto += `\n`;

    // Leads por Curso - sempre mostrar
    texto += `🎸 *LEADS POR CURSO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Object.keys(leadsPorCurso).length > 0) {
      Object.entries(leadsPorCurso)
        .sort(([, a], [, b]) => b - a)
        .forEach(([curso, qtd]) => {
          texto += `${curso}: ${qtd}\n`;
        });
    } else {
      texto += `Nenhum lead registrado\n`;
    }
    texto += `\n`;

    // Matrículas por Canal - sempre mostrar
    texto += `🔥 *MATRÍCULAS POR CANAIS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Object.keys(matriculasPorCanal).length > 0) {
      Object.entries(matriculasPorCanal)
        .sort(([, a], [, b]) => b - a)
        .forEach(([canal, qtd]) => {
          texto += `${canal}: ${qtd}\n`;
        });
    } else {
      texto += `Nenhuma matrícula registrada\n`;
    }
    texto += `\n`;

    // Matrículas por Curso - sempre mostrar
    texto += `🏆 *MATRÍCULAS POR CURSO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (Object.keys(matriculasPorCurso).length > 0) {
      Object.entries(matriculasPorCurso)
        .sort(([, a], [, b]) => b - a)
        .forEach(([curso, qtd]) => {
          texto += `${curso}: ${qtd}\n`;
        });
    } else {
      texto += `Nenhuma matrícula registrada\n`;
    }
    texto += `\n`;

    // Lista de matrículas
    if (matriculasDetalhadas && matriculasDetalhadas.length > 0) {
      texto += `📋 *LISTA DE MATRÍCULAS*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      matriculasDetalhadas.forEach((mat, i) => {
        const dataFormatada = new Date(mat.data_contato + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        texto += `${i + 1}. ${mat.nome}`;
        if (mat.idade) texto += ` (${mat.idade} anos)`;
        texto += `\n   📅 ${dataFormatada}`;
        if ((mat.cursos as any)?.nome) texto += ` | 🎵 ${(mat.cursos as any).nome}`;
        if ((mat.canais_origem as any)?.nome) texto += ` | 📱 ${(mat.canais_origem as any).nome}`;
        texto += `\n   💵 Pass: R$ ${(mat.valor_passaporte || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        texto += ` | Parc: R$ ${(mat.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;
      });
    }

    // Rodapé
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${dia}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${ano} às ${hoje.getHours()}:${hoje.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório de matrículas detalhado
  const gerarRelatorioMatriculas = async () => {
    const hoje = new Date();
    const dia = hoje.getDate().toString().padStart(2, '0');
    const mesNome = hoje.toLocaleString('pt-BR', { month: 'long' });
    const mesNomeUpper = mesNome.toUpperCase();
    const ano = hoje.getFullYear();
    
    // Buscar informações da unidade incluindo o Hunter
    const unidadeId = filtroAtivo || usuario?.unidade_id;
    let unidadeNome = 'Unidade';
    let hunterNome = usuario?.nome || 'Usuário';
    
    if (unidadeId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Calcular totais e estatísticas
    const totalMatriculas = matriculasMes.length;
    const lamkCount = matriculasMes.filter(m => m.tipo_matricula === 'LAMK').length;
    const emlaCount = matriculasMes.filter(m => m.tipo_matricula === 'EMLA').length;
    
    const totalPassaporte = matriculasMes.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0);
    const totalParcela = matriculasMes.reduce((acc, m) => acc + (m.valor_parcela || 0), 0);
    const ticketMedioPass = totalMatriculas > 0 ? totalPassaporte / totalMatriculas : 0;
    const ticketMedioPar = totalMatriculas > 0 ? totalParcela / totalMatriculas : 0;

    // Agrupar por canal
    const matriculasPorCanal: { [key: string]: number } = {};
    matriculasMes.forEach(m => {
      const canal = m.canal_nome || 'Não informado';
      matriculasPorCanal[canal] = (matriculasPorCanal[canal] || 0) + 1;
    });

    // Agrupar por curso
    const matriculasPorCurso: { [key: string]: number } = {};
    matriculasMes.forEach(m => {
      const curso = m.curso_nome || 'Não informado';
      matriculasPorCurso[curso] = (matriculasPorCurso[curso] || 0) + 1;
    });

    // Cabeçalho
    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📋 *RELATÓRIO DE MATRÍCULAS*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Resumo Executivo
    texto += `📊 *RESUMO EXECUTIVO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `✅ Total de Matrículas: *${totalMatriculas}*\n`;
    texto += `🎨 LAMK (Kids): *${lamkCount}*\n`;
    texto += `🎸 EMLA (Adulto): *${emlaCount}*\n\n`;

    // Valores Financeiros
    texto += `💰 *VALORES FINANCEIROS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total Passaportes: *R$ ${totalPassaporte.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `Total Parcelas: *R$ ${totalParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `Ticket Médio Pass.: *R$ ${ticketMedioPass.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `Ticket Médio Parc.: *R$ ${ticketMedioPar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n\n`;

    // Estatísticas
    texto += `📊 *ESTATÍSTICAS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Por Canal
    texto += `🔥 Por Canal:\n`;
    if (Object.keys(matriculasPorCanal).length > 0) {
      Object.entries(matriculasPorCanal)
        .sort(([, a], [, b]) => b - a)
        .forEach(([canal, qtd]) => {
          texto += `• ${canal}: ${qtd}\n`;
        });
    } else {
      texto += `• Nenhuma matrícula\n`;
    }
    texto += `\n`;

    // Por Curso
    texto += `🎸 Por Curso:\n`;
    if (Object.keys(matriculasPorCurso).length > 0) {
      Object.entries(matriculasPorCurso)
        .sort(([, a], [, b]) => b - a)
        .forEach(([curso, qtd]) => {
          texto += `• ${curso}: ${qtd}\n`;
        });
    } else {
      texto += `• Nenhuma matrícula\n`;
    }
    texto += `\n`;

    // Lista Detalhada
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📝 *LISTA DETALHADA*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    matriculasMes.forEach((mat, i) => {
      const dataFormatada = new Date(mat.data_contato + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      
      texto += `MAT. ${(i + 1).toString().padStart(2, '0')}\n`;
      texto += `📅 Data: ${dataFormatada}\n`;
      texto += `👤 Aluno: ${mat.nome || 'Não informado'}`;
      if (mat.idade) texto += ` (${mat.idade} anos)`;
      texto += `\n`;
      texto += `🎵 Curso: ${mat.curso_nome || 'Não informado'}\n`;
      texto += `👨‍🏫 Professor: ${mat.professor_fixo_nome || 'Não informado'}\n`;
      texto += `🎸 Prof. Experimental: ${mat.professor_exp_nome || 'Não teve'}\n`;
      texto += `📱 Canal: ${mat.canal_nome || 'Não informado'}\n`;
      texto += `👤 Hunter: ${hunterNome}\n`;
      texto += `💵 Pass: R$ ${(mat.valor_passaporte || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      if (mat.forma_pagamento_passaporte_nome) texto += ` (${mat.forma_pagamento_passaporte_nome})`;
      texto += `\n`;
      texto += `💵 Parc: R$ ${(mat.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      if (mat.forma_pagamento_nome) texto += ` (${mat.forma_pagamento_nome})`;
      texto += `\n\n`;
    });

    // Rodapé
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${dia}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${ano} às ${hoje.getHours()}:${hoje.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório comparativo mensal (mês atual vs mês anterior)
  const gerarRelatorioComparativoMensal = async () => {
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    
    // Mês anterior
    const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    const anoAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;
    
    const unidadeId = filtroAtivo || usuario?.unidade_id;
    let unidadeNome = 'Unidade';
    let hunterNome = usuario?.nome || 'Usuário';
    
    if (unidadeId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados do mês atual
    const inicioMesAtual = new Date(anoAtual, mesAtual, 1);
    const fimMesAtual = hoje;
    
    const { data: dadosMesAtual } = await supabase
      .from('leads')
      .select('status, quantidade')
      .eq('unidade_id', unidadeId)
      .gte('data_contato', inicioMesAtual.toISOString().split('T')[0])
      .lte('data_contato', fimMesAtual.toISOString().split('T')[0]);

    // Buscar dados do mês anterior
    const inicioMesAnterior = new Date(anoAnterior, mesAnterior, 1);
    const fimMesAnterior = new Date(anoAnterior, mesAnterior + 1, 0); // Último dia do mês
    
    const { data: dadosMesAnterior } = await supabase
      .from('leads')
      .select('status, quantidade')
      .eq('unidade_id', unidadeId)
      .gte('data_contato', inicioMesAnterior.toISOString().split('T')[0])
      .lte('data_contato', fimMesAnterior.toISOString().split('T')[0]);

    // Calcular totais mês atual
    const leadsAtual = dadosMesAtual?.filter(r => ['novo','agendado'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisAtual = dadosMesAtual?.filter(r => r.status?.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasAtual = dadosMesAtual?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasAtual = dadosMesAtual?.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;

    // Calcular totais mês anterior
    const leadsAnterior = dadosMesAnterior?.filter(r => ['novo','agendado'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisAnterior = dadosMesAnterior?.filter(r => r.status?.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasAnterior = dadosMesAnterior?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasAnterior = dadosMesAnterior?.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;

    // Calcular variações
    const varLeads = leadsAnterior > 0 ? ((leadsAtual - leadsAnterior) / leadsAnterior * 100) : 0;
    const varExp = experimentaisAnterior > 0 ? ((experimentaisAtual - experimentaisAnterior) / experimentaisAnterior * 100) : 0;
    const varVisitas = visitasAnterior > 0 ? ((visitasAtual - visitasAnterior) / visitasAnterior * 100) : 0;
    const varMat = matriculasAnterior > 0 ? ((matriculasAtual - matriculasAnterior) / matriculasAnterior * 100) : 0;

    const mesAtualNome = new Date(anoAtual, mesAtual, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const mesAnteriorNome = new Date(anoAnterior, mesAnterior, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO COMPARATIVO MENSAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    texto += `📅 *${mesAtualNome}/${anoAtual}* vs *${mesAnteriorNome}/${anoAnterior}*\n\n`;
    
    texto += `🎯 *LEADS*\n`;
    texto += `${mesAtualNome}: *${leadsAtual}* | ${mesAnteriorNome}: *${leadsAnterior}*\n`;
    texto += `Variação: *${varLeads > 0 ? '+' : ''}${varLeads.toFixed(1)}%* ${varLeads > 0 ? '📈' : varLeads < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `🎸 *EXPERIMENTAIS*\n`;
    texto += `${mesAtualNome}: *${experimentaisAtual}* | ${mesAnteriorNome}: *${experimentaisAnterior}*\n`;
    texto += `Variação: *${varExp > 0 ? '+' : ''}${varExp.toFixed(1)}%* ${varExp > 0 ? '📈' : varExp < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `🏫 *VISITAS*\n`;
    texto += `${mesAtualNome}: *${visitasAtual}* | ${mesAnteriorNome}: *${visitasAnterior}*\n`;
    texto += `Variação: *${varVisitas > 0 ? '+' : ''}${varVisitas.toFixed(1)}%* ${varVisitas > 0 ? '📈' : varVisitas < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `✅ *MATRÍCULAS*\n`;
    texto += `${mesAtualNome}: *${matriculasAtual}* | ${mesAnteriorNome}: *${matriculasAnterior}*\n`;
    texto += `Variação: *${varMat > 0 ? '+' : ''}${varMat.toFixed(1)}%* ${varMat > 0 ? '📈' : varMat < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório comparativo anual (mesmo mês ano atual vs ano anterior)
  const gerarRelatorioComparativoAnual = async () => {
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const anoAnterior = anoAtual - 1;
    
    const unidadeId = filtroAtivo || usuario?.unidade_id;
    let unidadeNome = 'Unidade';
    let hunterNome = usuario?.nome || 'Usuário';
    
    if (unidadeId) {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, hunter_nome')
        .eq('id', unidadeId)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        hunterNome = unidadeData.hunter_nome || usuario?.nome || 'Usuário';
      }
    }

    // Buscar dados do mês atual no ano atual
    const inicioMesAtual = new Date(anoAtual, mesAtual, 1);
    const fimMesAtual = hoje;
    
    const { data: dadosAnoAtual } = await supabase
      .from('leads')
      .select('status, quantidade')
      .eq('unidade_id', unidadeId)
      .gte('data_contato', inicioMesAtual.toISOString().split('T')[0])
      .lte('data_contato', fimMesAtual.toISOString().split('T')[0]);

    // Buscar dados do mesmo mês no ano anterior
    const inicioMesAnterior = new Date(anoAnterior, mesAtual, 1);
    const fimMesAnterior = new Date(anoAnterior, mesAtual + 1, 0);
    
    const { data: dadosAnoAnterior } = await supabase
      .from('leads')
      .select('status, quantidade')
      .eq('unidade_id', unidadeId)
      .gte('data_contato', inicioMesAnterior.toISOString().split('T')[0])
      .lte('data_contato', fimMesAnterior.toISOString().split('T')[0]);

    // Calcular totais ano atual
    const leadsAtual = dadosAnoAtual?.filter(r => ['novo','agendado'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisAtual = dadosAnoAtual?.filter(r => r.status?.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasAtual = dadosAnoAtual?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasAtual = dadosAnoAtual?.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;

    // Calcular totais ano anterior
    const leadsAnterior = dadosAnoAnterior?.filter(r => ['novo','agendado'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const experimentaisAnterior = dadosAnoAnterior?.filter(r => r.status?.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const visitasAnterior = dadosAnoAnterior?.filter(r => r.status === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0) || 0;
    const matriculasAnterior = dadosAnoAnterior?.filter(r => ['matriculado','convertido'].includes(r.status)).reduce((acc, r) => acc + r.quantidade, 0) || 0;

    // Calcular variações
    const varLeads = leadsAnterior > 0 ? ((leadsAtual - leadsAnterior) / leadsAnterior * 100) : 0;
    const varExp = experimentaisAnterior > 0 ? ((experimentaisAtual - experimentaisAnterior) / experimentaisAnterior * 100) : 0;
    const varVisitas = visitasAnterior > 0 ? ((visitasAtual - visitasAnterior) / visitasAnterior * 100) : 0;
    const varMat = matriculasAnterior > 0 ? ((matriculasAtual - matriculasAnterior) / matriculasAnterior * 100) : 0;

    const mesNome = new Date(anoAtual, mesAtual, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO COMPARATIVO ANUAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `👤 ${hunterNome}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    texto += `📅 *${mesNome}/${anoAtual}* vs *${mesNome}/${anoAnterior}*\n\n`;
    
    texto += `🎯 *LEADS*\n`;
    texto += `${anoAtual}: *${leadsAtual}* | ${anoAnterior}: *${leadsAnterior}*\n`;
    texto += `Variação: *${varLeads > 0 ? '+' : ''}${varLeads.toFixed(1)}%* ${varLeads > 0 ? '📈' : varLeads < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `🎸 *EXPERIMENTAIS*\n`;
    texto += `${anoAtual}: *${experimentaisAtual}* | ${anoAnterior}: *${experimentaisAnterior}*\n`;
    texto += `Variação: *${varExp > 0 ? '+' : ''}${varExp.toFixed(1)}%* ${varExp > 0 ? '📈' : varExp < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `🏫 *VISITAS*\n`;
    texto += `${anoAtual}: *${visitasAtual}* | ${anoAnterior}: *${visitasAnterior}*\n`;
    texto += `Variação: *${varVisitas > 0 ? '+' : ''}${varVisitas.toFixed(1)}%* ${varVisitas > 0 ? '📈' : varVisitas < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `✅ *MATRÍCULAS*\n`;
    texto += `${anoAtual}: *${matriculasAtual}* | ${anoAnterior}: *${matriculasAnterior}*\n`;
    texto += `Variação: *${varMat > 0 ? '+' : ''}${varMat.toFixed(1)}%* ${varMat > 0 ? '📈' : varMat < 0 ? '📉' : '➡️'}\n\n`;
    
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  const copiarRelatorio = async () => {
    let texto = '';
    
    switch (tipoRelatorio) {
      case 'diario':
        texto = await gerarRelatorioDiario();
        break;
      case 'semanal':
        texto = await gerarRelatorioSemanal();
        break;
      case 'mensal':
        texto = await gerarRelatorioMensal();
        break;
      case 'matriculas':
        texto = await gerarRelatorioMatriculas();
        break;
      case 'comparativo_mensal':
        texto = await gerarRelatorioComparativoMensal();
        break;
      case 'comparativo_anual':
        texto = await gerarRelatorioComparativoAnual();
        break;
      default:
        texto = await gerarRelatorioMensal();
    }
    
    // Usar método mais compatível com webviews/IDEs
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '2em';
    textarea.style.height = '2em';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        toast.success('Relatório copiado!');
      } else {
        console.error('execCommand retornou false');
        toast.error('Erro ao copiar. Tente selecionar e copiar manualmente.');
      }
    } catch (err) {
      console.error('Erro ao copiar:', err);
      toast.error('Erro ao copiar. Tente selecionar e copiar manualmente.');
    }
    
    document.body.removeChild(textarea);
  };

  // Enviar relatório via WhatsApp para o grupo
  const enviarWhatsAppGrupo = async () => {
    if (!relatorioTexto || enviandoWhatsApp) return;
    
    setEnviandoWhatsApp(true);
    setErroWhatsApp(null);
    setEnviadoWhatsApp(false);
    
    // Determinar a unidade para envio
    const unidadeEnvio = isAdmin ? (context?.unidadeSelecionada || 'todos') : (unidadeId || 'todos');
    
    try {
      const { data, error } = await supabase.functions.invoke('relatorio-admin-whatsapp', {
        body: {
          texto: relatorioTexto,
          tipoRelatorio: tipoRelatorio,
          unidade: unidadeEnvio,
          competencia: `${competencia.filtro.ano}-${String(competencia.filtro.mes).padStart(2, '0')}`,
        },
      });
      
      if (error) {
        console.error('[WhatsApp Comercial] Erro ao enviar:', error);
        setErroWhatsApp('Erro ao enviar mensagem');
        return;
      }
      
      if (data?.success || data?.partial) {
        console.log('[WhatsApp Comercial] ✅ Mensagem enviada!', data.resultados);
        setEnviadoWhatsApp(true);
        toast.success('Relatório enviado para o grupo!');
        setTimeout(() => setEnviadoWhatsApp(false), 3000);
      } else {
        setErroWhatsApp(data?.error || 'Erro desconhecido');
        toast.error(data?.error || 'Erro ao enviar');
      }
    } catch (err) {
      console.error('[WhatsApp Comercial] Erro inesperado:', err);
      setErroWhatsApp('Erro de conexão');
      toast.error('Erro de conexão');
    } finally {
      setEnviandoWhatsApp(false);
    }
  };

  // Obter contagem do dia para cada tipo
  const getContagemHoje = (tipo: string) => {
    if (tipo === 'experimental') {
      return registrosHoje
        .filter(r => r.status?.startsWith('experimental'))
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    if (tipo === 'visita') {
      return registrosHoje
        .filter(r => r.status === 'visita_escola')
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    if (tipo === 'lead') {
      return registrosHoje
        .filter(r => ['novo','agendado'].includes(r.status))
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    if (tipo === 'matricula') {
      return registrosHoje
        .filter(r => ['matriculado','convertido'].includes(r.status))
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    return registrosHoje
      .filter(r => r.status === tipo)
      .reduce((acc, r) => acc + r.quantidade, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // Calcular totais de hoje
  const hojeLeads = getContagemHoje('lead');
  const hojeExp = getContagemHoje('experimental');
  const hojeVisitas = getContagemHoje('visita');
  const hojeMatriculas = getContagemHoje('matricula');
  const hojeTotalRegistros = registrosHoje.length;

  // Data formatada
  const dataHoje = new Date().toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });
  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-emerald-400" />
            Comercial
          </h1>
          <p className="text-slate-400 mt-1">Lançamento diário de leads, experimentais, visitas e matrículas</p>
        </div>
        <div className="flex items-center gap-4">
          <CompetenciaFilter
            filtro={competencia.filtro}
            range={competencia.range}
            anosDisponiveis={competencia.anosDisponiveis}
            onTipoChange={competencia.setTipo}
            onAnoChange={competencia.setAno}
            onMesChange={competencia.setMes}
            onTrimestreChange={competencia.setTrimestre}
            onSemestreChange={competencia.setSemestre}
          />
          <button
            onClick={() => setRelatorioOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20"
          >
            <Copy className="w-4 h-4" />
            Gerar Relatório WhatsApp
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ABAS PRINCIPAIS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="flex gap-2 border-b border-slate-700 pb-2">
        <button
          onClick={() => setAbaPrincipal('lancamentos')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-medium transition-all",
            abaPrincipal === 'lancamentos' 
              ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20" 
              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
          )}
        >
          <Zap className="w-4 h-4" />
          Lançamentos
        </button>
        <button
          onClick={() => setAbaPrincipal('programa')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-medium transition-all",
            abaPrincipal === 'programa' 
              ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg shadow-yellow-500/20" 
              : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
          )}
        >
          <Trophy className="w-4 h-4" />
          Programa Matriculador+ LA
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CONTEÚDO DA ABA PROGRAMA */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {abaPrincipal === 'programa' && (
        <TabProgramaMatriculador 
          unidadeId={isAdmin ? (context?.unidadeSelecionada || 'todos') : unidadeId}
          ano={competencia.filtro.ano}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CONTEÚDO DA ABA LANÇAMENTOS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {abaPrincipal === 'lancamentos' && (
        <>
      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ALERTAS COMERCIAL (IA) */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <AlertasComercial 
        unidadeId={isAdmin ? (context?.unidadeSelecionada || 'todos') : (unidadeId || 'todos')}
        ano={competencia.filtro.ano}
        mes={competencia.filtro.mes}
      />

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 1: LANÇAMENTO DE HOJE */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-cyan-500/20 rounded-2xl overflow-hidden">
        {/* Header da seção */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Lançamento de Hoje</h2>
                <p className="text-sm text-cyan-400 capitalize">{dataHoje}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{hojeTotalRegistros}</p>
              <p className="text-xs text-slate-400">registros hoje</p>
            </div>
          </div>
        </div>

        {/* Quick Input Cards - HOJE */}
        <div className="p-6">
          <p className="text-sm text-slate-400 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Clique para adicionar um novo registro
          </p>
          <div data-tour="cards-resumo" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickInputCards.map((card) => {
              const Icon = card.icon;
              const contagemHoje = getContagemHoje(card.id);
              
              return (
                <button
                  key={card.id}
                  data-tour={`btn-${card.id}`}
                  onClick={() => setModalOpen(card.id)}
                  className={cn(
                    "group relative p-5 rounded-2xl border-2 transition-all hover:scale-[1.02] hover:shadow-xl",
                    card.bgColor,
                    card.borderColor,
                    "hover:border-opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center",
                      `bg-gradient-to-br ${card.color}`
                    )}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                      <Plus className={cn("w-4 h-4", card.textColor)} />
                    </div>
                  </div>
                  <div className="text-left">
                    <p className={cn("text-3xl font-bold mb-0.5", card.textColor)}>{contagemHoje}</p>
                    <p className="text-slate-400 text-sm font-medium">{card.label}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Lista de registros de hoje (se houver) */}
          {registrosHoje.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <p className="text-sm text-slate-400 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Últimos registros de hoje
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {registrosHoje.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        ['novo','agendado'].includes(r.status) ? 'bg-blue-400' :
                        r.status?.startsWith('experimental') ? 'bg-purple-400' :
                        r.status === 'visita_escola' ? 'bg-amber-400' : 'bg-emerald-400'
                      )} />
                      <span className="text-slate-300 capitalize">
                        {['novo','agendado'].includes(r.status) ? 'Lead' :
                         r.status === 'experimental_agendada' ? 'Exp. Agendada' :
                         r.status === 'experimental_realizada' ? 'Exp. Realizada' :
                         r.status === 'experimental_faltou' ? 'Exp. Faltou' :
                         r.status === 'visita_escola' ? 'Visita' : 'Matrícula'}
                      </span>
                    </div>
                    <span className="text-white font-medium">+{r.quantidade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 2: ACUMULADO DO MÊS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        {/* Header da seção */}
        <div className="bg-slate-800/80 border-b border-slate-700/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Acumulado do Mês</h2>
              <p className="text-sm text-slate-400 capitalize">{mesAtual}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Totais do Mês */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Totais
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-slate-400 font-medium">Leads Atendidos</span>
                </div>
                <p className="text-2xl font-bold text-blue-400">{resumo.leads}</p>
                {hojeLeads > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">+{hojeLeads} hoje</p>
                )}
              </div>
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <Guitar className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-slate-400 font-medium">Experimentais</span>
                </div>
                <p className="text-2xl font-bold text-purple-400">{resumo.experimentais}</p>
                {hojeExp > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">+{hojeExp} hoje</p>
                )}
              </div>
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-slate-400 font-medium">Visitas</span>
                </div>
                <p className="text-2xl font-bold text-amber-400">{resumo.visitas}</p>
                {hojeVisitas > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">+{hojeVisitas} hoje</p>
                )}
              </div>
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400 font-medium">Matrículas</span>
                </div>
                <p className="text-2xl font-bold text-emerald-400">{resumo.matriculas}</p>
                {hojeMatriculas > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">+{hojeMatriculas} hoje</p>
                )}
              </div>
            </div>
          </div>

          {/* Conversões - 3 métricas */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Conversões
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Lead → Experimental */}
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-blue-400 text-sm font-medium">Lead</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-purple-400 text-sm font-medium">Experimental</span>
                </div>
                <p className="text-3xl font-bold text-cyan-400 mb-2">{resumo.conversaoLeadExp.toFixed(1)}%</p>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(resumo.conversaoLeadExp, 100)}%` }}
                  />
                </div>
              </div>

              {/* Experimental → Matrícula */}
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-purple-400 text-sm font-medium">Experimental</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-emerald-400 text-sm font-medium">Matrícula</span>
                </div>
                <p className="text-3xl font-bold text-cyan-400 mb-2">{resumo.conversaoExpMat.toFixed(1)}%</p>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-emerald-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(resumo.conversaoExpMat, 100)}%` }}
                  />
                </div>
              </div>

              {/* Lead → Matrícula (direto) */}
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-blue-400 text-sm font-medium">Lead</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-emerald-400 text-sm font-medium">Matrícula</span>
                </div>
                <p className="text-3xl font-bold text-emerald-400 mb-2">{resumo.conversaoLeadMat.toFixed(1)}%</p>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(resumo.conversaoLeadMat, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Leads Atendidos por Canal e por Curso */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Leads Atendidos por Canal */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                Leads Atendidos por Canal
              </h3>
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                {resumo.leadsPorCanal.length > 0 ? (
                  <div className="space-y-3">
                    {resumo.leadsPorCanal.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-slate-300 text-sm">{c.canal}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-20 bg-slate-700/50 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${(c.quantidade / resumo.leads) * 100}%` }}
                            />
                          </div>
                          <span className="text-white font-semibold w-8 text-right">{c.quantidade}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm text-center py-4">Nenhum lead atendido registrado ainda</p>
                )}
              </div>
            </div>

            {/* Leads Atendidos por Curso */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Guitar className="w-4 h-4" />
                Leads Atendidos por Curso
              </h3>
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/30">
                {resumo.leadsPorCurso.length > 0 ? (
                  <div className="space-y-3">
                    {resumo.leadsPorCurso.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-slate-300 text-sm">{c.curso}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-20 bg-slate-700/50 rounded-full h-2">
                            <div 
                              className="bg-purple-500 h-2 rounded-full"
                              style={{ width: `${(c.quantidade / resumo.leads) * 100}%` }}
                            />
                          </div>
                          <span className="text-white font-semibold w-8 text-right">{c.quantidade}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm text-center py-4">Nenhum lead atendido registrado ainda</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 3: DETALHAMENTO DO FUNIL */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section data-tour="comercial-detalhamento" className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        {/* Header da seção com abas */}
        <div className="px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Detalhamento do Funil</h2>
                <p className="text-sm text-slate-400">Visualize e edite os registros de cada etapa</p>
              </div>
            </div>
          </div>
          
          {/* Abas de navegação */}
          <div data-tour="comercial-abas-funil" className="flex gap-2 flex-wrap">
            <button
              onClick={() => setAbaDetalhamento('leads')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                abaDetalhamento === 'leads'
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white"
              )}
            >
              <Smartphone className="w-4 h-4" />
              Leads Atendidos
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs",
                abaDetalhamento === 'leads' ? "bg-white/20" : "bg-slate-600"
              )}>
                {leadsMes.length}
              </span>
            </button>
            
            <button
              onClick={() => setAbaDetalhamento('experimental')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                abaDetalhamento === 'experimental'
                  ? "bg-gradient-to-r from-purple-500 to-violet-500 text-white shadow-lg"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white"
              )}
            >
              <Guitar className="w-4 h-4" />
              Experimentais
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs",
                abaDetalhamento === 'experimental' ? "bg-white/20" : "bg-slate-600"
              )}>
                {experimentaisMes.length}
              </span>
            </button>
            
            <button
              onClick={() => setAbaDetalhamento('visita')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                abaDetalhamento === 'visita'
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white"
              )}
            >
              <Building2 className="w-4 h-4" />
              Visitas
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs",
                abaDetalhamento === 'visita' ? "bg-white/20" : "bg-slate-600"
              )}>
                {visitasMes.length}
              </span>
            </button>
            
            <button
              onClick={() => setAbaDetalhamento('matricula')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                abaDetalhamento === 'matricula'
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white"
              )}
            >
              <GraduationCap className="w-4 h-4" />
              Matrículas
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs",
                abaDetalhamento === 'matricula' ? "bg-white/20" : "bg-slate-600"
              )}>
                {matriculasMes.length}
              </span>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABELA DE LEADS ATENDIDOS */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {abaDetalhamento === 'leads' && (
          <div className="p-4 overflow-x-auto">
            {leadsMes.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Data</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Nome</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Canal</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Curso</th>
                    {isAdmin && <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Unidade</th>}
                    <th className="pb-3 px-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsMes.map((lead, index) => (
                    <tr 
                      key={lead.id} 
                      className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={lead.data_contato}
                          onChange={async (valor) => lead.id && salvarCampoMatricula(lead.id, 'data_contato', valor)}
                          tipo="data"
                          textClassName="text-slate-300"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={lead.nome}
                          onChange={async (valor) => lead.id && salvarCampoMatricula(lead.id, 'nome', valor)}
                          tipo="texto"
                          textClassName="text-white font-medium"
                          placeholder="-"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={lead.canal_origem_id}
                          onChange={async (valor) => lead.id && salvarCampoMatricula(lead.id, 'canal_origem_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-cyan-400">{lead.canal_nome || '-'}</span>}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={lead.curso_interesse_id}
                          onChange={async (valor) => lead.id && salvarCampoMatricula(lead.id, 'curso_interesse_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-purple-400">{lead.curso_nome || '-'}</span>}
                        />
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-2 border-r border-slate-700/30">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                            {(lead as any).unidades?.codigo || '-'}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => lead.id && setDeleteId(lead.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <Smartphone className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Nenhum lead atendido registrado ainda</p>
                <p className="text-slate-500 text-sm mt-1">Clique no card "Leads Atendidos" acima para adicionar</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABELA DE EXPERIMENTAIS */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {abaDetalhamento === 'experimental' && (
          <div className="p-4 overflow-x-auto">
            {experimentaisMes.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Data</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Nome</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Status</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Canal</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Curso</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Professor</th>
                    {isAdmin && <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Unidade</th>}
                    <th className="pb-3 px-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {experimentaisMes.map((exp, index) => (
                    <tr 
                      key={exp.id} 
                      className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={exp.data_contato}
                          onChange={async (valor) => exp.id && salvarCampoMatricula(exp.id, 'data_contato', valor)}
                          tipo="data"
                          textClassName="text-slate-300"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={exp.nome}
                          onChange={async (valor) => exp.id && salvarCampoMatricula(exp.id, 'nome', valor)}
                          tipo="texto"
                          textClassName="text-white font-medium"
                          placeholder="-"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          exp.status === 'experimental_agendada' ? 'bg-amber-500/20 text-amber-400' :
                          exp.status === 'experimental_realizada' ? 'bg-emerald-500/20 text-emerald-400' :
                          exp.status === 'experimental_nao_compareceu' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-500/20 text-slate-400'
                        )}>
                          {exp.status === 'experimental_agendada' ? 'Agendada' :
                           exp.status === 'experimental_realizada' ? 'Realizada' :
                           exp.status === 'experimental_nao_compareceu' ? 'Não compareceu' : exp.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={exp.canal_origem_id}
                          onChange={async (valor) => exp.id && salvarCampoMatricula(exp.id, 'canal_origem_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-cyan-400">{exp.canal_nome || '-'}</span>}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={exp.curso_interesse_id}
                          onChange={async (valor) => exp.id && salvarCampoMatricula(exp.id, 'curso_interesse_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-purple-400">{exp.curso_nome || '-'}</span>}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={exp.professor_experimental_id}
                          onChange={async (valor) => exp.id && salvarCampoMatricula(exp.id, 'professor_experimental_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={professores.map(p => ({ value: p.value, label: p.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-violet-400">{(exp as any).professor_nome || '-'}</span>}
                        />
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-2 border-r border-slate-700/30">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                            {(exp as any).unidades?.codigo || '-'}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => exp.id && setDeleteId(exp.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <Guitar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Nenhuma experimental registrada ainda</p>
                <p className="text-slate-500 text-sm mt-1">Clique no card "Experimental" acima para adicionar</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABELA DE VISITAS */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {abaDetalhamento === 'visita' && (
          <div className="p-4 overflow-x-auto">
            {visitasMes.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Data</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Canal</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Curso</th>
                    <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Qtd</th>
                    {isAdmin && <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Unidade</th>}
                    <th className="pb-3 px-2 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visitasMes.map((visita, index) => (
                    <tr 
                      key={visita.id} 
                      className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={visita.data_contato}
                          onChange={async (valor) => visita.id && salvarCampoMatricula(visita.id, 'data_contato', valor)}
                          tipo="data"
                          textClassName="text-slate-300"
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={visita.canal_origem_id}
                          onChange={async (valor) => visita.id && salvarCampoMatricula(visita.id, 'canal_origem_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-cyan-400">{visita.canal_nome || '-'}</span>}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={visita.curso_id}
                          onChange={async (valor) => visita.id && salvarCampoMatricula(visita.id, 'curso_id', valor ? Number(valor) : null)}
                          tipo="select"
                          opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                          placeholder="-"
                          formatarExibicao={() => <span className="text-purple-400">{visita.curso_nome || '-'}</span>}
                        />
                      </td>
                      <td className="py-3 px-2 border-r border-slate-700/30">
                        <CelulaEditavelInline
                          value={visita.quantidade}
                          onChange={async (valor) => visita.id && salvarCampoMatricula(visita.id, 'quantidade', valor ? Number(valor) : 1)}
                          tipo="numero"
                          textClassName="text-amber-400 font-medium"
                        />
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-2 border-r border-slate-700/30">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                            {(visita as any).unidades?.codigo || '-'}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => visita.id && setDeleteId(visita.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Nenhuma visita registrada ainda</p>
                <p className="text-slate-500 text-sm mt-1">Clique no card "Visita" acima para adicionar</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TABELA DE MATRÍCULAS (original - mantida intacta) */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {abaDetalhamento === 'matricula' && (
          <>
            {/* Header específico de matrículas */}
            <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-emerald-400">{matriculasMes.length} matrícula{matriculasMes.length !== 1 ? 's' : ''} no mês</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Total Passaportes:</span>
                  <span className="text-lg font-bold text-emerald-400">
                    R$ {matriculasMes.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Tabela de Matrículas */}
            <div className="p-4 overflow-x-auto">
          {matriculasMes.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Data</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Aluno(a)</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Idade</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Curso</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Canal</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Prof. Exp.</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Prof. Fixo</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Passaporte</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Parcela</th>
                  <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Escola</th>
                  <th className="pb-3 px-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {matriculasMes.map((mat, index) => (
                  <tr 
                    key={mat.id} 
                    className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                    
                    {/* Data - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.data_contato}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'data_contato', valor)}
                        tipo="data"
                        textClassName="text-slate-300"
                      />
                    </td>
                    
                    {/* Aluno - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.nome}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'nome', valor)}
                        tipo="texto"
                        textClassName="text-white font-medium"
                        placeholder="-"
                      />
                    </td>
                    
                    {/* Idade - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.idade}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'idade', valor ? Number(valor) : null)}
                        tipo="numero"
                        textClassName="text-slate-300"
                        placeholder="-"
                      />
                    </td>
                    
                    {/* Curso - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.curso_interesse_id}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'curso_interesse_id', valor ? Number(valor) : null)}
                        tipo="select"
                        opcoes={cursos.map(c => ({ value: c.value, label: c.label }))}
                        placeholder="-"
                        formatarExibicao={() => mat.curso_nome || '-'}
                        textClassName="text-purple-400"
                      />
                    </td>
                    
                    {/* Canal - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.canal_origem_id}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'canal_origem_id', valor ? Number(valor) : null)}
                        tipo="select"
                        opcoes={canais.map(c => ({ value: c.value, label: c.label }))}
                        placeholder="-"
                        formatarExibicao={() => mat.canal_nome || '-'}
                        textClassName="text-blue-400"
                      />
                    </td>
                    
                    {/* Prof. Exp. - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.professor_experimental_id}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'professor_experimental_id', valor ? Number(valor) : null)}
                        tipo="select"
                        opcoes={professores.map(p => ({ value: p.value, label: p.label }))}
                        placeholder="-"
                        formatarExibicao={() => mat.professor_exp_nome || '-'}
                        textClassName="text-slate-300"
                      />
                    </td>
                    
                    {/* Prof. Fixo - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.professor_fixo_id}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'professor_fixo_id', valor ? Number(valor) : null)}
                        tipo="select"
                        opcoes={professores.map(p => ({ value: p.value, label: p.label }))}
                        placeholder="-"
                        formatarExibicao={() => mat.professor_fixo_nome || '-'}
                        textClassName="text-slate-300"
                      />
                    </td>
                    
                    {/* Passaporte - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.valor_passaporte}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'valor_passaporte', valor ? Number(valor) : null)}
                        tipo="moeda"
                        placeholder="-"
                        formatarExibicao={() => (
                          <span className="text-emerald-400 font-medium whitespace-nowrap">
                            R$ {(mat.valor_passaporte || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            {mat.forma_pagamento_passaporte_nome && (
                              <span className="text-slate-500 text-xs ml-1">{mat.forma_pagamento_passaporte_nome}</span>
                            )}
                          </span>
                        )}
                      />
                    </td>
                    
                    {/* Parcela - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <CelulaEditavelInline
                        value={mat.valor_parcela}
                        onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'valor_parcela', valor ? Number(valor) : null)}
                        tipo="moeda"
                        placeholder="-"
                        formatarExibicao={() => (
                          <span className="text-cyan-400 font-medium whitespace-nowrap">
                            R$ {(mat.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            {mat.forma_pagamento_nome && (
                              <span className="text-slate-500 text-xs ml-1">{mat.forma_pagamento_nome}</span>
                            )}
                          </span>
                        )}
                      />
                    </td>
                    
                    {/* Escola - Edição inline */}
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      <div className="flex items-center gap-1.5">
                        <CelulaEditavelInline
                          value={mat.tipo_matricula}
                          onChange={async (valor) => mat.id && salvarCampoMatricula(mat.id, 'tipo_matricula', valor)}
                          tipo="select"
                          opcoes={TIPOS_MATRICULA.map(t => ({ value: t.value, label: t.label }))}
                          placeholder="-"
                          formatarExibicao={() => (
                            <span className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium",
                              mat.tipo_matricula === 'LAMK' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                            )}>
                              {mat.tipo_matricula || '-'}
                            </span>
                          )}
                        />
                        {isAdmin && mat.unidades?.codigo && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                            {mat.unidades.codigo}
                          </span>
                        )}
                      </div>
                    </td>
                    
                    {/* Ações - Apenas excluir */}
                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => mat.id && setDeleteId(mat.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-600 bg-slate-800/50">
                  <td colSpan={8} className="py-3 px-2 text-right text-slate-400 font-medium">Totais:</td>
                  <td className="py-3 px-2 text-emerald-400 font-bold">
                    R$ {matriculasMes.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-2 text-cyan-400 font-bold">
                    R$ {matriculasMes.reduce((acc, m) => acc + (m.valor_parcela || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Nenhuma matrícula registrada ainda</p>
              <p className="text-slate-500 text-sm mt-1">Clique no card "Matrícula" acima para adicionar</p>
            </div>
          )}
        </div>

        {/* Resumo financeiro */}
        {matriculasMes.length > 0 && (
          <div className="px-6 pb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">LAMK (Kids)</p>
                <p className="text-xl font-bold text-pink-400">
                  {matriculasMes.filter(m => m.tipo_matricula === 'LAMK').length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">EMLA (Adulto)</p>
                <p className="text-xl font-bold text-blue-400">
                  {matriculasMes.filter(m => m.tipo_matricula === 'EMLA').length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">Ticket Médio Pass.</p>
                <p className="text-xl font-bold text-emerald-400">
                  R$ {matriculasMes.length > 0 
                    ? (matriculasMes.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0) / matriculasMes.length).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    : '0,00'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-1">Ticket Médio Parc.</p>
                <p className="text-xl font-bold text-cyan-400">
                  R$ {matriculasMes.length > 0 
                    ? (matriculasMes.reduce((acc, m) => acc + (m.valor_parcela || 0), 0) / matriculasMes.length).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    : '0,00'}
                </p>
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </section>

      {/* Modal de Lead Atendido */}
      {modalOpen === 'lead' && (
        <Modal title="Registrar Leads Atendidos" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">📅 Data do Lançamento</Label>
              <DatePicker
                date={loteData}
                onDateChange={(date) => setLoteData(date || new Date())}
                placeholder="Selecione a data"
              />
            </div>

            {/* Tabela de linhas */}
            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr className="text-slate-400 text-xs uppercase">
                    <th className="py-2 px-2 text-left">Nome</th>
                    <th className="py-2 px-2 text-left w-32">Canal</th>
                    <th className="py-2 px-2 text-left w-32">Curso</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loteLeads.map((linha) => (
                    <tr key={linha.id} className="border-t border-slate-700/50">
                      <td className="py-2 px-2">
                        <Input
                          type="text"
                          value={linha.aluno_nome || ''}
                          onChange={(e) => updateLinhaLead(linha.id, 'aluno_nome', e.target.value)}
                          placeholder="Nome do lead..."
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={linha.canal_origem_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaLead(linha.id, 'canal_origem_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Canal..." />
                          </SelectTrigger>
                          <SelectContent>
                            {canais.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={linha.curso_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaLead(linha.id, 'curso_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Curso..." />
                          </SelectTrigger>
                          <SelectContent>
                            {cursos.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => removeLinhaLead(linha.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          disabled={loteLeads.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Botão adicionar linha */}
            <button
              onClick={addLinhaLead}
              className="w-full py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adicionar lead
            </button>

            {/* Total */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
              <span className="text-slate-400">Total de leads atendidos:</span>
              <span className="text-2xl font-bold text-cyan-400">
                {loteLeads.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length}
              </span>
            </div>

            <Button
              onClick={handleSaveLoteLeads}
              disabled={saving || loteLeads.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length === 0}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar ({loteLeads.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length} leads atendidos)
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal de Experimental */}
      {modalOpen === 'experimental' && (
        <Modal title="Registrar Experimentais" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">📅 Data do Lançamento</Label>
              <DatePicker
                date={loteData}
                onDateChange={(date) => setLoteData(date || new Date())}
                placeholder="Selecione a data"
              />
            </div>

            {/* Tabela de linhas */}
            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr className="text-slate-400 text-xs uppercase">
                    <th className="py-2 px-1 text-left">Nome</th>
                    <th className="py-2 px-1 text-left w-24">Status</th>
                    <th className="py-2 px-1 text-left w-24">Canal</th>
                    <th className="py-2 px-1 text-left w-24">Curso</th>
                    <th className="py-2 px-1 text-left w-24">Prof.</th>
                    <th className="py-2 px-1 text-center w-16">💰</th>
                    <th className="py-2 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {loteExperimentais.map((linha) => (
                    <tr key={linha.id} className="border-t border-slate-700/50">
                      <td className="py-2 px-1">
                        <ComboboxNome
                          value={linha.aluno_nome || ''}
                          onChange={(nome) => updateLinhaExperimental(linha.id, 'aluno_nome', nome)}
                          onSelectSugestao={(sugestao) => {
                            // Auto-preencher todos os campos de uma vez quando selecionar um lead existente
                            setLoteExperimentais(prev => prev.map(l => 
                              l.id === linha.id 
                                ? { 
                                    ...l, 
                                    aluno_nome: sugestao.nome,
                                    canal_origem_id: sugestao.canal_origem_id || l.canal_origem_id,
                                    curso_id: sugestao.curso_id || l.curso_id,
                                  } 
                                : l
                            ));
                          }}
                          sugestoes={sugestoesLeads.filter(s => ['novo','agendado','lead'].includes(s.tipo))}
                          placeholder="Nome do aluno..."
                        />
                      </td>
                      <td className="py-2 px-1">
                        <Select
                          value={linha.status_experimental || 'experimental_agendada'}
                          onValueChange={(value) => updateLinhaExperimental(linha.id, 'status_experimental', value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Status..." />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_EXPERIMENTAL.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-1">
                        <Select
                          value={linha.canal_origem_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaExperimental(linha.id, 'canal_origem_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Canal..." />
                          </SelectTrigger>
                          <SelectContent>
                            {canais.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-1">
                        <Select
                          value={linha.curso_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaExperimental(linha.id, 'curso_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Curso..." />
                          </SelectTrigger>
                          <SelectContent>
                            {cursos.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-1">
                        <Select
                          value={linha.professor_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaExperimental(linha.id, 'professor_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Prof..." />
                          </SelectTrigger>
                          <SelectContent>
                            {professores.map((p) => (
                              <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <Checkbox
                          checked={linha.sabia_preco === true}
                          onCheckedChange={(checked) => updateLinhaExperimental(linha.id, 'sabia_preco', checked ? true : false)}
                          className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                        />
                      </td>
                      <td className="py-2 px-1">
                        <button
                          onClick={() => removeLinhaExperimental(linha.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          disabled={loteExperimentais.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legenda do checkbox */}
            <p className="text-xs text-slate-500">💰 = Lead sabia o preço antes da experimental</p>

            {/* Botão adicionar linha */}
            <button
              onClick={addLinhaExperimental}
              className="w-full py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-purple-400 hover:border-purple-500/50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adicionar linha
            </button>

            {/* Total */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
              <span className="text-slate-400">Total de experimentais:</span>
              <span className="text-2xl font-bold text-purple-400">
                {loteExperimentais.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length}
              </span>
            </div>

            <Button
              onClick={handleSaveLoteExperimentais}
              disabled={saving || loteExperimentais.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length === 0}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar ({loteExperimentais.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0).length} experimentais)
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal de Visita - LOTE */}
      {modalOpen === 'visita' && (
        <Modal title="Registrar Visitas em Lote" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">📅 Data do Lançamento</Label>
              <DatePicker
                date={loteData}
                onDateChange={(date) => setLoteData(date || new Date())}
                placeholder="Selecione a data"
              />
            </div>

            {/* Tabela de linhas */}
            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr className="text-slate-400 text-xs uppercase">
                    <th className="py-2 px-2 text-left">Nome</th>
                    <th className="py-2 px-2 text-left w-32">Canal</th>
                    <th className="py-2 px-2 text-left w-32">Curso</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loteVisitas.map((linha) => (
                    <tr key={linha.id} className="border-t border-slate-700/50">
                      <td className="py-2 px-2">
                        <Input
                          type="text"
                          value={linha.aluno_nome || ''}
                          onChange={(e) => updateLinhaVisita(linha.id, 'aluno_nome', e.target.value)}
                          placeholder="Nome do visitante..."
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={linha.canal_origem_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaVisita(linha.id, 'canal_origem_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Canal..." />
                          </SelectTrigger>
                          <SelectContent>
                            {canais.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Select
                          value={linha.curso_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaVisita(linha.id, 'curso_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Curso..." />
                          </SelectTrigger>
                          <SelectContent>
                            {cursos.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => removeLinhaVisita(linha.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          disabled={loteVisitas.length === 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Botão adicionar linha */}
            <button
              onClick={addLinhaVisita}
              className="w-full py-2 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adicionar linha
            </button>

            {/* Total */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
              <span className="text-slate-400">Total de visitas:</span>
              <span className="text-2xl font-bold text-amber-400">
                {loteVisitas.length}
              </span>
            </div>

            <Button
              onClick={handleSaveLoteVisitas}
              disabled={saving}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar Todas ({loteVisitas.length} visita{loteVisitas.length !== 1 ? 's' : ''})
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal de Matrícula */}
      {modalOpen === 'matricula' && (
        <Modal title="Registrar Matrícula" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Data da Matrícula</Label>
              <DatePicker
                date={formData.data}
                onDateChange={(date) => setFormData({ ...formData, data: date || new Date() })}
                placeholder="Selecione a data"
                maxDate={new Date()}
              />
            </div>
            <div>
              <Label className="mb-2 block">Nome do Aluno *</Label>
              <ComboboxNome
                value={formData.aluno_nome}
                onChange={(nome) => setFormData({ ...formData, aluno_nome: nome })}
                onSelectSugestao={(sugestao) => {
                  // Auto-preencher canal e curso quando selecionar um lead/experimental existente
                  setFormData(prev => ({
                    ...prev,
                    aluno_nome: sugestao.nome,
                    canal_origem_id: sugestao.canal_origem_id || prev.canal_origem_id,
                    curso_id: sugestao.curso_id || prev.curso_id,
                    // Se veio de experimental, marcar que teve experimental
                    teve_experimental: sugestao.tipo.startsWith('experimental') ? true : prev.teve_experimental,
                    professor_experimental_id: sugestao.professor_id || prev.professor_experimental_id,
                  }));
                }}
                sugestoes={sugestoesLeads}
                placeholder="Digite ou selecione o nome..."
              />
              <p className="text-xs text-slate-500 mt-1">
                Sugestões do funil ou digite um nome novo (ex-aluno)
              </p>
            </div>
            {/* Campo Unidade - visível apenas para admin */}
            {isAdmin && (
              <div>
                <Label className="mb-2 block">Unidade *</Label>
                <Select
                  value={formData.unidade_id || ''}
                  onValueChange={(value) => setFormData({ ...formData, unidade_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a unidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => (
                      <SelectItem key={u.value} value={u.value.toString()}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">Data de Nascimento *</Label>
                <DatePickerNascimento
                  date={formData.aluno_data_nascimento || undefined}
                  onDateChange={(date) => setFormData({ ...formData, aluno_data_nascimento: date || null })}
                  placeholder="Selecione..."
                />
                {formData.aluno_data_nascimento && (
                  <p className="text-xs text-slate-400 mt-1">
                    Idade: {Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000))} anos
                    {' → '}
                    <span className={Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) < 12 ? 'text-cyan-400' : 'text-violet-400'}>
                      {Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) < 12 ? 'LAMK' : 'EMLA'}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Tipo Aluno</Label>
                <Select
                  value={formData.tipo_aluno}
                  onValueChange={(value) => setFormData({ ...formData, tipo_aluno: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ALUNO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Responsável (opcional) */}
            <div className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-slate-300">👤 Responsável <span className="text-xs font-normal text-slate-500">(opcional)</span></h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="mb-1 block text-xs">Nome do Responsável</Label>
                  <Input
                    value={formData.responsavel_nome}
                    onChange={(e) => setFormData({ ...formData, responsavel_nome: e.target.value })}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="mb-1 block text-xs">Telefone/WhatsApp</Label>
                  <Input
                    value={formData.responsavel_telefone}
                    onChange={(e) => setFormData({ ...formData, responsavel_telefone: e.target.value })}
                    placeholder="(21) 99999-9999"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Parentesco</Label>
                <Select
                  value={formData.responsavel_parentesco}
                  onValueChange={(value) => setFormData({ ...formData, responsavel_parentesco: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mae">Mãe</SelectItem>
                    <SelectItem value="pai">Pai</SelectItem>
                    <SelectItem value="avo">Avó/Avô</SelectItem>
                    <SelectItem value="tio">Tio/Tia</SelectItem>
                    <SelectItem value="tutor">Tutor Legal</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Curso</Label>
              <Select
                value={formData.curso_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, curso_id: parseInt(value) || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {cursos.map((c) => (
                    <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Canal de Origem</Label>
              <Select
                value={formData.canal_origem_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, canal_origem_id: parseInt(value) || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {canais.map((c) => (
                    <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="teveExp" className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    id="teveExp"
                    checked={formData.teve_experimental}
                    onChange={(e) => setFormData({ ...formData, teve_experimental: e.target.checked })}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 rounded border-2 border-slate-600 bg-slate-800 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all group-hover:border-slate-500 peer-checked:group-hover:bg-emerald-400 flex items-center justify-center">
                    <svg className={`w-3 h-3 text-white transition-opacity ${formData.teve_experimental ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <span className="text-slate-300 group-hover:text-white transition-colors">Teve aula experimental?</span>
              </label>
            </div>
            {formData.teve_experimental && (
              <div>
                <Label className="mb-2 block">Professor da Experimental</Label>
                <Select
                  value={formData.professor_experimental_id?.toString() || ''}
                  onValueChange={(value) => setFormData({ ...formData, professor_experimental_id: parseInt(value) || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {professores.map((p) => (
                      <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="mb-2 block">Professor Fixo</Label>
              <Select
                value={formData.professor_fixo_id?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, professor_fixo_id: parseInt(value) || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {professores.map((p) => (
                    <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dia e Horário da Aula */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-2 block">Dia da Aula</Label>
                <Select
                  value={formData.dia_aula || ''}
                  onValueChange={(value) => setFormData({ ...formData, dia_aula: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Segunda">Segunda</SelectItem>
                    <SelectItem value="Terça">Terça</SelectItem>
                    <SelectItem value="Quarta">Quarta</SelectItem>
                    <SelectItem value="Quinta">Quinta</SelectItem>
                    <SelectItem value="Sexta">Sexta</SelectItem>
                    <SelectItem value="Sábado">Sábado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Horário</Label>
                <Select
                  value={formData.horario_aula || ''}
                  onValueChange={(value) => setFormData({ ...formData, horario_aula: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="08:00">08:00</SelectItem>
                    <SelectItem value="09:00">09:00</SelectItem>
                    <SelectItem value="10:00">10:00</SelectItem>
                    <SelectItem value="11:00">11:00</SelectItem>
                    <SelectItem value="14:00">14:00</SelectItem>
                    <SelectItem value="15:00">15:00</SelectItem>
                    <SelectItem value="16:00">16:00</SelectItem>
                    <SelectItem value="17:00">17:00</SelectItem>
                    <SelectItem value="18:00">18:00</SelectItem>
                    <SelectItem value="19:00">19:00</SelectItem>
                    <SelectItem value="20:00">20:00</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Flags do Aluno */}
            <div className="flex flex-wrap gap-4 py-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_ex_aluno}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_ex_aluno: !!checked })}
                />
                <span className="text-sm text-slate-300">É ex-aluno (já estudou antes)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.is_aluno_retorno}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_aluno_retorno: !!checked })}
                />
                <span className="text-sm text-slate-300">É aluno retorno</span>
              </label>
            </div>

            {/* Passaporte */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-amber-400">🎫 Passaporte</h4>
              <div className={`grid gap-3 ${formData.forma_pagamento_passaporte === 'cartao_credito' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <Label className="mb-1 block text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_passaporte || ''}
                    onChange={(e) => setFormData({ ...formData, valor_passaporte: parseFloat(e.target.value) || null })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Forma Pagamento</Label>
                  <Select
                    value={formData.forma_pagamento_passaporte}
                    onValueChange={(value) => setFormData({ ...formData, forma_pagamento_passaporte: value, parcelas_passaporte: value === 'cartao_credito' ? 1 : 1 })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="link">Link de Pagamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.forma_pagamento_passaporte === 'cartao_credito' && (
                  <div>
                    <Label className="mb-1 block text-xs">Parcelas</Label>
                    <Select
                      value={formData.parcelas_passaporte?.toString() || '1'}
                      onValueChange={(value) => setFormData({ ...formData, parcelas_passaporte: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="1x" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1x (à vista)</SelectItem>
                        <SelectItem value="2">2x</SelectItem>
                        <SelectItem value="3">3x</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Parcela */}
            <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-cyan-400">📅 Parcela Mensal</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="mb-1 block text-xs">Valor (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.valor_parcela || ''}
                    onChange={(e) => setFormData({ ...formData, valor_parcela: parseFloat(e.target.value) || null })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Forma Pagamento *</Label>
                  <Select
                    value={formData.forma_pagamento_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, forma_pagamento_id: parseInt(value) || null })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {formasPagamento.map((f) => (
                        <SelectItem key={f.value} value={f.value.toString()}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Vencimento</Label>
                  <Select
                    value={formData.dia_vencimento?.toString() || '5'}
                    onValueChange={(value) => setFormData({ ...formData, dia_vencimento: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Dia..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Dia 5</SelectItem>
                      <SelectItem value="20">Dia 20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.aluno_nome || !formData.aluno_data_nascimento || (!TIPOS_SEM_PAGAMENTO.includes(formData.tipo_aluno) && !formData.forma_pagamento_id)}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar Matrícula
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal de Seleção de Tipo de Relatório */}
      {relatorioOpen && !tipoRelatorio && (
        <Modal title={<span className="flex items-center gap-2"><FileText className="w-5 h-5 text-cyan-400" />Gerar Relatório</span>} onClose={() => setRelatorioOpen(false)}>
          <div className="space-y-4">
            {/* Seleção de Período */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <Label className="text-slate-300 text-sm font-medium mb-3 block">Período do Relatório</Label>
              
              {/* Botões de atalho */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { id: 'hoje', label: 'Hoje' },
                  { id: 'ontem', label: 'Ontem' },
                  { id: 'personalizado', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setRelatorioPeriodo(p.id as typeof relatorioPeriodo);
                      const hoje = new Date();
                      if (p.id === 'hoje') {
                        setRelatorioDataInicio(hoje);
                        setRelatorioDataFim(hoje);
                      } else if (p.id === 'ontem') {
                        const ontem = new Date(hoje);
                        ontem.setDate(ontem.getDate() - 1);
                        setRelatorioDataInicio(ontem);
                        setRelatorioDataFim(ontem);
                      }
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      relatorioPeriodo === p.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600/50'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              
              {/* Seletor de datas personalizado */}
              {relatorioPeriodo === 'personalizado' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Início</Label>
                    <DatePicker
                      date={relatorioDataInicio}
                      onDateChange={(date) => date && setRelatorioDataInicio(date)}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Fim</Label>
                    <DatePicker
                      date={relatorioDataFim}
                      onDateChange={(date) => date && setRelatorioDataFim(date)}
                    />
                  </div>
                </div>
              )}
              
              {/* Exibir período selecionado */}
              <p className="text-xs text-cyan-400 mt-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {relatorioDataInicio.toLocaleDateString('pt-BR')} 
                {relatorioDataInicio.toDateString() !== relatorioDataFim.toDateString() && (
                  <> até {relatorioDataFim.toLocaleDateString('pt-BR')}</>
                )}
              </p>
            </div>

            <p className="text-slate-400 text-sm">Escolha o tipo de relatório:</p>
            
            {/* Relatório Diário */}
            <button
              onClick={() => setTipoRelatorio('diario')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center text-cyan-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Relatório Diário</h4>
                <p className="text-xs text-slate-400">Resumo do período: leads, experimentais, visitas e matrículas</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório Semanal */}
            <button
              onClick={() => setTipoRelatorio('semanal')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center text-cyan-400">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Relatório Semanal</h4>
                <p className="text-xs text-slate-400">Resumo com totais, conversões e principais canais</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório Mensal */}
            <button
              onClick={() => setTipoRelatorio('mensal')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center text-cyan-400">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Relatório Mensal Completo</h4>
                <p className="text-xs text-slate-400">Análise completa: conversões, canais, cursos, valores e lista de matrículas</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório de Matrículas */}
            <button
              onClick={() => setTipoRelatorio('matriculas')}
              className="w-full flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center text-cyan-400">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white">Relatório de Matrículas Detalhado</h4>
                <p className="text-xs text-slate-400">Lista individual de cada matrícula com todos os dados</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório Comparativo Mensal */}
            <button
              onClick={() => setTipoRelatorio('comparativo_mensal')}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-purple-900/20 to-pink-900/20 hover:from-purple-900/30 hover:to-pink-900/30 border border-purple-700/50 hover:border-purple-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-purple-700/50 rounded-lg flex items-center justify-center text-purple-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white flex items-center gap-2">
                  Comparativo Mensal
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">NOVO</span>
                </h4>
                <p className="text-xs text-slate-400">Mês atual vs mês anterior com variações percentuais</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>

            {/* Relatório Comparativo Anual */}
            <button
              onClick={() => setTipoRelatorio('comparativo_anual')}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-blue-900/20 to-cyan-900/20 hover:from-blue-900/30 hover:to-cyan-900/30 border border-blue-700/50 hover:border-blue-600 rounded-xl transition-all text-left"
            >
              <div className="w-10 h-10 bg-blue-700/50 rounded-lg flex items-center justify-center text-blue-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-white flex items-center gap-2">
                  Comparativo Anual
                  <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">NOVO</span>
                </h4>
                <p className="text-xs text-slate-400">Mesmo mês ano atual vs ano anterior com variações</p>
              </div>
              <span className="text-slate-500">→</span>
            </button>
          </div>
        </Modal>
      )}

      {/* Modal de Visualização do Relatório */}
      {relatorioOpen && tipoRelatorio && (
        <Modal 
          title={
            <span className="flex items-center gap-2">
              {tipoRelatorio === 'diario' && <Calendar className="w-5 h-5 text-cyan-400" />}
              {tipoRelatorio === 'semanal' && <CalendarDays className="w-5 h-5 text-cyan-400" />}
              {tipoRelatorio === 'mensal' && <BarChart3 className="w-5 h-5 text-cyan-400" />}
              {tipoRelatorio === 'matriculas' && <Users className="w-5 h-5 text-cyan-400" />}
              {tipoRelatorio === 'comparativo_mensal' && <TrendingUp className="w-5 h-5 text-purple-400" />}
              {tipoRelatorio === 'comparativo_anual' && <TrendingUp className="w-5 h-5 text-blue-400" />}
              {tipoRelatorio === 'diario' ? 'Relatório Diário' :
               tipoRelatorio === 'semanal' ? 'Relatório Semanal' :
               tipoRelatorio === 'mensal' ? 'Relatório Mensal' :
               tipoRelatorio === 'matriculas' ? 'Relatório de Matrículas' :
               tipoRelatorio === 'comparativo_mensal' ? 'Comparativo Mensal' :
               'Comparativo Anual'}
            </span>
          } 
          onClose={() => { setRelatorioOpen(false); setTipoRelatorio(null); setRelatorioTexto(''); }}
        >
          <div className="space-y-4">
            <button
              onClick={() => { setTipoRelatorio(null); setRelatorioTexto(''); }}
              className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1"
            >
              ← Voltar para seleção
            </button>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-400 text-sm">Edite o relatório antes de copiar:</Label>
                <button
                  onClick={async () => {
                    if (tipoRelatorio === 'diario') {
                      const texto = await gerarRelatorioDiario();
                      setRelatorioTexto(texto);
                    } else if (tipoRelatorio === 'semanal') {
                      const texto = await gerarRelatorioSemanal();
                      setRelatorioTexto(texto);
                    } else if (tipoRelatorio === 'mensal') {
                      const texto = await gerarRelatorioMensal();
                      setRelatorioTexto(texto);
                    } else if (tipoRelatorio === 'matriculas') {
                      const texto = await gerarRelatorioMatriculas();
                      setRelatorioTexto(texto);
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Resetar
                </button>
              </div>
              <textarea
                value={relatorioTexto}
                onChange={(e) => setRelatorioTexto(e.target.value)}
                className="w-full h-96 p-4 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-300 font-mono resize-none focus:border-cyan-500 focus:outline-none scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600"
                placeholder="O relatório aparecerá aqui..."
              />
              <p className="text-xs text-slate-500 mt-2">
                💡 Você pode editar qualquer parte do relatório: nomes, números, adicionar observações, etc.
              </p>
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  if (relatorioTexto) {
                    // Usar método mais compatível com webviews/IDEs
                    const textarea = document.createElement('textarea');
                    textarea.value = relatorioTexto;
                    textarea.style.position = 'fixed';
                    textarea.style.top = '0';
                    textarea.style.left = '0';
                    textarea.style.width = '2em';
                    textarea.style.height = '2em';
                    textarea.style.padding = '0';
                    textarea.style.border = 'none';
                    textarea.style.outline = 'none';
                    textarea.style.boxShadow = 'none';
                    textarea.style.background = 'transparent';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    
                    try {
                      const successful = document.execCommand('copy');
                      if (successful) {
                        toast.success('Relatório copiado!');
                      } else {
                        console.error('execCommand retornou false');
                        toast.error('Erro ao copiar. Tente selecionar e copiar manualmente.');
                      }
                    } catch (err) {
                      console.error('Erro ao copiar:', err);
                      toast.error('Erro ao copiar. Tente selecionar e copiar manualmente.');
                    }
                    
                    document.body.removeChild(textarea);
                  } else {
                    toast.error('Aguarde o relatório ser gerado');
                  }
                }}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500"
              >
                <Copy className="w-5 h-5 mr-2" />
                Copiar
              </Button>
              <Button
                onClick={enviarWhatsAppGrupo}
                disabled={!relatorioTexto || enviandoWhatsApp}
                className={cn(
                  'flex-1 transition-all',
                  enviadoWhatsApp 
                    ? 'bg-emerald-500' 
                    : erroWhatsApp 
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-green-600 hover:bg-green-700'
                )}
              >
                {enviandoWhatsApp ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : enviadoWhatsApp ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Enviado!
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    WhatsApp
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PLANO DE AÇÃO INTELIGENTE (IA) */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <PlanoAcaoComercial 
        unidadeId={isAdmin ? (context?.unidadeSelecionada || 'todos') : (unidadeId || 'todos')}
        ano={competencia.filtro.ano}
        mes={competencia.filtro.mes}
      />

      {/* AlertDialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir esta matrícula? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}

      {/* Tour e Botão de Ajuda */}
      <PageTour tourName="comercial" steps={comercialTourSteps} />
      <TourHelpButton tourName="comercial" />
    </div>
  );
}

// Componente Modal reutilizável com scrollbar sutil para dark mode
function Modal({ title, children, onClose }: { title: string | React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
          {children}
        </div>
      </div>
    </div>
  );
}

export default ComercialPage;
