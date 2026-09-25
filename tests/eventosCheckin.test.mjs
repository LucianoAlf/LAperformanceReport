/**
 * Check-in do dia do recital — LAPE-39, fase 7.
 *
 * O que estes testes travam e a consequencia de o check-in ser da PESSOA e nao da
 * apresentacao: quem toca duas vezes chega uma vez so, e as duas linhas tem de refletir a
 * mesma chegada. Errar isso produz uma tela que pergunta duas vezes se o Joao ja chegou.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/eventos.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'evt-chk-')), 'eventos.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { montarListaDeChegada, ordenarPessoasDaPorta, selecionarParaCertificado } = lib;

const EVENTO = {
  horario_inicio: '09:00',
  duracao_padrao_segundos: 300,
  intervalo_entre_blocos_segundos: 2700,
};

let seq = 0;
const ap = (extra = {}) => {
  seq += 1;
  return {
    id: seq,
    ordem: seq,
    duracao_segundos: 300,
    pessoa_chave: `p${seq}`,
    aluno_id: 100 + seq,
    aluno_nome: `Aluno ${seq}`,
    curso_nome: 'Violão',
    musica: 'Asa Branca',
    ...extra,
  };
};

const bloco = (nome, apresentacoes, extra = {}) => ({
  id: Number(nome.replace(/\D/gu, '')) || 1,
  nome,
  ordem: Number(nome.replace(/\D/gu, '')) || 1,
  horario_inicial: null,
  inicio_manual: false,
  apresentacoes,
  ...extra,
});

const participacao = (extra = {}) => ({
  pessoa_chave: 'x',
  nome: 'Fulano',
  status: 'participa',
  checkin_em: null,
  aluno_id: 1,
  ...extra,
});

const entrada = (blocos = [], participacoes = []) => ({ evento: EVENTO, blocos, participacoes });

/* ─────────────────── o check-in e da pessoa, nao da apresentacao ─────────────────── */

test('quem toca em 2 cursos aparece 2x na ordem e chega UMA vez', () => {
  // O caso que decidiu o schema: `checkin_em` mora em evento_participacao, cuja UNIQUE e
  // (evento_id, pessoa_chave). Se morasse na apresentacao, existiriam duas respostas para
  // "a Maria chegou?" — e a segunda seria escrita horas depois, por outra pessoa.
  const violao = ap({ pessoa_chave: 'maria', aluno_nome: 'Maria', curso_nome: 'Violão' });
  const canto = ap({ pessoa_chave: 'maria', aluno_nome: 'Maria', curso_nome: 'Canto' });
  const r = montarListaDeChegada(
    entrada(
      [bloco('Bloco 1', [violao]), bloco('Bloco 2', [canto])],
      [participacao({ pessoa_chave: 'maria', nome: 'Maria', checkin_em: '2026-09-19T21:00:00Z' })],
    ),
  );

  assert.equal(r.ordem.length, 2, 'duas apresentações');
  assert.equal(r.pessoas.length, 1, 'uma pessoa');
  assert.ok(r.ordem.every((l) => l.chegouEm !== null), 'as duas linhas refletem a mesma chegada');
  assert.equal(r.resumo.chegaram, 1);
  assert.equal(r.resumo.esperados, 1);
  assert.equal(r.resumo.apresentacoesSemChegada, 0);
});

test('cada linha diz quantas OUTRAS vezes a pessoa sobe ao palco', () => {
  // Sem este aviso, quem opera acharia que precisa marcar de novo na proxima apresentacao
  // dela — ou que a marca verde vazou de algum lugar.
  const a1 = ap({ pessoa_chave: 'maria', aluno_nome: 'Maria' });
  const a2 = ap({ pessoa_chave: 'maria', aluno_nome: 'Maria' });
  const sozinho = ap({ pessoa_chave: 'joao', aluno_nome: 'João' });
  const r = montarListaDeChegada(entrada([bloco('Bloco 1', [a1, a2, sozinho])], []));

  const daMaria = r.ordem.filter((l) => l.pessoaChave === 'maria');
  assert.equal(daMaria.length, 2);
  assert.ok(daMaria.every((l) => l.outrasApresentacoes === 1));
  assert.equal(r.ordem.find((l) => l.pessoaChave === 'joao').outrasApresentacoes, 0);
});

/* ─────────────────────────── a ordem e do palco ─────────────────────────── */

