import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webhookPath = 'supabase/functions/processar-matricula-emusys/index.ts';
const source = readFileSync(webhookPath, 'utf8');

test('converterLead le o lead atual antes de decidir o que sobrescrever', () => {
  assert.match(
    source,
    /const \{ data: leadAtual \} = await supabase\s*\n\s*\.from\('leads'\)\s*\n\s*\.select\('aluno_id, emusys_lead_id'\)/,
  );
});

test('so grava emusys_lead_id quando o lead ainda nao tinha um', () => {
  assert.match(
    source,
    /if \(p\.emusysLeadId && !leadAtual\?\.emusys_lead_id\) updates\.emusys_lead_id = p\.emusysLeadId;/,
  );
});

test('so grava aluno_id quando o lead ainda nao tinha um', () => {
  assert.match(
    source,
    /if \(alunoId && !leadAtual\?\.aluno_id\) updates\.aluno_id = alunoId;/,
  );
});

test('nao existe mais sobrescrita incondicional dos dois campos', () => {
  assert.doesNotMatch(
    source,
    /if \(p\.emusysLeadId\) updates\.emusys_lead_id = p\.emusysLeadId;\n\s*if \(alunoId\) updates\.aluno_id = alunoId;/,
  );
});
