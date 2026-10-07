/**
 * Trava o tratamento dos webhooks matricula_aviso_previo_removido / _editado
 * (Emusys ligou os dois em 30/09/2026; até então só o `adicionado` chegava).
 *
 * Contrato de fonte, não de execução: o handler mora numa edge Deno e roda
 * com o client Supabase, então aqui se prova o que NÃO pode voltar a existir.
 * Comentários são cortados antes de procurar — o próprio comentário que
 * explica a armadilha cita as palavras proibidas.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fonte = readFileSync('supabase/functions/processar-matricula-emusys/index.ts', 'utf8');

const inicio = fonte.indexOf('async function handleAvisoPrevio(');
const fim = fonte.indexOf('async function registrarPassagemFinalizada(');
assert.ok(inicio > 0 && fim > inicio, 'handleAvisoPrevio não encontrado');

const handler = fonte
  .slice(inicio, fim)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('removido arquiva pela RPC oficial e não faz DELETE físico sem cópia', () => {
  assert.match(handler, /rpc\('arquivar_movimentacao_admin'/);
  assert.doesNotMatch(handler, /\.delete\(\)/, 'DELETE físico apaga sem deixar cópia');
});

test('falha ao arquivar vira exceção com o id do registro, não sucesso mudo', () => {
  assert.match(handler, /if \(erroArquivar\) throw new Error\(`arquivar aviso \$\{alvoId\} \(aluno \$\{aluno\.id\}\)/);
});

test('aviso sem id do Emusys só é tocado quando há UM candidato manual', () => {
  assert.match(handler, /manuais\.length === 1/);
  assert.match(handler, /candidatos_manuais: manuais\.map/);
  assert.match(handler, /\.eq\('anulado', false\)/);
});

test('editado adota o aviso manual antes da adoção por mês (a data mudou)', () => {
  const iEditado = handler.indexOf("p.evento === 'matricula_aviso_previo_editado'");
  const iPorMes = handler.indexOf(".eq('mes_saida', mesSaida)");
  assert.ok(iEditado > 0, 'ramo de edição ausente');
  assert.ok(iPorMes > iEditado, 'a adoção por mes_saida não pode vir antes: ela não casa após remarcação');
});

test('update do aviso confere o erro do client (supabase-js não lança)', () => {
  assert.match(handler, /if \(erroUpd\) throw/);
  assert.match(handler, /if \(erroAdocao\) throw/);
});
