import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const migration = read(
  'supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql',
);
const auth = read('supabase/functions/enviar-pesquisa-evasao/auth.ts');
const edge = read('supabase/functions/enviar-pesquisa-evasao/index.ts');
const contract = read('supabase/functions/enviar-pesquisa-evasao/contract.ts');
const config = read('supabase/config.toml');
const spec = read(
  'docs/superpowers/specs/2026-07-30-pesquisa-evasao-v2-mapa-sinais-design.md',
);
const plan = read(
  'docs/superpowers/plans/2026-07-30-pesquisa-evasao-subprojeto-a-fundacao-segura.md',
);
const runbook = read('docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md');

const rbacPlanA =
  /sucesso_aluno\.evasao|usuario_tem_permissao_estrita|fn_usuario_atual_tem_permissao_estrita|Sucesso do Aluno - Evasao|usuario_perfis/i;

test('Plano A nao cria nem exige RBAC granular de evasao', () => {
  for (const [nome, artefato] of [
    ['migration', migration],
    ['auth', auth],
    ['edge', edge],
    ['spec', spec],
    ['plan', plan],
    ['runbook', runbook],
  ]) {
    assert.doesNotMatch(artefato, rbacPlanA, `${nome} ainda contem RBAC removido`);
  }
});

test('gateway e Edge exigem JWT e usuario interno ativo unico', () => {
  assert.match(
    config,
    /\[functions\.enviar-pesquisa-evasao\]\s*verify_jwt\s*=\s*true/i,
  );
  assert.match(edge, /supabase\.auth\.getUser\(token\)/);
  assert.match(edge, /\.from\("usuarios"\)[\s\S]*\.eq\("ativo", true\)/);
  assert.match(auth, /usuarios\.length !== 1/);
  assert.doesNotMatch(edge, /operador|criado_por|nome_assinatura\s*:/i);
});

test('qualquer usuario interno ativo pode ler e executar RPCs em todas as unidades', () => {
  assert.match(
    migration,
    /create or replace function public\.fn_pesquisa_evasao_usuario_interno_ativo\(\)[\s\S]*from public\.usuarios u[\s\S]*u\.auth_user_id = auth\.uid\(\)[\s\S]*u\.ativo = true/i,
  );
  assert.match(
    migration,
    /create policy pesquisa_evasao_leitura_interna[\s\S]*to authenticated[\s\S]*fn_pesquisa_evasao_usuario_interno_ativo\(\)/i,
  );
  for (const rpc of [
    'listar_evadidos_para_pesquisa',
    'stats_pesquisa_evasao',
    'pode_enviar_pesquisa_evasao',
    'listar_evadidos_para_pesquisa_v2',
    'listar_pesquisas_evasao_teste_v1',
  ]) {
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${rpc}\\(`, 'i'),
      `${rpc} precisa continuar executavel por authenticated`,
    );
  }
});

test('roles de agentes continuam sem acesso direto as respostas privadas', () => {
  for (const role of [
    'mila_acesso_restrito',
    'sol_acesso_restrito',
    'fabio_agent',
    'lia_acesso_restrito',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.pesquisa_evasao[\\s\\S]*${role}`,
        'i',
      ),
    );
  }
});

test('assinatura usa override opcional e primeiro nome do usuario como fallback', () => {
  assert.match(auth, /primeiroNomeDoUsuario/);
  assert.match(auth, /assinaturas\.length === 0[\s\S]*nomeUsuario/);
  assert.match(contract, /assinaturaId:\s*string\s*\|\s*null/);
  assert.match(
    migration,
    /assinatura_id uuid\s+references public\.pesquisa_evasao_assinaturas\(id\)/i,
  );
});

test('documentacao remove terceiro usuario e matriz de autorizacao por unidade', () => {
  for (const [nome, artefato] of [
    ['spec', spec],
    ['plan', plan],
    ['runbook', runbook],
  ]) {
    assert.doesNotMatch(artefato, /terceiro usu.rio|matriz nominal|matriz de acesso/i, nome);
    assert.match(artefato, /qualquer usu.rio interno ativo/i, nome);
    assert.match(artefato, /auditoria|rastro/i, nome);
  }
});
