// Alunos no celular — arquetipo 1 do spec ("lista densa").
//
// A tabela do desktop tem 16 colunas e nao encolhe para 351px. A linha carrega
// tres coisas (quem · com quem/quando · o que exige acao) e o resto mora na
// ficha. O que este teste guarda nao e o layout: e que a REGRA por tras do selo
// continue tendo uma fonte so.
//
// As funcoes puras rodam de verdade (bundle por esbuild), nao por regex.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const selo = await (async () => {
  const saida = path.join(mkdtempSync(path.join(tmpdir(), 'selo-')), 'seloAluno.mjs');
  await esbuild.build({
    entryPoints: ['src/mobile/telas/alunos/seloAluno.ts'],
    bundle: true,
    format: 'esm',
    outfile: saida,
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  return import(pathToFileURL(saida).href);
})();

const { seloDoAluno, quandoTemAula, linkWhatsApp } = selo;

const aluno = (extra) => ({
  id: 1,
  nome: 'Fulano',
  status: 'ativo',
  status_pagamento: null,
  aguardando_renovacao: false,
  dia_aula: null,
  horario_aula: null,
  ...extra,
});

test('aluno ativo e em dia NAO recebe selo', () => {
  // Cor e vocabulario de excecao: numa lista em que tudo esta destacado, nada
  // esta. E a regra que a Agenda ja segue desde 03/08/2026.
  assert.equal(seloDoAluno(aluno({})), null);
});

test('inadimplente so e sinalizado enquanto a matricula esta ATIVA', () => {
  assert.equal(seloDoAluno(aluno({ status_pagamento: 'inadimplente' })).texto, 'Inadimplente');
  // Quem evadiu devendo continua devendo, mas cobrar na lista de alunos aponta
  // para uma matricula que nao existe mais — o lugar disso e o financeiro.
  assert.equal(seloDoAluno(aluno({ status: 'inativo', status_pagamento: 'inadimplente' })).texto, 'Saiu');
  assert.equal(seloDoAluno(aluno({ status: 'trancado', status_pagamento: 'inadimplente' })).texto, 'Trancado');
});

test('o selo e UM valor, e o mais grave vence', () => {
  // Condicoes independentes dariam dois selos e, com twMerge, a ultima classe
  // venceria — bug real ja acontecido na Agenda (cor contradizendo o badge).
  const doisEstados = seloDoAluno(aluno({ status_pagamento: 'inadimplente', aguardando_renovacao: true }));
  assert.equal(doisEstados.texto, 'Inadimplente', 'inadimplente + renovar sinaliza o que exige acao hoje');

  assert.equal(seloDoAluno(aluno({ aguardando_renovacao: true })).texto, 'Renovar');
  // Renovacao perde para qualquer estado de saida.
  assert.equal(
    seloDoAluno(aluno({ aguardando_renovacao: true, status: 'aviso_previo' })).texto,
    'Aviso prévio',
  );
});

test('⚠️ aviso previo ANULA a inadimplencia — e isso vem do desktop, nao daqui', () => {
  // Nao e escolha desta tela: `getStatusPagamentoOperacional` so devolve
  // 'inadimplente' quando `status === 'ativo'`, e aviso previo nao e 'ativo'.
  // Ou seja, quem esta de saida DEVENDO nao e sinalizado como inadimplente em
  // lugar nenhum do sistema — nem no desktop, que tem a regra desde sempre.
  //
  // O teste existe para que isso seja uma decisao VISIVEL: se um dia a casa
  // decidir que quem sai devendo tem de acender, o lugar da mudanca e
  // `src/lib/alunosStatus.ts`, e as duas telas mudam juntas.
  const saindoDevendo = seloDoAluno(aluno({ status: 'aviso_previo', status_pagamento: 'inadimplente' }));
  assert.equal(saindoDevendo.texto, 'Aviso prévio');
});

test('quandoTemAula nao deixa traco solto quando falta dia ou horario', () => {
  assert.equal(quandoTemAula('Terça', '14:00:00'), 'Terça 14:00');
  assert.equal(quandoTemAula('Terça', null), 'Terça');
  assert.equal(quandoTemAula(null, '14:00:00'), '14:00');
  assert.equal(quandoTemAula(null, null), '');
});

test('linkWhatsApp recusa numero curto e nao duplica o 55', () => {
  assert.equal(linkWhatsApp('(21) 96417-1223'), 'https://wa.me/5521964171223');
  assert.equal(linkWhatsApp('5521964171223'), 'https://wa.me/5521964171223');
  // Numero truncado geraria um link que abre conversa com desconhecido.
  assert.equal(linkWhatsApp('96417'), null);
  assert.equal(linkWhatsApp(null), null);
});

// ── fonte unica da regra ────────────────────────────────────────────────────

const ler = (p) => readFileSync(p, 'utf8');
const seloFonte = ler('src/mobile/telas/alunos/seloAluno.ts');
const telaFonte = ler('src/mobile/telas/AlunosMobile.tsx');
const tabelaDesktop = ler('src/components/App/Alunos/TabelaAlunos.tsx');
const folha = ler('src/mobile/telas/alunos/DetalheAlunoSheet.tsx');
const hook = ler('src/hooks/useAlunosLista.ts');
const pageDesktop = ler('src/components/App/Alunos/AlunosPage.tsx');

