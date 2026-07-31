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
const explicitTypes = read(
  'src/components/App/SucessoCliente/pesquisaEvasao.types.ts',
);
const verification = read('scripts/verify-pesquisa-evasao-rls.sql');
const structuralVerification = read(
  'scripts/verify-pesquisa-evasao-schema.sql',
);
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

test('contrato de UI da evasao permanece explicito e revisavel', () => {
  assert.ok(explicitTypes, 'pesquisaEvasao.types.ts ausente');
  for (const contractName of [
    'PesquisaEvasaoPreview',
    'PesquisaEvasaoConfirmacao',
    'PesquisaEvasaoListagemItem',
    'PesquisaEvasaoTeste',
  ]) {
    assert.match(explicitTypes, new RegExp(`interface ${contractName}\\b`));
  }
  assert.match(explicitTypes, /modo_teste:\s*boolean/);
  assert.match(explicitTypes, /bloqueio_codigo:\s*PesquisaEvasaoBloqueioCodigo/);
});

test('geracao completa fica como evidencia e nao infla o tipo parcial legado', () => {
  assert.ok(types, 'src/types/supabase.ts ausente');
  assert.match(types, /export interface Database/);
  assert.doesNotMatch(types, /__InternalSupabase/);
  assert.match(
    runbook,
    /src\/types\/supabase\.ts[\s\S]*532 linhas[\s\S]*manual e parcial[\s\S]*n[aã]o [ée] consumido/i,
  );
  assert.match(runbook, /artefato[\s\S]*n[aã]o foi mantido no reposit[oó]rio/i);
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

test('verificador estrutural e transacional e independe de dados nominais', () => {
  assert.ok(structuralVerification, 'verificador estrutural ausente');
  assert.match(structuralVerification, /^\s*begin\s*;/i);
  assert.match(structuralVerification, /\brollback\s*;\s*$/i);
  assert.doesNotMatch(structuralVerification, /\bcommit\s*;/i);

  for (const token of [
    'pg_policies',
    'has_table_privilege',
    'has_function_privilege',
    'aclexplode',
    'pesquisa_evasao_analises',
    'listar_evadidos_para_pesquisa(uuid,integer,integer,character varying)',
    'listar_evadidos_para_pesquisa(uuid,integer,integer,character varying,integer,integer)',
    'uazapi_token',
    'waha_api_key',
    'listar_whatsapp_caixas_seguras(uuid,boolean)',
  ]) {
    assert.ok(
      structuralVerification.toLowerCase().includes(token.toLowerCase()),
      `evidencia estrutural ausente: ${token}`,
    );
  }

  for (const nominalToken of [
    'jessyca@lamusic.com.br',
    'fabi@gmail.com',
    'matriz_nominal',
    'fixture_movimentacao',
    'set local role authenticated',
  ]) {
    assert.doesNotMatch(
      structuralVerification,
      new RegExp(nominalToken, 'i'),
      `verificador estrutural nao pode depender de ${nominalToken}`,
    );
  }

  assert.match(verification, /\bmatriz_nominal\b/i);
  assert.match(verification, /jessyca@lamusic\.com\.br/i);
  assert.match(verification, /fabi@gmail\.com/i);
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
