import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Loader2, Save, User, GraduationCap, DollarSign, TrendingUp, History, AlertCircle, Plus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePickerNascimento } from '@/components/ui/date-picker-nascimento';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Aluno } from './AlunosPage';

interface ModalFichaAlunoProps {
  aluno: Aluno;
  onClose: () => void;
  onSalvar: () => void;
  professores: { id: number; nome: string }[];
  cursos: { id: number; nome: string }[];
  tiposMatricula: { id: number; nome: string }[];
}

interface AlunoCompleto extends Aluno {
  data_nascimento?: string;
  tipo_aluno?: string;
  canal_origem_id?: number;
  forma_pagamento_id?: number;
  professor_experimental_id?: number;
  valor_passaporte?: number;
  data_inicio_contrato?: string;
  data_fim_contrato?: string;
  data_ultima_renovacao?: string;
  numero_renovacoes?: number;
  is_segundo_curso?: boolean;
  is_ex_aluno?: boolean;
  is_aluno_retorno?: boolean;
  agente_comercial?: string;
}

interface Movimentacao {
  id: number;
  data: string;
  tipo: string;
  valor_parcela_anterior?: number;
  valor_parcela_novo?: number;
  observacoes?: string;
}

interface Renovacao {
  id: number;
  data_renovacao: string;
  valor_parcela_anterior: number;
  valor_parcela_novo: number;
  percentual_reajuste: number;
}

