import { 
  MoreHorizontal,
  Plus,
  Calendar
} from 'lucide-react';

interface KanbanViewProps {
  unidadeSelecionada: string;
}

// Dados mockados para demonstração - serão substituídos por dados reais na Fase 4
const mockColunas = [
  {
    id: 'planejamento',
    titulo: 'Planejamento',
    cor: 'bg-violet-500',
    projetos: [
      { id: 1, tipo: 'conteudo', tipoLabel: 'Conteúdo', titulo: 'Conteúdo Instagram Fev/2026', progresso: 15, tarefas: '3/20', equipe: ['M'], prazo: '28 Fev', prazoStatus: 'normal' },
      { id: 2, tipo: 'recital', tipoLabel: 'Recital', titulo: 'Recital EMLA - Junho 2026', progresso: 5, tarefas: '1/20', equipe: ['J'], prazo: '15 Jun', prazoStatus: 'normal' },
    ]
  },
  {
    id: 'em_andamento',
    titulo: 'Em Andamento',
    cor: 'bg-blue-500',
    projetos: [
      { id: 3, tipo: 'semana', tipoLabel: 'Semana', titulo: 'Semana do Baterista 2026', progresso: 70, tarefas: '14/20', equipe: ['J', 'Q'], prazo: '10 Fev', prazoStatus: 'alerta' },
      { id: 4, tipo: 'recital', tipoLabel: 'Recital', titulo: 'Recital Kids - Março 2026', progresso: 45, tarefas: '9/20', equipe: ['Q', 'R', 'M'], prazo: 'Atrasado', prazoStatus: 'urgente' },
      { id: 5, tipo: 'show', tipoLabel: 'Show', titulo: 'Show das Bandas - Abril', progresso: 35, tarefas: '7/20', equipe: ['J'], prazo: '20 Abr', prazoStatus: 'normal' },
    ]
  },
  {
    id: 'em_revisao',
    titulo: 'Em Revisão',
    cor: 'bg-amber-500',
    projetos: [
      { id: 6, tipo: 'material', tipoLabel: 'Material', titulo: 'Apostila Violão Nível 2', progresso: 90, tarefas: '18/20', equipe: ['J', 'P'], prazo: '20 Fev', prazoStatus: 'normal' },
    ]
  },
  {
    id: 'concluido',
    titulo: 'Concluído',
    cor: 'bg-emerald-500',
    projetos: [
      { id: 7, tipo: 'conteudo', tipoLabel: 'Conteúdo', titulo: 'Conteúdo Instagram Jan/2026', progresso: 100, tarefas: '20/20', equipe: ['M'], prazo: 'Concluído', prazoStatus: 'concluido' },
    ]
  },
];

const tipoColors: Record<string, { bg: string; text: string }> = {
  semana: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
  recital: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
  conteudo: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  material: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  show: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
};

const avatarColors = [
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-pink-500',
  'from-cyan-500 to-blue-500',
  'from-amber-500 to-orange-500',
];

export function KanbanView({ unidadeSelecionada }: KanbanViewProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-320px)]">
      {mockColunas.map((coluna) => (
        <div 
          key={coluna.id}
          className="flex-shrink-0 w-80 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col max-h-[calc(100vh-320px)]"
        >
          {/* Header da Coluna */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${coluna.cor}`} />
              <span className="font-semibold text-white text-sm">{coluna.titulo}</span>
              <span className="px-2 py-0.5 bg-slate-800 rounded-full text-xs text-slate-400">
                {coluna.projetos.length}
              </span>
            </div>
            {coluna.id !== 'concluido' && (
              <button className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Cards */}
          <div className="flex-1 p-3 space-y-3 overflow-y-auto">
            {coluna.projetos.map((projeto) => {
              const tipoStyle = tipoColors[projeto.tipo] || tipoColors.conteudo;
              
              return (
                <div 
                  key={projeto.id}
                  className={`
                    bg-slate-800/50 border border-slate-700 rounded-xl p-4 cursor-pointer
                    hover:border-slate-600 hover:-translate-y-0.5 hover:shadow-lg transition-all
                    ${coluna.id === 'concluido' ? 'opacity-70' : ''}
                  `}
                >
                  {/* Header do Card */}
                  <div className="flex items-start justify-between mb-3">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded ${tipoStyle.bg} ${tipoStyle.text}`}>
                      {projeto.tipoLabel}
                    </span>
                    <button className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-white transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Título */}
                  <h4 className="font-semibold text-white text-sm mb-3 line-clamp-2">
                    {projeto.titulo}
                  </h4>

                  {/* Progresso */}
                  <div className="mb-3">
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-1">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all"
                        style={{ width: `${projeto.progresso}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400">{projeto.tarefas} tarefas</span>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    {/* Equipe */}
                    <div className="flex -space-x-1.5">
                      {projeto.equipe.map((inicial, i) => (
                        <div
                          key={i}
                          className={`w-6 h-6 rounded-md bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-white text-[10px] font-bold border-2 border-slate-800`}
                        >
                          {inicial}
                        </div>
                      ))}
                    </div>

                    {/* Prazo */}
                    <span className={`text-[11px] flex items-center gap-1 ${
                      projeto.prazoStatus === 'urgente' 
                        ? 'text-rose-400' 
                        : projeto.prazoStatus === 'alerta' 
                          ? 'text-amber-400' 
                          : projeto.prazoStatus === 'concluido'
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                    }`}>
                      {projeto.prazoStatus === 'urgente' ? '⚠️' : projeto.prazoStatus === 'concluido' ? '✓' : <Calendar className="w-3 h-3" />}
                      {projeto.prazo}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default KanbanView;
