import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const authUrl = new URL(
  '../supabase/functions/_shared/financeiroSyncAuthorization.ts',
  import.meta.url,
);
const PROJECT_REF = 'ouqwbbermlzqqvtqwlul';

function jwtFixture(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value))
    .toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.assinatura-fixture`;
}

test('reconhece service_role do projeto depois da validacao do gateway', async () => {
  assert.ok(existsSync(authUrl), 'helper de autorizacao financeira deve existir');
  const { isServiceRoleJwtForProject } = await import(authUrl.href);
  const token = jwtFixture({ role: 'service_role', ref: PROJECT_REF });

  assert.equal(isServiceRoleJwtForProject(token, PROJECT_REF), true);
  assert.equal(
    isServiceRoleJwtForProject(
      jwtFixture({ role: 'service_role', ref: 'outro-projeto' }),
      PROJECT_REF,
    ),
    false,
  );
  assert.equal(
    isServiceRoleJwtForProject(
      jwtFixture({ role: 'authenticated', ref: PROJECT_REF }),
      PROJECT_REF,
    ),
    false,
  );
  assert.equal(isServiceRoleJwtForProject('nao-e-jwt', PROJECT_REF), false);
});
