// Autorizacao de equipe para edges com verify_jwt=false.
//
// A chave anon e publica (vai no bundle do app) e passa no gateway, entao
// "usuario logado" nao basta: o banco tem login de professor (perfil
// 'professor'), e qualquer JWT valido chegaria aqui. A regra e a mesma
// aplicada em enviar-mensagem-admin (25/09/2026): passa quem tem segredo de
// operacao (x-sync-token / service_role) ou usuario ATIVO com perfil
// admin/unidade na tabela usuarios. Professor e anonimo levam 401/403.
//
// As dependencias de rede sao injetadas para o modulo ser testavel sem Deno
// nem Supabase de pe.

export type ResultadoAcessoEquipe =
  | { ok: true; via: 'sync_token' | 'service_role' | 'usuario' }
  | { ok: false; status: 401 | 403; erro: string };

export const PERFIS_DA_EQUIPE = ['admin', 'unidade'] as const;

export interface AcessoEquipeDeps {
  /** Valor de SYNC_MATRICULAS_ADMIN_TOKEN (vazio desliga o caminho de token). */
  syncAdminToken: string;
  serviceRoleKey: string;
  /** Resolve o usuario do JWT; null quando o token nao e de usuario valido. */
  getUser: (token: string) => Promise<{ id: string } | null>;
  /** Le usuarios pelo auth_user_id; null quando nao ha cadastro. */
  buscarUsuario: (
    authUserId: string,
  ) => Promise<{ perfil: string | null; ativo: boolean | null } | null>;
}

/** O que conta como "equipe": cadastro em `usuarios`, ativo=true, perfil admin/unidade. */
export function ehPerfilDaEquipe(
  usuario: { perfil: string | null; ativo: boolean | null } | null,
): boolean {
  return !!usuario && usuario.ativo === true &&
    PERFIS_DA_EQUIPE.includes(
      (usuario.perfil ?? '') as typeof PERFIS_DA_EQUIPE[number],
    );
}

function bearerToken(req: Request): string {
  return (req.headers.get('Authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

export async function autorizarEquipe(
  req: Request,
  deps: AcessoEquipeDeps,
): Promise<ResultadoAcessoEquipe> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (deps.syncAdminToken && syncToken && syncToken === deps.syncAdminToken) {
    return { ok: true, via: 'sync_token' };
  }

  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, erro: 'nao autenticado' };
  if (token === deps.serviceRoleKey) return { ok: true, via: 'service_role' };

  const user = await deps.getUser(token);
  if (!user) return { ok: false, status: 401, erro: 'token invalido' };

  const usuario = await deps.buscarUsuario(user.id);
  if (!ehPerfilDaEquipe(usuario)) {
    return { ok: false, status: 403, erro: 'acesso negado' };
  }

  return { ok: true, via: 'usuario' };
}
