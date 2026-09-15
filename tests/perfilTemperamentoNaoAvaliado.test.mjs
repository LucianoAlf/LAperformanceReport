// A ficha precisa DIZER por que o perfil de temperamento está vazio.
//
// CASO (Jessica, 15/09/2026, 2ª pessoa a perguntar o mesmo): "essa questão de
// anamnese incompleta aconteceu em mais 3 casos no Recreio e todos eram bebês
// de 1 ano. É bug ou é pq eles ainda não tem idade para terem perfil de
// temperamento?". Não é bug — o formulário remove o bloco de perfil para LAMK
// com até 24 meses. A ficha é que mostrava `🧠 - / 🧠 -` e quatro barras
// zeradas, sem uma palavra, e o briefing do professor saía com `Col 0 · San 0`.
//
// Os casos abaixo são os 12 reais da base em 15/09/2026, mais os dois cenários
// que o código permite e ainda não ocorreram.
//
// Roda a função REAL (transpilada por esbuild) — não confere texto de tela.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { code } = await esbuild.transform(readFileSync('src/lib/perfilTemperamento.ts', 'utf8'), {
    loader: 'ts',
    format: 'esm',
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'perfil-')), 'perfilTemperamento.mjs');
  writeFileSync(arquivo, code);
  return import(pathToFileURL(arquivo).href);
})();

const { avaliarPerfilTemperamento, formatarIdadeMeses, idadeEmMesesCompletos, textoPerfilAusenteWhatsapp } = lib;

test('perfil respondido continua sendo perfil respondido', () => {
  const estado = avaliarPerfilTemperamento({
    temperamentoPrimario: 'colerico',
    perfilBaby: false,
    tipoFormulario: 'LAMK',
  });
  assert.equal(estado.avaliado, true);
});

test('bebê de 13 meses: motivo é a idade, com a idade da ÉPOCA da anamnese', () => {
  // Matheus de Souza d'Avila, Recreio, anamnese em 14/09/2026.
  const estado = avaliarPerfilTemperamento({
    temperamentoPrimario: null,
    perfilBaby: true,
    tipoFormulario: 'LAMK',
    dataNascimento: '2025-08-07',
    dataAnamnese: '2026-09-14T12:00:00Z',
    respostasPerfil: [],
  });
  assert.equal(estado.avaliado, false);
  assert.equal(estado.motivo, 'idade');
  assert.equal(estado.idadeMeses, 13);
  assert.equal(estado.anomalia, false);
  assert.match(estado.detalhe, /1 ano e 1 mês/);
});

test('a idade NÃO é medida contra hoje — senão o motivo apodrece sozinho', () => {
  // Mesmo bebê, avaliado com uma referência três anos depois: se o cálculo
  // usasse `now()`, a ficha passaria a dizer "4 anos" e o motivo viraria mentira.
  const comoSeFosse2029 = idadeEmMesesCompletos('2025-08-07', '2029-09-14');
  assert.equal(comoSeFosse2029, 49);
  const estado = avaliarPerfilTemperamento({
    perfilBaby: true,
    tipoFormulario: 'LAMK',
    dataNascimento: '2025-08-07',
    dataAnamnese: '2026-09-14',
  });
  assert.equal(estado.idadeMeses, 13);
});

test('24 meses exatos ainda é idade — a fronteira do formulário é inclusiva', () => {
  // Stella (CG) e Theo (Barra): 24 meses cravados. O wizard usa `m <= 24`.
  const estado = avaliarPerfilTemperamento({
    perfilBaby: true,
    tipoFormulario: 'LAMK',
    dataNascimento: '2024-08-23',
    dataAnamnese: '2026-09-02',
  });
  assert.equal(estado.idadeMeses, 24);
  assert.equal(estado.motivo, 'idade');
});

