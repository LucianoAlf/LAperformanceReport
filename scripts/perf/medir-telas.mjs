// Mede o tempo de carregamento das telas logadas (Playwright + Chrome).
// Uso: LA_EMAIL=... LA_SENHA=... node scripts/perf/medir-telas.mjs <rotulo> [base_url] [cpus]
// Credenciais SÓ por variável de ambiente. Sessão, prints e resultados ficam em
// scripts/perf/.saida/ (ignorado pelo git). No Git Bash use MSYS_NO_PATHCONV=1 se passar TELAS.
// 'pronto' = nenhuma chamada à API em voo por 2 s e nenhum spinner visível.
import { chromium } from 'playwright';
import fs from 'fs';
import { fileURLToPath } from 'url';

const ROTULO = process.argv[2] || 'medicao';
const BASE = process.argv[3] || 'https://la-performance-report.vercel.app';
const CPUS = (process.argv[4] || '1,4').split(',').map(Number);
const REPETICOES = Number(process.env.REPETICOES || 2);
const SESSAO = fileURLToPath(new URL('./.saida/sessao-' + new URL(BASE).host.replace(/[^a-z0-9]/gi, '_') + '.json', import.meta.url));
const TELAS = (process.env.TELAS || '/app,/app/alunos,/app/agenda,/app/professores,/app/comercial,/app/administrativo,/app/sucesso-aluno,/app/pre-atendimento').split(',');

fs.mkdirSync(new URL('./.saida/', import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function garantirSessao() {
  if (fs.existsSync(SESSAO)) return;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await p.fill('input[type=email]', process.env.LA_EMAIL);
  await p.fill('input[type=password]', process.env.LA_SENHA);
  await p.click('button[type=submit]');
  await p.waitForURL(/\/app/, { timeout: 60000 });
  await p.waitForTimeout(3000);
  await ctx.storageState({ path: SESSAO });
  await ctx.close();
}

async function medir(rota, cpu) {
  const ctx = await browser.newContext({ storageState: SESSAO, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.addInitScript(() => {
    window.__lt = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt += e.duration; }).observe({ type: 'longtask', buffered: true });
  });
  const voo = new Map(); const feitos = []; let t0 = 0; let ultimoFim = 0; let erros = 0;
  const ehApi = (u) => u.includes('.supabase.co/');
  page.on('request', r => { if (ehApi(r.url())) voo.set(r, Date.now()); });
  const fim = async (r, falhou) => {
    if (!voo.has(r)) return; const ini = voo.get(r); voo.delete(r); const agora = Date.now(); ultimoFim = agora;
    let status = 0; try { status = (await r.response())?.status() ?? 0; } catch {}
    if (falhou || status >= 400) erros++;
    const u = new URL(r.url()); feitos.push({ alvo: u.pathname.replace('/rest/v1/', '').replace('/functions/v1/', 'fn:'), ms: agora - ini, ini: ini - t0, status });
  };
  page.on('requestfinished', r => fim(r, false)); page.on('requestfailed', r => fim(r, true));
  t0 = Date.now();
  await page.goto(BASE + rota, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // Pronto = nenhuma chamada à API em voo por 2 s E nenhum spinner visível (teto 90 s).
  const limite = t0 + 90000; let quieto = 0;
  while (Date.now() < limite) {
    const spinner = await page.locator('.animate-spin:visible').count().catch(() => 0);
    if (voo.size === 0 && spinner === 0) { quieto += 250; if (quieto >= 2000) break; } else quieto = 0;
    await page.waitForTimeout(250);
  }
  const pronto = (ultimoFim || Date.now()) - t0;
  const m = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint').find(x => x.name === 'first-contentful-paint');
    return { fcp: Math.round(p?.startTime || 0), lt: Math.round(window.__lt) };
  });
  fs.mkdirSync(new URL('./.saida/prints/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(`./.saida/prints/${ROTULO}-${rota.replace(/\W+/g, '_')}-cpu${cpu}.png`, import.meta.url)) });
  await ctx.close();
  feitos.sort((a, b) => b.ms - a.ms);
  return { pronto_ms: pronto, fcp_ms: m.fcp, bloqueio_ms: m.lt, chamadas: feitos.length, erros, mais_lentas: feitos.slice(0, 4).map(f => `${f.alvo}=${f.ms}ms`) };
}

await garantirSessao();
const saida = [];
for (const cpu of CPUS) for (const rota of TELAS) {
  const rs = [];
  for (let i = 0; i < REPETICOES; i++) rs.push(await medir(rota, cpu));
  rs.sort((a, b) => a.pronto_ms - b.pronto_ms);
  const r = rs[Math.floor((rs.length - 1) / 2)];
  const linha = { rotulo: ROTULO, cpu: cpu + 'x', rota, ...r, pronto_todas: rs.map(x => x.pronto_ms) };
  saida.push(linha); console.log(JSON.stringify(linha));
}
fs.appendFileSync(new URL('./.saida/resultados.jsonl', import.meta.url), saida.map(x => JSON.stringify({ em: new Date().toISOString(), ...x })).join('\n') + '\n');
await browser.close();
