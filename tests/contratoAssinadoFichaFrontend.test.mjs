import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const modalPath = 'src/components/App/Alunos/ModalFichaAluno.tsx';
const badgePath = 'src/components/App/Alunos/ContratoAssinaturaBadge.tsx';
const hookPath = 'src/hooks/useContratoAssinaturaAluno.ts';
const adapterPath = 'src/lib/contratoAssinatura.ts';
const modal = readFileSync(modalPath, 'utf8');
const badge = existsSync(badgePath) ? readFileSync(badgePath, 'utf8') : '';
const hook = existsSync(hookPath) ? readFileSync(hookPath, 'utf8') : '';
const adapter = existsSync(adapterPath) ? readFileSync(adapterPath, 'utf8') : '';

test('Ficha le RPC dedicada e nunca escreve estado de assinatura', () => {
  assert.match(hook, /get_contrato_assinatura_aluno_v1/i);
  assert.match(hook, /p_aluno_id:\s*alunoId/i);
  assert.doesNotMatch(`${hook}\n${badge}\n${modal}`, /\.from\([^)]*contrato[^)]*\)[\s\S]{0,200}\.(?:update|insert|upsert)\(/i);
  assert.doesNotMatch(`${badge}\n${modal}`, /onChange[\s\S]{0,100}contrato|onClick[\s\S]{0,100}contrato_assinado/i);
});

test('adapter sustenta somente os cinco estados honestos', () => {
  for (const status of ['assinado', 'sem_assinatura_eletronica', 'sem_contrato', 'nao_verificado', 'dispensado']) {
    assert.match(adapter, new RegExp(`['"]${status}['"]`));
  }
  assert.doesNotMatch(adapter, /aguardando_aluno|assinatura_solicitada|modo_assinatura|data_assinatura/i);
  assert.doesNotMatch(adapter, /['"]nao_assinado['"]|Não assinado no Emusys/);
  assert.match(adapter, /Sem assinatura eletrônica/);
  assert.match(adapter, /Contrato assinado manualmente aparece aqui e não é pendência/);
  assert.doesNotMatch(badge, /XCircle/);
});

test('selo aparece no cabecalho junto dos selos existentes', () => {
  const header = modal.slice(modal.indexOf('Instagram:'), modal.indexOf('<Tabs value='));
  assert.match(header, /ContratoAssinaturaBadge/);
  assert.match(badge, /aria-label=.*Contrato/i);
  assert.match(badge, /contrato_dado_fresco/i);
});

test('aba Academico explica as datas e mostra observacao somente leitura', () => {
  const contrato = modal.slice(modal.indexOf('>Contrato<'), modal.indexOf('{\/\* Outros cursos'));
  assert.match(contrato, /Início e fim representam o período das aulas; não comprovam assinatura\./);
  assert.match(contrato, /Observado pelo LA Report/i);
  assert.match(contrato, /matricula_status_observado_em/i);
  assert.match(contrato, /ContratoAssinaturaBadge/);
});

test('erro e loading falham para Nao verificado, sem usar datas de contrato', () => {
  assert.match(hook, /nao_verificado/i);
  assert.match(hook, /loading/i);
  assert.match(hook, /error/i);
  assert.doesNotMatch(hook, /data_inicio_contrato|data_fim_contrato/i);
});
