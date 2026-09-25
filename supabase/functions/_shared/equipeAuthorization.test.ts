import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import {
  autorizarEquipe,
  ehPerfilDaEquipe,
  type AcessoEquipeDeps,
} from './equipeAuthorization.ts';

const SYNC_TOKEN = 'sync-token-valido';
const SERVICE_KEY = 'service-role-key-valida';
const USER_ID = 'auth-user-1';

function req(init: { headers?: Record<string, string> } = {}): Request {
  return new Request('https://exemplo.local/fn', {
    method: 'POST',
    headers: init.headers ?? {},
  });
}

function deps(parcial: Partial<AcessoEquipeDeps> = {}): AcessoEquipeDeps {
  return {
    syncAdminToken: SYNC_TOKEN,
    serviceRoleKey: SERVICE_KEY,
    getUser: () => Promise.resolve({ id: USER_ID }),
    buscarUsuario: () => Promise.resolve({ perfil: 'admin', ativo: true }),
    ...parcial,
  };
}

Deno.test('x-sync-token correto passa sem Authorization', async () => {
  const r = await autorizarEquipe(
    req({ headers: { 'x-sync-token': SYNC_TOKEN } }),
    deps(),
  );
  assertEquals(r, { ok: true, via: 'sync_token' });
});

Deno.test('x-sync-token errado nao passa e cai na regra de bearer', async () => {
  const r = await autorizarEquipe(
    req({ headers: { 'x-sync-token': 'errado' } }),
    deps(),
  );
  assertEquals(r, { ok: false, status: 401, erro: 'nao autenticado' });
});

Deno.test('sem SYNC_MATRICULAS_ADMIN_TOKEN configurado, token nao abre porta', async () => {
  const r = await autorizarEquipe(
    req({ headers: { 'x-sync-token': SYNC_TOKEN } }),
    deps({ syncAdminToken: '' }),
  );
  assertEquals(r, { ok: false, status: 401, erro: 'nao autenticado' });
});

Deno.test('bearer service_role passa', async () => {
  const r = await autorizarEquipe(
    req({ headers: { Authorization: `Bearer ${SERVICE_KEY}` } }),
    deps(),
  );
  assertEquals(r, { ok: true, via: 'service_role' });
});

Deno.test('sem bearer leva 401', async () => {
  const r = await autorizarEquipe(req(), deps());
  assertEquals(r, { ok: false, status: 401, erro: 'nao autenticado' });
});

Deno.test('JWT invalido leva 401', async () => {
  const r = await autorizarEquipe(
    req({ headers: { Authorization: 'Bearer jwt-invalido' } }),
    deps({ getUser: () => Promise.resolve(null) }),
  );
  assertEquals(r, { ok: false, status: 401, erro: 'token invalido' });
});

Deno.test('usuario admin ativo passa', async () => {
  const r = await autorizarEquipe(
    req({ headers: { Authorization: 'Bearer jwt-usuario' } }),
    deps(),
  );
  assertEquals(r, { ok: true, via: 'usuario' });
});

Deno.test('usuario unidade ativo passa', async () => {
  const r = await autorizarEquipe(
    req({ headers: { Authorization: 'Bearer jwt-usuario' } }),
    deps({
      buscarUsuario: () => Promise.resolve({ perfil: 'unidade', ativo: true }),
    }),
  );
  assertEquals(r, { ok: true, via: 'usuario' });
});

Deno.test('professor logado leva 403', async () => {
  const r = await autorizarEquipe(
    req({ headers: { Authorization: 'Bearer jwt-professor' } }),
    deps({
      buscarUsuario: () => Promise.resolve({ perfil: 'professor', ativo: true }),
    }),
  );
  assertEquals(r, { ok: false, status: 403, erro: 'acesso negado' });
});

Deno.test('usuario inativo leva 403', async () => {
  const r = await autorizarEquipe(
    req({ headers: { Authorization: 'Bearer jwt-usuario' } }),
    deps({
      buscarUsuario: () => Promise.resolve({ perfil: 'admin', ativo: false }),
    }),
  );
  assertEquals(r, { ok: false, status: 403, erro: 'acesso negado' });
});

Deno.test('usuario sem cadastro na tabela leva 403', async () => {
  const r = await autorizarEquipe(
    req({ headers: { Authorization: 'Bearer jwt-usuario' } }),
    deps({ buscarUsuario: () => Promise.resolve(null) }),
  );
  assertEquals(r, { ok: false, status: 403, erro: 'acesso negado' });
});

Deno.test('ehPerfilDaEquipe: admin/unidade ativo sim, resto nao', () => {
  assertEquals(ehPerfilDaEquipe({ perfil: 'admin', ativo: true }), true);
  assertEquals(ehPerfilDaEquipe({ perfil: 'unidade', ativo: true }), true);
  assertEquals(ehPerfilDaEquipe({ perfil: 'professor', ativo: true }), false);
  assertEquals(ehPerfilDaEquipe({ perfil: 'admin', ativo: false }), false);
  assertEquals(ehPerfilDaEquipe({ perfil: 'admin', ativo: null }), false);
  assertEquals(ehPerfilDaEquipe({ perfil: null, ativo: true }), false);
  assertEquals(ehPerfilDaEquipe(null), false);
});
