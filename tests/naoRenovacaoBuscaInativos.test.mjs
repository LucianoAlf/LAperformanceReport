import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Por que este teste existe (21/08/2026):
//
// O `ModalNaoRenovacao` era o unico dos quatro modais de saida que nao passava
// `apenasAtivos={false}`, entao herdava o default `true` do `AutocompleteAluno` e
// buscava so quem esta na base ativa canonica. Na pratica ele pedia um aluno ATIVO
// para registrar que o aluno SAIU — contradicao com o proprio proposito.
//
// Quem nao renovou ja saiu por definicao, entao o filtro derrubava exatamente o alvo.
// Caso real: Gabriela da Costa (Barra, matricula Emusys 647), contrato concluido em
// 18/08/2026, invisivel na busca enquanto seguia contada como ativa na Lista de Alunos.
//
// O caminho que funcionava era outro — o botao "marcar nao renovou" dentro da aba
// Renovacoes pendentes, que preenche o aluno pelo `editingItem` e nao passa pela busca.
// Mas ele so existe se alguem tiver lancado a renovacao pendente antes, o que em 2026
// aconteceu em 51 de 99 conclusoes.

const MODAIS_DE_SAIDA = [
  'src/components/App/Administrativo/ModalNaoRenovacao.tsx',
  'src/components/App/Administrativo/ModalEvasao.tsx',
  'src/components/App/Administrativo/ModalTrancamento.tsx',
  'src/components/App/Administrativo/ModalTransferencia.tsx',
];

for (const caminho of MODAIS_DE_SAIDA) {
  test(`${caminho} busca aluno inativo (apenasAtivos={false})`, () => {
    const fonte = readFileSync(caminho, 'utf8');

    assert.match(
      fonte,
      /<AutocompleteAluno[\s\S]{0,800}?apenasAtivos=\{false\}/u,
      'modal de saida precisa achar quem ja saiu — sem isso o aluno alvo some da busca',
    );
  });
}

test('o autocomplete continua com apenasAtivos=true por padrao', () => {
  const fonte = readFileSync('src/components/ui/AutocompleteAluno.tsx', 'utf8');

  // O default protege quem registra evento de aluno vivo (renovacao, por exemplo).
  // Liberar inativo e decisao de cada consumidor, nunca do componente.
  assert.match(fonte, /apenasAtivos\s*=\s*true,/u);
});

test('o autocomplete sinaliza quando o aluno nao esta ativo', () => {
  const fonte = readFileSync('src/components/ui/AutocompleteAluno.tsx', 'utf8');

  // Com inativo na lista, ativo e evadido ficariam indistinguiveis no dropdown —
  // e esta base tem homonimo e aluno com varias passagens. O badge so aparece
  // quando o status nao e 'ativo', entao o uso normal nao muda de aparencia.
  assert.match(
    fonte,
    /aluno\.status[\s\S]{0,200}?!==\s*['"]ativo['"]/u,
    'o dropdown precisa marcar aluno nao-ativo para nao trocarem de pessoa',
  );
});
