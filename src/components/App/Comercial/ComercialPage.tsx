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
  RotateCcw
} from 'lucide-react';
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
import { useCompetenciaFiltro } from '@/hooks/useCompetenciaFiltro';

// Tipos
interface LeadDiario {
  id?: number;
  unidade_id: string;
  data: string;
  tipo: string;
  canal_origem_id: number | null;
  curso_id: number | null;
  quantidade: number;
  observacoes: string | null;
  aluno_nome: string | null;
  aluno_idade: number | null;
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
    label: 'Leads', 
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

export function ComercialPage() {
  const { usuario, isAdmin, unidadeId } = useAuth();
  const context = useOutletContext<{ filtroAtivo: string | null; unidadeSelecionada: string | null }>();
  
  // Hook de filtro de competência (período)
  const competencia = useCompetenciaFiltro();
  
  // Para usuário de unidade: sempre usa sua unidade (unidadeId do auth)
  // Para admin: usa a unidade selecionada no dropdown do header (unidadeSelecionada do context)
  const unidadeParaSalvar = isAdmin 
    ? context?.unidadeSelecionada 
    : unidadeId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState<'lead' | 'experimental' | 'visita' | 'matricula' | null>(null);
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const [tipoRelatorio, setTipoRelatorio] = useState<'diario' | 'semanal' | 'mensal' | 'matriculas' | null>(null);
  const [relatorioTexto, setRelatorioTexto] = useState('');
  
  // Estado para período do relatório
  const [relatorioPeriodo, setRelatorioPeriodo] = useState<'hoje' | 'ontem' | 'semana' | 'mes' | 'personalizado'>('hoje');
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
  
  // Matrículas do mês (para tabela)
  const [matriculasMes, setMatriculasMes] = useState<(LeadDiario & { 
    canal_nome?: string; 
    curso_nome?: string; 
    professor_exp_nome?: string;
    professor_fixo_nome?: string;
    forma_pagamento_nome?: string;
    forma_pagamento_passaporte_nome?: string;
  })[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Partial<LeadDiario>>({});
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Estados para lançamento em lote
  interface LoteLinha {
    id: string;
    canal_origem_id: number | null;
    curso_id: number | null;
    quantidade: number;
    status_experimental?: string;
    professor_id?: number | null;
  }
  
  const [loteData, setLoteData] = useState(new Date());
  const [loteLeads, setLoteLeads] = useState<LoteLinha[]>([
    { id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1 }
  ]);
  const [loteExperimentais, setLoteExperimentais] = useState<LoteLinha[]>([
    { id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1, status_experimental: 'experimental_agendada', professor_id: null }
  ]);
  const [loteVisitas, setLoteVisitas] = useState<LoteLinha[]>([
    { id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1 }
  ]);
  
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
  });

  // Carregar dados mestres
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [canaisRes, cursosRes, professoresRes, formasRes, unidadesRes] = await Promise.all([
          supabase.from('canais_origem').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('cursos').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('formas_pagamento').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome'),
        ]);

