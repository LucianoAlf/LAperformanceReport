#!/usr/bin/env node
// Com lançamento de caixa em aberto, a conversa NÃO cai no LLM.
//
// CASO (Jhon/CG, 25/08): o card do passaporte estava aberto. O Jhon respondeu "Sol, o
// aluno é o Rafael Magalhães Barbosa". O handler devolveu `acao: 'nada'`, e a linha
//   `_tratouCaixa = !(_r && (_r.acao === 'nada' || ...))`
// deixou a mensagem seguir para o engajamento. O agente (gpt-5.6-luna) respondeu de
// improviso e **inventou "R$ 53,00"** — o Rafael não tem uma única fatura no sistema.
//
// O comentário ao lado daquela linha já dizia a intenção certa: "dinheiro e deterministico:
// nunca vai pro LLM". Só que ele valia apenas quando o handler RECONHECIA o assunto. Com
// preview aberto, qualquer frase não reconhecida virava conversa livre sobre dinheiro.
//
// A trava: havendo pendência no grupo, `nada` vira uma resposta honesta de não-entendi,
// e a mensagem não segue. Sem pendência, nada muda — o grupo continua conversando com a
// Sol normalmente.
const fs = require('fs');

const alvo = process.argv[2] || '/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/bridge.js';
let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

const de = `              // S2: se nao era assunto de caixa, a mensagem segue pro engajamento (LLM).
              _tratouCaixa = !(_r && (_r.acao === 'nada' || _r.acao === 'ignorado_fora_grupo'));`;

const para = `              // S2: se nao era assunto de caixa, a mensagem segue pro engajamento (LLM).
              _tratouCaixa = !(_r && (_r.acao === 'nada' || _r.acao === 'ignorado_fora_grupo'));
              // ⚠️ ...EXCETO com lancamento em aberto. Em 25/08 o Jhon corrigiu o aluno de
              // um preview vivo, o handler devolveu 'nada' e o LLM respondeu inventando
              // "R$ 53,00" para um aluno que nao tem fatura nenhuma. Com dinheiro na mesa,
              // "nao entendi" e' resposta melhor que improviso.
              if (!_tratouCaixa && _r && _r.acao === 'nada'
                  && _fh.temPendencia && _fh.temPendencia(chatId)) {
                try {
                  const _s = await sendWithTimeout(chatId, { text:
                    'Não entendi essa 🤔 — e tem lançamento em aberto aqui, então não vou chutar.\\n\\n'
                    + 'Responde *pode* para lançar como está, *não* para descartar, '
                    + 'ou cita o card e escreve *aluno: Nome Completo* para eu corrigir.' });
                  const _sid = _s && _s.key && _s.key.id; if (_sid) recentlySentIds.add(_sid);
                } catch (e) { _caixaLog({ step: 'guarda_pendencia_erro', msg: e.message }); }
                _caixaLog({ step: 'guarda_pendencia_nao_vaza_llm', chatId: chatId });
                _tratouCaixa = true;
              }`;

const n = src.split(de).length - 1;
if (n !== 1) { console.error(`ancora do S2: esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
if (src.includes('guarda_pendencia_nao_vaza_llm')) { console.log('ja aplicado'); process.exit(0); }

src = src.split(de).join(para);
fs.writeFileSync(alvo, src, 'utf8');
console.log(`  ok  trava aplicada: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
