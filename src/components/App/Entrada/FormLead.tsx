import { useState, useEffect, useRef, useCallback } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
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
  MessageSquare,
  AlertTriangle,
  Search,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useCursosUnidade } from '../../../hooks/useCursosUnidade';
import { useCheckLeadDuplicado, type LeadDuplicado } from '@/hooks/useCheckLeadDuplicado';

interface LeadBusca {
  id: number;
  nome: string | null;
  telefone: string | null;
  status: string;
  unidade_nome: string | null;
  created_at: string;
}

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
  useSetPageTitle({
    titulo: 'Novo Lead',
    subtitulo: 'Cadastrar novo contato comercial',
  });

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [canais, setCanais] = useState<CanalOrigem[]>([]);
  const [professores, setProfessores] = useState<Professor[]>([]);

  // Busca de leads existentes
  const [termoBusca, setTermoBusca] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState<LeadBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarLeads = useCallback(async (termo: string) => {
    if (termo.length < 2) {
      setResultadosBusca([]);
      return;
    }

    setBuscando(true);
    try {
      const isPhone = /^\d/.test(termo.replace(/\D/g, ''));
      const digits = termo.replace(/\D/g, '');

      let query = supabase
        .from('leads')
        .select('id, nome, telefone, status, created_at, unidades:unidade_id(nome)')
        .eq('arquivado', false)
        .order('created_at', { ascending: false })
        .limit(8);

      if (isPhone && digits.length >= 2) {
        query = query.like('telefone', `%${digits}%`);
      } else {
        query = query.ilike('nome', `%${termo}%`);
      }

      const { data } = await query;

      const resultados: LeadBusca[] = (data || []).map((l: any) => ({
        id: l.id,
        nome: l.nome,
        telefone: l.telefone,
        status: l.status,
        unidade_nome: l.unidades?.nome || null,
        created_at: l.created_at,
      }));

      setResultadosBusca(resultados);
    } catch {
      setResultadosBusca([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  const handleBuscaChange = (valor: string) => {
    setTermoBusca(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscarLeads(valor), 300);
  };

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
  const [mostrarAlertaDuplicata, setMostrarAlertaDuplicata] = useState(false);
  const { duplicados, verificando, verificar, limparDuplicados } = useCheckLeadDuplicado();

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

  const inserirLead = async (data: LeadFormData) => {
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
        etapa_pipeline_id: data.experimental_agendada ? 5 : 1,
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

  const onSubmit = async (data: LeadFormData) => {
    // Se já viu o alerta e confirmou, inserir direto
    if (mostrarAlertaDuplicata) {
      setMostrarAlertaDuplicata(false);
      limparDuplicados();
      await inserirLead(data);
      return;
    }

    // Verificar duplicatas antes de inserir
    const encontrados = await verificar(data.nome, data.telefone || null, data.unidade_id);
    if (encontrados.length > 0) {
      setMostrarAlertaDuplicata(true);
      return;
    }

    await inserirLead(data);
  };

  const formatarStatus = (status: string) => {
    const mapa: Record<string, string> = {
      novo: 'Novo', em_contato: 'Em Contato', experimental_agendada: 'Exp. Agendada',
      experimental_realizada: 'Exp. Realizada', experimental_faltou: 'Exp. Faltou',
      convertido: 'Convertido', matriculado: 'Matriculado', arquivado: 'Arquivado',
    };
    return mapa[status] || status;
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
      </div>

      {/* Busca de leads existentes */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 mb-6">
        <label className="block text-sm text-gray-400 mb-2">Buscar lead existente por nome ou telefone</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar nome ou telefone..."
            value={termoBusca}
            onChange={e => handleBuscaChange(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
          />
          {buscando && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          )}
        </div>

        {resultadosBusca.length > 0 && (
          <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
            {resultadosBusca.map(lead => (
              <button
                key={lead.id}
                type="button"
                onClick={() => navigate(`/app/pre-atendimento?lead=${lead.id}`)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/50 hover:bg-slate-700/50 transition-colors text-left group"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-white font-medium truncate block">{lead.nome}</span>
                  <span className="text-xs text-slate-400">
                    {lead.telefone && <>{lead.telefone} · </>}
                    {lead.unidade_nome && <>{lead.unidade_nome} · </>}
                    {formatarStatus(lead.status)}
                  </span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0 ml-2" />
              </button>
            ))}
          </div>
        )}

        {termoBusca.length >= 2 && !buscando && resultadosBusca.length === 0 && (
          <p className="text-xs text-slate-500 mt-2">Nenhum lead encontrado. Preencha o formulário abaixo para criar um novo.</p>
        )}
      </section>

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

        {/* Alerta de duplicata */}
        {mostrarAlertaDuplicata && duplicados.length > 0 && (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-medium">
              <AlertTriangle className="w-5 h-5" />
              Lead possivelmente duplicado
            </div>
            <div className="space-y-2">
              {duplicados.map((d: LeadDuplicado) => (
                <div key={d.id} className="flex items-center justify-between text-sm bg-slate-800/50 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-white font-medium">{d.nome}</span>
                    {d.telefone && <span className="text-slate-400 ml-2">{d.telefone}</span>}
                  </div>
                  <span className="text-slate-400 text-xs">{formatarStatus(d.status)}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-amber-400/80">
              Deseja criar o lead mesmo assim?
            </p>
          </div>
        )}

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
            disabled={loading || verificando}
            className={`flex items-center gap-2 px-6 py-3 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 ${
              mostrarAlertaDuplicata
                ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600'
            }`}
          >
            {verificando ? (
              <><Save className="w-5 h-5 animate-spin" /> Verificando...</>
            ) : mostrarAlertaDuplicata ? (
              <><AlertTriangle className="w-5 h-5" /> Criar mesmo assim</>
            ) : (
              <><Save className="w-5 h-5" /> {loading ? 'Salvando...' : 'Salvar Lead'}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FormLead;
