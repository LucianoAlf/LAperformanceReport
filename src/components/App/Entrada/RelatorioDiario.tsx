import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Save, 
  Calendar,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface ResumoUnidade {
  unidade_id: string;
  unidade_nome: string;
  alunos_ativos: number;
  matriculas_mes: number;
  evasoes_mes: number;
  saldo_liquido: number;
  renovacoes_mes: number;
  taxa_renovacao: number;
  receita_estimada: number;
  ticket_medio: number;
}

interface ResumoGeral {
  total_alunos: number;
  total_matriculas: number;
  total_evasoes: number;
  total_renovacoes: number;
  saldo_liquido: number;
  receita_total: number;
  ticket_medio: number;
}

export function RelatorioDiario() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataRelatorio, setDataRelatorio] = useState(new Date().toISOString().split('T')[0]);
  const [resumoUnidades, setResumoUnidades] = useState<ResumoUnidade[]>([]);
  const [resumoGeral, setResumoGeral] = useState<ResumoGeral | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [jaGerado, setJaGerado] = useState(false);

  useEffect(() => {
    carregarDados();
  }, [dataRelatorio]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const mesAtual = dataRelatorio.substring(0, 7);
      
      // Verificar se já existe relatório para esta data
      const { data: relatorioExistente } = await supabase
        .from('relatorios_diarios')
        .select('id')
        .eq('data_relatorio', dataRelatorio)
        .single();
      
      setJaGerado(!!relatorioExistente);

      // Buscar unidades
      const { data: unidades } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('ativo', true);

      if (!unidades) return;

      const resumos: ResumoUnidade[] = [];

      for (const unidade of unidades) {
        // Alunos ativos
        const { count: alunosAtivos } = await supabase
          .from('alunos')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', unidade.id)
          .eq('status', 'ativo');

        // Matrículas do mês
        const { count: matriculasMes } = await supabase
          .from('movimentacoes')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', unidade.id)
          .eq('tipo', 'matricula')
          .gte('data_movimentacao', `${mesAtual}-01`)
          .lte('data_movimentacao', dataRelatorio);

        // Evasões do mês
        const { count: evasoesMes } = await supabase
          .from('movimentacoes')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', unidade.id)
          .eq('tipo', 'evasao')
          .gte('data_movimentacao', `${mesAtual}-01`)
          .lte('data_movimentacao', dataRelatorio);

        // Renovações do mês
        const { count: renovacoesMes } = await supabase
          .from('renovacoes')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', unidade.id)
          .gte('data_renovacao', `${mesAtual}-01`)
          .lte('data_renovacao', dataRelatorio);

        // Ticket médio
        const { data: ticketData } = await supabase
          .from('alunos')
          .select('valor_mensalidade')
          .eq('unidade_id', unidade.id)
          .eq('status', 'ativo');

        const ticketMedio = ticketData && ticketData.length > 0
          ? ticketData.reduce((acc, a) => acc + (a.valor_mensalidade || 0), 0) / ticketData.length
          : 0;

        resumos.push({
          unidade_id: unidade.id,
          unidade_nome: unidade.nome,
          alunos_ativos: alunosAtivos || 0,
          matriculas_mes: matriculasMes || 0,
          evasoes_mes: evasoesMes || 0,
          saldo_liquido: (matriculasMes || 0) - (evasoesMes || 0),
          renovacoes_mes: renovacoesMes || 0,
          taxa_renovacao: 0,
          receita_estimada: (alunosAtivos || 0) * ticketMedio,
          ticket_medio: Math.round(ticketMedio),
        });
      }

      setResumoUnidades(resumos);

      // Calcular resumo geral
      const geral: ResumoGeral = {
        total_alunos: resumos.reduce((acc, r) => acc + r.alunos_ativos, 0),
        total_matriculas: resumos.reduce((acc, r) => acc + r.matriculas_mes, 0),
        total_evasoes: resumos.reduce((acc, r) => acc + r.evasoes_mes, 0),
        total_renovacoes: resumos.reduce((acc, r) => acc + r.renovacoes_mes, 0),
        saldo_liquido: resumos.reduce((acc, r) => acc + r.saldo_liquido, 0),
        receita_total: resumos.reduce((acc, r) => acc + r.receita_estimada, 0),
        ticket_medio: resumos.length > 0 
          ? Math.round(resumos.reduce((acc, r) => acc + r.ticket_medio, 0) / resumos.length)
          : 0,
      };

      setResumoGeral(geral);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados do relatório');
    } finally {
      setLoading(false);
    }
  };

  const salvarRelatorio = async () => {
    if (!resumoGeral) return;
    
    setSaving(true);
    try {
      // Salvar relatório geral
      const { error } = await supabase.from('relatorios_diarios').upsert({
        data_relatorio: dataRelatorio,
        total_alunos_ativos: resumoGeral.total_alunos,
        matriculas_dia: resumoGeral.total_matriculas,
        evasoes_dia: resumoGeral.total_evasoes,
        renovacoes_dia: resumoGeral.total_renovacoes,
        saldo_liquido: resumoGeral.saldo_liquido,
        receita_estimada: resumoGeral.receita_total,
        ticket_medio: resumoGeral.ticket_medio,
        observacoes: observacoes || null,
        dados_unidades: resumoUnidades,
      }, { onConflict: 'data_relatorio' });

      if (error) throw error;

      setJaGerado(true);
      toast.success('Relatório salvo com sucesso!');
    } catch (error: any) {
      toast.error(`Erro ao salvar relatório: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const gerarTextoWhatsApp = () => {
    if (!resumoGeral) return '';
    
    const data = new Date(dataRelatorio).toLocaleDateString('pt-BR');
    let texto = `📊 *RELATÓRIO DIÁRIO - ${data}*\n\n`;
    texto += `👥 *Alunos Ativos:* ${resumoGeral.total_alunos}\n`;
    texto += `✅ *Matrículas (mês):* ${resumoGeral.total_matriculas}\n`;
    texto += `❌ *Evasões (mês):* ${resumoGeral.total_evasoes}\n`;
    texto += `📈 *Saldo Líquido:* ${resumoGeral.saldo_liquido >= 0 ? '+' : ''}${resumoGeral.saldo_liquido}\n`;
    texto += `🔄 *Renovações:* ${resumoGeral.total_renovacoes}\n`;
    texto += `💰 *Receita Estimada:* ${formatarMoeda(resumoGeral.receita_total)}\n\n`;
    
    texto += `*Por Unidade:*\n`;
    resumoUnidades.forEach(u => {
      texto += `\n📍 *${u.unidade_nome}*\n`;
      texto += `   Alunos: ${u.alunos_ativos} | Mat: ${u.matriculas_mes} | Eva: ${u.evasoes_mes}\n`;
    });

    if (observacoes) {
      texto += `\n📝 *Observações:*\n${observacoes}`;
    }

    return texto;
  };

  const copiarParaWhatsApp = () => {
    const texto = gerarTextoWhatsApp();
    navigator.clipboard.writeText(texto);
    toast.success('Texto copiado! Cole no WhatsApp.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/app/entrada')} className="p-2 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Relatório Diário</h1>
          <p className="text-gray-400">Fechamento e snapshot dos números</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-400" />
          <input
            type="date"
            value={dataRelatorio}
            onChange={(e) => setDataRelatorio(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {jaGerado && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <p className="text-yellow-400">Já existe um relatório para esta data. Salvar novamente irá atualizar os dados.</p>
        </div>
      )}

      {/* Resumo Geral */}
      {resumoGeral && (
        <section className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Resumo Consolidado
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 rounded-xl p-4 text-center">
              <Users className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-white">{resumoGeral.total_alunos}</p>
              <p className="text-xs text-gray-400">Alunos Ativos</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 text-center">
              <TrendingUp className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-green-400">+{resumoGeral.total_matriculas}</p>
              <p className="text-xs text-gray-400">Matrículas (mês)</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 text-center">
              <TrendingDown className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-red-400">-{resumoGeral.total_evasoes}</p>
              <p className="text-xs text-gray-400">Evasões (mês)</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 text-center">
              <DollarSign className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-400">{formatarMoeda(resumoGeral.receita_total)}</p>
              <p className="text-xs text-gray-400">Receita Estimada</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-8">
            <div className="text-center">
              <p className={`text-2xl font-bold ${resumoGeral.saldo_liquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {resumoGeral.saldo_liquido >= 0 ? '+' : ''}{resumoGeral.saldo_liquido}
              </p>
              <p className="text-xs text-gray-400">Saldo Líquido</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">{resumoGeral.total_renovacoes}</p>
              <p className="text-xs text-gray-400">Renovações</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">R$ {resumoGeral.ticket_medio}</p>
              <p className="text-xs text-gray-400">Ticket Médio</p>
            </div>
          </div>
        </section>
      )}

      {/* Por Unidade */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Detalhamento por Unidade</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-slate-700">
                <th className="pb-3">Unidade</th>
                <th className="pb-3 text-center">Alunos</th>
                <th className="pb-3 text-center">Mat.</th>
                <th className="pb-3 text-center">Eva.</th>
                <th className="pb-3 text-center">Saldo</th>
                <th className="pb-3 text-center">Renov.</th>
                <th className="pb-3 text-right">Ticket</th>
                <th className="pb-3 text-right">Receita</th>
              </tr>
            </thead>
            <tbody>
              {resumoUnidades.map((u) => (
                <tr key={u.unidade_id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{u.unidade_nome}</td>
                  <td className="py-3 text-center text-white">{u.alunos_ativos}</td>
                  <td className="py-3 text-center text-green-400">+{u.matriculas_mes}</td>
                  <td className="py-3 text-center text-red-400">-{u.evasoes_mes}</td>
                  <td className={`py-3 text-center font-medium ${u.saldo_liquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {u.saldo_liquido >= 0 ? '+' : ''}{u.saldo_liquido}
                  </td>
                  <td className="py-3 text-center text-purple-400">{u.renovacoes_mes}</td>
                  <td className="py-3 text-right text-gray-300">R$ {u.ticket_medio}</td>
                  <td className="py-3 text-right text-emerald-400">{formatarMoeda(u.receita_estimada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Observações */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Observações do Dia</h2>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={3}
          placeholder="Registre observações importantes, eventos do dia, etc..."
          className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 resize-none"
        />
      </section>

      {/* Botões */}
      <div className="flex justify-between gap-4">
        <button
          type="button"
          onClick={copiarParaWhatsApp}
          className="flex items-center gap-2 px-6 py-3 bg-green-500/20 text-green-400 rounded-xl hover:bg-green-500/30 transition-colors"
        >
          <Send className="w-5 h-5" />
          Copiar para WhatsApp
        </button>
        
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => navigate('/app/entrada')}
            className="px-6 py-3 text-gray-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvarRelatorio}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {jaGerado ? <CheckCircle2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {saving ? 'Salvando...' : jaGerado ? 'Atualizar Relatório' : 'Salvar Relatório'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RelatorioDiario;
