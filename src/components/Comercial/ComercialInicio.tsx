import { TrendingUp, Users, Target, ArrowRight, BarChart3 } from 'lucide-react';

interface ComercialInicioProps {
  onStart: () => void;
}

export function ComercialInicio({ onStart }: ComercialInicioProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Logos */}
        <div className="flex items-center gap-4 mb-8">
          <img 
            src="/logo-la-music-school.png" 
            alt="LA Music School" 
            className="h-12 w-auto"
          />
          <img 
            src="/logo-la-music-kids.png" 
            alt="LA Music Kids" 
            className="h-12 w-auto"
          />
        </div>

        {/* Título */}
        <h1 className="text-5xl md:text-7xl font-bold text-center mb-4">
          <span className="text-white">INDICADORES DE</span>{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
            MATRÍCULAS
          </span>
        </h1>

        <div className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 mb-6">
          2025
        </div>

        <p className="text-xl text-gray-400 text-center mb-12 max-w-2xl">
          Do Lead à Matrícula: Análise Completa da Jornada Comercial
        </p>

        {/* KPIs Destaque */}
        <div className="flex flex-wrap justify-center gap-6 mb-12">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 text-center min-w-[180px] hover:border-emerald-500/30 transition-all">
            <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
            <div className="text-3xl font-bold text-white">7.123</div>
            <div className="text-sm text-gray-400">Leads Gerados</div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 text-center min-w-[180px] hover:border-cyan-500/30 transition-all">
            <Users className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
            <div className="text-3xl font-bold text-white">847</div>
            <div className="text-sm text-gray-400">Aulas Experimentais</div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 text-center min-w-[180px] hover:border-green-500/30 transition-all">
            <Target className="w-8 h-8 text-green-400 mx-auto mb-3" />
            <div className="text-3xl font-bold text-white">571</div>
            <div className="text-sm text-gray-400">Novas Matrículas</div>
          </div>
        </div>

        {/* Badge */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-full px-6 py-2 mb-8">
          <span className="text-emerald-400 font-medium inline-flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" /> Análise de Performance Comercial
          </span>
        </div>

        {/* Botão CTA */}
        <button
          onClick={onStart}
          className="group bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 
                     text-white font-semibold text-lg px-8 py-4 rounded-xl
                     shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40
                     transition-all duration-300 flex items-center gap-3"
        >
          Começar Apresentação
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Taxa de conversão */}
        <div className="mt-8 text-center">
          <div className="text-4xl font-bold text-emerald-400">8,0%</div>
          <div className="text-sm text-gray-500">Taxa de Conversão Total</div>
        </div>
      </div>
    </div>
  );
}

export default ComercialInicio;
