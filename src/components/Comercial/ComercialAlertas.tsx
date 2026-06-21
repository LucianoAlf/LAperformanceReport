import { AlertTriangle, CheckCircle2, Lightbulb, LockKeyhole } from 'lucide-react';
import { useComercialResumoV2 } from '../../hooks/useComercialResumoV2';

export function ComercialAlertas() {
  const { resumo, loading, error } = useComercialResumoV2(2025, 'Consolidado');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <div className="text-xl mb-2">Erro ao carregar alertas</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  const alertas = [
    {
      icone: CheckCircle2,
      corIcone: 'text-emerald-400',
      corBg: 'bg-emerald-500/10',
      corBorda: 'border-emerald-500/30',
      titulo: 'Fonte v2 ativa para Leads Entrantes',
      descricao: `A apresentacao comercial ja usa a fonte canonica v2 para leads. Total consolidado 2025: ${resumo?.leadsEntrantes.toLocaleString('pt-BR') || 0} leads.`,
      detalhe: 'Este numero vem da RPC comercial canonica v2, por competencia explicita.',
    },
    {
      icone: AlertTriangle,
      corIcone: 'text-yellow-300',
      corBg: 'bg-yellow-500/10',
      corBorda: 'border-yellow-500/30',
      titulo: 'Matriculas comerciais seguem como diagnostico',
      descricao: `Total diagnostico atual: ${resumo?.matriculasComerciais.toLocaleString('pt-BR') || 0} matriculas comerciais.`,
      detalhe: 'A distribuicao por unidade ainda nao e canonica porque depende de regra de unidade comercial/origem.',
    },
    {
      icone: LockKeyhole,
      corIcone: 'text-red-300',
      corBg: 'bg-red-500/10',
      corBorda: 'border-red-500/30',
      titulo: 'Taxa Experimental -> Matricula bloqueada',
      descricao: 'Nao publicar como KPI oficial enquanto presenca individual + vinculo lead/aluno nao estiverem reconciliados.',
      detalhe: 'A taxa pode aparecer apenas como diagnostico com aviso de bloqueio.',
    },
    {
      icone: Lightbulb,
      corIcone: 'text-blue-300',
      corBg: 'bg-blue-500/10',
      corBorda: 'border-blue-500/30',
      titulo: 'Proximo foco tecnico',
      descricao: 'Apos os blocos v2 de leads, o gargalo restante e reconciliar experimental -> aluno -> presenca.',
      detalhe: 'Sem essa costura, relatórios de show-up, professor experimental e Exp->Mat continuam bloqueados.',
    },
  ];

  return (
    <div className="p-8 min-h-screen">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <AlertTriangle className="w-4 h-4" /> Alertas e Insights
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Pontos de <span className="text-emerald-400">Controle</span>
        </h1>
        <p className="text-gray-400">
          Alertas baseados no estado canonico atual do comercial.
        </p>
      </div>

      <div className="space-y-6">
        {alertas.map((alerta) => {
          const Icone = alerta.icone;
          return (
            <div
              key={alerta.titulo}
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
                  <p className="text-gray-300 mb-3">{alerta.descricao}</p>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-sm text-gray-400">
                    {alerta.detalhe}
                  </div>
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
