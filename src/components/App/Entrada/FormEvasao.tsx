import { useState, useEffect } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Save, 
  Search,
  UserMinus,
  Calendar,
  AlertTriangle,
  MessageSquare
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// Schema de validação
const evasaoSchema = z.object({
  aluno_id: z.string().uuid('Selecione um aluno'),
  data_evasao: z.string().min(1, 'Data obrigatória'),
  tipo_evasao: z.enum(['cancelamento', 'abandono', 'transferencia', 'conclusao', 'outro'], {
    required_error: 'Selecione o tipo de evasão',
  }),
  motivo_id: z.coerce.number().optional(),
  motivo_detalhe: z.string().optional(),
  tentou_retencao: z.boolean().default(false),
  acoes_retencao: z.string().optional(),
  feedback_aluno: z.string().optional(),
  observacoes: z.string().optional(),
});

type EvasaoFormData = z.infer<typeof evasaoSchema>;

interface Aluno {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  unidade_id: string;
  unidade?: { nome: string };
  curso?: { nome: string };
  data_matricula: string;
  valor_mensalidade: number;
  status: string;
}

interface MotivoEvasao {
  id: number;
  nome: string;
  categoria: string;
}

const TIPOS_EVASAO = [
  { value: 'cancelamento', label: 'Cancelamento', color: 'text-red-400' },
  { value: 'abandono', label: 'Abandono', color: 'text-orange-400' },
  { value: 'transferencia', label: 'Transferência', color: 'text-blue-400' },
  { value: 'conclusao', label: 'Conclusão do Curso', color: 'text-green-400' },
  { value: 'outro', label: 'Outro', color: 'text-gray-400' },
];

const MOTIVOS_PADRAO: MotivoEvasao[] = [
  { id: 1, nome: 'Financeiro', categoria: 'financeiro' },
  { id: 2, nome: 'Mudança de cidade', categoria: 'pessoal' },
  { id: 3, nome: 'Falta de tempo', categoria: 'pessoal' },
  { id: 4, nome: 'Insatisfação com professor', categoria: 'qualidade' },
  { id: 5, nome: 'Insatisfação com estrutura', categoria: 'qualidade' },
  { id: 6, nome: 'Não se adaptou ao curso', categoria: 'pedagogico' },
  { id: 7, nome: 'Problemas de saúde', categoria: 'pessoal' },
  { id: 8, nome: 'Reajuste de mensalidade', categoria: 'financeiro' },
  { id: 9, nome: 'Concorrência (outra escola)', categoria: 'mercado' },
  { id: 10, nome: 'Sem motivo informado', categoria: 'outro' },
];

