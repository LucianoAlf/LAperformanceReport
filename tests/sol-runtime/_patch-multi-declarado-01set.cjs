#!/usr/bin/env node
// Caso Jhon/CG 01/09 17:09-17:12 — multi-aluno com DESCONTO NEGOCIADO em loop.
//
// "Parcelas de dois alunos: Davi Guilherme e Thuanny De Souza — R$1.722,
// *Desconto autorizado pelo Jerêh*". O Jhon mandou a divisão EXATAMENTE no
// formato pedido e a Sol repetiu "não consegui confirmar as faturas oficiais":
// o resolver exigia que cada item batesse no centavo com fatura canônica, e
// valor negociado não bate nunca. No fluxo de UM aluno a mesma situação é
// aviso + lançamento sem vínculo — a inconsistência era a raiz (migration
// multi_aluno_valor_declarado_lanca_sem_vinculo espelhou o single no banco).
//
// Runtime (este patch):
//  M1  flag `declarado_pelo_humano` por item, setada SÓ quando o valor aparece
//      LITERALMENTE no texto escrito pelo humano — divisão derivada continua
//      fail-closed.
//  M2  passthrough de sem_vinculo_fatura/declarado no lote.
//  M3  card avisa item a item: "valor declarado (sem vínculo de fatura)".
//  M4  roteador V4: intenção lancamento_multi_aluno entra no mapa (o shadow
//      classificou o caso real como lancamento_por_texto — gap registrado).
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-multi-declarado-01set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;
const BS = String.fromCharCode(92);

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── M1: flag por item quando o valor esta literal no texto humano ────────────
trocar(
  `    let resolvido = null;
    try {
      resolvido = await resolverMultiFn({ unidade_id: grupo.unidade_id, itens: intent.itens, valor_total: intent.valor_total });`,
  `    // Divisao DECLARADA pelo humano viaja com a flag: valor negociado que nao
    // bate com fatura lanca SEM vinculo, como no fluxo de um aluno (Jhon/CG
    // 01/09, "Desconto autorizado pelo Jereh"). So marca quando o valor esta
    // LITERALMENTE no texto escrito — divisao derivada segue fail-closed.
    const _valorNoTextoHumano = (v) => {
      const n = Number(v);
      if (!n || !textoFonte) return false;
      const cents = n.toFixed(2).replace('.', ',');
      const milhar = cents.replace(/` + BS + `B(?=(` + BS + `d{3})+(?=,))/g, '.');
      const inteiro = String(Math.round(n));
      return String(textoFonte).includes(cents) || String(textoFonte).includes(milhar)
        || new RegExp('(^|[^0-9,])' + inteiro + '([^0-9,]|$)').test(String(textoFonte));
    };
    const itensParaResolver = (intent.itens || []).map((it) =>
      _valorNoTextoHumano(it && it.valor) ? { ...it, declarado_pelo_humano: true } : it);
    let resolvido = null;
    try {
      resolvido = await resolverMultiFn({ unidade_id: grupo.unidade_id, itens: itensParaResolver, valor_total: intent.valor_total });`,
  'M1 flag declarado_pelo_humano');

// ── M2: passthrough no lote ──────────────────────────────────────────────────
trocar(
  `    const itens = resolvido.itens.map((item) => ({
      aluno_nome: item.aluno_nome, valor: Number(item.valor), competencia: item.competencia || null,
      categoria: item.categoria || intent.categoria, descricao: item.descricao || null,
      canonical_fatura_id: item.canonical_fatura_id || null, responsavel_financeiro: item.responsavel_financeiro || null,
      fatura: item.fatura || null,
    }));`,
  `    const itens = resolvido.itens.map((item) => ({
      aluno_nome: item.aluno_nome, valor: Number(item.valor), competencia: item.competencia || null,
      categoria: item.categoria || intent.categoria, descricao: item.descricao || null,
      canonical_fatura_id: item.canonical_fatura_id || null, responsavel_financeiro: item.responsavel_financeiro || null,
      fatura: item.fatura || null,
      sem_vinculo_fatura: !!item.sem_vinculo_fatura, declarado_pelo_humano: !!item.declarado_pelo_humano,
    }));`,
  'M2 passthrough sem_vinculo/declarado');

// ── M3: card avisa item a item ───────────────────────────────────────────────
trocar(
  '  const linhas = lista.map((item) => `• ${item.aluno_nome} — ${fmtBRL(item.valor)}`);',
  '  const linhas = lista.map((item) => `• ${item.aluno_nome} — ${fmtBRL(item.valor)}${item.sem_vinculo_fatura ? \' _(valor declarado — sem vínculo de fatura)_\' : \'\'}`);',
  'M3 linha do item avisa');

trocar(
  '    `*FATURA*\\n\\n• ${faturaTexto}\\n• Valor: ${fmtBRL(valorTotal)} ✅ confere\\n${linhaStatus}`,',
  `    \`*FATURA*\\n\\n• \${faturaTexto}\\n• Valor: \${fmtBRL(valorTotal)} ✅ confere\\n\${linhaStatus}\${lista.some((i) => i.sem_vinculo_fatura) ? '\\n• ⚠️ Item(ns) com desconto negociado — lanço sem vínculo de fatura.' : ''}\`,`,
  'M3 secao fatura avisa');

// ── M4: intencao multi no mapa do roteador ───────────────────────────────────
trocar(
  `'{"intencao":"aprovar|descartar|corrigir_aluno|corrigir_valor|corrigir_categoria|corrigir_forma|corrigir_competencia|sem_aluno|contestar_fatura|saida_dinheiro|lancamento_por_texto|corrigir_lancamento_gravado|estornar_lancamento|reabrir_caixa|abrir_caixa|fechar_caixa|consulta_caixa|conversa|nada",'`,
  `'{"intencao":"aprovar|descartar|corrigir_aluno|corrigir_valor|corrigir_categoria|corrigir_forma|corrigir_competencia|sem_aluno|contestar_fatura|saida_dinheiro|lancamento_por_texto|lancamento_multi_aluno|corrigir_lancamento_gravado|estornar_lancamento|reabrir_caixa|abrir_caixa|fechar_caixa|consulta_caixa|conversa|nada",'`,
  'M4 intencao multi no mapa');

trocar(
  `      + '"reabrir_caixa" quando pedem para abrir NOVAMENTE um caixa fechado ("pode abrir novamente", "reabre o caixa"). '`,
  `      + '"reabrir_caixa" quando pedem para abrir NOVAMENTE um caixa fechado ("pode abrir novamente", "reabre o caixa"). '
      + '"lancamento_multi_aluno" quando um pagamento cobre DOIS OU MAIS alunos (divisao por aluno). '`,
  'M4 regra multi no prompt');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
