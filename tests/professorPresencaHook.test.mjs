import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const hook = le('../src/hooks/useProfessorPresenca.ts');
const toggle = le('../src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx');

/**
 * ⚠️ Este e o caminho de escrita mais usado do sistema — 183 marcacoes de
 * professor por dia — e o banco protege a decisao humana por trigger
 * (`trg_proteger_decisao_humana_aula`). A extracao move a ORQUESTRACAO para o
 * hook sem tocar na REGRA, que continua morando em `@/lib/presencaRecibo`.
 */

test('a orquestracao de marcar professor mora no hook, nao no componente', () => {
  // O toggle nao fala mais com o banco: quem chama RPC e o hook.
  assert.doesNotMatch(toggle, /supabase\.rpc\(/, 'o toggle ainda chama RPC direto');
  assert.doesNotMatch(toggle, /from '@\/lib\/supabase'/, 'o toggle ainda importa o client');

  for (const rpc of [
    'app_registrar_presenca_professor_dia',
    'app_remover_presenca_professor_dia',
    'app_marcar_presenca_professor_aula',
    'app_status_comando_presenca_v1',
  ]) {
    assert.match(hook, new RegExp(rpc), `o hook nao chama ${rpc}`);
  }
});

test('🔴 a REGRA continua vindo da lib — o hook nao a reimplementa', () => {
  // Recriar `chaveDoPedido`/`requestIdDoPedido` aqui daria duas respostas para
  // "qual e o id deste pedido?", e o retry idempotente deixaria de casar com o
  // pedido original — a duplicata silenciosa que este projeto ja pagou caro.
  assert.match(hook, /from '@\/lib\/presencaRecibo'/);
  for (const simbolo of [
    'chaveDoPedido',
    'requestIdDoPedido',
    'adquirirTravaPresenca',
    'chaveTravaProfessorDia',
    'reconciliarIntencoesPendentes',
    'interpretarEEncerrarPedido',
    'reservarIntencaoProfessorPendente',
  ]) {
    assert.match(hook, new RegExp(`\\b${simbolo}\\b`), `o hook nao usa ${simbolo}`);
    assert.doesNotMatch(
      hook,
      new RegExp(`function\\s+${simbolo}\\s*\\(`),
      `o hook REIMPLEMENTOU ${simbolo} em vez de importar`,
    );
  }
});

test('a trava do dia e a reconciliacao acontecem ANTES de qualquer escrita', () => {
  // A ordem importa: sem reconciliar o pendente antes, uma marcacao anterior
  // ainda nao confirmada e sobrescrita sem ninguem ver.
  const corpo = hook.slice(hook.indexOf('async function marcarDiaInteiro'));
  const iTrava = corpo.indexOf('adquirirTravaDoDia');
  const iReconcilia = corpo.indexOf('reconciliarPendenciasDoDia');
  const iEscrita = corpo.indexOf('supabase.rpc');
  assert.ok(iTrava > -1 && iReconcilia > -1 && iEscrita > -1, 'faltou um dos tres passos');
  assert.ok(iTrava < iReconcilia, 'reconcilia antes de travar');
  assert.ok(iReconcilia < iEscrita, 'escreve antes de reconciliar o pendente');
});

test('a trava e SEMPRE liberada — inclusive quando o pedido falha', () => {
  // Trava vazada deixa o usuario preso em "outra alteracao em andamento" ate
  // recarregar a pagina, e o `finally` e a unica garantia disso.
  // ⚠️ Ancora na CHAMADA (`= adquirirTravaDoDia(user.id)`), nunca no nome
  // solto: a declaracao da funcao casa o nome e nao tem `finally`, e o teste
  // reprovaria o codigo certo. Sao DUAS escritas — dia e aula —, porque
  // `marcarTodasAulas` foi fundida em `marcarDiaInteiro`.
  const trechos = hook.split('= adquirirTravaDoDia(user.id)').slice(1);
  assert.equal(trechos.length, 2, 'esperava as 2 operacoes de escrita');
  for (const t of trechos) {
    const fim = t.indexOf('\n  }');
    assert.match(t.slice(0, fim > -1 ? fim : t.length), /finally\s*\{[\s\S]*?liberar\(\)/);
  }
});

test('🔴 marcar o dia e marcar todas as aulas sao a MESMA operacao', () => {
  // Medido em 21/09 antes da extracao: as duas funcoes do toggle eram
  // identicas byte a byte (mesmo payload `professor_dia`, mesmas duas RPCs,
  // mesma reserva) e diferiam SO na string do toast — ~60 linhas duplicadas.
  // Manter as duas no hook carregaria a duplicata para o codigo novo; o que
  // varia e a mensagem, entao e a mensagem que vira parametro.
  assert.match(hook, /async function marcarDiaInteiro\(/);
  assert.doesNotMatch(hook, /async function marcarTodasAulas\(/, 'a duplicata voltou');
  // E as duas chamadas continuam existindo para quem consome, com o rotulo certo.
  assert.match(hook, /marcarDia[,:\s]/);
  assert.match(hook, /marcarTodasAulas[,:\s]/);
});

test('o componente nao guarda mais o estado de salvar — ele vem do hook', () => {
  assert.doesNotMatch(toggle, /useState\(false\)[^\n]*\n?[^\n]*salvando/i);
  assert.match(toggle, /useProfessorPresenca\(/);
  assert.match(hook, /return \{[\s\S]*salvando[\s\S]*\}/);
});

test('o hook nao renderiza nada — quem desenha e o componente', () => {
  assert.doesNotMatch(hook, /<[A-Z][A-Za-z]*[\s/>]/, 'o hook tem JSX');
  assert.doesNotMatch(hook, /className=/);
});