test('25 meses com marcação gravada: motivo é "não se aplica", não idade', () => {
  // Amelie Fontoura Pinheiro, CG, presencial: as 11 perguntas apareceram e a
  // entrevistadora marcou a 5ª alternativa em todas.
  const estado = avaliarPerfilTemperamento({
    perfilBaby: true,
    tipoFormulario: 'LAMK',
    dataNascimento: '2024-07-01',
    dataAnamnese: '2026-08-22',
    respostasPerfil: Array.from({ length: 11 }, () => ({ resposta_posicao: 5 })),
  });
  assert.equal(estado.idadeMeses, 25);
  assert.equal(estado.motivo, 'nao_se_aplica');
  assert.match(estado.detalhe, /não se aplica/);
});

test('25 meses pelo link online, sem rastro: a idade ainda diz que o bloco apareceu', () => {
  // Enrico Tonelli, Recreio. A RPC `salvar_anamnese_online` descarta a posição
  // 5 (`where v ~ '^[1-4]$'`), então não sobra marcação — mas acima de 24 meses
  // o formulário exibiu as 11 e só libera o envio com todas marcadas.
  const estado = avaliarPerfilTemperamento({
    perfilBaby: true,
    tipoFormulario: 'LAMK',
    dataNascimento: '2024-07-27',
    dataAnamnese: '2026-09-03',
    respostasPerfil: [],
  });
  assert.equal(estado.idadeMeses, 25);
  assert.equal(estado.motivo, 'nao_se_aplica');
  // Sem a marcação gravada, o texto não afirma que ela existiu.
  assert.doesNotMatch(estado.detalhe, /marcadas como/);
  assert.match(estado.detalhe, /não receberam resposta válida/);
});

test('adulto sem perfil NUNCA é descrito como bebê', () => {
  // Cenário que o código permite: a regra `v_n_validos < 3` não olha idade nem
  // tipo de formulário. Um EMLA com menos de 3 respostas válidas grava
  // `perfil_baby = true` para alguém de 32 anos.
  const estado = avaliarPerfilTemperamento({
    perfilBaby: true,
    tipoFormulario: 'EMLA',
    dataNascimento: '1994-03-10',
    dataAnamnese: '2026-09-15',
    respostasPerfil: [],
  });
  assert.equal(estado.motivo, 'indeterminado');
  assert.doesNotMatch(estado.detalhe, /bebê|criança|24 meses/i);
});

test('sem o flag de bebê, a ausência é anomalia — não se disfarça de idade', () => {
  // Não existe na base hoje (439 anamneses, nenhuma assim), mas o wizard deixa
  // `perfil_baby` cair no default `false` se salvar sem respostas sem ser bebê.
  const estado = avaliarPerfilTemperamento({
    perfilBaby: false,
    tipoFormulario: 'LAMK',
    dataNascimento: '2020-01-10',
    dataAnamnese: '2026-09-15',
    respostasPerfil: [],
  });
  assert.equal(estado.motivo, 'nao_preenchido');
  assert.equal(estado.anomalia, true);
});

test('sem data de nascimento, não inventa motivo', () => {
  const estado = avaliarPerfilTemperamento({
    perfilBaby: true,
    tipoFormulario: 'LAMK',
    dataNascimento: null,
    dataAnamnese: '2026-09-15',
    respostasPerfil: [],
  });
  assert.equal(estado.motivo, 'indeterminado');
  assert.equal(estado.idadeMeses, null);
});

test('idade em texto', () => {
  assert.equal(formatarIdadeMeses(0), 'menos de 1 mês');
  assert.equal(formatarIdadeMeses(1), '1 mês');
  assert.equal(formatarIdadeMeses(11), '11 meses');
  assert.equal(formatarIdadeMeses(12), '1 ano');
  assert.equal(formatarIdadeMeses(13), '1 ano e 1 mês');
  assert.equal(formatarIdadeMeses(25), '2 anos e 1 mês');
  assert.equal(formatarIdadeMeses(null), null);
});

test('briefing do professor não sai mais com zeros', () => {
  const estado = avaliarPerfilTemperamento({
    perfilBaby: true,
    tipoFormulario: 'LAMK',
    dataNascimento: '2025-08-07',
    dataAnamnese: '2026-09-14',
  });
  const texto = textoPerfilAusenteWhatsapp(estado);
  assert.match(texto, /^Não avaliado —/);
  assert.doesNotMatch(texto, /Col 0|- \+ -/);
});
