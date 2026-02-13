import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Save, 
  Search,
  User,
  Calendar,
  Music,
  DollarSign,
  GraduationCap,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useCursosUnidade } from '../../../hooks/useCursosUnidade';

// Schema de validação
const matriculaSchema = z.object({
  lead_id: z.string().optional(),
  nome: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  data_nascimento: z.string().optional(),
  responsavel: z.string().optional(),
  unidade_id: z.string().uuid('Selecione uma unidade'),
  curso_id: z.coerce.number({ required_error: 'Selecione um curso' }),
  professor_id: z.coerce.number().optional(),
  data_matricula: z.string().min(1, 'Data obrigatória'),
  data_inicio_aulas: z.string().optional(),
  valor_passaporte: z.coerce.number().optional(),
  forma_pagamento_passaporte: z.string().optional(),
  parcelas_passaporte: z.coerce.number().optional(),
  valor_mensalidade: z.coerce.number().min(0, 'Valor não pode ser negativo'),
  dia_vencimento: z.coerce.number().min(1).max(31),
  forma_pagamento: z.string().optional(),
  duracao_contrato: z.coerce.number().default(12),
  observacoes: z.string().optional(),
});

type MatriculaFormData = z.infer<typeof matriculaSchema>;

interface Lead {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  idade: number | null;
  unidade_id: string;
  curso_interesse_id: number | null;
  status: string;
}

interface Unidade {
  id: string;
  nome: string;
}

interface Curso {
  id: number;
  nome: string;
  valor_sugerido?: number;
}

interface Professor {
  id: number;
  nome: string;
}