test('a ordem segue bloco e posicao, com o horario calculado', () => {
  const r = montarListaDeChegada(
    entrada([
      bloco('Bloco 1', [ap({ ordem: 2, aluno_nome: 'Segundo' }), ap({ ordem: 1, aluno_nome: 'Primeiro' })]),
      bloco('Bloco 2', [ap({ ordem: 1, aluno_nome: 'Terceiro' })]),
    ]),
  );

  assert.deepEqual(
    r.ordem.map((l) => [l.posicao, l.alunoNome, l.horario]),
    [
      [1, 'Primeiro', '09:00'],
      // 09:05 (fim do primeiro) + 5 min de troca
      [2, 'Segundo', '09:10'],
      // 09:15 (fim do bloco 1) + 45 min de intervalo
      [3, 'Terceiro', '10:00'],
    ],
  );
});

test('a posicao e continua entre blocos — e o numero que o MC anuncia', () => {
  const r = montarListaDeChegada(
    entrada([bloco('Bloco 1', [ap(), ap()]), bloco('Bloco 2', [ap(), ap()])]),
  );
  assert.deepEqual(r.ordem.map((l) => l.posicao), [1, 2, 3, 4]);
});

/* ─────────────────────────── recorte por bloco ─────────────────────────── */

test('cada bloco tem a lista e a contagem dele', () => {
  const r = montarListaDeChegada(
    entrada(
      [
        bloco('Bloco 1', [
          ap({ pessoa_chave: 'a', aluno_nome: 'Ana' }),
          ap({ pessoa_chave: 'b', aluno_nome: 'Bruno' }),
        ]),
        bloco('Bloco 2', [ap({ pessoa_chave: 'c', aluno_nome: 'Carla' })]),
      ],
      [participacao({ pessoa_chave: 'a', nome: 'Ana', checkin_em: '2026-09-19T21:00:00Z' })],
    ),
  );

  assert.equal(r.blocos.length, 2);
  const [b1, b2] = r.blocos;
  assert.equal(b1.nome, 'Bloco 1');
  assert.equal(b1.linhas.length, 2);
  assert.equal(b1.pessoas, 2);
  assert.equal(b1.chegaram, 1);
  assert.equal(b1.faltam, 1);
  assert.equal(b2.pessoas, 1);
  assert.equal(b2.chegaram, 0);
});

test('o bloco carrega o horario previsto de inicio', () => {
  const r = montarListaDeChegada(
    entrada([bloco('Bloco 1', [ap()]), bloco('Bloco 2', [ap()])]),
  );
  assert.equal(r.blocos[0].inicio, '09:00');
  // 09:05 (fim do bloco 1) + 45 min
  assert.equal(r.blocos[1].inicio, '09:50');
});

test('quem toca em DOIS blocos conta nos dois — e um check-in acende os dois', () => {
  // ⚠️ Somar os `esperados` dos blocos NAO devolve o total: o bloco pergunta "quem tem de
  // estar aqui agora", o total pergunta "quantas pessoas esperamos hoje". Uniformizar as
  // duas faria um dos dois números mentir.
  const r = montarListaDeChegada(
    entrada(
      [
        bloco('Bloco 1', [ap({ pessoa_chave: 'maria', aluno_nome: 'Maria' })]),
        bloco('Bloco 2', [ap({ pessoa_chave: 'maria', aluno_nome: 'Maria' })]),
      ],
      [participacao({ pessoa_chave: 'maria', nome: 'Maria', checkin_em: '2026-09-19T21:00:00Z' })],
    ),
  );
  assert.equal(r.blocos[0].pessoas, 1);
  assert.equal(r.blocos[1].pessoas, 1);
  assert.equal(r.blocos[0].chegaram, 1);
  assert.equal(r.blocos[1].chegaram, 1);
  assert.equal(r.resumo.esperados, 1, 'no total ela é UMA pessoa');
});

test('duas apresentacoes da mesma pessoa NO MESMO bloco contam uma vez', () => {
  // Contar as linhas diria que falta gente que já está na coxia.
  const r = montarListaDeChegada(
    entrada([
      bloco('Bloco 1', [
        ap({ pessoa_chave: 'maria', aluno_nome: 'Maria', curso_nome: 'Violão' }),
        ap({ pessoa_chave: 'maria', aluno_nome: 'Maria', curso_nome: 'Canto' }),
      ]),
    ]),
  );
  assert.equal(r.blocos[0].linhas.length, 2);
  assert.equal(r.blocos[0].pessoas, 1);
  assert.equal(r.blocos[0].faltam, 1);
});

