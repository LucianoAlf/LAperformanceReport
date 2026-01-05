
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Home, BarChart3, TrendingUp, Building2, GitCompare, Calendar, 
  Target, MessageCircleQuestion, AlertTriangle, Rocket, Lightbulb, 
  Heart, Moon, Sun, ChevronUp, ChevronDown, ArrowRight,
  Users, UserPlus, UserMinus, Percent, Receipt, Clock, ShieldCheck,
  CheckCircle2, XCircle
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Sector, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Theme, MetricType, UnitData, Meta2026 } from './types';
import { UNITS, HISTORY_DATA, DISTRIBUTION_DATA, THEME_COLORS, MONTHS } from './constants';

// --- Helper Components ---

// Fix: Make children optional to resolve 'Property children is missing' errors
const Badge = ({ children, variant = 'info' }: { children?: React.ReactNode, variant?: string }) => {
  const styles: Record<string, string> = {
    info: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30',
    success: 'bg-accent-green/20 text-accent-green border-accent-green/30',
    danger: 'bg-accent-pink/20 text-accent-pink border-accent-pink/30',
    warning: 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${styles[variant]}`}>
      {children}
    </span>
  );
};

// Fix: Make children optional to resolve 'Property children is missing' errors
const Card = ({ children, className = "", title, icon: Icon, trend, trendValue }: { children?: React.ReactNode, className?: string, title?: string, icon?: any, trend?: 'up' | 'down', trendValue?: string }) => (
  <div className={`bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl p-6 transition-all hover:-translate-y-1 hover:border-accent-cyan/30 shadow-lg ${className}`}>
    {(title || Icon) && (
      <div className="flex items-center justify-between mb-4">
        {Icon && (
          <div className="w-12 h-12 flex items-center justify-center bg-slate-700/50 rounded-xl text-accent-cyan">
            <Icon size={24} />
          </div>
        )}
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-bold ${trend === 'up' ? 'text-accent-green' : 'text-accent-pink'}`}>
            {trend === 'up' ? <TrendingUp size={16} /> : <TrendingUp size={16} className="rotate-180" />}
            {trendValue}
          </div>
        )}
      </div>
    )}
    {children}
  </div>
);

const NegativeMetricCard = ({ children, className = "", title, icon: Icon, trend, trendValue }: { children?: React.ReactNode, className?: string, title?: string, icon?: any, trend?: 'up' | 'down', trendValue?: string }) => (
  <div className={`bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl p-6 transition-all hover:-translate-y-1 hover:border-accent-cyan/30 shadow-lg ${className}`}>
    {(title || Icon) && (
      <div className="flex items-center justify-between mb-4">
        {Icon && (
          <div className="w-12 h-12 flex items-center justify-center bg-slate-700/50 rounded-xl text-accent-cyan">
            <Icon size={24} />
          </div>
        )}
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-bold ${trend === 'up' ? 'text-accent-pink' : 'text-accent-green'}`}>
            {trend === 'up' ? <TrendingUp size={16} /> : <TrendingUp size={16} className="rotate-180" />}
            {trendValue}
          </div>
        )}
      </div>
    )}
    {children}
  </div>
);

const MetaIndicator = ({ 
  current, 
  meta, 
  isNegativeMetric = false,
  format = 'number',
  showProgress = false
}: { 
  current: number, 
  meta: number, 
  isNegativeMetric?: boolean,
  format?: 'number' | 'percentage' | 'currency' | 'months',
  showProgress?: boolean
}) => {
  const gap = isNegativeMetric ? meta - current : current - meta;
  const percentAchieved = isNegativeMetric 
    ? Math.min((meta / current) * 100, 100)
    : (current / meta) * 100;
  
  const isAchieved = isNegativeMetric ? current <= meta : current >= meta;
  const isClose = !isAchieved && percentAchieved >= 85;
  
  const formatValue = (value: number) => {
    switch(format) {
      case 'percentage': return `${value.toFixed(1)}%`;
      case 'currency': return `R$ ${value.toFixed(0)}`;
      case 'months': return `${value}m`;
      default: return value.toLocaleString('pt-BR');
    }
  };
  
  const statusColor = isAchieved ? 'text-accent-green' : isClose ? 'text-accent-yellow' : 'text-accent-pink';
  const statusIcon = isAchieved ? <CheckCircle2 size={12} /> : <XCircle size={12} />;
  
  return (
    <div className="mt-3 pt-3 border-t border-slate-700/50">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">
          Meta: <span className="text-slate-300 font-semibold">{formatValue(meta)}</span>
        </span>
        <div className={`flex items-center gap-1 font-bold ${statusColor}`}>
          {statusIcon}
          <span>
            {isNegativeMetric ? (gap > 0 ? `+${formatValue(Math.abs(gap))}` : formatValue(Math.abs(gap))) : (gap >= 0 ? `+${formatValue(gap)}` : formatValue(gap))}
          </span>
          <span className="text-slate-500">|</span>
          <span>{percentAchieved.toFixed(0)}%</span>
        </div>
      </div>
      {showProgress && (
        <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-1000 ${isAchieved ? 'bg-accent-green' : isClose ? 'bg-accent-yellow' : 'bg-accent-pink'}`}
            style={{ width: `${Math.min(percentAchieved, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};

const SectionHeader = ({ badge, title, subtitle, icon: Icon }: { badge: string, title: string, subtitle: string, icon: any }) => (
  <div className="mb-10">
    <Badge><Icon size={14} /> {badge}</Badge>
    <h2 className="text-4xl lg:text-5xl font-grotesk font-bold mt-4 mb-2 bg-gradient-to-r from-slate-50 to-accent-cyan bg-clip-text text-transparent">
      {title}
    </h2>
    <p className="text-lg text-slate-400">{subtitle}</p>
  </div>
);

const RankingCard = ({ pos, name, value, label, colorClass }: { pos: number, name: string, value: string, label?: string, colorClass: string }) => {
  const medalStyles = {
    1: 'bg-gradient-to-br from-[#FFD700] via-[#FFFACD] to-[#DAA520] text-yellow-950 shadow-lg shadow-yellow-500/40 border border-yellow-200/50',
    2: 'bg-gradient-to-br from-[#C0C0C0] via-[#F8F8F8] to-[#808080] text-slate-800 shadow-lg shadow-slate-400/30 border border-slate-100/50',
    3: 'bg-gradient-to-br from-[#CD7F32] via-[#E6B8A2] to-[#8B4513] text-white shadow-lg shadow-orange-900/30 border border-orange-300/50'
  };
  
  return (
    <div className="flex items-center gap-4 p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl mb-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black ${medalStyles[pos as keyof typeof medalStyles]}`}>
        {pos}
      </div>
      <div className="flex-1">
        <div className="font-bold text-slate-200">{name}</div>
        {label && <div className="text-xs text-slate-400">{label}</div>}
      </div>
      <div className={`text-2xl font-grotesk font-bold ${colorClass}`}>
        {value}
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border-2 border-slate-600 rounded-xl px-4 py-3 shadow-2xl">
        <p className="text-white font-bold text-base">{payload[0].name}</p>
        <p className="text-accent-cyan font-semibold text-lg mt-1">{payload[0].value} alunos</p>
      </div>
    );
  }
  return null;
};

const DistributionTooltip = ({ active, payload, metric }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    let formattedValue = '';
    
    switch(metric) {
      case 'faturamento':
        formattedValue = `R$ ${(value / 1000).toFixed(0)}k`;
        break;
      case 'alunos':
        formattedValue = `${value} alunos`;
        break;
      case 'matriculas':
        formattedValue = `${value} matrículas`;
        break;
      case 'evasoes':
        formattedValue = `${value} evasões`;
        break;
      default:
        formattedValue = `${value}`;
    }
    
    return (
      <div className="bg-slate-900 border-2 border-slate-600 rounded-xl px-4 py-3 shadow-2xl">
        <p className="text-white font-bold text-base">{payload[0].name}</p>
        <p className="text-accent-cyan font-semibold text-lg mt-1">{formattedValue}</p>
      </div>
    );
  }
  return null;
};

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

// --- Main App Component ---