test('celular e desktop leem a MESMA regra de status de pagamento', () => {
  // A regra morava como funcao privada dentro de TabelaAlunos.tsx. Copia-la
  // criaria duas versoes da mesma regra de negocio — a causa-raiz documentada
  // das duplicatas de renovacao.
  for (const [nome, fonte] of [['selo do celular', seloFonte], ['tabela do desktop', tabelaDesktop]]) {
    assert.match(fonte, /from '@\/lib\/alunosStatus'/, `${nome} deixou de usar a regra compartilhada`);
  }
  // Ancorado na REIMPLEMENTACAO, nao na palavra: o que nao pode voltar e o
  // teste de "esta ativo?" escrito a mao ao lado do status_pagamento.
  for (const [nome, fonte] of [['selo do celular', seloFonte], ['tela do celular', telaFonte]]) {
    assert.doesNotMatch(
      fonte,
      /function\s+isMatriculaAtivaParaInadimplencia/,
      `${nome} reimplementou a regra em vez de importar`,
    );
  }
});

test('a tela do celular nao fala com o banco por conta propria', () => {
  // Consulta na tela seria a terceira leitura da lista de alunos.
  assert.doesNotMatch(telaFonte, /supabase\.(from|rpc)\(/);
  assert.match(telaFonte, /useAlunosLista/);
});

test('o hook pagina de 1000 — sem isso a lista TRUNCA sem erro nenhum', () => {
  // Teto do PostgREST. A rede passa de 1.151 pagantes: sem paginar, o fim do
  // alfabeto some da tela e nada acusa.
  assert.match(hook, /const PAGINA = 1000/);
  assert.match(hook, /\.range\(inicio, inicio \+ PAGINA - 1\)/);
  assert.match(pageDesktop, /PAGE_SIZE = 1000/, 'o desktop deixou de paginar — conferir se o teto mudou');
});

test('o hook aplica os DOIS filtros de linha que o desktop aplica', () => {
  // Se o desktop mudar o recorte da lista, este teste fica vermelho aqui em vez
  // de as duas telas divergirem em silencio.
  for (const [nome, fonte] of [['hook do celular', hook], ['AlunosPage do desktop', pageDesktop]]) {
    assert.match(fonte, /\.is\('arquivado_em', null\)/, `${nome} parou de excluir arquivados`);
    assert.match(fonte, /\.eq\('unidade_id', unidade/i, `${nome} parou de recortar por unidade`);
  }
});

test('erro de consulta nao vira lista vazia', () => {
  // "nenhum aluno" e "a consulta quebrou" sao estados diferentes, e a tela tem
  // de dizer qual dos dois aconteceu.
  assert.match(hook, /setErro\(error\.message\)/);
  assert.match(telaFonte, /Não consegui carregar a lista de alunos/);
});

test('os alvos de toque da tela respeitam 44px', () => {
  assert.match(telaFonte, /min-h-\[44px\]/, 'a busca perdeu o alvo de 44px');
  assert.match(folha, /min-h-\[44px\]/, 'os botoes de contato perderam o alvo de 44px');
});

test('a folha de detalhe existe porque a ficha (arquetipo 3) ainda nao existe', () => {
  // Portar Alunos nao pode TIRAR informacao que a equipe tem hoje no desktop.
  for (const campo of ['Parcela', 'Vencimento', 'Tempo de casa', 'Anamnese', 'Unidade']) {
    assert.ok(folha.includes(`rotulo="${campo}"`), `o campo ${campo} sumiu da folha de detalhe`);
  }
  assert.match(folha, /role="dialog"/);
  assert.match(folha, /e\.key === 'Escape'/, 'a folha nao fecha no Esc');
});

test('🔴 a tela existe mas NAO esta ligada — e religar exige cobrir a pagina inteira', () => {
  // Ela cobre 1 das 8 abas de /app/alunos (lista, turmas, grade, distribuicao,
  // conciliacao, importar, automacao, historico), nenhum dos 6 KPIs do topo, e
  // trocou a ficha de 9 abas por uma folha de 9 campos.
  //
  // Enquanto for assim, a rota tem de continuar mostrando o desktop COM a faixa
  // ambar: sem ela, quem abre Alunos no celular ve menos do que ve hoje e nao
  // tem como saber. Degradar e o combinado; esconder nao e.
  //
  // Este teste e o par invertido do "a rota so entra na lista com a tela ligada"
  // — la a lista nao pode andar sem o router, aqui o router nao pode andar sem a
  // lista. Ligar os dois no mesmo commit e o que ele obriga.
  const rotas = ler('src/mobile/rotasPortadas.ts');
  const router = ler('src/router.tsx');
  const portada = /ROTAS_PORTADAS[^=]*=\s*\[[^\]]*'\/app\/alunos'/.test(rotas);
  const montada = /AlunosResponsivo/.test(router);
  assert.equal(
    portada,
    montada,
    portada
      ? 'a rota saiu da faixa mas o router nao monta o AlunosResponsivo'
      : 'o router monta o AlunosResponsivo com a rota ainda na faixa de "nao adaptada"',
  );
});

test('o contato cai para o telefone do responsavel, e a tela DIZ que e dele', () => {
  // 392 alunos ativos so tem o numero do responsavel; ligar sem saber disso
  // comeca a conversa errada.
  assert.match(folha, /aluno\.whatsapp \|\| aluno\.telefone \|\| aluno\.responsavel_telefone/);
  assert.match(folha, /Contato do responsável/);
});
