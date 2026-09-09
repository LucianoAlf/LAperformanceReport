#!/usr/bin/env node
/**
 * O LLM passa a enxergar QUANTAS PESSOAS o pagamento cobre — o regex deixa de
 * ser porteiro.
 *
 * 🔴 O FATO (09/09/2026). A Mayra mandou um PIX de R$ 1.722,00 de dois alunos,
 *    um deles com quatro cursos, e gastou 19 minutos e 6 mensagens sem
 *    conseguir. O MESMO par foi lançado com sucesso em 01/09. A diferença não
 *    estava no código: em 01/09 ela escreveu os nomes ligados por "e"; hoje ela
 *    acrescentou o valor de cada um entre parênteses — para ajudar — e o
 *    parêntese entre o nome e o "e" cegou `detectarContextoMultiAluno`.
 *
 *    A Sol entendeu MENOS porque a pessoa escreveu MAIS. É o pior tipo de
 *    defeito: pune quem se esforça para explicar melhor.
 *
 * 🔴 A DECISÃO DO LUCIANO (09/09): *"Não pode ter esse problema de estar entre
 *    parêntese, ou tem uma vírgula a mais, ou tá colado. Ela é o LLM
 *    interpretando aquilo ali, sabendo do que está sendo falado. Não é um
 *    hijack que coloca a camisa de força."*
 *
 *    Então NÃO é remendo no regex — é inversão de quem decide:
 *      · o LLM lê a prosa e diz quem pagou o quê   (interpretação)
 *      · a RPC resolve as faturas de verdade        (busca determinística)
 *      · o "pode" humano aprova o dinheiro          (autorização)
 *
 * ⚠️ SEM CHAMADA NOVA: o `interpretarComprovante` já roda em TODA mídia (~23s
 *    medidos). Ele só ganha um campo no schema. Uma segunda chamada de LLM
 *    dobraria a espera da consultora por informação que a primeira já tinha na
 *    mão.
 * ⚠️ O detector determinístico CONTINUA — como atalho barato, não como
 *    porteiro. Se ele já viu multi, ótimo; se não viu, o LLM ainda decide.
 * ⚠️ `pagamentos` com UM item não muda nada: o caminho de aluno único segue
 *    igual. Só 2+ abre o fluxo de pagamento inteiro.
 */
const fs = require('fs');

const ALVO = process.env.SOL_CAIXA_CJS
  || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';

const carimbo = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
const backup = `${ALVO}.bak-${carimbo}-antes-pagamento-inteiro`;

let src = fs.readFileSync(ALVO, 'utf8');
fs.writeFileSync(backup, src);
console.log('backup:', backup);

const trocas = [];
function troca(nome, alvo, novo, esperado = 1) {
  const n = src.split(alvo).length - 1;
  if (n !== esperado) {
    console.error(`🔴 ${nome}: ancora apareceu ${n}x, esperava ${esperado} — ABORTADO`);
    process.exit(1);
  }
  src = src.split(alvo).join(novo);
  trocas.push(nome);
}

// ── 1) o schema do interpretador ganha `pagamentos` ───────────────────────
troca('schema: pede os pagamentos por pessoa',
  `      + '"forma":"pix|dinheiro|cartao|transferencia|cheque ou null"}. '
      + 'categoria: parcela=mensalidade; lojinha=produto/loja; passaporte=passaporte; matricula=matricula; incerto=outro. '`,
  `      + '"forma":"pix|dinheiro|cartao|transferencia|cheque ou null",'
      // 🔴 quem enxerga "dois alunos" passa a ser o MODELO, nao o regex. A
      // legenda vem em prosa e muda de forma toda semana ("A e B", "A (R$x) e
      // B (R$y)", "aluno A - 4 cursos, aluna B"); regex nao acompanha isso.
      + '"pagamentos":[{"aluno":"nome completo","valor":numero ou null}]}. '
      + 'pagamentos: UMA entrada por PESSOA que o pagamento cobre. Se o texto cita '
      + 'dois ou mais alunos, liste todos, com o valor de cada um quando o texto disser. '
      + 'Se e um aluno so, devolva uma entrada so. Curso NAO e pessoa: "canto e harmonia" '
      + 'do mesmo aluno e UMA entrada. Nao invente nome que nao esteja no texto. '
      + 'categoria: parcela=mensalidade; lojinha=produto/loja; passaporte=passaporte; matricula=matricula; incerto=outro. '`);

// ── 2) o retorno carrega os pagamentos, saneados ──────────────────────────
troca('retorno: normaliza pagamentos',
  `        resolve({
          categoria: cat,
          aluno: (o.aluno && String(o.aluno).trim()) || null,
          competencia: (o.competencia && String(o.competencia).trim()) || null,
          forma: (o.forma ? String(o.forma).toLowerCase().trim() : null),
        });`,
  `        // ⚠️ o modelo as vezes repete o mesmo aluno; dedup por nome normalizado.
        //    E entrada sem nome nao vira item — item sem nome nao resolve fatura.
        const vistos = new Set();
        const pagamentos = (Array.isArray(o.pagamentos) ? o.pagamentos : [])
          .map((p) => ({
            aluno: (p && p.aluno && String(p.aluno).trim()) || null,
            valor: (p && p.valor != null && Number(p.valor) > 0) ? Number(p.valor) : null,
          }))
          .filter((p) => {
            if (!p.aluno) return false;
            const k = _normConf(p.aluno);
            if (!k || vistos.has(k)) return false;
            vistos.add(k);
            return true;
          });
        resolve({
          categoria: cat,
          aluno: (o.aluno && String(o.aluno).trim()) || null,
          competencia: (o.competencia && String(o.competencia).trim()) || null,
          forma: (o.forma ? String(o.forma).toLowerCase().trim() : null),
          pagamentos,
        });`);

fs.writeFileSync(ALVO, src);
console.log('aplicado:', trocas.join(' · '));
