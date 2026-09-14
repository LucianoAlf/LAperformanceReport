// Backfill único jan–set/2026 do espelho financeiro Emusys, mês a mês.
// Dirige a edge sync-financeiro-emusys (mesma lógica da rotina diária):
// cada POST cobre um mês; a função é resumível por dia, então repetir o mês
// até janela_completa=true é o caminho normal sob teto de tempo/API.
// Tokens nunca entram em log. Uso: node scripts/backfill-financeiro-emusys.mjs
import fs from 'node:fs';
import path from 'node:path';

const raizRepo = path.resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(raizRepo, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((linha) => linha.includes('=') && !linha.trim().startsWith('#'))
    .map((linha) => {
      const corte = linha.indexOf('=');
      return [linha.slice(0, corte).trim(), linha.slice(corte + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const FUNCTION_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys';
const SERVICE_ROLE = env.VITE_SUPABASE_SERVICE_ROLE;
if (!SERVICE_ROLE) throw new Error('VITE_SUPABASE_SERVICE_ROLE ausente no .env');

const UNIDADES = ['cg', 'barra', 'recreio'];
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const MESES = [];
for (let mes = 1; mes <= 9; mes += 1) {
  const inicio = `2026-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(Date.UTC(2026, mes, 0)).toISOString().slice(0, 10);
  MESES.push({ inicio, fim: ultimoDia < HOJE ? ultimoDia : HOJE, rotulo: inicio.slice(0, 7) });
}

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rodar(corpo, etiqueta) {
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      const resposta = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // gateway valida a assinatura; a função confere role=service_role do projeto
          'Authorization': `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(480000),
      });
      const json = await resposta.json();
      if (resposta.status === 429 || resposta.status >= 500) {
        const recuo = 30000 * tentativa;
        console.log(`  ${etiqueta}: HTTP ${resposta.status} — recuo ${recuo / 1000}s`);
        await espera(recuo);
        continue;
      }
      if (json.success !== true) throw new Error(`${etiqueta}: ${json.erro ?? JSON.stringify(json).slice(0, 200)}`);
      return json;
    } catch (erro) {
      if (tentativa === 3) throw erro;
      console.log(`  ${etiqueta}: ${erro.message} — tentando de novo`);
      await espera(15000);
    }
  }
}

console.log(`Backfill financeiro Emusys jan–set/2026 (hoje BRT: ${HOJE})\n`);
const inicioGeral = Date.now();

for (const unidade of UNIDADES) {
  for (const mes of MESES) {
    for (let rodada = 1; rodada <= 4; rodada += 1) {
      const sai = await rodar({
        unidade,
        data_inicial: mes.inicio,
        data_final: mes.fim,
        catalogos: false,
        orcamento_segundos: 200,
      }, `${unidade}/${mes.rotulo}`);
      const r = sai.resultados?.[0] ?? {};
      console.log(`${unidade} ${mes.rotulo} (rodada ${rodada}): +${r.dias_processados ?? 0} dias, pendentes=${r.dias_pendentes ?? '?'}${sai.resultados?.[0]?.falhas ? ' ERRO: ' + JSON.stringify(sai.resultados[0].falhas).slice(0, 160) : ''}`);
      if (r.janela_completa === true) break;
      if (rodada === 4) console.log(`  AVISO: ${unidade}/${mes.rotulo} não fechou em 4 rodadas — o resumo ficará pendente`);
    }
  }
}

// rodada final: catálogos completos + ponte da janela diária até hoje
console.log('\nRodada final: catálogos completos + janela diária (mês corrente + 2 anteriores)');
for (const unidade of UNIDADES) {
  const sai = await rodar({ unidade, catalogos: true, orcamento_segundos: 200 }, `${unidade}/final`);
  const r = sai.resultados?.[0] ?? {};
  console.log(`${unidade} final: catalogos=${JSON.stringify(r.catalogos)} pendentes=${r.dias_pendentes ?? '?'}`);
}

console.log(`\nConcluído em ${Math.round((Date.now() - inicioGeral) / 60000)} min.`);