test('bloco vazio aparece na lista, com contagem zerada', () => {
  // Some da programação impressa (a Revisão acusa), mas aqui ele existe: quem opera o dia
  // precisa ver que o bloco está lá e não tem ninguém.
  const r = montarListaDeChegada(entrada([bloco('Bloco 1', []), bloco('Bloco 2', [ap()])]));
  assert.equal(r.blocos.length, 2);
  assert.equal(r.blocos[0].pessoas, 0);
  assert.equal(r.blocos[0].linhas.length, 0);
});

test('os blocos saem na ordem do recital', () => {
  const r = montarListaDeChegada(
    entrada([bloco('Bloco 3', [ap()]), bloco('Bloco 1', [ap()]), bloco('Bloco 2', [ap()])]),
  );
  assert.deepEqual(r.blocos.map((b) => b.nome), ['Bloco 1', 'Bloco 2', 'Bloco 3']);
});

test('a soma das linhas dos blocos e exatamente a ordem completa', () => {
  const r = montarListaDeChegada(
    entrada([bloco('Bloco 1', [ap(), ap()]), bloco('Bloco 2', [ap()])]),
  );
  assert.deepEqual(
    r.blocos.flatMap((b) => b.linhas.map((l) => l.apresentacaoId)),
    r.ordem.map((l) => l.apresentacaoId),
    'agrupar não pode perder nem reordenar apresentação',
  );
});

/* ──────────────────────── quem entra na lista do dia ──────────────────────── */

test('quem confirmou e nao entrou na grade ENTRA na lista da porta', () => {
  // Ela vem ao teatro do mesmo jeito. Deixar de fora faria a pessoa aparecer na porta e nao
  // existir na lista de quem a recebe.
  const r = montarListaDeChegada(
    entrada([], [participacao({ pessoa_chave: 'ana', nome: 'Ana', status: 'participa' })]),
  );
  assert.equal(r.pessoas.length, 1);
  assert.equal(r.pessoas[0].apresentacoes.length, 0, 'sem apresentação na grade');
  assert.equal(r.resumo.esperados, 1);
  assert.equal(r.resumo.apresentacoes, 0);
});

test('quem esta na grade entra mesmo sem linha de participacao', () => {
  // Nenhuma RPC da grade cria `evento_participacao` — provado no banco em 19/09/2026. Quem
  // foi alocado sem ninguem marcar participacao tem de aparecer, senao some da porta.
  const r = montarListaDeChegada(entrada([bloco('Bloco 1', [ap({ pessoa_chave: 'orfao' })])], []));
  assert.equal(r.pessoas.length, 1);
  assert.equal(r.pessoas[0].status, 'indefinido', 'default do banco, nunca "participa" inventado');
  assert.equal(r.resumo.esperados, 1);
});

test('quem marcou "nao participa" e NAO esta na grade fica de fora', () => {
  const r = montarListaDeChegada(
    entrada([], [participacao({ pessoa_chave: 'nao_vem', nome: 'Desistente', status: 'nao' })]),
  );
  assert.equal(r.pessoas.length, 0);
});

test('quem marcou "nao participa" mas CONTINUA na grade aparece, marcado', () => {
  // Ele está anunciado no programa impresso: a produção precisa saber se apareceu. Sumir
  // com a linha esconderia justamente o caso que a Revisão acusa como impedimento.
  const r = montarListaDeChegada(
    entrada(
      [bloco('Bloco 1', [ap({ pessoa_chave: 'x', aluno_nome: 'Desistente' })])],
      [participacao({ pessoa_chave: 'x', nome: 'Desistente', status: 'nao' })],
    ),
  );
  assert.equal(r.pessoas.length, 1);
  assert.equal(r.pessoas[0].status, 'nao');
  assert.equal(r.ordem[0].status, 'nao');
});

test('evento sem nada nao inventa lista nem divide por zero', () => {
  const r = montarListaDeChegada(entrada());
  assert.deepEqual(r.ordem, []);
  assert.deepEqual(r.pessoas, []);
  assert.deepEqual(r.resumo, {
    esperados: 0,
    chegaram: 0,
    faltam: 0,
    apresentacoesSemChegada: 0,
    apresentacoes: 0,
  });
});

/* ───────────────────────────── contagem ───────────────────────────── */

