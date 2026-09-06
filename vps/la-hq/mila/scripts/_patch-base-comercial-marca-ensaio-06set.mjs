#!/usr/bin/env node
// O MCP PASSA A DECLARAR SE A CONSULTA E ENSAIO (06/09/2026).
//
// `mila_base_comercial_v1` agora grava uma linha por consulta, e ganhou
// `p_origem` para separar producao de ensaio. Quem sabe a diferenca e o
// PROCESSO, nao o modelo: o perfil de sombra sobe com DRY, o de producao nao.
//
// 🔴 O valor vem de `DRY`, a MESMA variavel que ja governa as tools de escrita.
//    Nao e argumento que o modelo escolhe e nao aparece no inputSchema — modelo
//    nao decide se o que ele esta fazendo conta como producao.
//
// ⚠️ Por que isso importa: a suite de sombra chama as tools com os telefones
//    REAIS das consultoras, e `DRY` so trava a escrita DECLARADA como escrita.
//    Consulta e leitura, entao passava direto. Sem esta linha, cada rodada da
//    suite (24 cenarios, dezenas de consultas) entraria no log como uso real, e
//    a resposta a "a base esta sendo usada?" seria inflada por mim mesmo — a
//    cicatriz da Sol de 31/08, quando 62% dos previews do ledger V3 da semana
//    eram artefato de teste.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-base-comercial-marca-ensaio-06set.mjs <mila-gestao-tools-mcp.mjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

const DE = `    case 'consultar_base_comercial':
      return j(await rpc('mila_base_comercial_v1', { p_solicitante_telefone: tel,
        ...(a.situacao ? { p_situacao: a.situacao } : {}), ...(a.limite ? { p_limite: a.limite } : {}) }));`;

const PARA = `    case 'consultar_base_comercial':
      // ⚠️ \`p_origem\` NAO esta no inputSchema de proposito: quem declara se isto
      //    e ensaio e o processo (DRY), nunca o modelo. Sem isso a suite de
      //    sombra, que usa telefone real de consultora, entraria no log como
      //    uso de producao e inflaria a medicao de adocao da base.
      return j(await rpc('mila_base_comercial_v1', { p_solicitante_telefone: tel,
        ...(a.situacao ? { p_situacao: a.situacao } : {}), ...(a.limite ? { p_limite: a.limite } : {}),
        p_origem: DRY ? 'ensaio' : 'producao' }));`;

const n = src.split(DE).length - 1;
if (n !== 1) { console.error(`ANCORA do despacho: esperava 1, achei ${n}`); process.exit(1); }
src = src.split(DE).join(PARA);
console.log('  ok  despacho de consultar_base_comercial passa p_origem');

fs.writeFileSync(alvo, src);
console.log(`\nescrito ${alvo}  (${antes} -> ${src.length} bytes)`);
