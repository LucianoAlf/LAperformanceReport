// A conversa envia para o `whatsapp_jid` dela, nao para o cadastro — e o jid e uma copia
// congelada no nascimento da conversa. Em 16/09/2026 o Bruno (2499) e a Mariana (2496)
// ficaram 2 e 5 dias sem receber nada: numero digitado errado no Emusys, corrigido depois no
// cadastro, conversa presa no antigo. O cabecalho da tela mostrava o numero CERTO o tempo
// todo, o que fez a falha parecer problema do WhatsApp deles.
//
// Este teste trava as duas decisoes que o aviso da tela usa, porque errar qualquer uma delas
// faz a tela prometer um numero e o botao migrar para outro.
//
// Roda as funcoes REAIS (bundle por esbuild) — nao confere texto de tela.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const lib = await (async () => {
  const { outputFiles } = await esbuild.build({
    entryPoints: ['src/lib/numeroDaConversa.ts'],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'numconv-')), 'numeroDaConversa.mjs');
  writeFileSync(arquivo, outputFiles[0].text);
  return import(pathToFileURL(arquivo).href);
})();

const { numeroDeEnvioDoCadastro, conversaDivergeDoCadastro } = lib;

test('numeroDeEnvioDoCadastro', async (t) => {
  await t.test('whatsapp vence telefone — a MESMA ordem da edge e da RPC', () => {
    // Inverter aqui (telefone primeiro, como o cabecalho da tela faz) faria o aviso anunciar
    // um numero e o botao migrar para outro.
    assert.equal(
      numeroDeEnvioDoCadastro({ whatsapp: '21999990001', telefone: '21999990002' }),
      '21999990001',
    );
  });

  await t.test('campo vazio nao conta como escolha', () => {
    assert.equal(numeroDeEnvioDoCadastro({ whatsapp: '', telefone: '21999990002' }), '21999990002');
    assert.equal(numeroDeEnvioDoCadastro({ whatsapp: '   ', telefone: '21999990002' }), '21999990002');
  });

  await t.test('sem telefone nenhum devolve null, nunca string vazia', () => {
    assert.equal(numeroDeEnvioDoCadastro({ whatsapp: null, telefone: null }), null);
    assert.equal(numeroDeEnvioDoCadastro(null), null);
  });
});

test('conversaDivergeDoCadastro', async (t) => {
  await t.test('o caso real: um digito de diferenca e divergencia', () => {
    // Bruno Ribeiro: conversa presa em ...99705, cadastro ja corrigido para ...99706.
    assert.equal(
      conversaDivergeDoCadastro('5521997053365@s.whatsapp.net', { whatsapp: '(21) 99706-3365' }),
      true,
    );
  });

  await t.test('mesmo numero em formatos diferentes NAO e divergencia', () => {
    // O jid vem com DDI e sufixo, o cadastro vem com mascara — sao o mesmo contato. Comparar
    // string crua acusaria a base inteira.
    assert.equal(
      conversaDivergeDoCadastro('5521987654321@s.whatsapp.net', { whatsapp: '(21) 98765-4321' }),
      false,
    );
    assert.equal(
      conversaDivergeDoCadastro('5521987654321', { telefone: '21 8765-4321' }),
      false,
      'o 9o digito do celular nao pode, sozinho, virar divergencia',
    );
  });

  await t.test('sem jid ou sem cadastro nao se conclui nada', () => {
    // Ausencia e "nao sei". Tratar como divergencia acenderia o aviso em conversa que nunca
    // teve numero congelado — e o envio nesse caso ja usa o cadastro.
    assert.equal(conversaDivergeDoCadastro(null, { whatsapp: '21999990001' }), false);
    assert.equal(conversaDivergeDoCadastro('5521999990001', { whatsapp: null, telefone: null }), false);
    assert.equal(conversaDivergeDoCadastro('5521999990001', null), false);
  });
});

// A RPC devolve CODIGO; quem le a tela precisa da frase. Sem esta guarda, um desfecho novo
// na migration nasce caindo no toast generico ("motivo desconhecido") e ninguem descobre —
// o botao continua funcionando, so para de explicar o que fez.
test('todo desfecho da RPC tem tradução na tela', async (t) => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync('supabase/migrations/20260916210000_caixa_erro_motivo_e_corrigir_numero.sql', 'utf8');
  const painel = readFileSync('src/components/App/Administrativo/CaixaEntrada/AdminChatPanel.tsx', 'utf8');

  const capturar = (chave) =>
    [...new Set([...sql.matchAll(new RegExp(String.raw`'${chave}',\s*'([a-z_]+)'`, 'g'))].map(m => m[1]))];

  await t.test('os codigos de recusa', () => {
    const erros = capturar('erro');
    assert.ok(erros.length >= 5, `a migration devia declarar 5+ recusas, achei ${erros.length}: ${erros}`);
    for (const codigo of erros) {
      assert.ok(painel.includes(`\n  ${codigo}:`), `recusa '${codigo}' sem frase em RECUSA_NUMERO`);
    }
  });

  await t.test('as acoes de sucesso', () => {
    const acoes = capturar('resultado').sort();
    assert.deepEqual(acoes, ['criou', 'migrou', 'reaproveitou']);
    for (const acao of acoes) {
      assert.ok(painel.includes(`\n  ${acao}:`), `acao '${acao}' sem frase em SUCESSO_NUMERO`);
    }
  });
});
