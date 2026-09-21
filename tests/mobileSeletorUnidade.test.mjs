import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const layout = le('../src/mobile/MobileLayout.tsx');
const folha = le('../src/mobile/FolhaUnidades.tsx');
const hook = le('../src/hooks/useUnidadesAtivas.ts');

const CG = { id: 'cg', nome: 'Campo Grande' };
const BARRA = { id: 'barra', nome: 'Barra' };
const RECREIO = { id: 'recreio', nome: 'Recreio' };

test('🔴 "Consolidado" so aparece para ADMIN', async () => {
  // `p_unidade_id = null` significa a REDE INTEIRA, e as ~213 RPCs
  // SECURITY DEFINER que recebem esse parametro confiam nele sem passar por
  // RLS. Oferecer Consolidado a quem tem duas das tres unidades mostraria a
  // terceira.
  const { opcoesDeUnidade } = await import('../src/mobile/unidadeLabel.ts');

  const deAdmin = opcoesDeUnidade(true, [], [BARRA, CG, RECREIO]);
  assert.equal(deAdmin[0].id, null, 'admin abre em Consolidado');
  assert.equal(deAdmin[0].nome, 'Consolidado');
  assert.equal(deAdmin.length, 4);

  const multi = opcoesDeUnidade(false, [BARRA, CG], [BARRA, CG, RECREIO]);
  assert.deepEqual(multi.map((o) => o.id), ['barra', 'cg']);
  assert.ok(
    multi.every((o) => o.id !== null),
    'nao-admin nunca pode receber a opcao nula (rede inteira)',
  );
  // E nao ve a unidade que nao e dele, mesmo com a lista da rede na mao.
  assert.ok(!multi.some((o) => o.id === 'recreio'));
});

test('quem tem uma unidade so nao ganha seletor', () => {
  // Botao que abre uma folha de um item ensina a desconfiar do gesto.
  return import('../src/mobile/unidadeLabel.ts').then(({ opcoesDeUnidade }) => {
    assert.deepEqual(opcoesDeUnidade(false, [CG], [BARRA, CG]), []);
    assert.deepEqual(opcoesDeUnidade(false, [], [BARRA, CG]), []);
  });
});

test('admin sem a lista da rede ainda nao recebe uma folha de um item', async () => {
  // `unidadesPermitidas` vem VAZIA para admin (vinculo RBAC global), entao a
  // lista dele depende de uma consulta. Enquanto ela nao volta — ou se
  // falhar — "Consolidado" sozinho nao e escolha nenhuma.
  const { opcoesDeUnidade } = await import('../src/mobile/unidadeLabel.ts');
  assert.deepEqual(opcoesDeUnidade(true, [], []), []);
});

test('nome nulo vira rotulo, nunca string vazia', async () => {
  const { opcoesDeUnidade } = await import('../src/mobile/unidadeLabel.ts');
  const [, primeira] = opcoesDeUnidade(true, [], [{ id: 'x', nome: null }]);
  assert.equal(primeira.nome, 'Unidade');
});

test('o shell so oferece o gesto quando ha o que trocar — e le a regra canonica', () => {
  // `canChangeUnidade` (admin OU 2+ vinculos) mora em useUnidadeFiltro e e a
  // mesma regra do desktop. Reescreve-la aqui seria a segunda versao dela.
  assert.match(layout, /canChangeUnidade/u);
  assert.match(
    layout,
    /onAbrirUnidades=\{canChangeUnidade \? \(\) => setUnidadesAberto\(true\) : undefined\}/u,
    'sem vinculo com canChangeUnidade, quem tem uma unidade so ganharia um botao inutil',
  );
  assert.doesNotMatch(
    layout,
    /unidadesPermitidas\.length\s*>\s*1/u,
    'a regra de quem pode trocar nao pode ser reescrita no shell',
  );
});

test('a folha DESENHA as opcoes, nao decide escopo', () => {
  // Escopo e regra de seguranca: ela mora numa funcao pura, testada, longe do
  // JSX. Uma folha que perguntasse "isAdmin?" seria o segundo lugar a errar.
  assert.doesNotMatch(folha, /isAdmin/u, 'a folha nao pode decidir quem ve o que');
  assert.doesNotMatch(
    folha,
    /'Consolidado'/u,
    'o rotulo da rede inteira vem das opcoes, nao escrito na folha',
  );
});

test('a carga das unidades nao falha em silencio', () => {
  // A mesma consulta no AppHeader do desktop faz `if (data) setUnidades(data)`
  // e descarta o erro: uma falha ali deixa o admin com o seletor vazio e sem
  // nenhuma pista. Aqui o erro e lido, logado e devolvido para a tela.
  assert.match(hook, /\{ data, error \}/u);
  assert.match(hook, /if \(error\)/u);
  assert.match(hook, /console\.error\(/u);
  assert.match(hook, /setErro\(error\.message\)/u);
  // A consulta so acontece para admin — escopo, nao otimizacao.
  assert.match(hook, /if \(!habilitado\) return undefined;/u);
});