        if (canaisRes.data) setCanais(canaisRes.data.map((c: any) => ({ value: c.id, label: c.nome })));
        if (cursosRes.data) setCursos(cursosRes.data.map((c: any) => ({ value: c.id, label: c.nome })));
        if (professoresRes.data) setProfessores(professoresRes.data.map((p: any) => ({ value: p.id, label: p.nome })));
        if (formasRes.data) setFormasPagamento(formasRes.data.map((f: any) => ({ value: f.id, label: f.nome })));
        if (unidadesRes.data) setUnidades(unidadesRes.data.map((u: any) => ({ value: u.id, label: u.nome })));
      } catch (error) {
        console.error('Erro ao carregar dados mestres:', error);
      }
    };

    loadMasterData();
  }, []);

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
        .from('leads_diarios')
        .select('*, canais_origem(nome), cursos(nome), unidades(codigo)')
        .gte('data', startDate)
        .lte('data', endDate)
        .order('data', { ascending: false });

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
      const leads = registros.filter(r => r.tipo === 'lead').reduce((acc, r) => acc + r.quantidade, 0);
      const experimentais = registros.filter(r => r.tipo.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0);
      const visitas = registros.filter(r => r.tipo === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0);
      const matriculas = registros.filter(r => r.tipo === 'matricula').reduce((acc, r) => acc + r.quantidade, 0);

      // Leads por canal
      const canalMap = new Map<string, number>();
      registros.filter(r => r.tipo === 'lead').forEach(r => {
        const canal = (r.canais_origem as any)?.nome || 'Não informado';
        canalMap.set(canal, (canalMap.get(canal) || 0) + r.quantidade);
      });
      const leadsPorCanal = Array.from(canalMap.entries())
        .map(([canal, quantidade]) => ({ canal, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade);

      // Leads por curso
      const cursoMap = new Map<string, number>();
      registros.filter(r => r.tipo === 'lead').forEach(r => {
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
      setRegistrosHoje(registros.filter(r => r.data === hoje));

      // Matrículas do mês (com nomes dos relacionamentos)
      const matriculasDoMes = registros
        .filter(r => r.tipo === 'matricula')
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

  // Funções de edição inline da tabela de matrículas
  const startEditing = (matricula: LeadDiario) => {
    setEditingId(matricula.id || null);
    setEditingData({
      aluno_nome: matricula.aluno_nome,
      aluno_idade: matricula.aluno_idade,
      curso_id: matricula.curso_id,
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
        .from('leads_diarios')
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

  const confirmDelete = async () => {
    if (!deleteId) return;
    
    try {
      const { error } = await supabase
        .from('leads_diarios')
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
      aluno_idade: null,
      tipo_matricula: 'EMLA',
      tipo_aluno: 'pagante',
      teve_experimental: false,
      professor_experimental_id: null,
      professor_fixo_id: null,
      valor_passaporte: null,
      valor_parcela: null,
      forma_pagamento_id: null,
    });
    // Reset lotes
    setLoteData(new Date());
    setLoteLeads([{ id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1 }]);
    setLoteExperimentais([{ id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1, status_experimental: 'experimental_agendada', professor_id: null }]);
    setLoteVisitas([{ id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1 }]);
  };

  // Salvar lote de leads
  const handleSaveLoteLeads = async () => {
    if (!unidadeParaSalvar) {
      toast.error('Selecione uma unidade no filtro acima');
      return;
    }

    const linhasValidas = loteLeads.filter(l => l.quantidade > 0);
    if (linhasValidas.length === 0) {
      toast.error('Adicione pelo menos um lead');
      return;
    }

    setSaving(true);
    try {
      const dataLancamento = loteData.toISOString().split('T')[0];
      
      const registros = linhasValidas.map(linha => ({
        unidade_id: unidadeParaSalvar,
        data: dataLancamento,
        tipo: 'lead',
        canal_origem_id: linha.canal_origem_id,
        curso_id: linha.curso_id,
        quantidade: linha.quantidade,
      }));

      const { error } = await supabase.from('leads_diarios').insert(registros);
      if (error) throw error;

      const totalLeads = linhasValidas.reduce((acc, l) => acc + l.quantidade, 0);
      toast.success(`${totalLeads} leads registrados!`);
      setModalOpen(null);
      resetForm();
      loadData();
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

    const linhasValidas = loteExperimentais.filter(l => l.quantidade > 0);
    if (linhasValidas.length === 0) {
      toast.error('Adicione pelo menos uma experimental');
      return;
    }

    setSaving(true);
    try {
      const dataLancamento = loteData.toISOString().split('T')[0];
      
      const registros = linhasValidas.map(linha => ({
        unidade_id: unidadeParaSalvar,
        data: dataLancamento,
        tipo: linha.status_experimental || 'experimental_agendada',
        canal_origem_id: linha.canal_origem_id,
        curso_id: linha.curso_id,
        quantidade: linha.quantidade,
        professor_id: linha.professor_id,
      }));

      const { error } = await supabase.from('leads_diarios').insert(registros);
      if (error) throw error;

      const total = linhasValidas.reduce((acc, l) => acc + l.quantidade, 0);
      toast.success(`${total} experimentais registradas!`);
      setModalOpen(null);
      resetForm();
      loadData();
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

    const linhasValidas = loteVisitas.filter(l => l.quantidade > 0);
    if (linhasValidas.length === 0) {
      toast.error('Adicione pelo menos uma visita');
      return;
    }

    setSaving(true);
    try {
      const dataLancamento = loteData.toISOString().split('T')[0];
      
      const registros = linhasValidas.map(linha => ({
        unidade_id: unidadeParaSalvar,
        data: dataLancamento,
        tipo: 'visita',
        canal_origem_id: linha.canal_origem_id,
        curso_id: null,
        quantidade: linha.quantidade,
      }));

      const { error } = await supabase.from('leads_diarios').insert(registros);
      if (error) throw error;

      const total = linhasValidas.reduce((acc, l) => acc + l.quantidade, 0);
      toast.success(`${total} visitas registradas!`);
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
    setLoteLeads([...loteLeads, { id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1 }]);
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
    setLoteExperimentais([...loteExperimentais, { id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1, status_experimental: 'experimental_agendada', professor_id: null }]);
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
    setLoteVisitas([...loteVisitas, { id: crypto.randomUUID(), canal_origem_id: null, curso_id: null, quantidade: 1 }]);
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
      if (!formData.forma_pagamento_id) {
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
        data: dataLancamento,
        tipo: tipo || 'lead',
        canal_origem_id: formData.canal_origem_id,
        curso_id: formData.curso_id,
        quantidade: formData.quantidade,
        observacoes: null,
      };

      // Campos extras para matrícula
      if (modalOpen === 'matricula') {
        registro.aluno_nome = formData.aluno_nome;
        // Calcular idade a partir da data de nascimento
        registro.aluno_idade = formData.aluno_data_nascimento 
          ? Math.floor((new Date().getTime() - formData.aluno_data_nascimento.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null;
        registro.tipo_matricula = formData.tipo_matricula;
        registro.tipo_aluno = formData.tipo_aluno;
        registro.professor_experimental_id = formData.teve_experimental ? formData.professor_experimental_id : null;
        registro.professor_fixo_id = formData.professor_fixo_id;
        registro.valor_passaporte = formData.valor_passaporte;
        registro.valor_parcela = formData.valor_parcela;
        registro.forma_pagamento_id = formData.forma_pagamento_id;
        registro.forma_pagamento_passaporte_id = formData.forma_pagamento_passaporte_id;
        registro.dia_vencimento = formData.dia_vencimento;
        registro.quantidade = 1; // Matrícula sempre é 1
      }

      // Campos extras para experimental
      if (modalOpen === 'experimental') {
        registro.professor_experimental_id = formData.professor_id;
      }

      const { data: leadData, error } = await supabase.from('leads_diarios').insert(registro).select().single();

      if (error) throw error;

      // Se for matrícula, criar também o registro na tabela alunos
      // A trigger calcular_campos_aluno() calcula automaticamente: idade_atual e classificacao (EMLA/LAMK)
      if (modalOpen === 'matricula' && formData.aluno_nome) {
        const novoAluno: Record<string, any> = {
          nome: formData.aluno_nome.trim(),
          unidade_id: unidadeFinal,
          data_nascimento: formData.aluno_data_nascimento?.toISOString().split('T')[0] || null,
          // idade_atual e classificacao são calculados automaticamente pela trigger baseado em data_nascimento
          status: 'ativo',
          tipo_aluno: formData.tipo_aluno || 'pagante',
          valor_parcela: formData.valor_parcela || 0,
          data_matricula: formData.data.toISOString().split('T')[0],
          curso_id: formData.curso_id || null,
          professor_atual_id: formData.professor_fixo_id || null,
          canal_origem_id: formData.canal_origem_id || null,
          professor_experimental_id: formData.teve_experimental ? formData.professor_experimental_id : null,
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

  // Gerar relatório diário
  const gerarRelatorioDiario = () => {
    const hoje = new Date();
    const dia = hoje.getDate().toString().padStart(2, '0');
    const mesNome = hoje.toLocaleString('pt-BR', { month: 'long' });
    const ano = hoje.getFullYear();
    const unidadeNome = usuario?.unidade_nome || 'Unidade';
    const nomeUsuario = usuario?.nome || 'Usuário';

    const leadsHoje = registrosHoje.filter(r => r.tipo === 'lead').reduce((acc, r) => acc + r.quantidade, 0);
    const experimentaisHoje = registrosHoje.filter(r => r.tipo.startsWith('experimental')).reduce((acc, r) => acc + r.quantidade, 0);
    const visitasHoje = registrosHoje.filter(r => r.tipo === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0);
    const matriculasHoje = registrosHoje.filter(r => r.tipo === 'matricula').reduce((acc, r) => acc + r.quantidade, 0);

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 *RELATÓRIO DIÁRIO*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📆 ${dia}/${mesNome}/${ano}\n`;
    texto += `👤 ${nomeUsuario}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    texto += `🎯 Leads: *${leadsHoje}*\n`;
    texto += `🎸 Experimentais: *${experimentaisHoje}*\n`;
    texto += `🏫 Visitas: *${visitasHoje}*\n`;
    texto += `✅ Matrículas: *${matriculasHoje}*\n\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  };

  // Gerar relatório semanal
  const gerarRelatorioSemanal = () => {
    const hoje = new Date();
    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(hoje.getDate() - 7);
    const unidadeNome = usuario?.unidade_nome || 'Unidade';
    const nomeUsuario = usuario?.nome || 'Usuário';

    // Filtrar registros da última semana
    const registrosSemana = registrosHoje; // Simplificado - você pode buscar os últimos 7 dias do banco
    
    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📆 *RELATÓRIO SEMANAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 Últimos 7 dias\n`;
    texto += `👤 ${nomeUsuario}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    texto += `📈 *TOTAIS DA SEMANA*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🎯 Leads: *${resumo.leads}*\n`;
    texto += `🎸 Experimentais: *${resumo.experimentais}*\n`;
    texto += `🏫 Visitas: *${resumo.visitas}*\n`;
    texto += `✅ Matrículas: *${resumo.matriculas}*\n\n`;

    texto += `📊 *CONVERSÕES*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Lead → Experimental: *${resumo.conversaoLeadExp.toFixed(1)}%*\n`;
    texto += `Experimental → Matrícula: *${resumo.conversaoExpMat.toFixed(1)}%*\n\n`;

    if (resumo.leadsPorCanal.length > 0) {
      texto += `📱 *TOP 3 CANAIS*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      resumo.leadsPorCanal.slice(0, 3).forEach((c, i) => {
        texto += `${i + 1}. ${c.canal}: *${c.quantidade}*\n`;
      });
      texto += `\n`;
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  };

  // Gerar relatório mensal completo
  const gerarRelatorioMensal = () => {
    const hoje = new Date();
    const dia = hoje.getDate().toString().padStart(2, '0');
    const mesNome = hoje.toLocaleString('pt-BR', { month: 'long' });
    const mesNomeUpper = mesNome.toUpperCase();
    const ano = hoje.getFullYear();
    const unidadeNome = usuario?.unidade_nome || 'Unidade';
    const nomeUsuario = usuario?.nome || 'Usuário';

    // Cabeçalho
    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO MENSAL COMERCIAL*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `👤 ${nomeUsuario}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Resumo Geral
    texto += `📈 *RESUMO GERAL DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🎯 Leads: *${resumo.leads}*\n`;
    texto += `🎸 Experimentais: *${resumo.experimentais}*\n`;
    texto += `🏫 Visitas: *${resumo.visitas}*\n`;
    texto += `✅ Matrículas: *${resumo.matriculas}*\n\n`;

    // Conversões
    texto += `📊 *TAXAS DE CONVERSÃO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Lead → Experimental: *${resumo.conversaoLeadExp.toFixed(1)}%*\n`;
    texto += `Experimental → Matrícula: *${resumo.conversaoExpMat.toFixed(1)}%*\n`;
    texto += `Lead → Matrícula: *${resumo.conversaoLeadMat.toFixed(1)}%*\n\n`;

    // Leads por Canal
    if (resumo.leadsPorCanal.length > 0) {
      texto += `📱 *LEADS POR CANAL*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      resumo.leadsPorCanal.forEach(c => {
        const percent = ((c.quantidade / resumo.leads) * 100).toFixed(0);
        texto += `• ${c.canal}: *${c.quantidade}* (${percent}%)\n`;
      });
      texto += `\n`;
    }

    // Leads por Curso
    if (resumo.leadsPorCurso.length > 0) {
      texto += `🎵 *LEADS POR CURSO*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      resumo.leadsPorCurso.forEach(c => {
        const percent = ((c.quantidade / resumo.leads) * 100).toFixed(0);
        texto += `• ${c.curso}: *${c.quantidade}* (${percent}%)\n`;
      });
      texto += `\n`;
    }

    // Matrículas Detalhadas
    if (matriculasMes.length > 0) {
      texto += `👥 *MATRÍCULAS DO MÊS (${matriculasMes.length})*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      
      const lamk = matriculasMes.filter(m => m.tipo_matricula === 'LAMK');
      const emla = matriculasMes.filter(m => m.tipo_matricula === 'EMLA');
      
      texto += `🎨 LAMK (Kids): *${lamk.length}*\n`;
      texto += `🎸 EMLA (Adulto): *${emla.length}*\n\n`;

      // Valores financeiros
      const totalPassaporte = matriculasMes.reduce((acc, m) => acc + (m.valor_passaporte || 0), 0);
      const totalParcela = matriculasMes.reduce((acc, m) => acc + (m.valor_parcela || 0), 0);
      const ticketMedioPass = matriculasMes.length > 0 ? totalPassaporte / matriculasMes.length : 0;
      const ticketMedioPar = matriculasMes.length > 0 ? totalParcela / matriculasMes.length : 0;

      texto += `💰 *VALORES FINANCEIROS*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      texto += `Total Passaportes: *R$ ${totalPassaporte.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
      texto += `Total Parcelas: *R$ ${totalParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
      texto += `Ticket Médio Pass.: *R$ ${ticketMedioPass.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
      texto += `Ticket Médio Parc.: *R$ ${ticketMedioPar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n\n`;

      // Lista de alunos matriculados
      texto += `📋 *LISTA DE MATRÍCULAS*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      matriculasMes.forEach((mat, i) => {
        const dataFormatada = new Date(mat.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        texto += `${i + 1}. ${mat.aluno_nome}`;
        if (mat.aluno_idade) texto += ` (${mat.aluno_idade} anos)`;
        texto += `\n   📅 ${dataFormatada}`;
        if (mat.curso_nome) texto += ` | 🎵 ${mat.curso_nome}`;
        if (mat.canal_nome) texto += ` | 📱 ${mat.canal_nome}`;
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
  const gerarRelatorioMatriculas = () => {
    const hoje = new Date();
    const mesNome = hoje.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const ano = hoje.getFullYear();
    const unidadeNome = usuario?.unidade_nome || 'Unidade';

    let texto = `*RELATÓRIO L.A PASS / MÊS ${mesNome} ${ano}*\n\n`;
    texto += `*Total de Passaportes: ${matriculasMes.length}*\n\n`;

    matriculasMes.forEach((mat, i) => {
      const dataFormatada = new Date(mat.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      
      texto += `MAT. ${(i + 1).toString().padStart(2, '0')}\n`;
      texto += `Data: ${dataFormatada}\n`;
      texto += `▪Aluno (a): ${mat.aluno_nome || 'Não informado'}\n`;
      if (mat.aluno_idade) texto += `▪Idade: ${mat.aluno_idade}\n`;
      texto += `▪Curso: ${mat.curso_nome || 'Não informado'}\n`;
      texto += `▪Dia/horário: À definir\n`; // Campo não existe ainda no banco
      texto += `▪Professor: ${mat.professor_fixo_nome || 'Não informado'}\n`;
      texto += `▪Professor experimental: ${mat.professor_exp_nome || 'Não teve'}\n`;
      texto += `▪Canal de Contato: ${mat.canal_nome || 'Não informado'}\n`;
      texto += `▪Agente comercial: ${usuario?.nome || 'Não informado'}\n`;
      texto += `▪Pass: R$ ${(mat.valor_passaporte || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${mat.forma_pagamento_passaporte_nome ? ` ${mat.forma_pagamento_passaporte_nome}` : ''}\n`;
      texto += `▪Parc: R$ ${(mat.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${mat.forma_pagamento_nome ? ` ${mat.forma_pagamento_nome}` : ''}\n\n`;
    });

    return texto;
  };

  const copiarRelatorio = () => {
    let texto = '';
    
    switch (tipoRelatorio) {
      case 'diario':
        texto = gerarRelatorioDiario();
        break;
      case 'semanal':
        texto = gerarRelatorioSemanal();
        break;
      case 'mensal':
        texto = gerarRelatorioMensal();
        break;
      case 'matriculas':
        texto = gerarRelatorioMatriculas();
        break;
      default:
        texto = gerarRelatorioMensal();
    }
    
    navigator.clipboard.writeText(texto);
    toast.success('Relatório copiado!');
  };

  // Obter contagem do dia para cada tipo
  const getContagemHoje = (tipo: string) => {
    if (tipo === 'experimental') {
      return registrosHoje
        .filter(r => r.tipo.startsWith('experimental'))
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    if (tipo === 'visita') {
      return registrosHoje
        .filter(r => r.tipo === 'visita_escola')
        .reduce((acc, r) => acc + r.quantidade, 0);
    }
    return registrosHoje
      .filter(r => r.tipo === tipo)
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickInputCards.map((card) => {
              const Icon = card.icon;
              const contagemHoje = getContagemHoje(card.id);
              
              return (
                <button
                  key={card.id}
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
                        r.tipo === 'lead' ? 'bg-blue-400' :
                        r.tipo.startsWith('experimental') ? 'bg-purple-400' :
                        r.tipo === 'visita_escola' ? 'bg-amber-400' : 'bg-emerald-400'
                      )} />
                      <span className="text-slate-300 capitalize">
                        {r.tipo === 'lead' ? 'Lead' :
                         r.tipo === 'experimental_agendada' ? 'Exp. Agendada' :
                         r.tipo === 'experimental_realizada' ? 'Exp. Realizada' :
                         r.tipo === 'experimental_faltou' ? 'Exp. Faltou' :
                         r.tipo === 'visita_escola' ? 'Visita' : 'Matrícula'}
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
                  <span className="text-xs text-slate-400 font-medium">Leads</span>
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

          {/* Leads por Canal e por Curso */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Leads por Canal */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                Leads por Canal
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
                  <p className="text-slate-500 text-sm text-center py-4">Nenhum lead registrado ainda</p>
                )}
              </div>
            </div>

            {/* Leads por Curso */}
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Guitar className="w-4 h-4" />
                Leads por Curso
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
                  <p className="text-slate-500 text-sm text-center py-4">Nenhum lead registrado ainda</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 3: DETALHAMENTO DE MATRÍCULAS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
        {/* Header da seção */}
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Detalhamento de Matrículas</h2>
                <p className="text-sm text-emerald-400">{matriculasMes.length} matrícula{matriculasMes.length !== 1 ? 's' : ''} no mês</p>
              </div>
            </div>
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
                    className={cn(
                      "border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors",
                      editingId === mat.id && "bg-emerald-500/10"
                    )}
                  >
                    <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <DatePicker
                          date={editingData.data ? new Date(editingData.data + 'T00:00:00') : undefined}
                          onDateChange={(date) => setEditingData({ 
                            ...editingData, 
                            data: date ? format(date, 'yyyy-MM-dd') : '' 
                          })}
                          placeholder="Selecione"
                        />
                      ) : (
                        <span className="text-slate-300">
                          {new Date(mat.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Input
                          type="text"
                          value={editingData.aluno_nome || ''}
                          onChange={(e) => setEditingData({ ...editingData, aluno_nome: e.target.value })}
                          className="w-full h-8 text-sm"
                        />
                      ) : (
                        <span className="text-white font-medium">{mat.aluno_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Input
                          type="number"
                          min="3"
                          max="99"
                          value={editingData.aluno_idade || ''}
                          onChange={(e) => setEditingData({ ...editingData, aluno_idade: parseInt(e.target.value) || null })}
                          className="w-16 h-8 text-sm"
                        />
                      ) : (
                        <span className="text-slate-300">{mat.aluno_idade || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Select
                          value={editingData.curso_id?.toString() || ''}
                          onValueChange={(value) => setEditingData({ ...editingData, curso_id: parseInt(value) || null })}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {cursos.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-purple-400">{mat.curso_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Select
                          value={editingData.canal_origem_id?.toString() || ''}
                          onValueChange={(value) => setEditingData({ ...editingData, canal_origem_id: parseInt(value) || null })}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {canais.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-blue-400">{mat.canal_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Select
                          value={editingData.professor_experimental_id?.toString() || ''}
                          onValueChange={(value) => setEditingData({ ...editingData, professor_experimental_id: parseInt(value) || null })}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {professores.map((p) => (
                              <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-slate-300">{mat.professor_exp_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Select
                          value={editingData.professor_fixo_id?.toString() || ''}
                          onValueChange={(value) => setEditingData({ ...editingData, professor_fixo_id: parseInt(value) || null })}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {professores.map((p) => (
                              <SelectItem key={p.value} value={p.value.toString()}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-slate-300">{mat.professor_fixo_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingData.valor_passaporte || ''}
                          onChange={(e) => setEditingData({ ...editingData, valor_passaporte: parseFloat(e.target.value) || null })}
                          className="w-24 h-8 text-sm"
                        />
                      ) : (
                        <span className="text-emerald-400 font-medium whitespace-nowrap">
                          R$ {(mat.valor_passaporte || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          {mat.forma_pagamento_passaporte_nome && (
                            <span className="text-slate-500 text-xs ml-1">{mat.forma_pagamento_passaporte_nome}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingData.valor_parcela || ''}
                          onChange={(e) => setEditingData({ ...editingData, valor_parcela: parseFloat(e.target.value) || null })}
                          className="w-24 h-8 text-sm"
                        />
                      ) : (
                        <span className="text-cyan-400 font-medium whitespace-nowrap">
                          R$ {(mat.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          {mat.forma_pagamento_nome && (
                            <span className="text-slate-500 text-xs ml-1">{mat.forma_pagamento_nome}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 border-r border-slate-700/30">
                      {editingId === mat.id ? (
                        <Select
                          value={editingData.tipo_matricula || ''}
                          onValueChange={(value) => setEditingData({ ...editingData, tipo_matricula: value })}
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIPOS_MATRICULA.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            mat.tipo_matricula === 'LAMK' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                          )}>
                            {mat.tipo_matricula || '-'}
                          </span>
                          {isAdmin && mat.unidades?.codigo && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                              {mat.unidades.codigo}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {editingId === mat.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={saveEditing}
                            disabled={saving}
                            className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"
                            title="Salvar"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="p-1.5 text-slate-400 hover:bg-slate-700 rounded transition-colors"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEditing(mat)}
                            className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-700 rounded transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => mat.id && setDeleteId(mat.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
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
      </section>

      {/* Modal de Lead - LOTE */}
      {modalOpen === 'lead' && (
        <Modal title="Registrar Leads em Lote" onClose={() => { setModalOpen(null); resetForm(); }}>
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
                    <th className="py-2 px-2 text-left">Canal</th>
                    <th className="py-2 px-2 text-left">Curso</th>
                    <th className="py-2 px-2 text-center w-16">Qtd</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loteLeads.map((linha) => (
                    <tr key={linha.id} className="border-t border-slate-700/50">
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
                        <Input
                          type="number"
                          min="1"
                          value={linha.quantidade}
                          onChange={(e) => updateLinhaLead(linha.id, 'quantidade', parseInt(e.target.value) || 1)}
                          className="h-8 w-16 text-center text-sm"
                        />
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
              Adicionar linha
            </button>

            {/* Total */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
              <span className="text-slate-400">Total de leads:</span>
              <span className="text-2xl font-bold text-cyan-400">
                {loteLeads.reduce((acc, l) => acc + l.quantidade, 0)}
              </span>
            </div>

            <Button
              onClick={handleSaveLoteLeads}
              disabled={saving}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar Todos ({loteLeads.reduce((acc, l) => acc + l.quantidade, 0)} leads)
            </Button>
          </div>
        </Modal>
      )}

      {/* Modal de Experimental - LOTE */}
      {modalOpen === 'experimental' && (
        <Modal title="Registrar Experimentais em Lote" onClose={() => { setModalOpen(null); resetForm(); }}>
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
                    <th className="py-2 px-1 text-left">Status</th>
                    <th className="py-2 px-1 text-left">Canal</th>
                    <th className="py-2 px-1 text-left">Curso</th>
                    <th className="py-2 px-1 text-left">Prof.</th>
                    <th className="py-2 px-1 text-center w-12">Qtd</th>
                    <th className="py-2 px-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {loteExperimentais.map((linha) => (
                    <tr key={linha.id} className="border-t border-slate-700/50">
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
                      <td className="py-2 px-1">
                        <Input
                          type="number"
                          min="1"
                          value={linha.quantidade}
                          onChange={(e) => updateLinhaExperimental(linha.id, 'quantidade', parseInt(e.target.value) || 1)}
                          className="h-8 w-12 text-center text-sm"
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
                {loteExperimentais.reduce((acc, l) => acc + l.quantidade, 0)}
              </span>
            </div>

            <Button
              onClick={handleSaveLoteExperimentais}
              disabled={saving}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar Todas ({loteExperimentais.reduce((acc, l) => acc + l.quantidade, 0)} experimentais)
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
                    <th className="py-2 px-2 text-left">Canal de Origem</th>
                    <th className="py-2 px-2 text-center w-20">Qtd</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {loteVisitas.map((linha) => (
                    <tr key={linha.id} className="border-t border-slate-700/50">
                      <td className="py-2 px-2">
                        <Select
                          value={linha.canal_origem_id?.toString() || ''}
                          onValueChange={(value) => updateLinhaVisita(linha.id, 'canal_origem_id', parseInt(value) || null)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecione o canal..." />
                          </SelectTrigger>
                          <SelectContent>
                            {canais.map((c) => (
                              <SelectItem key={c.value} value={c.value.toString()}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          type="number"
                          min="1"
                          value={linha.quantidade}
                          onChange={(e) => updateLinhaVisita(linha.id, 'quantidade', parseInt(e.target.value) || 1)}
                          className="h-8 w-16 text-center text-sm"
                        />
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
                {loteVisitas.reduce((acc, l) => acc + l.quantidade, 0)}
              </span>
            </div>

            <Button
              onClick={handleSaveLoteVisitas}
              disabled={saving}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar Todas ({loteVisitas.reduce((acc, l) => acc + l.quantidade, 0)} visitas)
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
              />
            </div>
            <div>
              <Label className="mb-2 block">Nome do Aluno *</Label>
              <Input
                type="text"
                value={formData.aluno_nome}
                onChange={(e) => setFormData({ ...formData, aluno_nome: e.target.value })}
                placeholder="Nome completo"
              />
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
              disabled={saving || !formData.aluno_nome || !formData.aluno_data_nascimento || !formData.forma_pagamento_id}
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
                  { id: 'semana', label: 'Esta Semana' },
                  { id: 'mes', label: 'Este Mês' },
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
                      } else if (p.id === 'semana') {
                        const inicioSemana = new Date(hoje);
                        inicioSemana.setDate(hoje.getDate() - hoje.getDay());
                        setRelatorioDataInicio(inicioSemana);
                        setRelatorioDataFim(hoje);
                      } else if (p.id === 'mes') {
                        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                        setRelatorioDataInicio(inicioMes);
                        setRelatorioDataFim(hoje);
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
              {tipoRelatorio === 'diario' ? 'Relatório Diário' :
               tipoRelatorio === 'semanal' ? 'Relatório Semanal' :
               tipoRelatorio === 'mensal' ? 'Relatório Mensal' :
               'Relatório de Matrículas'}
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
                  onClick={() => {
                    let texto = '';
                    switch (tipoRelatorio) {
                      case 'diario': texto = gerarRelatorioDiario(); break;
                      case 'semanal': texto = gerarRelatorioSemanal(); break;
                      case 'mensal': texto = gerarRelatorioMensal(); break;
                      case 'matriculas': texto = gerarRelatorioMatriculas(); break;
                    }
                    setRelatorioTexto(texto);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Resetar
                </button>
              </div>
              <textarea
                value={relatorioTexto || (
                  tipoRelatorio === 'diario' ? gerarRelatorioDiario() :
                  tipoRelatorio === 'semanal' ? gerarRelatorioSemanal() :
                  tipoRelatorio === 'mensal' ? gerarRelatorioMensal() :
                  gerarRelatorioMatriculas()
                )}
                onChange={(e) => setRelatorioTexto(e.target.value)}
                className="w-full h-96 p-4 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-300 font-mono resize-none focus:border-cyan-500 focus:outline-none scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600"
                placeholder="O relatório aparecerá aqui..."
              />
              <p className="text-xs text-slate-500 mt-2">
                💡 Você pode editar qualquer parte do relatório: nomes, números, adicionar observações, etc.
              </p>
            </div>
            
            <Button
              onClick={() => {
                const textoFinal = relatorioTexto || (
                  tipoRelatorio === 'diario' ? gerarRelatorioDiario() :
                  tipoRelatorio === 'semanal' ? gerarRelatorioSemanal() :
                  tipoRelatorio === 'mensal' ? gerarRelatorioMensal() :
                  gerarRelatorioMatriculas()
                );
                navigator.clipboard.writeText(textoFinal);
                toast.success('Relatório copiado!');
              }}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500"
            >
              <Copy className="w-5 h-5 mr-2" />
              Copiar para WhatsApp
            </Button>
          </div>
        </Modal>
      )}

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
    </div>
  );
}

// Componente Modal reutilizável com scrollbar sutil para dark mode
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
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
