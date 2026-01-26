import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Save, 
  Phone, 
  Mail, 
  User, 
  Calendar,
  Music,
  MapPin,
  MessageSquare
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useCursosUnidade } from '../../../hooks/useCursosUnidade';

// Schema de validação
const leadSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  telefone: z.string().min(10, 'Telefone inválido').optional().or(z.literal('')),
  whatsapp: z.string().min(10, 'WhatsApp inválido').optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  idade: z.coerce.number().min(3).max(99).optional(),
  unidade_id: z.string().uuid('Selecione uma unidade'),
  curso_interesse_id: z.coerce.number().optional(),
  canal_origem_id: z.coerce.number().optional(),
  agente_comercial: z.string().optional(),
  experimental_agendada: z.boolean().default(false),
  data_experimental: z.string().optional(),
  horario_experimental: z.string().optional(),
  professor_experimental_id: z.coerce.number().optional(),
  observacoes: z.string().optional(),
});

type LeadFormData = z.infer<typeof leadSchema>;

interface Unidade {
  id: string;
  nome: string;
}

interface Curso {
  id: number;
  nome: string;
}

interface CanalOrigem {
  id: number;
  nome: string;
}

interface Professor {
  id: number;
  nome: string;
}

export function FormLead() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [canais, setCanais] = useState<CanalOrigem[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      experimental_agendada: false,
    },
  });

  const experimentalAgendada = watch('experimental_agendada');
  const unidadeIdSelecionada = watch('unidade_id');
  
  // Buscar cursos da unidade selecionada
  const { cursos } = useCursosUnidade(unidadeIdSelecionada);

  // Carregar dados de referência
  useEffect(() => {
    async function loadData() {
      const [unidadesRes, canaisRes, professoresRes] = await Promise.all([
        supabase.from('unidades').select('id, nome').eq('ativo', true),
        supabase.from('canais_origem').select('id, nome').eq('ativo', true),
        supabase.from('professores').select('id, nome').eq('ativo', true),
      ]);

      if (unidadesRes.data) setUnidades(unidadesRes.data);
      if (canaisRes.data) setCanais(canaisRes.data);
      if (professoresRes.data) setProfessores(professoresRes.data);
    }

    loadData();
  }, []);

  const onSubmit = async (data: LeadFormData) => {
    setLoading(true);
    try {
      const { error } = await supabase.from('leads').insert({
        nome: data.nome,
        telefone: data.telefone || null,
        whatsapp: data.whatsapp || null,
        email: data.email || null,
        idade: data.idade || null,
        unidade_id: data.unidade_id,
        curso_interesse_id: data.curso_interesse_id || null,
        canal_origem_id: data.canal_origem_id || null,
        agente_comercial: data.agente_comercial || null,
        experimental_agendada: data.experimental_agendada,
        data_experimental: data.data_experimental || null,
        horario_experimental: data.horario_experimental || null,
        professor_experimental_id: data.professor_experimental_id || null,
        observacoes: data.observacoes || null,
        status: data.experimental_agendada ? 'agendado' : 'novo',
      });

      if (error) throw error;

      toast.success('Lead cadastrado com sucesso!');
      navigate('/app/entrada');
    } catch (error: any) {
      toast.error(`Erro ao cadastrar lead: ${error.message}`);
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
          <h1 className="text-2xl font-bold text-white">Novo Lead</h1>
          <p className="text-gray-400">Cadastrar novo contato comercial</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Dados do Contato */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-cyan-400" />
            Dados do Contato
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nome */}
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

            {/* Telefone */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Telefone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  {...register('telefone')}
                  type="tel"
                  placeholder="(21) 99999-9999"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">WhatsApp</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  {...register('whatsapp')}
                  type="tel"
                  placeholder="(21) 99999-9999"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="email@exemplo.com"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Idade */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Idade</label>
              <input
                {...register('idade')}
                type="number"
                min={3}
                max={99}
                placeholder="25"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
        </section>

        {/* Informações Comerciais */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            Informações Comerciais
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Unidade */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Unidade *</label>
              <select
                {...register('unidade_id')}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="">Selecione...</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
              {errors.unidade_id && (
                <p className="text-red-400 text-xs mt-1">{errors.unidade_id.message}</p>
              )}
            </div>

            {/* Curso de Interesse */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Curso de Interesse</label>
              <div className="relative">
                <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <select
                  {...register('curso_interesse_id')}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Selecione...</option>
                  {cursos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Canal de Origem */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Canal de Origem</label>
              <select
                {...register('canal_origem_id')}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="">Selecione...</option>
                {canais.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {/* Agente Comercial */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Agente Comercial</label>
              <input
                {...register('agente_comercial')}
                type="text"
                placeholder="Nome do agente"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
        </section>

        {/* Aula Experimental */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-400" />
            Aula Experimental
          </h2>

          {/* Checkbox */}
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input
              {...register('experimental_agendada')}
              type="checkbox"
              className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-white">Agendar aula experimental</span>
          </label>

          {experimentalAgendada && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-700">
              {/* Data */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Data</label>
                <input
                  {...register('data_experimental')}
                  type="date"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Horário */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Horário</label>
                <input
                  {...register('horario_experimental')}
                  type="time"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Professor */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Professor</label>
                <select
                  {...register('professor_experimental_id')}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="">Selecione...</option>
                  {professores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        {/* Observações */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Observações</h2>
          <textarea
            {...register('observacoes')}
            rows={3}
            placeholder="Informações adicionais sobre o lead..."
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
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {loading ? 'Salvando...' : 'Salvar Lead'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FormLead;
