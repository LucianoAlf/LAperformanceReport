import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  JANELA_DEBOUNCE_REDIRECIONAMENTO_MS,
  instrucaoModoPassivo,
  marcarRedirecionamento,
  montarMensagemRedirecionamento,
  podeEnviarRedirecionamento,
} from '../supabase/functions/_shared/redirecionamento-atendimento.ts';

const CANAIS = [
  'Olá! 👋',
  '',
  'Este canal é usado para *avisos e campanhas* — o atendimento é feito pela secretaria da sua unidade:',
  '',
  '📍 *Campo Grande*',
  'Fixo: (21) 2412-0461',
].join('\n');

test('montagem da mensagem de redirecionamento', async (t) => {
  await t.test('junta intro, canais e fecho em UMA mensagem, nesta ordem', () => {
    const msg = montarMensagemRedirecionamento({
      intro: 'Ah, entendi! Aqui eu só falo do Feirão 😊',
      canais: CANAIS,
      fecho: 'Se quiser saber do Feirão depois, é só me chamar por aqui!',
    });
    assert.equal(
      msg,
      'Ah, entendi! Aqui eu só falo do Feirão 😊\n\n' + CANAIS +
      '\n\nSe quiser saber do Feirão depois, é só me chamar por aqui!',
    );
  });

  await t.test('sem canais configurados nao ha o que enviar', () => {
    // Sem o texto da caixa a tool nao pode inventar telefone: devolve null e
    // quem chama repassa a decisao ao modelo em vez de mandar mensagem torta.
    assert.equal(montarMensagemRedirecionamento({ intro: 'oi', canais: '', fecho: 'tchau' }), null);
    assert.equal(montarMensagemRedirecionamento({ intro: 'oi', canais: null, fecho: null }), null);
    assert.equal(montarMensagemRedirecionamento({ canais: '   \n  ' }), null);
  });

  await t.test('intro e fecho sao opcionais — os canais bastam', () => {
    assert.equal(montarMensagemRedirecionamento({ canais: CANAIS }), CANAIS);
    assert.equal(
      montarMensagemRedirecionamento({ intro: '  ', canais: CANAIS, fecho: '  ' }),
      CANAIS,
    );
  });

  await t.test('os telefones do campo saem intactos, sem reescrita', () => {
    const msg = montarMensagemRedirecionamento({ intro: 'oi', canais: CANAIS, fecho: 'tchau' });
    assert.ok(msg.includes('Fixo: (21) 2412-0461'));
    assert.ok(msg.includes('📍 *Campo Grande*'));
  });
});

test('debounce do redirecionamento', async (t) => {
  const agora = '2026-08-20T15:00:00.000Z';

  await t.test('primeira vez sempre envia', () => {
    assert.equal(podeEnviarRedirecionamento({ ultimoEnvioIso: null, agoraIso: agora }), true);
  });

  await t.test('nao repete o bloco de telefones dentro da janela', () => {
    // A pessoa insistindo nao pode receber a lista de telefones a cada mensagem.
    assert.equal(
      podeEnviarRedirecionamento({ ultimoEnvioIso: '2026-08-20T14:58:00.000Z', agoraIso: agora }),
      false,
    );
  });

  await t.test('passada a janela, envia de novo', () => {
    assert.equal(
      podeEnviarRedirecionamento({ ultimoEnvioIso: '2026-08-20T14:30:00.000Z', agoraIso: agora }),
      true,
    );
  });

  await t.test('data ilegivel nao trava o envio', () => {
    assert.equal(podeEnviarRedirecionamento({ ultimoEnvioIso: 'sei la', agoraIso: agora }), true);
  });

  await t.test('a janela e de 10 minutos', () => {
    assert.equal(JANELA_DEBOUNCE_REDIRECIONAMENTO_MS, 10 * 60 * 1000);
  });
});

test('modo passivo depois do redirecionamento', async (t) => {
  await t.test('sem marca, nenhuma instrucao extra entra no prompt', () => {
    assert.equal(instrucaoModoPassivo({}), null);
    assert.equal(instrucaoModoPassivo(null), null);
    assert.equal(instrucaoModoPassivo({ lead_name: 'Luciene' }), null);
  });

  await t.test('com marca, o prompt proibe a INICIATIVA de reofertar', () => {
    const instrucao = instrucaoModoPassivo({ redirecionado_em: '2026-08-20T15:00:00.000Z' });
    assert.ok(instrucao);
    assert.match(instrucao, /NÃO/);
    assert.match(instrucao, /bot(ões|ao)|botões/i);
  });

  await t.test('com marca, responder continua permitido se a PESSOA puxar o assunto', () => {
    // A regra e sobre iniciativa, nao sobre silencio: quem pedir informacao
    // da campanha continua sendo atendido.
    const instrucao = instrucaoModoPassivo({ redirecionado_em: '2026-08-20T15:00:00.000Z' });
    assert.match(instrucao, /se (ela|a pessoa)/i);
  });

  await t.test('marcar preserva o resto do session_data', () => {
    const antes = { lead_name: 'Luciene', unidade_preferida: 'Campo Grande' };
    const depois = marcarRedirecionamento(antes, '2026-08-20T15:00:00.000Z');
    assert.equal(depois.lead_name, 'Luciene');
    assert.equal(depois.unidade_preferida, 'Campo Grande');
    assert.equal(depois.redirecionado_em, '2026-08-20T15:00:00.000Z');
    assert.deepEqual(antes, { lead_name: 'Luciene', unidade_preferida: 'Campo Grande' }, 'nao muta o original');
  });
});

// ─── Contrato com a edge function ────────────────────────────────────────────

const toolTypes = readFileSync(
  join(process.cwd(), 'supabase', 'functions', '_shared', 'tool-types.ts'), 'utf8');
const webhook = readFileSync(
  join(process.cwd(), 'supabase', 'functions', 'agente-webhook', 'index.ts'), 'utf8');

test('a tool esta ligada ao agente-webhook', async (t) => {
  await t.test('redirecionar_atendimento e uma builtin', () => {
    assert.match(toolTypes, /name: 'redirecionar_atendimento'/);
  });

  await t.test('a descricao exclui quem quer matricular', () => {
    // Sem isso a correcao passa a jogar fora lead bom (aluno querendo 2o curso).
    const bloco = toolTypes.slice(toolTypes.indexOf("name: 'redirecionar_atendimento'"));
    const descricao = bloco.slice(0, bloco.indexOf('parameters'));
    assert.match(descricao, /matricul/i);
  });

  await t.test('executarTool roteia a tool', () => {
    assert.match(webhook, /tc\.name === 'redirecionar_atendimento'/);
  });

  await t.test('e terminal APENAS quando a mensagem saiu', () => {
    // Terminal em debounce quebraria o loop sem nada a enviar e o contato
    // receberia o fallback "nao consegui processar sua mensagem".
    assert.doesNotMatch(
      webhook,
      /TOOLS_TERMINAIS = \[[^\]]*redirecionar_atendimento/,
      'nao pode ser terminal incondicional na lista estatica',
    );
    assert.match(webhook, /redirecionamentoEnviado/);
  });

  await t.test('a marca de modo passivo entra no system prompt', () => {
    assert.match(webhook, /instrucaoModoPassivo/);
  });
});
