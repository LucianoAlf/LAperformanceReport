import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O working tree deste repo guarda .tsx em CRLF no Windows; normalizar deixa
// os regex abaixo previsíveis independente do fim de linha (padrão já usado
// em tests/dashboardDadosContrato.test.mjs).
const fonte = readFileSync(new URL('../src/components/ui/KPICard.tsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

// Extrai o elemento <button>...</button> do "?" de ajuda. Só há um botão no
// arquivo hoje; ancorar na primeira ocorrência de <button> (em vez de exigir
// o aria-label específico dentro da própria regex) já é suficiente porque
// cada assert abaixo confere, DENTRO desse mesmo bloco, que é o botão certo.
function extrairBotaoAjuda(src) {
  const m = src.match(/<button[\s\S]*?<\/button>/);
  return m ? m[0] : null;
}

// Extrai o corpo do className={cn(...)} que contém "pointer-events-none" —
// só o balão do tooltip usa essa classe no arquivo inteiro, então isolar o
// cn() que a contém é o jeito de perguntar "quais classes tem ESTE elemento",
// e não "essa substring aparece em algum lugar do arquivo" (o que uma classe
// group-hover sobrevivente em código morto, ou pertencente a outro elemento,
// também satisfaria).
function extrairClassesTooltip(src) {
  const blocos = [...src.matchAll(/className=\{cn\(([\s\S]*?)\)\}/g)];
  const bloco = blocos.find((b) => b[1].includes('pointer-events-none'));
  return bloco ? bloco[1] : null;
}

test('o useState foi importado — o KPICard não importava nada de react', () => {
  assert.match(fonte, /import \{[^}]*useState[^}]*\} from 'react'/);
});

test('existe estado de toque para o tooltip, e ele é USADO — não só declarado', () => {
  assert.match(fonte, /const \[tooltipAberto, setTooltipAberto\] = useState\(false\)/);
  // Declarar o estado sem usá-lo em lugar nenhum passaria numa leitura ingênua
  // do arquivo (a declaração sozinha já contém a string "setTooltipAberto").
  // Exigir uma 2ª ocorrência prova que algo além da própria declaração invoca
  // o setter.
  const usos = fonte.split('setTooltipAberto').length - 1;
  assert.ok(usos >= 2, 'setTooltipAberto só aparece na declaração — nada o invoca');
});

test('o "?" é um <button> — não um <span> mudo — com alvo de toque de 44px e rótulo acessível', () => {
  const botao = extrairBotaoAjuda(fonte);
  assert.ok(botao, 'não há nenhum elemento <button>...</button> no arquivo');
  assert.match(botao, /aria-label="Explicação do indicador"/);
  assert.match(botao, /min-h-\[44px\]/);
  assert.match(botao, /min-w-\[44px\]/);
});

test('o clique no "?" chama stopPropagation E alterna o estado do tooltip — as duas coisas DENTRO do mesmo botão', () => {
  const botao = extrairBotaoAjuda(fonte);
  assert.ok(botao, 'não há <button> para inspecionar');
  // As duas coisas têm de estar dentro do MESMO elemento: um stopPropagation()
  // solto em outra parte do arquivo satisfaria um assert.match sobre `fonte`
  // inteira sem provar que é o clique no "?" que impede o onClick do card
  // (drill-down de Matrículas/Evasões/Experimentais) de disparar.
  assert.match(botao, /onClick=\{[\s\S]*?stopPropagation\(\)/, 'o onClick do botão não chama stopPropagation()');
  assert.match(botao, /onClick=\{[\s\S]*?setTooltipAberto/, 'o onClick do botão não altera tooltipAberto');
});

test('o hover do desktop continua abrindo o MESMO balão que o toque abre — group-hover ancorado no elemento do tooltip', () => {
  const classes = extrairClassesTooltip(fonte);
  assert.ok(classes, 'não achei o className={cn(...)} do balão (procurei por "pointer-events-none")');
  assert.match(classes, /group-hover:opacity-100/, 'o hover do desktop foi removido do balão');
  assert.match(classes, /group-hover:visible/, 'o hover do desktop foi removido do balão (visible)');
  // As classes de hover têm que convivver, no MESMO cn(), com a condicional de
  // toque — group-hover sozinho (sem a condicional) seria o comportamento
  // antigo disfarçado de correção.
  assert.match(classes, /tooltipAberto\s*\?/, 'o balão não reage ao estado de toque');
  assert.match(classes, /opacity-0/, 'o balão perdeu o estado escondido por padrão (opacity-0)');
  assert.match(classes, /invisible/, 'o balão perdeu o estado escondido por padrão (invisible)');
});

test('o wrapper do "?" e do balão mantém a classe "group" — sem ela, group-hover: nunca dispara', () => {
  // group-hover: só funciona se algum ancestral tiver a classe "group". Sem
  // este assert, o teste anterior passaria mesmo com uma classe group-hover
  // que nunca é acionada por nenhum hover real.
  assert.match(fonte, /className="relative group[^"]*"/, 'nenhum wrapper com classe "group" envolve o botão e o balão');
});
