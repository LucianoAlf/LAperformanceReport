import assert from 'node:assert/strict';
const helperUrl = new URL('../src/components/App/SucessoCliente/feedbackSession.ts', import.meta.url).href;

const {
  formatarCompetenciaFeedback,
  montarMensagemFeedbackProfessor,
  normalizarTelefoneWhatsApp,
} = await import(helperUrl);

assert.equal(formatarCompetenciaFeedback(new Date('2026-07-08T12:00:00Z')), '2026-07-01');
assert.equal(normalizarTelefoneWhatsApp('(21) 98127-8047'), '5521981278047');
assert.equal(normalizarTelefoneWhatsApp('5521981278047'), '5521981278047');

const mensagem = montarMensagemFeedbackProfessor({
  nomeProfessor: 'Luciano Alf',
  linkFeedback: 'https://example.com/feedback/token',
  lembrete: false,
});

assert.match(mensagem, /Ol[aá], Luciano!/i);
assert.match(mensagem, /https:\/\/example\.com\/feedback\/token/);
assert.match(mensagem, /7 dias/);

console.log('feedbackSession helpers ok');
