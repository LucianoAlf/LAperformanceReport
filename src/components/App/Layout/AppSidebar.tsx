import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Target,
  Settings,
  LogOut,
  FolderArchive,
  BarChart3,
  Briefcase,
  ClipboardList,
  Users,
  Shield,
  UserCog,
  GraduationCap,
  Layers,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Building2,
  FolderKanban,
  Pencil,
  Key,
  Camera
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { Tooltip } from '../../ui/Tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { ModalEditarPerfil } from './ModalEditarPerfil';

const menuItems = [
  { path: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { path: '/app/gestao-mensal', label: 'Analytics', icon: BarChart3 },
  { path: '/app/metas', label: 'Metas', icon: Target },
  { path: '/app/config', label: 'Configurações', icon: Settings },
];

const operacional = [
  { path: '/app/comercial', label: 'Comercial', icon: Briefcase },
  { path: '/app/administrativo', label: 'Administrativo', icon: ClipboardList },
  { path: '/app/alunos', label: 'Alunos', icon: Users },
  { path: '/app/professores', label: 'Professores', icon: GraduationCap },
  { path: '/app/projetos', label: 'Projetos', icon: FolderKanban },
  { path: '/app/salas', label: 'Salas', icon: Building2 },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { usuario, isAdmin, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });
  const [modalPerfilAberto, setModalPerfilAberto] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className={`fixed left-0 top-0 h-screen bg-slate-900/95 backdrop-blur-sm border-r border-slate-800 flex flex-col z-50 transition-all duration-300 ${
      isCollapsed ? 'w-24' : 'w-64'
    }`}>
      {/* Logo */}
      <div className="p-6 border-b border-slate-800 relative">
        {!isCollapsed && (
          <div className="flex items-center">
            <img 
              src="/logo-sidebar-la-music-report.png" 
              alt="LA Music Report" 
              className="h-12 w-auto"
            />
          </div>
        )}
        {isCollapsed && (
          <div className="flex justify-center items-center py-2">
            <img 
              src="/logo-la-icon.png" 
              alt="LA" 
              className="w-10 h-auto"
            />
          </div>
        )}
      </div>

      {/* Botão de colapsar - flutuante na borda */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-8 -right-3 p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700 shadow-md z-10"
        title={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Menu Principal */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {!isCollapsed && (
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-3 px-3 flex items-center gap-2">
            <Layers className="w-3 h-3" /> Sistema
          </div>
        )}
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.path} content={item.label} enabled={isCollapsed}>
              <NavLink
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  isCollapsed
                    ? "w-full flex items-center justify-center py-3"
                    : `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
                      }`
                }
                style={isCollapsed ? { background: 'none', border: 'none', boxShadow: 'none', outline: 'none' } : {}}
              >
                <Icon className={`w-5 h-5 ${isCollapsed ? (item.path === window.location.pathname || (item.end && window.location.pathname === item.path) ? 'text-cyan-400' : 'text-gray-400 hover:text-white') : ''}`} />
                {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </NavLink>
            </Tooltip>
          );
        })}

        {/* Operacional */}
        <div className="mt-6 border-t border-slate-800" />
        {!isCollapsed && (
          <div className="text-xs text-slate-500 uppercase tracking-wider pt-4 mb-3 px-3 flex items-center gap-2">
            <Wrench className="w-3 h-3" /> Operacional
          </div>
        )}
        {operacional.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.path} content={item.label} enabled={isCollapsed}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  isCollapsed
                    ? "w-full flex items-center justify-center py-2.5"
                    : `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
                      }`
                }
                style={isCollapsed ? { background: 'none', border: 'none', boxShadow: 'none', outline: 'none' } : {}}
              >
                <Icon className={`w-5 h-5 ${isCollapsed ? (item.path === window.location.pathname ? 'text-emerald-400' : 'text-gray-400 hover:text-white') : ''}`} />
                {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </NavLink>
            </Tooltip>
          );
        })}

        {/* Admin Menu - apenas para admin */}
        {isAdmin && (
          <>
            <div className="mt-6 border-t border-slate-800" />
            {!isCollapsed && (
              <div className="text-xs text-slate-500 uppercase tracking-wider pt-4 mb-3 px-3 flex items-center gap-2">
                <Shield className="w-3 h-3" /> Admin
              </div>
            )}
            <Tooltip content="Gerenciar Usuários" enabled={isCollapsed}>
              <NavLink
                to="/app/admin/usuarios"
                className={({ isActive }) =>
                  isCollapsed
                    ? "w-full flex items-center justify-center py-3"
                    : `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border border-purple-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
                      }`
                }
                style={isCollapsed ? { background: 'none', border: 'none', boxShadow: 'none', outline: 'none' } : {}}
              >
                <UserCog className={`w-5 h-5 ${isCollapsed ? (window.location.pathname === "/app/admin/usuarios" ? 'text-purple-400' : 'text-gray-400 hover:text-white') : ''}`} />
                {!isCollapsed && <span className="text-sm font-medium">Gerenciar Usuários</span>}
              </NavLink>
            </Tooltip>
            <Tooltip content="Permissões" enabled={isCollapsed}>
              <NavLink
                to="/app/admin/permissoes"
                className={({ isActive }) =>
                  isCollapsed
                    ? "w-full flex items-center justify-center py-3"
                    : `w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border border-purple-500/30'
                          : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
                      }`
                }
                style={isCollapsed ? { background: 'none', border: 'none', boxShadow: 'none', outline: 'none' } : {}}
              >
                <Shield className={`w-5 h-5 ${isCollapsed ? (window.location.pathname === "/app/admin/permissoes" ? 'text-purple-400' : 'text-gray-400 hover:text-white') : ''}`} />
                {!isCollapsed && <span className="text-sm font-medium">Permissões</span>}
              </NavLink>
            </Tooltip>
          </>
        )}

        {/* Separador */}
        <div className="mt-6 border-t border-slate-800" />

        {/* Histórico */}
        {!isCollapsed && (
          <div className="text-xs text-slate-500 uppercase tracking-wider pt-4 mb-3 px-3 flex items-center gap-2">
            <FolderArchive className="w-3 h-3" /> Histórico
          </div>
        )}
        <Tooltip content="Apresentações 2025" enabled={isCollapsed}>
          <NavLink
            to="/app/apresentacoes-2025"
            className={({ isActive }) =>
              isCollapsed
                ? "w-full flex items-center justify-center py-2.5"
                : `w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800/30'
                  }`
            }
            style={isCollapsed ? { background: 'none', border: 'none', boxShadow: 'none', outline: 'none' } : {}}
          >
            <FolderArchive className={`w-4 h-4 ${isCollapsed ? (window.location.pathname === "/app/apresentacoes-2025" ? 'text-white' : 'text-gray-500 hover:text-gray-300') : ''}`} />
            {!isCollapsed && <span className="font-medium">Apresentações 2025</span>}
          </NavLink>
        </Tooltip>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-xl hover:bg-slate-800/50 transition-colors`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                isAdmin 
                  ? 'bg-gradient-to-br from-purple-500 to-pink-600' 
                  : 'bg-gradient-to-br from-cyan-500 to-blue-600'
              }`}
              title={isCollapsed ? usuario?.nome || 'Usuário' : ''}>
                {usuario?.nome?.charAt(0).toUpperCase() || 'U'}
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex-1 text-left">
                    <div className="text-sm text-white font-medium">{usuario?.nome || 'Usuário'}</div>
                    <div className="text-xs text-gray-500">
                      {isAdmin ? 'Admin (todas)' : usuario?.unidade_nome || 'Unidade'}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56 bg-slate-800 border-slate-700">
            <DropdownMenuLabel className="text-slate-400">Minha Conta</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem 
              onClick={() => setModalPerfilAberto(true)}
              className="cursor-pointer text-white hover:bg-slate-700 focus:bg-slate-700"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Editar Perfil
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setModalPerfilAberto(true)}
              className="cursor-pointer text-white hover:bg-slate-700 focus:bg-slate-700"
            >
              <Key className="w-4 h-4 mr-2" />
              Alterar Senha
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem 
              onClick={handleLogout}
              className="cursor-pointer text-red-400 hover:bg-slate-700 focus:bg-slate-700 hover:text-red-300"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Modal Editar Perfil */}
      <ModalEditarPerfil 
        open={modalPerfilAberto} 
        onOpenChange={setModalPerfilAberto} 
      />
    </aside>
  );
}

export default AppSidebar;
