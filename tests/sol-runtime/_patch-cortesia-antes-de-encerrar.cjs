#!/usr/bin/env node
// Agradecimento ganha resposta curta ANTES de a Sol encerrar o turno.
//
// CASO (Vitória/Recreio, 25/08 21:04): depois do fechamento sair certo, ela escreveu
// "Obrigada sol 😊" e a Sol simplesmente **não respondeu**.
//
// NÃO É BUG NOVO nem da guarda de pendência (que disparou 0 vezes). É a regra
// `encerraTurnoDaSol` do gate de conversa: "obrigada" está na lista de sinais de FIM DE
// TURNO, e o teste vem ANTES de `mencionaSol` — então nem ser chamada pelo nome salva.
//
// A intenção da regra é certa: evitar que a Sol fique tagarelando depois que o assunto
// acabou, e cada mensagem que passa custa uma chamada de LLM. O problema é o silêncio
// total: quem agradece e leva vácuo conclui que o sistema travou. Foi a leitura literal
// da Vitória minutos antes — "Sol tá achando que o expediente acabou 😂".
//
// A correção NÃO remove a regra. O turno continua encerrando; só que agradecimento
// dirigido à Sol ganha um "de nada" curto e DETERMINÍSTICO (sem LLM, custo zero) antes
// do silêncio. Despedida/dispensa ("tchau", "resolvido", "não precisa") seguem calando,
// porque ali o silêncio é a resposta adequada.
const fs = require('fs');

const modo = process.argv[2];
const alvo = process.argv[3];
if (!modo || !alvo) { console.error('uso: node _patch-cortesia-antes-de-encerrar.cjs <policy|bridge> <arquivo>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

if (modo === 'policy') {
  trocar(
    `function falaDirecionadaAHumano(texto, mentionedIds, identidadesProprias) {`,
    `// Agradecimento e' um subconjunto de encerraTurnoDaSol: encerra o turno IGUAL, mas
// merece um "de nada" antes do silencio. "tchau"/"resolvido"/"nao precisa" nao entram —
// ali calar e' a resposta certa.
function ehAgradecimento(texto = '') {
  const n = normalizarTexto(texto);
  return /(^|[^a-z])(obrigad[ao]|obg|brigad[ao]|valeu|vlw|agradec)/.test(n);
}

function falaDirecionadaAHumano(texto, mentionedIds, identidadesProprias) {`,
    'funcao ehAgradecimento');

  trocar(
    `    if (encerraTurnoDaSol(texto)) { fecharJanela(chatId); return { responder: false, motivo: 'turno_encerrado' }; }`,
    `    if (encerraTurnoDaSol(texto)) {
      fecharJanela(chatId);
      // ⚠️ 'cortesia' NAO reabre a janela e NAO chama o LLM: e uma linha curta e fixa,
      // enviada pela bridge. Quem agradece e leva vacuo acha que o sistema travou
      // (Vitoria/Recreio 25/08). So vale quando o agradecimento e dirigido a Sol —
      // "obrigada Ana" no meio do grupo continua sem resposta.
      const _cortesia = ehAgradecimento(texto)
        && mencionaSol(texto, mentionedIds, identidadesProprias);
      return { responder: false, motivo: 'turno_encerrado', cortesia: _cortesia };
    }`,
    'turno_encerrado devolve flag de cortesia');

  trocar(
    `module.exports = { createGroupEngagementPolicy };`,
    `module.exports = { createGroupEngagementPolicy, ehAgradecimento, encerraTurnoDaSol, pareceChamarSol };`,
    'exporta helpers para teste');
}

if (modo === 'bridge') {
  trocar(
    `        if (!decisao.responder) continue;`,
    `        if (!decisao.responder) {
          // Agradecimento dirigido a Sol: uma linha e fim. Sem LLM, sem reabrir janela.
          if (decisao.cortesia) {
            try {
              const _c = await sendWithTimeout(chatId, { text: 'De nada! 🌻' });
              const _cid = _c && _c.key && _c.key.id; if (_cid) recentlySentIds.add(_cid);
            } catch (e) { /* cortesia nunca derruba o fluxo */ }
          }
          continue;
        }`,
    'bridge responde a cortesia');
}

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado (${modo}): ${antes} -> ${src.length} bytes (+${src.length - antes})`);
