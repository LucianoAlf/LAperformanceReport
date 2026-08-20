import assert from 'node:assert/strict';
import test from 'node:test';

import { formatarPreviaConversa } from '../src/lib/previaConversa.mjs';

const BASE = {
  previa_texto: 'Oi, tudo bem?',
  previa_tipo: 'text',
  previa_direcao: 'inbound',
  previa_agente_id: null,
  previa_campanha_id: null,
};

test('prefixo diz QUEM falou por último', async (t) => {
  await t.test('contato: sem prefixo', () => {
    assert.deepEqual(formatarPreviaConversa(BASE), { prefixo: null, texto: 'Oi, tudo bem?' });
  });

  await t.test('agente IA: "Mila:"', () => {
    const r = formatarPreviaConversa({ ...BASE, previa_direcao: 'outbound', previa_agente_id: 'f4238ffa' });
    assert.equal(r.prefixo, 'Mila:');
  });

  await t.test('disparo de template: "📣 Campanha:"', () => {
    const r = formatarPreviaConversa({ ...BASE, previa_direcao: 'outbound', previa_campanha_id: '858c1d1a' });
    assert.equal(r.prefixo, '📣 Campanha:');
  });

  await t.test('equipe pelo painel: "Você:"', () => {
    const r = formatarPreviaConversa({ ...BASE, previa_direcao: 'outbound' });
    assert.equal(r.prefixo, 'Você:');
  });

  await t.test('agente vence campanha quando os dois vêm preenchidos', () => {
    // A resposta do bot dentro de uma campanha é do bot — dizer "Campanha"
    // esconderia justamente o que interessa (o bot já respondeu?).
    const r = formatarPreviaConversa({
      ...BASE, previa_direcao: 'outbound',
      previa_agente_id: 'f4238ffa', previa_campanha_id: '858c1d1a',
    });
    assert.equal(r.prefixo, 'Mila:');
  });

  await t.test('inbound nunca ganha prefixo, mesmo com campanha_id', () => {
    const r = formatarPreviaConversa({ ...BASE, previa_campanha_id: '858c1d1a' });
    assert.equal(r.prefixo, null);
  });
});

test('texto cabe em uma linha', async (t) => {
  await t.test('quebras de linha viram espaço', () => {
    // O template do Feirão começa com título e DUAS quebras: sem isso a prévia
    // apareceria como uma linha em branco.
    const r = formatarPreviaConversa({
      ...BASE,
      previa_texto: '*🎸 FEIRÃO DE MATRÍCULAS L.A MUSIC 2026*\n\n*O momento de começar é agora.*',
    });
    assert.equal(r.texto, '*🎸 FEIRÃO DE MATRÍCULAS L.A MUSIC 2026* *O momento de começar é agora.*');
  });

  await t.test('espaços repetidos colapsam', () => {
    assert.equal(formatarPreviaConversa({ ...BASE, previa_texto: 'oi   \n\n  tudo   bem' }).texto, 'oi tudo bem');
  });
});

test('mídia mostra o tipo em vez de vazio', async (t) => {
  const casos = [
    ['image', '📷 Foto'],
    ['audio', '🎤 Áudio'],
    ['video', '🎬 Vídeo'],
    ['document', '📎 Documento'],
    ['sticker', '🏷️ Figurinha'],
  ];
  for (const [tipo, esperado] of casos) {
    await t.test(`${tipo} sem legenda`, () => {
      assert.equal(formatarPreviaConversa({ ...BASE, previa_tipo: tipo, previa_texto: null }).texto, esperado);
    });
  }

  await t.test('mídia COM legenda mostra as duas coisas', () => {
    const r = formatarPreviaConversa({ ...BASE, previa_tipo: 'image', previa_texto: 'olha o violão' });
    assert.equal(r.texto, '📷 olha o violão');
  });

  await t.test('tipo desconhecido não vira texto vazio', () => {
    assert.equal(formatarPreviaConversa({ ...BASE, previa_tipo: 'location', previa_texto: null }).texto, '📎 Anexo');
  });

  await t.test('reação mostra o emoji', () => {
    const r = formatarPreviaConversa({ ...BASE, previa_tipo: 'reaction', previa_texto: '❤️' });
    assert.equal(r.texto, 'Reagiu ❤️');
  });
});

test('conversa sem mensagem não quebra a lista', async (t) => {
  await t.test('prévia nula devolve texto vazio', () => {
    // Existe conversa criada pelo disparo cuja mensagem ainda não gravou.
    assert.deepEqual(formatarPreviaConversa(null), { prefixo: null, texto: '' });
    assert.deepEqual(
      formatarPreviaConversa({ ...BASE, previa_texto: null, previa_tipo: null }),
      { prefixo: null, texto: '' },
    );
  });

  await t.test('texto só com espaços conta como vazio', () => {
    assert.equal(formatarPreviaConversa({ ...BASE, previa_texto: '   \n  ' }).texto, '');
  });
});
