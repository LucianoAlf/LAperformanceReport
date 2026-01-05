
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Home, BarChart3, TrendingUp, Building2, GitCompare, Calendar, 
  Target, MessageCircleQuestion, AlertTriangle, Rocket, Lightbulb, 
  Heart, Moon, Sun, ChevronUp, ChevronDown, ArrowRight,
  Users, UserPlus, UserMinus, Percent, Receipt, Clock, ShieldCheck
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Theme, MetricType, UnitData, Meta2026 } from './types';
import { UNITS, HISTORY_DATA, THEME_COLORS, MONTHS } from './constants';

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

const SectionHeader = ({ badge, title, subtitle, icon: Icon }: { badge: string, title: string, subtitle: string, icon: any }) => (
  <div className="mb-10">
    <Badge><Icon size={14} /> {badge}</Badge>
    <h2 className="text-4xl lg:text-5xl font-grotesk font-bold mt-4 mb-2 bg-gradient-to-r from-slate-50 to-accent-cyan bg-clip-text text-transparent">
      {title}
    </h2>
    <p className="text-lg text-slate-400">{subtitle}</p>
  </div>
);

const RankingCard = ({ pos, name, value, label, colorClass, gold }: { pos: number, name: string, value: string, label?: string, colorClass: string, gold?: boolean }) => (
  <div className="flex items-center gap-4 p-4 bg-slate-800/50 border border-slate-700/50 rounded-xl mb-3">
    <div className={`w-10 h-10 flex items-center justify-center font-grotesk font-bold rounded-full text-xl ${gold ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
      {pos}º
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

// --- Main App Component ---

export default function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [activeSection, setActiveSection] = useState('cover');
  const [unitTab, setUnitTab] = useState('cg');
  const [evolutionMetric, setEvolutionMetric] = useState<MetricType>('alunos');
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
            title="O Ano de 2025 em Números" 
            subtitle="Performance consolidada do Grupo LA Music"
            icon={BarChart3}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card title="Alunos Pagantes" icon={Users} trend="down" trendValue="-3,6%">
              <div className="text-5xl font-grotesk font-bold mt-2">935</div>
              <div className="text-sm text-slate-400 mt-1">Total em Dez/25</div>
            </Card>
            <Card title="Novas Matrículas" icon={UserPlus} trend="down" trendValue="-12,5%">
              <div className="text-5xl font-grotesk font-bold mt-2">602</div>
              <div className="text-sm text-slate-400 mt-1">Acumulado do Ano</div>
            </Card>
            <Card title="Evasões (Ex-Alunos)" icon={UserMinus} trend="up" trendValue="+36,3%">
              <div className="text-5xl font-grotesk font-bold mt-2 text-accent-pink">612</div>
              <div className="text-sm text-slate-400 mt-1">Acumulado do Ano</div>
            </Card>
            <Card title="Churn Rate Médio" icon={Percent} trend="up" trendValue="+0,47 p.p.">
              <div className="text-5xl font-grotesk font-bold mt-2">5,27%</div>
              <div className="text-sm text-slate-400 mt-1">Média Mensal</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <Card title="Taxa de Renovação" icon={Rocket}>
              <div className="text-4xl font-grotesk font-bold mt-2 text-accent-green">83,6%</div>
              <div className="text-sm text-slate-400 mt-1">Média do Grupo</div>
            </Card>
            <Card title="Ticket Médio" icon={Receipt} trend="up" trendValue="+3,9%">
              <div className="text-4xl font-grotesk font-bold mt-2">R$ 414</div>
              <div className="text-sm text-slate-400 mt-1">Parcelas Ativas</div>
            </Card>
            <Card title="Tempo de Permanência" icon={Clock} trend="up" trendValue="+1,7 meses">
              <div className="text-4xl font-grotesk font-bold mt-2">16</div>
              <div className="text-sm text-slate-400 mt-1">Meses em Média</div>
            </Card>
            <Card title="Inadimplência Média" icon={ShieldCheck} trend="up" trendValue="Meta Batida!">
              <div className="text-4xl font-grotesk font-bold mt-2 text-accent-green">0,81%</div>
              <div className="text-sm text-slate-400 mt-1">Total vencido &gt; 30d</div>
            </Card>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-grotesk font-bold">Distribuição por Unidade</h3>
              <div className="flex gap-6">
                {UNITS.map(u => (
                  <div key={u.id} className="flex items-center gap-2 text-sm text-slate-400">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: u.color }} />
                    {u.name} ({u.alunosDez})
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="w-full lg:w-1/3 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={UNITS}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="alunosDez"
                    >
                      {UNITS.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full space-y-6">
                {UNITS.map(u => {
                  const percent = ((u.alunosDez / 935) * 100).toFixed(1);
                  return (
                    <div key={u.id}>
                      <div className="flex justify-between text-sm font-bold mb-2">
                        <span>{u.name}</span>
                        <span style={{ color: u.color }}>{percent}%</span>
                      </div>
                      <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full transition-all duration-1000 ease-out"
                          style={{ width: `${percent}%`, backgroundColor: u.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
            subtitle="Raio-X detalhado de cada ponto de venda"
            icon={Building2}
          />

          <div className="flex gap-2 mb-8 bg-slate-900/50 p-2 rounded-2xl w-fit">
            {UNITS.map(u => (
              <button
                key={u.id}
                onClick={() => setUnitTab(u.id)}
                className={`px-8 py-3 rounded-xl text-sm font-bold transition-all ${unitTab === u.id ? 'bg-accent-cyan text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}
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
                    <span className="text-xs uppercase font-black text-slate-400 tracking-widest">Alunos Dez</span>
                    <Badge variant={u.id === 'barra' ? 'success' : 'danger'}>{u.id === 'barra' ? '+1.8%' : u.id === 'recreio' ? '-4.5%' : '-16.3%'}</Badge>
                  </div>
                  <div className="text-5xl font-grotesk font-bold mt-4" style={{ color: u.color }}>{u.alunosDez}</div>
                  <div className="text-xs text-slate-400 mt-2">Saldo: {u.id === 'cg' ? '-81' : u.id === 'recreio' ? '-14' : '+4'} alunos</div>
                </div>
                <Card title="Matrículas">
                  <div className="text-4xl font-grotesk font-bold">{u.matriculasAno}</div>
                  <div className="text-xs text-slate-400 mt-2">Média: {(u.matriculasAno / 12).toFixed(1)} /mês</div>
                </Card>
                <Card title="Evasões">
                  <div className="text-4xl font-grotesk font-bold text-accent-pink">{u.evasoesAno}</div>
                  <div className="text-xs text-slate-400 mt-2">{(u.evasoesAno / 12).toFixed(1)} saídas por mês</div>
                </Card>
                <Card title="Churn Médio">
                  <div className="text-4xl font-grotesk font-bold">{u.churnMedio}%</div>
                  <div className="text-xs text-slate-400 mt-2">Meta: 3.5%</div>
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
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                      <Legend />
                      <Bar dataKey="matriculas" fill={THEME_COLORS.green} name="Entradas" />
                      <Bar dataKey="evasoes" fill={THEME_COLORS.pink} name="Saídas" />
                    </BarChart>
                  </ResponsiveContainer>
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
            title="Quem Lidera o Grupo?" 
            subtitle="Ranking de performance cruzada entre unidades"
            icon={GitCompare}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div>
              <h4 className="text-slate-500 uppercase tracking-widest font-black text-xs mb-6">Crescimento de Base</h4>
              <RankingCard pos={1} name="Barra" value="+1,8%" colorClass="text-accent-green" gold />
              <RankingCard pos={2} name="Recreio" value="-4,5%" colorClass="text-accent-pink" />
              <RankingCard pos={3} name="Campo Grande" value="-16,3%" colorClass="text-accent-pink" />
            </div>
            <div>
              <h4 className="text-slate-500 uppercase tracking-widest font-black text-xs mb-6">Controle de Churn</h4>
              <RankingCard pos={1} name="Barra" value="4,90%" colorClass="text-accent-green" gold />
              <RankingCard pos={2} name="Recreio" value="5,01%" colorClass="text-slate-200" />
              <RankingCard pos={3} name="Campo Grande" value="5,21%" colorClass="text-accent-pink" />
            </div>
            <div>
              <h4 className="text-slate-500 uppercase tracking-widest font-black text-xs mb-6">Taxa de Renovação</h4>
              <RankingCard pos={1} name="Barra" value="87,2%" colorClass="text-accent-green" gold />
              <RankingCard pos={2} name="Recreio" value="87,0%" colorClass="text-slate-200" />
              <RankingCard pos={3} name="Campo Grande" value="76,6%" colorClass="text-accent-pink" />
            </div>
            <div>
              <h4 className="text-slate-500 uppercase tracking-widest font-black text-xs mb-6">Inadimplência</h4>
              <RankingCard pos={1} name="Barra" value="0,48%" colorClass="text-accent-green" gold />
              <RankingCard pos={2} name="Campo Grande" value="0,85%" colorClass="text-slate-200" />
              <RankingCard pos={3} name="Recreio" value="1,10%" colorClass="text-slate-200" />
            </div>
          </div>

          <div className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-12 h-[600px]">
            <h3 className="text-3xl font-grotesk font-bold mb-10 text-center">Visão 360º de Performance</h3>
            <ResponsiveContainer width="100%" height="80%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 14 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Campo Grande" dataKey="cg" stroke={THEME_COLORS.cyan} fill={THEME_COLORS.cyan} fillOpacity={0.3} />
                <Radar name="Recreio" dataKey="recreio" stroke={THEME_COLORS.pink} fill={THEME_COLORS.pink} fillOpacity={0.3} />
                <Radar name="Barra" dataKey="barra" stroke={THEME_COLORS.green} fill={THEME_COLORS.green} fillOpacity={0.3} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Seasonality Heatmap */}
        <section id="seasonality" className="min-h-screen py-24 px-12">
          <SectionHeader 
            badge="Sazonalidade" 
            title="Padrões de Risco e Oportunidade" 
            subtitle="Identificando quando agir para maximizar resultados"
            icon={Calendar}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="p-8 bg-accent-pink/5 border border-accent-pink/20 rounded-3xl">
              <h4 className="flex items-center gap-2 text-2xl font-grotesk font-bold text-accent-pink mb-4">
                <AlertTriangle /> Meses de ALTO RISCO
              </h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-4xl font-black font-grotesk text-accent-pink">FEVEREIRO</div>
                  <div className="text-sm text-slate-400 mt-1">Pós-férias + Reajuste. <br/>81 evasões em 2025.</div>
                </div>
                <div>
                  <div className="text-4xl font-black font-grotesk text-accent-pink">MAIO</div>
                  <div className="text-sm text-slate-400 mt-1">Fim do ciclo semestral. <br/>73 evasões em 2025.</div>
                </div>
              </div>
            </div>
            <div className="p-8 bg-accent-green/5 border border-accent-green/20 rounded-3xl">
              <h4 className="flex items-center gap-2 text-2xl font-grotesk font-bold text-accent-green mb-4">
                <Rocket /> Meses de OURO
              </h4>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-4xl font-black font-grotesk text-accent-green">JANEIRO</div>
                  <div className="text-sm text-slate-400 mt-1">Metas de ano novo. <br/>Recorde histórico de captação.</div>
                </div>
                <div>
                  <div className="text-4xl font-black font-grotesk text-accent-green">AGOSTO</div>
                  <div className="text-sm text-slate-400 mt-1">Volta às aulas (2º sem). <br/>86 matrículas em 2025.</div>
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
          
          <div className="relative z-10 max-w-4xl">
            <h1 className="text-7xl lg:text-8xl font-grotesk font-black mb-12">
              MUITO OBRIGADO, <span className="text-accent-cyan">TIME!</span>
            </h1>
            
            <div className="space-y-8 text-2xl text-slate-400 font-light mb-16">
              <p>2025 foi um ano de reajuste, aprendizado e resiliência.</p>
              <p>Seguimos juntos, mais preparados e prontos para fazer de 2026 o nosso <span className="text-white font-bold">melhor ano histórico</span>.</p>
            </div>
            
            <div className="inline-flex flex-col items-center">
              <div className="px-12 py-6 bg-gradient-to-r from-accent-cyan/20 to-accent-pink/20 border-2 border-white/10 rounded-3xl backdrop-blur-md mb-8">
                <span className="text-4xl font-grotesk font-black uppercase tracking-tighter">Vamos com tudo para 2026!</span>
              </div>
              <div className="text-accent-cyan font-black text-2xl uppercase tracking-widest">
                L.A. Pra quem sabe o que quer!
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