test('faltam = esperados - chegaram, contando PESSOAS', () => {
  const r = montarListaDeChegada(
    entrada(
      [
        bloco('Bloco 1', [
          ap({ pessoa_chave: 'a', aluno_nome: 'A' }),
          ap({ pessoa_chave: 'a', aluno_nome: 'A' }),
          ap({ pessoa_chave: 'b', aluno_nome: 'B' }),
        ]),
      ],
      [
        participacao({ pessoa_chave: 'a', nome: 'A', checkin_em: '2026-09-19T21:00:00Z' }),
        participacao({ pessoa_chave: 'b', nome: 'B' }),
      ],
    ),
  );
  assert.equal(r.resumo.esperados, 2);
  assert.equal(r.resumo.chegaram, 1);
  assert.equal(r.resumo.faltam, 1);
  assert.equal(r.resumo.apresentacoes, 3);
  // A conta de APRESENTACOES sem chegada e outra pergunta: a pessoa "a" tem 2, e as duas
  // estao cobertas por um check-in so.
  assert.equal(r.resumo.apresentacoesSemChegada, 1);
});

/* ───────────────────────────── nome exibido ───────────────────────────── */

test('o nome vem da GRADE quando a pessoa esta nela', () => {
  // A grade guarda o nome pela procedencia, entao continua legivel depois do recital, mesmo
  // se a pessoa sair da base ativa. Apagar o nome reescreveria a historia.
  const r = montarListaDeChegada(
    entrada(
      [bloco('Bloco 1', [ap({ pessoa_chave: 'x', aluno_nome: 'Nome na grade' })])],
      [participacao({ pessoa_chave: 'x', nome: 'Nome na participação' })],
    ),
  );
  assert.equal(r.pessoas[0].nome, 'Nome na grade');
});

test('sem grade, o nome vem da participacao', () => {
  const r = montarListaDeChegada(
    entrada([], [participacao({ pessoa_chave: 'x', nome: 'Só confirmou' })]),
  );
  assert.equal(r.pessoas[0].nome, 'Só confirmou');
});

/* ─────────────────────── ordenacao da porta ─────────────────────── */

test('ordenar a porta NAO muda a lista recebida', () => {
  // A mesma lista alimenta as duas visoes: ordenar no lugar mexeria na ordem do palco junto.
  const r = montarListaDeChegada(
    entrada([
      bloco('Bloco 1', [ap({ pessoa_chave: 'z', aluno_nome: 'Zuleica' }), ap({ pessoa_chave: 'a', aluno_nome: 'Ana' })]),
    ]),
  );
  const antes = r.pessoas.map((p) => p.nome);
  ordenarPessoasDaPorta(r.pessoas);
  assert.deepEqual(r.pessoas.map((p) => p.nome), antes, 'a entrada não pode ser mutada');
});

test('quem falta vem antes de quem ja chegou', () => {
  // Com o teatro enchendo, a pergunta da porta deixa de ser "onde esta o Bruno" e passa a
  // ser "quem ainda nao chegou". Alfabetica pura manteria no topo justamente quem ja chegou.
  const r = montarListaDeChegada(
    entrada(
      [
        bloco('Bloco 1', [
          ap({ pessoa_chave: 'a', aluno_nome: 'Ana' }),
          ap({ pessoa_chave: 'b', aluno_nome: 'Bruno' }),
          ap({ pessoa_chave: 'c', aluno_nome: 'Carla' }),
        ]),
      ],
      [participacao({ pessoa_chave: 'a', nome: 'Ana', checkin_em: '2026-09-19T21:00:00Z' })],
    ),
  );
  assert.deepEqual(
    ordenarPessoasDaPorta(r.pessoas).map((p) => p.nome),
    ['Bruno', 'Carla', 'Ana'],
    'Ana chegou e desce, apesar de ser a primeira no alfabeto',
  );
});

test('dentro de cada grupo a ordem e alfabetica, com acento', () => {
  // `localeCompare(_, 'pt-BR')`: sem ele, "Ângela" cairia depois de "Bruno" pelo code point.
  const r = montarListaDeChegada(
    entrada([
      bloco('Bloco 1', [
        ap({ pessoa_chave: 'b', aluno_nome: 'Bruno' }),
        ap({ pessoa_chave: 'an', aluno_nome: 'Ângela' }),
        ap({ pessoa_chave: 'al', aluno_nome: 'Alice' }),
      ]),
    ]),
  );
  assert.deepEqual(
    ordenarPessoasDaPorta(r.pessoas).map((p) => p.nome),
    ['Alice', 'Ângela', 'Bruno'],
  );
});

