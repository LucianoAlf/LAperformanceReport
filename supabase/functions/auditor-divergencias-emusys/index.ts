// supabase/functions/auditor-divergencias-emusys/index.ts
//
// Auditor periódico de divergências em webhooks Emusys.
// Varre tabelas leads/lead_experimentais/alunos com queries SQL idempotentes.
// Grava em automacao_log + automacao_invariantes.
//
// Disparo:
//   - pg_cron horário (trigger='cron')
//   - botão manual no frontend (trigger='manual', user_id=auth.uid())

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { gravarLog, type Invariante, type Severidade } from './_shared/invariantes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Trigger = 'cron' | 'manual';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

type Regra = {
  regra: string;
  severidade: Severidade;
  evento: string;
  acao: string;
  sql: string;
  construirMensagem: (row: Row) => string;
  construirIdempotencyKey: (row: Row) => string;
  construirLog: (row: Row) => {
    aluno_nome: string;
    aluno_id?: number | null;
    lead_id?: number | null;
    unidade_nome?: string | null;
  };
};

const REGRAS: Regra[] = [
  // ============================================================
  // LEADS (Task 6 - 5 regras)
  // ============================================================
  {
    regra: 'lead_sem_nome',
    severidade: 'critico',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      SELECT id, nome, telefone, unidade_id, created_at
      FROM leads
      WHERE (nome IS NULL OR trim(nome) = '')
        AND created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) => `lead_id=${row.id} sem nome (telefone=${row.telefone ?? 'NULL'})`,
    construirIdempotencyKey: (row) => `audit:lead_sem_nome:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      lead_id: row.id,
    }),
  },
  {
    regra: 'lead_sem_telefone',
    severidade: 'critico',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      SELECT id, nome, unidade_id, created_at
      FROM leads
      WHERE (telefone IS NULL OR trim(telefone) = '')
        AND created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) => `lead_id=${row.id} nome="${row.nome ?? '?'}" sem telefone`,
    construirIdempotencyKey: (row) => `audit:lead_sem_telefone:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      lead_id: row.id,
    }),
  },
  {
    regra: 'lead_telefone_invalido',
    severidade: 'aviso',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      SELECT id, nome, telefone, unidade_id
      FROM leads
      WHERE telefone IS NOT NULL
        AND length(regexp_replace(telefone, '[^0-9]', '', 'g')) NOT BETWEEN 10 AND 13
        AND created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) => `lead_id=${row.id} telefone="${row.telefone}" fora do range BR (10-13 dígitos)`,
    construirIdempotencyKey: (row) => `audit:lead_telefone_invalido:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      lead_id: row.id,
    }),
  },
  {
    regra: 'lead_sem_unidade',
    severidade: 'critico',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      SELECT id, nome, telefone, created_at
      FROM leads
      WHERE unidade_id IS NULL
        AND created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) => `lead_id=${row.id} nome="${row.nome ?? '?'}" sem unidade`,
    construirIdempotencyKey: (row) => `audit:lead_sem_unidade:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      lead_id: row.id,
    }),
  },
  {
    regra: 'lead_duplicado_mesmo_dia',
    severidade: 'aviso',
    evento: 'auditoria_lead',
    acao: 'divergencia_detectada',
    sql: `
      WITH dups AS (
        SELECT telefone, unidade_id, date_trunc('day', created_at) as dia,
               array_agg(id ORDER BY id) as ids,
               count(*) as qtd
        FROM leads
        WHERE telefone IS NOT NULL AND telefone <> ''
          AND created_at > now() - interval '14 days'
        GROUP BY telefone, unidade_id, date_trunc('day', created_at)
        HAVING count(*) > 1
      )
      SELECT (ids[1])::bigint as id, telefone, unidade_id, qtd, ids
      FROM dups
    `,
    construirMensagem: (row) => `telefone=${row.telefone} criado ${row.qtd}x no mesmo dia (ids=${JSON.stringify(row.ids)})`,
    construirIdempotencyKey: (row) => `audit:lead_duplicado_mesmo_dia:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: `(${row.qtd} duplicatas)`,
      lead_id: row.id,
    }),
  },

  // ============================================================
  // EXPERIMENTAIS (Task 7 - 5 regras)
  // Nota: experimental_realizada / faltou_experimental ficam em `leads`,
  // por isso fazemos JOIN com leads quando precisamos dessas flags.
  // professor_id na lead_experimentais chama-se professor_experimental_id.
  // ============================================================
  {
    regra: 'experimental_sem_professor',
    severidade: 'critico',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, l.telefone, le.unidade_id, le.data_experimental
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE le.professor_experimental_id IS NULL
        AND le.created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} lead="${row.lead_nome}" data=${row.data_experimental} sem professor`,
    construirIdempotencyKey: (row) => `audit:experimental_sem_professor:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
  {
    regra: 'experimental_data_passada',
    severidade: 'aviso',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, le.unidade_id, le.data_experimental
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE le.data_experimental < (current_date - interval '1 day')
        AND l.experimental_realizada IS NOT TRUE
        AND l.faltou_experimental IS NOT TRUE
        AND le.created_at > now() - interval '30 days'
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} data ${row.data_experimental} ja passou sem realizada/faltou`,
    construirIdempotencyKey: (row) => `audit:experimental_data_passada:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
  {
    regra: 'experimental_realizada_e_faltou',
    severidade: 'critico',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, le.unidade_id
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE l.experimental_realizada = true
        AND l.faltou_experimental = true
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} flags contraditorias (realizada=true E faltou=true)`,
    construirIdempotencyKey: (row) => `audit:experimental_realizada_e_faltou:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
  {
    regra: 'experimental_realizada_data_futura',
    severidade: 'critico',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, le.unidade_id, le.data_experimental
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE l.experimental_realizada = true
        AND le.data_experimental > current_date
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} marcada como realizada antes da data (data=${row.data_experimental})`,
    construirIdempotencyKey: (row) => `audit:experimental_realizada_data_futura:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },
  {
    regra: 'experimental_faltou_data_futura',
    severidade: 'critico',
    evento: 'auditoria_experimental',
    acao: 'divergencia_detectada',
    sql: `
      SELECT le.id, le.lead_id, l.nome as lead_nome, le.unidade_id, le.data_experimental
      FROM lead_experimentais le
      JOIN leads l ON l.id = le.lead_id
      WHERE l.faltou_experimental = true
        AND le.data_experimental > current_date
    `,
    construirMensagem: (row) =>
      `lead_experimental_id=${row.id} marcada como falta antes da data (data=${row.data_experimental})`,
    construirIdempotencyKey: (row) => `audit:experimental_faltou_data_futura:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.lead_nome ?? '(sem nome)',
      lead_id: row.lead_id,
    }),
  },

  // ============================================================
  // ALUNOS (Task 8 - 3 regras)
  // ============================================================
  {
    regra: 'matricula_sem_professor_no_banco',
    severidade: 'critico',
    evento: 'auditoria_alunos',
    acao: 'divergencia_detectada',
    sql: `
      SELECT a.id, a.nome, a.unidade_id, u.nome as unidade_nome, a.created_at
      FROM alunos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      WHERE a.professor_atual_id IS NULL
        AND a.status = 'ativo'
    `,
    construirMensagem: (row) =>
      `aluno_id=${row.id} nome="${row.nome}" ativo sem professor (unidade=${row.unidade_nome ?? '?'})`,
    construirIdempotencyKey: (row) => `audit:matricula_sem_professor_no_banco:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      aluno_id: row.id,
      unidade_nome: row.unidade_nome ?? null,
    }),
  },
  {
    regra: 'matricula_sem_curso_no_banco',
    severidade: 'critico',
    evento: 'auditoria_alunos',
    acao: 'divergencia_detectada',
    sql: `
      SELECT a.id, a.nome, a.unidade_id, u.nome as unidade_nome
      FROM alunos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      WHERE a.curso_id IS NULL
        AND a.status = 'ativo'
    `,
    construirMensagem: (row) =>
      `aluno_id=${row.id} nome="${row.nome}" ativo sem curso (unidade=${row.unidade_nome ?? '?'})`,
    construirIdempotencyKey: (row) => `audit:matricula_sem_curso_no_banco:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      aluno_id: row.id,
      unidade_nome: row.unidade_nome ?? null,
    }),
  },
  {
    regra: 'matricula_sem_lead_origem_no_banco',
    severidade: 'aviso',
    evento: 'auditoria_alunos',
    acao: 'divergencia_detectada',
    sql: `
      SELECT a.id, a.nome, a.telefone, a.unidade_id, u.nome as unidade_nome
      FROM alunos a
      LEFT JOIN unidades u ON u.id = a.unidade_id
      WHERE a.created_at > now() - interval '60 days'
        AND a.telefone IS NOT NULL AND a.telefone <> ''
        AND NOT EXISTS (
          SELECT 1 FROM leads l
          WHERE regexp_replace(coalesce(l.telefone,''), '[^0-9]', '', 'g')
              = regexp_replace(coalesce(a.telefone,''), '[^0-9]', '', 'g')
            AND l.unidade_id = a.unidade_id
        )
    `,
    construirMensagem: (row) =>
      `aluno_id=${row.id} nome="${row.nome}" telefone=${row.telefone} matricula direta (sem lead previo)`,
    construirIdempotencyKey: (row) => `audit:matricula_sem_lead_origem_no_banco:${row.id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      aluno_id: row.id,
      unidade_nome: row.unidade_nome ?? null,
    }),
  },
  // ============================================================
  // GRADE HORARIA — divergencia entre professor_atual_id do aluno
  // e o professor majoritario das aulas recentes (aulas_emusys).
  // Webhook do Emusys so atualiza professor_atual_id em matricula
  // nova/renovacao — troca no meio do contrato fica defasada ate
  // a proxima renovacao. Este invariante detecta esse gap.
  // Severidade: aviso (pode ser cobertura/substituicao legitima).
  // ============================================================
  {
    regra: 'professor_divergente_das_aulas',
    severidade: 'aviso',
    evento: 'auditoria_grade',
    acao: 'divergencia_detectada',
    sql: `
      WITH aulas_30d AS (
        SELECT ap.aluno_id, ap.professor_id, count(*) AS qtd
        FROM aluno_presenca ap
        JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
        WHERE ae.cancelada = false
          AND ae.data_hora_inicio > now() - interval '30 days'
          AND ap.aluno_id IS NOT NULL
          AND ap.professor_id IS NOT NULL
        GROUP BY ap.aluno_id, ap.professor_id
      ),
      top_prof AS (
        SELECT DISTINCT ON (aluno_id) aluno_id, professor_id AS prof_aulas, qtd
        FROM aulas_30d
        WHERE qtd >= 3
        ORDER BY aluno_id, qtd DESC, professor_id ASC
      )
      SELECT
        a.id, a.nome, a.unidade_id, u.nome AS unidade_nome,
        a.professor_atual_id AS prof_atual_id,
        pa.nome AS prof_atual_nome,
        tp.prof_aulas AS prof_aulas_id,
        pn.nome AS prof_aulas_nome,
        tp.qtd AS qtd_aulas_30d
      FROM alunos a
      JOIN top_prof tp ON tp.aluno_id = a.id
      LEFT JOIN professores pa ON pa.id = a.professor_atual_id
      LEFT JOIN professores pn ON pn.id = tp.prof_aulas
      LEFT JOIN unidades u ON u.id = a.unidade_id
      WHERE a.status = 'ativo'
        AND a.professor_atual_id IS DISTINCT FROM tp.prof_aulas
    `,
    construirMensagem: (row) =>
      `aluno_id=${row.id} nome="${row.nome}" cadastrado com prof="${row.prof_atual_nome ?? 'NULL'}" mas teve ${row.qtd_aulas_30d} aula(s) em 30d com prof="${row.prof_aulas_nome ?? '?'}"`,
    construirIdempotencyKey: (row) => `audit:professor_divergente_das_aulas:${row.id}:${row.prof_aulas_id}`,
    construirLog: (row) => ({
      aluno_nome: row.nome ?? '(sem nome)',
      aluno_id: row.id,
      unidade_nome: row.unidade_nome ?? null,
    }),
  },
];

serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: { trigger?: Trigger; user_id?: string | null } = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { /* body opcional */ }
  }
  const trigger: Trigger = body.trigger ?? 'cron';
  const user_id = body.user_id ?? null;

  const t0 = Date.now();
  let totalDetectado = 0;
  let totalNovo = 0;
  const erros: Array<{ regra: string; erro: string }> = [];

  for (const regra of REGRAS) {
    try {
      const { data: rows, error } = await supabase.rpc('executar_query_auditoria', {
        p_sql: regra.sql,
      });
      if (error) {
        erros.push({ regra: regra.regra, erro: error.message });
        continue;
      }
      const lista: Row[] = (rows as Row[]) ?? [];
      totalDetectado += lista.length;

      for (const row of lista) {
        const idempotency_key = regra.construirIdempotencyKey(row);
        const meta = regra.construirLog(row);
        const invariante: Invariante = {
          regra: regra.regra,
          severidade: regra.severidade,
          mensagem: regra.construirMensagem(row),
        };

        // Checagem manual de idempotência (antes de chamar gravarLog)
        const antes = await supabase
          .from('automacao_log')
          .select('id')
          .eq('idempotency_key', idempotency_key)
          .limit(1)
          .maybeSingle();
        if (antes.data) continue;

        await gravarLog(supabase, {
          evento: regra.evento,
          acao: regra.acao,
          aluno_nome: meta.aluno_nome,
          aluno_id: meta.aluno_id ?? undefined,
          lead_id: meta.lead_id ?? undefined,
          unidade_nome: meta.unidade_nome ?? undefined,
          payload_bruto: row,
          idempotency_key,
          invariantes: [invariante],
          detalhes: { trigger, user_id, audit_run_at: new Date().toISOString() },
        });
        totalNovo++;
      }
    } catch (e: any) {
      erros.push({ regra: regra.regra, erro: e?.message ?? String(e) });
    }
  }

  const duracao_ms = Date.now() - t0;

  return new Response(JSON.stringify({
    ok: true,
    trigger,
    duracao_ms,
    total_detectado: totalDetectado,
    novos: totalNovo,
    regras_com_erro: erros,
  }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
