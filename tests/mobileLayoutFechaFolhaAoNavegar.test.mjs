import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync('src/mobile/MobileLayout.tsx', 'utf8');
const agenda = readFileSync('src/lib/agenda.ts', 'utf8');

test('TODA folha do shell fecha quando a rota muda (voltar do Android)', () => {
  // Ancorado no efeito INTEIRO — nao so em "setMaisAberto(false)" solto, que
  // ja aparece em outro lugar (o onFechar da MobileMaisSheet) e passaria
  // mesmo sem o useEffect existir.
  const efeito = layout.match(
    /useEffect\(\(\) => \{([\s\S]*?)\}, \[location\.pathname\]\);/u,
  );
  assert.ok(efeito, 'o efeito que fecha as folhas ao navegar sumiu');

  // ⚠️ A trava vale para CADA folha do shell, derivada dos estados que existem
  // — nao de uma lista escrita a mao. O MobileLayout nao desmonta ao navegar,
  // entao folha que nao for fechada aqui fica por cima da tela nova; assim,
  // folha nova nasce coberta em vez de depender de alguem lembrar.
  const folhas = [...layout.matchAll(/const \[(\w+Aberto), set\w+\] = useState\(false\)/gu)];
  assert.ok(folhas.length >= 2, 'esperava ao menos a folha "Mais" e a de unidades');
  for (const [, estado] of folhas) {
    const setter = `set${estado[0].toUpperCase()}${estado.slice(1)}(false)`;
    assert.ok(
      efeito[1].includes(setter),
      `a folha ${estado} nao e fechada ao navegar: falta ${setter} no efeito de location.pathname`,
    );
  }
});

test('unidadeLabel.ts decide Consolidado x Unidade, MobileLayout so repassa', () => {
  // ⚠️ O rotulo le das MESMAS opcoes que a folha de unidades oferece. Com
  // `unidadesDisponiveis` (que e [] para admin, por desenho de
  // useUnidadeFiltro) o admin que escolhesse Campo Grande via "Unidade" no
  // cabecalho — nome nenhum. Duas listas, dois textos para a mesma escolha.
  assert.match(layout, /labelDaUnidade\(filtroAtivo, unidadeSelecionada, opcoesUnidade\)/u);
  assert.doesNotMatch(layout, /\?\?\s*'Consolidado'/u, 'a decisao nao pode voltar a morar aqui por ausencia de nome');
});

test('a funcao local de iniciais tem nome proprio — nao colide com a de agenda.ts', () => {
  assert.match(layout, /function iniciaisDoUsuario\(/u);
  assert.doesNotMatch(layout, /function iniciaisDoNome\(/u, 'o nome antigo colidia com src/lib/agenda.ts');

  // A de agenda.ts continua intocada: 1 palavra -> 2 letras (slice(0,2)),
  // diferente da local (1 palavra -> 1 letra). Sao funcoes DIFERENTES de
  // proposito — nunca dedupli-las.
  assert.match(agenda, /export function iniciaisDoNome\(nome: string\): string \{/u);
  assert.match(agenda, /partes\[0\]\.slice\(0, 2\)\.toUpperCase\(\)/u);
});
