import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface CanProps {
  /** Código da permissão necessária (ex: 'alunos.editar') */
  permission?: string;
  /** Lista de permissões - usuário precisa ter pelo menos uma */
  permissions?: string[];
  /** Se true, usuário precisa ter TODAS as permissões listadas */
  requireAll?: boolean;
  /** Conteúdo a ser renderizado se tiver permissão */
  children: ReactNode;
  /** Conteúdo alternativo se não tiver permissão */
  fallback?: ReactNode;
}

/**
 * Componente para controle de acesso visual baseado em permissões.
 * 
 * Exemplos de uso:
 * 
 * ```tsx
 * // Permissão única
 * <Can permission="alunos.editar">
 *   <Button>Editar Aluno</Button>
 * </Can>
 * 
 * // Múltiplas permissões (qualquer uma)
 * <Can permissions={['alunos.editar', 'alunos.criar']}>
 *   <Button>Gerenciar Aluno</Button>
 * </Can>
 * 
 * // Múltiplas permissões (todas necessárias)
 * <Can permissions={['alunos.editar', 'alunos.excluir']} requireAll>
 *   <Button>Ações Avançadas</Button>
 * </Can>
 * 
 * // Com fallback
 * <Can permission="usuarios.criar" fallback={<span>Sem permissão</span>}>
 *   <Button>Criar Usuário</Button>
 * </Can>
 * ```
 */
export function Can({ 
  permission, 
  permissions, 
  requireAll = false, 
  children, 
  fallback = null 
}: CanProps) {
  const { hasPermission, hasAnyPermission, isAdmin } = useAuth();

  // Admin antigo tem acesso total
  if (isAdmin) {
    return <>{children}</>;
  }

  // Verificar permissão única
  if (permission) {
    return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
  }

  // Verificar múltiplas permissões
  if (permissions && permissions.length > 0) {
    if (requireAll) {
      // Precisa ter TODAS as permissões
      const hasAll = permissions.every(p => hasPermission(p));
      return hasAll ? <>{children}</> : <>{fallback}</>;
    } else {
      // Precisa ter pelo menos UMA permissão
      return hasAnyPermission(permissions) ? <>{children}</> : <>{fallback}</>;
    }
  }

  // Se não especificou permissão, renderiza o conteúdo
  return <>{children}</>;
}

/**
 * Hook para verificar permissões de forma imperativa.
 * Útil quando você precisa verificar permissões fora do JSX.
 * 
 * Exemplo:
 * ```tsx
 * const { can, canAny, canAll } = useCan();
 * 
 * if (can('alunos.editar')) {
 *   // fazer algo
 * }
 * ```
 */
export function useCan() {
  const { hasPermission, hasAnyPermission, isAdmin } = useAuth();

  return {
    /** Verifica se tem uma permissão específica */
    can: (permission: string) => isAdmin || hasPermission(permission),
    
    /** Verifica se tem pelo menos uma das permissões */
    canAny: (permissions: string[]) => isAdmin || hasAnyPermission(permissions),
    
    /** Verifica se tem todas as permissões */
    canAll: (permissions: string[]) => isAdmin || permissions.every(p => hasPermission(p)),
  };
}

export default Can;
