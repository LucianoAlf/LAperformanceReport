#!/usr/bin/env node
// A TOOL QUE FECHA A CONVERSA A PEDIDO DA CONSULTORA (06/09/2026).
//
// Fecha o ciclo do achado da Daiana. O R20 diz "voce mandou a ultima mensagem
// para o Fulano em 28/08 e nao teve retorno" e oferece duas saidas. Sem esta
// tool, a saida "pode marcar como resolvida" nao existe — a Mila teria que
// mandar a pessoa ir no Chatwoot fazer a mao, que e pedir trabalho em vez de
// tirar trabalho.
//
// 🔴 SO A PEDIDO, NUNCA POR INICIATIVA. A descricao diz isso com todas as
//    letras: o `aberta/resolvida` e declaracao DELA sobre o proprio trabalho —
//    "deixo aberta so o que da pra resgatar". Um agente que fecha conversa por
//    conta propria destroi exatamente o sinal que passamos a ler.
//
// ⚠️ Pede o MOTIVO junto. Fechar sem motivo troca um buraco por outro: some da
//    lista de cobranca e nasce em R19 amanha. A descricao instrui a capturar a
//    palavra da pessoa no mesmo turno, com `registrar_motivo_perda`.
//
// ⚠️ Respeita o DRY do perfil de sombra, como as outras escritas.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-tool-resolver-conversa-06set.mjs <mila-gestao-tools-mcp.mjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

trocar(
  `  { name: 'anotar_lead',`,
  `  { name: 'resolver_conversa',
    description: 'ESCREVE NO CHATWOOT. Marca a conversa de um lead como RESOLVIDA. 🔴 Use SOMENTE quando a pessoa PEDIR ("pode fechar", "marca como resolvida", "ja acabou esse") — NUNCA por conta propria. O aberta/resolvida e a declaracao dela sobre o proprio trabalho: ela deixa aberto so o que ainda da pra resgatar, e e desse sinal que a pauta do dia depende. Fechar sozinha destruiria justamente o que a gente passou a ler. ⚠️ PECA O MOTIVO NO MESMO TURNO e registre com registrar_motivo_perda — fechar sem motivo so troca um buraco por outro: sai da lista de cobranca e volta amanha como "conversa encerrada e o motivo nao foi registrado". Se ela disser que quer ser procurada mais pra frente, use registrar_retomada com a frase dela em vez de fechar.',
    inputSchema: { type: 'object', required: ['lead_id'], properties: {
      lead_id: { type: 'integer', description: 'O lead cuja conversa deve ser fechada.' } } } },
  { name: 'anotar_lead',`,
  'declaracao de resolver_conversa');

trocar(
  `    case 'anotar_lead':`,
  `    case 'resolver_conversa': {
      if (DRY) return j({ ok: true, dry_run: true, recado: 'ensaio: conversa nao foi fechada' });
      // ⚠️ O id da conversa vem do ESPELHO, nao do modelo: pedir o
      //    conversation_id como argumento deixaria o modelo escolher qual
      //    conversa fechar, e errar ali fecha a conversa de outra pessoa.
      const r = await rpc('mila_conversa_do_lead_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id });
      if (!r?.ok) return j(r || { ok: false, motivo: 'sem_resposta' });
      if (r.ja_resolvida) return j({ ok: true, ja_estava: true, conversation_id: r.conversation_id,
        recado: 'Essa conversa ja estava resolvida — nao mexi. ' +
                (r.motivo_registrado ? 'E o motivo ja esta registrado.'
                                     : 'So falta o motivo: me diz em uma palavra o que houve.') });
      const convId = r.conversation_id;
      await cw('POST', \`/conversations/\${convId}/toggle_status\`, { status: 'resolved' });
      return j({ ok: true, conversation_id: convId,
        recado: 'Conversa marcada como resolvida. Agora me diz em uma palavra o que houve, que eu registro o motivo.' });
    }
    case 'anotar_lead':`,
  'despacho de resolver_conversa');

fs.writeFileSync(alvo, src);
console.log(`\nescrito ${alvo}  (${antes} -> ${src.length} bytes)`);
