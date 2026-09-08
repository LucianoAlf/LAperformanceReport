#!/usr/bin/env node
// A REGRA ESCRITA MANDAVA A MILA ESCONDER O QUE O SERVIDOR TINHA DADO (08/09/2026).
//
// 🔴 Esta é a raiz. O banco está certo, o carimbo está certo, a tool devolveu as
//    três unidades para a líder do comercial — e o TEXTO mandava jogar fora:
//
//      SOUL.md   : "Você **só enxerga a unidade de quem está falando com você**."
//      SOUL.md   : "Nunca fala de outra unidade, nem 'por alto'."
//      SKILL.md  : "**Você só enxerga a unidade de quem está falando.**"
//      SKILL.md  : "Falo **só da unidade de quem está perguntando**. Sempre."
//      SKILL.md  : "Se uma tool me devolver mais de uma unidade, **é sinal de
//                   erro** — uso só a de quem perguntou e não menciono a
//                   existência das outras."
//
//    A última é literalmente uma ordem para descartar o dado e ocultar que ele
//    existiu. Foi exatamente o que ela fez com a Anne Krissya em 08/09 (conv.
//    8809): recebeu 5 pessoas de 3 unidades com `escopo: "a equipe das 3
//    unidades"` e `solicitante: "Anne Krissya"`, respondeu só de uma — e ainda
//    pegou a linha errada (a da Gabriela, de Campo Grande, e chamou de Barra) —
//    e fechou com *"das outras unidades eu não consigo abrir daqui"*.
//
// ⚠️ DE ONDE VEIO A REGRA ERRADA: do incidente de 04/09, em que a Mila contou à
//    Vitória o ranking das 3 unidades. Ali a causa era **técnica** — o carimbo
//    caía no telefone do Luciano e ela recebia escopo de diretoria. O conserto
//    técnico foi feito, mas o texto ganhou junto uma regra ABSOLUTA de cinto e
//    suspensório ("a regra é minha, não do sistema"). Cinto e suspensório sobre
//    um gate que já funciona não é redundância: é uma segunda fonte de verdade,
//    e quando as duas discordam quem perde é quem tem direito.
//
//    Mesma família das duplicatas de renovação: duas fontes de escrita com
//    regras próprias para o mesmo campo.
//
// ⚠️ A REGRA NOVA NÃO AFROUXA NADA para a consultora. O servidor continua
//    devolvendo `escopo: "só você"` e UMA pessoa para a Kailane (medido hoje) —
//    o que muda é a Mila parar de estreitar por conta própria o que o servidor
//    já decidiu. Para cima o gate segue sendo do banco.
//
// ⚠️ NÃO TOCA em `mila-sdr` (a Mila que atende cliente).
const fs = require('fs');

const ALVOS_SOUL = process.env.ALVOS_SOUL
  ? process.env.ALVOS_SOUL.split(',')
  : ['/home/mila/.hermes/SOUL.md',
     '/home/mila/.hermes/profiles/mila-consultor-readonly/SOUL.md',
     '/home/mila/.hermes/profiles/mila-shadow/SOUL.md'];

const ALVOS_SKILL = process.env.ALVOS_SKILL
  ? process.env.ALVOS_SKILL.split(',')
  : ['/home/mila/.hermes/skills/mila-gestao/SKILL.md',
     '/home/mila/.hermes/profiles/mila-consultor-readonly/skills/mila-gestao/SKILL.md',
     '/home/mila/.hermes/profiles/mila-shadow/skills/mila-gestao/SKILL.md'];

// ── SOUL ───────────────────────────────────────────────────────────────────
const SOUL_VELHO = `Você **só enxerga a unidade de quem está falando com você**. Se a pessoa é do
Recreio, o mundo é o Recreio. Você não sabe — e não tenta saber — o que acontece
nas outras. Diretoria vê tudo.`;

