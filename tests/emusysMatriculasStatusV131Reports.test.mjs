import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const adminReport = read('supabase/functions/relatorio-admin-whatsapp/index.ts');
const biAgent = read('supabase/functions/bi-agent-lamusic/index.ts');
const biTools = read('supabase/functions/bi-agent-lamusic/tools.ts');
const biSchema = read('supabase/functions/bi-agent-lamusic/schema.ts');
const metrics = read('docs/METRICAS.md');
const systemMap = read('docs/MAPA-SISTEMA.md');
const emusysMap = read('docs/MAPA-INTEGRACAO-EMUSYS.md');

test('relatorio administrativo usa a fonte operacional v1.3.1 e separa trancados atuais', () => {
  assert.match(adminReport, /\.rpc\('get_kpis_alunos_admin_operacional'/);
  assert.match(adminReport, /Trancados agora:/);
  assert.match(adminReport, /trancamentosPeriodo\s*=\s*trancamentosMov\.length/);
});

test('agente BI recebe a semantica viva sem tratar trancado como ativo', () => {
  assert.match(biAgent, /vw_alunos_estado_operacional_v131/);
  assert.match(biAgent, /Trancamento atual fica separado/);
  assert.match(biTools, /\.rpc\('get_kpis_alunos_admin_operacional'/);
  assert.match(biTools, /\.rpc\('get_kpis_alunos_financeiro_vivo_canonico'/);
  assert.match(biSchema, /eo\.entra_base_ativa\s*=\s*true/);
  assert.doesNotMatch(
    `${biAgent}\n${biTools}\n${biSchema}`,
    /status\s+in\s*\(\s*['"]ativo['"]\s*,\s*['"]trancado['"]\s*\)/i,
  );
});

test('documentacao canonica descreve ativa, trancada, interrompida e concluida', () => {
  assert.match(metrics, /Somente.*status Emusys resolvido.*`ativa`/is);
  assert.match(metrics, /Trancados agora.*fora dos denominadores ativos/is);
  assert.doesNotMatch(metrics, /status\s*[∈=].*\{\s*ativo\s*,\s*trancado\s*\}/i);

  assert.match(systemMap, /vw_alunos_estado_operacional_v131/);
  assert.match(systemMap, /get_kpis_alunos_admin_operacional/);

  assert.match(emusysMap, /`inativa`\s*\+\s*`interrompida`.*evas[aã]o/is);
  assert.match(emusysMap, /`inativa`\s*\+\s*`concluida`.*n[aã]o renova[cç][aã]o/is);
  assert.match(emusysMap, /valor ausente ou amb[ií]guo.*auditoria/is);
});
