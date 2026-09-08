#!/usr/bin/env node
// A SOL PARA DE DIZER "NADA FOI GRAVADO" QUANDO FOI (08/09/2026).
//
// 🔴 O CASO REAL, Recreio, hoje:
//
//    11:24  ✅ "Lancei no caixa da Recreio: Parcela — R$ 436,00 (pix) · Heitor"
//    11:26     ela mesma avisa no card: "Já tem uma entrada de R$ 436,00 no
//              caixa de hoje (11:24)"
//    11:27     Fernanda: "Sol, desconsiderar esse valor, irei enviar novamente"
//    11:27  👍 "Descartei o lançamento de R$ 436,00. NADA FOI GRAVADO NO CAIXA."
//              ← FALSO. A entrada das 11:24 estava lá.
//    11:30     Fernanda, tendo ido conferir: "O comprovante que enviei primeiro
//              está constando no caixa. Posso pedir para ela excluir ou devo
//              excluí-lo manualmente?"  → só então o estorno saiu.
//
//    O dinheiro ficou certo porque a ADM desconfiou, não porque a Sol fez o que
//    disse. Isso é pior que erro de cálculo: mina a única coisa que faz a equipe
//    aceitar um agente no meio do caixa, que é a palavra dele.
//
// 🔴 O ERRO EXATO: havia DUAS coisas em jogo — o lançamento já gravado (11:24) e
//    um preview pendente (11:26). Descartar o preview estava certo. O que não
//    pode é afirmar sobre o CAIXA algo que ela só sabia sobre o PREVIEW.
//    Agravante: ela tinha o fato na tela três mensagens antes.
//
// ⚠️ ELA NÃO ESTORNA SOZINHA (decisão do Luciano, e é a certa): apagar dinheiro
//    por conta própria é o que um agente não pode fazer. Ela conta o que existe
//    e PEDE — "se quiser que eu tire, me responde estorna".
//
// ⚠️ Reusa `duplicataFn` (`sol_caixa_ja_lancado_hoje`), a MESMA função que já
//    detectou essa entrada no card das 11:26. Duas partes do runtime
//    perguntando "já existe?" de jeitos diferentes um dia discordam — foi assim
//    que nasceram as duplicatas de renovação.
//
// ⚠️ Forma do retorno conferida NA FONTE antes de escrever:
//    { ok, ja_lancado, itens: [ { hora, forma, valor, descricao } ] }.
//    A 1ª versão deste patch lia `jaNoCaixa.hora`, que não existe, e teria
//    mandado "undefined" para o grupo.
//
// ⚠️ Falha da consulta NÃO vira "nada foi gravado". Se a checagem quebrar, ela
//    diz que descartou o preview e que não conseguiu conferir. Fail closed na
//    AFIRMAÇÃO: nunca afirmar ausência sem ter olhado — que é o defeito original.
const fs = require('fs');

const alvo = process.argv[2] ||
  '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('descarte_com_entrada_no_caixa')) { console.log('ja aplicado'); process.exit(0); }

const B = '`';   // crase montada: escrevê-la solta dentro de string atravessa mal shell/heredoc
const D = '${';

const VELHO = [
  '        if (alvoD) {',
  '          pendentes.set(chatId, arrD.filter((p) => p !== alvoD));',
  '          await sendFn(chatId, ' + B + '👍 Descartei' + D + "alvoD.valor ? ' o lançamento de ' + fmtBRL(alvoD.valor) : ''}. Nada foi gravado no caixa." + B + ');',
  "          log({ acao: 'preview_descartado', chatId, previewId: alvoD.previewId, valor: alvoD.valor });",
  "          return { acao: 'preview_descartado' };",
  '        }',
].join('\n');

const NOVO = [
  '        if (alvoD) {',
  '          pendentes.set(chatId, arrD.filter((p) => p !== alvoD));',
  '          // 🔴 ANTES DE AFIRMAR, OLHAR. "Nada foi gravado no caixa" e afirmacao',
  '          // sobre o CAIXA; descartar o preview so autoriza a falar do PREVIEW.',
  '          // Em 08/09 ela disse as duas como se fossem uma, e a entrada das 11:24',
  '          // continuou la — quem descobriu foi a Fernanda, conferindo na mao.',
  '          const grpD = grupos && grupos[chatId];',
  '          let jaNoCaixa = null;',
  '          let conferiu = false;',
  '          if (grpD && grpD.unidade_id && alvoD.valor != null) {',
  '            try {',
  '              const d = await duplicataFn(grpD.unidade_id, alvoD.valor,',
  '                                          alvoD.aluno || alvoD.aluno_nome || null);',
  '              conferiu = true;',
  '              if (d && d.ja_lancado) jaNoCaixa = d;',
  '            } catch (_) { conferiu = false; }',
  '          }',
  '          if (jaNoCaixa) {',
  '            // forma da RPC: { ok, ja_lancado, itens:[{hora,forma,valor,descricao}] }',
  '            const it = (jaNoCaixa.itens && jaNoCaixa.itens[0]) || {};',
  '            // ⚠️ Ela NAO estorna sozinha: conta o que existe e PEDE.',
  '            await sendFn(chatId,',
  '              ' + B + '👍 Descartei o preview' + D + "alvoD.valor ? ' de ' + fmtBRL(alvoD.valor) : ''}." + B + ' +',
  "              '\\n\\n' +",
  '              ' + B + '⚠️ Mas atenção: a entrada' + D + "it.valor != null ? ' de ' + fmtBRL(it.valor) : ''}" + D + "it.hora ? ' das ' + it.hora : ''} continua no caixa — essa eu ja tinha lancado." + B + ' +',
  "              '\\n' +",
  '              ' + B + D + "it.descricao ? '· ' + it.descricao + '\\n' : ''}Se quiser que eu tire, me responde *estorna*." + B + ');',
  "            log({ acao: 'descarte_com_entrada_no_caixa', chatId, previewId: alvoD.previewId,",
  '                  valor: alvoD.valor, entrada_hora: it.hora || null });',
  "            return { acao: 'descarte_com_entrada_no_caixa' };",
  '          }',
  '          // ⚠️ Sem ter conseguido conferir, NAO afirma ausencia.',
  '          await sendFn(chatId, conferiu',
  '            ? ' + B + '👍 Descartei' + D + "alvoD.valor ? ' o lançamento de ' + fmtBRL(alvoD.valor) : ''}. Nada foi gravado no caixa." + B,
  '            : ' + B + '👍 Descartei o preview' + D + "alvoD.valor ? ' de ' + fmtBRL(alvoD.valor) : ''}. Nao consegui conferir o caixa agora — se eu ja tinha lancado antes, me avisa." + B + ');',
  "          log({ acao: 'preview_descartado', chatId, previewId: alvoD.previewId,",
  '                valor: alvoD.valor, conferiu_caixa: conferiu });',
  "          return { acao: 'preview_descartado' };",
  '        }',
].join('\n');

const n = s.split(VELHO).length - 1;
if (n !== 1) { console.error(`ANCORA do descarte: esperava 1, achei ${n}`); process.exit(1); }

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, `${alvo}.bak-${carimbo}-before-descarte-sincero`);
fs.writeFileSync(alvo, s.split(VELHO).join(NOVO));
console.log('descarte passa a conferir o caixa antes de afirmar');
console.log('⚠️ REINICIE A BRIDGE — require no start');
