import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  TrendingUp, 
  DollarSign, 
  Percent,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Calendar,
  Ticket,
  Target,
  Award,
  Phone,
  GraduationCap,
  RefreshCw,
  Lock,
  HeartPulse,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { EvolutionChart } from '@/components/ui/EvolutionChart';
import { FunnelChart } from '@/components/ui/FunnelChart';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { KPICard } from '@/components/ui/KPICard';
import { ModalDetalheKPI, BadgeUnidade, BadgeTipo, ValorParcela, TextoCurso } from './ModalDetalheKPI';
import { calcularTicketMedioCanonico } from '@/lib/ticketMedioCanonico';
import { useDashboardDados } from '@/hooks/useDashboardDados';


export function DashboardPage() {
  useSetPageTitle({
    titulo: 'Dashboard',
    subtitulo: 'Visão consolidada de gestão, comercial e professores',
    icone: BarChart3,
    iconeCor: 'text-cyan-400',
    iconeWrapperCor: 'bg-cyan-500/20',
  });

  const {
    loading, alertas, dadosGestao, fonteKpisAlunos, dadosComercial, dadosProfessores,
    evolucaoAlunos, funilComercial, resumoUnidades, metas, labelPeriodo, unidade,
    competencia, anosDisponiveis, setTipo, setAno, setMes, setTrimestre, setSemestre,
    setDataInicio, setDataFim, leadsComercialV2, loadingLeadsComercialV2,
    errorLeadsComercialV2, healthScoreV3Enabled, healthScoreV3Loading,
    healthScoreV3Period, healthScoreV3Summary, taxaExpMatLiberada, taxaExpMatSemBase,
    modalMatriculas, setModalMatriculas, modalEvasoes, setModalEvasoes,
    modalExperimentais, setModalExperimentais, modalConversao, setModalConversao,
    dadosModalMatriculas, dadosModalEvasoes, dadosModalExperimentais,
    dadosModalConversao, carregandoModal, fetchMatriculas, fetchEvasoes,
    fetchExperimentais, fetchConversao,
  } = useDashboardDados();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== FILTRO DE COMPETÊNCIA ===== */}
      {competencia?.filtro && setTipo && setAno && setMes && setTrimestre && setSemestre && (
        <div className="flex justify-end">
          <CompetenciaFilter
            filtro={competencia.filtro}
            range={competencia.range}
            anosDisponiveis={anosDisponiveis}
            onTipoChange={setTipo}
            onAnoChange={setAno}
            onMesChange={setMes}
            onTrimestreChange={setTrimestre}
            onSemestreChange={setSemestre}
            onDataInicioChange={setDataInicio}
            onDataFimChange={setDataFim}
          />
        </div>
      )}

      {/* ===== LINHA 1: GESTÃO ===== */}
      <div data-tour="secao-gestao">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Gestão</h3>
        </div>
        {fonteKpisAlunos && (
          <div className={`mb-3 inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
            fonteKpisAlunos.fonte === 'dados_mensais'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : fonteKpisAlunos.fonte === 'vivo'
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          }`}>
            <BarChart3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              KPIs de alunos: {fonteKpisAlunos.label}
              {fonteKpisAlunos.alertas[0] ? ` · ${fonteKpisAlunos.alertas[0]}` : ''}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            dataTour="card-alunos"
            icon={Users}
            label="Pagantes"
            tooltip="Total de alunos ativos com tipo de matrícula pagante (exclui bolsistas integrais). Não conta segundo curso."
            value={dadosGestao?.alunos_pagantes ?? '--'}
            target={metas.alunos_pagantes}
            format="number"
            variant="cyan"
          />
          <KPICard
            dataTour="card-matriculas"
            icon={UserPlus}
            label={`Matrículas (${labelPeriodo})`}
            tooltip="Novos alunos que pagaram passaporte no período. Não inclui segundo curso, banda, coral ou bolsistas. Clique para ver a lista."
            value={dadosGestao?.matriculas_mes ?? '--'}
            target={metas.matriculas}
            format="number"
            subvalue={!dadosGestao ? 'Aguardando dados' : undefined}
            variant="emerald"
            onClick={() => { fetchMatriculas(); setModalMatriculas(true); }}
          />
          <KPICard
            dataTour="card-evasoes"
            icon={UserMinus}
            label={`Evasões (${labelPeriodo})`}
            tooltip="Alunos que cancelaram ou não renovaram no período. Conta evasões e não-renovações (deduplicado por aluno/mês). Clique para ver a lista."
            value={dadosGestao?.evasoes_mes ?? '--'}
            subvalue={!dadosGestao ? 'Aguardando dados' : undefined}
            variant="rose"
            inverterCor={true}
            onClick={() => { fetchEvasoes(); setModalEvasoes(true); }}
          />
          <KPICard
            dataTour="card-ticket"
            icon={DollarSign}
            label="Ticket Médio Parcelas"
            tooltip="Média do valor total pago por aluno (soma parcelas de todos os cursos). Média ponderada pelo número de pagantes de cada unidade."
            value={dadosGestao?.ticket_medio ?? '--'}
            target={metas.ticket_medio}
            format="currency"
            variant="amber"
          />
        </div>
      </div>

      {/* ===== LINHA 2: COMERCIAL ===== */}
      <div data-tour="secao-comercial">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-violet-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Comercial</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Phone}
            label={`Leads (${labelPeriodo})`}
            tooltip="Total de novos leads (contatos) recebidos no período. Inclui leads novos e agendados."
            value={loadingLeadsComercialV2 ? '--' : leadsComercialV2 ?? '--'}
            target={metas.leads}
            format="number"
            subvalue={
              errorLeadsComercialV2
                ? 'Erro na fonte v2'
                : loadingLeadsComercialV2
                  ? 'Aguardando fonte v2'
                  : 'Fonte v2'
            }
            variant="cyan"
          />
          <KPICard
            icon={Calendar}
            label="Experimentais com Presença"
            tooltip="Presença experimental confirmada pela camada v2: aluno vinculado + presença individual + aula Emusys experimental. Clique para ver a lista operacional."
            value={dadosComercial?.experimentais_realizadas ?? '--'}
            target={metas.experimentais}
            format="number"
            subvalue={
              !dadosComercial
                ? 'Aguardando dados'
                : `Status operacional: ${dadosComercial.experimentais_status_operacional ?? 0}`
            }
            variant="violet"
            onClick={() => { fetchExperimentais(); setModalExperimentais(true); }}
          />
          <KPICard
            icon={taxaExpMatLiberada ? Percent : taxaExpMatSemBase ? Calendar : Lock}
            label="Taxa Exp→Mat"
            tooltip={
              taxaExpMatLiberada
                ? 'KPI canônico: matrículas originadas de experimentais confirmadas dividido por experimentais realizadas confirmadas.'
                : taxaExpMatSemBase
                  ? 'Competencia sem base: ainda nao ha experimentais confirmadas para calcular a taxa.'
                : 'KPI bloqueado: aguarda regra canônica de vínculo lead → aluno → presença experimental individual.'
            }
            value={!dadosComercial ? '--' : taxaExpMatLiberada ? dadosComercial.taxa_conversao : taxaExpMatSemBase ? 'Sem base' : 'Bloqueada'}
            format={taxaExpMatLiberada ? 'percent' : undefined}
            subvalue={
              taxaExpMatLiberada
                ? `${dadosComercial.conversoes_exp_mat ?? 0}/${dadosComercial.denominador_exp_mat ?? 0} confirmadas`
                : taxaExpMatSemBase
                  ? '0 pendencia(s); aguardando experimentais'
                : `${dadosComercial?.pendencias_exp_mat ?? 0} pendência(s)`
            }
            variant={taxaExpMatLiberada ? 'emerald' : taxaExpMatSemBase ? 'cyan' : 'amber'}
          />
          <KPICard
            icon={Ticket}
            label="Ticket Médio Passaporte"
            tooltip="Valor médio do passaporte (taxa de matrícula) pago pelos novos alunos no período."
            value={dadosComercial?.ticket_passaporte ?? '--'}
            format="currency"
            subvalue={!dadosComercial ? 'Aguardando dados' : undefined}
            variant="amber"
          />
        </div>
      </div>

      {/* ===== LINHA 3: PROFESSORES ===== */}
      <div data-tour="secao-professores">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Professores</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={Users}
            label="Total Professores"
            tooltip="Quantidade de professores ativos vinculados às unidades."
            value={dadosProfessores?.total_professores ?? '--'}
            format="number"
            subvalue={dadosProfessores ? 'ativos' : 'Aguardando dados'}
            variant="cyan"
          />
          <KPICard
            icon={GraduationCap}
            label="Média Alunos/Professor"
            tooltip="Total de alunos ativos dividido pelo total de professores ativos."
            value={dadosProfessores?.media_alunos_professor ?? '--'}
            format="number"
            subvalue={!dadosProfessores ? 'Aguardando dados' : undefined}
            variant="violet"
          />
          <KPICard
            icon={RefreshCw}
            label="Taxa Renovação"
            tooltip="Percentual de contratos que foram renovados em relação ao total de contratos vencidos no período."
            value={dadosProfessores?.taxa_renovacao ?? '--'}
            target={metas.taxa_renovacao}
            format="percent"
            subvalue={!dadosProfessores ? 'Aguardando dados' : undefined}
            variant="emerald"
          />
          <KPICard
            icon={Target}
            label="Média Alunos/Turma"
            tooltip="Ocupações canônicas em turmas regulares divididas pelas turmas regulares elegíveis. Projetos e bandas não entram."
            value={dadosProfessores?.media_alunos_turma === null || !dadosProfessores
              ? '--'
              : dadosProfessores.media_alunos_turma.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            subvalue={dadosProfessores?.media_alunos_turma === null || !dadosProfessores
              ? 'Fonte canônica indisponível'
              : competencia?.range?.label}
            variant="rose"
          />
          <KPICard
            icon={HeartPulse}
            label={healthScoreV3Summary.official ? 'Health Score V3' : 'Health Score parcial'}
            tooltip="Média dos snapshots V3 exibíveis dos professores no recorte. Rankings e premiações permanecem bloqueados até o fechamento oficial do ciclo."
            value={healthScoreV3Loading
              ? '--'
              : healthScoreV3Summary.score === null
                ? 'Sem base'
                : healthScoreV3Summary.score.toFixed(1)}
            subvalue={healthScoreV3Enabled
              ? `${healthScoreV3Summary.visible}/${healthScoreV3Summary.total} professores | ${healthScoreV3Period.label}`
              : 'Disponível nas visões Mês e Trim'}
            variant="violet"
          />
        </div>
      </div>

      {/* Alertas Inteligentes */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Alertas Inteligentes
          </h3>
          <div className="flex items-center gap-3">
            {alertas.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {alertas.filter(a => a.severidade === 'critico').length} críticos
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {alertas.filter(a => a.severidade === 'atencao').length} atenção
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  {alertas.filter(a => a.severidade === 'informativo').length} info
                </span>
              </div>
            )}
          </div>
        </div>
        
        {alertas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertas.map((alerta, idx) => {
              const severidadeConfig = {
                critico: { bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500', text: 'text-red-400' },
                atencao: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-500', text: 'text-amber-400' },
                informativo: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', dot: 'bg-blue-500', text: 'text-blue-400' }
              };
              const config = severidadeConfig[alerta.severidade] || severidadeConfig.informativo;
              
              const tipoIcone: Record<string, string> = {
                'CONTRATO_VENCENDO': '📋',
                'RENOVACOES_PENDENTES': '🔄',
                'CONVERSAO_BAIXA': '📉',
                'INADIMPLENCIA_ALTA': '💰',
                'TICKET_CAINDO': '🎫',
                'PROFESSOR_TURMA_BAIXA': '👨‍🏫',
                'CHURN_ALTO': '📤',
                'META_EM_RISCO': '🎯'
              };
              
              return (
                <div 
                  key={idx}
                  className={`flex flex-col gap-2 p-4 ${config.bg} rounded-xl border ${config.border} hover:scale-[1.02] transition-transform cursor-pointer`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{tipoIcone[alerta.tipo_alerta] || '⚠️'}</span>
                      <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                    </div>
                    {alerta.quantidade > 1 && (
                      <span className={`text-xs font-bold ${config.text} bg-slate-900/50 px-2 py-0.5 rounded-full`}>
                        {alerta.quantidade}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{alerta.descricao}</p>
                    <p className={`text-xs ${config.text} mt-1`}>{alerta.detalhe}</p>
                    {unidade === 'todos' && (
                      <p className="text-xs text-gray-500 mt-1">{alerta.unidade_nome}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-medium text-white">Tudo sob controle!</p>
            <p className="text-sm">Nenhum alerta ativo no momento</p>
          </div>
        )}
      </div>

      {/* ===== GRÁFICOS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolução de Alunos */}
        <div data-tour="grafico-evolucao" className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Evolução de Alunos Ativos (12 meses)
          </h3>
          {evolucaoAlunos.length > 0 ? (
            <EvolutionChart
              data={evolucaoAlunos.map(e => ({ name: e.mes, alunos: e.valor }))}
              lines={[{ dataKey: 'alunos', color: '#06b6d4', name: 'Alunos Ativos' }]}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-500">
              <p>Dados de evolução não disponíveis</p>
            </div>
          )}
        </div>

        {/* Funil Comercial */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            Funil Comercial (Mês)
          </h3>
          {funilComercial.length > 0 ? (
            <FunnelChart
              steps={funilComercial.map(f => ({ label: f.etapa, value: f.valor, color: f.cor }))}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-500">
              <p>Dados comerciais não disponíveis para este período</p>
            </div>
          )}
        </div>
      </div>

      {/* Resumo por Unidade */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Resumo por Unidade
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-sm border-b border-slate-700">
                <th className="pb-3">Unidade</th>
                <th className="pb-3 text-right">Alunos Ativos</th>
                <th className="pb-3 text-right">Pagantes</th>
                <th className="pb-3 text-right">Ticket Médio</th>
                <th className="pb-3 text-right">Faturamento Previsto</th>
              </tr>
            </thead>
            <tbody>
              {resumoUnidades.length > 0 ? resumoUnidades.map((d) => (
                <tr key={d.unidade_id} className="border-b border-slate-700/50">
                  <td className="py-3 text-white font-medium">{d.unidade}</td>
                  <td className="py-3 text-right text-gray-300">{d.alunos_ativos}</td>
                  <td className="py-3 text-right text-gray-300">{d.alunos_pagantes}</td>
                  <td className="py-3 text-right text-gray-300">
                    {formatCurrency(d.ticket_medio)}
                  </td>
                  <td className="py-3 text-right text-emerald-400 font-medium">
                    {formatCurrency(d.faturamento_previsto)}
                  </td>
                </tr>
              )) : (
                <tr className="border-b border-slate-700/50">
                  <td className="py-4 text-slate-400" colSpan={5}>
                    Sem fonte canonica disponivel para o periodo selecionado.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900/50">
                <td className="py-3 text-white font-bold">TOTAL</td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? resumoUnidades.reduce((acc, d) => acc + d.alunos_ativos, 0)
                    : 0}
                </td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? resumoUnidades.reduce((acc, d) => acc + d.alunos_pagantes, 0)
                    : 0}
                </td>
                <td className="py-3 text-right text-white font-bold">
                  {resumoUnidades.length > 0 
                    ? formatCurrency(
                        calcularTicketMedioCanonico(resumoUnidades.map(d => ({
                          mrr: d.mrr_atual ?? d.faturamento_previsto,
                          ticketMedio: d.ticket_medio,
                          ticketDenominadorPagantes: d.ticket_denominador_pagantes ?? null,
                          ticketDenominadorFaturas: d.ticket_denominador_faturas ?? null,
                        })))
                      )
                    : formatCurrency(0)}
                </td>
                <td className="py-3 text-right text-emerald-400 font-bold">
                  {resumoUnidades.length > 0 
                    ? formatCurrency(resumoUnidades.reduce((acc, d) => acc + d.faturamento_previsto, 0))
                    : formatCurrency(0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>


      {/* Modal Matrículas */}
      <ModalDetalheKPI
        open={modalMatriculas}
        onClose={() => setModalMatriculas(false)}
        titulo={`Matrículas (${labelPeriodo})`}
        descricao={`Alunos que se matricularam no período — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModalMatriculas}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data_matricula', label: 'Data Matrícula' },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'valor', label: 'Valor Parcela', render: (v: string) => <ValorParcela valor={v} /> },
        ]}
        carregando={carregandoModal}
        resumo={(() => {
          const total = dadosModalMatriculas.length;
          const comValor = dadosModalMatriculas.filter(d => d._valor_raw > 0);
          const somaValor = comValor.reduce((s, d) => s + d._valor_raw, 0);
          const ticketMedio = comValor.length > 0 ? somaValor / comValor.length : 0;
          const cursos = new Set(dadosModalMatriculas.map(d => d.curso).filter(c => c !== '—'));
          return [
            { label: 'Total', valor: total, icone: <UserPlus size={14} />, cor: 'text-sky-400', destaque: true },
            { label: 'Faturamento', valor: `R$ ${somaValor.toLocaleString('pt-BR')}`, icone: <DollarSign size={14} />, cor: 'text-emerald-400' },
            { label: 'Ticket Médio', valor: ticketMedio > 0 ? `R$ ${ticketMedio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—', icone: <TrendingUp size={14} />, cor: 'text-amber-400' },
            { label: 'Cursos', valor: cursos.size, icone: <GraduationCap size={14} />, cor: 'text-violet-400' },
          ];
        })()}
        distribuicao={unidade === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalMatriculas.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
            const cores: Record<string, string> = { 'Recreio': 'bg-violet-500/70', 'Barra': 'bg-amber-500/70', 'Campo Grande': 'bg-emerald-500/70' };
            return Object.entries(contagem)
              .sort((a, b) => b[1] - a[1])
              .map(([label, valor]) => ({ label, valor, cor: cores[label] || 'bg-slate-500/70' }));
          })(),
        } : undefined}
      />

      {/* Modal Evasões */}
      <ModalDetalheKPI
        open={modalEvasoes}
        onClose={() => setModalEvasoes(false)}
        titulo={`Evasões (${labelPeriodo})`}
        descricao={`Alunos que saíram no período — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModalEvasoes}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data_evasao', label: 'Data' },
          { key: 'tipo', label: 'Tipo', render: (_v: string, row: any) => <BadgeTipo tipo={row.tipo} variante={row._tipo_raw === 'evasao' ? 'evasao' : 'nao_renovacao'} /> },
          { key: 'motivo', label: 'Motivo' },
        ]}
        carregando={carregandoModal}
        resumo={(() => {
          const total = dadosModalEvasoes.length;
          const evasoes = dadosModalEvasoes.filter(d => d._tipo_raw === 'evasao').length;
          const naoRenov = dadosModalEvasoes.filter(d => d._tipo_raw === 'nao_renovacao').length;
          const motivoMap: Record<string, number> = {};
          dadosModalEvasoes.forEach(d => { if (d.motivo !== '—') motivoMap[d.motivo] = (motivoMap[d.motivo] || 0) + 1; });
          const topMotivo = Object.entries(motivoMap).sort((a, b) => b[1] - a[1])[0];
          return [
            { label: 'Total Saídas', valor: total, icone: <UserMinus size={14} />, cor: 'text-red-400', destaque: true },
            { label: 'Evasões', valor: evasoes, icone: <AlertTriangle size={14} />, cor: 'text-red-400' },
            { label: 'Não Renovações', valor: naoRenov, icone: <RefreshCw size={14} />, cor: 'text-orange-400' },
            { label: 'Top Motivo', valor: topMotivo ? `${topMotivo[0]} (${topMotivo[1]})` : '—', cor: 'text-slate-300' },
          ];
        })()}
        distribuicao={unidade === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalEvasoes.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
            const cores: Record<string, string> = { 'Recreio': 'bg-violet-500/70', 'Barra': 'bg-amber-500/70', 'Campo Grande': 'bg-emerald-500/70' };
            return Object.entries(contagem)
              .sort((a, b) => b[1] - a[1])
              .map(([label, valor]) => ({ label, valor, cor: cores[label] || 'bg-slate-500/70' }));
          })(),
        } : undefined}
      />

      {/* Modal Experimentais */}
      <ModalDetalheKPI
        open={modalExperimentais}
        onClose={() => setModalExperimentais(false)}
        titulo={`Experimentais Operacionais (${labelPeriodo})`}
        descricao={`Lista operacional/diagnóstica por status do funil. O card usa presença confirmada v2 — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
        dados={dadosModalExperimentais}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data', label: 'Data' },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'canal', label: 'Canal' },
          { key: 'status', label: 'Tipo', render: (v: string, row: any) => <BadgeTipo tipo={v} variante={row._status_raw === 'visita_escola' ? 'nao_renovacao' : 'evasao'} /> },
        ]}
        carregando={carregandoModal}
        resumo={(() => {
          const total = dadosModalExperimentais.length;
          const realizadas = dadosModalExperimentais.filter(d => d._status_raw !== 'visita_escola').length;
          const visitas = dadosModalExperimentais.filter(d => d._status_raw === 'visita_escola').length;
          const cursos = new Set(dadosModalExperimentais.map(d => d.curso).filter(c => c !== '—'));
          return [
            { label: 'Total', valor: total, icone: <Calendar size={14} />, cor: 'text-sky-400', destaque: true },
            { label: 'Operacionais', valor: realizadas, icone: <GraduationCap size={14} />, cor: 'text-emerald-400' },
            { label: 'Visitas', valor: visitas, icone: <Users size={14} />, cor: 'text-amber-400' },
            { label: 'Cursos', valor: cursos.size, icone: <Target size={14} />, cor: 'text-violet-400' },
          ];
        })()}
        distribuicao={unidade === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalExperimentais.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
            const cores: Record<string, string> = { 'Recreio': 'bg-violet-500/70', 'Barra': 'bg-amber-500/70', 'Campo Grande': 'bg-emerald-500/70' };
            return Object.entries(contagem)
              .sort((a, b) => b[1] - a[1])
              .map(([label, valor]) => ({ label, valor, cor: cores[label] || 'bg-slate-500/70' }));
          })(),
        } : undefined}
      />

      {/* Modal Taxa Conversão - v2 */}
      <ModalDetalheKPI
        open={modalConversao}
        onClose={() => setModalConversao(false)}
        titulo={
          taxaExpMatLiberada
            ? `Taxa Exp → Mat oficial (${labelPeriodo})`
            : taxaExpMatSemBase
              ? `Taxa Exp → Mat sem base (${labelPeriodo})`
              : `Taxa Exp → Mat bloqueada (${labelPeriodo})`
        }
        descricao={
          taxaExpMatLiberada
            ? `KPI canônico pela conciliação Emusys v2: conversões confirmadas / experimentais realizadas confirmadas.`
            : taxaExpMatSemBase
              ? `Competencia sem experimentais confirmadas no denominador e sem pendencias de conciliacao.`
              : `Diagnóstico: não usar como KPI oficial até fechar vínculo lead → aluno → presença experimental individual.`
        }
        dados={dadosModalConversao}
        colunas={[
          { key: 'nome', label: 'Aluno' },
          { key: 'unidade', label: 'Unidade', render: (v: string) => <BadgeUnidade nome={v} /> },
          { key: 'data_exp', label: 'Data Exp.' },
          { key: 'data_matr', label: 'Data Matrícula' },
          { key: 'curso', label: 'Curso', render: (v: string) => <TextoCurso nome={v} /> },
          { key: 'canal', label: 'Canal' },
          { key: 'resultado', label: 'Resultado', render: (v: string, row: any) => (
            <BadgeTipo tipo={v} variante={row._matriculou ? 'nao_renovacao' : 'evasao'} />
          ) },
        ]}
        carregando={carregandoModal}
        resumo={(() => {
          const total = dadosModalConversao.length;
          const matriculou = dadosModalConversao.filter(d => d._matriculou).length;
          const naoMatriculou = total - matriculou;
          const taxaLiberada = dadosComercial?.taxa_exp_mat_liberada === true;
          const semBase = Boolean(
            dadosComercial &&
              !taxaLiberada &&
              (dadosComercial.denominador_exp_mat ?? 0) === 0 &&
              (dadosComercial.pendencias_exp_mat ?? 0) === 0,
          );
          return [
            {
              label: taxaLiberada ? 'Denominador v2' : 'Exp. diagnóstico',
              valor: taxaLiberada || semBase ? dadosComercial?.denominador_exp_mat ?? 0 : total,
              icone: <Calendar size={14} />,
              cor: 'text-sky-400',
              destaque: true,
            },
            {
              label: taxaLiberada ? 'Conversões confirmadas' : 'Matricularam',
              valor: taxaLiberada || semBase ? dadosComercial?.conversoes_exp_mat ?? 0 : matriculou,
              icone: <GraduationCap size={14} />,
              cor: 'text-emerald-400',
            },
            {
              label: taxaLiberada ? 'Pendências' : 'Não Matricularam',
              valor: taxaLiberada || semBase ? dadosComercial?.pendencias_exp_mat ?? 0 : naoMatriculou,
              icone: <Users size={14} />,
              cor: taxaLiberada || semBase ? 'text-slate-300' : 'text-amber-400',
            },
            {
              label: 'Taxa oficial',
              valor: taxaLiberada ? `${(dadosComercial?.taxa_conversao ?? 0).toFixed(1)}%` : semBase ? 'Sem base' : 'Bloqueada',
              icone: <Percent size={14} />,
              cor: taxaLiberada ? 'text-emerald-400' : semBase ? 'text-slate-300' : 'text-yellow-300',
            },
          ];
        })()}
        distribuicao={unidade === 'todos' ? {
          titulo: 'Por Unidade',
          dados: (() => {
            const contagem: Record<string, number> = {};
            dadosModalConversao.forEach(d => { contagem[d.unidade] = (contagem[d.unidade] || 0) + 1; });
            const cores: Record<string, string> = { 'Recreio': 'bg-violet-500/70', 'Barra': 'bg-amber-500/70', 'Campo Grande': 'bg-emerald-500/70' };
            return Object.entries(contagem)
              .sort((a, b) => b[1] - a[1])
              .map(([label, valor]) => ({ label, valor, cor: cores[label] || 'bg-slate-500/70' }));
          })(),
        } : undefined}
      />
    </div>
  );
}


export default DashboardPage;