test('com todo mundo chegado a lista volta a ser so alfabetica', () => {
  const r = montarListaDeChegada(
    entrada(
      [
        bloco('Bloco 1', [
          ap({ pessoa_chave: 'z', aluno_nome: 'Zuleica' }),
          ap({ pessoa_chave: 'a', aluno_nome: 'Ana' }),
        ]),
      ],
      [
        participacao({ pessoa_chave: 'z', nome: 'Zuleica', checkin_em: '2026-09-19T21:00:00Z' }),
        participacao({ pessoa_chave: 'a', nome: 'Ana', checkin_em: '2026-09-19T21:05:00Z' }),
      ],
    ),
  );
  assert.deepEqual(ordenarPessoasDaPorta(r.pessoas).map((p) => p.nome), ['Ana', 'Zuleica']);
});

test('ordenar a porta devolve todo mundo, sem perder nem duplicar', () => {
  const r = montarListaDeChegada(
    entrada(
      [
        bloco('Bloco 1', [
          ap({ pessoa_chave: 'a', aluno_nome: 'Ana' }),
          ap({ pessoa_chave: 'b', aluno_nome: 'Bruno' }),
          ap({ pessoa_chave: 'c', aluno_nome: 'Carla' }),
        ]),
      ],
      [participacao({ pessoa_chave: 'b', nome: 'Bruno', checkin_em: '2026-09-19T21:00:00Z' })],
    ),
  );
  const ordenada = ordenarPessoasDaPorta(r.pessoas);
  assert.equal(ordenada.length, 3);
  assert.deepEqual(
    [...ordenada.map((p) => p.pessoaChave)].sort(),
    ['a', 'b', 'c'],
    'ordenar não é filtrar',
  );
});

/* ─────────────────────── quem recebe certificado ─────────────────────── */

const listaCom = (blocos, participacoes) =>
  montarListaDeChegada(entrada(blocos, participacoes)).pessoas;

test('"quem chegou" exige check-in, e so ele', () => {
  const pessoas = listaCom(
    [
      bloco('Bloco 1', [
        ap({ pessoa_chave: 'a', aluno_nome: 'Ana' }),
        ap({ pessoa_chave: 'b', aluno_nome: 'Bruno' }),
      ]),
    ],
    [
      participacao({ pessoa_chave: 'a', nome: 'Ana', checkin_em: '2026-09-19T21:00:00Z' }),
      participacao({ pessoa_chave: 'b', nome: 'Bruno' }),
    ],
  );
  assert.deepEqual(
    selecionarParaCertificado(pessoas, 'chegou').map((p) => p.nome),
    ['Ana'],
  );
});

test('"todos os esperados" inclui quem nao fez check-in', () => {
  // O caso do primeiro recital: a aba acabou de nascer e ninguém usou o check-in. Sem esta
  // opção, a escola não conseguiria emitir certificado nenhum.
  const pessoas = listaCom(
    [
      bloco('Bloco 1', [
        ap({ pessoa_chave: 'a', aluno_nome: 'Ana' }),
        ap({ pessoa_chave: 'b', aluno_nome: 'Bruno' }),
      ]),
    ],
    [],
  );
  assert.equal(selecionarParaCertificado(pessoas, 'chegou').length, 0);
  assert.equal(selecionarParaCertificado(pessoas, 'todos').length, 2);
});

test('quem marcou "nao participa" fica FORA da lista de esperados', () => {
  // Certificar quem declarou que não viria é afirmar no papel uma participação que ninguém
  // observou — e o papel vai para a família do aluno.
  const pessoas = listaCom(
    [bloco('Bloco 1', [ap({ pessoa_chave: 'x', aluno_nome: 'Desistente' })])],
    [participacao({ pessoa_chave: 'x', nome: 'Desistente', status: 'nao' })],
  );
  assert.equal(selecionarParaCertificado(pessoas, 'todos').length, 0);
});

test('mas quem marcou "nao" e APARECEU recebe — a evidencia vence a declaracao', () => {
  const pessoas = listaCom(
    [bloco('Bloco 1', [ap({ pessoa_chave: 'x', aluno_nome: 'Voltou Atrás' })])],
    [
      participacao({
        pessoa_chave: 'x',
        nome: 'Voltou Atrás',
        status: 'nao',
        checkin_em: '2026-09-19T21:00:00Z',
      }),
    ],
  );
  assert.equal(selecionarParaCertificado(pessoas, 'chegou').length, 1);
});

