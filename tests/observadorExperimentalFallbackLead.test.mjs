import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webhookPath = 'supabase/functions/debug-webhook-emusys-observador/index.ts';
const source = readFileSync(webhookPath, 'utf8');

test('cria lead fallback quando experimental chega sem telefone e lead_not_found', () => {
  assert.match(source, /async function criarLeadFallbackExperimental/);
  assert.match(source, /criarLeadFallbackExperimental\(sb, unidadeId, emusysLeadId, nomeAluno\)/);
});

test('fallback so dispara na criacao, com telefone ausente e lead_not_found', () => {
  assert.match(source, /evento === 'aula_experimental_criada'/);
  assert.match(source, /&&\s*!telefone/);
  assert.match(source, /data\?\.success === false/);
  assert.match(source, /data\?\.reason === 'lead_not_found'/);
});

test('lead fallback criado com emusys_lead_id e sem telefone, na unidade certa', () => {
  assert.match(source, /emusys_lead_id: emusysLeadId,/);
  assert.match(source, /unidade_id: unidadeId,/);
  assert.match(source, /telefone: null,/);
  assert.match(source, /source_type: 'emusys',/);
});

test('lead_fallback aparece no retorno final da experimental', () => {
  assert.match(source, /lead_fallback:\s*leadFallback,/);
});

test('processarLead detecta colisao de telefone via releitura, nao via excecao', () => {
  assert.match(source, /acao: 'colisao_telefone_familia'/);
  assert.match(source, /leadAtual\.telefone !== telefone/);
});

test('status warn passa a cobrir colisao_telefone_familia', () => {
  assert.match(source, /acaoInterna === 'colisao_telefone_familia'/);
});
