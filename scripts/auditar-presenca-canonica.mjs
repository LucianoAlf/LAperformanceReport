import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const UNIDADES_PERMITIDAS = ['Barra', 'Recreio', 'Campo Grande'];
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT_REAL = fs.realpathSync.native(REPO_ROOT);
const SYNC_COMPLETO_MOTIVOS_PERMITIDOS = new Set([
  'sem_ledger_por_unidade_data_no_v1',
]);
const CAMPOS_CONTAGEM = [
  'aulas_reais',
  'eventos_presente',
  'eventos_falta',
  'eventos_indeterminados',
  'conflitos',
  'rosters_ambiguos',
  'pendencias_agenda',
  'pendencias_relatorio',
  'duplicidade_emusys',
  'colisao_curso',
  'precedencia_humana',
  'politica_temporal',
  'sem_explicacao',
];

export function buildShadowClassificationCase(alias = 'j') {
  if (!/^[a-z_][a-z0-9_]*$/iu.test(alias)) throw new Error('ALIAS_SQL_INVALIDO');
  return `case
    when not ${alias}.difere then null
    when ${alias}.duplicidade_emusys then 'duplicidade_emusys'
    when ${alias}.colisao_curso then 'colisao_curso'
    when ${alias}.precedencia_humana then 'precedencia_humana'
    when ${alias}.politica_temporal then 'politica_temporal'
    else 'sem_explicacao'
  end`;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/gu, '');
  }
}

function dataBrt(offsetDias = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const base = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDias);
  return base.toISOString().slice(0, 10);
}

function validarDataIso(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(valor ?? '')) throw new Error(`DATA_ISO_INVALIDA:${valor ?? ''}`);
  const data = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new Error(`DATA_ISO_INVALIDA:${valor}`);
  }
  return valor;
}

function validarUnidades(unidades) {
  const unicas = [...new Set(unidades.map((item) => item.trim()).filter(Boolean))];
  if (unicas.length === 0) throw new Error('UNIDADE_NAO_PERMITIDA:vazia');
  for (const unidade of unicas) {
    if (!UNIDADES_PERMITIDAS.includes(unidade)) throw new Error(`UNIDADE_NAO_PERMITIDA:${unidade}`);
  }
  return unicas;
}

export function parseAuditArgs(args) {
  const parsed = {
    inicio: dataBrt(-30),
    fim: dataBrt(-1),
    unidades: [...UNIDADES_PERMITIDAS],
    output: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--inicio') {
      parsed.inicio = validarDataIso(value);
      index += 1;
    } else if (arg === '--fim') {
      parsed.fim = validarDataIso(value);
      index += 1;
    } else if (arg === '--unidades') {
      parsed.unidades = validarUnidades((value ?? '').split(','));
      index += 1;
    } else if (arg === '--output') {
      if (!value) throw new Error('OUTPUT_AUSENTE');
      parsed.output = value;
      index += 1;
    } else {
      throw new Error(`ARGUMENTO_DESCONHECIDO:${arg}`);
    }
  }

  validarDataIso(parsed.inicio);
  validarDataIso(parsed.fim);
  if (parsed.inicio > parsed.fim) throw new Error('PERIODO_INVALIDO:inicio_maior_que_fim');
  parsed.unidades = validarUnidades(parsed.unidades);
  return parsed;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function assertReadOnlySql(sql) {
  const semComentarios = sql
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/--.*$/gmu, ' ');
  const comandosMutantes = /\b(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|copy|call|do)\b/iu;
  if (!/^\s*(with|select)\b/iu.test(semComentarios) || comandosMutantes.test(semComentarios)) {
    throw new Error('SQL_NAO_READ_ONLY');
  }
  return sql;
}

