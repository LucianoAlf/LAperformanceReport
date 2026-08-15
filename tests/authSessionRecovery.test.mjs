import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function requiredFile(path) {
  assert.ok(existsSync(path), `arquivo esperado não existe: ${path}`);
  return readFileSync(path, 'utf8');
}

async function importTypeScriptModule(relativePath) {
  const source = requiredFile(join(ROOT, relativePath));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: relativePath,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('reconhece refresh token revogado sem tratar erros de autenticação genéricos como logout', async () => {
  const module = await importTypeScriptModule('src/lib/authSessionRecovery.ts');

  assert.equal(module.isRefreshTokenRevogado(new Error('Invalid Refresh Token: Session Expired (Revoked by Newer Login)')), true);
  assert.equal(module.isRefreshTokenRevogado({ message: 'invalid refresh token' }), true);
  assert.equal(module.isRefreshTokenRevogado(new Error('Invalid login credentials')), false);
  assert.equal(module.isRefreshTokenRevogado(null), false);
});

test('limpa a sessão somente neste navegador após refresh token revogado', async () => {
  const module = await importTypeScriptModule('src/lib/authSessionRecovery.ts');
  let chamadas = 0;
  let estadoLimpo = 0;

  const recuperou = await module.recuperarSessaoRevogada({
    erro: new Error('Invalid Refresh Token: Session Expired (Revoked by Newer Login)'),
    limparSessaoLocal: async () => { chamadas += 1; },
    limparEstado: () => { estadoLimpo += 1; },
  });

  assert.equal(recuperou, true);
  assert.equal(chamadas, 1);
  assert.equal(estadoLimpo, 1);

  const ignorou = await module.recuperarSessaoRevogada({
    erro: new Error('Invalid login credentials'),
    limparSessaoLocal: async () => { chamadas += 1; },
    limparEstado: () => { estadoLimpo += 1; },
  });

  assert.equal(ignorou, false);
  assert.equal(chamadas, 1);
  assert.equal(estadoLimpo, 1);
});

test('AuthContext recupera refresh revogado com signOut de escopo local', () => {
  const authContext = requiredFile(join(ROOT, 'src', 'contexts', 'AuthContext.tsx'));
  assert.match(authContext, /recuperarSessaoRevogada/, 'AuthContext deve usar a recuperação explícita');
  assert.match(authContext, /signOut\s*\(\s*\{\s*scope\s*:\s*['"]local['"]\s*\}\s*\)/, 'a recuperação não pode invalidar sessões de outros dispositivos');
});
