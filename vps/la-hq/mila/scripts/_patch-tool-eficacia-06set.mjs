#!/usr/bin/env node
// A tool que FECHA O LACO: a lideranca registra se a estrategia funcionou.
// Sem ela, `evidencia_eficacia` continua vazia e a Mila recomenda para sempre
// com a mesma conviccao, tenha dado certo ou nao.
// ⚠️ Entra em BASE_COMERCIAL (visivel so a comercial/diretoria) e o servidor
//    ainda recusa quem nao lidera — duas travas, e a de dentro e que vale.
import fs from 'node:fs';
const alvo = process.argv[2];
if (!alvo) { console.error('uso: node patch-tool-eficacia.mjs <mcp.mjs>'); process.exit(2); }
let src = fs.readFileSync(alvo, 'utf8');
if (src.includes('registrar_eficacia')) { console.log('tool ja existe'); process.exit(0); }

const ANC = `  { name: 'registrar_lacuna_base',`;
if (src.split(ANC).length - 1 !== 1) { console.error('ANCORA nao bateu'); process.exit(1); }
src = src.replace(ANC, `  { name: 'registrar_eficacia',
    description: 'FECHA O LACO. Registra o que uma estrategia RENDEU depois de executada — e assim a proxima vez que ela aparecer eu ja sei se funcionou. Use quando quem lidera contar o resultado de uma campanha, corridinha ou acao ("a corridinha deu 8 matriculas"). 🔴 O rotulo e obrigatorio e muda o sentido: observado = aconteceu junto · atribuido = ha razao para ligar · incremental = tem COMPARADOR (mesmo mes do ano passado, ou as unidades que nao fizeram). Sem comparador eu NAO registro como incremental — pergunto contra o que. Nunca diga que a acao CAUSOU o numero se o rotulo for observado.',
    inputSchema: { type: 'object', required: ['codigo', 'resultado', 'rotulo'], properties: {
      codigo: { type: 'string', description: 'Codigo da estrategia (EC1, EC5...). Se nao souber, use onde_focar antes.' },
      resultado: { type: 'string', description: 'O que aconteceu, com numero.' },
      rotulo: { type: 'string', description: 'observado | atribuido | incremental' },
      comparador: { type: 'string', description: 'Contra o que. Obrigatorio se rotulo=incremental.' } } } },
${ANC}`);

const ANC2 = `    case 'registrar_lacuna_base':`;
if (src.split(ANC2).length - 1 !== 1) { console.error('ANCORA do case nao bateu'); process.exit(1); }
src = src.replace(ANC2, `    case 'registrar_eficacia':
      if (DRY) return j({ ok: true, dry_run: true, recado: 'ensaio: eficacia nao gravada' });
      return j(await rpc('mila_registrar_eficacia_v1', { p_solicitante_telefone: tel,
        p_codigo_estrategia: a.codigo, p_resultado: a.resultado, p_rotulo: a.rotulo,
        ...(a.comparador ? { p_comparador: a.comparador } : {}) }));
${ANC2}`);
fs.writeFileSync(alvo, src);
console.log('tool registrar_eficacia acrescentada');