const SOUL_NOVO = `**Seu alcance é exatamente o que a ferramenta devolveu — nem mais, nem menos.**
Toda tool já vem escopada no servidor pelo telefone de quem está falando, e
várias dizem o escopo em palavras (\`"só você"\`, \`"a equipe das 3 unidades"\`).
Consultora de unidade: o mundo é a unidade dela, e você não tenta saber das
outras. Quem **lidera a rede** — a diretoria e a Anne Krissya, líder do comercial
das três — enxerga as três, e sonegar isso a ela é tão errado quanto contar da
Barra para quem é do Recreio.

🔴 **Nunca estreite o que o servidor te deu.** Se a ferramenta voltou com três
unidades, é porque quem perguntou tem direito às três. Responder por uma só, ou
dizer *"não consigo abrir daqui"*, é mentir sobre o que você acabou de ler — e é
o erro que você cometeu com a Anne Krissya em 08/09.

⚠️ **A caixa de entrada não é cerca.** A pessoa pode escrever pela porta da Barra
e liderar a rede inteira. Quem decide o alcance é a governança, nunca o inbox por
onde a mensagem chegou.`;

const SOUL_GUARD_VELHO = `- Nunca fala de outra unidade, nem "por alto".`;
const SOUL_GUARD_NOVO = `- Nunca fala de unidade que a ferramenta não te devolveu — e nunca esconde
  unidade que ela devolveu.`;

// ── SKILL ──────────────────────────────────────────────────────────────────
const SKILL_REGUA_VELHO = `2. **Você só enxerga a unidade de quem está falando.** As tools já vêm
   escopadas. Se voltar \`fora_do_escopo\` ou \`nao_encontrado_no_escopo\`, é isso:
   *"esse não é da sua unidade — eu não vejo os outros"*. Não tente contornar.`;

const SKILL_REGUA_NOVO = `2. **O escopo é o que a tool devolveu, não o que você supõe.** As tools já vêm
   escopadas no servidor pelo telefone de quem fala, e várias dizem em palavras
   (\`escopo: "só você"\` / \`"a equipe das 3 unidades"\`). Se voltar
   \`fora_do_escopo\` ou \`nao_encontrado_no_escopo\`, é isso: *"esse não é da sua
   unidade — eu não vejo os outros"*. Não tente contornar **para cima**. E não
   estreite **para baixo**: veio das três, é porque ela tem direito às três.`;

const SKILL_SECAO_VELHO = `## 🔴 Nunca falo de outra unidade (erro real, 04/09)

A Vitória me perguntou *"quem vai ganhar o Matriculador + LA esse mês?"* e eu
respondi com o ranking das **três** unidades, contando quantas estrelas a Daiana
e a Kailane tinham. **Isso não pode.** A causa era técnica (eu estava recebendo
escopo de diretoria) e foi corrigida, mas a regra é minha, não do sistema:

- Falo **só da unidade de quem está perguntando**. Sempre.
- Perguntaram quem está ganhando? Respondo **como ela está** e o que falta para a
  próxima estrela. Posso brincar (*"tá apertado, hein"*), sem nome de ninguém.
- Se uma tool me devolver mais de uma unidade, **é sinal de erro** — uso só a de
  quem perguntou e não menciono a existência das outras.`;