export function buildAuditSql({ inicio, fim, unidades }) {
  validarDataIso(inicio);
  validarDataIso(fim);
  if (inicio > fim) throw new Error('PERIODO_INVALIDO:inicio_maior_que_fim');
  const unidadesValidas = validarUnidades(unidades);
  const unidadesSql = unidadesValidas.map(sqlLiteral).join(', ');

  const sql = String.raw`
with parametros as (
  select date ${sqlLiteral(inicio)} as inicio,
         date ${sqlLiteral(fim)} as fim
), unidades_alvo as (
  select u.id, u.nome
    from public.unidades u
   where u.nome = any(array[${unidadesSql}]::text[])
), dias as (
  select u.id as unidade_id,
         u.nome as unidade,
         gs::date as data
    from unidades_alvo u
   cross join parametros p
   cross join lateral generate_series(p.inicio, p.fim, interval '1 day') gs
), aulas_slots as (
  select ae.unidade_id,
         ae.data_aula as data,
         md5(concat_ws('|',
           ae.unidade_id::text,
           coalesce(ae.professor_id::text, ''),
           ae.data_hora_inicio::text,
           ae.data_hora_fim::text,
           regexp_replace(lower(unaccent(coalesce(ae.curso_nome, ''))), '[^a-z0-9]+', '', 'g')
         )) as slot_id
    from public.aulas_emusys ae
    join unidades_alvo u on u.id = ae.unidade_id
   cross join parametros p
   where ae.data_aula between p.inicio and p.fim
     and not coalesce(ae.cancelada, false)
     and ae.professor_id is not null
   group by ae.unidade_id, ae.data_aula, slot_id
), aulas_contagem as (
  select unidade_id, data, count(*)::bigint as aulas_reais
    from aulas_slots
   group by unidade_id, data
), presenca_contagem as (
  select ps.unidade_id,
         ps.data_aula as data,
         count(*) filter (
           where ps.chamada_fechada and ps.presenca_afirmada = 'presente'
         )::bigint as eventos_presente,
         count(*) filter (
           where ps.chamada_fechada
             and ps.presenca_afirmada in ('falta', 'falta_justificada')
         )::bigint as eventos_falta,
         count(*) filter (
           where not ps.exclui_por_evento and not ps.chamada_fechada
         )::bigint as eventos_indeterminados,
         count(*) filter (
           where ps.possui_conflito or ps.tem_divergencia
         )::bigint as conflitos
    from public.vw_presenca_slot_canonica_v1 ps
    join unidades_alvo u on u.id = ps.unidade_id
   cross join parametros p
   where ps.data_aula between p.inicio and p.fim
   group by ps.unidade_id, ps.data_aula
), v1_shadow_base as (
  select
    public.fn_presenca_slot_key_v2(
      ps.aluno_id, ps.unidade_id, ps.professor_id,
      ps.data_hora_inicio, ps.data_hora_fim, ps.curso_nome
    ) as slot_key,
    md5(jsonb_build_array(
      ps.aluno_id, ps.unidade_id::text, ps.professor_id,
      extract(epoch from ps.data_hora_inicio)::numeric,
      extract(epoch from ps.data_hora_fim)::numeric
    )::text) as slot_sem_curso_key,
    ps.unidade_id,
    ps.data_aula as data,
    lower(btrim(coalesce(ps.curso_nome, ''))) as curso_normalizado,
    case
      when ps.resultado_pedagogico in ('aula_cancelada', 'aula_justificada')
        then ps.resultado_pedagogico
      when ps.chamada_fechada then coalesce(
        ps.presenca_afirmada,
        case when ps.resultado_pedagogico = 'presente' then 'presente'
             when ps.resultado_pedagogico = 'falta_confirmada' then 'falta'
             else 'indeterminado' end
      )
      else 'indeterminado'
    end as resultado_canonico,
    ps.chamada_fechada as fecha_chamada,
    ps.respondido_por::text as fonte_decisao,
    ps.respondido_em as decidido_em,
    ps.estado_emusys_bruto as emusys_presenca_bruta,
    coalesce(ps.possui_conflito, false) or coalesce(ps.tem_divergencia, false)
      as possui_conflito,
    coalesce(ps.slot_geminado_no_emusys, false) as slot_geminado_no_emusys,
    ps.aluno_presenca_id
  from public.vw_presenca_slot_canonica_v1 ps
  join unidades_alvo u on u.id = ps.unidade_id
  cross join parametros p
  where ps.data_aula between p.inicio and p.fim
), v1_shadow_rank as (
  select v1.*,
         row_number() over (
           partition by v1.slot_key
           order by v1.fecha_chamada desc,
                    public.fn_presenca_e_forte(v1.fonte_decisao) desc,
                    v1.decidido_em asc nulls last,
                    v1.aluno_presenca_id
         ) as posicao
  from v1_shadow_base v1
), v1_shadow as (
  select * from v1_shadow_rank where posicao = 1
), v1_shadow_meta as (
  select slot_key,
         count(*)::integer as qtd_linhas,
         bool_or(slot_geminado_no_emusys) as slot_geminado_no_emusys
  from v1_shadow_base
  group by slot_key
), v2_shadow as (
  select
    v2.slot_key,
    md5(jsonb_build_array(
      v2.aluno_id, v2.unidade_id::text, v2.professor_id,
      extract(epoch from v2.data_hora_inicio)::numeric,
      extract(epoch from v2.data_hora_fim)::numeric
    )::text) as slot_sem_curso_key,
    v2.unidade_id,
    v2.data_aula as data,
    lower(btrim(coalesce(v2.curso_nome, ''))) as curso_normalizado,
    v2.resultado_canonico,
    v2.fecha_chamada,
    v2.fonte_decisao,
    v2.decidido_em,
    v2.emusys_presenca_bruta,
    v2.possui_conflito,
    v2.ids_aulas_emusys
  from public.vw_presenca_ocorrencia_canonica_v2 v2
  join unidades_alvo u on u.id = v2.unidade_id
  cross join parametros p
  where v2.data_aula between p.inicio and p.fim
), cursos_por_slot as (
  select slot_sem_curso_key,
         count(distinct curso_normalizado)::integer as qtd_cursos
  from (
    select slot_sem_curso_key, curso_normalizado from v1_shadow_base
    union
    select slot_sem_curso_key, curso_normalizado from v2_shadow
  ) cursos
  group by slot_sem_curso_key
), shadow_join as (
  select
    coalesce(v2.unidade_id, v1.unidade_id) as unidade_id,
    coalesce(v2.data, v1.data) as data,
    coalesce(v2.slot_key, v1.slot_key) as slot_key,
    v1.resultado_canonico as resultado_v1,
    v2.resultado_canonico as resultado_v2,
    v1.fecha_chamada as fecha_v1,
    v2.fecha_chamada as fecha_v2,
    v1.possui_conflito as conflito_v1,
    v2.possui_conflito as conflito_v2,
    v1.fonte_decisao as fonte_v1,
    v2.fonte_decisao as fonte_v2,
    (
      v1.slot_key is null or v2.slot_key is null
      or v1.resultado_canonico is distinct from v2.resultado_canonico
      or v1.fecha_chamada is distinct from v2.fecha_chamada
      or v1.possui_conflito is distinct from v2.possui_conflito
    ) as difere,
    (
      (
        coalesce(meta.qtd_linhas, 0) > 1
        or coalesce(meta.slot_geminado_no_emusys, false)
        or coalesce(cardinality(v2.ids_aulas_emusys), 0) > 1
      )
      and v1.slot_key is not null
      and v2.slot_key is not null
      and v1.resultado_canonico is not distinct from v2.resultado_canonico
      and v1.fecha_chamada is not distinct from v2.fecha_chamada
      and v1.possui_conflito is distinct from v2.possui_conflito
    ) as duplicidade_emusys,
    (
      coalesce(cursos.qtd_cursos, 0) > 1
      and (v1.slot_key is null or v2.slot_key is null)
    ) as colisao_curso,
    (
      (
        v1.slot_key is not null
        and v2.slot_key is not null
        and coalesce(v1.fonte_decisao, '') not in (
          'agenda_secretaria', 'manual', 'professor_la_teacher',
          'fabio_audio', 'professor_whatsapp'
        )
        and coalesce(v2.fonte_decisao, '') in (
          'agenda_secretaria', 'manual', 'professor_la_teacher',
          'fabio_audio', 'professor_whatsapp'
        )
        and v2.resultado_canonico in ('presente', 'falta', 'falta_justificada')
        and v2.fecha_chamada
        and (
          v1.resultado_canonico is distinct from v2.resultado_canonico
          or v1.fecha_chamada is distinct from v2.fecha_chamada
        )
      )
      or (
        v1.slot_key is not null
        and v2.slot_key is not null
        and v1.fonte_decisao = v2.fonte_decisao
        and v2.fonte_decisao in (
          'agenda_secretaria', 'manual', 'professor_la_teacher',
          'fabio_audio', 'professor_whatsapp'
        )
        and v1.resultado_canonico is not distinct from v2.resultado_canonico
        and v1.fecha_chamada is not distinct from v2.fecha_chamada
        and not coalesce(v1.possui_conflito, false)
        and coalesce(v2.possui_conflito, false)
        and (
          (v2.resultado_canonico = 'presente' and v2.emusys_presenca_bruta = 'ausente')
          or (
            v2.resultado_canonico in ('falta', 'falta_justificada')
            and v2.emusys_presenca_bruta = 'presente'
          )
        )
      )
    ) as precedencia_humana,
    (
      v1.slot_key is not null
      and v2.slot_key is not null
      and v2.fonte_decisao = 'emusys_politica_temporal'
      and v2.resultado_canonico = 'falta'
      and not v2.fecha_chamada
      and v1.resultado_canonico = 'indeterminado'
      and not v1.fecha_chamada
    ) as politica_temporal
  from v1_shadow v1
  full join v2_shadow v2 using (slot_key)
  left join v1_shadow_meta meta on meta.slot_key = coalesce(v1.slot_key, v2.slot_key)
  left join cursos_por_slot cursos
    on cursos.slot_sem_curso_key = coalesce(v1.slot_sem_curso_key, v2.slot_sem_curso_key)
), shadow_classificado as (
  select j.*, ${buildShadowClassificationCase('j')} as classificacao
  from shadow_join j
), shadow_contagem as (
  select unidade_id, data,
         count(*) filter (where classificacao = 'duplicidade_emusys')::bigint as duplicidade_emusys,
         count(*) filter (where classificacao = 'colisao_curso')::bigint as colisao_curso,
         count(*) filter (where classificacao = 'precedencia_humana')::bigint as precedencia_humana,
         count(*) filter (where classificacao = 'politica_temporal')::bigint as politica_temporal,
         count(*) filter (where classificacao = 'sem_explicacao')::bigint as sem_explicacao
  from shadow_classificado
  group by unidade_id, data
), roster_identidades as (
  select ae.unidade_id,
         ae.data_aula as data,
         md5(concat_ws('|',
           ae.unidade_id::text,
           coalesce(ae.professor_id::text, ''),
           ae.data_hora_inicio::text,
           ae.data_hora_fim::text,
           regexp_replace(lower(unaccent(coalesce(ae.curso_nome, ''))), '[^a-z0-9]+', '', 'g')
         )) as slot_id,
         coalesce(aae.aluno_chave, 'roster:' || aae.id::text) as participante_chave,
         count(distinct aae.aluno_id) as ids_locais,
         bool_or(aae.aluno_id is null) as sem_aluno_local
    from public.aulas_emusys ae
    join public.aula_alunos_emusys aae
      on aae.unidade_id = ae.unidade_id
     and aae.aula_emusys_id = ae.id
    join unidades_alvo u on u.id = ae.unidade_id
   cross join parametros p
   where ae.data_aula between p.inicio and p.fim
     and ae.categoria = 'normal'
     and not coalesce(ae.cancelada, false)
   group by ae.unidade_id, ae.data_aula, slot_id,
            coalesce(aae.aluno_chave, 'roster:' || aae.id::text)
), roster_contagem as (
  select unidade_id,
         data,
         count(*) filter (where sem_aluno_local or ids_locais <> 1)::bigint as rosters_ambiguos
    from roster_identidades
   group by unidade_id, data
), agenda_contagem as (
  select d.unidade_id,
         d.data,
         count(*)::bigint as pendencias_agenda
    from dias d
   cross join lateral public.get_agenda_dia(d.data, d.unidade_id) g
   cross join lateral jsonb_array_elements(coalesce(g.alunos, '[]'::jsonb)) aluno
   where not coalesce(g.cancelada, false)
     and (
       d.data < (now() at time zone 'America/Sao_Paulo')::date
       or (
         d.data = (now() at time zone 'America/Sao_Paulo')::date
         and g.hora_fim::time <= (now() at time zone 'America/Sao_Paulo')::time
       )
     )
     and nullif(aluno ->> 'aluno_id', '') is not null
     and not (
       aluno ->> 'status_presenca' = 'presente'
       or aluno ->> 'status_presenca' = 'falta_justificada'
       or (
         aluno ->> 'status_presenca' = 'falta'
         and aluno ->> 'respondido_por' = any(array[
           'professor_la_teacher', 'professor_whatsapp', 'manual',
           'fabio_audio', 'agenda_secretaria'
         ]::text[])
       )
     )
   group by d.unidade_id, d.data
), relatorio_contagem as (
  select d.unidade_id,
         d.data,
         count(p.*)::bigint as pendencias_relatorio
    from dias d
   left join lateral public.fn_presenca_pendencias_do_dia(d.unidade_id, d.data) p
     on true
   group by d.unidade_id, d.data
), medidas as (
  select d.unidade,
         d.data,
         false as sync_completo,
         'sem_ledger_por_unidade_data_no_v1'::text as sync_completo_motivo,
         coalesce(a.aulas_reais, 0)::bigint as aulas_reais,
         coalesce(pc.eventos_presente, 0)::bigint as eventos_presente,
         coalesce(pc.eventos_falta, 0)::bigint as eventos_falta,
         coalesce(pc.eventos_indeterminados, 0)::bigint as eventos_indeterminados,
         coalesce(pc.conflitos, 0)::bigint as conflitos,
         coalesce(rc.rosters_ambiguos, 0)::bigint as rosters_ambiguos,
         coalesce(ac.pendencias_agenda, 0)::bigint as pendencias_agenda,
         coalesce(rel.pendencias_relatorio, 0)::bigint as pendencias_relatorio,
         coalesce(sc.duplicidade_emusys, 0)::bigint as duplicidade_emusys,
         coalesce(sc.colisao_curso, 0)::bigint as colisao_curso,
         coalesce(sc.precedencia_humana, 0)::bigint as precedencia_humana,
         coalesce(sc.politica_temporal, 0)::bigint as politica_temporal,
         coalesce(sc.sem_explicacao, 0)::bigint as sem_explicacao
    from dias d
    left join aulas_contagem a using (unidade_id, data)
    left join presenca_contagem pc using (unidade_id, data)
    left join roster_contagem rc using (unidade_id, data)
    left join agenda_contagem ac using (unidade_id, data)
    left join relatorio_contagem rel using (unidade_id, data)
    left join shadow_contagem sc using (unidade_id, data)
)
select m.*,
       md5(concat_ws('|',
         m.unidade, m.data::text, m.sync_completo::text,
         m.aulas_reais::text, m.eventos_presente::text,
         m.eventos_falta::text, m.eventos_indeterminados::text,
         m.conflitos::text, m.rosters_ambiguos::text,
         m.pendencias_agenda::text, m.pendencias_relatorio::text,
         m.duplicidade_emusys::text, m.colisao_curso::text,
         m.precedencia_humana::text, m.politica_temporal::text,
         m.sem_explicacao::text
       )) as recorte_hash
  from medidas m
 order by m.data, m.unidade;
`;

  return assertReadOnlySql(sql);
}

