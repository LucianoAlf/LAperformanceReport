import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CABECALHO_AVISO,
  escreverSeMudou,
  formatarDetalhe,
  formatarFuncoes,
  formatarTabelas,
} from '../scripts/mapa-banco/formatar.mjs';

const dados = {
  tabelas: [
    {
      nome: 'alunos',
      tipo: 'tabela',
      dominio: 'aluno',
      colunas: 42,
      linhas: 1200,
      rls: true,
      policies: 3,
      fks: 4,
      comentario: 'Matriculas, nao pessoas',
      detalheColunas: [
        { nome: 'id', tipo: 'uuid', nulo: false, padrao: 'gen_random_uuid()', referencia: '' },
        { nome: 'unidade_id', tipo: 'uuid', nulo: false, padrao: '', referencia: 'unidades.id' },
      ],
      indicesUnicos: ['alunos_pkey'],
      triggers: ['trg_x -> fn_x'],
    },
    {
      nome: 'vw_alunos_ativos',
      tipo: 'view',
      dominio: 'aluno',
      colunas: 12,
      linhas: null,
      rls: false,
      policies: 0,
      fks: 0,
      comentario: '',
      detalheColunas: [{ nome: 'id', tipo: 'uuid', nulo: true, padrao: '', referencia: '' }],
      indicesUnicos: [],
      triggers: [],
    },
  ],
  funcoes: [
    {
      nome: 'get_y',
      args: 'p_id uuid',
      dominio: 'aluno',
      secdef: true,
      anon: true,
      estado: 'ORFA',
      motivo: '',
      consumidores: [],
    },
    {
      nome: 'get_a',
      args: '',
      dominio: 'aluno',
      secdef: false,
      anon: false,
      estado: 'ATIVA',
      motivo: '',
      consumidores: [{ fonte: 'front', origem: 'src/a.ts' }],
    },
  ],
};

test('saida e identica para a mesma entrada', () => {
  assert.equal(formatarTabelas(dados), formatarTabelas(dados));
});

test('ordena por dominio e nome, independente da ordem de entrada', () => {
  const invertido = { ...dados, tabelas: [...dados.tabelas].reverse() };
  assert.equal(formatarTabelas(invertido), formatarTabelas(dados));
});

test('view sem contagem de linhas nao imprime zero enganoso', () => {
  const saida = formatarTabelas(dados);
  const linha = saida.split('\n').find((l) => l.includes('vw_alunos_ativos'));
  assert.match(linha, /\|\s*—\s*\|/);
  assert.doesNotMatch(linha, /\|\s*0\s*\|\s*não\s*\|/);
});

test('funcao orfa e anon aparece com a marca de risco', () => {
  const saida = formatarFuncoes(dados);
  const linha = saida.split('\n').find((l) => l.includes('get_y'));
  assert.match(linha, /ORFA/);
  assert.match(linha, /🔓 anon/);
  assert.match(linha, /sem consumidor conhecido/);
});

test('detalhe traz referencia da FK e ignora tabela de outro dominio', () => {
  const saida = formatarDetalhe('aluno', dados);
  assert.match(saida, /unidades\.id/);
  assert.match(saida, /## alunos/);
  const vazio = formatarDetalhe('financeiro', dados);
  assert.doesNotMatch(vazio, /## alunos/);
});

test('escreverSeMudou nao reescreve quando o corpo e igual', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapa-'));
  const alvo = path.join(dir, 'x.gerado.md');
  escreverSeMudou(alvo, 'corpo', { ref: 'abc', data: '2026-09-02' });
  const antes = fs.statSync(alvo).mtimeMs;
  const mudou = escreverSeMudou(alvo, 'corpo', { ref: 'abc', data: '2026-09-99' });
  assert.equal(mudou, false);
  assert.equal(fs.statSync(alvo).mtimeMs, antes);
  assert.match(fs.readFileSync(alvo, 'utf8'), /2026-09-02/);
});

test('escreverSeMudou reescreve quando o corpo muda', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapa-'));
  const alvo = path.join(dir, 'x.gerado.md');
  escreverSeMudou(alvo, 'corpo A', { ref: 'abc', data: '2026-09-02' });
  const mudou = escreverSeMudou(alvo, 'corpo B', { ref: 'abc', data: '2026-09-03' });
  assert.equal(mudou, true);
  assert.match(fs.readFileSync(alvo, 'utf8'), /corpo B/);
  assert.match(fs.readFileSync(alvo, 'utf8'), /2026-09-03/);
});

test('todo arquivo gerado carrega o aviso de nao editar', () => {
  assert.match(CABECALHO_AVISO, /NÃO EDITE/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapa-'));
  const alvo = path.join(dir, 'x.gerado.md');
  escreverSeMudou(alvo, 'corpo', { ref: 'abc', data: '2026-09-02' });
  assert.match(fs.readFileSync(alvo, 'utf8'), /NÃO EDITE/);
});

test('pipe no comentario nao quebra a tabela markdown', () => {
  const comPipe = {
    ...dados,
    tabelas: [{ ...dados.tabelas[0], comentario: 'usar a | canonica' }],
  };
  const linha = formatarTabelas(comPipe).split('\n').find((l) => l.includes('alunos'));
  assert.match(linha, /usar a \\\| canonica/);
});

test('lista longa de consumidores e truncada, mantendo a contagem', () => {
  const muitos = {
    ...dados,
    funcoes: [{
      ...dados.funcoes[1],
      consumidores: Array.from({ length: 20 }, (_, i) => ({ fonte: 'funcao', origem: `fn_${i}` })),
    }],
  };
  const linha = formatarFuncoes(muitos).split('\n').find((l) => l.includes('get_a'));
  assert.match(linha, /\+14 outros/);
  assert.ok(linha.length < 400, `linha ainda longa: ${linha.length}`);
});