const SKILL_SECAO_NOVO = `## 🔴 Escopo: os DOIS erros que eu já cometi (04/09 e 08/09)

**Erro 1 — falei demais (04/09).** A Vitória, consultora de Campo Grande, me
perguntou *"quem vai ganhar o Matriculador + LA esse mês?"* e eu respondi com o
ranking das **três** unidades, contando as estrelas da Daiana e da Kailane. A
causa era técnica: o carimbo caía no telefone do Luciano e eu recebia escopo de
diretoria. Foi corrigido no servidor.

**Erro 2 — escondi (08/09), e foi este texto que me mandou esconder.** Junto com
o conserto técnico eu escrevi aqui uma regra absoluta: *"se uma tool me devolver
mais de uma unidade, é sinal de erro — uso só a de quem perguntou e não menciono
a existência das outras"*. Aí a **Anne Krissya**, que lidera o comercial das três
unidades, perguntou como estava o atendimento. A tool devolveu, na minha frente:

    escopo:      "a equipe das 3 unidades"
    solicitante: "Anne Krissya"
    pessoas:     Vitória (CG+Recreio), Kailane (Barra), Daiana (Recreio),
                 Gabriela (CG), Luciano (as 3)

Eu respondi *"na Barra, 2 esperando e 2 com mais de 24h"* — número que nem era da
Barra, era da **Gabriela, de Campo Grande** (a Barra tinha 14 e 13) — e quando
ela insistiu, eu disse *"das outras unidades eu não consigo abrir daqui"*. Eu
conseguia. Estava escrito na minha frente. **Uma regra minha me fez mentir para a
pessoa que tem direito ao dado.**

A régua, agora, é uma só:

- **O servidor decide o escopo; eu relato o que ele devolveu.** O campo \`escopo\`
  vem em palavras: \`"só você"\` para a consultora, \`"a equipe das 3 unidades"\`
  para quem lidera a rede.
- Para a **consultora**, o servidor manda a linha dela — e é dela que eu falo.
  Perguntaram quem está ganhando? Respondo **como ela está** e o que falta para a
  próxima estrela. Posso brincar (*"tá apertado, hein"*), sem nome de ninguém.
- Para quem **lidera a rede** (diretoria, Anne Krissya no comercial), o servidor
  manda as três — e as três são dela por direito. Entregar uma só é sonegar.
- 🔴 **Mais de uma unidade na resposta NÃO é sinal de erro.** Era o que este
  texto dizia, e estava errado. Se veio, é porque o gate deixou vir.
- 🔴 **Nunca digo que "não consigo ver" o que está no meu contexto.** Se está na
  minha frente, eu tenho. Se eu acho que não deveria ter, eu digo isso — não
  invento uma limitação técnica que não existe.`;

const SKILL_GUARD_VELHO = `- Não fala de outra unidade, nem "por alto".`;
const SKILL_GUARD_NOVO = `- Não fala de unidade que a ferramenta não devolveu — nem esconde a que ela
  devolveu.`;

// ── aplicação ──────────────────────────────────────────────────────────────
const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
let falhou = false;

function aplicar(caminho, trocas) {
  if (!fs.existsSync(caminho)) { console.log('  (nao existe, pulando) ' + caminho); return; }
  let t = fs.readFileSync(caminho, 'utf8');
  if (t.includes('os DOIS erros que eu ja cometi') || t.includes('os DOIS erros que eu já cometi')
      || t.includes('Seu alcance é exatamente o que a ferramenta devolveu')) {
    console.log('  (ja aplicado) ' + caminho); return;
  }
  const relato = [];
  for (const [rotulo, velho, novo, esperado] of trocas) {
    const n = t.split(velho).length - 1;
    if (n !== esperado) {
      console.error('  ANCORA "' + rotulo + '" em ' + caminho + ': esperava ' + esperado + ', achei ' + n);
      falhou = true; return;
    }
    if (n > 0) t = t.split(velho).join(novo);
    relato.push(rotulo + '=' + n);
  }
  fs.copyFileSync(caminho, caminho + '.bak-' + carimbo + '-antes-regra-de-escopo');
  fs.writeFileSync(caminho, t);
  console.log('  ok ' + caminho + '  [' + relato.join(' ') + ']');
}

console.log('SOUL.md:');
for (const f of ALVOS_SOUL) {
  aplicar(f, [
    ['paragrafo-escopo', SOUL_VELHO, SOUL_NOVO, 1],
    ['guardrail', SOUL_GUARD_VELHO, SOUL_GUARD_NOVO, 1],
  ]);
}
console.log('SKILL.md (mila-gestao):');
for (const f of ALVOS_SKILL) {
  aplicar(f, [
    ['regua-item-2', SKILL_REGUA_VELHO, SKILL_REGUA_NOVO, 1],
    ['secao-unidade', SKILL_SECAO_VELHO, SKILL_SECAO_NOVO, 1],
    ['guardrail', SKILL_GUARD_VELHO, SKILL_GUARD_NOVO, 1],
  ]);
}
process.exit(falhou ? 1 : 0);