export function normalizeAuditRows(rows) {
  if (!Array.isArray(rows)) throw new Error('RESPOSTA_NAO_E_LISTA');
  return rows.map((row) => {
    if (!UNIDADES_PERMITIDAS.includes(row.unidade)) throw new Error(`UNIDADE_INESPERADA:${row.unidade}`);
    validarDataIso(row.data);
    if (typeof row.sync_completo !== 'boolean') throw new Error('SYNC_COMPLETO_INVALIDO');
    if (!/^[a-f0-9]{32}$/u.test(row.recorte_hash ?? '')) throw new Error('HASH_INVALIDO');
    const syncCompletoMotivo = String(row.sync_completo_motivo ?? '');
    if (!SYNC_COMPLETO_MOTIVOS_PERMITIDOS.has(syncCompletoMotivo)) {
      throw new Error('SYNC_COMPLETO_MOTIVO_INVALIDO');
    }

    const normalized = {
      unidade: row.unidade,
      data: row.data,
      sync_completo: row.sync_completo,
      sync_completo_motivo: syncCompletoMotivo,
    };
    for (const campo of CAMPOS_CONTAGEM) {
      const numero = Number(row[campo]);
      if (!Number.isSafeInteger(numero) || numero < 0) throw new Error(`CONTAGEM_INVALIDA:${campo}`);
      normalized[campo] = numero;
    }
    normalized.recorte_hash = row.recorte_hash;
    return normalized;
  });
}

