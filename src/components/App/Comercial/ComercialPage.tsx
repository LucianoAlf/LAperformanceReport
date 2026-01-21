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
  FileText
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Tipo do contexto do Outlet
interface OutletContextType {
  filtroAtivo: string | null;
  unidadeSelecionada: string | null;
}

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
  tipo_matricula: string | null;
  aluno_novo_retorno: string | null;
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

export function ComercialPage() {
  const { usuario } = useAuth();
  const { filtroAtivo } = useOutletContext<OutletContextType>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  
  // Dados mestres
  const [canais, setCanais] = useState<Option[]>([]);
  const [cursos, setCursos] = useState<Option[]>([]);
  const [professores, setProfessores] = useState<Option[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<Option[]>([]);
  
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
  })[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Partial<LeadDiario>>({});
  
  // Form states
  const [formData, setFormData] = useState({
    quantidade: 1,
    canal_origem_id: null as number | null,
    curso_id: null as number | null,
    status_experimental: 'experimental_agendada',
    professor_id: null as number | null,
    aluno_nome: '',
    aluno_idade: null as number | null,
    tipo_matricula: 'EMLA',
    teve_experimental: false,
    professor_experimental_id: null as number | null,
    professor_fixo_id: null as number | null,
    valor_passaporte: null as number | null,
    valor_parcela: null as number | null,
    forma_pagamento_id: null as number | null,
  });

  // Carregar dados mestres
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [canaisRes, cursosRes, professoresRes, formasRes] = await Promise.all([
          supabase.from('canais_origem').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('cursos').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
          supabase.from('formas_pagamento').select('id, nome').eq('ativo', true).order('nome'),
        ]);

        if (canaisRes.data) setCanais(canaisRes.data.map((c: any) => ({ value: c.id, label: c.nome })));
        if (cursosRes.data) setCursos(cursosRes.data.map((c: any) => ({ value: c.id, label: c.nome })));
        if (professoresRes.data) setProfessores(professoresRes.data.map((p: any) => ({ value: p.id, label: p.nome })));
        if (formasRes.data) setFormasPagamento(formasRes.data.map((f: any) => ({ value: f.id, label: f.nome })));
      } catch (error) {
        console.error('Erro ao carregar dados mestres:', error);
      }
    };

    loadMasterData();
  }, []);

  // Carregar resumo do mês e registros do dia
  const loadData = useCallback(async () => {
    if (!usuario?.unidade_id && usuario?.perfil !== 'admin') return;

    setLoading(true);
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const inicioMes = new Date();
      inicioMes.setDate(1);
      const inicioMesStr = inicioMes.toISOString().split('T')[0];

      // Query base - buscar também cursos
      let query = supabase
        .from('leads_diarios')
        .select('*, canais_origem(nome), cursos(nome)')
        .gte('data', inicioMesStr)
        .order('data', { ascending: false });

      if (usuario?.perfil !== 'admin' && usuario?.unidade_id) {
        query = query.eq('unidade_id', usuario.unidade_id);
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
      
      // Buscar nomes dos professores
      if (matriculasDoMes.length > 0) {
        const profIds = new Set<number>();
        matriculasDoMes.forEach(m => {
          if (m.professor_experimental_id) profIds.add(m.professor_experimental_id);
          if (m.professor_fixo_id) profIds.add(m.professor_fixo_id);
        });
        
        if (profIds.size > 0) {
          const { data: profsData } = await supabase
            .from('professores')
            .select('id, nome')
            .in('id', Array.from(profIds));
          
          const profMap = new Map(profsData?.map(p => [p.id, p.nome]) || []);
          
          matriculasDoMes.forEach(m => {
            m.professor_exp_nome = m.professor_experimental_id ? profMap.get(m.professor_experimental_id) || '' : '';
            m.professor_fixo_nome = m.professor_fixo_id ? profMap.get(m.professor_fixo_id) || '' : '';
          });
        }
      }
      
      setMatriculasMes(matriculasDoMes);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [usuario?.unidade_id, usuario?.perfil]);

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

  const deleteMatricula = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir esta matrícula?')) return;
    
    try {
      const { error } = await supabase
        .from('leads_diarios')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Matrícula excluída!');
      loadData();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir matrícula');
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      quantidade: 1,
      canal_origem_id: null,
      curso_id: null,
      status_experimental: 'experimental_agendada',
      professor_id: null,
      aluno_nome: '',
      aluno_idade: null,
      tipo_matricula: 'EMLA',
      teve_experimental: false,
      professor_experimental_id: null,
      professor_fixo_id: null,
      valor_passaporte: null,
      valor_parcela: null,
      forma_pagamento_id: null,
    });
  };

  // Salvar registro
  const handleSave = async () => {
    // Usar a unidade selecionada no header (filtroAtivo) ou a unidade do usuário
    const unidadeId = filtroAtivo || usuario?.unidade_id;
    
    if (!unidadeId) {
      toast.error('Selecione uma unidade no filtro acima');
      return;
    }

    setSaving(true);
    try {
      const hoje = new Date().toISOString().split('T')[0];
      
      let tipo = modalOpen;
      if (modalOpen === 'experimental') {
        tipo = formData.status_experimental;
      }

      const registro: Partial<LeadDiario> = {
        unidade_id: unidadeId,
        data: hoje,
        tipo: tipo || 'lead',
        canal_origem_id: formData.canal_origem_id,
        curso_id: formData.curso_id,
        quantidade: formData.quantidade,
        observacoes: null,
      };

      // Campos extras para matrícula
      if (modalOpen === 'matricula') {
        registro.aluno_nome = formData.aluno_nome;
        registro.aluno_idade = formData.aluno_idade;
        registro.tipo_matricula = formData.tipo_matricula;
        registro.professor_experimental_id = formData.teve_experimental ? formData.professor_experimental_id : null;
        registro.professor_fixo_id = formData.professor_fixo_id;
        registro.valor_passaporte = formData.valor_passaporte;
        registro.valor_parcela = formData.valor_parcela;
        registro.forma_pagamento_id = formData.forma_pagamento_id;
        registro.quantidade = 1; // Matrícula sempre é 1
      }

      // Campos extras para experimental
      if (modalOpen === 'experimental') {
        registro.professor_experimental_id = formData.professor_id;
      }

      const { error } = await supabase.from('leads_diarios').insert(registro);

      if (error) throw error;

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

  // Gerar texto do relatório
  const gerarRelatorio = () => {
    const hoje = new Date();
    const dia = hoje.getDate().toString().padStart(2, '0');
    const mes = hoje.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const ano = hoje.getFullYear();
    const unidadeNome = usuario?.unidade_nome || 'Unidade';
    const nomeUsuario = usuario?.nome || 'Usuário';

    let texto = `*RELATÓRIO DIÁRIO COMERCIAL ${unidadeNome.toUpperCase()} - ${mes}*\n`;
    texto += `☆ ${nomeUsuario}\n`;
    texto += `*Data: ${dia}/${mes.slice(0, 3).toLowerCase()}/${ano}*\n\n`;
    texto += `▪︎ Leads novos no mês até hoje: ${resumo.leads}\n`;
    texto += `▪︎ Total de Experimentais no mês até hoje: ${resumo.experimentais}\n`;
    texto += `▪︎ Visitas à escola hoje: ${registrosHoje.filter(r => r.tipo === 'visita_escola').reduce((acc, r) => acc + r.quantidade, 0)}\n`;
    texto += `▪︎ Matrículas no mês até hoje: ${resumo.matriculas}\n\n`;
    texto += `▪︎ Canais:\n`;
    resumo.leadsPorCanal.forEach(c => {
      texto += `${c.canal} ${c.quantidade}\n`;
    });

    return texto;
  };

  const copiarRelatorio = () => {
    const texto = gerarRelatorio();
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
        <button
          onClick={() => setRelatorioOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20"
        >
          <Copy className="w-4 h-4" />
          Gerar Relatório WhatsApp
        </button>
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
                  <th className="pb-3 px-2 font-medium">#</th>
                  <th className="pb-3 px-2 font-medium">Data</th>
                  <th className="pb-3 px-2 font-medium">Aluno(a)</th>
                  <th className="pb-3 px-2 font-medium">Idade</th>
                  <th className="pb-3 px-2 font-medium">Curso</th>
                  <th className="pb-3 px-2 font-medium">Canal</th>
                  <th className="pb-3 px-2 font-medium">Prof. Exp.</th>
                  <th className="pb-3 px-2 font-medium">Prof. Fixo</th>
                  <th className="pb-3 px-2 font-medium">Passaporte</th>
                  <th className="pb-3 px-2 font-medium">Parcela</th>
                  <th className="pb-3 px-2 font-medium">Tipo</th>
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
                    <td className="py-3 px-2 text-slate-500 font-medium">{index + 1}</td>
                    <td className="py-3 px-2 text-slate-300">
                      {new Date(mat.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <input
                          type="text"
                          value={editingData.aluno_nome || ''}
                          onChange={(e) => setEditingData({ ...editingData, aluno_nome: e.target.value })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      ) : (
                        <span className="text-white font-medium">{mat.aluno_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <input
                          type="number"
                          min="3"
                          max="99"
                          value={editingData.aluno_idade || ''}
                          onChange={(e) => setEditingData({ ...editingData, aluno_idade: parseInt(e.target.value) || null })}
                          className="w-16 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      ) : (
                        <span className="text-slate-300">{mat.aluno_idade || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <select
                          value={editingData.curso_id || ''}
                          onChange={(e) => setEditingData({ ...editingData, curso_id: parseInt(e.target.value) || null })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">-</option>
                          {cursos.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-purple-400">{mat.curso_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <select
                          value={editingData.canal_origem_id || ''}
                          onChange={(e) => setEditingData({ ...editingData, canal_origem_id: parseInt(e.target.value) || null })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">-</option>
                          {canais.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-blue-400">{mat.canal_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <select
                          value={editingData.professor_experimental_id || ''}
                          onChange={(e) => setEditingData({ ...editingData, professor_experimental_id: parseInt(e.target.value) || null })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">-</option>
                          {professores.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-300">{mat.professor_exp_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <select
                          value={editingData.professor_fixo_id || ''}
                          onChange={(e) => setEditingData({ ...editingData, professor_fixo_id: parseInt(e.target.value) || null })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">-</option>
                          {professores.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-300">{mat.professor_fixo_nome || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingData.valor_passaporte || ''}
                          onChange={(e) => setEditingData({ ...editingData, valor_passaporte: parseFloat(e.target.value) || null })}
                          className="w-24 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      ) : (
                        <span className="text-emerald-400 font-medium">
                          {mat.valor_passaporte ? `R$ ${mat.valor_passaporte.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingData.valor_parcela || ''}
                          onChange={(e) => setEditingData({ ...editingData, valor_parcela: parseFloat(e.target.value) || null })}
                          className="w-24 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      ) : (
                        <span className="text-cyan-400 font-medium">
                          {mat.valor_parcela ? `R$ ${mat.valor_parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {editingId === mat.id ? (
                        <select
                          value={editingData.tipo_matricula || ''}
                          onChange={(e) => setEditingData({ ...editingData, tipo_matricula: e.target.value })}
                          className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="">-</option>
                          {TIPOS_MATRICULA.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          mat.tipo_matricula === 'LAMK' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                        )}>
                          {mat.tipo_matricula || '-'}
                        </span>
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
                            onClick={() => mat.id && deleteMatricula(mat.id)}
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

      {/* Modal de Lead */}
      {modalOpen === 'lead' && (
        <Modal title="Registrar Leads" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Quantidade</label>
              <input
                type="number"
                min="1"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Canal de Origem</label>
              <select
                value={formData.canal_origem_id || ''}
                onChange={(e) => setFormData({ ...formData, canal_origem_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {canais.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Curso de Interesse</label>
              <select
                value={formData.curso_id || ''}
                onChange={(e) => setFormData({ ...formData, curso_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {cursos.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Registrar Leads
            </button>
          </div>
        </Modal>
      )}

      {/* Modal de Experimental */}
      {modalOpen === 'experimental' && (
        <Modal title="Registrar Experimental" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Status</label>
              <select
                value={formData.status_experimental}
                onChange={(e) => setFormData({ ...formData, status_experimental: e.target.value })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                {STATUS_EXPERIMENTAL.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Quantidade</label>
              <input
                type="number"
                min="1"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Canal de Origem</label>
              <select
                value={formData.canal_origem_id || ''}
                onChange={(e) => setFormData({ ...formData, canal_origem_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {canais.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Curso</label>
              <select
                value={formData.curso_id || ''}
                onChange={(e) => setFormData({ ...formData, curso_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {cursos.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Professor</label>
              <select
                value={formData.professor_id || ''}
                onChange={(e) => setFormData({ ...formData, professor_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {professores.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Registrar Experimental
            </button>
          </div>
        </Modal>
      )}

      {/* Modal de Visita */}
      {modalOpen === 'visita' && (
        <Modal title="Registrar Visita" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Quantidade de Visitas</label>
              <input
                type="number"
                min="1"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() => {
                setFormData({ ...formData, canal_origem_id: null, curso_id: null });
                handleSave();
              }}
              disabled={saving}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Registrar Visita
            </button>
          </div>
        </Modal>
      )}

      {/* Modal de Matrícula */}
      {modalOpen === 'matricula' && (
        <Modal title="Registrar Matrícula" onClose={() => { setModalOpen(null); resetForm(); }}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Nome do Aluno *</label>
              <input
                type="text"
                value={formData.aluno_nome}
                onChange={(e) => setFormData({ ...formData, aluno_nome: e.target.value })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                placeholder="Nome completo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Idade</label>
                <input
                  type="number"
                  min="3"
                  max="99"
                  value={formData.aluno_idade || ''}
                  onChange={(e) => setFormData({ ...formData, aluno_idade: parseInt(e.target.value) || null })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Tipo</label>
                <select
                  value={formData.tipo_matricula}
                  onChange={(e) => setFormData({ ...formData, tipo_matricula: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                >
                  {TIPOS_MATRICULA.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Curso</label>
              <select
                value={formData.curso_id || ''}
                onChange={(e) => setFormData({ ...formData, curso_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {cursos.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Canal de Origem</label>
              <select
                value={formData.canal_origem_id || ''}
                onChange={(e) => setFormData({ ...formData, canal_origem_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {canais.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="teveExp"
                checked={formData.teve_experimental}
                onChange={(e) => setFormData({ ...formData, teve_experimental: e.target.checked })}
                className="w-5 h-5 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <label htmlFor="teveExp" className="text-slate-300">Teve aula experimental?</label>
            </div>
            {formData.teve_experimental && (
              <div>
                <label className="block text-sm text-slate-400 mb-1">Professor da Experimental</label>
                <select
                  value={formData.professor_experimental_id || ''}
                  onChange={(e) => setFormData({ ...formData, professor_experimental_id: parseInt(e.target.value) || null })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {professores.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Professor Fixo</label>
              <select
                value={formData.professor_fixo_id || ''}
                onChange={(e) => setFormData({ ...formData, professor_fixo_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {professores.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Passaporte (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.valor_passaporte || ''}
                  onChange={(e) => setFormData({ ...formData, valor_passaporte: parseFloat(e.target.value) || null })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Parcela (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.valor_parcela || ''}
                  onChange={(e) => setFormData({ ...formData, valor_parcela: parseFloat(e.target.value) || null })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Forma de Pagamento</label>
              <select
                value={formData.forma_pagamento_id || ''}
                onChange={(e) => setFormData({ ...formData, forma_pagamento_id: parseInt(e.target.value) || null })}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Selecione...</option>
                {formasPagamento.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !formData.aluno_nome}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Registrar Matrícula
            </button>
          </div>
        </Modal>
      )}

      {/* Modal de Relatório */}
      {relatorioOpen && (
        <Modal title="Relatório Diário" onClose={() => setRelatorioOpen(false)}>
          <div className="space-y-4">
            <pre className="bg-slate-900 p-4 rounded-xl text-sm text-slate-300 whitespace-pre-wrap font-mono">
              {gerarRelatorio()}
            </pre>
            <button
              onClick={copiarRelatorio}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Copy className="w-5 h-5" />
              Copiar para WhatsApp
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Componente Modal reutilizável com scrollbar sutil para dark mode
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-600">
          {children}
        </div>
      </div>
    </div>
  );
}

export default ComercialPage;
