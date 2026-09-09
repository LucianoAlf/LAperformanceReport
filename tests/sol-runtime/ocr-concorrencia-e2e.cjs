// Prova que o OCR não trava quando roda em paralelo — a raiz do problema que deixou o
// Arthur (Barra, 26/08) 1-2 minutos sem resposta, e vinha piorando desde 21/08 (0% de
// timeout até 20/08, 100% em 26/08).
//
// CAUSA: tesseract 5.x usa OpenMP e, sem limite, cada processo tenta usar TODAS as CPUs
// visíveis (4 nesta máquina). O código já roda PSM 6 e PSM 4 em PARALELO por imagem
// ("antes eram sequenciais e dois timeouts de 45s transformavam uma falha transitória em
// 90s" — comentário original), e essa mesma paralelização, sem limite de thread, faz os
// dois processos DISPUTAREM as CPUs e TRAVAREM DE VERDADE — não é mais lento, é deadlock:
// nem depois de 50s (bem além do timeout de 45s) nenhum dos dois fecha o stdout.
//
// PROVA (26/08, isolado): 2 tesseract concorrentes sem limite -> nunca fecham (>50s).
// Os MESMOS 2, com OMP_THREAD_LIMIT=1 -> fecham em <1s cada.
//
// Este teste roda a função REAL `ocrLocal` (não mockada) contra uma imagem sintética
// gerada na hora, sozinha e depois em duas chamadas concorrentes (simulando dois grupos
// mandando comprovante ao mesmo tempo — cada chamada já spawna 2 tesseract por dentro,
// então isso testa 4 processos tesseract simultâneos).
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mod = require('./_alvo.cjs');

const LIMIAR_MS = 10000; // bem abaixo do timeout de 45s configurado no ocrLocal

const imgPath = path.join(os.tmpdir(), `ocr-concorrencia-teste-${process.pid}.png`);

(async () => {
  const falhas = [];
  try {
    execSync(
      `python3 -c "from PIL import Image, ImageDraw; img = Image.new('RGB', (400,200), color='white'); ` +
      `d = ImageDraw.Draw(img); d.text((10,10), 'TESTE R\$ 100,00', fill='black'); img.save('${imgPath}')"`,
      { stdio: 'pipe' },
    );
  } catch (e) {
    console.log('RESULTADO: PULADO — python3/PIL indisponível para gerar a imagem de teste');
    process.exit(0);
  }

  console.log('=== ocrLocal() sozinho ===');
  let t0 = Date.now();
  const r1 = await mod.ocrLocal(imgPath, { detailed: true });
  const dur1 = Date.now() - t0;
  console.log(`  ${dur1}ms | status=${r1.status}`);
  if (dur1 > LIMIAR_MS) falhas.push(`ocrLocal sozinho levou ${dur1}ms (limiar ${LIMIAR_MS}ms)`);

  console.log('=== duas chamadas ocrLocal() CONCORRENTES (4 tesseract simultâneos) ===');
  t0 = Date.now();
  const [ra, rb] = await Promise.all([
    mod.ocrLocal(imgPath, { detailed: true }),
    mod.ocrLocal(imgPath, { detailed: true }),
  ]);
  const dur2 = Date.now() - t0;
  console.log(`  ${dur2}ms | statusA=${ra.status} statusB=${rb.status}`);
  if (dur2 > LIMIAR_MS) {
    falhas.push(`2 ocrLocal concorrentes levaram ${dur2}ms (limiar ${LIMIAR_MS}ms) — `
      + 'sinal de oversubscription do OpenMP voltando a travar tesseract em paralelo');
  }
  if (ra.status === 'timeout' || rb.status === 'timeout') {
    falhas.push('pelo menos uma chamada concorrente deu timeout — deadlock do tesseract voltou');
  }

  try { fs.unlinkSync(imgPath); } catch (e) {}

  console.log('');
  if (falhas.length) {
    console.log('RESULTADO: FALHOU');
    falhas.forEach((f) => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('RESULTADO: PASSOU — OCR não trava sob concorrência');
})().catch((e) => { console.error('ERRO NO TESTE:', e && e.stack); process.exit(1); });
