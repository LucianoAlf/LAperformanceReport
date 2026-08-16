/**
 * Interpreta somente o claim de um JWT que ja passou pelo gateway da Edge.
 * Nunca use este helper em uma funcao com verify_jwt=false: ele nao valida assinatura.
 */
export function isServiceRoleJwtForProject(
  token: string,
  expectedProjectRef: string,
): boolean {
  if (!token || !expectedProjectRef) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const claims = JSON.parse(atob(payload)) as Record<string, unknown>;
    return claims.role === 'service_role' && claims.ref === expectedProjectRef;
  } catch {
    return false;
  }
}
