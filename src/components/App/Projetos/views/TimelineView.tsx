interface TimelineViewProps {
  unidadeSelecionada: string;
}

// Dados mockados para demonstração - serão substituídos por dados reais na Fase 5
const mockProjetos = [
  { id: 1, icone: '🥁', titulo: 'Semana do Baterista', tipo: 'Semana Temática', status: 'em_andamento', inicio: 5, duracao: 20, corBarra: 'from-blue-500 to-cyan-500' },
  { id: 2, icone: '🎤', titulo: 'Recital Kids - Março', tipo: 'Recital', status: 'planejamento', inicio: 0, duracao: 45, corBarra: 'from-violet-500 to-violet-400' },
  { id: 3, icone: '📱', titulo: 'Conteúdo Fev/2026', tipo: 'Produção de Conteúdo', status: 'planejamento', inicio: 20, duracao: 18, corBarra: 'from-violet-500 to-violet-400' },
  { id: 4, icone: '📚', titulo: 'Apostila Violão Nível 2', tipo: 'Material Didático', status: 'em_revisao', inicio: 10, duracao: 15, corBarra: 'from-amber-500 to-amber-400' },
  { id: 5, icone: '🎸', titulo: 'Show das Bandas - Abril', tipo: 'Show', status: 'em_andamento', inicio: 25, duracao: 55, corBarra: 'from-blue-500 to-cyan-500' },
];

const meses = [
  { nome: 'Janeiro 2026', semanas: ['S1', 'S2', 'S3', 'S4'] },
  { nome: 'Fevereiro 2026', semanas: ['S1', 'S2', 'S3', 'S4'] },
  { nome: 'Março 2026', semanas: ['S1', 'S2', 'S3', 'S4'] },
  { nome: 'Abril 2026', semanas: ['S1', 'S2', 'S3', 'S4'] },
];

const tipoIconColors: Record<string, string> = {
  'Semana Temática': 'bg-violet-500/20',
  'Recital': 'bg-pink-500/20',
  'Produção de Conteúdo': 'bg-cyan-500/20',
  'Material Didático': 'bg-emerald-500/20',
  'Show': 'bg-amber-500/20',
};

export function TimelineView({ unidadeSelecionada }: TimelineViewProps) {
  const totalSemanas = meses.length * 4; // 16 semanas

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex border-b border-slate-800">
        {/* Sidebar Header */}
        <div className="w-72 flex-shrink-0 p-4 bg-slate-800/50 border-r border-slate-800">
          <span className="font-semibold text-white text-sm">Projetos</span>
        </div>

        {/* Meses */}
        <div className="flex-1 flex">
          {meses.map((mes, i) => (
            <div key={i} className="flex-1 border-r border-slate-800 last:border-r-0">
              <div className="text-center py-2 border-b border-slate-800 bg-slate-800/50">
                <span className="font-semibold text-white text-sm">{mes.nome}</span>
              </div>
              <div className="flex">
                {mes.semanas.map((semana, j) => (
                  <div key={j} className="flex-1 text-center py-1.5 text-xs text-slate-500">
                    {semana}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[500px] overflow-y-auto">
        {mockProjetos.map((projeto) => (
          <div key={projeto.id} className="flex border-b border-slate-800 last:border-b-0 min-h-[60px]">
            {/* Info do Projeto */}
            <div className="w-72 flex-shrink-0 p-3 border-r border-slate-800 flex items-center gap-3 bg-slate-900/30">
              <div className={`w-8 h-8 rounded-lg ${tipoIconColors[projeto.tipo] || 'bg-slate-700'} flex items-center justify-center text-sm`}>
                {projeto.icone}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-white text-sm truncate">{projeto.titulo}</div>
                <div className="text-xs text-slate-500 truncate">{projeto.tipo}</div>
              </div>
            </div>

            {/* Barra de Timeline */}
            <div 
              className="flex-1 relative"
              style={{
                background: `repeating-linear-gradient(
                  90deg,
                  transparent,
                  transparent calc(${100 / totalSemanas}% - 1px),
                  rgb(51 65 85 / 0.3) calc(${100 / totalSemanas}% - 1px),
                  rgb(51 65 85 / 0.3) ${100 / totalSemanas}%
                )`
              }}
            >
              <div
                className={`
                  absolute top-1/2 -translate-y-1/2 h-7 rounded-md
                  bg-gradient-to-r ${projeto.corBarra}
                  flex items-center px-2.5 text-[11px] font-semibold text-white
                  cursor-pointer hover:brightness-110 hover:scale-[1.02] transition-all
                  truncate
                `}
                style={{
                  left: `${(projeto.inicio / totalSemanas) * 100}%`,
                  width: `${(projeto.duracao / totalSemanas) * 100}%`,
                }}
              >
                {projeto.titulo}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TimelineView;