export default function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeSection, setActiveSection] = useState('cover');
  const [unitTab, setUnitTab] = useState('cg');
  const [evolutionMetric, setEvolutionMetric] = useState<MetricType>('alunos');
  const [selectedUnit, setSelectedUnit] = useState('cg');
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const [overviewYear, setOverviewYear] = useState<2023 | 2024 | 2025>(2025);
  const [overviewUnit, setOverviewUnit] = useState<'consolidado' | 'cg' | 'recreio' | 'barra'>('consolidado');
  const [distributionYear, setDistributionYear] = useState<'2023' | '2024' | '2025'>('2025');
  const [distributionMetric, setDistributionMetric] = useState<'alunos' | 'matriculas' | 'evasoes' | 'faturamento'>('alunos');
  const [metas2026, setMetas2026] = useState<Record<string, Meta2026>>({
    cg: { alunos: 500, churn: '4%', renovacao: '90%', ticket: 'R$ 395', matriculas: 30, inadimplencia: '< 1,5%', faturamento: 'R$ 200.000' },
    recreio: { alunos: 400, churn: '4%', renovacao: '90%', ticket: 'R$ 455', matriculas: 25, inadimplencia: '< 1,5%', faturamento: 'R$ 180.000' },
    barra: { alunos: 280, churn: '4%', renovacao: '90%', ticket: 'R$ 465', matriculas: 20, inadimplencia: '< 1,5%', faturamento: 'R$ 130.000' },
  });

  const sections = [
    { id: 'cover', label: 'Início', icon: Home },
    { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
    { id: 'evolution', label: 'Evolução 2023-2025', icon: TrendingUp },
    { id: 'units', label: 'Análise por Unidade', icon: Building2 },
    { id: 'comparison', label: 'Comparativo', icon: GitCompare },
    { id: 'seasonality', label: 'Sazonalidade', icon: Calendar },
    { id: 'goals2025', label: 'Metas 2025', icon: Target },
    { id: 'reflections', label: 'Reflexões', icon: MessageCircleQuestion },
    { id: 'alerts', label: 'Alertas e Insights', icon: AlertTriangle },
    { id: 'goals2026', label: 'Metas 2026', icon: Rocket },
    { id: 'learnings', label: 'Aprendizados', icon: Lightbulb },
    { id: 'closing', label: 'Encerramento', icon: Heart },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setActiveSection(entry.target.id);
      });
    }, { threshold: 0.5 });
    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const updateMeta = (unit: string, field: keyof Meta2026, value: string | number) => {
    setMetas2026(prev => ({
      ...prev,
      [unit]: { ...prev[unit], [field]: value }
    }));
  };

  // Fix: Explicitly cast to Meta2026[] and provide types to reduce to solve 'unknown' operator issues
  const totalAlunos2026 = (Object.values(metas2026) as Meta2026[]).reduce((acc: number, m: Meta2026) => acc + Number(m.alunos), 0);

  // Dados históricos completos para Visão Geral
  const historicalData = {
    consolidado: {
      2023: { alunos: 687, matriculas: 436, evasoes: 409, churn: 5.4, renovacao: null, ticket: 369, permanencia: null, inadimplencia: null },
      2024: { alunos: 970, matriculas: 688, evasoes: 449, churn: 4.8, renovacao: null, ticket: 399, permanencia: null, inadimplencia: null },
      2025: { alunos: 935, matriculas: 602, evasoes: 612, churn: 5.27, renovacao: 83.6, ticket: 414, permanencia: 16, inadimplencia: 0.81 }
    },
    cg: {
      2023: { alunos: 321, matriculas: 194, evasoes: 208, churn: 5.1, renovacao: null, ticket: 312, permanencia: null, inadimplencia: null },
      2024: { alunos: 463, matriculas: 323, evasoes: 213, churn: 4.6, renovacao: null, ticket: 345, permanencia: null, inadimplencia: null },
      2025: { alunos: 417, matriculas: 271, evasoes: 288, churn: 5.89, renovacao: 76.58, ticket: 375, permanencia: 19, inadimplencia: 0.85 }
    },
    recreio: {
      2023: { alunos: 219, matriculas: 118, evasoes: 127, churn: 4.5, renovacao: null, ticket: 388, permanencia: null, inadimplencia: null },
      2024: { alunos: 295, matriculas: 187, evasoes: 117, churn: 3.9, renovacao: null, ticket: 418, permanencia: null, inadimplencia: null },
      2025: { alunos: 297, matriculas: 189, evasoes: 189, churn: 5.01, renovacao: 87.04, ticket: 430, permanencia: 15, inadimplencia: 1.10 }
    },
    barra: {
      2023: { alunos: 147, matriculas: 124, evasoes: 74, churn: 6.7, renovacao: null, ticket: 407, permanencia: null, inadimplencia: null },
      2024: { alunos: 212, matriculas: 178, evasoes: 119, churn: 6.0, renovacao: null, ticket: 435, permanencia: null, inadimplencia: null },
      2025: { alunos: 221, matriculas: 142, evasoes: 135, churn: 4.90, renovacao: 87.18, ticket: 440, permanencia: 14, inadimplencia: 0.48 }
    }
  };

  // Metas 2025
  const metas2025 = {
    consolidado: {
      alunos: 1180,
      matriculas: 850,
      evasoes: 400,
      churn: 3.5,
      renovacao: 90,
      ticket: 400,
      permanencia: 15,
      inadimplencia: 2
    },
    cg: {
      alunos: 550,
      matriculas: 420,
      evasoes: 180,
      churn: 3.5,
      renovacao: 90,
      ticket: 370,
      permanencia: 18,
      inadimplencia: 2
    },
    recreio: {
      alunos: 400,
      matriculas: 250,
      evasoes: 120,
      churn: 3.5,
      renovacao: 90,
      ticket: 420,
      permanencia: 14,
      inadimplencia: 2
    },
    barra: {
      alunos: 300,
      matriculas: 180,
      evasoes: 100,
      churn: 3.5,
      renovacao: 90,
      ticket: 440,
      permanencia: 13,
      inadimplencia: 2
    }
  };

  // Calcular trends baseado no ano anterior
  const getTrend = (current: number | null, previous: number | null, isPercentage = false) => {
    if (current === null || previous === null) return null;
    const diff = current - previous;
    const percentChange = (diff / previous) * 100;
    return { value: isPercentage ? diff : percentChange, isPositive: diff > 0 };
  };

  // Obter dados do ano e unidade selecionados
  const currentData = historicalData[overviewUnit][overviewYear];
  const previousYear = overviewYear === 2023 ? null : (overviewYear - 1) as 2023 | 2024;
  const previousData = previousYear ? historicalData[overviewUnit][previousYear] : null;

  const radarData = [
    { metric: 'Crescimento', cg: 30, recreio: 50, barra: 100 },
    { metric: 'Menor Churn', cg: 60, recreio: 70, barra: 100 },
    { metric: 'Renovação', cg: 50, recreio: 80, barra: 85 },
    { metric: 'Inadimplência', cg: 80, recreio: 60, barra: 100 },
    { metric: 'Ticket Médio', cg: 70, recreio: 80, barra: 90 },
    { metric: 'LTV', cg: 100, recreio: 70, barra: 60 },
  ];

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-slate-50' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Sidebar Navigation */}
      <nav className={`fixed left-0 top-0 h-screen w-72 flex flex-col p-6 z-50 border-r transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-3 pb-8 border-b border-slate-800 mb-6">
          <div className="flex items-center gap-2">
            <img 
              src="/logo-la-music-school.png" 
              alt="LA Music School" 
              className="h-10 w-auto logo-img"
            />
            <img 
              src="/logo-la-music-kids.png" 
              alt="LA Music Kids" 
              className="h-10 w-auto logo-img"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
          {sections.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${activeSection === s.id ? 'bg-accent-cyan text-slate-900 font-bold' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-200'}`}
              >
                <Icon size={18} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="pt-6 border-t border-slate-800 mt-6">
          <button 
            onClick={toggleTheme}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 ml-72 overflow-x-hidden">
        
        {/* Cover Section */}
        <section id="cover" className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-12 text-center">
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[100%] bg-accent-cyan/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[80%] bg-accent-pink/10 blur-[120px] rounded-full" />
          
          <div className="relative z-10">
            <div className="flex justify-center items-center gap-8 mb-8">
              <img 
                src="/logo-la-music-school.png" 
                alt="LA Music School" 
                className="h-16 md:h-20 w-auto logo-img"
              />
              <img 
                src="/logo-la-music-kids.png" 
                alt="LA Music Kids" 
                className="h-16 md:h-20 w-auto logo-img"
              />
            </div>
            
            <h1 className="text-8xl lg:text-9xl font-grotesk font-black mb-4">
              RELATÓRIO <span className="text-accent-cyan">2025</span>
            </h1>
            <p className="text-2xl lg:text-3xl text-slate-400 font-light max-w-2xl mx-auto mb-10">
              Transformando Desafios em Melodias de Sucesso
            </p>
            
            <div className="inline-flex items-center gap-4 px-8 py-4 bg-accent-cyan/10 border-2 border-accent-cyan rounded-full text-2xl font-grotesk font-bold text-accent-cyan mb-12 shadow-[0_0_30px_rgba(0,212,255,0.2)]">
              <Calendar /> Revisão Anual + Metas 2026
            </div>
            
            <div className="mt-8">
              <button 
                onClick={() => scrollToSection('overview')}
                className="group inline-flex items-center gap-3 bg-accent-cyan hover:bg-accent-cyan/90 text-slate-900 font-bold px-10 py-5 rounded-2xl text-xl transition-all hover:scale-105"
              >
                Começar Apresentação
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </section>

        {/* Overview Section */}
        <section id="overview" className="min-h-screen py-24 px-12">
          <SectionHeader 
            badge="Visão Geral" 
            title={`O Ano de ${overviewYear} em Números`}
            subtitle={overviewUnit === 'consolidado' ? 'Performance consolidada do Grupo LA Music' : `Performance da unidade ${UNITS.find(u => u.id === overviewUnit)?.name}`}
            icon={BarChart3}
          />

          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-6 mb-8">
            {/* Filtro de Ano */}
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Ano</label>
              <div className="flex gap-2">
                {[2023, 2024, 2025].map(year => (
                  <button
                    key={year}
                    onClick={() => setOverviewYear(year as 2023 | 2024 | 2025)}
                    className={`px-4 py-2 rounded-lg border transition-all ${
                      overviewYear === year
                        ? 'bg-accent-cyan text-slate-900 border-accent-cyan font-bold'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtro de Unidade */}
            <div>
              <label className="text-sm text-slate-400 mb-2 block">Unidade</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setOverviewUnit('consolidado')}
                  className={`px-4 py-2 rounded-lg border transition-all ${
                    overviewUnit === 'consolidado'
                      ? 'bg-accent-cyan text-slate-900 border-accent-cyan font-bold'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  Consolidado
                </button>
                {UNITS.map(unit => (
                  <button
                    key={unit.id}
                    onClick={() => setOverviewUnit(unit.id as 'cg' | 'recreio' | 'barra')}
                    className={`px-4 py-2 rounded-lg border transition-all ${
                      overviewUnit === unit.id
                        ? 'bg-accent-cyan text-slate-900 border-accent-cyan font-bold'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {unit.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {(() => {
              const alunosTrend = getTrend(currentData.alunos, previousData?.alunos);
              const matriculasTrend = getTrend(currentData.matriculas, previousData?.matriculas);
              const evasoesTrend = getTrend(currentData.evasoes, previousData?.evasoes);
              const churnTrend = getTrend(currentData.churn, previousData?.churn, true);
              
              return (
                <>
                  <Card 
                    title="Alunos Pagantes" 
                    icon={Users} 
                    trend={alunosTrend ? (alunosTrend.isPositive ? "up" : "down") : undefined}
                    trendValue={alunosTrend ? `${alunosTrend.isPositive ? '+' : ''}${alunosTrend.value.toFixed(1)}%` : undefined}
                  >
                    <div className="text-5xl font-grotesk font-bold mt-2">{currentData.alunos}</div>
                    <div className="text-sm text-slate-400 mt-1">Alunos Pagantes (Dez/{overviewYear.toString().slice(-2)})</div>
                    {overviewYear === 2025 && (
                      <MetaIndicator 
                        current={currentData.alunos} 
                        meta={metas2025[overviewUnit].alunos}
                        format="number"
                        showProgress={true}
                      />
                    )}
                  </Card>
                  <Card 
                    title="Novas Matrículas" 
                    icon={UserPlus}
                    trend={matriculasTrend ? (matriculasTrend.isPositive ? "up" : "down") : undefined}
                    trendValue={matriculasTrend ? `${matriculasTrend.isPositive ? '+' : ''}${matriculasTrend.value.toFixed(1)}%` : undefined}
                  >
                    <div className="text-5xl font-grotesk font-bold mt-2">{currentData.matriculas}</div>
                    <div className="text-sm text-slate-400 mt-1">Novas Matrículas no Ano</div>
                    {overviewYear === 2025 && (
                      <MetaIndicator 
                        current={currentData.matriculas} 
                        meta={metas2025[overviewUnit].matriculas}
                        format="number"
                        showProgress={true}
                      />
                    )}
                  </Card>
                  <NegativeMetricCard 
                    title="Evasões (Ex-Alunos)" 
                    icon={UserMinus}
                    trend={evasoesTrend ? (evasoesTrend.isPositive ? "up" : "down") : undefined}
                    trendValue={evasoesTrend ? `${evasoesTrend.isPositive ? '+' : ''}${evasoesTrend.value.toFixed(1)}%` : undefined}
                  >
                    <div className="text-5xl font-grotesk font-bold mt-2 text-accent-pink">{currentData.evasoes}</div>
                    <div className="text-sm text-slate-400 mt-1">Evasões no Ano</div>
                    {overviewYear === 2025 && (
                      <MetaIndicator 
                        current={currentData.evasoes} 
                        meta={metas2025[overviewUnit].evasoes}
                        isNegativeMetric={true}
                        format="number"
                        showProgress={true}
                      />
                    )}
                  </NegativeMetricCard>
                  <NegativeMetricCard 
                    title="Churn Rate Médio" 
                    icon={Percent}
                    trend={churnTrend ? (churnTrend.isPositive ? "up" : "down") : undefined}
                    trendValue={churnTrend ? `${churnTrend.isPositive ? '+' : ''}${churnTrend.value.toFixed(2)} p.p.` : undefined}
                  >
                    <div className="text-5xl font-grotesk font-bold mt-2 text-accent-pink">{currentData.churn}%</div>
                    <div className="text-sm text-slate-400 mt-1">Churn Rate Médio</div>
                    {overviewYear === 2025 && (
                      <MetaIndicator 
                        current={currentData.churn} 
                        meta={metas2025[overviewUnit].churn}
                        isNegativeMetric={true}
                        format="percentage"
                        showProgress={true}
                      />
                    )}
                  </NegativeMetricCard>
                </>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {(() => {
              const renovacaoTrend = getTrend(currentData.renovacao, previousData?.renovacao, true);
              const ticketTrend = getTrend(currentData.ticket, previousData?.ticket);
              const permanenciaTrend = getTrend(currentData.permanencia, previousData?.permanencia);
              
              return (
                <>
                  <Card title="Taxa de Renovação" icon={Rocket} trend={renovacaoTrend ? (renovacaoTrend.isPositive ? "up" : "down") : undefined} trendValue={renovacaoTrend ? `${renovacaoTrend.isPositive ? '+' : ''}${renovacaoTrend.value.toFixed(2)} p.p.` : undefined}>
                    {currentData.renovacao !== null ? (
                      <div className="text-4xl font-grotesk font-bold mt-2 text-accent-green">{currentData.renovacao}%</div>
                    ) : (
                      <div className="text-4xl font-grotesk font-bold mt-2 text-slate-600">-</div>
                    )}
                    <div className="text-sm text-slate-400 mt-1">Taxa de Renovação Média</div>
                    {overviewYear === 2025 && currentData.renovacao !== null && (
                      <MetaIndicator 
                        current={currentData.renovacao} 
                        meta={metas2025[overviewUnit].renovacao}
                        format="percentage"
                        showProgress={true}
                      />
                    )}
                  </Card>
                  <Card 
                    title="Ticket Médio" 
                    icon={Receipt}
                    trend={ticketTrend ? (ticketTrend.isPositive ? "up" : "down") : undefined}
                    trendValue={ticketTrend ? `${ticketTrend.isPositive ? '+' : ''}${ticketTrend.value.toFixed(1)}%` : undefined}
                  >
                    <div className="text-4xl font-grotesk font-bold mt-2">R$ {currentData.ticket}</div>
                    <div className="text-sm text-slate-400 mt-1">Ticket Médio Parcelas</div>
                    {overviewYear === 2025 && (
                      <MetaIndicator 
                        current={currentData.ticket} 
                        meta={metas2025[overviewUnit].ticket}
                        format="currency"
                        showProgress={true}
                      />
                    )}
                  </Card>
                  <Card 
                    title="Tempo de Permanência" 
                    icon={Clock}
                    trend={permanenciaTrend ? (permanenciaTrend.isPositive ? "up" : "down") : undefined}
                    trendValue={permanenciaTrend ? `${permanenciaTrend.isPositive ? '+' : ''}${permanenciaTrend.value.toFixed(1)} meses` : undefined}
                  >
                    {currentData.permanencia !== null ? (
                      <div className="text-4xl font-grotesk font-bold mt-2">{currentData.permanencia}</div>
                    ) : (
                      <div className="text-4xl font-grotesk font-bold mt-2 text-slate-600">-</div>
                    )}
                    <div className="text-sm text-slate-400 mt-1">Tempo de Permanência (meses)</div>
                    {overviewYear === 2025 && currentData.permanencia !== null && (
                      <MetaIndicator 
                        current={currentData.permanencia} 
                        meta={metas2025[overviewUnit].permanencia}
                        format="months"
                        showProgress={true}
                      />
                    )}
                  </Card>
                  <Card 
                    title="Inadimplência Média" 
                    icon={ShieldCheck}
                    trend={currentData.inadimplencia !== null && currentData.inadimplencia < 1.5 ? "up" : undefined}
                    trendValue={currentData.inadimplencia !== null && currentData.inadimplencia < 1.5 ? "Meta Batida!" : undefined}
                  >
                    {currentData.inadimplencia !== null ? (
                      <div className="text-4xl font-grotesk font-bold mt-2 text-accent-green">{currentData.inadimplencia}%</div>
                    ) : (
                      <div className="text-4xl font-grotesk font-bold mt-2 text-slate-600">-</div>
                    )}
                    <div className="text-sm text-slate-400 mt-1">Inadimplência Média</div>
                    {overviewYear === 2025 && currentData.inadimplencia !== null && (
                      <MetaIndicator 
                        current={currentData.inadimplencia} 
                        meta={metas2025[overviewUnit].inadimplencia}
                        isNegativeMetric={true}
                        format="percentage"
                        showProgress={true}
                      />
                    )}
                  </Card>
                </>
              );
            })()}
          </div>

          {overviewUnit === 'consolidado' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-grotesk font-bold">Distribuição por Unidade</h3>
                <div className="flex gap-6">
                  {UNITS.map(u => (
                    <div key={u.id} className="flex items-center gap-2 text-sm text-slate-400">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: u.color }} />
                      {u.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-3 mb-8">
                <div className="flex gap-2">
                  {(['2023', '2024', '2025'] as const).map(year => (
                    <button
                      key={year}
                      onClick={() => setDistributionYear(year)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                        distributionYear === year 
                          ? 'bg-accent-cyan text-slate-900' 
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
                <div className="w-px bg-slate-700" />
                <div className="flex gap-2">
                  {(['alunos', 'matriculas', 'evasoes', 'faturamento'] as const).map(metric => (
                    <button
                      key={metric}
                      onClick={() => setDistributionMetric(metric)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                        distributionMetric === metric 
                          ? 'bg-accent-cyan text-slate-900' 
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {metric === 'alunos' ? 'Alunos' : metric === 'matriculas' ? 'Matrículas' : metric === 'evasoes' ? 'Evasões' : 'Faturamento'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col lg:flex-row items-center gap-12">
                {/* Donut Chart */}
                <div className="w-full lg:w-1/3 flex flex-col items-center">
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Campo Grande', value: DISTRIBUTION_DATA[distributionYear][distributionMetric].cg, color: THEME_COLORS.cyan },
                            { name: 'Recreio', value: DISTRIBUTION_DATA[distributionYear][distributionMetric].recreio, color: THEME_COLORS.purple },
                            { name: 'Barra', value: DISTRIBUTION_DATA[distributionYear][distributionMetric].barra, color: THEME_COLORS.green },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={120}
                          paddingAngle={0}
                          dataKey="value"
                          activeIndex={activeIndex}
                          activeShape={renderActiveShape}
                          onMouseEnter={(_, index) => setActiveIndex(index)}
                          onMouseLeave={() => setActiveIndex(undefined)}
                        >
                          {[THEME_COLORS.cyan, THEME_COLORS.purple, THEME_COLORS.green].map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip content={<DistributionTooltip metric={distributionMetric} />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-center mt-4">
                    <div className="text-3xl font-bold">
                      {distributionMetric === 'faturamento' 
                        ? `R$ ${(DISTRIBUTION_DATA[distributionYear][distributionMetric].total / 1000).toFixed(0)}k`
                        : DISTRIBUTION_DATA[distributionYear][distributionMetric].total.toLocaleString('pt-BR')
                      }
                    </div>
                    <div className="text-sm text-slate-400">Total {distributionYear}</div>
                  </div>
                </div>

                {/* Barras com tendências */}
                <div className="flex-1 w-full space-y-6">
                  {(() => {
                    const currentData = DISTRIBUTION_DATA[distributionYear][distributionMetric];
                    const prevYear = String(Number(distributionYear) - 1) as '2023' | '2024' | '2025';
                    const prevData = DISTRIBUTION_DATA[prevYear]?.[distributionMetric];
                    const total = currentData.total;
                    
                    const units = [
                      { id: 'cg', name: 'Campo Grande', value: currentData.cg, color: THEME_COLORS.cyan },
                      { id: 'recreio', name: 'Recreio', value: currentData.recreio, color: THEME_COLORS.purple },
                      { id: 'barra', name: 'Barra', value: currentData.barra, color: THEME_COLORS.green },
                    ];

                    return units.map(unit => {
                      const percent = ((unit.value / total) * 100);
                      const prevPercent = prevData ? ((prevData[unit.id as 'cg' | 'recreio' | 'barra'] / prevData.total) * 100) : null;
                      const variation = prevPercent !== null ? (percent - prevPercent) : null;
                      
                      // Lógica de tendência: para evasões, invertida
                      const isGoodTrend = distributionMetric === 'evasoes' 
                        ? (variation !== null && variation < 0)
                        : (variation !== null && variation > 0);
                      const isBadTrend = distributionMetric === 'evasoes'
                        ? (variation !== null && variation > 0)
                        : (variation !== null && variation < 0);

                      return (
                        <div key={unit.id} className="group">
                          <div className="flex justify-between items-center text-sm font-bold mb-3">
                            <span className="text-white">{unit.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400">
                                {distributionMetric === 'faturamento' 
                                  ? `R$ ${(unit.value / 1000).toFixed(0)}k`
                                  : unit.value.toLocaleString('pt-BR')
                                }
                              </span>
                              {variation !== null && (
                                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${
                                  isGoodTrend ? 'bg-accent-green/20 text-accent-green' :
                                  isBadTrend ? 'bg-accent-pink/20 text-accent-pink' :
                                  'bg-slate-700 text-slate-400'
                                }`}>
                                  {isGoodTrend ? <TrendingUp size={12} /> : isBadTrend ? <TrendingUp size={12} className="rotate-180" /> : <ArrowRight size={12} />}
                                  {variation > 0 ? '+' : ''}{variation.toFixed(1)} p.p.
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="h-10 bg-slate-800 rounded-lg overflow-hidden relative group-hover:bg-slate-750 transition-colors">
                            <div 
                              className="h-full transition-all duration-1000 ease-out rounded-lg flex items-center justify-end pr-4"
                              style={{ width: `${percent}%`, backgroundColor: unit.color }}
                            >
                              <span className="text-white font-bold text-sm">{percent.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Evolution Section */}
        <section id="evolution" className="min-h-screen py-24 px-12 bg-slate-900/50">
          <SectionHeader 
            badge="Evolução Histórica" 
            title="Jornada 2023 → 2025" 
            subtitle="Análise comparativa do crescimento nos últimos 3 anos"
            icon={TrendingUp}
          />

          <div className="flex flex-wrap gap-2 mb-8">
            {(['alunos', 'matriculas', 'evasoes', 'churn', 'ticket'] as MetricType[]).map(m => (
              <button
                key={m}
                onClick={() => setEvolutionMetric(m)}
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${evolutionMetric === m ? 'bg-accent-cyan text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-8 h-[500px]">
              <h3 className="text-xl font-grotesk font-bold mb-6">Comparativo Anual por Unidade</h3>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={[
                  { name: 'C. Grande', '2023': HISTORY_DATA[evolutionMetric][0].cg, '2024': HISTORY_DATA[evolutionMetric][1].cg, '2025': HISTORY_DATA[evolutionMetric][2].cg },
                  { name: 'Recreio', '2023': HISTORY_DATA[evolutionMetric][0].recreio, '2024': HISTORY_DATA[evolutionMetric][1].recreio, '2025': HISTORY_DATA[evolutionMetric][2].recreio },
                  { name: 'Barra', '2023': HISTORY_DATA[evolutionMetric][0].barra, '2024': HISTORY_DATA[evolutionMetric][1].barra, '2025': HISTORY_DATA[evolutionMetric][2].barra },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                  <Legend />
                  <Bar dataKey="2023" fill="#64748b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="2024" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="2025" fill="#00d4ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-6">
              <div className="overflow-hidden border border-slate-800 rounded-3xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-800/80">
                    <tr>
                      <th className="px-6 py-4 text-xs uppercase tracking-widest text-accent-cyan font-black">Métrica</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400">2023</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400">2024</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400">2025</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400">Var 25/24</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    <tr>
                      <td className="px-6 py-4 font-bold">Alunos (Dez)</td>
                      <td className="px-6 py-4 text-slate-400">687</td>
                      <td className="px-6 py-4 text-slate-400">970</td>
                      <td className="px-6 py-4 text-slate-200">935</td>
                      <td className="px-6 py-4 text-accent-pink font-bold">-3,6%</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-bold">Matrículas</td>
                      <td className="px-6 py-4 text-slate-400">436</td>
                      <td className="px-6 py-4 text-slate-400">688</td>
                      <td className="px-6 py-4 text-slate-200">602</td>
                      <td className="px-6 py-4 text-accent-pink font-bold">-12,5%</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-bold">Evasões</td>
                      <td className="px-6 py-4 text-slate-400">409</td>
                      <td className="px-6 py-4 text-slate-400">449</td>
                      <td className="px-6 py-4 text-slate-200">612</td>
                      <td className="px-6 py-4 text-accent-pink font-bold">+36,3%</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-bold">Churn Médio</td>
                      <td className="px-6 py-4 text-slate-400">5,4%</td>
                      <td className="px-6 py-4 text-slate-400">4,8%</td>
                      <td className="px-6 py-4 text-slate-200">5,27%</td>
                      <td className="px-6 py-4 text-accent-pink font-bold">+0,47pp</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 font-bold">Ticket Médio</td>
                      <td className="px-6 py-4 text-slate-400">R$ 369</td>
                      <td className="px-6 py-4 text-slate-400">R$ 399</td>
                      <td className="px-6 py-4 text-slate-200">R$ 414</td>
                      <td className="px-6 py-4 text-accent-green font-bold">+3,9%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-accent-pink/10 border-l-4 border-accent-pink p-6 rounded-2xl flex gap-4">
                <AlertTriangle className="text-accent-pink shrink-0" />
                <div>
                  <h4 className="font-bold text-accent-pink">Ponto de Atenção Crítico</h4>
                  <p className="text-sm text-slate-400 mt-1">
                    2025 quebrou a tendência de crescimento. Após expandir 41% em 2024, a retração de 3,6% sinaliza um esgotamento do modelo atual ou falha grave na retenção (+36% de evasões).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Unit Analysis Section */}
        <section id="units" className="min-h-screen py-24 px-12">
          <SectionHeader 
            badge="Análise Individual" 
            title="Performance por Unidade" 
            subtitle="Raio-X detalhado de cada Unidade"
            icon={Building2}
          />

          <div className="flex gap-2 mb-8 bg-slate-900/50 p-2 rounded-2xl w-fit">
            {UNITS.map(u => (
              <button
                key={u.id}
                onClick={() => setUnitTab(u.id)}
                className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${unitTab === u.id ? (u.id === 'cg' ? 'bg-accent-cyan text-slate-900' : u.id === 'recreio' ? 'bg-accent-purple text-slate-900' : 'bg-accent-green text-slate-900') : 'text-slate-500 hover:text-slate-200'}`}
              >
                {u.name}
              </button>
            ))}
          </div>

          {UNITS.filter(u => u.id === unitTab).map(u => (
            <div key={u.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className={`p-6 rounded-3xl border flex flex-col justify-between`} style={{ backgroundColor: u.bgColor, borderColor: `${u.color}33` }}>
                  <div className="flex justify-between items-start">
                    <span className="text-xs uppercase font-black text-slate-400 tracking-widest">Alunos Pagantes (Dez)</span>
                    <Badge variant={u.id === 'barra' ? 'success' : 'danger'}>{u.id === 'barra' ? '+1,8%' : u.id === 'recreio' ? '-4,5%' : '-16,3%'}</Badge>
                  </div>
                  <div className="text-5xl font-grotesk font-bold mt-4" style={{ color: u.color }}>{u.alunosDez}</div>
                  <div className="text-xs text-slate-400 mt-2">{u.id === 'cg' ? 'Jan: 498 → Dez: 417 (-81)' : u.id === 'recreio' ? 'Jan: 311 → Dez: 297 (-14)' : 'Jan: 217 → Dez: 221 (+4)'}</div>
                </div>
                <Card title="Novas Matrículas">
                  <div className="text-4xl font-grotesk font-bold">{u.matriculasAno}</div>
                  <div className="text-xs text-slate-400 mt-2">Média: {(u.matriculasAno / 12).toFixed(2)}/mês</div>
                </Card>
                <Card title="Evasões">
                  <div className="text-4xl font-grotesk font-bold text-accent-pink">{u.evasoesAno}</div>
                  <div className="text-xs text-slate-400 mt-2">{u.id === 'cg' ? '+35% vs 2024' : u.id === 'recreio' ? '+61,5% vs 2024' : '+13,4% vs 2024'}</div>
                </Card>
                <Card title="Churn Médio">
                  <div className="text-4xl font-grotesk font-bold">{u.churnMedio}%</div>
                  <div className="text-xs text-slate-400 mt-2">Meta: 3,5%</div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-8 h-[400px]">
                  <h3 className="text-xl font-grotesk font-bold mb-6">Evolução Mensal de Alunos</h3>
                  <ResponsiveContainer width="100%" height="90%">
                    <LineChart data={u.evolution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="alunos" stroke={u.color} strokeWidth={4} dot={{ r: 6, fill: u.color }} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-3xl p-8 h-[400px]">
                  <h3 className="text-xl font-grotesk font-bold mb-6">Fluxo: Matrículas vs Evasões</h3>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={u.evolution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                      <Legend />
                      <Bar dataKey="matriculas" fill={THEME_COLORS.green} name="Entradas" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="evasoes" fill={THEME_COLORS.pink} name="Saídas" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-800/50 border-l-4 border-accent-green rounded-2xl p-6">
                  <h4 className="text-sm font-bold text-accent-green mb-3">Melhor Mês para Matrículas</h4>
                  <p className="text-slate-300">
                    {u.id === 'cg' ? 'Janeiro (42) e Maio (37)' : u.id === 'recreio' ? 'Agosto (40) - RECORDE!' : 'Fevereiro (18) e Agosto (17)'}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border-l-4 border-accent-pink rounded-2xl p-6">
                  <h4 className="text-sm font-bold text-accent-pink mb-3">Meses Críticos de Evasão</h4>
                  <p className="text-slate-300">
                    {u.id === 'cg' ? 'Fevereiro (49) e Maio (47)' : u.id === 'recreio' ? 'Abril (24), Setembro (24) e Dezembro (24)' : 'Maio (19) e Junho (17)'}
                  </p>
                </div>
                <div className="bg-slate-800/50 border-l-4 border-accent-cyan rounded-2xl p-6">
                  <h4 className="text-sm font-bold text-accent-cyan mb-3">LTV</h4>
                  <p className="text-slate-300">
                    {u.id === 'cg' ? '19 meses (+1 vs 2024)' : u.id === 'recreio' ? '15 meses (+0,5 vs 2024)' : '14 meses (+0,8 vs 2024)'}
                  </p>
                </div>
              </div>

              {u.id === 'barra' && (
                <div className="bg-accent-green/10 border-2 border-accent-green p-8 rounded-3xl flex items-center gap-8">
                  <div className="w-16 h-16 bg-accent-green rounded-2xl flex items-center justify-center text-slate-900 shrink-0">
                    <Rocket size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-grotesk font-bold text-accent-green">Destaque: Benchmarking Interno</h3>
                    <p className="text-lg text-slate-400 mt-2">
                      A Barra é a única unidade que cresceu em base de alunos (+4), possui o menor churn (4,9%), a menor inadimplência (0,48%) e o maior ticket. O "jeito Barra" precisa ser mapeado e replicado.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* Comparison Section */}
        <section id="comparison" className="min-h-screen py-24 px-12 bg-slate-900/50">
          <SectionHeader 
            badge="Comparativo" 
            title="Ranking entre Unidades" 
            subtitle="Quem performou melhor em cada KPI"
            icon={GitCompare}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div>
              <h4 className="text-slate-400 font-semibold text-base mb-6">Crescimento da Base</h4>
              <RankingCard pos={1} name="Barra" value="+1,8%" label="Única que cresceu" colorClass="text-accent-green" />
              <RankingCard pos={2} name="Recreio" value="-4,5%" colorClass="text-accent-purple" />
              <RankingCard pos={3} name="Campo Grande" value="-16,3%" colorClass="text-accent-pink" />
            </div>
            <div>
              <h4 className="text-slate-400 font-semibold text-base mb-6">Menor Churn</h4>
              <RankingCard pos={1} name="Barra" value="4,90%" colorClass="text-accent-green" />
              <RankingCard pos={2} name="Recreio" value="5,01%" colorClass="text-accent-purple" />
              <RankingCard pos={3} name="Campo Grande" value="5,21%" colorClass="text-accent-cyan" />
            </div>
            <div>
              <h4 className="text-slate-400 font-semibold text-base mb-6">Taxa de Renovação</h4>
              <RankingCard pos={1} name="Barra" value="87,18%" colorClass="text-accent-green" />
              <RankingCard pos={2} name="Recreio" value="87,04%" colorClass="text-accent-purple" />
              <RankingCard pos={3} name="Campo Grande" value="76,58%" colorClass="text-accent-pink" />
            </div>
            <div>
              <h4 className="text-slate-400 font-semibold text-base mb-6">Menor Inadimplência</h4>
              <RankingCard pos={1} name="Barra" value="0,48%" colorClass="text-accent-green" />
              <RankingCard pos={2} name="Campo Grande" value="0,85%" colorClass="text-accent-cyan" />
              <RankingCard pos={3} name="Recreio" value="1,10%" colorClass="text-accent-purple" />
            </div>
          </div>

          <div className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-12 min-h-[600px]">
            <h3 className="text-3xl font-grotesk font-bold mb-10 text-center">Visão 360º de Performance</h3>
            
            <div className="flex flex-col lg:flex-row gap-12 items-center">
              <div className="w-full lg:w-[60%] h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 14 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Campo Grande" dataKey="cg" stroke={THEME_COLORS.cyan} fill={THEME_COLORS.cyan} fillOpacity={0.3} />
                    <Radar name="Recreio" dataKey="recreio" stroke={THEME_COLORS.purple} fill={THEME_COLORS.purple} fillOpacity={0.3} />
                    <Radar name="Barra" dataKey="barra" stroke={THEME_COLORS.green} fill={THEME_COLORS.green} fillOpacity={0.3} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="w-full lg:w-[40%] space-y-6">
                <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-slate-700">
                        <th className="px-4 py-3 font-bold text-slate-400">Métrica</th>
                        <th className="px-4 py-3 font-bold text-accent-green">Barra</th>
                        <th className="px-4 py-3 font-bold text-accent-cyan">CG</th>
                        <th className="px-4 py-3 font-bold text-accent-purple">Rec.</th>
                        <th className="px-4 py-3 font-bold text-white">Melhor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr>
                        <td className="px-4 py-3 text-slate-400">Crescimento</td>
                        <td className="px-4 py-3 text-white">+1,8%</td>
                        <td className="px-4 py-3 text-white">-16,3%</td>
                        <td className="px-4 py-3 text-white">-4,5%</td>
                        <td className="px-4 py-3 font-bold text-accent-green">Barra</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-slate-400">Churn</td>
                        <td className="px-4 py-3 text-white">4,90%</td>
                        <td className="px-4 py-3 text-white">5,21%</td>
                        <td className="px-4 py-3 text-white">5,01%</td>
                        <td className="px-4 py-3 font-bold text-accent-green">Barra</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-slate-400">Renovação</td>
                        <td className="px-4 py-3 text-white">87,18%</td>
                        <td className="px-4 py-3 text-white">76,58%</td>
                        <td className="px-4 py-3 text-white">87,04%</td>
                        <td className="px-4 py-3 font-bold text-accent-green">Barra</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-slate-400">Inadimplência</td>
                        <td className="px-4 py-3 text-white">0,48%</td>
                        <td className="px-4 py-3 text-white">0,85%</td>
                        <td className="px-4 py-3 text-white">1,10%</td>
                        <td className="px-4 py-3 font-bold text-accent-green">Barra</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-slate-400">Ticket Médio</td>
                        <td className="px-4 py-3 text-white">R$ 440</td>
                        <td className="px-4 py-3 text-white">R$ 371</td>
                        <td className="px-4 py-3 text-white">R$ 430</td>
                        <td className="px-4 py-3 font-bold text-accent-green">Barra</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-slate-400">LTV</td>
                        <td className="px-4 py-3 text-white">14 m.</td>
                        <td className="px-4 py-3 text-white">19 m.</td>
                        <td className="px-4 py-3 text-white">15 m.</td>
                        <td className="px-4 py-3 font-bold text-accent-cyan">CG</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 italic px-2">
                  * Os scores de 0-100 representam a performance relativa entre as unidades. 
                  Score 100 = melhor desempenho naquela métrica.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Seasonality Heatmap */}
        <section id="seasonality" className="min-h-screen py-24 px-12">
          <SectionHeader 
            badge="Sazonalidade" 
            title="Padrões Identificados" 
            subtitle="Meses críticos e oportunidades"
            icon={Calendar}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Card Alto Risco */}
            <div 
              className="p-8 rounded-xl border-l-4 border-accent-pink"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.1) 0%, transparent 100%)',
                borderRadius: '12px'
              }}
            >
              <h4 className="text-xl font-grotesk font-bold text-accent-pink mb-6">
                Meses de ALTO RISCO (Evasão)
              </h4>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-4xl font-black font-grotesk text-accent-pink mb-2">FEVEREIRO</div>
                  <div className="text-sm text-slate-400 mb-1">Pós-férias + Reajuste anual</div>
                  <div className="text-sm text-slate-400">2025: 81 evasões no grupo</div>
                </div>
                <div>
                  <div className="text-4xl font-black font-grotesk text-accent-pink mb-2">MAIO</div>
                  <div className="text-sm text-slate-400 mb-1">Fim do 1º semestre</div>
                  <div className="text-sm text-slate-400">2025: 73 evasões no grupo</div>
                </div>
              </div>
            </div>

            {/* Card Meses de Ouro */}
            <div 
              className="p-8 rounded-xl border-l-4 border-accent-green"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 204, 102, 0.1) 0%, transparent 100%)',
                borderRadius: '12px'
              }}
            >
              <h4 className="text-xl font-grotesk font-bold text-accent-green mb-6">
                Meses de OURO (Captação)
              </h4>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-4xl font-black font-grotesk text-accent-green mb-2">JANEIRO</div>
                  <div className="text-sm text-slate-400 mb-1">Ano novo + Resoluções</div>
                  <div className="text-sm text-slate-400">Média: 88 matrículas/ano</div>
                </div>
                <div>
                  <div className="text-4xl font-black font-grotesk text-accent-green mb-2">AGOSTO</div>
                  <div className="text-sm text-slate-400 mb-1">Volta do 2º semestre</div>
                  <div className="text-sm text-slate-400">2025: 86 matrículas (recorde!)</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h3 className="text-xl font-bold mb-8">Heatmap de Evasões 2025 (Grupo)</h3>
            <div className="grid grid-cols-[160px_repeat(12,1fr)] gap-2">
              <div />
              {MONTHS.map(m => <div key={m} className="text-center text-xs font-bold text-slate-500 py-2">{m}</div>)}
              
              {UNITS.map(u => (
                <React.Fragment key={u.id}>
                  <div className="flex items-center text-sm font-bold text-slate-300">{u.name}</div>
                  {u.evolution.map((e, idx) => {
                    const ev = e.evasoes;
                    let color = 'bg-slate-800/30';
                    if (ev >= 40) color = 'bg-accent-pink/80 text-white';
                    else if (ev >= 26) color = 'bg-accent-pink/40 text-accent-pink';
                    else if (ev >= 15) color = 'bg-accent-yellow/30 text-accent-yellow';
                    else color = 'bg-accent-green/20 text-accent-green';
                    
                    return (
                      <div 
                        key={idx} 
                        className={`aspect-square flex items-center justify-center rounded-lg text-xs font-black transition-transform hover:scale-110 cursor-default ${color}`}
                        title={`${e.month}: ${ev} evasões`}
                      >
                        {ev}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div className="flex gap-6 justify-center mt-12 text-xs font-bold text-slate-500 uppercase tracking-widest">
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-green/20" /> Baixo (&lt;15)</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-yellow/30" /> Médio (15-25)</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-pink/40" /> Alto (26-40)</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-accent-pink/80" /> Crítico (&gt;40)</div>
            </div>
          </div>
        </section>

        {/* Goals 2025 - Metas vs Realizado */}
        <section id="goals2025" className="min-h-screen py-24 px-12 bg-slate-900/50">
          <SectionHeader 
            badge="Metas 2025" 
            title="Metas vs Realizado" 
            subtitle="Avaliação do cumprimento das metas estabelecidas"
            icon={Target}
          />

          {/* Tabs para unidades */}
          <div className="flex gap-2 mb-8">
            {UNITS.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUnit(u.id)}
                className={`px-6 py-3 rounded-full font-bold transition-all ${
                  selectedUnit === u.id
                    ? u.id === 'cg' ? 'bg-accent-cyan text-slate-900'
                    : u.id === 'recreio' ? 'bg-accent-purple text-white'
                    : 'bg-accent-green text-slate-900'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {u.name}
              </button>
            ))}
          </div>

          {/* Tabela de Metas vs Realizado */}
          {(() => {
            const goalsData: Record<string, { metrica: string; meta: string; realizado: string; gap: string; status: 'atingida' | 'proximo' | 'nao_atingida'; nota?: string }[]> = {
              cg: [
                { metrica: 'Alunos (Dez)', meta: '550', realizado: '417', gap: '-133', status: 'nao_atingida' },
                { metrica: 'Churn Médio', meta: '3,5%', realizado: '5,21%', gap: '+1,71 p.p.', status: 'nao_atingida' },
                { metrica: 'Taxa de Renovação', meta: '90%', realizado: '76,58%', gap: '-13,42 p.p.', status: 'nao_atingida' },
                { metrica: 'Ticket Médio', meta: 'R$ 370', realizado: 'R$ 371,52', gap: '+R$ 1,52', status: 'atingida' },
                { metrica: 'Matrículas/mês', meta: '35', realizado: '22,6', gap: '-12,4', status: 'nao_atingida' },
                { metrica: 'Inadimplência', meta: '<2%', realizado: '0,85%', gap: 'OK', status: 'atingida' },
                { metrica: 'Faturamento/mês', meta: 'R$ 200.000', realizado: '~R$ 151.000', gap: '-24,6%', status: 'nao_atingida' },
              ],
              recreio: [
                { metrica: 'Alunos (Dez)', meta: '400', realizado: '297', gap: '-103', status: 'nao_atingida' },
                { metrica: 'Churn Médio', meta: '3,5%', realizado: '5,01%', gap: '+1,51 p.p.', status: 'nao_atingida' },
                { metrica: 'Taxa de Renovação', meta: '90%', realizado: '87,04%', gap: '-2,96 p.p.', status: 'proximo' },
                { metrica: 'Ticket Médio', meta: 'R$ 430', realizado: 'R$ 429,57', gap: '-R$ 0,43', status: 'atingida' },
                { metrica: 'Matrículas/mês', meta: '25', realizado: '15,75', gap: '-9,25', status: 'nao_atingida' },
                { metrica: 'Inadimplência', meta: '<2%', realizado: '1,10%', gap: 'OK', status: 'atingida' },
                { metrica: 'Faturamento/mês', meta: 'R$ 170.000', realizado: '~R$ 121.000', gap: '-28,5%', status: 'nao_atingida' },
              ],
              barra: [
                { metrica: 'Alunos (Dez)', meta: '300', realizado: '221', gap: '-79', status: 'nao_atingida' },
                { metrica: 'Churn Médio', meta: '3,5%', realizado: '4,90%', gap: '+1,4 p.p.', status: 'proximo', nota: 'Melhor do grupo' },
                { metrica: 'Taxa de Renovação', meta: '90%', realizado: '87,18%', gap: '-2,82 p.p.', status: 'proximo' },
                { metrica: 'Ticket Médio', meta: 'R$ 450', realizado: 'R$ 440,24', gap: '-R$ 9,76', status: 'proximo' },
                { metrica: 'Matrículas/mês', meta: '20', realizado: '11,83', gap: '-8,17', status: 'nao_atingida' },
                { metrica: 'Inadimplência', meta: '<2%', realizado: '0,48%', gap: 'OK', status: 'atingida', nota: 'Melhor!' },
                { metrica: 'Faturamento/mês', meta: 'R$ 130.000', realizado: '~R$ 86.500', gap: '-33,5%', status: 'nao_atingida' },
              ],
            };

            const currentData = goalsData[selectedUnit] || goalsData.cg;
            const atingidas = currentData.filter(d => d.status === 'atingida').length;
            const proximos = currentData.filter(d => d.status === 'proximo').length;
            const naoAtingidas = currentData.filter(d => d.status === 'nao_atingida').length;

            const getStatusBadge = (status: string, nota?: string) => {
              if (status === 'atingida') {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-green/20 text-accent-green text-sm font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Atingida{nota ? ` (${nota})` : ''}
                  </span>
                );
              }
              if (status === 'proximo') {
                return (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-yellow/20 text-accent-yellow text-sm font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" /> {nota || 'Próximo'}
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-pink/20 text-accent-pink text-sm font-medium">
                  <XCircle className="w-3.5 h-3.5" /> Não atingida
                </span>
              );
            };

            const currentUnit = UNITS.find(u => u.id === selectedUnit);
            const unitColor = currentUnit?.color || THEME_COLORS.cyan;

            return (
              <>
                <div className="bg-slate-800 rounded-3xl overflow-hidden border border-slate-700 mb-8">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700" style={{ backgroundColor: `${unitColor}15` }}>
                        <th className="text-left p-4 font-bold text-slate-300">Métrica</th>
                        <th className="text-center p-4 font-bold text-slate-300">Meta</th>
                        <th className="text-center p-4 font-bold text-slate-300">Realizado</th>
                        <th className="text-center p-4 font-bold text-slate-300">Gap</th>
                        <th className="text-center p-4 font-bold text-slate-300">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                          <td className="p-4 font-medium text-white">{row.metrica}</td>
                          <td className="p-4 text-center text-white">{row.meta}</td>
                          <td className="p-4 text-center font-bold text-white">{row.realizado}</td>
                          <td className="p-4 text-center font-bold text-white">
                            {row.gap}
                          </td>
                          <td className="p-4 text-center">{getStatusBadge(row.status, row.nota)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cards de Resumo */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Card Metas Atingidas */}
                  <div 
                    className="p-8 rounded-xl border-l-4 border-accent-green"
                    style={{
                      background: 'linear-gradient(135deg, rgba(0, 204, 102, 0.1) 0%, transparent 100%)',
                      borderRadius: '12px'
                    }}
                  >
                    <h4 className="text-xl font-grotesk font-bold text-accent-green mb-4 flex items-center gap-2">
                      <CheckCircle2 className="w-6 h-6" /> Metas Atingidas
                    </h4>
                    <div className="text-6xl font-black font-grotesk text-accent-green">{atingidas}</div>
                  </div>

                  {/* Card Próximo da Meta */}
                  {proximos > 0 && (
                    <div 
                      className="p-8 rounded-xl border-l-4 border-accent-yellow"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.1) 0%, transparent 100%)',
                        borderRadius: '12px'
                      }}
                    >
                      <h4 className="text-xl font-grotesk font-bold text-accent-yellow mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6" /> Próximo da Meta
                      </h4>
                      <div className="text-6xl font-black font-grotesk text-accent-yellow">{proximos}</div>
                    </div>
                  )}

                  {/* Card Metas Não Atingidas */}
                  <div 
                    className="p-8 rounded-xl border-l-4 border-accent-pink"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.1) 0%, transparent 100%)',
                      borderRadius: '12px'
                    }}
                  >
                    <h4 className="text-xl font-grotesk font-bold text-accent-pink mb-4 flex items-center gap-2">
                      <XCircle className="w-6 h-6" /> Metas Não Atingidas
                    </h4>
                    <div className="text-6xl font-black font-grotesk text-accent-pink">{naoAtingidas}</div>
                  </div>
                </div>
              </>
            );
          })()}
        </section>

        {/* Reflections Section */}
        <section id="reflections" className="min-h-screen py-24 px-12">
          <SectionHeader 
            badge="Reflexões" 
            title="Perguntas Estratégicas" 
            subtitle="Questões para discutirmos em equipe"
            icon={MessageCircleQuestion}
          />

          <div className="max-w-4xl mx-auto space-y-6">
            {/* Card 1 - Fevereiro CG */}
            <div 
              className="border-2 border-accent-pink rounded-3xl p-10 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)'
              }}
            >
              <div 
                className="w-12 h-12 rounded-full mx-auto mb-6"
                style={{ background: '#ff3366' }}
              />
              <h3 className="text-3xl font-semibold text-white mb-4 leading-tight">
                O que aconteceu em Fevereiro de 2025 em Campo Grande?
              </h3>
              <p className="text-lg text-slate-400">
                49 evasões vs 27 em 2024 — aumento de 81%. O que mudou?
              </p>
            </div>

            {/* Card 2 - Agosto Recreio */}
            <div 
              className="border-2 border-accent-green rounded-3xl p-10 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 204, 102, 0.2) 0%, rgba(0, 212, 255, 0.1) 100%)'
              }}
            >
              <div 
                className="w-12 h-12 rounded-full mx-auto mb-6"
                style={{ background: '#00cc66' }}
              />
              <h3 className="text-3xl font-semibold text-white mb-4 leading-tight">
                O que o Recreio fez em Agosto/25?
              </h3>
              <p className="text-lg text-slate-400">
                40 matrículas — recorde da unidade! Podemos replicar?
              </p>
            </div>

            {/* Card 3 - Barra Churn */}
            <div 
              className="border-2 border-accent-purple rounded-3xl p-10 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(0, 212, 255, 0.1) 100%)'
              }}
            >
              <div 
                className="w-12 h-12 rounded-full mx-auto mb-6"
                style={{ background: '#8b5cf6' }}
              />
              <h3 className="text-3xl font-semibold text-white mb-4 leading-tight">
                Por que a Barra conseguiu reduzir o churn?
              </h3>
              <p className="text-lg text-slate-400">
                Única unidade que reduziu (de 6,0% para 4,90%). O que eles fazem diferente?
              </p>
            </div>

            {/* Card 4 - Colaboradores */}
            <div 
              className="border-2 rounded-3xl p-10 text-center"
              style={{
                borderColor: '#ffaa00',
                background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.2) 0%, rgba(255, 51, 102, 0.1) 100%)'
              }}
            >
              <div 
                className="w-12 h-12 rounded-full mx-auto mb-6"
                style={{ background: '#ffaa00' }}
              />
              <h3 className="text-3xl font-semibold text-white mb-4 leading-tight">
                As trocas de colaboradores estratégicos coincidem com os picos de evasão?
              </h3>
              <p className="text-lg text-slate-400">
                Precisamos mapear essas correlações para 2026.
              </p>
            </div>
          </div>
        </section>

        {/* Alerts and Insights Section */}
        <section id="alerts" className="min-h-screen py-24 px-12 bg-slate-900/50">
          <SectionHeader 
            badge="Alertas e Insights" 
            title="Pontos Críticos de Atenção" 
            subtitle="O que a gestão precisa saber"
            icon={AlertTriangle}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Coluna Esquerda - Alertas Críticos */}
            <div>
              <h3 className="text-2xl font-bold text-accent-pink mb-6">Alertas Críticos</h3>
              
              {/* Card 1 */}
              <div 
                className="border-l-4 border-accent-pink rounded-xl p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.15) 0%, transparent 100%)'
                }}
              >
                <h4 className="text-lg font-semibold text-white mb-2">Explosão de Evasões em 2025</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  612 evasões vs 449 em 2024 (+36,3%). Mesmo com 602 matrículas, saldo foi negativo.
                </p>
              </div>

              {/* Card 2 */}
              <div 
                className="border-l-4 border-accent-pink rounded-xl p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.15) 0%, transparent 100%)'
                }}
              >
                <h4 className="text-lg font-semibold text-white mb-2">Fevereiro é o Mês Mais Perigoso</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  81 evasões no grupo só em Fevereiro/25. Hipótese: reajuste mal comunicado + reavaliação pós-férias.
                </p>
              </div>

              {/* Card 3 */}
              <div 
                className="border-l-4 border-accent-pink rounded-xl p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.15) 0%, transparent 100%)'
                }}
              >
                <h4 className="text-lg font-semibold text-white mb-2">Campo Grande Perdeu o Ritmo</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Em 2024 cresceu 66% em matrículas. Em 2025 caiu 16%. O que mudou?
                </p>
              </div>

              {/* Card 4 - Amarelo */}
              <div 
                className="border-l-4 rounded-xl p-5 mb-4"
                style={{
                  borderLeftColor: '#ffaa00',
                  background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.15) 0%, transparent 100%)'
                }}
              >
                <h4 className="text-lg font-semibold text-white mb-2">Metas 2025 Estavam Muito Agressivas</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Crescimentos de 18% a 41% necessários não eram realistas dado o histórico.
                </p>
              </div>
            </div>

            {/* Coluna Direita - Insights Positivos */}
            <div>
              <h3 className="text-2xl font-bold text-accent-green mb-6">Insights Positivos</h3>
              
              {/* Card 1 - Cyan */}
              <div 
                className="border-l-4 border-accent-cyan rounded-xl p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, transparent 100%)'
                }}
              >
                <h4 className="text-lg font-semibold text-white mb-2">Inadimplência Sob Controle</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Todas as unidades abaixo de 2%. Indica boa qualidade de crédito e cobrança eficiente.
                </p>
              </div>

              {/* Card 2 - Cyan */}
              <div 
                className="border-l-4 border-accent-cyan rounded-xl p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, transparent 100%)'
                }}
              >
                <h4 className="text-lg font-semibold text-white mb-2">Ticket Médio Crescendo</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Grupo cresceu 3,9% no ticket. CG e Recreio bateram as metas. Continuar política de reajuste.
                </p>
              </div>

              {/* Card 3 - Cyan */}
              <div 
                className="border-l-4 border-accent-cyan rounded-xl p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, transparent 100%)'
                }}
              >
                <h4 className="text-lg font-semibold text-white mb-2">LTV Aumentando</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Quem fica, está ficando mais tempo. Todas as unidades aumentaram o tempo de permanência.
                </p>
              </div>

              {/* Card 4 - Verde */}
              <div 
                className="border-l-4 border-accent-green rounded-xl p-5 mb-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 204, 102, 0.15) 0%, transparent 100%)'
                }}
              >
                <h4 className="text-lg font-semibold text-white mb-2">Barra é o Modelo a Seguir</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Única que cresceu, menor churn, menor inadimplência. Entender e replicar!
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Goals 2026 Section */}
        <section id="goals2026" className="min-h-screen py-24 px-12 bg-slate-900/50">
          <SectionHeader 
            badge="Metas 2026" 
            title="Estratégia de Retomada" 
            subtitle="Clique nos valores para simular e planejar o próximo ciclo"
            icon={Rocket}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            {UNITS.map(u => {
              const metas = metas2026[u.id];
              const varAlunos = (((Number(metas.alunos) / u.alunosDez) - 1) * 100).toFixed(1);
              return (
                <div key={u.id} className="bg-slate-800 border-t-4 p-8 rounded-3xl" style={{ borderTopColor: u.color }}>
                  <h3 className="text-2xl font-grotesk font-bold mb-8 flex items-center gap-3">
                    <Building2 style={{ color: u.color }} /> {u.name}
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase mb-2">
                        <Users size={14} style={{ color: u.color }} /> Alunos Dezembro
                      </div>
                      <input 
                        type="number" 
                        value={metas.alunos} 
                        onChange={(e) => updateMeta(u.id, 'alunos', e.target.value)}
                        className="w-full bg-transparent text-3xl font-grotesk font-bold focus:outline-none focus:text-accent-cyan"
                      />
                      <div className="flex justify-between text-[10px] mt-2 font-bold uppercase tracking-tighter">
                        <span className="text-slate-500">2025: {u.alunosDez}</span>
                        <span className="text-accent-green">Var: +{varAlunos}%</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Churn Alvo</div>
                        <input value={metas.churn} onChange={(e) => updateMeta(u.id, 'churn', e.target.value)} className="w-full bg-transparent font-bold focus:outline-none" />
                      </div>
                      <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Renovação</div>
                        <input value={metas.renovacao} onChange={(e) => updateMeta(u.id, 'renovacao', e.target.value)} className="w-full bg-transparent font-bold focus:outline-none" />
                      </div>
                    </div>

                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                      <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Matrículas/Mês</div>
                      <input type="number" value={metas.matriculas} onChange={(e) => updateMeta(u.id, 'matriculas', e.target.value)} className="w-full bg-transparent font-bold text-xl focus:outline-none" />
                    </div>

                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                      <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Ticket Médio Alvo</div>
                      <input value={metas.ticket} onChange={(e) => updateMeta(u.id, 'ticket', e.target.value)} className="w-full bg-transparent font-bold focus:outline-none" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="border-t-8 border-accent-purple" title="Consolidado LA Music 2026">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 py-6 text-center">
              <div>
                <div className="text-6xl font-grotesk font-black text-accent-cyan mb-2">{totalAlunos2026}</div>
                <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Total Alunos</div>
                <div className="text-accent-green font-bold text-sm mt-1">+26,2% vs 2025</div>
              </div>
              <div>
                <div className="text-6xl font-grotesk font-black text-accent-pink mb-2">4%</div>
                <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Churn Médio</div>
                <div className="text-accent-green font-bold text-sm mt-1">-1,27pp vs 2025</div>
              </div>
              <div>
                <div className="text-6xl font-grotesk font-black text-accent-green mb-2">900</div>
                <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Matrículas/Ano</div>
                <div className="text-accent-green font-bold text-sm mt-1">+49,5% vs 2025</div>
              </div>
              <div>
                <div className="text-6xl font-grotesk font-black text-accent-yellow mb-2">~R$ 510k</div>
                <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Faturamento</div>
                <div className="text-accent-green font-bold text-sm mt-1">+42,5% vs 2025</div>
              </div>
            </div>
          </Card>
        </section>

        {/* Learnings Section */}
        <section id="learnings" className="min-h-screen py-24 px-12">
          <SectionHeader 
            badge="Aprendizados" 
            title="Lições de 2025 & Plano de Ação" 
            subtitle="O que fica para o futuro do grupo"
            icon={Lightbulb}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-slate-800/40 p-8 rounded-3xl border border-slate-700/50">
              <div className="w-14 h-14 bg-accent-green/20 text-accent-green rounded-2xl flex items-center justify-center mb-6">
                <ShieldCheck size={28} />
              </div>
              <h3 className="text-2xl font-bold mb-6">O que Funcionou</h3>
              <ul className="space-y-4">
                {[
                  "Controle rigoroso de inadimplência (<2%)",
                  "Política de reajuste manteve ticket crescendo",
                  "LTV aumentou em todas as unidades",
                  "Barra como modelo de escala e retenção",
                  "Agosto como mês recorde de captação"
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-slate-400">
                    <ArrowRight className="text-accent-green shrink-0 mt-1" size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-800/40 p-8 rounded-3xl border border-slate-700/50">
              <div className="w-14 h-14 bg-accent-yellow/20 text-accent-yellow rounded-2xl flex items-center justify-center mb-6">
                <AlertTriangle size={28} />
              </div>
              <h3 className="text-2xl font-bold mb-6">O que Melhorar</h3>
              <ul className="space-y-4">
                {[
                  "Comunicação do reajuste anual",
                  "Acompanhamento semanal de KPIs",
                  "Definição de metas realistas (SMART)",
                  "Autonomia de gerentes regionais",
                  "Gestão centralizada de CRM"
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-slate-400">
                    <ArrowRight className="text-accent-yellow shrink-0 mt-1" size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-800/40 p-8 rounded-3xl border border-slate-700/50">
              <div className="w-14 h-14 bg-accent-cyan/20 text-accent-cyan rounded-2xl flex items-center justify-center mb-6">
                <Rocket size={28} />
              </div>
              <h3 className="text-2xl font-bold mb-6">Plano 2026</h3>
              <ul className="space-y-4">
                {[
                  "Protocolo de retenção 30d antes dos picos",
                  "Dashboard de tempo real (LA DashFinance)",
                  "Reunião quinzenal de KPIs por unidade",
                  "Concentrar 60% do budget marketing em Jan/Ago",
                  "Programa de indicação estruturado"
                ].map((item, i) => (
                  <li key={i} className="flex gap-3 text-slate-400">
                    <ArrowRight className="text-accent-cyan shrink-0 mt-1" size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Closing Section */}
        <section id="closing" className="min-h-screen flex flex-col items-center justify-center px-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent-cyan/5 to-slate-950" />
          
          <div className="relative z-10 max-w-5xl">
            {/* Logos no topo */}
            <div className="flex items-center justify-center gap-8 mb-16">
              <img src="/logo-la-music-school.png" alt="LA Music School" className="h-16 object-contain" />
              <img src="/logo-la-music-kids.png" alt="LA Music Kids" className="h-16 object-contain" />
            </div>

            <h1 className="text-6xl lg:text-7xl font-grotesk font-black mb-12">
              MUITO OBRIGADO, <span className="text-accent-cyan">TIME!</span>
            </h1>
            
            <div className="space-y-6 text-xl text-slate-300 font-light mb-12 max-w-4xl mx-auto">
              <p>2025 foi desafiador. Enfrentamos obstáculos, ajustamos rotas, reinventamos estratégias... e aprendemos muito com nossos erros e acertos.</p>
              <p>Isso só foi possível porque temos um time que <span className="text-accent-cyan font-semibold">veste a camisa</span>, acredita no que faz e entrega com alma.</p>
            </div>

            <div className="text-2xl font-semibold text-white mb-12 max-w-3xl mx-auto leading-relaxed">
              Seguimos juntos, mais preparados, mais fortes — e prontos pra fazer de 2026 o nosso melhor ano!
            </div>
            
            <div className="inline-flex flex-col items-center gap-8">
              <div className="relative">
                <div className="absolute -inset-2 bg-accent-cyan rounded-full blur-xl opacity-60 animate-pulse" />
                <div className="relative px-16 py-5 bg-slate-900 border-4 border-accent-cyan rounded-full shadow-[0_0_40px_rgba(0,212,255,0.6)]">
                  <span className="text-3xl font-grotesk font-black uppercase tracking-tight text-accent-cyan">
                    Vamos com tudo para 2026!
                  </span>
                </div>
              </div>
              <div className="text-accent-cyan font-black text-2xl uppercase tracking-widest">
                LA PRA QUEM SABE O QUE QUER!
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Floating Navigation Controls */}
      <div className="fixed bottom-10 right-10 flex flex-col gap-3 z-[60]">
        <button 
          onClick={() => {
            const idx = sections.findIndex(s => s.id === activeSection);
            if (idx > 0) scrollToSection(sections[idx - 1].id);
          }}
          className="w-14 h-14 bg-slate-800/80 backdrop-blur border border-slate-700 text-slate-300 rounded-2xl flex items-center justify-center hover:bg-accent-cyan hover:text-slate-900 transition-all shadow-xl"
        >
          <ChevronUp size={24} />
        </button>
        <button 
          onClick={() => {
            const idx = sections.findIndex(s => s.id === activeSection);
            if (idx < sections.length - 1) scrollToSection(sections[idx + 1].id);
          }}
          className="w-14 h-14 bg-slate-800/80 backdrop-blur border border-slate-700 text-slate-300 rounded-2xl flex items-center justify-center hover:bg-accent-cyan hover:text-slate-900 transition-all shadow-xl"
        >
          <ChevronDown size={24} />
        </button>
      </div>
    </div>
  );
}
