#!/usr/bin/env node
// "Venda: Arthur" = quem VENDEU, nao o aluno. (Barra, 29/08 11:27)
//
// CASO: legenda "Venda camisa LA Music Kids Preta 4 anos / Venda: Arthur". O card
// saiu com ALUNO = Arthur e "Resp. financeiro: Joice Pedro Palmerini Lomba" — uma
// familia que nao tem NADA a ver com a venda. O Arthur e o ADM que fez a venda e
// mandou a mensagem; o aluno era o Theo de Bem.
//
// ⚠️ Isto e' pior que ruido de card: lojinha lancada no aluno errado polui a
// carteira de outra familia. E o nome veio do LLM (medido: `_alunoRotulado` da
// null nessa legenda) — ou seja, nao ha regex para consertar, e sim uma REGRA
// que faltava.
//
// TRES GUARDAS, da mais forte para a mais fraca:
//
// V1 — QUEM ENVIA NAO E' O ALUNO. Arthur mandou a mensagem e a Sol ja identifica
//      o remetente (identidadeFn) para carimbar o "autorizou". Se o "aluno" bate
//      com quem enviou, nao e' aluno — e' assinatura de quem lancou. Vale para
//      todo mundo do grupo financeiro, sem lista de nomes para manter.
//      ⚠️ Exige mover a busca de identidade para ANTES de montar o card; hoje ela
//      roda depois (so servia para o carimbo).
//
// V2 — ROTULO DE VENDEDOR. "Venda:", "Vendedor:", "Vendido por:", "Atendente:",
//      "Vendeu:" marcam QUEM VENDEU. O nome que vem depois nunca e' aluno.
//
// V3 — LOJINHA SEM COMPRADOR mostra a secao ALUNO vazia pedindo o nome, em vez de
//      esconder (o #232 escondia). Esconder resolvia o card poluido, mas deixava a
//      venda sem dono e ninguem percebia. Perguntar e' o certo.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-vendedor-nao-e-aluno.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── V2: extrator de vendedor ─────────────────────────────────────────────────
trocar(
  'function _alunoRotulado(body) {',
  `// "Venda: Arthur" / "Vendedor: Ana" / "Vendido por: Kailane" — quem VENDEU.
// O nome que vem depois destes rotulos NUNCA e' aluno (Barra 29/08: o card saiu
// com ALUNO=Arthur, que e' o ADM que fez a venda, e puxou a responsavel financeira
// de uma familia sem relacao nenhuma com a compra).
function _vendedorRotulado(body) {
  const t = bodyLimpo(body);
  if (!t) return null;
  const m = t.match(/\\b(?:vend(?:a|eu|edor(?:a)?|ido\\s+por)|atendente|atendido\\s+por)\\s*[:\\-]\\s*([A-Za-z\\u00c0-\\u00ff][A-Za-z\\u00c0-\\u00ff.'\\s]{2,60})/i);
  if (!m) return null;
  const nome = String(m[1] || '').split(/[\\n,;|]/)[0].replace(/\\s+/g, ' ').trim();
  return nome || null;
}

function _mesmaPessoa(a, b) {
  const norm = (s) => _normConf(String(s || '')).replace(/[^a-z\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // primeiro nome + ao menos um sobrenome em comum, ou um contido no outro
  if (x.startsWith(y + ' ') || y.startsWith(x + ' ')) return true;
  const tx = x.split(' '), ty = y.split(' ');
  if (tx[0] !== ty[0]) return false;
  return tx.length === 1 || ty.length === 1 || tx.some((p) => p !== tx[0] && ty.includes(p));
}

function _alunoRotulado(body) {`,
  'V2 _vendedorRotulado + _mesmaPessoa');

// ── V1: identidade do remetente ANTES de montar o card ───────────────────────
trocar(
  `      let texto = montarPreview({ unidadeNome: grp.nome, valor, forma, categoria, aluno,`,
  `      // ⚠️ Identidade do remetente ANTES do card: e' o que permite descartar
      // "aluno = quem enviou". Antes disso ela so era buscada depois, para o
      // carimbo de quem autorizou.
      let idEnviou = null;
      try { idEnviou = await identidadeFn(event.senderPhone, grp.unidade_id); } catch (e) { /* best-effort */ }
      {
        const _vendedor = _vendedorRotulado(legendaEfetiva);
        const _remetente = idEnviou && idEnviou.identificado ? idEnviou.nome : null;
        const _porQue = (aluno && _vendedor && _mesmaPessoa(aluno, _vendedor)) ? 'rotulo_de_venda'
          : (aluno && _remetente && _mesmaPessoa(aluno, _remetente)) ? 'e_quem_enviou'
          : null;
        if (_porQue) {
          log({ acao: 'aluno_descartado_nao_e_aluno', chatId, aluno, motivo: _porQue });
          aluno = null; responsavelFinanceiro = null; canonica = null; parcela = null;
          alunoNovoId = null; alunoNovoOrigem = null; alunoViaPagador = null; candidatosAluno = null;
        }
      }
      let texto = montarPreview({ unidadeNome: grp.nome, valor, forma, categoria, aluno,`,
  'V1 descarta aluno que e vendedor ou remetente');

trocar(
  `      const previewId = await sendFn(chatId, texto);
      const arr = limparVelhos(chatId, agora);
      let idEnviou = null;
      try { idEnviou = await identidadeFn(event.senderPhone, grp.unidade_id); } catch (e) { /* best-effort */ }
      log({ acao: 'identidade_envio', identificado: !!(idEnviou && idEnviou.identificado) });`,
  `      const previewId = await sendFn(chatId, texto);
      const arr = limparVelhos(chatId, agora);
      log({ acao: 'identidade_envio', identificado: !!(idEnviou && idEnviou.identificado) });`,
  'V1 remove a busca duplicada de identidade');

// ── V3: lojinha sem comprador PERGUNTA em vez de esconder ────────────────────
trocar(
  `  if (!ehSaidaPreview && !_lojinhaSemComprador) blocos.push(bAluno);`,
  `  // ⚠️ Lojinha sem comprador: PERGUNTA em vez de esconder. Esconder (25/08)
  // limpava o card poluido, mas deixava a venda sem dono e ninguem reparava —
  // foi assim que a camisa do Theo quase entrou no nome do vendedor.
  if (!ehSaidaPreview && _lojinhaSemComprador) {
    blocos.push(['*ALUNO*', '⚠️ Não sei para quem foi a venda — me manda *aluno: Nome Completo*.']);
  } else if (!ehSaidaPreview) blocos.push(bAluno);`,
  'V3 lojinha sem comprador pergunta');

// exporta para o teste
trocar(
  '  _saidaExplicitaFromCaption, _nomeHumanoTardio, extrairValorOcr,',
  '  _saidaExplicitaFromCaption, _nomeHumanoTardio, extrairValorOcr, _vendedorRotulado, _mesmaPessoa,',
  'exporta helpers');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
