import { AlertTriangle, Lightbulb, Users, Target } from 'lucide-react';
import { useComercialData } from '../../hooks/useComercialData';

export function ComercialAlertas() {
  const { kpis: kpisGrupo } = useComercialData(2025, 'Consolidado');
  const { kpis: kpisCG } = useComercialData(2025, 'Campo Grande');
  const { kpis: kpisRec } = useComercialData(2025, 'Recreio');
  const { kpis: kpisBarra } = useComercialData(2025, 'Barra');

  if (!kpisGrupo || !kpisCG || !kpisRec || !kpisBarra) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-cyan"></div>
      </div>
    );
  }

  // Calcular potencial se CG tivesse a conversão do Recreio
  const matriculasAdicionaisCG = Math.round(kpisCG.totalLeads * (kpisRec.taxaConversaoTotal / 100)) - kpisCG.novasMatriculas;
  const faturamentoAdicional = matriculasAdicionaisCG * kpisCG.ticketMedioParcelas;

  const alertas = [
    {
      tipo: 'critico',
      icone: AlertTriangle,
      corIcone: 'text-red-400',
      corBg: 'bg-red-500/10',
      corBorda: 'border-red-500/30',
      titulo: 'Alerta Crítico: Campo Grande',
      conteudo: (
        <>
          <p className="text-gray-300 mb-3">
            Campo Grande converte apenas <strong className="text-red-400">6,4%</strong> dos leads
            enquanto Recreio converte <strong className="text-accent-cyan">11,9%</strong> (quase o dobro).
          </p>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-sm text-gray-400 mb-2">Se CG tivesse a mesma taxa do Recreio:</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xl font-bold text-accent-cyan">+{matriculasAdicionaisCG}</div>
                <div className="text-xs text-gray-500">matrículas adicionais</div>
              </div>
              <div>
                <div className="text-xl font-bold text-accent-cyan">+R$ {Math.round(faturamentoAdicional / 1000)}k</div>
                <div className="text-xs text-gray-500">faturamento anual</div>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      tipo: 'oportunidade',
      icone: Lightbulb,
      corIcone: 'text-accent-cyan',
      corBg: 'bg-accent-cyan/10',
      corBorda: 'border-accent-cyan/30',
      titulo: 'Oportunidade: Programa de Indicação',
      conteudo: (
        <>
          <p className="text-gray-300 mb-3">
            Indicação tem <strong className="text-accent-cyan">25,1%</strong> de conversão (vs 5,7% Instagram)
            mas representa apenas <strong className="text-amber-400">5,5%</strong> dos leads.
          </p>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-sm text-gray-400 mb-2">Se aumentar indicações para 20% dos leads:</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xl font-bold text-accent-cyan">+120</div>
                <div className="text-xs text-gray-500">matrículas/ano</div>
              </div>
              <div>
                <div className="text-xl font-bold text-accent-cyan">R$ 50k</div>
                <div className="text-xs text-gray-500">faturamento extra</div>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      tipo: 'insight',
      icone: Users,
      corIcone: 'text-pink-400',
      corBg: 'bg-pink-500/10',
      corBorda: 'border-pink-500/30',
      titulo: 'Insight: LA Music Kids',
      conteudo: (
        <>
          <p className="text-gray-300 mb-3">
            <strong className="text-pink-400">49%</strong> das matrículas são para LA Music Kids (até 11 anos).
            Barra lidera com <strong className="text-accent-cyan">59%</strong> de matrículas Kids.
          </p>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-sm text-gray-400 mb-2">Distribuição por unidade:</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400">Barra</span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '59%' }}></div>
                </div>
                <span className="text-white">59%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400">Recreio</span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: '53%' }}></div>
                </div>
                <span className="text-white">53%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-cyan-400">C. Grande</span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: '40%' }}></div>
                </div>
                <span className="text-white">40%</span>
              </div>
            </div>
          </div>
          <p className="text-gray-400 text-sm mt-3">
            <strong>Ação:</strong> Expandir oferta de musicalização em Campo Grande (atualmente 40% Kids).
          </p>
        </>
      ),
    },
    {
      tipo: 'sazonalidade',
      icone: Target,
      corIcone: 'text-amber-400',
      corBg: 'bg-amber-500/10',
      corBorda: 'border-amber-500/30',
      titulo: 'Sazonalidade: Concentração de Budget',
      conteudo: (
        <>
          <p className="text-gray-300 mb-3">
            Dezembro teve apenas <strong className="text-red-400">7 matrículas</strong> (vs 88 em Janeiro).
            Queda de <strong className="text-red-400">92%</strong> - foco deve ser em renovações.
          </p>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-sm text-gray-400 mb-2">Recomendação de alocação:</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-accent-cyan">60%</div>
                <div className="text-xs text-gray-500">do budget em Jan/Ago</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">0%</div>
                <div className="text-xs text-gray-500">captação em Dezembro</div>
              </div>
            </div>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <span className="inline-block bg-accent-cyan/20 text-accent-cyan text-sm font-medium px-3 py-1 rounded-full mb-4">
          ⚠️ Alertas e Insights
        </span>
        <h1 className="text-4xl font-bold text-white mb-2">
          Pontos de <span className="text-accent-cyan">Atenção</span>
        </h1>
        <p className="text-gray-400">
          Insights inteligentes para tomada de decisão
        </p>
      </div>

      {/* Cards de Alertas */}
      <div className="space-y-6">
        {alertas.map((alerta, idx) => {
          const Icone = alerta.icone;
          return (
            <div 
              key={idx}
              className={`${alerta.corBg} border ${alerta.corBorda} rounded-2xl p-6`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 ${alerta.corBg} rounded-xl`}>
                  <Icone className={`w-6 h-6 ${alerta.corIcone}`} />
                </div>
                <div className="flex-1">
                  <h3 className={`text-lg font-semibold ${alerta.corIcone} mb-3`}>
                    {alerta.titulo}
                  </h3>
                  {alerta.conteudo}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ComercialAlertas;
