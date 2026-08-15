import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = join(ROOT, 'supabase', 'migrations');

function requiredFile(path) {
  assert.ok(existsSync(path), `arquivo esperado não existe: ${path}`);
  return readFileSync(path, 'utf8');
}

function tokenMigration() {
  const names = readdirSync(migrationDir)
    .filter((entry) => entry.endsWith('_ficha_emitir_token_existente.sql') || entry.endsWith('_ficha_emitir_token_type_fix.sql') || entry.endsWith('_ficha_emitir_token_returning_fix.sql'))
    .sort()
  assert.ok(names.length > 0, 'migration da emissão idempotente não encontrada');
  return names.map((name) => requiredFile(join(migrationDir, name))).join('\n');
}

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

test('migration cria uma única emissão ativa por colaborador e restringe a RPC', () => {
  const sql = tokenMigration();
  assertHas(sql, /create\s+unique\s+index\s+if\s+not\s+exists[\s\S]*ficha_tokens[\s\S]*colaborador_id[\s\S]*where\s+ativo/i, 'deve haver índice único parcial por colaborador ativo');
  assertHas(sql, /create\s+or\s+replace\s+function\s+public\.ficha_emitir_token\s*\(/i, 'RPC esperada');
  assertHas(sql, /pg_advisory_xact_lock\s*\(/i, 'RPC deve serializar cliques concorrentes');
  assertHas(sql, /security\s+definer/i, 'RPC deve ser SECURITY DEFINER');
  assertHas(sql, /set\s+search_path\s*=\s*public/i, 'RPC deve fixar search_path');
  assertHas(sql, /professores/i, 'RPC deve derivar PROFESSOR do departamento');
  assertHas(sql, /atendimento/i, 'RPC deve derivar ATENDIMENTO do departamento');
  assertHas(sql, /raise\s+exception/i, 'departamento desconhecido deve ser rejeitado');
  assertHas(sql, /revoke\s+all[\s\S]*ficha_emitir_token/i, 'RPC deve revogar ACL pública');
  assertHas(sql, /grant\s+execute[\s\S]*ficha_emitir_token[\s\S]*service_role/i, 'somente service_role deve executar a RPC');
  assertHas(sql, /ja_existia/i, 'RPC deve retornar idempotência');
  assertHas(sql, /ja_respondeu/i, 'RPC deve retornar estado de resposta');
  assertHas(sql, /criado_em/i, 'RPC deve retornar data de geração');
  assertHas(sql, /v_token\.token\s*::\s*text/i, 'retorno do token varchar deve ser convertido para text');
  assertHas(sql, /returning\s+(?:public\.)?\w+\.criado_em\s+into\s+v_criado_em/i, 'INSERT deve qualificar criado_em para evitar ambiguidade com a coluna de retorno da RPC');
});

test('Edge Function exige JWT e separa consulta GET da emissão POST', () => {
  const edge = requiredFile(join(ROOT, 'supabase', 'functions', 'ficha-emitir-token', 'index.ts'));
  const config = requiredFile(join(ROOT, 'supabase', 'config.toml'));
  assertHas(config, /\[functions\.ficha-emitir-token\][\s\S]*?verify_jwt\s*=\s*true/i, 'função deve exigir JWT no gateway');
  assertHas(edge, /auth\.getUser\s*\(/i, 'função deve validar o usuário autenticado');
  assertHas(edge, /auth_user_id/i, 'autorização deve relacionar auth user ao usuário interno');
  assertHas(edge, /perfil/i, 'autorização deve validar perfil');
  assertHas(edge, /unidade_id/i, 'autorização deve validar unidade');
  assertHas(edge, /req\.method\s*===\s*['"]GET['"]/i, 'GET de consulta esperado');
  assertHas(edge, /req\.method\s*===\s*['"]POST['"]/i, 'POST de emissão esperado');
  assertHas(edge, /ficha_emitir_token/i, 'Edge deve chamar a RPC protegida');
  assertHas(edge, /PROFESSOR/i, 'Edge deve reconhecer Professor');
  assertHas(edge, /ATENDIMENTO/i, 'Edge deve reconhecer Atendimento');
  assert.doesNotMatch(edge, /console\.log\s*\(/i, 'token/link não podem ser registrados em log');
});

test('configuração do modal não aceita fallback de cargo e habilita Professor', () => {
  const modal = requiredFile(join(ROOT, 'src', 'components', 'App', 'Time', 'ModalAdicionarPessoa.tsx'));
  assertHas(modal, /Professores\s*:\s*['"]PROFESSOR['"]/i, 'Professores deve mapear para PROFESSOR');
  assertHas(modal, /Administrativo[\s\S]*em breve/i, 'Administrativo deve continuar bloqueado');
  assert.doesNotMatch(modal, /\?\?\s*['"]ATENDIMENTO['"]/, 'não deve haver fallback de cargo para Atendimento');
});

test('ficha renderiza as ações dos três estados sem expor token cru', () => {
  const ficha = requiredFile(join(ROOT, 'src', 'components', 'App', 'Time', 'FichaColaborador.tsx'));
  const hook = requiredFile(join(ROOT, 'src', 'hooks', 'useFichaColaborador.ts'));
  assertHas(ficha, /Gerar link da Ficha/i, 'estado sem token');
  assertHas(ficha, /Copiar link/i, 'estado com token deve permitir cópia');
  assertHas(ficha, /Abrir WhatsApp/i, 'estado com token deve permitir WhatsApp');
  assertHas(hook, /ficha-emitir-token/i, 'hook deve consultar/emitir pela Edge');
  assert.doesNotMatch(ficha, /\{\s*fichaToken\.token\s*\}/i, 'token cru não deve ser renderizado');
});

async function importTypeScriptModule(relativePath) {
  const source = requiredFile(join(ROOT, relativePath));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: relativePath,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('mensagem e URL do WhatsApp preservam o link e codificam o texto', async () => {
  const module = await importTypeScriptModule('src/lib/fichaLink.ts');
  const link = 'https://la-performance-report.vercel.app/ficha-tecnica/?t=ana-abc';
  const message = module.montarMensagemFicha('Ana', link);
  assert.equal(message, `Oi, Ana! Tudo bem? Queria te pedir pra preencher a Ficha Técnica da LA. São uns 20 minutos e não tem resposta certa nem errada — é pra gente te conhecer melhor e trabalhar melhor com você. Segue o link: ${link}`);
  const url = module.montarLinkWhatsAppFicha('Ana', '5521966278647', link);
  assert.equal(url, `https://wa.me/5521966278647?text=${encodeURIComponent(message)}`);
  assert.equal(module.montarLinkWhatsAppFicha('Ana', null, link), null);
});

test('telefone remove máscara e não duplica o DDI 55', async () => {
  const module = await importTypeScriptModule('src/lib/normalizarTelefone.ts');
  assert.equal(module.normalizarTelefone('(21) 96276-8647'), '5521962768647');
  assert.equal(module.normalizarTelefone('5521962768647'), '5521962768647');
  assert.equal(module.normalizarTelefone('123'), null);
});
