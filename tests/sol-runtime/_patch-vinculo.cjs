#!/usr/bin/env node
// Patcher do runtime da Sol: leva o vínculo estruturado (aluno_id + fatura_id) para o
// lançamento SIMPLES, que até agora só o LOTE de irmãos gravava.
//
// Escrito como script em vez de sed/heredoc de propósito: em 24/08 duas tentativas de
// patch por heredoc comeram as barras de uma regex, o arquivo passou no `require()` e
// explodiu em runtime. Aqui as substituições são split/join literais e o único regex
// inserido (UUID) não tem uma única barra invertida.
//
// Uso: node _patch-vinculo.cjs <caminho-do-caixa-financeiro.cjs>

const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-vinculo.cjs <arquivo>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── 1. helper de derivação do vínculo ────────────────────────────────────────────────
const HELPER = `// Vinculo estruturado do lancamento: qual MATRICULA e qual FATURA este dinheiro quita.
//
// 🔴 REGRA: aluno_id vem da FATURA escolhida, NUNCA do match por nome. \`alunos\` e
// matricula, nao pessoa -- a Valentina (Recreio) tem 3 linhas: 697 Canto, 1099 Teclado,
// 1542 Power Kids. O \`aluno_id\` de topo que \`sol_caixa_casar_parcela\` devolve vinha do
// nome (limit 1 arbitrario entre as 3, todas com nome identico) e apontava Power Kids
// junto com uma fatura de Canto. O id que este helper le mora DENTRO do objeto da
// fatura/parcela e e resolvido no banco por emusys_matricula_id, que carrega o curso.
//
// Fica NULL sem constrangimento quando nao da para afirmar: e melhor movimento sem
// vinculo do que vinculo mentiroso -- ninguem reconcilia por cima de dado errado.
function derivarVinculo({ canonica, parcela, composto, alunoNovoId } = {}) {
  const num = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
  const uuid = (v) => (typeof v === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null;

  // 1) COMPOSTO: varias faturas num pagamento so, logo fatura_id nao existe (seriam N).
  //    aluno_id so sai quando TODAS as partes sao da mesma matricula. Na Valentina sao
  //    Canto + Teclado = matriculas diferentes, entao fica nulo -- resposta honesta.
  if (composto && Array.isArray(composto.partes) && composto.partes.length) {
    const ids = composto.partes.map((p) => num(p && p.aluno_id));
    const unico = (ids[0] !== null && ids.every((x) => x === ids[0])) ? ids[0] : null;
    return { aluno_id: unico, fatura_id: null,
      fonte: unico ? 'composto_mesma_matricula' : 'composto_multiplas_matriculas' };
  }
  // 2) FATURA CANONICA: a fonte mais forte do contrato v4.
  if (canonica && canonica.fatura) {
    const a = num(canonica.fatura.aluno_id);
    const f = uuid(canonica.fatura.canonical_fatura_id);
    if (a || f) return { aluno_id: a, fatura_id: f, fonte: 'canonica' };
  }
  // 3) CASAMENTO LEGADO: mesma regra, o aluno_id ja vem da fatura escolhida.
  if (parcela) {
    const a = num(parcela.aluno_id);
    const f = uuid(parcela.fatura_id);
    if (a || f) return { aluno_id: a, fatura_id: f, fonte: 'casamento' };
  }
  // 4) SEM FATURA (passaporte de quem esta entrando): so vincula se a RPC garantiu
  //    matricula unica -- ela devolve aluno_id null quando a pessoa tem 2+ cursos.
  const a = num(alunoNovoId);
  if (a) return { aluno_id: a, fatura_id: null, fonte: 'aluno_novo' };

  return { aluno_id: null, fatura_id: null, fonte: null };
}

function _descricaoLancamento(`;

trocar('function _descricaoLancamento(', HELPER, 'helper derivarVinculo');

// ── 2. captura do aluno_id do funil ──────────────────────────────────────────────────
trocar(
  'let alunoNovoResponsavel = null;',
  'let alunoNovoResponsavel = null;\n      let alunoNovoId = null;',
  'declara alunoNovoId');

trocar(
  'alunoNovoResponsavel = novo.responsavel_nome || null;',
  'alunoNovoResponsavel = novo.responsavel_nome || null;\n'
  + '              // so vem preenchido quando a pessoa tem UMA matricula ativa na unidade;\n'
  + '              // com 2+ cursos a RPC devolve null de proposito (motivo_sem_vinculo).\n'
  + '              alunoNovoId = (novo.aluno_id != null) ? novo.aluno_id : null;',
  'captura alunoNovoId');

// ── 3. pendência carrega o que o vínculo precisa ─────────────────────────────────────
trocar(
  'composto, itemLojinha: lojinhaInfo && lojinhaInfo.item, bloqueiaLancamento,',
  'composto, canonica, alunoNovoId, itemLojinha: lojinhaInfo && lojinhaInfo.item, bloqueiaLancamento,',
  'pendencia guarda canonica/alunoNovoId');

// o caminho de correcao tardia de nome remonta a pendencia; sem isto ele perderia a
// canonica recem-resolvida e o vinculo cairia para a fonte mais fraca.
trocar(
  'alvoP.composto = composto || alvoP.composto || null;',
  'alvoP.composto = composto || alvoP.composto || null;\n'
  + '          alvoP.canonica = canonica || alvoP.canonica || null;',
  'correcao tardia preserva canonica');

// ── 4. payload do lançamento simples ─────────────────────────────────────────────────
trocar(
  `        responsavel_financeiro: alvo.responsavelFinanceiro || null,
      };`,
  `        responsavel_financeiro: alvo.responsavelFinanceiro || null,
      };
      // Vinculo estruturado: a RPC valida os dois contra a unidade e ignora o que nao
      // bater, entao mandar e seguro; o que nao pode e mandar id CHUTADO (ver derivarVinculo).
      const vinculo = derivarVinculo(alvo);
      if (vinculo.aluno_id) payload.aluno_id = vinculo.aluno_id;
      if (vinculo.fatura_id) payload.fatura_id = vinculo.fatura_id;
      log({ acao: 'vinculo_lancamento', fonte: vinculo.fonte,
            aluno_id: vinculo.aluno_id || null, tem_fatura: !!vinculo.fatura_id });`,
  'payload leva aluno_id/fatura_id');

// ── 5. exporta para os testes ────────────────────────────────────────────────────────
trocar(
  '  casarParcelaCanonica, linhasDaFatura,',
  '  derivarVinculo, casarParcelaCanonica, linhasDaFatura,',
  'exporta derivarVinculo');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