function datasDoPeriodo(inicio, fim) {
  const datas = [];
  const atual = new Date(`${validarDataIso(inicio)}T00:00:00Z`);
  const limite = new Date(`${validarDataIso(fim)}T00:00:00Z`);
  while (atual <= limite) {
    datas.push(atual.toISOString().slice(0, 10));
    atual.setUTCDate(atual.getUTCDate() + 1);
  }
  return datas;
}

export function validateAuditCoverage(rows, { inicio, fim, unidades }) {
  if (!Array.isArray(rows)) throw new Error('RESPOSTA_NAO_E_LISTA');
  const unidadesValidas = validarUnidades(unidades);
  const datasEsperadas = datasDoPeriodo(inicio, fim);
  const esperados = new Set(
    unidadesValidas.flatMap((unidade) => datasEsperadas.map((data) => `${unidade}|${data}`)),
  );
  const encontrados = new Set();

  for (const row of rows) {
    if (!unidadesValidas.includes(row.unidade)) throw new Error(`RECORTE_FORA_DAS_UNIDADES:${row.unidade}`);
    if (row.data < inicio || row.data > fim) throw new Error(`RECORTE_FORA_DO_PERIODO:${row.data}`);
    const chave = `${row.unidade}|${row.data}`;
    if (encontrados.has(chave)) throw new Error(`RECORTE_DUPLICADO:${chave}`);
    encontrados.add(chave);
  }

  const ausentes = [...esperados].filter((chave) => !encontrados.has(chave));
  if (ausentes.length > 0 || encontrados.size !== esperados.size) {
    throw new Error(`COBERTURA_INCOMPLETA:${ausentes.length}`);
  }
  return rows;
}