test('quem faz 2 cursos recebe UM certificado, com os dois no repertorio', () => {
  // 🔴 Decisão pendente, não conclusão: se a escola definir um por curso, o grão muda para
  // (pessoa, curso) e `certificado_status` muda de tabela. Este formato atende as duas
  // leituras sem escolher nenhuma.
  const pessoas = listaCom(
    [
      bloco('Bloco 1', [
        ap({ pessoa_chave: 'maria', aluno_nome: 'Maria', curso_nome: 'Violão', musica: 'Asa Branca' }),
        ap({ pessoa_chave: 'maria', aluno_nome: 'Maria', curso_nome: 'Canto', musica: 'Trem Bala' }),
      ]),
    ],
    [participacao({ pessoa_chave: 'maria', nome: 'Maria', checkin_em: '2026-09-19T21:00:00Z' })],
  );
  const recebem = selecionarParaCertificado(pessoas, 'chegou');
  assert.equal(recebem.length, 1, 'uma pessoa, um papel');
  assert.deepEqual(
    recebem[0].apresentacoes.map((a) => [a.cursoNome, a.musica]),
    [
      ['Violão', 'Asa Branca'],
      ['Canto', 'Trem Bala'],
    ],
  );
});

test('a pilha de certificados sai em ordem alfabetica', () => {
  // Quem entrega procura por NOME, não por ordem de palco.
  const pessoas = listaCom(
    [
      bloco('Bloco 1', [
        ap({ pessoa_chave: 'z', aluno_nome: 'Zuleica' }),
        ap({ pessoa_chave: 'an', aluno_nome: 'Ângela' }),
        ap({ pessoa_chave: 'al', aluno_nome: 'Alice' }),
      ]),
    ],
    [],
  );
  assert.deepEqual(
    selecionarParaCertificado(pessoas, 'todos').map((p) => p.nome),
    ['Alice', 'Ângela', 'Zuleica'],
  );
});

test('selecionar nao muta a lista recebida', () => {
  const pessoas = listaCom(
    [
      bloco('Bloco 1', [
        ap({ pessoa_chave: 'z', aluno_nome: 'Zuleica' }),
        ap({ pessoa_chave: 'a', aluno_nome: 'Ana' }),
      ]),
    ],
    [],
  );
  const antes = pessoas.map((p) => p.nome);
  selecionarParaCertificado(pessoas, 'todos');
  assert.deepEqual(pessoas.map((p) => p.nome), antes);
});

/* ─────────────────────────── a aba existe ─────────────────────────── */

test('a aba Check-in renderiza a tela', () => {
  const pagina = readFileSync('src/components/App/Eventos/EventoDetalhePage.tsx', 'utf8');
  assert.match(pagina, /tabAtiva === 'checkin' && <CheckinTab/u);
  assert.match(pagina, /TABS_VALIDAS[^=]*=[^;]*'checkin'/su);
});

test('a escrita do check-in confere o retorno do UPDATE', () => {
  // 🔴 Provado contra o banco nos 3 perfis: a policy FILTRA em vez de recusar, entao um
  // UPDATE fora de escopo devolve ZERO LINHAS E NENHUM ERRO. Sem `.select()` + checagem do
  // retorno, a tela pintaria "chegou" sobre um banco intacto.
  const hook = readFileSync('src/hooks/useEventos.ts', 'utf8');
  const inicio = hook.indexOf('export async function marcarChegada');
  assert.ok(inicio > 0, 'a função tem de existir');
  // Ate o proximo `export` de nivel zero. ⚠️ Nao usar '\n}\n' como delimitador: no Windows a
  // quebra e CRLF, o indexOf devolve -1 e o teste passa a examinar UMA LETRA — foi o que
  // aconteceu na primeira versao deste arquivo, e ele reprovou o codigo certo.
  const resto = hook.slice(inicio + 10);
  const fim = resto.indexOf('\nexport ');
  const corpo = fim === -1 ? resto : resto.slice(0, fim);

  // ⚠️ Recorta o trecho do UPDATE. Procurar `.select('id')` no corpo INTEIRO nao serve: o
  // INSERT logo abaixo tem o dele, e a busca larga passava mesmo com o UPDATE cego — provado
  // por mutacao (removi o select do update e os 16 testes continuaram verdes).
  const iUpdate = corpo.indexOf('.update(');
  assert.ok(iUpdate > 0, 'o UPDATE tem de existir');
  const trechoUpdate = corpo.slice(iUpdate, corpo.indexOf('.insert('));
  assert.match(trechoUpdate, /\.select\('id'\)/u, 'o UPDATE precisa devolver as linhas afetadas');
  assert.match(corpo, /\(data \?\? \[\]\)\.length/u, 'e alguém precisa olhar quantas foram');
});
