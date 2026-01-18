import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface PrivateRouteProps {
  requireAdmin?: boolean;
}

export function PrivateRoute({ requireAdmin = false }: PrivateRouteProps) {
  const { user, usuario, loading, isAdmin } = useAuth();

  // Mostra loading enquanto verifica autenticação
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  // Se não está logado, redireciona para login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Se não tem registro na tabela usuarios, redireciona para login
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  // Se usuário está inativo, redireciona para login
  if (!usuario.ativo) {
    return <Navigate to="/login" replace />;
  }

  // Se rota requer admin e usuário não é admin
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/app" replace />;
  }

  // Usuário autenticado, renderiza a rota
  return <Outlet />;
}

export default PrivateRoute;
