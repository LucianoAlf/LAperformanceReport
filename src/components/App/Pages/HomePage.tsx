import { Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Presentation, 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  ArrowRight
} from 'lucide-react';

export function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Logos */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <img 
            src="/logo-la-music-school.png" 
            alt="LA Music School" 
            className="h-16 w-auto"
          />
          <img 
            src="/logo-la-music-kids.png" 
            alt="LA Music Kids" 
            className="h-16 w-auto"
          />
        </div>

        {/* Título */}
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
          LA <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Performance</span> Report
        </h1>
        <p className="text-xl text-gray-400 mb-12">
          Sistema de Gestão de KPIs e Metas
        </p>

        {/* Cards de acesso */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Sistema 2026 */}
          <Link
            to="/app"
            className="group bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl p-8 hover:border-cyan-500/50 transition-all text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <LayoutDashboard className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Sistema 2026</h2>
            <p className="text-gray-400 mb-4">
              Dashboard em tempo real, entrada de dados, relatórios e gestão de metas.
            </p>
            <div className="flex items-center gap-2 text-cyan-400 font-medium">
              Acessar <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Apresentações */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl p-8 text-left">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 flex items-center justify-center mb-4">
              <Presentation className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Apresentações</h2>
            <p className="text-gray-400 mb-4">
              Análises históricas e benchmarks de performance.
            </p>
            
            <div className="space-y-2">
              <Link
                to="/apresentacao/gestao"
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
              >
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                <span className="text-white font-medium">Gestão 2025</span>
              </Link>
              <Link
                to="/apresentacao/comercial"
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
              >
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <span className="text-white font-medium">Comercial 2025</span>
              </Link>
              <Link
                to="/apresentacao/retencao"
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
              >
                <TrendingDown className="w-5 h-5 text-rose-400" />
                <span className="text-white font-medium">Retenção 2025</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-12 text-sm text-gray-600">
          © 2026 LA Music School. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

export default HomePage;
