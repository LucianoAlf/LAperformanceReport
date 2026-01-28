import { 
  FolderKanban, 
  AlertTriangle, 
  CheckSquare, 
  TrendingUp,
  Calendar,
  ChevronRight,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { 
  useProjetosStats, 
  useProximosPrazos, 
  useProjetosAlertas,
  useFabioSugestoes 
} from '../../../../hooks/useProjetos';

interface DashboardViewProps {
  unidadeSelecionada: string;
}

// Formatar data para exibição
function formatarData(dataISO: string) {
  const data = new Date(dataISO);
  const dia = data.getDate().toString().padStart(2, '0');
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const mes = meses[data.getMonth()];
  return { dia, mes };
}

export function DashboardView({ unidadeSelecionada }: DashboardViewProps) {
  // Hooks com dados reais do Supabase
  const { stats, loading: loadingStats } = useProjetosStats(unidadeSelecionada);
  const { data: proximosPrazos, loading: loadingPrazos } = useProximosPrazos(unidadeSelecionada, 4);
  const { data: alertas, loading: loadingAlertas } = useProjetosAlertas(unidadeSelecionada);
  const { data: sugestoes } = useFabioSugestoes(unidadeSelecionada);

  // Combinar alertas e sugestões do Fábio
  const todosAlertas = [...alertas, ...sugestoes].slice(0, 5);

  // Calcular total para barra de progresso
  const total = stats.por_status.planejamento + stats.por_status.em_andamento + stats.por_status.em_revisao + stats.por_status.concluido || 1;

  // Loading state
  const isLoading = loadingStats || loadingPrazos || loadingAlertas;
  
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Projetos Ativos */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-cyan-500/20">
              <FolderKanban className="w-5 h-5 text-cyan-400" />
            </div>
            {stats.total_ativos > 0 && (
              <span className="text-xs font-medium text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-full flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {stats.total_ativos}
              </span>
            )}
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {loadingStats ? <Loader2 className="w-6 h-6 animate-spin" /> : stats.total_ativos}
          </div>
          <div className="text-sm text-slate-400">Projetos Ativos</div>
        </div>

        {/* Projetos Atrasados */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-rose-500/20">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {loadingStats ? <Loader2 className="w-6 h-6 animate-spin" /> : stats.total_atrasados}
          </div>
          <div className="text-sm text-slate-400">Projetos Atrasados</div>
        </div>

        {/* Tarefas Pendentes */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-amber-500/20">
              <CheckSquare className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {loadingStats ? <Loader2 className="w-6 h-6 animate-spin" /> : stats.total_tarefas_pendentes}
          </div>
          <div className="text-sm text-slate-400">Tarefas Pendentes</div>
        </div>

        {/* Taxa de Conclusão */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            {stats.taxa_conclusao > 0 && (
              <span className="text-xs font-medium text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-full flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {stats.taxa_conclusao}%
              </span>
            )}
          </div>
          <div className="text-3xl font-bold text-white mb-1">
            {loadingStats ? <Loader2 className="w-6 h-6 animate-spin" /> : `${stats.taxa_conclusao}%`}
          </div>
          <div className="text-sm text-slate-400">Taxa de Conclusão</div>
        </div>
      </div>

      {/* Seções do Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos Prazos */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-800">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-violet-400" />
              Próximos Prazos
            </h2>
            <button className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
              Ver todos <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-slate-800">
            {loadingPrazos ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
              </div>
            ) : proximosPrazos.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                Nenhum prazo próximo
              </div>
            ) : (
              proximosPrazos.map((prazo) => {
                const { dia, mes } = formatarData(prazo.data_prazo);
                return (
                  <div key={prazo.id} className="flex items-center gap-4 p-4 hover:bg-slate-800/30 transition-colors cursor-pointer">
                    <div className={`
                      w-14 h-14 rounded-lg flex flex-col items-center justify-center text-center
                      ${prazo.urgencia === 'urgente' 
                        ? 'bg-rose-500/20 text-rose-400' 
                        : prazo.urgencia === 'alerta' 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : 'bg-slate-700/50 text-slate-300'
                      }
                    `}>
                      <span className="text-lg font-bold leading-none">{dia}</span>
                      <span className="text-[10px] uppercase">{mes}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{prazo.titulo}</div>
                      <div className="text-sm text-slate-400 truncate">{prazo.projeto_titulo}</div>
                    </div>
                    {prazo.responsavel_iniciais && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                        {prazo.responsavel_iniciais}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Coluna Direita */}
        <div className="space-y-6">
          {/* Status dos Projetos */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-violet-400" />
                Status dos Projetos
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Barra de Progresso */}
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden flex">
                <div 
                  className="bg-violet-500 transition-all" 
                  style={{ width: `${(stats.por_status.planejamento / total) * 100}%` }} 
                />
                <div 
                  className="bg-blue-500 transition-all" 
                  style={{ width: `${(stats.por_status.em_andamento / total) * 100}%` }} 
                />
                <div 
                  className="bg-amber-500 transition-all" 
                  style={{ width: `${(stats.por_status.em_revisao / total) * 100}%` }} 
                />
                <div 
                  className="bg-emerald-500 transition-all" 
                  style={{ width: `${(stats.por_status.concluido / total) * 100}%` }} 
                />
              </div>

              {/* Legenda */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded bg-violet-500" />
                  <span className="text-slate-400">Planejamento</span>
                  <span className="font-semibold text-white">{stats.por_status.planejamento}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded bg-blue-500" />
                  <span className="text-slate-400">Em Andamento</span>
                  <span className="font-semibold text-white">{stats.por_status.em_andamento}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded bg-amber-500" />
                  <span className="text-slate-400">Em Revisão</span>
                  <span className="font-semibold text-white">{stats.por_status.em_revisao}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded bg-emerald-500" />
                  <span className="text-slate-400">Concluído</span>
                  <span className="font-semibold text-white">{stats.por_status.concluido}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Alertas */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-violet-400" />
                Alertas
              </h2>
            </div>
            <div className="p-3 space-y-2">
              {loadingAlertas ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                </div>
              ) : todosAlertas.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">
                  ✅ Nenhum alerta no momento
                </div>
              ) : (
                todosAlertas.map((alerta) => (
                  <div 
                    key={alerta.id}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg border-l-[3px]
                      ${alerta.tipo === 'danger' 
                        ? 'bg-rose-500/10 border-l-rose-500' 
                        : alerta.tipo === 'warning' 
                          ? 'bg-amber-500/10 border-l-amber-500' 
                          : 'bg-blue-500/10 border-l-blue-500'
                      }
                    `}
                  >
                    <span className="text-lg">
                      {alerta.tipo === 'danger' ? '🔴' : alerta.tipo === 'warning' ? '🟡' : '💬'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white text-sm">{alerta.titulo}</div>
                      <div className="text-xs text-slate-400">{alerta.descricao}</div>
                    </div>
                    <span className="text-xs text-slate-500">{alerta.tempo}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardView;
