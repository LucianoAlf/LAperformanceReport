import fs from 'node:fs';
import process from 'node:process';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function projectRefFromUrl(url) {
  const host = new URL(url).hostname;
  return host.split('.')[0];
}

async function queryManagementApi(query) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!supabaseUrl || !token) {
    throw new Error('Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_ACCESS_TOKEN.');
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRefFromUrl(supabaseUrl)}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`CONSULTA_FALHOU_${response.status}:${text}`);
  return text ? JSON.parse(text) : [];
}

const SQL = String.raw`
with alvos as (
  select p.id, p.nome
  from public.professores p
  where lower(unaccent(p.nome)) in ('matheus lana da silva', 'valdo delfino')
), latest as (
  select distinct on (s.professor_id, s.competencia, s.unidade_id)
    s.*
  from public.health_score_professor_v3_snapshots s
  join alvos a on a.id = s.professor_id
  where s.competencia in (date '2026-06-01', date '2026-07-01')
    and s.periodicidade = 'mensal'
  order by s.professor_id, s.competencia, s.unidade_id,
           s.revisao desc, s.criado_em desc, s.id desc
)
select
  a.nome as professor,
  coalesce(u.nome, 'Consolidado') as unidade,
  to_char(l.competencia, 'YYYY-MM') as competencia,
  l.revisao,
  l.score,
  l.cobertura,
  l.classificacao,
  l.estado_publicacao,
  l.score_exibivel,
  l.ranking_habilitado,
  m.metrica,
  m.valor_bruto,
  m.numerador,
  m.denominador,
  m.nota,
  m.peso,
  m.peso_efetivo,
  m.contribuicao,
  m.amostra,
  m.estado_base,
  m.codigo_evidencia,
  m.papel,
  coalesce((m.detalhes ->> 'cobertura')::numeric, null) as cobertura_metrica,
  coalesce((m.detalhes ->> 'pessoas_canonicas_unicas')::numeric, null) as carteira,
  coalesce((m.detalhes ->> 'vinculos_em_revisao')::numeric, 0) as vinculos_revisao
from latest l
join alvos a on a.id = l.professor_id
left join public.unidades u on u.id = l.unidade_id
join public.health_score_professor_v3_snapshot_metricas m on m.snapshot_id = l.id
order by a.nome, l.competencia, unidade, m.metrica;
`;

function groupBySnapshot(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.professor}|${row.unidade}|${row.competencia}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function audit(rows) {
  const failures = [];
  const groups = groupBySnapshot(rows);

  if (rows.length === 0) failures.push('Nenhum snapshot encontrado para os casos nominais.');
  for (const professor of ['Matheus Lana da Silva', 'Valdo Delfino']) {
    if (!rows.some((row) => row.professor === professor)) {
      failures.push(`${professor}: professor ausente da auditoria.`);
    }
  }

  for (const [key, metrics] of groups) {
    const wallet = metrics.find((metric) => metric.metrica === 'numero_alunos');
    const walletEffectiveWeight = wallet?.peso_efetivo === null
      ? 0
      : Number(wallet?.peso_efetivo ?? Number.NaN);
    if (
      !wallet
      || wallet.papel !== 'diagnostico'
      || !Number.isFinite(walletEffectiveWeight)
      || Math.abs(walletEffectiveWeight) > 0.0001
      || wallet.contribuicao !== null
    ) {
      failures.push(`${key}: carteira ainda interfere na nota.`);
    }

    const score = metrics[0]?.score === null ? null : Number(metrics[0]?.score);
    if (score !== null) {
      const effectiveWeight = metrics
        .filter((metric) => metric.papel === 'nota' && metric.peso_efetivo !== null)
        .reduce((total, metric) => total + Number(metric.peso_efetivo), 0);
      if (Math.abs(effectiveWeight - 100) > 0.02) {
        failures.push(`${key}: pesos efetivos somam ${effectiveWeight.toFixed(2)}%, não 100%.`);
      }
    }

    const conversion = metrics.find((metric) => metric.metrica === 'conversao');
    if (conversion && Number(conversion.amostra ?? 0) < 3 && conversion.contribuicao !== null) {
      failures.push(`${key}: conversão pontuou com amostra inferior a 3.`);
    }

    const validWithoutCode = metrics.filter((metric) =>
      metric.papel === 'nota'
      && metric.nota !== null
      && (!metric.codigo_evidencia || metric.codigo_evidencia === 'sem_base'),
    );
    if (validWithoutCode.length > 0) {
      failures.push(`${key}: pilar válido ficou sem código de evidência explícito.`);
    }
  }

  const summaries = Array.from(groups, ([recorte, metrics]) => ({
    recorte,
    score: metrics[0]?.score === null ? null : Number(metrics[0]?.score),
    cobertura: metrics[0]?.cobertura === null ? null : Number(metrics[0]?.cobertura),
    estado: metrics[0]?.estado_publicacao,
    carteira: Number(metrics.find((metric) => metric.metrica === 'numero_alunos')?.valor_bruto ?? 0),
    pesos_efetivos: metrics
      .filter((metric) => metric.papel === 'nota' && metric.peso_efetivo !== null)
      .reduce((total, metric) => total + Number(metric.peso_efetivo), 0),
    pilares_pendentes: metrics
      .filter((metric) => metric.papel === 'nota' && metric.nota === null)
      .map((metric) => ({ metrica: metric.metrica, motivo: metric.codigo_evidencia })),
  }));

  return { approved: failures.length === 0, failures, summaries };
}

loadEnvFile('.env.branch');
loadEnvFile('.env.local');
loadEnvFile('.env');

const rows = await queryManagementApi(SQL);
const result = audit(rows);

process.stdout.write(`${JSON.stringify({
  consulta: 'somente_leitura',
  contexto_julho: 'recesso_parcial_com_reposicoes_na_ultima_semana',
  contexto_junho: 'mes_regular',
  ...result,
}, null, 2)}\n`);
process.stdout.write(`AUDITORIA_APROVADA=${result.approved}\n`);

if (!result.approved) process.exitCode = 1;
