// Conta renovacoes reais pelo CONTRATO, nao pelo valor.
//
// Por que trocar o criterio: renovacao abre um contrato_id novo no Emusys, e as
// parcelas seguintes passam a apontar para ele. Isso vale mesmo quando a
// renovacao nao teve reajuste (Marcello: 417 -> 417), caso que o criterio de
// "degrau de valor" nao enxerga. E imune a juros/multa e a parcela dividida,
// que produziam degrau falso (Pedro Henrique: 367 -> 456,61 era juros).
//
// Regra: para cada matricula, um contrato que ESTREIA em 2026 (primeira parcela
// dele em 2026) e que nao e o contrato inicial da matricula = 1 renovacao.
// Aluno com 2 matriculas renova 2x legitimamente (Perola: mat 519 e 520).
//
// O valor continua no relatorio como evidencia legivel, nao como criterio.

import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const BASE = env.EMUSYS_API_BASE_URL || 'https://api.emusys.com.br/v1';
const TOKENS = {
  'Campo Grande': env.EMUSYS_TOKEN_CAMPO_GRANDE,
  Barra: env.EMUSYS_TOKEN_BARRA,
  Recreio: env.EMUSYS_TOKEN_RECREIO,
};

const alvos = JSON.parse(readFileSync(new URL('../outputs/emusys-snapshots/alvos.json', import.meta.url), 'utf8'));
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

async function buscarFaturas(token, alunoId) {
  const todas = [];
  let cursor = null;
  for (let pagina = 0; pagina < 30; pagina++) {
    const url = new URL(`${BASE}/faturas`);
    url.searchParams.set('aluno_id', String(alunoId));
    if (cursor) url.searchParams.set('cursor', cursor);

    let resposta;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      resposta = await fetch(url, { headers: { token } });
      if (resposta.status !== 429) break;
      await dorme(3000 * (tentativa + 1));
    }
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} aluno ${alunoId}`);

    const corpo = await resposta.json();
    todas.push(...(corpo.items ?? []));
    cursor = corpo.paginacao?.proximo_cursor ?? null;
    if (!corpo.paginacao?.tem_mais || !cursor) break;
    await dorme(1100);
  }
  return todas;
}

function competencia(f) {
  const m = String(f.descricao ?? '').match(/Parcela\s+(\d{2})\/(\d{4})/i);
  if (m) return `${m[2]}-${m[1]}`;
  return String(f.data_vencimento ?? '').slice(0, 7);
}

// Valor CONTRATADO liquido. Nao usa valor_pago: juros e multa inflam o pago e
// produzem degrau que nao existe no contrato.
function valorContratado(f) {
  const bruto = Number(f.valor_original ?? 0);
  const desc = Number(f.desconto_fixo ?? 0) + Number(f.desconto_condicional ?? 0);
  const liq = bruto - desc;
  return liq > 0 ? Number(liq.toFixed(2)) : null;
}

const relatorio = [];

for (const alvo of alvos) {
  const token = TOKENS[alvo.unidade];
  let faturas;
  try {
    faturas = await buscarFaturas(token, alvo.sid);
  } catch (e) {
    relatorio.push({ ...alvo, erro: String(e.message) });
    await dorme(1100);
    continue;
  }

  const parcelas = faturas
    .filter((f) => /^parcela/i.test(String(f.descricao ?? '')))
    .filter((f) => String(f.status ?? '').toLowerCase() !== 'cancelada')
    .map((f) => ({
      comp: competencia(f),
      matricula: String(f.matricula_id ?? 'sem'),
      contrato: String(f.contrato_id ?? 'sem'),
      valor: valorContratado(f),
      total_parcelas: f.total_parcelas_contrato,
    }))
    .filter((p) => p.comp >= '2020-01');

  const matriculas = {};
  for (const p of parcelas) {
    const m = (matriculas[p.matricula] ??= { contratos: {} });
    const c = (m.contratos[p.contrato] ??= { primeira: p.comp, ultima: p.comp, valores: new Set() });
    if (p.comp < c.primeira) c.primeira = p.comp;
    if (p.comp > c.ultima) c.ultima = p.comp;
    if (p.valor !== null) c.valores.add(p.valor);
  }

  let renovacoes2026 = 0;
  const detalhe = {};
  for (const [mat, m] of Object.entries(matriculas)) {
    const contratos = Object.entries(m.contratos)
      .map(([id, c]) => ({ id, ...c, valores: [...c.valores].sort((a, b) => a - b) }))
      .sort((a, b) => a.primeira.localeCompare(b.primeira));

    // O primeiro contrato da matricula e a matricula original, nao renovacao.
    // Cada contrato posterior que estreia em 2026 = uma renovacao em 2026.
    const renovacoes = contratos.slice(1).filter((c) => c.primeira >= '2026-01' && c.primeira <= '2026-12');
    renovacoes2026 += renovacoes.length;

    detalhe[mat] = {
      contratos: contratos.map((c) => `${c.id}:${c.primeira}→${c.ultima} [${c.valores.join('/')}]`),
      renovou_em: renovacoes.map((c) => c.primeira),
    };
  }

  relatorio.push({
    aluno_id: alvo.aluno_id,
    nome: alvo.nome,
    unidade: alvo.unidade,
    sid: alvo.sid,
    registros_no_banco: alvo.movs.length,
    renovacoes_reais: renovacoes2026,
    excedente: alvo.movs.length - renovacoes2026,
    qtd_matriculas: Object.keys(matriculas).length,
    movs: alvo.movs,
    detalhe,
  });

  process.stdout.write(
    `${alvo.nome} — banco ${alvo.movs.length} / real ${renovacoes2026} ` +
      `(${Object.keys(matriculas).length} matricula(s))\n`
  );
  await dorme(1100);
}

writeFileSync(new URL('../outputs/emusys-snapshots/relatorio-contratos.json', import.meta.url), JSON.stringify(relatorio, null, 2));

const excedente = relatorio.filter((r) => r.excedente > 0);
console.log(`\n${excedente.length} aluno(s) com excedente | ${excedente.reduce((s, r) => s + r.excedente, 0)} registro(s) a anular`);