export function FormEvasao() {
  useSetPageTitle({
    titulo: 'Registrar Evasão',
    subtitulo: 'Registrar saída de aluno',
  });

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchingAluno, setSearchingAluno] = useState(false);
  const [alunoSearch, setAlunoSearch] = useState('');
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [motivos, setMotivos] = useState<MotivoEvasao[]>(MOTIVOS_PADRAO);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EvasaoFormData>({
    resolver: zodResolver(evasaoSchema),
    defaultValues: {
      data_evasao: new Date().toISOString().split('T')[0],
      tentou_retencao: false,
    },
  });

  const tentouRetencao = watch('tentou_retencao');
  const tipoEvasao = watch('tipo_evasao');

  // Carregar motivos do banco (se existir tabela)
  useEffect(() => {
    async function loadMotivos() {
      const { data } = await supabase
        .from('motivos_evasao')
        .select('*')
        .eq('ativo', true);
      
      if (data && data.length > 0) {
        setMotivos(data);
      }
    }
    loadMotivos();
  }, []);

  const searchAlunos = async () => {
    if (alunoSearch.length < 2) return;
    
    setSearchingAluno(true);
    const { data } = await supabase
      .from('alunos')
      .select(`
        *,
        unidade:unidades(nome),
        curso:cursos(nome)
      `)
      .or(`nome.ilike.%${alunoSearch}%,telefone.ilike.%${alunoSearch}%,email.ilike.%${alunoSearch}%`)
      .eq('status', 'ativo')
      .limit(10);

    setAlunos(data || []);
    setSearchingAluno(false);
  };

  const selectAluno = (aluno: Aluno) => {
    setSelectedAluno(aluno);
    setValue('aluno_id', aluno.id);
    setAlunos([]);
    setAlunoSearch('');
  };

  const calcularTempoAluno = (dataMatricula: string) => {
    const inicio = new Date(dataMatricula);
    const hoje = new Date();
    const meses = Math.floor((hoje.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return meses;
  };

  const onSubmit = async (data: EvasaoFormData) => {
    setLoading(true);
    try {
      // 1. Atualizar status do aluno
      const { error: alunoError } = await supabase
        .from('alunos')
        .update({
          status: 'inativo',
          data_saida: data.data_evasao,
          motivo_saida: data.motivo_detalhe || motivos.find(m => m.id === data.motivo_id)?.nome,
        })
        .eq('id', data.aluno_id);

      if (alunoError) throw alunoError;

      // 2. Criar movimentação de saída
      const { error: movError } = await supabase
        .from('movimentacoes')
        .insert({
          aluno_id: data.aluno_id,
          unidade_id: selectedAluno?.unidade_id,
          tipo: 'evasao',
          data_movimentacao: data.data_evasao,
          valor_mensalidade: selectedAluno?.valor_mensalidade,
          observacoes: `Evasão: ${data.tipo_evasao} - ${data.motivo_detalhe || motivos.find(m => m.id === data.motivo_id)?.nome || 'Sem motivo'}`,
        });

      if (movError) throw movError;

      // 3. Registrar detalhes da evasão (se tabela existir)
      try {
        await supabase
          .from('evasoes')
          .insert({
            aluno_id: data.aluno_id,
            unidade_id: selectedAluno?.unidade_id,
            data_evasao: data.data_evasao,
            tipo: data.tipo_evasao,
            motivo_id: data.motivo_id || null,
            motivo_detalhe: data.motivo_detalhe || null,
            tentou_retencao: data.tentou_retencao,
            acoes_retencao: data.acoes_retencao || null,
            feedback_aluno: data.feedback_aluno || null,
            observacoes: data.observacoes || null,
            tempo_permanencia_meses: selectedAluno ? calcularTempoAluno(selectedAluno.data_matricula) : null,
            valor_mensalidade: selectedAluno?.valor_mensalidade,
          });
      } catch {
        // Tabela pode não existir, continua sem erro
      }

      toast.success('Evasão registrada com sucesso!');
      navigate('/app/entrada');
    } catch (error: any) {
      toast.error(`Erro ao registrar evasão: ${error.message}`);
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
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Buscar Aluno */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-cyan-400" />
            Buscar Aluno
          </h2>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={alunoSearch}
              onChange={(e) => setAlunoSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchAlunos())}
              placeholder="Buscar por nome, telefone ou email..."
              className="flex-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              type="button"
              onClick={searchAlunos}
              disabled={searchingAluno}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-xl hover:bg-cyan-500/30 transition-colors"
            >
              {searchingAluno ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {/* Resultados da busca */}
          {alunos.length > 0 && (
            <div className="mt-4 space-y-2">
              {alunos.map((aluno) => (
                <button
                  key={aluno.id}
                  type="button"
                  onClick={() => selectAluno(aluno)}
                  className="w-full text-left p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-cyan-500/50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-medium">{aluno.nome}</p>
                      <p className="text-gray-400 text-sm">
                        {aluno.curso?.nome} • {aluno.unidade?.nome}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {calcularTempoAluno(aluno.data_matricula)} meses
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {errors.aluno_id && !selectedAluno && (
            <p className="text-red-400 text-xs mt-2">{errors.aluno_id.message}</p>
          )}
        </section>

        {/* Aluno Selecionado */}
        {selectedAluno && (
          <section className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <div>
                  <p className="text-white font-medium">{selectedAluno.nome}</p>
                  <p className="text-gray-400 text-sm">
                    {selectedAluno.curso?.nome} • {selectedAluno.unidade?.nome}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAluno(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                Alterar
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-2xl font-bold text-white">
                  {calcularTempoAluno(selectedAluno.data_matricula)}
                </p>
                <p className="text-xs text-gray-400">meses de permanência</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-2xl font-bold text-white">
                  R$ {selectedAluno.valor_mensalidade}
                </p>
                <p className="text-xs text-gray-400">mensalidade</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-2xl font-bold text-red-400">
                  R$ {(selectedAluno.valor_mensalidade * calcularTempoAluno(selectedAluno.data_matricula)).toLocaleString()}
                </p>
                <p className="text-xs text-gray-400">LTV perdido</p>
              </div>
            </div>
          </section>
        )}

        {/* Tipo e Motivo */}
        {selectedAluno && (
          <>
            <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <UserMinus className="w-5 h-5 text-red-400" />
                Tipo de Evasão
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {TIPOS_EVASAO.map((tipo) => (
                  <label
                    key={tipo.value}
                    className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all ${
                      tipoEvasao === tipo.value
                        ? 'border-red-500 bg-red-500/20'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <input
                      {...register('tipo_evasao')}
                      type="radio"
                      value={tipo.value}
                      className="sr-only"
                    />
                    <span className={tipoEvasao === tipo.value ? tipo.color : 'text-gray-400'}>
                      {tipo.label}
                    </span>
                  </label>
                ))}
              </div>
              {errors.tipo_evasao && (
                <p className="text-red-400 text-xs mt-2">{errors.tipo_evasao.message}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Motivo Principal</label>
                  <select
                    {...register('motivo_id')}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="">Selecione...</option>
                    {motivos.map((m) => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Data da Evasão *</label>
                  <input
                    {...register('data_evasao')}
                    type="date"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                  />
                  {errors.data_evasao && (
                    <p className="text-red-400 text-xs mt-1">{errors.data_evasao.message}</p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-1">Detalhes do Motivo</label>
                <input
                  {...register('motivo_detalhe')}
                  type="text"
                  placeholder="Descreva o motivo com mais detalhes..."
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </section>

            {/* Tentativa de Retenção */}
            <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-yellow-400" />
                Tentativa de Retenção
              </h2>

              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input
                  {...register('tentou_retencao')}
                  type="checkbox"
                  className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-white">Houve tentativa de retenção?</span>
              </label>

              {tentouRetencao && (
                <div className="space-y-4 mt-4 pt-4 border-t border-slate-700">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Ações de Retenção Realizadas</label>
                    <textarea
                      {...register('acoes_retencao')}
                      rows={2}
                      placeholder="Descreva as ações tomadas para tentar reter o aluno..."
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none"
                    />
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-1">Feedback do Aluno</label>
                <textarea
                  {...register('feedback_aluno')}
                  rows={2}
                  placeholder="O que o aluno disse sobre a experiência na escola?"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none"
                />
              </div>
            </section>

            {/* Observações */}
            <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Observações Gerais</h2>
              <textarea
                {...register('observacoes')}
                rows={3}
                placeholder="Informações adicionais sobre a evasão..."
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none"
              />
            </section>
          </>
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
            disabled={loading || !selectedAluno}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <UserMinus className="w-5 h-5" />
            {loading ? 'Salvando...' : 'Confirmar Evasão'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FormEvasao;
