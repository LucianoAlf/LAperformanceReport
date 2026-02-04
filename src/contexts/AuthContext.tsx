import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Usuario {
  id: number;
  email: string;
  nome: string;
  apelido?: string;
  avatar_url?: string;
  perfil: 'admin' | 'unidade';
  unidade_id: string | null;
  unidade_nome?: string;
  ativo: boolean;
}

// Interface para perfis do novo sistema
export interface PerfilUsuario {
  perfil_id: string;
  perfil_nome: string;
  perfil_nivel: number;
  perfil_icone: string;
  perfil_cor: string;
  unidade_id: string | null;
  unidade_nome: string | null;
}

// Interface para permissões
export interface Permissao {
  codigo: string;
  modulo: string;
  acao: string;
  descricao: string;
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
  refreshUser: () => Promise<void>;
  // Novo sistema de permissões
  perfis: PerfilUsuario[];
  permissoes: Set<string>;
  hasPermission: (codigo: string) => boolean;
  hasAnyPermission: (codigos: string[]) => boolean;
  refreshPermissoes: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Novo sistema de permissões
  const [perfis, setPerfis] = useState<PerfilUsuario[]>([]);
  const [permissoes, setPermissoes] = useState<Set<string>>(new Set());

  // Buscar dados do usuário na tabela usuarios - com timeout
  const fetchUsuario = async (userId: string, userEmail?: string): Promise<Usuario | null> => {
    try {
      // Query com timeout usando Promise.race
      const queryPromise = supabase
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', userId)
        .single();
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error && error.code !== 'PGRST116') {
        console.error('Erro ao buscar usuário:', error);
        return null;
      }

      // Se não encontrou o usuário, criar automaticamente para admins conhecidos
      if (!data && userEmail) {
        const email = userEmail.toLowerCase();
        const isKnownAdmin = email === 'lucianoalf.la@gmail.com' || email === 'rh@lamusicschool.com.br';

        if (isKnownAdmin) {
          const { data: newUser, error: insertError } = await supabase
            .from('usuarios')
            .insert({
              nome: email === 'lucianoalf.la@gmail.com' ? 'Luciano Alf' : 'Ana Paula',
              email: email,
              perfil: 'admin',
              unidade_id: null,
              auth_user_id: userId,
              ativo: true
            })
            .select()
            .single();

          if (insertError) {
            console.error('Erro ao criar usuário:', insertError);
            return null;
          }

          return {
            id: newUser.id,
            email: newUser.email,
            nome: newUser.nome,
            perfil: newUser.perfil as 'admin' | 'unidade',
            unidade_id: newUser.unidade_id,
            unidade_nome: null,
            ativo: newUser.ativo,
          };
        }
        return null;
      }

      if (!data) return null;

      // Buscar nome da unidade apenas se necessário
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
        apelido: data.apelido,
        avatar_url: data.avatar_url,
        perfil: data.perfil as 'admin' | 'unidade',
        unidade_id: data.unidade_id,
        unidade_nome: unidadeNome,
        ativo: data.ativo,
      };
    } catch (err) {
      console.error('Erro no fetchUsuario:', err);
      return null;
    }
  };

  // Função para carregar permissões do novo sistema
  const fetchPermissoes = useCallback(async (usuarioId: number, isAdminAntigo: boolean) => {
    try {
      // Se é admin antigo, carrega TODAS as permissões
      if (isAdminAntigo) {
        const { data: todasPermissoes } = await supabase
          .from('permissoes')
          .select('codigo')
          .eq('ativo', true);
        
        if (todasPermissoes) {
          setPermissoes(new Set(todasPermissoes.map(p => p.codigo)));
        }
        
        // Admin antigo não precisa de perfis do novo sistema
        setPerfis([]);
        return;
      }

      // Buscar perfis do usuário
      const { data: perfisData } = await supabase
        .rpc('usuario_perfis_lista', { p_usuario_id: usuarioId });
      
      if (perfisData) {
        setPerfis(perfisData as PerfilUsuario[]);
      }

      // Buscar permissões do usuário
      const { data: permissoesData } = await supabase
        .rpc('usuario_permissoes', { p_usuario_id: usuarioId });
      
      if (permissoesData) {
        setPermissoes(new Set(permissoesData.map((p: Permissao) => p.codigo)));
      }
    } catch (err) {
      console.error('Erro ao carregar permissões:', err);
    }
  }, []);

  // Função para verificar se tem uma permissão específica
  const hasPermission = useCallback((codigo: string): boolean => {
    // Admin antigo tem TODAS as permissões
    if (usuario?.perfil === 'admin') return true;
    
    // Verifica permissão direta
    if (permissoes.has(codigo)) return true;
    
    // Verifica permissão pai (ex: 'administrativo.lojinha' para 'administrativo.lojinha.vender')
    const partes = codigo.split('.');
    for (let i = partes.length - 1; i > 0; i--) {
      const pai = partes.slice(0, i).join('.');
      if (permissoes.has(pai)) return true;
    }
    
    return false;
  }, [usuario?.perfil, permissoes]);

  // Função para verificar se tem alguma das permissões
  const hasAnyPermission = useCallback((codigos: string[]): boolean => {
    return codigos.some(codigo => hasPermission(codigo));
  }, [hasPermission]);

  // Função para recarregar permissões (útil após alterações)
  const refreshPermissoes = useCallback(async () => {
    if (usuario) {
      await fetchPermissoes(usuario.id, usuario.perfil === 'admin');
    }
  }, [usuario, fetchPermissoes]);

  useEffect(() => {
    let mounted = true;
    
    // Timeout de segurança reduzido para 5 segundos
    const safetyTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Timeout de autenticação - forçando fim do loading');
        setLoading(false);
      }
    }, 5000);

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !mounted) {
          if (mounted) setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const usuarioData = await fetchUsuario(session.user.id, session.user.email);
          if (mounted) {
            setUsuario(usuarioData);
            // Carregar permissões após obter dados do usuário
            if (usuarioData) {
              await fetchPermissoes(usuarioData.id, usuarioData.perfil === 'admin');
            }
          }
        }
      } catch (error) {
        console.error('Erro ao carregar sessão:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // Listener de mudanças de auth - NÃO bloqueia o fluxo
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Busca em background, não bloqueia
          fetchUsuario(session.user.id, session.user.email).then(data => {
            if (mounted) {
              setUsuario(data);
              // Carregar permissões após obter dados do usuário
              if (data) {
                fetchPermissoes(data.id, data.perfil === 'admin');
              }
            }
          });
        } else {
          setUsuario(null);
          setPerfis([]);
          setPermissoes(new Set());
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
    setPerfis([]);
    setPermissoes(new Set());
  };

  const isAdmin = usuario?.perfil === 'admin';
  const unidadeId = usuario?.unidade_id ?? null;

  const canViewConsolidated = () => isAdmin;
  const canManageUsers = () => isAdmin;

  // Função para recarregar dados do usuário
  const refreshUser = async () => {
    if (!user) return;
    const usuarioData = await fetchUsuario(user.id, user.email);
    if (usuarioData) {
      setUsuario(usuarioData);
    }
  };

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
    refreshUser,
    // Novo sistema de permissões
    perfis,
    permissoes,
    hasPermission,
    hasAnyPermission,
    refreshPermissoes,
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
