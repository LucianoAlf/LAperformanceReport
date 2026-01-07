import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useComercialData } from '../../hooks/useComercialData';
import { Flag, Target } from 'lucide-react';

interface MetaComercial {
  unidade: string;
  meta_leads: number;
  meta_experimentais: number;
  meta_matriculas: number;
  meta_taxa_conversao: number;
  meta_ticket_medio: number;
}

export function ComercialMetas() {
  const [metas, setMetas] = useState<MetaComercial[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { kpis: kpisCG } = useComercialData(2025, 'Campo Grande');
  const { kpis: kpisRec } = useComercialData(2025, 'Recreio');
  const { kpis: kpisBarra } = useComercialData(2025, 'Barra');
  const { kpis: kpisGrupo } = useComercialData(2025, 'Consolidado');

  useEffect(() => {
    fetchMetas();
  }, []);

  const fetchMetas = async () => {
    const { data } = await supabase
      .from('metas_comerciais')
      .select('*')
      .eq('ano', 2026);

    if (data) {
      setMetas(data);
    }
    setLoading(false);
  };

  if (loading || !kpisCG || !kpisRec || !kpisBarra || !kpisGrupo) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const metaGrupo = metas.find(m => m.unidade === 'Grupo') || {
    meta_leads: 8500,
    meta_experimentais: 1200,
    meta_matriculas: 800,
    meta_taxa_conversao: 10,
    meta_ticket_medio: 430,
  };
  
  const metaCG = metas.find(m => m.unidade === 'Campo Grande') || { meta_matriculas: 380 };
  const metaRec = metas.find(m => m.unidade === 'Recreio') || { meta_matriculas: 230 };
  const metaBarra = metas.find(m => m.unidade === 'Barra') || { meta_matriculas: 190 };

  const calcVariacao = (real: number, meta: number) => {
    const diff = ((meta - real) / real) * 100;
    return diff > 0 ? `+${diff.toFixed(0)}%` : `${diff.toFixed(0)}%`;
  };

  const planoAcao = [
    {
      numero: 1,
      titulo: 'Qualificação de Leads',
      descricao: 'Implementar score de leads no CRM. Filtrar leads do Instagram antes de agendar experimental.',
      meta: 'Aumentar Lead→Exp de 11,9% para 15%',
      responsavel: 'Marketing',
    },
    {
      numero: 2,
      titulo: 'Programa de Indicação',
      descricao: 'Lançar "Indique um Amigo" com desconto. Premiação para alunos que mais indicam.',
      meta: '15% das matrículas por indicação',
      responsavel: 'Comercial',
    },
    {
      numero: 3,
      titulo: 'Capacitação de Professores',
      descricao: 'Treinar professores para conversão. Ranking mensal com premiação.',
      meta: 'Top 5 professores com 80%+ conversão',
      responsavel: 'Coordenação',
    },
    {
      numero: 4,
      titulo: 'Concentração de Budget',
      descricao: '60% do marketing em Janeiro e Agosto. Reduzir investimento em Dezembro.',
      meta: 'ROI de marketing +20%',
      responsavel: 'Marketing',
    },
    {
      numero: 5,
      titulo: 'Expansão LA Music Kids',
      descricao: 'Mais turmas de musicalização em Campo Grande.',
      meta: '55% das matrículas serem Kids',
      responsavel: 'Pedagógico',
    },
  ];

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <Target className="w-4 h-4" /> Metas 2026
        </span>
        <h1 className="text-4xl font-bold text-white mb-2">
          Objetivos <span className="text-emerald-400">Comerciais</span>
        </h1>
        <p className="text-gray-400">
          Metas e plano de ação para o próximo ano
        </p>
      </div>

      {/* Metas do Grupo */}
      <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-2xl p-6 mb-8">
        <h3 className="text-xl font-semibold text-emerald-400 mb-6 flex items-center gap-2">
          <Flag className="w-5 h-5" />
          Metas do Grupo 2026
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{metaGrupo.meta_leads.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-gray-400">Leads</div>
            <div className="text-xs text-emerald-400 mt-1">{calcVariacao(kpisGrupo.totalLeads, metaGrupo.meta_leads)}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{metaGrupo.meta_experimentais.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-gray-400">Experimentais</div>
            <div className="text-xs text-emerald-400 mt-1">{calcVariacao(kpisGrupo.aulasExperimentais, metaGrupo.meta_experimentais)}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{metaGrupo.meta_matriculas}</div>
            <div className="text-sm text-gray-400">Matrículas</div>
            <div className="text-xs text-emerald-400 mt-1">{calcVariacao(kpisGrupo.novasMatriculas, metaGrupo.meta_matriculas)}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{metaGrupo.meta_taxa_conversao}%</div>
            <div className="text-sm text-gray-400">Taxa Conversão</div>
            <div className="text-xs text-emerald-400 mt-1">+{(metaGrupo.meta_taxa_conversao - kpisGrupo.taxaConversaoTotal).toFixed(1)}pp</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">R$ {metaGrupo.meta_ticket_medio}</div>
            <div className="text-sm text-gray-400">Ticket Médio</div>
            <div className="text-xs text-emerald-400 mt-1">{calcVariacao(kpisGrupo.ticketMedioParcelas, metaGrupo.meta_ticket_medio)}</div>
          </div>
        </div>
      </div>

      {/* Metas por Unidade */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-white mb-6">Metas por Unidade</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-gray-400 text-sm font-medium py-3 px-4">Unidade</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Real 2025</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Meta 2026</th>
                <th className="text-right text-gray-400 text-sm font-medium py-3 px-4">Crescimento</th>
              </tr>
            </thead>
            <tbody>
              {[
                { nome: 'Campo Grande', cor: 'cyan', real: kpisCG.novasMatriculas, meta: metaCG.meta_matriculas },
                { nome: 'Recreio', cor: 'purple', real: kpisRec.novasMatriculas, meta: metaRec.meta_matriculas },
                { nome: 'Barra', cor: 'emerald', real: kpisBarra.novasMatriculas, meta: metaBarra.meta_matriculas },
              ].map((u) => (
                <tr key={u.nome} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className={`py-4 px-4 text-${u.cor}-400 font-medium`}>{u.nome}</td>
                  <td className="text-right text-white py-4 px-4">{u.real}</td>
                  <td className="text-right text-white py-4 px-4 font-semibold">{u.meta}</td>
                  <td className="text-right py-4 px-4">
                    <span className="text-emerald-400 font-semibold">
                      +{(((u.meta - u.real) / u.real) * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-700/20">
                <td className="py-4 px-4 text-yellow-400 font-bold">TOTAL</td>
                <td className="text-right text-white py-4 px-4 font-bold">{kpisGrupo.novasMatriculas}</td>
                <td className="text-right text-white py-4 px-4 font-bold">{metaGrupo.meta_matriculas}</td>
                <td className="text-right py-4 px-4">
                  <span className="text-emerald-400 font-bold">
                    +{(((metaGrupo.meta_matriculas) - kpisGrupo.novasMatriculas) / kpisGrupo.novasMatriculas * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Plano de Ação */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-400" />
          Plano de Ação Comercial 2026
        </h3>
        
        <div className="space-y-4">
          {planoAcao.map((acao) => (
            <div 
              key={acao.numero}
              className="bg-slate-700/30 rounded-xl p-4 hover:bg-slate-700/50 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                  {acao.numero}
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-semibold mb-1">{acao.titulo}</h4>
                  <p className="text-gray-400 text-sm mb-2">{acao.descricao}</p>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">
                      Meta: {acao.meta}
                    </span>
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                      Responsável: {acao.responsavel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ComercialMetas;