export function FormMatricula() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leadIdParam = searchParams.get('lead');
  const { usuario } = useAuth();
  
  // Lógica híbrida: usuário de unidade específica ou admin
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  const unidadeUsuario = usuario?.unidade_id || null;

  const [loading, setLoading] = useState(false);
  const [searchingLead, setSearchingLead] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MatriculaFormData>({
    resolver: zodResolver(matriculaSchema),
    defaultValues: {
      data_matricula: new Date().toISOString().split('T')[0],
      dia_vencimento: 10,
      duracao_contrato: 12,
      valor_mensalidade: 450,
      unidade_id: !isAdmin ? unidadeUsuario || undefined : undefined,
    },
  });

  const cursoSelecionado = watch('curso_id');
  const formaPagamentoPassaporte = watch('forma_pagamento_passaporte');
  const unidadeIdSelecionada = watch('unidade_id');
  
  // Buscar cursos da unidade selecionada
  const { cursos } = useCursosUnidade(unidadeIdSelecionada);

  // Carregar dados de referência
  useEffect(() => {
    async function loadData() {
      const [unidadesRes, professoresRes] = await Promise.all([
        supabase.from('unidades').select('id, nome').eq('ativo', true),
        supabase.from('professores').select('id, nome').eq('ativo', true),
      ]);

      if (unidadesRes.data) setUnidades(unidadesRes.data);
      if (professoresRes.data) setProfessores(professoresRes.data);
    }

    loadData();
  }, []);

  // Carregar lead se vier por parâmetro
  useEffect(() => {
    if (leadIdParam) {
      loadLeadById(leadIdParam);
    }
  }, [leadIdParam]);

  // Atualizar valor sugerido quando mudar curso
  useEffect(() => {
    if (cursoSelecionado) {
      const curso = cursos.find(c => c.id === Number(cursoSelecionado));
      if (curso?.valor_sugerido) {
        setValue('valor_mensalidade', curso.valor_sugerido);
      }
    }
  }, [cursoSelecionado, cursos, setValue]);

  const loadLeadById = async (id: string) => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (data) {
      selectLead(data);
    }
  };

  const searchLeads = async () => {
    if (leadSearch.length < 2) return;
    
    setSearchingLead(true);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .or(`nome.ilike.%${leadSearch}%,telefone.ilike.%${leadSearch}%,whatsapp.ilike.%${leadSearch}%`)
      .in('status', ['novo', 'agendado', 'compareceu'])
      .limit(10);

    setLeads(data || []);
    setSearchingLead(false);
  };

  const selectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setValue('lead_id', lead.id);
    setValue('nome', lead.nome);
    setValue('email', lead.email || '');
    setValue('telefone', lead.telefone || lead.whatsapp || '');
    setValue('unidade_id', lead.unidade_id);
    if (lead.curso_interesse_id) {
      setValue('curso_id', lead.curso_interesse_id);
    }
    setLeads([]);
    setLeadSearch('');
  };

  const onSubmit = async (data: MatriculaFormData) => {
    setLoading(true);
    try {
      // 1. Criar registro do aluno (usando campos corretos da tabela)
      const { data: aluno, error: alunoError } = await supabase
        .from('alunos')
        .insert({
          nome: data.nome,
          email: data.email || null,
          telefone: data.telefone || null,
          data_nascimento: data.data_nascimento || null,
          unidade_id: data.unidade_id,
          curso_id: data.curso_id,
          professor_atual_id: data.professor_id || null,
          data_matricula: data.data_matricula,
          data_inicio_contrato: data.data_inicio_aulas || data.data_matricula,
          valor_parcela: data.valor_mensalidade,
          valor_passaporte: data.valor_passaporte || null,
          status: 'ativo',
          tipo_matricula_id: 1,
        })
        .select()
        .single();

      if (alunoError) throw alunoError;

      // 2. Criar movimentação de entrada
      const { error: movError } = await supabase
        .from('movimentacoes')
        .insert({
          aluno_id: aluno.id,
          unidade_id: data.unidade_id,
          tipo: 'matricula',
          data_movimentacao: data.data_matricula,
          valor_mensalidade: data.valor_mensalidade,
          observacoes: `Matrícula - ${data.nome}`,
        });

      if (movError) throw movError;

      // 3. Atualizar status do lead se houver
      if (data.lead_id) {
        await supabase
          .from('leads')
          .update({ 
            status: 'matriculado',
            data_matricula: data.data_matricula,
            aluno_id: aluno.id,
          })
          .eq('id', data.lead_id);
      }

      toast.success('Matrícula realizada com sucesso!');
      navigate('/app/entrada');
    } catch (error: any) {
      toast.error(`Erro ao realizar matrícula: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/app/entrada')}
          className="p-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Nova Matrícula</h1>
          <p className="text-gray-400">Converter lead em aluno ou cadastrar nova matrícula</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Buscar Lead */}
        {!selectedLead && (
          <section className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-400" />
              Buscar Lead Existente
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Busque um lead para converter em matrícula ou preencha os dados manualmente abaixo.
            </p>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchLeads())}
                placeholder="Buscar por nome ou telefone..."
                className="flex-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
              <button
                type="button"
                onClick={searchLeads}
                disabled={searchingLead}
                className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-xl hover:bg-cyan-500/30 transition-colors"
              >
                {searchingLead ? 'Buscando...' : 'Buscar'}
              </button>
            </div>

            {/* Resultados da busca */}
            {leads.length > 0 && (
              <div className="mt-4 space-y-2">
                {leads.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => selectLead(lead)}
                    className="w-full text-left p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-cyan-500/50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-medium">{lead.nome}</p>
                        <p className="text-gray-400 text-sm">
                          {lead.telefone || lead.whatsapp || 'Sem telefone'}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        lead.status === 'compareceu' 
                          ? 'bg-green-500/20 text-green-400'
                          : lead.status === 'agendado'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {lead.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Lead Selecionado */}
        {selectedLead && (
          <section className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
                <div>
                  <p className="text-white font-medium">Lead selecionado: {selectedLead.nome}</p>
                  <p className="text-gray-400 text-sm">Os dados foram preenchidos automaticamente</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                Limpar
              </button>
            </div>
          </section>
        )}

        {/* Dados do Aluno */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-cyan-400" />
            Dados do Aluno
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-400 mb-1">Nome *</label>
              <input
                {...register('nome')}
                type="text"
                placeholder="Nome completo"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
              {errors.nome && (
                <p className="text-red-400 text-xs mt-1">{errors.nome.message}</p>
              )}
            </div>

            {/* Campo Unidade - visível apenas para admin */}
            {isAdmin && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Unidade *</label>
                <select
                  {...register('unidade_id')}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Selecione a unidade...</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
                {errors.unidade_id && (
                  <p className="text-red-400 text-xs mt-1">{errors.unidade_id.message}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Escola *</label>
              <select
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="emla">EMLA (Adulto)</option>
                <option value="lamk">LAMK (Kids)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Tipo Aluno</label>
              <select
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="pagante">Pagante</option>
                <option value="cortesia">Cortesia</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                {...register('email')}
                type="email"
                placeholder="email@exemplo.com"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Telefone</label>
              <input
                {...register('telefone')}
                type="tel"
                placeholder="(21) 99999-9999"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Data de Nascimento</label>
              <input
                {...register('data_nascimento')}
                type="date"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Responsável (se menor)</label>
              <input
                {...register('responsavel')}
                type="text"
                placeholder="Nome do responsável"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
        </section>

        {/* Dados do Curso */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Music className="w-5 h-5 text-purple-400" />
            Dados do Curso
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Curso *</label>
              <select
                {...register('curso_id')}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="">Selecione...</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              {errors.curso_id && (
                <p className="text-red-400 text-xs mt-1">{errors.curso_id.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Professor</label>
              <select
                {...register('professor_id')}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="">Selecione...</option>
                {professores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Duração do Contrato</label>
              <select
                {...register('duracao_contrato')}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
                <option value={18}>18 meses</option>
                <option value={24}>24 meses</option>
              </select>
            </div>
          </div>
        </section>

        {/* Dados Financeiros */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Dados Financeiros
          </h2>

          {/* Passaporte */}
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <h3 className="text-sm font-semibold text-amber-400 mb-3">🎫 Passaporte</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Valor Passaporte</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                  <input
                    {...register('valor_passaporte')}
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Forma Pagamento</label>
                <select
                  {...register('forma_pagamento_passaporte')}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Selecione...</option>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cheque">Cheque</option>
                  <option value="link">Link de Pagamento</option>
                </select>
              </div>
              {formaPagamentoPassaporte === 'cartao_credito' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Parcelas</label>
                  <select
                    {...register('parcelas_passaporte')}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="1">1x (à vista)</option>
                    <option value="2">2x</option>
                    <option value="3">3x</option>
                    <option value="4">4x</option>
                    <option value="5">5x</option>
                    <option value="6">6x</option>
                    <option value="7">7x</option>
                    <option value="8">8x</option>
                    <option value="9">9x</option>
                    <option value="10">10x</option>
                    <option value="11">11x</option>
                    <option value="12">12x</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Mensalidade */}
          <h3 className="text-sm font-semibold text-emerald-400 mb-3">💳 Parcela Mensal</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Valor Mensalidade *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                <input
                  {...register('valor_mensalidade')}
                  type="number"
                  step="0.01"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              {errors.valor_mensalidade && (
                <p className="text-red-400 text-xs mt-1">{errors.valor_mensalidade.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Dia Vencimento *</label>
              <select
                {...register('dia_vencimento')}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                {[5, 10, 15, 20, 25].map((dia) => (
                  <option key={dia} value={dia}>Dia {dia}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Forma de Pagamento</label>
              <select
                {...register('forma_pagamento')}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="">Selecione...</option>
                <option value="credito_recorrente">Crédito Recorrente</option>
                <option value="boleto">Boleto</option>
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cheque">Cheque</option>
                <option value="link">Link de Pagamento</option>
              </select>
            </div>
          </div>
        </section>

        {/* Datas */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-400" />
            Datas
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Data da Matrícula *</label>
              <input
                {...register('data_matricula')}
                type="date"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              />
              {errors.data_matricula && (
                <p className="text-red-400 text-xs mt-1">{errors.data_matricula.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Início das Aulas</label>
              <input
                {...register('data_inicio_aulas')}
                type="date"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
        </section>

        {/* Observações */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Observações</h2>
          <textarea
            {...register('observacoes')}
            rows={3}
            placeholder="Informações adicionais sobre a matrícula..."
            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none"
          />
        </section>

        {/* Botões */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/app/entrada')}
            className="px-6 py-3 text-gray-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <GraduationCap className="w-5 h-5" />
            {loading ? 'Salvando...' : 'Confirmar Matrícula'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FormMatricula;