export function decodeRowsBase64(value) {
  try {
    const rows = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    if (!Array.isArray(rows)) throw new Error('not-an-array');
    return rows;
  } catch {
    throw new Error('ROWS_BASE64_INVALIDO');
  }
}

export function decodeRowsJson(value) {
  try {
    const rows = JSON.parse(value);
    if (!Array.isArray(rows)) throw new Error('not-an-array');
    return rows;
  } catch {
    throw new Error('ROWS_JSON_INVALIDO');
  }
}

export function decodeRowsGzipBase64(value) {
  try {
    return decodeRowsJson(zlib.gunzipSync(Buffer.from(value, 'base64')).toString('utf8'));
  } catch {
    throw new Error('ROWS_GZIP_BASE64_INVALIDO');
  }
}

async function lerStdin() {
  let conteudo = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    conteudo += chunk;
    const fimDaLinha = conteudo.indexOf('\n');
    if (fimDaLinha >= 0) return conteudo.slice(0, fimDaLinha);
  }
  return conteudo;
}

function resolverDestinoCanonico(destino) {
  const partesAusentes = [path.basename(destino)];
  let ancestral = path.dirname(destino);

  while (!fs.existsSync(ancestral)) {
    const pai = path.dirname(ancestral);
    if (pai === ancestral) break;
    partesAusentes.unshift(path.basename(ancestral));
    ancestral = pai;
  }

  return path.resolve(fs.realpathSync.native(ancestral), ...partesAusentes);
}

