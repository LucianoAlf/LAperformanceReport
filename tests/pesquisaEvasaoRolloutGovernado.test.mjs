import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => {
  const path = resolve(repoRoot, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const types = read('src/types/supabase.ts');
const verification = read('scripts/verify-pesquisa-evasao-rls.sql');
const runbook = read(
  'docs/runbooks/pesquisa-evasao-subprojeto-a-rollout.md',
);

const units = [
  '368d47f5-2d88-4475-bc14-ba084a9a348e',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  '95553e96-971b-4590-a6eb-0201d013c14d',
];

const permissions = [
  'sucesso_aluno.evasao.ver',
  'sucesso_aluno.evasao.enviar',
  'sucesso_aluno.evasao.revisar',
  'sucesso_aluno.evasao.gerir_acoes',
  'sucesso_aluno.evasao.modo_teste',
];

test('tipos incluem o contrato local completo da fundacao de evasao', () => {
  assert.ok(types, 'src/types/supabase.ts ausente');

  for (const table of [
    'pesquisa_evasao_assinaturas',
    'pesquisa_evasao_templates',
    'pesquisa_evasao_previews',
    'pesquisa_evasao_publicos_internos',
    'pesquisa_evasao_mensagens',
    'pesquisa_evasao_transcricoes',
    'pesquisa_evasao_analises',
  ]) {
    assert.match(types, new RegExp(`^\\s{6}${table}: \\{`, 'm'));
  }

  for (const column of [
    'envio_status',
    'resposta_status',
    'modo_teste',
    'telefone_destino_snapshot',
    'assinatura_nome_snapshot',
    'envio_erro_sanitizado',
  ]) {
    assert.match(types, new RegExp(`^\\s+${column}:`, 'm'));
  }

  assert.match(
    types,
    /listar_evadidos_para_pesquisa_v2:\s*\{\s*Args:\s*\{[\s\S]*?p_busca:[\s\S]*?p_limite:[\s\S]*?p_mes:[\s\S]*?p_offset:[\s\S]*?p_status:[\s\S]*?p_unidade_id:[\s\S]*?p_ano:/,
  );
  assert.match(types, /listar_pesquisas_evasao_teste_v1:/);
  assert.match(types, /claim_pesquisa_evasao_preview:/);
  assert.match(types, /registrar_resultado_pesquisa_evasao_envio:/);
  assert.match(types, /confirmar_resultado_pesquisa_evasao_envio:/);
});

test('verificacao SQL e transacional, cobre ACL, RLS e isolamento real', () => {
  assert.ok(verification, 'script de verificacao RLS ausente');
  assert.match(verification, /^\s*begin\s*;/i);
  assert.match(verification, /\brollback\s*;\s*$/i);
  assert.doesNotMatch(verification, /\bcommit\s*;/i);

  for (const token of [
    'pg_policies',
    'has_table_privilege',
    'has_function_privilege',
    'aclexplode',
    'set local role authenticated',
    'set local role service_role',
    'mila_acesso_restrito',
    'sol_acesso_restrito',
    'pesquisa_evasao_publicos_internos',
  ]) {
    assert.match(verification, new RegExp(token, 'i'));
  }

  for (const signature of [
    'listar_evadidos_para_pesquisa\\(uuid,integer,integer,character varying\\)',
    'listar_evadidos_para_pesquisa\\(uuid,integer,integer,character varying,integer,integer\\)',
    'stats_pesquisa_evasao\\(uuid,integer,integer\\)',
    'criar_pesquisa_evasao\\(integer,text\\)',
    'pode_enviar_pesquisa_evasao\\(integer\\)',
    'listar_evadidos_para_pesquisa_v2\\(uuid,integer,integer,character varying,integer,integer,text\\)',
    'listar_pesquisas_evasao_teste_v1\\(integer\\)',
  ]) {
    assert.match(verification, new RegExp(signature, 'i'));
  }

  assert.match(verification, /relatorios[\s\S]*sem[\s_-]*ver/i);
  assert.match(verification, /p_unidade_id[\s\S]*null/i);
  assert.match(verification, /resposta_texto/i);
});

test('runbook fixa identidades, seis vinculos e cinco permissoes sem admin', () => {
  assert.ok(runbook, 'runbook de rollout ausente');
  assert.match(runbook, /ouqwbbermlzqqvtqwlul/);
  assert.match(runbook, /\bid\s*=\s*29\b[\s\S]*jessyca@lamusic\.com\.br/i);
  assert.match(runbook, /\bid\s*=\s*30\b[\s\S]*fabi@gmail\.com/i);
  assert.doesNotMatch(runbook, /\b(?:i?like)\s+['"]%?(?:jess|fabi)/i);

  for (const unit of units) assert.match(runbook, new RegExp(unit, 'i'));
  for (const permission of permissions) {
    assert.match(runbook, new RegExp(permission.replaceAll('.', '\\.'), 'i'));
  }

  assert.match(runbook, /seis\s+v[ií]nculos|2\s*[x×]\s*3/i);
  assert.match(runbook, /Sucesso do Aluno - Evas[aã]o/i);
  assert.match(runbook, /unidade_id\s+is\s+null/i);
  assert.match(runbook, /relatorios/i);
  assert.match(runbook, /admin[\s\S]*(?:n[aã]o|sem)[\s\S]*atalho/i);
  assert.match(runbook, /terceiro usu[aá]rio[\s\S]*uma\s+unidade/i);
});

test('runbook mantem gates de dados e seguranca descobertos na auditoria', () => {
  assert.match(runbook, /245\s+sa[ií]das/i);
  assert.match(runbook, /140[\s\S]*sem snapshot[\s\S]*contato atual/i);
  assert.match(runbook, /103[\s\S]*sem snapshot[\s\S]*sem contato atual/i);
  assert.match(runbook, /136[\s\S]*v[aá]lidas[\s\S]*sem snapshot/i);
  assert.match(runbook, /sem backfill|n[aã]o fazer backfill/i);
  assert.match(runbook, /capturar_telefone_snapshot_movimentacao_retencao/i);

  assert.match(
    runbook,
    /pesquisa_evasao_publicos_internos[\s\S]*aluno_id[\s\S]*confirmad/i,
  );
  assert.match(runbook, /n[aã]o inferir[\s\S]*(?:nome|telefone)/i);
  assert.match(runbook, /whatsapp_caixas[\s\S]*token/i);
  assert.match(
    runbook,
    /movimentacoes_admin[\s\S]*(?:ALL|acesso total)[\s\S]*authenticated/i,
  );
  assert.match(
    runbook,
    /telefone_snapshot[\s\S]*(?:qualquer|todos?)[\s\S]*(?:usu[aÃ¡]rio|login)[\s\S]*autenticad/i,
  );
  assert.match(runbook, /bloqueador[\s\S]*rollout/i);
  assert.match(
    runbook,
    /20260730161312[\s\S]*pesquisa_evasao_movimentacao_canonica/i,
  );
  assert.match(runbook, /D\+X[\s\S]*Subprojeto C/i);
  assert.match(
    runbook,
    /20260109_fase1_seed_dados\.sql[\s\S]*INSERT INTO professores[\s\S]*baseline/i,
  );
});

test('runbook preserva o gate humano antes de qualquer escrita de producao', () => {
  assert.match(
    runbook,
    /diff completo[\s\S]*confirm(?:ar|ado)[\s\S]*project ref/i,
  );
  assert.match(
    runbook,
    /nenhuma migra[cç][aã]o[\s\S]*nenhum deploy[\s\S]*autoriza[cç][aã]o/i,
  );
  assert.match(runbook, /tipos[\s\S]*produ[cç][aã]o[\s\S]*somente leitura/i);
});
