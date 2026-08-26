#!/usr/bin/env node
// (1) "puxa/manda o fechamento" passa a valer como pedido. (2) Lojinha não tem aluno.
//
// CASO (Vitória/Recreio, 25/08): o fechamento automático das 20:50 foi montado ANTES do
// lançamento da lojinha (R$ 142,00 entrou 20:50:16), então saiu sem ele. Ela pediu duas
// vezes para refazer e a Sol ficou MUDA:
//     20:51  "Sol, puxa o fechamento de caixa novamente"
//     20:54  "Sol, manda o fechamento do caixa por favor"
//     20:57  "Sol tá achando que o expediente acabou 😂"
// Resultado: o caixa do Recreio ficou ABERTO.
//
// POR QUÊ: `pedidoDiretoFechar` só reconhece o VERBO "fechar/fecha/feche o caixa". Ela usou
// o SUBSTANTIVO ("o fechamento") com outro verbo. A colisão de horário é normal e vai
// acontecer de novo — o que não pode é não haver como pedir de novo.
//
// (2) O card da mesma venda trouxe "*ALUNO* · Venda bolsa de violino é pacote de Clips ·
// ⚠️ Não tenho certeza de qual aluno é". Lojinha é venda de produto: quando o nome extraído
// é a própria descrição do item, não há aluno a mostrar.
const fs = require('fs');

const modo = process.argv[2];
if (!modo) { console.error('uso: node _patch-pedido-fechamento-e-lojinha.cjs <abf|financeiro> <arquivo>'); process.exit(2); }
const alvo = process.argv[3];
let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

if (modo === 'abf') {
  trocar(
    `  return /\\b(?:sol[,!\\s]*)?(?:pode\\s+)?fechar\\s+o\\s+caixa\\b/i.test(t)
    || /\\b(?:fecha|feche)\\s+o\\s+caixa\\b/i.test(t)
    || /\\b(?:sol[,!\\s]*)?(?:vamos|vamo|bora)\\s+fechar\\s+o\\s+caixa\\b/i.test(t);`,
    `  if (/\\b(?:sol[,!\\s]*)?(?:pode\\s+)?fechar\\s+o\\s+caixa\\b/i.test(t)) return true;
  if (/\\b(?:fecha|feche)\\s+o\\s+caixa\\b/i.test(t)) return true;
  if (/\\b(?:sol[,!\\s]*)?(?:vamos|vamo|bora)\\s+fechar\\s+o\\s+caixa\\b/i.test(t)) return true;
  // ⚠️ O SUBSTANTIVO tambem e pedido. A colisao de horario entre o fechamento automatico
  // e um lancamento de ultima hora e normal e vai repetir — o que nao pode e nao haver
  // como pedir de novo. Em 25/08 a Vitoria escreveu "puxa o fechamento de caixa novamente"
  // e "manda o fechamento do caixa por favor"; as duas caiam fora e o caixa do Recreio
  // ficou aberto.
  if (/\\b(?:puxa|puxar|manda|mandar|envia|enviar|gera|gerar|refaz|refazer|roda|rodar|atualiza|atualizar|mostra|mostrar|repete|repetir|reenvia|reenviar)\\b[^.!?]{0,24}\\bfechamento\\b/i.test(t)) return true;
  if (/\\bfechamento\\s+(?:de|do)\\s+caixa\\b[^.!?]{0,24}\\b(?:novamente|de novo|outra vez|again)\\b/i.test(t)) return true;
  return false;`,
    'aceita "puxa/manda o fechamento"');
}

if (modo === 'financeiro') {
  trocar(
    `  // Pedir aluno numa saida operacional e o que induziu a Mayra a "corrigir" o nome —
  // e a correcao virou nome de aluno. Saida nao tem aluno: a secao nao entra.
  if (!ehSaidaPreview) blocos.push(bAluno);`,
    `  // Pedir aluno numa saida operacional e o que induziu a Mayra a "corrigir" o nome —
  // e a correcao virou nome de aluno. Saida nao tem aluno: a secao nao entra.
  // ⚠️ Lojinha idem QUANDO o "aluno" extraido e a propria descricao do produto: em 25/08
  // o card da Vitoria trouxe "*ALUNO* Venda bolsa de violino e pacote de Clips" com
  // "nao tenho certeza de qual aluno e" — a legenda descrevia a MERCADORIA. Lojinha com
  // comprador identificado de verdade continua mostrando.
  const _lojinhaSemComprador = String(categoria || '').toLowerCase() === 'lojinha'
    && (!aluno || (itemLojinha && String(aluno).toLowerCase().includes(String(itemLojinha).toLowerCase().slice(0, 10)))
        || /\\b(venda|pacote|caixa|unidade|kit|par|jogo)\\b/i.test(String(aluno || '')));
  if (!ehSaidaPreview && !_lojinhaSemComprador) blocos.push(bAluno);`,
    'lojinha sem comprador nao mostra ALUNO');
}

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado (${modo}): ${antes} -> ${src.length} bytes (+${src.length - antes})`);
