#!/usr/bin/env node
// RAIZ do OCR travando 100% das imagens hoje (e degradando desde 21/08): dois processos
// tesseract rodando ao mesmo tempo TRAVAM DE VERDADE nesta maquina (4 CPUs visiveis) —
// nao e' mais lento, e' um deadlock: nem apos 50s (bem alem do timeout de 45s configurado)
// nenhum dos dois fecha o stdout.
//
// PROVA (26/08, isolado, fora do bridge e fora do Node inteiro):
//   - tesseract via bash, na imagem REAL do Arthur: 1,07s
//   - 1 tesseract via Node (spawn/spawnSync): 1-1,7s
//   - 2 tesseract CONCORRENTES via Node (spawn, sem limite de thread): NUNCA fecham
//     (watchdog de 50s estourado) -- e' esse o padrao "sempre exatos 45,0-45,06s, texto
//     vazio, dois SIGTERM" que aparece 100% das vezes no log de hoje.
//   - os MESMOS 2 processos concorrentes com OMP_THREAD_LIMIT=1: fecham em <1s cada.
//
// CAUSA: o tesseract 5.x usa OpenMP e, sem limite, cada processo tenta usar TODAS as
// CPUs visiveis. Rodando 2 processos ao mesmo tempo (a otimizacao "PSM 6 e 4 em
// paralelo", que substituiu o sequencial por volta de 21/08 -- e e' exatamente quando
// a taxa de timeout comecou a subir, 0% ate 20/08) sobrescreve o total de threads
// disponiveis e trava o agendador do OpenMP.
//
// FIX: limita cada processo tesseract a 1 thread OpenMP. Com 2 processos concorrentes
// isso usa no maximo 2 CPUs -- dentro da folga real da maquina -- e elimina a
// contencao que travava. Aplicado em TODA chamada de tesseract deste arquivo (inclusive
// a do fallback de PDF, que hoje roda sozinha mas nao deve depender disso: duas imagens
// de CHATS DIFERENTES podem processar ao mesmo tempo e recriar o mesmo problema).
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-tesseract-omp-thread-limit.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

trocar(
  `function ocrLocal(imagePath, { timeout = 45000, detailed = false } = {}) {`,
  `// Sem isto, 2+ tesseract concorrentes TRAVAM DE VERDADE nesta maquina (OpenMP
// disputando todas as CPUs visiveis por processo) -- nao e' mais lento, e' deadlock.
// Medido 26/08: sozinho ~1s; 2 concorrentes sem limite, nunca fecha (>50s); 2
// concorrentes com isto, <1s cada. Raiz do timeout de 45s em 100% das imagens de hoje.
const TESSERACT_ENV_SEM_OVERSUBSCRIPTION = { ...process.env, OMP_THREAD_LIMIT: '1', OMP_NUM_THREADS: '1' };

function ocrLocal(imagePath, { timeout = 45000, detailed = false } = {}) {`,
  'declara env sem oversubscription');

trocar(
  `const rr = cp.spawnSync('/usr/bin/tesseract', [png, 'stdout', '-l', 'por+eng', '--psm', '6'], { timeout, encoding: 'utf8', maxBuffer: 3 * 1024 * 1024 });`,
  `const rr = cp.spawnSync('/usr/bin/tesseract', [png, 'stdout', '-l', 'por+eng', '--psm', '6'], { timeout, encoding: 'utf8', maxBuffer: 3 * 1024 * 1024, env: TESSERACT_ENV_SEM_OVERSUBSCRIPTION });`,
  'fallback PDF usa env limitado');

trocar(
  `children.push(execFile('/usr/bin/tesseract', [imagePath, 'stdout', '-l', 'por+eng', '--psm', String(psm)], { timeout, maxBuffer: 3 * 1024 * 1024 }, (err, stdout) => onResult(psm, err, stdout)));`,
  `children.push(execFile('/usr/bin/tesseract', [imagePath, 'stdout', '-l', 'por+eng', '--psm', String(psm)], { timeout, maxBuffer: 3 * 1024 * 1024, env: TESSERACT_ENV_SEM_OVERSUBSCRIPTION }, (err, stdout) => onResult(psm, err, stdout)));`,
  'PSM6/PSM4 paralelos usam env limitado');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
