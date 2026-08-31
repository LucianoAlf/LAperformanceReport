#!/usr/bin/env node
// Caso Kailane/Barra 31/08 20:18 — as duas mordidas do extrator de nome:
//
// R-m  "O aluno está errado" virou ALUNO "está errado" no card. Frase SOBRE o
//      aluno (está/estava errado/incorreto/trocado) nunca é nome — entra na
//      blacklist _NAO_NOME que o nomePlausivel já consulta.
//
// R-n  "Aluno é Luiza Rodrigues é responsável financeiro Salomé Cristina
//      Rodrigues" virou ALUNO com a frase INTEIRA. O nome termina onde começa
//      outro campo: corta em "responsável (financeiro)" — e o responsável
//      DECLARADO pelo humano é colhido e vence o do cadastro (mesma doutrina
//      de rótulo humano).
//
// UX   No fallback LLM, corrigir_aluno SEM nome (o roteador acertou isso no
//      shadow com conf .99 enquanto a gramática gravava "está errado") passa a
//      responder pedindo o nome, em vez de cair no "Não entendi".
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-frase-sobre-aluno-31ago.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── R-m: frase sobre o aluno não é nome ──────────────────────────────────────
trocar(
  `const _NAO_NOME = /^(image|document|video|audio|sticker|photo|file)([\\s_-]*received)?$|^(nao|n[aã]o)\\s|received$|^null$|^undefined$|^(aluno|cliente|pagador|comprovante|recibo)$/i;`,
  `// "está errado"/"tá incorreto" e' frase SOBRE o aluno, nunca nome (31/08: o
// card saiu com ALUNO "está errado").
const _NAO_NOME = /^(image|document|video|audio|sticker|photo|file)([\\s_-]*received)?$|^(nao|n[aã]o)\\s|received$|^null$|^undefined$|^(aluno|cliente|pagador|comprovante|recibo)$|\\b(errad[oa]|incorret[oa]|equivocad[oa]|trocad[oa])\\b|^(est[aá]|esta va|estava|t[aá])\\s/i;`,
  'R-m frase sobre aluno na blacklist');

// ── R-n: o nome termina onde comeca outro campo + responsavel ditado ─────────
trocar(
  `function _limparAlunoRotulado(nome, opts) {
  const minTokens = (opts && opts.minTokens) || 2;
  let n = String(nome || '').split(/[\\n,;|]/)[0];`,
  `function _limparAlunoRotulado(nome, opts) {
  const minTokens = (opts && opts.minTokens) || 2;
  let n = String(nome || '').split(/[\\n,;|]/)[0];
  // O nome termina onde comeca OUTRO campo: "Aluno é Luiza Rodrigues é
  // responsável financeiro Salomé..." engolia a frase inteira (31/08).
  n = n.replace(/\\s+(?:e|eh|é)?\\s*(?:o|a)?\\s*respons[aá]vel(?:\\s+financeir[oa])?\\b[\\s\\S]*$/i, ' ');`,
  'R-n nome corta em responsavel');

// ── R-n2: responsavel DECLARADO pelo humano vence o cadastro ─────────────────
trocar(
  `        const nomeTardio = _nomeHumanoTardio(txt);`,
  `        // Responsavel declarado no texto ("... é responsável financeiro Salomé
        // Cristina Rodrigues") e' rotulo humano: colhe e vence o do cadastro.
        const _respDitado = (() => {
          const m = String(txt || '').match(/respons[aá]vel(?:\\s+financeir[oa])?\\s*(?:e|eh|é|:)?\\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\\s]{4,60})/i);
          if (!m) return null;
          const r = String(m[1]).split(/[\\n,;|]/)[0].replace(/\\s+/g, ' ').trim();
          return (r && r.split(' ').length >= 2 && nomePlausivel(r)) ? r : null;
        })();
        const nomeTardio = _nomeHumanoTardio(txt);`,
  'R-n2 responsavel ditado extraido');

trocar(
  `          let responsavelFinanceiro = alvoP.responsavelFinanceiro || null;
          try {
            const rr = await responsavelFn(alvoP.unidade_id, alvoP.aluno);`,
  `          let responsavelFinanceiro = alvoP.responsavelFinanceiro || null;
          if (_respDitado) {
            log({ acao: 'responsavel_ditado_pelo_humano', chatId, responsavel: _respDitado });
            responsavelFinanceiro = _respDitado;
          }
          try {
            const rr = await responsavelFn(alvoP.unidade_id, alvoP.aluno);`,
  'R-n2 responsavel ditado aplicado');

trocar(
  `            if (rr && rr.aluno_nome && !_mesmaPessoa(rr.aluno_nome, alvoP.aluno)) {
              log({ acao: 'responsavel_rejeitado_nome_diverge', chatId, aluno: alvoP.aluno, casado: rr.aluno_nome });
            } else if (rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, alvoP.aluno)) responsavelFinanceiro = rr.responsavel_nome;`,
  `            if (rr && rr.aluno_nome && !_mesmaPessoa(rr.aluno_nome, alvoP.aluno)) {
              log({ acao: 'responsavel_rejeitado_nome_diverge', chatId, aluno: alvoP.aluno, casado: rr.aluno_nome });
            } else if (!_respDitado && rr && rr.responsavel_nome && !mesmaPessoa(rr.responsavel_nome, alvoP.aluno)) responsavelFinanceiro = rr.responsavel_nome;`,
  'R-n2 cadastro nao sobrescreve o ditado');

// ── UX do fallback: corrigir_aluno sem nome pede o nome ──────────────────────
trocar(
  `      let sintetico = null;
      if (cls.intencao === 'corrigir_aluno' && cls.aluno_nome) sintetico = 'aluno: ' + cls.aluno_nome;`,
  `      // "O aluno está errado" (31/08): o roteador acertou corrigir_aluno SEM
      // nome (conf .99) enquanto a gramatica gravava "está errado" como nome.
      // Sem nome declarado, a resposta certa e' PEDIR o nome.
      if (cls.intencao === 'corrigir_aluno' && !cls.aluno_nome) {
        await sendFn(chatId, 'Entendi que o aluno está errado — me diz o certo: *aluno: Nome Completo* (citando o card, se houver mais de um).');
        return { tratou: true, acao: 'fallback_llm_pede_nome', intencao: cls.intencao };
      }
      let sintetico = null;
      if (cls.intencao === 'corrigir_aluno' && cls.aluno_nome) sintetico = 'aluno: ' + cls.aluno_nome;`,
  'UX fallback pede o nome');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
