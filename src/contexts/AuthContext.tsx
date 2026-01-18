import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  perfil: 'admin' | 'unidade';
  unidade_id: string | null;
  unidade_nome?: string;
  ativo: boolean;
}

interface AuthContextType {
  user: User | null;
  usuario: Usuario | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  unidadeId: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  canViewConsolidated: () => boolean;
  canManageUsers: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Buscar dados do usuário na tabela usuarios
  const fetchUsuario = async (userId: string): Promise<Usuario | null> => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', userId)
        .single();

      if (error) {
        console.error('Erro ao buscar usuário:', error);
        return null;
      }

      if (!data) {
        console.warn('Usuário não encontrado na tabela usuarios');
        return null;
      }

      // Buscar nome da unidade separadamente se não for admin
      let unidadeNome = null;
      if (data.unidade_id) {
        const { data: unidadeData } = await supabase
          .from('unidades')
          .select('nome')
          .eq('id', data.unidade_id)
          .single();
        
        unidadeNome = unidadeData?.nome || null;
      }

      return {
        id: data.id,
        email: data.email,
        nome: data.nome,
        perfil: data.perfil as 'admin' | 'unidade',
        unidade_id: data.unidade_id,
        unidade_nome: unidadeNome,
        ativo: data.ativo,
      };
    } catch (err) {
      console.error('Erro inesperado no fetchUsuario:', err);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    
    // Timeout de segurança: se após 10 segundos ainda estiver carregando, força o fim
    const safetyTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('⚠️ Timeout de autenticação atingido. Forçando fim do carregamento.');
        setLoading(false);
      }
    }, 10000);

    // Verificar sessão atual
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Erro ao obter sessão:', error);
          if (mounted) setLoading(false);
          return;
        }

        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const usuarioData = await fetchUsuario(session.user.id);
          if (mounted) setUsuario(usuarioData);
        }
      } catch (error) {
        console.error('Erro ao carregar sessão:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        
        try {
          setSession(session);
          setUser(session?.user ?? null);
          
          if (session?.user) {
            const usuarioData = await fetchUsuario(session.user.id);
            if (mounted) setUsuario(usuarioData);
          } else {
            if (mounted) setUsuario(null);
          }
        } catch (error) {
          console.error('Erro ao processar mudança de autenticação:', error);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUsuario(null);
    setSession(null);
  };

  const isAdmin = usuario?.perfil === 'admin';
  const unidadeId = usuario?.unidade_id ?? null;

  const canViewConsolidated = () => isAdmin;
  const canManageUsers = () => isAdmin;

  const value: AuthContextType = {
    user,
    usuario,
    session,
    loading,
    isAdmin,
    unidadeId,
    signIn,
    signOut,
    canViewConsolidated,
    canManageUsers,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
