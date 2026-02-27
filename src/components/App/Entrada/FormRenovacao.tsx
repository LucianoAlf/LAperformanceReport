import { useState, useEffect } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Search,
  RefreshCw,
  DollarSign,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const renovacaoSchema = z.object({
  aluno_id: z.string().uuid('Selecione um aluno'),
  data_renovacao: z.string().min(1, 'Data obrigatória'),
  valor_anterior: z.coerce.number(),
  valor_novo: z.coerce.number().min(1, 'Valor obrigatório'),
  percentual_reajuste: z.coerce.number(),
  duracao_contrato: z.coerce.number().default(12),
  motivo_reajuste: z.string().optional(),
  observacoes: z.string().optional(),
});

type RenovacaoFormData = z.infer<typeof renovacaoSchema>;

interface Aluno {
  id: string;
  nome: string;
  unidade_id: string;
  unidade?: { nome: string };
  curso?: { nome: string };
  data_matricula: string;
  valor_mensalidade: number;
}

export function FormRenovacao() {
  useSetPageTitle({
    titulo: 'Registrar Renovação',
    subtitulo: 'Renovar contrato de aluno',
  });

  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchingAluno, setSearchingAluno] = useState(false);
  const [alunoSearch, setAlunoSearch] = useState('');
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<RenovacaoFormData>({
    resolver: zodResolver(renovacaoSchema),
    defaultValues: {
      data_renovacao: new Date().toISOString().split('T')[0],
      duracao_contrato: 12,
      percentual_reajuste: 0,
    },
  });

  const valorAnterior = watch('valor_anterior');
  const valorNovo = watch('valor_novo');
  const percentualReajuste = watch('percentual_reajuste');

  useEffect(() => {
    if (valorAnterior && valorNovo) {
      const percentual = ((valorNovo - valorAnterior) / valorAnterior) * 100;
      setValue('percentual_reajuste', Math.round(percentual * 100) / 100);
    }
  }, [valorAnterior, valorNovo, setValue]);

  const searchAlunos = async () => {
    if (alunoSearch.length < 2) return;
    setSearchingAluno(true);
    const { data } = await supabase
      .from('alunos')
      .select('*, unidade:unidades(nome), curso:cursos(nome)')
      .or(`nome.ilike.%${alunoSearch}%,telefone.ilike.%${alunoSearch}%`)
      .eq('status', 'ativo')
      .limit(10);
    setAlunos(data || []);
    setSearchingAluno(false);
  };

  const selectAluno = (aluno: Aluno) => {
    setSelectedAluno(aluno);
    setValue('aluno_id', aluno.id);
    setValue('valor_anterior', aluno.valor_mensalidade);
    setValue('valor_novo', Math.round(aluno.valor_mensalidade * 1.08));
    setAlunos([]);
    setAlunoSearch('');
  };

  const calcularTempoAluno = (dataMatricula: string) => {
    const inicio = new Date(dataMatricula);
    const hoje = new Date();
    return Math.floor((hoje.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 30));
  };

  const aplicarReajuste = (percentual: number) => {
    if (valorAnterior) {
      setValue('valor_novo', Math.round(valorAnterior * (1 + percentual / 100)));
    }
  };

  const onSubmit = async (data: RenovacaoFormData) => {
    setLoading(true);
    try {
      await supabase.from('alunos').update({
        valor_mensalidade: data.valor_novo,
        data_ultima_renovacao: data.data_renovacao,
      }).eq('id', data.aluno_id);

      await supabase.from('renovacoes').insert({
        aluno_id: data.aluno_id,
        unidade_id: selectedAluno?.unidade_id,
        data_renovacao: data.data_renovacao,
        valor_anterior: data.valor_anterior,
        valor_novo: data.valor_novo,
        percentual_reajuste: data.percentual_reajuste,
        duracao_contrato_meses: data.duracao_contrato,
        motivo_reajuste: data.motivo_reajuste || null,
        observacoes: data.observacoes || null,
        status: 'renovado',
      });

      await supabase.from('movimentacoes').insert({
        aluno_id: data.aluno_id,
        unidade_id: selectedAluno?.unidade_id,
        tipo: 'renovacao',
        data_movimentacao: data.data_renovacao,
        valor_mensalidade: data.valor_novo,
        observacoes: `Renovação: R$ ${data.valor_anterior} → R$ ${data.valor_novo} (${data.percentual_reajuste > 0 ? '+' : ''}${data.percentual_reajuste}%)`,
      });

      toast.success('Renovação registrada com sucesso!');
      navigate('/app/entrada');
    } catch (error: any) {
      toast.error(`Erro ao registrar renovação: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/app/entrada')} className="p-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
              placeholder="Buscar por nome ou telefone..."
              className="flex-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
            />
            <button type="button" onClick={searchAlunos} disabled={searchingAluno}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-xl hover:bg-cyan-500/30 transition-colors">
              {searchingAluno ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {alunos.length > 0 && (
            <div className="mt-4 space-y-2">
              {alunos.map((aluno) => (
                <button key={aluno.id} type="button" onClick={() => selectAluno(aluno)}
                  className="w-full text-left p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-cyan-500/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-medium">{aluno.nome}</p>
                      <p className="text-gray-400 text-sm">{aluno.curso?.nome} • {aluno.unidade?.nome} • R$ {aluno.valor_mensalidade}</p>
                    </div>
                    <span className="text-xs text-gray-500">{calcularTempoAluno(aluno.data_matricula)} meses</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {errors.aluno_id && !selectedAluno && <p className="text-red-400 text-xs mt-2">{errors.aluno_id.message}</p>}
        </section>

        {selectedAluno && (
          <>
            <section className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="text-white font-medium">{selectedAluno.nome}</p>
                    <p className="text-gray-400 text-sm">{selectedAluno.curso?.nome} • {selectedAluno.unidade?.nome}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedAluno(null)} className="text-gray-400 hover:text-white text-sm">Alterar</button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-white">{calcularTempoAluno(selectedAluno.data_matricula)}</p>
                  <p className="text-xs text-gray-400">meses de permanência</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-white">R$ {selectedAluno.valor_mensalidade}</p>
                  <p className="text-xs text-gray-400">valor atual</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-green-400">R$ {(selectedAluno.valor_mensalidade * calcularTempoAluno(selectedAluno.data_matricula)).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">LTV acumulado</p>
                </div>
              </div>
            </section>

            <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                Valores da Renovação
              </h2>

              <div className="flex gap-2 mb-6">
                {[5, 8, 10, 12, 15].map((p) => (
                  <button key={p} type="button" onClick={() => aplicarReajuste(p)}
                    className="px-4 py-2 bg-slate-700/50 text-gray-300 rounded-lg hover:bg-slate-700 transition-colors text-sm">
                    +{p}%
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Valor Atual</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                    <input {...register('valor_anterior')} type="number" readOnly
                      className="w-full bg-slate-900/30 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Novo Valor *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                    <input {...register('valor_novo')} type="number" step="0.01"
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  {errors.valor_novo && <p className="text-red-400 text-xs mt-1">{errors.valor_novo.message}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Reajuste</label>
                  <div className={`flex items-center justify-center h-[50px] rounded-xl text-xl font-bold ${
                    percentualReajuste > 0 ? 'bg-green-500/20 text-green-400' : percentualReajuste < 0 ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/50 text-gray-400'
                  }`}>
                    <TrendingUp className="w-5 h-5 mr-2" />
                    {percentualReajuste > 0 ? '+' : ''}{percentualReajuste}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Data da Renovação *</label>
                  <input {...register('data_renovacao')} type="date"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Duração do Contrato</label>
                  <select {...register('duracao_contrato')}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50">
                    <option value={6}>6 meses</option>
                    <option value={12}>12 meses</option>
                    <option value={18}>18 meses</option>
                    <option value={24}>24 meses</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-1">Motivo do Reajuste</label>
                <select {...register('motivo_reajuste')}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50">
                  <option value="">Selecione...</option>
                  <option value="reajuste_anual">Reajuste Anual</option>
                  <option value="mudanca_plano">Mudança de Plano</option>
                  <option value="promocao">Promoção/Desconto</option>
                  <option value="negociacao">Negociação</option>
                </select>
              </div>
            </section>

            <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Observações</h2>
              <textarea {...register('observacoes')} rows={3} placeholder="Informações adicionais..."
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none" />
            </section>
          </>
        )}

        <div className="flex justify-end gap-4">
          <button type="button" onClick={() => navigate('/app/entrada')} className="px-6 py-3 text-gray-400 hover:text-white transition-colors">Cancelar</button>
          <button type="submit" disabled={loading || !selectedAluno}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
            <RefreshCw className="w-5 h-5" />
            {loading ? 'Salvando...' : 'Confirmar Renovação'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FormRenovacao;
