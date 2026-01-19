import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Target,
  Settings,
  LogOut,
  FolderArchive,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Shield,
  Table2,
  Camera,
  GraduationCap
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

const menuItems = [
  { path: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/app/gestao-mensal', label: 'Analytics', icon: BarChart3 },
  { path: '/app/entrada', label: 'Entrada de Dados', icon: PlusCircle },
  { path: '/app/metas', label: 'Metas', icon: Target },
  { path: '/app/config', label: 'Configurações', icon: Settings },
];

const planilhas = [
  { path: '/app/comercial', label: 'Comercial (Hunters)', icon: TrendingUp },
  { path: '/app/retencao', label: 'Retenção (Farmers)', icon: TrendingDown },
  { path: '/app/professores', label: 'Professores', icon: GraduationCap },
  { path: '/app/snapshot', label: 'Snapshot Diário', icon: Camera },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { usuario, isAdmin, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className="fixed left-0 top-0 w-64 h-screen bg-slate-900/95 backdrop-blur-sm border-r border-slate-800 flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <img 
            src="/logo-la-music-school.png" 
            alt="LA Music School" 
            className="h-8 w-auto"
          />
          <img 
            src="/logo-la-music-kids.png" 
            alt="LA Music Kids" 
            className="h-8 w-auto"
          />
        </div>
        <div className="mt-3">
          <span className="text-xs text-cyan-400 font-medium bg-cyan-500/10 px-2 py-1 rounded-full inline-flex items-center gap-1">
            <LayoutDashboard className="w-3 h-3" /> Sistema de Gestão 2026
          </span>
        </div>
      </div>

      {/* Menu Principal */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 px-3">
          Sistema
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {/* Planilhas Inline */}
        <div className="my-4 border-t border-slate-800" />
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 px-3 flex items-center gap-2">
          <Table2 className="w-3 h-3" /> Planilhas
        </div>
        {planilhas.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        {/* Admin Menu - apenas para admin */}
        {isAdmin && (
          <>
            <div className="my-4 border-t border-slate-800" />
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 px-3 flex items-center gap-2">
              <Shield className="w-3 h-3" /> Admin
            </div>
            <NavLink
              to="/app/admin/usuarios"
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border border-purple-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
                }`
              }
            >
              <Users className="w-5 h-5" />
              <span className="text-sm font-medium">Gerenciar Usuários</span>
            </NavLink>
          </>
        )}

        {/* Separador */}
        <div className="my-4 border-t border-slate-800" />

        {/* Histórico */}
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2 px-3 flex items-center gap-2">
          <FolderArchive className="w-3 h-3" /> Histórico
        </div>
        <NavLink
          to="/app/apresentacoes-2025"
          className={({ isActive }) =>
            `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm ${
              isActive
                ? 'bg-slate-800 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800/30'
            }`
          }
        >
          <BarChart3 className="w-4 h-4" />
          <span className="font-medium">Apresentações 2025</span>
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
            isAdmin 
              ? 'bg-gradient-to-br from-purple-500 to-pink-600' 
              : 'bg-gradient-to-br from-cyan-500 to-blue-600'
          }`}>
            {usuario?.nome?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <div className="text-sm text-white font-medium">{usuario?.nome || 'Usuário'}</div>
            <div className="text-xs text-gray-500">
              {isAdmin ? 'Admin (todas)' : usuario?.unidade_nome || 'Unidade'}
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-500 hover:text-red-400 transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default AppSidebar;