interface Anotacao {
  id: number;
  texto: string;
  categoria: string;
  criado_por: string;
  created_at: string;
  resolvido: boolean;
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HORARIOS_LISTA = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

const TIPOS_ALUNO = [
  { value: 'pagante', label: 'Pagante' },
  { value: 'bolsista_integral', label: 'Bolsista Integral' },
  { value: 'bolsista_parcial', label: 'Bolsista Parcial' },
  { value: 'nao_pagante', label: 'Não Pagante' },
];

// Mapeamento tipo_aluno → tipo_matricula_id para sincronização automática
// IDs: 1=Regular, 2=Segundo Curso, 3=Bolsista Integral, 4=Bolsista Parcial, 5=Banda
const TIPO_ALUNO_PARA_MATRICULA: Record<string, number> = {
  'bolsista_integral': 3,
  'bolsista_parcial': 4,
};

export function ModalFichaAluno({
  aluno,
  onClose,
  onSalvar,
  professores,
  cursos,
  tiposMatricula,
}: ModalFichaAlunoProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pessoal');
  
  // Dados completos do aluno
  const [dadosCompletos, setDadosCompletos] = useState<AlunoCompleto | null>(null);
  
  // Dados de lookup
  const [canais, setCanais] = useState<{ value: number; label: string }[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<{ value: number; label: string }[]>([]);
  
  // Histórico
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [renovacoes, setRenovacoes] = useState<Renovacao[]>([]);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  
  // Form state
  const [formData, setFormData] = useState({
    // Pessoal
    nome: '',
    data_nascimento: null as Date | null,
    is_ex_aluno: false,
    is_aluno_retorno: false,
    // Acadêmico
    curso_id: null as number | null,
    professor_atual_id: null as number | null,
    dia_aula: '',
    horario_aula: '',
    data_matricula: null as Date | null,
    data_inicio_contrato: null as Date | null,
    data_fim_contrato: null as Date | null,
    status: 'ativo',
    is_segundo_curso: false,
    // Financeiro
    tipo_aluno: 'pagante',
    tipo_matricula_id: 1,
    valor_parcela: null as number | null,
    valor_passaporte: null as number | null,
    forma_pagamento_id: null as number | null,
    dia_vencimento: 5,
    status_pagamento: 'em_dia',
    // Comercial
    canal_origem_id: null as number | null,
    professor_experimental_id: null as number | null,
    agente_comercial: '',
  });
  
  // Valor original da parcela (para detectar mudanças)
  const [valorParcelaOriginal, setValorParcelaOriginal] = useState<number | null>(null);
  
  // Outros cursos do mesmo aluno (registros com mesmo nome + data_nascimento + unidade)
  const [outrosCursos, setOutrosCursos] = useState<AlunoCompleto[]>([]);

  // Estado para modal de segundo curso
  const [modalSegundoCurso, setModalSegundoCurso] = useState(false);
  const [segundoCursoData, setSegundoCursoData] = useState({
    curso_id: null as number | null,
    professor_id: null as number | null,
    dia_aula: '',
    horario_aula: '',
    valor_parcela: null as number | null,
  });
  const [salvandoSegundoCurso, setSalvandoSegundoCurso] = useState(false);
  const [turmaSegundoCurso, setTurmaSegundoCurso] = useState<any>(null);
  const [carregandoTurma, setCarregandoTurma] = useState(false);

  useEffect(() => {
    carregarDadosCompletos();
  }, [aluno.id]);

  // Buscar turma quando professor, dia ou horário mudarem
  useEffect(() => {
    if (modalSegundoCurso) {
      buscarTurmaSegundoCurso();
    }
  }, [segundoCursoData.professor_id, segundoCursoData.dia_aula, segundoCursoData.horario_aula, modalSegundoCurso]);

  async function carregarDadosCompletos() {
    setLoading(true);
    try {
      // Carregar dados completos do aluno
      const { data: alunoData, error: alunoError } = await supabase
        .from('alunos')
        .select('*')
        .eq('id', aluno.id)
        .single();

      if (alunoError) throw alunoError;

      // Carregar lookups
      const [canaisRes, formasRes] = await Promise.all([
        supabase.from('canais_origem').select('id, nome').eq('ativo', true),
        supabase.from('formas_pagamento').select('id, nome').eq('ativo', true),
      ]);

      if (canaisRes.data) {
        setCanais(canaisRes.data.map(c => ({ value: c.id, label: c.nome })));
      }
      if (formasRes.data) {
        setFormasPagamento(formasRes.data.map(f => ({ value: f.id, label: f.nome })));
      }

      // Carregar histórico
      const [movRes, renRes, anotRes] = await Promise.all([
        supabase
          .from('movimentacoes_admin')
          .select('id, data, tipo, valor_parcela_anterior, valor_parcela_novo, observacoes')
          .eq('aluno_id', aluno.id)
          .order('data', { ascending: false })
          .limit(10),
        supabase
          .from('renovacoes')
          .select('id, data_renovacao, valor_parcela_anterior, valor_parcela_novo, percentual_reajuste')
          .eq('aluno_id', aluno.id)
          .order('data_renovacao', { ascending: false })
          .limit(5),
        supabase
          .from('anotacoes_alunos')
          .select('id, texto, categoria, criado_por, created_at, resolvido')
          .eq('aluno_id', aluno.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      setMovimentacoes(movRes.data || []);
      setRenovacoes(renRes.data || []);
      setAnotacoes(anotRes.data || []);

      // Buscar outros cursos do mesmo aluno (registros com mesmo nome + data_nascimento + unidade)
      if (alunoData.nome && alunoData.unidade_id) {
        let queryOutros = supabase
          .from('alunos')
          .select('*, cursos:curso_id(nome), professores:professor_atual_id(nome)')
          .eq('nome', alunoData.nome)
          .eq('unidade_id', alunoData.unidade_id)
          .neq('id', aluno.id)
          .in('status', ['ativo', 'trancado']);

        if (alunoData.data_nascimento) {
          queryOutros = queryOutros.eq('data_nascimento', alunoData.data_nascimento);
        }

        const { data: outrosData } = await queryOutros;
        setOutrosCursos((outrosData || []).map((o: any) => ({
          ...o,
          curso_nome: o.cursos?.nome || null,
          professor_nome: o.professores?.nome || null,
        })));
      }

      // Preencher form
      setDadosCompletos(alunoData);
      setValorParcelaOriginal(alunoData.valor_parcela);
      
      setFormData({
        nome: alunoData.nome || '',
        data_nascimento: alunoData.data_nascimento ? new Date(alunoData.data_nascimento) : null,
        is_ex_aluno: alunoData.is_ex_aluno || false,
        is_aluno_retorno: alunoData.is_aluno_retorno || false,
        curso_id: alunoData.curso_id,
        professor_atual_id: alunoData.professor_atual_id,
        dia_aula: alunoData.dia_aula || '',
        horario_aula: alunoData.horario_aula?.substring(0, 5) || '',
        data_matricula: alunoData.data_matricula ? new Date(alunoData.data_matricula) : null,
        data_inicio_contrato: alunoData.data_inicio_contrato ? new Date(alunoData.data_inicio_contrato) : null,
        data_fim_contrato: alunoData.data_fim_contrato ? new Date(alunoData.data_fim_contrato) : null,
        status: alunoData.status || 'ativo',
        is_segundo_curso: alunoData.is_segundo_curso || false,
        tipo_aluno: alunoData.tipo_aluno || 'pagante',
        tipo_matricula_id: alunoData.tipo_matricula_id || 1,
        valor_parcela: alunoData.valor_parcela,
        valor_passaporte: alunoData.valor_passaporte,
        forma_pagamento_id: alunoData.forma_pagamento_id,
        dia_vencimento: alunoData.dia_vencimento || 5,
        status_pagamento: alunoData.status_pagamento || 'em_dia',
        canal_origem_id: alunoData.canal_origem_id,
        professor_experimental_id: alunoData.professor_experimental_id,
        agente_comercial: alunoData.agente_comercial || '',
      });

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados do aluno');
    } finally {
      setLoading(false);
    }
  }

  async function handleSalvar() {
    if (!formData.nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      // Verificar se valor_parcela mudou para criar log
      const valorMudou = valorParcelaOriginal !== formData.valor_parcela && 
                         valorParcelaOriginal !== null && 
                         formData.valor_parcela !== null;

      // Atualizar aluno
      const { error: updateError } = await supabase
        .from('alunos')
        .update({
          nome: formData.nome.trim(),
          data_nascimento: formData.data_nascimento?.toISOString().split('T')[0] || null,
          is_ex_aluno: formData.is_ex_aluno,
          is_aluno_retorno: formData.is_aluno_retorno,
          curso_id: formData.curso_id,
          professor_atual_id: formData.professor_atual_id,
          dia_aula: formData.dia_aula || null,
          horario_aula: formData.horario_aula || null,
          data_matricula: formData.data_matricula?.toISOString().split('T')[0] || null,
          data_inicio_contrato: formData.data_inicio_contrato?.toISOString().split('T')[0] || null,
          data_fim_contrato: formData.data_fim_contrato?.toISOString().split('T')[0] || null,
          status: formData.status,
          is_segundo_curso: formData.is_segundo_curso,
          tipo_aluno: formData.tipo_aluno,
          tipo_matricula_id: formData.tipo_matricula_id,
          valor_parcela: formData.valor_parcela,
          valor_passaporte: formData.valor_passaporte,
          forma_pagamento_id: formData.forma_pagamento_id,
          dia_vencimento: formData.dia_vencimento,
          status_pagamento: formData.status_pagamento,
          canal_origem_id: formData.canal_origem_id,
          professor_experimental_id: formData.professor_experimental_id,
          agente_comercial: formData.agente_comercial || null,
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'sistema',
        })
        .eq('id', aluno.id);

      if (updateError) throw updateError;

      // Se valor_parcela mudou, criar registro em movimentacoes_admin
      if (valorMudou) {
        const { error: logError } = await supabase
          .from('movimentacoes_admin')
          .insert({
            unidade_id: aluno.unidade_id,
            data: new Date().toISOString().split('T')[0],
            tipo: 'ajuste_valor',
            aluno_nome: formData.nome,
            aluno_id: aluno.id,
            professor_id: formData.professor_atual_id,
            curso_id: formData.curso_id,
            valor_parcela_anterior: valorParcelaOriginal,
            valor_parcela_novo: formData.valor_parcela,
            observacoes: `Ajuste de valor via Ficha do Aluno. Alterado por ${user?.email || 'sistema'}`,
            agente_comercial: user?.email || 'sistema',
          });

        if (logError) {
          console.error('Erro ao criar log de ajuste:', logError);
          // Não bloqueia o salvamento, apenas loga
        }
      }

      toast.success('Dados salvos com sucesso!');
      onSalvar();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  // Buscar turma baseado em professor + dia + horário
  async function buscarTurmaSegundoCurso() {
    if (!segundoCursoData.professor_id || !segundoCursoData.dia_aula || !segundoCursoData.horario_aula) {
      setTurmaSegundoCurso(null);
      return;
    }

    setCarregandoTurma(true);
    try {
      const { data: turmaData } = await supabase
        .from('vw_turmas_implicitas')
        .select('*')
        .eq('unidade_id', aluno.unidade_id)
        .eq('professor_id', segundoCursoData.professor_id)
        .eq('dia_semana', segundoCursoData.dia_aula)
        .eq('horario_inicio', segundoCursoData.horario_aula)
        .maybeSingle();

      setTurmaSegundoCurso(turmaData);
    } catch (error) {
      console.error('Erro ao buscar turma:', error);
    } finally {
      setCarregandoTurma(false);
    }
  }

  // Função para criar segundo curso (novo registro de aluno)
  async function handleCriarSegundoCurso() {
    if (!segundoCursoData.curso_id) {
      toast.error('Selecione o curso');
      return;
    }
    if (!segundoCursoData.professor_id) {
      toast.error('Selecione o professor');
      return;
    }

    setSalvandoSegundoCurso(true);
    try {
      const dataHoje = new Date().toISOString().split('T')[0];
      const dataFimContrato = new Date();
      dataFimContrato.setFullYear(dataFimContrato.getFullYear() + 1);

      const { error } = await supabase.from('alunos').insert({
        nome: dadosCompletos?.nome,
        unidade_id: aluno.unidade_id,
        data_nascimento: dadosCompletos?.data_nascimento,
        status: 'ativo',
        tipo_aluno: formData.tipo_aluno,
        tipo_matricula_id: formData.tipo_matricula_id,
        valor_parcela: segundoCursoData.valor_parcela !== null ? segundoCursoData.valor_parcela : formData.valor_parcela,
        forma_pagamento_id: formData.forma_pagamento_id,
        dia_vencimento: formData.dia_vencimento,
        data_matricula: dataHoje,
        data_inicio_contrato: dataHoje,
        data_fim_contrato: dataFimContrato.toISOString().split('T')[0],
        curso_id: segundoCursoData.curso_id,
        professor_atual_id: segundoCursoData.professor_id,
        dia_aula: segundoCursoData.dia_aula || null,
        horario_aula: segundoCursoData.horario_aula || null,
        canal_origem_id: formData.canal_origem_id,
        agente_comercial: user?.email || null,
        is_segundo_curso: true,
        is_ex_aluno: false,
        is_aluno_retorno: false,
      });

      if (error) throw error;

      toast.success('Segundo curso cadastrado com sucesso!');
      setModalSegundoCurso(false);
      setSegundoCursoData({
        curso_id: null,
        professor_id: null,
        dia_aula: '',
        horario_aula: '',
        valor_parcela: null,
      });
      // Recarregar dados para atualizar a lista de outros cursos na aba Acadêmica
      carregarDadosCompletos();
      onSalvar();
    } catch (error: any) {
      console.error('Erro ao criar segundo curso:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setSalvandoSegundoCurso(false);
    }
  }

  function formatarData(data: string) {
    return new Date(data).toLocaleDateString('pt-BR');
  }

  function formatarMoeda(valor: number | null | undefined) {
    if (valor === null || valor === undefined) return '-';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            <span className="ml-3 text-slate-400">Carregando dados do aluno...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <User className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <span className="text-lg">Ficha do Aluno</span>
              <p className="text-sm text-slate-400 font-normal">{formData.nome || 'Sem nome'}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-5 flex-shrink-0">
            <TabsTrigger value="pessoal" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Pessoal</span>
            </TabsTrigger>
            <TabsTrigger value="academico" className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              <span className="hidden sm:inline">Acadêmico</span>
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              <span className="hidden sm:inline">Financeiro</span>
            </TabsTrigger>
            <TabsTrigger value="comercial" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Comercial</span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Histórico</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-2">
            {/* ABA PESSOAL */}
            <TabsContent value="pessoal" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="mb-2 block">Nome Completo *</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Nome do aluno"
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Data de Nascimento</Label>
                  <DatePickerNascimento
                    date={formData.data_nascimento}
                    onDateChange={(date) => setFormData({ ...formData, data_nascimento: date })}
                    placeholder="Selecione..."
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Idade / Classificação</Label>
                  <div className="flex items-center gap-3 h-10 px-3 bg-slate-800/50 border border-slate-700 rounded-md">
                    <span className="text-slate-300">
                      {dadosCompletos?.idade_atual ? `${dadosCompletos.idade_atual} anos` : '-'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      dadosCompletos?.classificacao === 'LAMK' 
                        ? 'bg-blue-500/20 text-blue-400' 
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {dadosCompletos?.classificacao || '-'}
                    </span>
                    <span className="text-xs text-slate-500">(calculado)</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <Label className="mb-3 block text-slate-400">Flags do Aluno</Label>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.is_ex_aluno}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_ex_aluno: !!checked })}
                    />
                    <span className="text-sm">É ex-aluno (já estudou antes)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.is_aluno_retorno}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_aluno_retorno: !!checked })}
                    />
                    <span className="text-sm">É aluno retorno</span>
                  </label>
                </div>
              </div>
            </TabsContent>

            {/* ABA ACADÊMICO */}
            <TabsContent value="academico" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Curso</Label>
                  <Select
                    value={formData.curso_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, curso_id: value ? parseInt(value) : null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o curso..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cursos.map((c) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Professor Atual</Label>
                  <Select
                    value={formData.professor_atual_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, professor_atual_id: value ? parseInt(value) : null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o professor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {professores.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Dia da Aula</Label>
                  <Select
                    value={formData.dia_aula || ''}
                    onValueChange={(value) => setFormData({ ...formData, dia_aula: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o dia..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DIAS_SEMANA.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
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
                      <SelectValue placeholder="Selecione o horário..." />
                    </SelectTrigger>
                    <SelectContent>
                      {HORARIOS_LISTA.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Data de Matrícula</Label>
                  <DatePicker
                    date={formData.data_matricula}
                    onDateChange={(date) => setFormData({ ...formData, data_matricula: date })}
                    placeholder="Selecione..."
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Tempo: {dadosCompletos?.tempo_permanencia_meses 
                      ? `${dadosCompletos.tempo_permanencia_meses} meses` 
                      : '-'} (calculado)
                  </p>
                </div>

                <div>
                  <Label className="mb-2 block">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="aviso_previo">Aviso Prévio</SelectItem>
                      <SelectItem value="trancado">Trancado</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <Label className="mb-3 block text-slate-400">Contrato</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block text-sm">Início do Contrato</Label>
                    <DatePicker
                      date={formData.data_inicio_contrato}
                      onDateChange={(date) => setFormData({ ...formData, data_inicio_contrato: date })}
                      placeholder="Selecione..."
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm">Fim do Contrato</Label>
                    <DatePicker
                      date={formData.data_fim_contrato}
                      onDateChange={(date) => setFormData({ ...formData, data_fim_contrato: date })}
                      placeholder="Selecione..."
                    />
                  </div>
                </div>
              </div>

              {/* Outros cursos do aluno */}
              {outrosCursos.length > 0 && (
                <div className="border-t border-slate-700 pt-4">
                  <Label className="mb-3 block text-slate-400 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Outros Cursos ({outrosCursos.length})
                  </Label>
                  <div className="space-y-2">
                    {outrosCursos.map((outro) => (
                      <div key={outro.id} className="flex items-center justify-between p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <div>
                            <span className="text-slate-400">Curso: </span>
                            <span className="text-white font-medium">{outro.curso_nome || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Professor: </span>
                            <span className="text-white">{outro.professor_nome || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Dia: </span>
                            <span className="text-white">{outro.dia_aula || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Horário: </span>
                            <span className="text-white">{outro.horario_aula?.substring(0, 5) || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Valor: </span>
                            <span className="text-white">{outro.valor_parcela != null ? `R$ ${outro.valor_parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Status: </span>
                            <span className={`font-medium ${outro.status === 'ativo' ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {outro.status === 'ativo' ? 'Ativo' : outro.status === 'trancado' ? 'Trancado' : outro.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-700 pt-4 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.is_segundo_curso}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_segundo_curso: !!checked })}
                  />
                  <span className="text-sm">É segundo curso (aluno já faz outro instrumento)</span>
                </label>
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalSegundoCurso(true)}
                  className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Curso
                </Button>
              </div>
            </TabsContent>

            {/* ABA FINANCEIRO */}
            <TabsContent value="financeiro" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Tipo de Aluno</Label>
                  <Select
                    value={formData.tipo_aluno}
                    onValueChange={(value) => {
                      const updates: any = { tipo_aluno: value };
                      // Sincronizar tipo_matricula_id quando muda para bolsista
                      if (TIPO_ALUNO_PARA_MATRICULA[value]) {
                        updates.tipo_matricula_id = TIPO_ALUNO_PARA_MATRICULA[value];
                      } else if (value === 'pagante' && formData.tipo_matricula_id && [3, 4].includes(formData.tipo_matricula_id)) {
                        // Se voltou para pagante e tipo_matricula era bolsista, restaurar para Regular
                        updates.tipo_matricula_id = formData.is_segundo_curso ? 2 : 1;
                      }
                      setFormData({ ...formData, ...updates });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_ALUNO.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Tipo de Matrícula</Label>
                  <Select
                    value={formData.tipo_matricula_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, tipo_matricula_id: value ? parseInt(value) : 1 })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposMatricula.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">Valor da Parcela</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                    <Input
                      type="number"
                      value={formData.valor_parcela || ''}
                      onChange={(e) => setFormData({ ...formData, valor_parcela: e.target.value ? parseFloat(e.target.value) : null })}
                      className="pl-10"
                      placeholder="0,00"
                    />
                  </div>
                  {valorParcelaOriginal !== formData.valor_parcela && valorParcelaOriginal !== null && formData.valor_parcela !== null && (
                    <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Alteração será registrada no histórico
                    </p>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">Valor do Passaporte</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                    <Input
                      type="number"
                      value={formData.valor_passaporte || ''}
                      onChange={(e) => setFormData({ ...formData, valor_passaporte: e.target.value ? parseFloat(e.target.value) : null })}
                      className="pl-10"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Forma de Pagamento</Label>
                  <Select
                    value={formData.forma_pagamento_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, forma_pagamento_id: value ? parseInt(value) : null })}
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
                  <Label className="mb-2 block">Dia de Vencimento</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={formData.dia_vencimento}
                    onChange={(e) => setFormData({ ...formData, dia_vencimento: parseInt(e.target.value) || 5 })}
                  />
                </div>

                <div className="col-span-2">
                  <Label className="mb-2 block">Status de Pagamento (mês atual)</Label>
                  <Select
                    value={formData.status_pagamento}
                    onValueChange={(value) => setFormData({ ...formData, status_pagamento: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="em_dia">✓ Em dia</SelectItem>
                      <SelectItem value="inadimplente">✗ Inadimplente</SelectItem>
                      <SelectItem value="parcial">~ Parcial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* ABA COMERCIAL */}
            <TabsContent value="comercial" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Canal de Origem</Label>
                  <Select
                    value={formData.canal_origem_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, canal_origem_id: value ? parseInt(value) : null })}
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

                <div>
                  <Label className="mb-2 block">Professor da Experimental</Label>
                  <Select
                    value={formData.professor_experimental_id?.toString() || ''}
                    onValueChange={(value) => setFormData({ ...formData, professor_experimental_id: value ? parseInt(value) : null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {professores.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Label className="mb-2 block">Agente Comercial (Hunter)</Label>
                  <Input
                    value={formData.agente_comercial}
                    onChange={(e) => setFormData({ ...formData, agente_comercial: e.target.value })}
                    placeholder="Nome do hunter que matriculou"
                  />
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <Label className="mb-3 block text-slate-400">Dados de Renovação (somente leitura)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Última Renovação</p>
                    <p className="text-sm text-slate-300">
                      {dadosCompletos?.data_ultima_renovacao 
                        ? formatarData(dadosCompletos.data_ultima_renovacao) 
                        : 'Nunca renovou'}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Nº de Renovações</p>
                    <p className="text-sm text-slate-300">
                      {dadosCompletos?.numero_renovacoes || 0}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ABA HISTÓRICO */}
            <TabsContent value="historico" className="space-y-6 mt-0">
              {/* Movimentações */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Últimas Movimentações
                </h4>
                {movimentacoes.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Nenhuma movimentação registrada</p>
                ) : (
                  <div className="space-y-2">
                    {movimentacoes.map((mov) => (
                      <div key={mov.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-purple-400 uppercase">{mov.tipo}</span>
                          <span className="text-xs text-slate-500">{formatarData(mov.data)}</span>
                        </div>
                        {mov.valor_parcela_anterior && mov.valor_parcela_novo && (
                          <p className="text-sm text-slate-300">
                            {formatarMoeda(mov.valor_parcela_anterior)} → {formatarMoeda(mov.valor_parcela_novo)}
                          </p>
                        )}
                        {mov.observacoes && (
                          <p className="text-xs text-slate-400 mt-1">{mov.observacoes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Renovações */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Histórico de Renovações
                </h4>
                {renovacoes.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Nenhuma renovação registrada</p>
                ) : (
                  <div className="space-y-2">
                    {renovacoes.map((ren) => (
                      <div key={ren.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">{formatarData(ren.data_renovacao)}</span>
                          <span className={`text-xs font-medium ${ren.percentual_reajuste > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {ren.percentual_reajuste > 0 ? `+${ren.percentual_reajuste.toFixed(1)}%` : 'Sem reajuste'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300">
                          {formatarMoeda(ren.valor_parcela_anterior)} → {formatarMoeda(ren.valor_parcela_novo)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Anotações */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
                  📝 Anotações Recentes
                </h4>
                {anotacoes.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Nenhuma anotação registrada</p>
                ) : (
                  <div className="space-y-2">
                    {anotacoes.map((anot) => {
                      const emoji: Record<string, string> = { 
                        geral: '📝', pedagogico: '📚', financeiro: '💰', 
                        comportamento: '⚠️', elogio: '⭐', reclamacao: '😤', contato: '📞' 
                      };
                      return (
                        <div 
                          key={anot.id} 
                          className={`bg-slate-800/50 border rounded-lg p-3 ${
                            anot.resolvido ? 'border-slate-700 opacity-60' : 'border-purple-500/30'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">
                              {emoji[anot.categoria] || '📝'} {anot.categoria}
                              {anot.resolvido && <span className="ml-2 text-emerald-400">✓ Resolvido</span>}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatarData(anot.created_at)} • {anot.criado_por}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300">{anot.texto}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer com botões */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={saving} className="bg-purple-600 hover:bg-purple-500">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      {/* Modal de Segundo Curso */}
      {modalSegundoCurso && (
        <Dialog open onOpenChange={() => setModalSegundoCurso(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-400" />
                Adicionar Curso
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <p className="text-sm text-slate-400">
                Cadastrar <strong className="text-white">{dadosCompletos?.nome}</strong> em um novo curso.
                Será criado um novo registro de matrícula.
              </p>

              <div>
                <Label className="mb-2 block">Novo Curso *</Label>
                <Select
                  value={segundoCursoData.curso_id?.toString() || ''}
                  onValueChange={(value) => setSegundoCursoData({ ...segundoCursoData, curso_id: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o curso..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {cursos.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-2 block">Professor *</Label>
                <Select
                  value={segundoCursoData.professor_id?.toString() || ''}
                  onValueChange={(value) => setSegundoCursoData({ ...segundoCursoData, professor_id: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o professor..." />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {professores.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-2 block">Dia da Aula</Label>
                  <Select
                    value={segundoCursoData.dia_aula || ''}
                    onValueChange={(value) => setSegundoCursoData({ ...segundoCursoData, dia_aula: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {DIAS_SEMANA.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Horário</Label>
                  <Select
                    value={segundoCursoData.horario_aula || ''}
                    onValueChange={(value) => setSegundoCursoData({ ...segundoCursoData, horario_aula: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {HORARIOS_LISTA.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Valor da Parcela (opcional)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={segundoCursoData.valor_parcela !== null ? segundoCursoData.valor_parcela : ''}
                    onChange={(e) => setSegundoCursoData({ ...segundoCursoData, valor_parcela: e.target.value !== '' ? parseFloat(e.target.value) : null })}
                    className="pl-10"
                    placeholder={formData.valor_parcela?.toString() || '0,00'}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Se não informado, usará o mesmo valor do curso atual: {formatarMoeda(formData.valor_parcela)}
                </p>
              </div>

              {/* Informações da Turma */}
              {carregandoTurma && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Buscando turma...
                </div>
              )}
              
              {!carregandoTurma && turmaSegundoCurso && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-blue-400 font-medium">
                    <Users className="w-4 h-4" />
                    Turma Encontrada
                  </div>
                  <div className="text-sm text-slate-300">
                    <p><strong>Sala:</strong> {turmaSegundoCurso.sala_nome || 'Não definida'}</p>
                    <p><strong>Total de alunos:</strong> {turmaSegundoCurso.total_alunos || 0}</p>
                    <p><strong>Capacidade:</strong> {turmaSegundoCurso.capacidade_maxima || '-'}</p>
                  </div>
                  {turmaSegundoCurso.nomes_alunos && turmaSegundoCurso.nomes_alunos.length > 0 && (
                    <div className="pt-2 border-t border-blue-500/20">
                      <p className="text-xs text-slate-400 mb-1">Alunos na turma:</p>
                      <div className="flex flex-wrap gap-1">
                        {turmaSegundoCurso.nomes_alunos.slice(0, 5).map((nome: string, idx: number) => (
                          <span key={idx} className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded text-xs">
                            {nome}
                          </span>
                        ))}
                        {turmaSegundoCurso.nomes_alunos.length > 5 && (
                          <span className="text-xs text-slate-400">
                            +{turmaSegundoCurso.nomes_alunos.length - 5} mais
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!carregandoTurma && !turmaSegundoCurso && segundoCursoData.professor_id && segundoCursoData.dia_aula && segundoCursoData.horario_aula && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  Nenhuma turma encontrada. O aluno será o primeiro nesta turma.
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setModalSegundoCurso(false)} disabled={salvandoSegundoCurso}>
                Cancelar
              </Button>
              <Button onClick={handleCriarSegundoCurso} disabled={salvandoSegundoCurso} className="bg-purple-600 hover:bg-purple-500">
                {salvandoSegundoCurso ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Curso
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
