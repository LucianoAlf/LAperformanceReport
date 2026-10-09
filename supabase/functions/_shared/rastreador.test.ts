/// <reference lib="deno.ns" />

// Casos reais de 09/10/2026: a janela de horario casou 2 leads de ANUNCIO com cliques da bio
// (Claudia conv 21867, Maria conv 21888) e acertou o Pablo (conv 21876, texto do botao sem o codigo).

import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { codigoInvisivel, textoBateComClique, veioDeAnuncio } from './rastreador.ts';

const TEXTO_CG = 'Quero informações das aulas de música na LA Music School Campo Grande';

Deno.test('anuncio do Facebook (entry_point FB_Ads) e anuncio', () => {
  assertEquals(veioDeAnuncio({ entry_point_conversion_source: 'FB_Ads', entry_point_conversion_app: 'whatsapp' }), true);
});

Deno.test('anuncio do Instagram com ctwa_clid e sem entry_point e anuncio', () => {
  assertEquals(veioDeAnuncio({ source_type: 'ad', ctwa_clid: 'AfjRELr', conversion_source: 'FB_Ads', source_app: 'instagram' }), true);
});

Deno.test('ctwa_ad e anuncio', () => {
  assertEquals(veioDeAnuncio({ entry_point_conversion_source: 'ctwa_ad' }), true);
});

Deno.test('a CONVERSA marcada como anuncio basta, mesmo com a mensagem sem atributo', () => {
  assertEquals(veioDeAnuncio(null, { entry_point_conversion_source: 'FB_Ads' }), true);
  assertEquals(veioDeAnuncio(undefined, { ctwa_clid: 'x', source_type: 'ad' }), true);
});

Deno.test('link wa.me (click_to_chat_link) NAO e anuncio', () => {
  assertEquals(veioDeAnuncio({ entry_point_conversion_source: 'click_to_chat_link' }, { entry_point_conversion_source: 'click_to_chat_link' }), false);
});

Deno.test('sem atributo nenhum nao e anuncio', () => {
  assertEquals(veioDeAnuncio(null, null), false);
  assertEquals(veioDeAnuncio(undefined, {}), false);
});

Deno.test('texto do botao sem o codigo bate (caso Pablo)', () => {
  assertEquals(textoBateComClique(TEXTO_CG, TEXTO_CG), true);
});

Deno.test('texto do botao COM o codigo invisivel bate', () => {
  assertEquals(textoBateComClique(TEXTO_CG, TEXTO_CG + codigoInvisivel('0122331322')), true);
});

Deno.test('acento, caixa e espaco nao impedem o casamento', () => {
  assertEquals(textoBateComClique(TEXTO_CG, '  quero informacoes das aulas de musica na la music school campo grande. '), true);
});

Deno.test('mensagem pronta do anuncio NAO bate com o texto do botao (caso Claudia/Maria)', () => {
  assertEquals(textoBateComClique(TEXTO_CG, 'Olá! Posso ter mais informações sobre isso?'), false);
});

Deno.test('texto escrito a mao nao bate', () => {
  assertEquals(textoBateComClique(TEXTO_CG, 'Oi, tudo bem?'), false);
});

Deno.test('lead que acrescenta algo depois do texto do botao continua batendo', () => {
  assertEquals(textoBateComClique(TEXTO_CG, TEXTO_CG + ' para o meu filho de 7 anos'), true);
});

Deno.test('texto do clique vazio nunca bate', () => {
  assertEquals(textoBateComClique('', TEXTO_CG), false);
  assertEquals(textoBateComClique(null, TEXTO_CG), false);
});
