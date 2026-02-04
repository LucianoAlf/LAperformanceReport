import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  LogIn, 
  Mail, 
  Lock, 
  BarChart3, 
  Target, 
  Users, 
  Calendar, 
  Bot,
  TrendingUp,
  ChevronRight
} from 'lucide-react';

// Features do sistema para exibir no lado esquerdo
const features = [
  {
    icon: BarChart3,
    title: 'Dashboards em Tempo Real',
    description: 'KPIs de performance atualizados instantaneamente'
  },
  {
    icon: Target,
    title: 'Metas & Gamificação',
    description: 'Programas Matriculador+, Fideliza+ e Professor+ LA'
  },
  {
    icon: Users,
    title: 'Gestão de Alunos',
    description: 'Matrículas, renovações e controle de churn'
  },
  {
    icon: Calendar,
    title: 'Agenda Inteligente',
    description: 'Horários e salas otimizados automaticamente'
  },
  {
    icon: Bot,
    title: 'Jarvis IA',
    description: 'Assistente inteligente para insights e análises'
  },
  {
    icon: TrendingUp,
    title: 'Relatórios Avançados',
    description: 'Análises detalhadas por unidade e período'
  }
];

// Animações
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.5, ease: 'easeOut' }
  }
};

const formVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' }
  }
};

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Preencha email e senha');
      return;
    }

    setLoading(true);
    
    try {
      const loginPromise = (async () => {
        await signOut();
        const { error } = await signIn(email, password);
        return { error };
      })();
      
      const timeoutPromise = new Promise<{ error: Error }>((resolve) => 
        setTimeout(() => resolve({ error: new Error('Timeout no login') }), 10000)
      );

      const { error } = await Promise.race([loginPromise, timeoutPromise]);
      
      if (error) {
        toast.error(error.message === 'Timeout no login' ? 'Login demorou demais, tente novamente' : 'Email ou senha incorretos');
        return;
      }

      toast.success('Login realizado com sucesso!');
      navigate('/app');
    } catch (err) {
      console.error('Erro no login:', err);
      toast.error('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ========== LADO ESQUERDO - Imagem + Features ========== */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Imagem de fundo */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/split-screen-krissya.png)' }}
        />
        
        {/* Overlay gradiente roxo/azul */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-950/80 via-slate-900/70 to-blue-950/80" />
        
        {/* Elementos decorativos flutuantes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Círculo roxo blur */}
          <motion.div 
            className="absolute -top-20 -left-20 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl"
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.2, 0.3, 0.2]
            }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Círculo azul blur */}
          <motion.div 
            className="absolute bottom-20 right-10 w-80 h-80 bg-cyan-500/15 rounded-full blur-3xl"
            animate={{ 
              scale: [1, 1.15, 1],
              opacity: [0.15, 0.25, 0.15]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
          {/* Círculo magenta */}
          <motion.div 
            className="absolute top-1/2 left-1/3 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl"
            animate={{ 
              y: [-20, 20, -20],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          />
        </div>

        {/* Conteúdo */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo LA Music Report */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <img 
              src="/logo-sidebar-la-music-report.png" 
              alt="LA Music Report" 
              className="h-12 w-auto"
            />
          </motion.div>

          {/* Features */}
          <motion.div 
            className="flex-1 flex flex-col justify-center max-w-lg"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.h2 
              className="text-3xl font-bold text-white mb-3"
              variants={itemVariants}
            >
              Tudo que nosso Time precisa
            </motion.h2>
            <motion.p 
              className="text-gray-400 mb-10 text-lg"
              variants={itemVariants}
            >
              Gestão completa da LA Music em um só lugar
            </motion.p>

            <div className="space-y-4">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  className="group flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 hover:border-cyan-500/30 transition-all duration-300 cursor-default"
                  variants={itemVariants}
                  whileHover={{ x: 8, transition: { duration: 0.2 } }}
                >
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center group-hover:from-cyan-500/30 group-hover:to-violet-500/30 transition-all">
                    <feature.icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium text-sm mb-0.5">{feature.title}</h3>
                    <p className="text-gray-500 text-xs">{feature.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-cyan-400 transition-colors flex-shrink-0 mt-1" />
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Footer */}
          <motion.p 
            className="text-gray-600 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            © 2026 LA Music School. Todos os direitos reservados.
          </motion.p>
        </div>
      </div>

      {/* ========== LADO DIREITO - Formulário de Login ========== */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-[#0a0a0f] relative overflow-hidden">
        {/* Efeitos de nuvem no fundo - roxo/azul */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
          {/* Nuvem roxa - canto superior direito */}
          <motion.div 
            className="absolute inset-0"
            style={{ 
              background: 'radial-gradient(ellipse 80% 60% at 85% 15%, rgba(139,92,246,0.45) 0%, rgba(124,58,237,0.15) 40%, transparent 70%)',
            }}
            animate={{ 
              opacity: [0.7, 0.9, 0.7],
            }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Nuvem azul - canto inferior esquerdo */}
          <motion.div 
            className="absolute inset-0"
            style={{ 
              background: 'radial-gradient(ellipse 70% 50% at 15% 85%, rgba(59,130,246,0.4) 0%, rgba(37,99,235,0.1) 45%, transparent 70%)',
            }}
            animate={{ 
              opacity: [0.6, 0.8, 0.6],
            }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          />
        </div>

        <motion.div 
          className="w-full max-w-md relative z-10"
          variants={formVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <img 
              src="/logo-sidebar-la-music-report.png" 
              alt="LA Music Report" 
              className="h-10 w-auto mx-auto mb-4"
            />
          </div>

          {/* Header */}
          <div className="text-center mb-10">
            <motion.h1 
              className="text-3xl font-bold text-white mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Bem-vindo de volta
            </motion.h1>
            <motion.p 
              className="text-gray-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Acesse sua conta para continuar
            </motion.p>
          </div>

          {/* Card de Login - Glassmorphism */}
          <motion.div 
            className="relative bg-white/[0.05] backdrop-blur-xl border border-white/[0.15] rounded-3xl p-8 shadow-2xl shadow-violet-950/30"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
            }}
          >
            {/* Brilho nas bordas - efeito vidro */}
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
              {/* Brilho superior esquerdo */}
              <div className="absolute -top-px -left-px w-1/2 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <div className="absolute -top-px -left-px h-1/2 w-px bg-gradient-to-b from-transparent via-white/30 to-transparent" />
              {/* Brilho inferior direito sutil */}
              <div className="absolute -bottom-px -right-px w-1/3 h-px bg-gradient-to-l from-transparent via-cyan-400/20 to-transparent" />
              <div className="absolute -bottom-px -right-px h-1/3 w-px bg-gradient-to-t from-transparent via-cyan-400/20 to-transparent" />
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Email
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-cyan-500 transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-cyan-500/10 transition-all backdrop-blur-sm"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Senha
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-cyan-500 transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-cyan-500/10 transition-all backdrop-blur-sm"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {/* Botão de Login */}
              <motion.button
                type="submit"
                disabled={loading}
                className="relative w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold py-4 rounded-xl hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Efeito de brilho */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                
                <LogIn className="w-5 h-5" />
                {loading ? 'Entrando...' : 'Entrar no Sistema'}
              </motion.button>
            </form>

            {/* Divisor */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-gray-600 text-xs uppercase tracking-wider">Acesso restrito</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Info */}
            <p className="text-center text-gray-600 text-sm">
              Apenas membros autorizados da equipe LA Music podem acessar este sistema.
            </p>
          </motion.div>

          {/* Footer mobile */}
          <p className="lg:hidden text-center text-gray-700 text-xs mt-8">
            © 2026 LA Music School. Todos os direitos reservados.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default LoginPage;