function estaDentroDaRaiz(raiz, destino) {
  const relativo = path.relative(raiz, destino);
  return relativo === ''
    || (!path.isAbsolute(relativo) && relativo !== '..' && !relativo.startsWith(`..${path.sep}`));
}

function escreverResultadoForaDoRepo(output, json) {
  const destino = path.resolve(output);
  const destinoCanonico = resolverDestinoCanonico(destino);
  // --output grava deliberadamente fora da raiz real deste repositorio; o
  // arquivo novo usa wx para impedir sobrescrita e preservar o contrato.
  if (estaDentroDaRaiz(REPO_ROOT_REAL, destinoCanonico)) {
    throw new Error('OUTPUT_DEVE_FICAR_FORA_DO_REPO');
  }
  if (fs.existsSync(destino)) throw new Error('OUTPUT_JA_EXISTE');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, `${json}\n`, { encoding: 'utf8', flag: 'wx' });
  return destino;
}

async function main() {
  loadEnvFile('.env.branch');
  loadEnvFile('.env.local');
  loadEnvFile('.env');

  const args = parseAuditArgs(process.argv.slice(2));
  const sql = buildAuditSql(args);
  if (process.env.AUDIT_PRINT_SQL === '1') {
    process.stdout.write(sql);
    return;
  }

  // O endpoint legado /database/query da Management API foi removido. A
  // consulta deve ser executada por um transporte SQL autorizado (MCP/psql),
  // e somente as linhas agregadas retornam ao script por esta fronteira.
  let rowsBrutas;
  if (process.env.AUDIT_ROWS_GZIP_BASE64) {
    rowsBrutas = decodeRowsGzipBase64(process.env.AUDIT_ROWS_GZIP_BASE64);
  } else if (process.env.AUDIT_ROWS_STDIN === '1') {
    rowsBrutas = decodeRowsJson(await lerStdin());
  } else if (process.env.AUDIT_ROWS_BASE64) {
    rowsBrutas = decodeRowsBase64(process.env.AUDIT_ROWS_BASE64);
  } else {
    throw new Error(
      'AUDIT_TRANSPORTE_AUSENTE: use AUDIT_PRINT_SQL=1 e AUDIT_ROWS_GZIP_BASE64/AUDIT_ROWS_STDIN/AUDIT_ROWS_BASE64',
    );
  }
  const rows = validateAuditCoverage(normalizeAuditRows(rowsBrutas), args);
  const resultado = {
    meta: {
      consulta: 'somente_leitura',
      pii_no_output: true,
      fonte: 'baseline_v1_antes_da_projecao_canonica_v2',
      inicio: args.inicio,
      fim: args.fim,
      unidades: args.unidades,
      gerado_em: new Date().toISOString(),
      sql_sha256: crypto.createHash('sha256').update(sql).digest('hex'),
    },
    recortes: rows,
  };
  const json = JSON.stringify(resultado, null, 2);
  if (args.output) {
    const destino = escreverResultadoForaDoRepo(args.output, json);
    process.stdout.write(`${JSON.stringify({ ok: true, destino, recortes: rows.length })}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
