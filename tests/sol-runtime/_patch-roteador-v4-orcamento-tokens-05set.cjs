#!/usr/bin/env node
// 🔴 CORRECAO DE MEDICAO E DE RUNTIME: `max_tokens: 300` estava MATANDO os
// modelos de raciocinio, e eu tinha atribuido o sintoma ao provedor.
//
// Os modelos do OpenCode Zen emitem `reasoning_content` ANTES do `content`, e
// esse raciocinio consome o mesmo orcamento de `max_tokens`. Medido em 05/09
// com o caso multi-aluno do Recreio:
//
//   modelo                    max_tokens=300            max_tokens=2000
//   glm-5.3-flash             fim=length, VAZIO         4,8s, resposta certa
//   deepseek-v4-pro           fim=length, VAZIO         8,7s, resposta certa
//   ling-3.0-flash-fin-free   fim=length, VAZIO         1,7s, resposta certa
//
// Ou seja: eu tinha reprovado tres modelos por um orcamento que era meu, nao
// deles — e o "glm nao devolve JSON" da auditoria media o teto de tokens, nao o
// modelo. Sobe para 2000.
//
// E `response_format: json_object` SAI: ele nao acelera de forma confiavel, e
// nos modelos que raciocinam produz conteudo VAZIO. O prompt ja manda "SOMENTE
// JSON" e o `_parseVisionJson` sabe achar o ultimo bloco `{...}` mesmo com
// prosa em volta — que e' exatamente o caso destes modelos.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-roteador-v4-orcamento-tokens-05set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error('ANCORA "' + rotulo + '": esperava ' + esperado + ', achei ' + n); process.exit(1); }
  src = src.split(de).join(para);
  console.log('  ok  ' + rotulo);
}

trocar(
  String.raw`    const body = JSON.stringify({
      model: _v4Modelo(), max_tokens: 300, temperature: 0,
      // Medido em 05/09: com response_format o deepseek cai de 3-6 s para ~1,2 s
      // e para de embrulhar o JSON em prosa. ⚠️ Nem todo modelo respeita — o
      // glm-5.3-flash devolve conteudo VAZIO com esta opcao, entao trocar de
      // modelo exige remedir, nao so trocar a env.
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });`,
  String.raw`    const body = JSON.stringify({
      model: _v4Modelo(),
      // 🔴 2000, nao 300. Estes modelos emitem `+"`"+`reasoning_content`+"`"+` antes da resposta e
      // ele gasta o MESMO orcamento: com 300 o glm-5.3-flash, o deepseek-v4-pro e
      // o ling-3.0-flash terminavam com finish_reason=length e `+"`"+`content`+"`"+` VAZIO —
      // reprovados por um teto que era nosso, nao deles. O deepseek-v4-flash
      // sozinho gasta 1.800-2.100 tokens de raciocinio neste prompt.
      max_tokens: 2000, temperature: 0,
      // ⚠️ `+"`"+`response_format: json_object`+"`"+` foi RETIRADO: nao acelera de forma
      // confiavel e, nos modelos que raciocinam, produz conteudo vazio. O prompt
      // ja pede "SOMENTE JSON" e o _parseVisionJson acha o ultimo bloco {...}
      // mesmo com prosa em volta.
      messages: [{ role: 'user', content: prompt }],
    });`,
  'orcamento de tokens 300 -> 2000 e response_format fora');

fs.writeFileSync(alvo, src);
console.log('\nescrito ' + alvo + '  (' + antes + ' -> ' + src.length + ' bytes)');
