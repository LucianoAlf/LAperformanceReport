import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webhookPath = 'supabase/functions/processar-matricula-emusys/index.ts';
const source = readFileSync(webhookPath, 'utf8');

test('campos incondicionais (status/etapa/converteu/data_conversao) sao sempre gravados', () => {
  assert.match(
    source,
    /const baseUpdates: any = \{\s*\n\s*status: 'convertido',\s*\n\s*etapa_pipeline_id: 10,\s*\n\s*converteu: true,\s*\n\s*data_conversao: hoje,\s*\n\s*updated_at: new Date\(\)\.toISOString\(\),\s*\n\s*\};/,
  );
  assert.match(
    source,
    /await supabase\.from\('leads'\)\.update\(baseUpdates\)\.eq\('id', leadId\);/,
  );
});

test('so grava emusys_lead_id via guarda atomica IS NULL, nao read-then-write', () => {
  assert.match(
    source,
    /if \(p\.emusysLeadId\) \{\s*\n\s*await supabase\.from\('leads'\)\.update\(\{ emusys_lead_id: p\.emusysLeadId \}\)\s*\n\s*\.eq\('id', leadId\)\.is\('emusys_lead_id', null\);\s*\n\s*\}/,
  );
});

test('so grava aluno_id via guarda atomica IS NULL, nao read-then-write', () => {
  assert.match(
    source,
    /if \(alunoId\) \{\s*\n\s*await supabase\.from\('leads'\)\.update\(\{ aluno_id: alunoId \}\)\s*\n\s*\.eq\('id', leadId\)\.is\('aluno_id', null\);\s*\n\s*\}/,
  );
});

test('nao existe mais leitura previa (read-then-write) de aluno_id/emusys_lead_id', () => {
  assert.doesNotMatch(
    source,
    /const \{ data: leadAtual \} = await supabase\s*\n\s*\.from\('leads'\)\s*\n\s*\.select\('aluno_id, emusys_lead_id'\)/,
  );
});

test('nao existe mais sobrescrita incondicional dos dois campos', () => {
  assert.doesNotMatch(
    source,
    /if \(p\.emusysLeadId\) updates\.emusys_lead_id = p\.emusysLeadId;\n\s*if \(alunoId\) updates\.aluno_id = alunoId;/,
  );
});
