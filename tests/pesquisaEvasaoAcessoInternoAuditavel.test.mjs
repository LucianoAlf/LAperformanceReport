import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const migration = read(
  'supabase/migrations/20260730170000_pesquisa_evasao_fundacao_segura.sql',
).replace(/\r\n/g, '\n');
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
const structuralVerification = read(
  'scripts/verify-pesquisa-evasao-schema.sql',
);

const templateDireto = `Oi, {{aluno_primeiro_nome}}! Aqui é a {{assinatura_nome}}, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que você passou com a gente. As portas estarão sempre abertas para você!

Posso te fazer uma única pergunta?

Se você pudesse mudar alguma coisa na sua experiência na LA Music, o que mudaria?

Pode responder com texto ou áudio, fique à vontade. 🙏`;

const templateResponsavel = `Oi, {{responsavel_primeiro_nome}}! Aqui é a {{assinatura_nome}}, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que {{aluno_primeiro_nome}} passou com a gente. As portas estarão sempre abertas!

Posso te fazer uma única pergunta?

Se você pudesse mudar alguma coisa na experiência de {{aluno_primeiro_nome}} na LA Music, o que mudaria?

Pode responder com texto ou áudio, fique à vontade. 🙏`;

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

test('migration semeia os dois templates aprovados de forma idempotente', () => {
  assert.ok(migration.includes(templateDireto), 'template direto aprovado ausente');
  assert.ok(
    migration.includes(templateResponsavel),
    'template de responsavel aprovado ausente',
  );
  assert.match(
    migration,
    /insert\s+into\s+public\.pesquisa_evasao_templates[\s\S]*on\s+conflict\s*\(chave,\s*versao,\s*publico\)[\s\S]*do\s+update/i,
  );
  assert.match(migration, /'direto'[\s\S]*'responsavel'/i);
  assert.doesNotMatch(
    migration,
    /pesquisa_evasao_templates[\s\S]{0,2000}criado_por_usuario_id[\s\S]{0,2000}\b(?:29|30)\b/i,
    'seed de template nao pode voltar a depender de usuario nominal',
  );
});

test('templates e assinaturas permanecem configuracao SQL governada', () => {
  for (const table of [
    'pesquisa_evasao_templates',
    'pesquisa_evasao_assinaturas',
  ]) {
    assert.match(
      migration,
      new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+service_role`, 'i'),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`grant\\s+(?:insert|update|delete|all)[\\s\\S]{0,160}public\\.${table}[\\s\\S]{0,80}service_role`, 'i'),
    );
  }

  assert.match(
    runbook,
    /troca de texto[\s\S]*override de assinatura[\s\S]*(?:migration|SQL)[\s\S]*versionad/i,
  );
  assert.match(runbook, /n[aã]o existe caminho de escrita pela aplica[cç][aã]o/i);
});

test('verificador e rollout bloqueiam preview sem templates validos', () => {
  assert.match(
    structuralVerification,
    /exatamente um template ativo[\s\S]*direto[\s\S]*responsavel/i,
  );
  assert.match(structuralVerification, /placeholder[\s\S]*n[aã]o permitido/i);
  assert.match(
    runbook,
    /antes do smoke[\s\S]*exatamente um template ativo[\s\S]*direto[\s\S]*responsavel/i,
  );
  assert.match(
    runbook,
    /pr[eé]via[\s\S]*sem sobrar[\s\S]*\{\{[\s\S]*\}\}/i,
  );
});
