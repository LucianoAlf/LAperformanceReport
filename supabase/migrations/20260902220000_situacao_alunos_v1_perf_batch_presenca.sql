-- ============================================================================
-- 2026-09-02 — PERF: presença canônica em LOTE (batch) + RPC otimizada
-- ============================================================================
-- Medido (EXPLAIN ANALYZE, CG = pior caso, 399 pessoas):
--   RPC inteira:        6,9–12,4s (timeout internmitente no PostgREST ~8s)
--   sem presença:       29ms  ← TODOS os outros blocos juntos
--   399× get_frequencia_aluno_canonica_v1 (lateral): 6,7s  ← o driver
-- Causa: a canônica por pessoa roda um EXISTS correlacionado por linha de
-- aluno_presenca (~24k linhas em CG) + resolve identidade a cada chamada.
--
-- Solução: `get_frequencia_unidade_canonica_batch_v1` — MESMA regra
-- (regra_versao segue 'frequencia-aluno-canonica-v1'), mas set-based:
-- identidade da unidade em 1 scan; "evento tem alguém presente" pré-agregado
-- por aula em vez de EXISTS por linha. Validação de equivalência no aceite.
--
-- Também na RPC: fin+ciclo fundidos num único scan de vw_renovacao_ciclos e
-- cadastro_faltando computado 1× por linha (era 3× subconsultas correlacionadas).
-- Contrato e números NÃO mudam.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Frequência canônica em lote por unidade (mesma regra da v1)
-- ---------------------------------------------------------------------------
create or replace function get_frequencia_unidade_canonica_batch_v1(p_unidade_id uuid)
returns table (
  unidade_id uuid,
  pessoa_chave text,
  aluno_id_canonico integer,
  aluno_ids_locais integer[],
  identidade_confianca text,
  total_eventos_evidencia integer,
  eventos_resultado_confirmado integer,
  presencas_confirmadas integer,
  faltas_confirmadas integer,
  faltas_provaveis integer,
  chamadas_indeterminadas integer,
  eventos_excluidos integer,
  conflitos integer,
  taxa_presenca_geral numeric,
  cobertura_resultado_confirmado numeric,
  confianca_presenca text,
  regra_versao text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
WITH identidade AS MATERIALIZED (
  SELECT
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_confianca
  FROM public.vw_aluno_identidade_unidade_canonica i
  WHERE i.unidade_id = p_unidade_id
),
-- batch: "tem alguém presente na aula" agregado UMA vez por aula
-- (na v1 por pessoa é um EXISTS por linha — o que matou a performance)
aula_tem_presente AS MATERIALIZED (
  SELECT ap2.aula_emusys_id, BOOL_OR(ap2.status = 'presente') AS tem_presente
  FROM public.aluno_presenca ap2
  WHERE ap2.unidade_id = p_unidade_id
    AND ap2.aula_emusys_id IS NOT NULL
  GROUP BY 1
),
linhas AS MATERIALIZED (
  SELECT
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_confianca,
    CASE
      WHEN ap.aula_emusys_id IS NOT NULL THEN 'aula:' || ap.aula_emusys_id::text
      ELSE concat_ws(
        ':',
        'fallback',
        ap.data_aula::text,
        ap.horario_aula::text,
        COALESCE(ap.professor_id::text, 'sem-professor'),
        COALESCE(lower(btrim(ap.curso_nome)), 'sem-curso')
      )
    END AS evento_chave,
    ap.status,
    ap.respondido_por,
    COALESCE(NULLIF(lower(ap.emusys_presenca_bruta), ''), lower(ap.status))
      AS estado_emusys_bruto,
    COALESCE(ae.cancelada, false) AS aula_cancelada,
    COALESCE(ae.justificada, false) AS aula_justificada,
    lower(NULLIF(ae.professor_presenca, '')) AS professor_presenca_emusys,
    CASE
      WHEN ap.aula_emusys_id IS NULL THEN ap.status = 'presente'
      ELSE COALESCE(atp.tem_presente, false)
    END AS evento_tem_aluno_presente
  FROM identidade i
  JOIN public.aluno_presenca ap
    ON ap.unidade_id = i.unidade_id
   AND ap.aluno_id = ANY(i.aluno_ids_locais)
  LEFT JOIN public.aulas_emusys ae ON ae.id = ap.aula_emusys_id
  LEFT JOIN aula_tem_presente atp ON atp.aula_emusys_id = ap.aula_emusys_id
  WHERE ap.data_aula <= CURRENT_DATE
),
eventos AS (
  SELECT
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_confianca,
    l.evento_chave,
    BOOL_OR(l.aula_cancelada) AS tem_cancelamento,
    BOOL_OR(l.aula_justificada) AS tem_justificativa,
    BOOL_OR(l.status = 'presente') AS tem_presenca,
    BOOL_OR(
      l.status = 'ausente'
      AND l.respondido_por IN ('professor_la_teacher', 'manual')
    ) AS tem_falta_confirmada,
    BOOL_OR(
      l.estado_emusys_bruto = 'ausente'
      AND l.respondido_por IN ('emusys', 'sistema')
      AND (
        l.evento_tem_aluno_presente
        OR l.professor_presenca_emusys = 'presente'
      )
    ) AS tem_falta_provavel,
    BOOL_OR(
      l.estado_emusys_bruto = 'ausente'
      AND l.respondido_por IN ('emusys', 'sistema')
    ) AS tem_ausencia_automatica
  FROM linhas l
  GROUP BY
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_confianca,
    l.evento_chave
),
classificados AS (
  SELECT
    e.*,
    CASE
      WHEN e.tem_cancelamento THEN 'aula_cancelada'
      WHEN e.tem_justificativa THEN 'aula_justificada'
      WHEN e.tem_presenca THEN 'presente'
      WHEN e.tem_falta_confirmada THEN 'falta_confirmada'
      WHEN e.tem_falta_provavel THEN 'falta_provavel'
      WHEN e.tem_ausencia_automatica THEN 'indeterminado'
      ELSE 'indeterminado'
    END AS resultado_evento,
    (
      e.tem_presenca
      AND (
        e.tem_falta_confirmada
        OR e.tem_falta_provavel
        OR e.tem_cancelamento
        OR e.tem_justificativa
      )
    ) AS possui_conflito
  FROM eventos e
),
agregado AS (
  SELECT
    c.unidade_id,
    c.pessoa_chave,
    c.aluno_id_canonico,
    c.aluno_ids_locais,
    c.identidade_confianca,
    COUNT(*)::integer AS total_eventos_evidencia,
    COUNT(*) FILTER (
      WHERE c.resultado_evento IN ('presente', 'falta_confirmada')
    )::integer AS eventos_resultado_confirmado,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'presente')::integer
      AS presencas_confirmadas,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'falta_confirmada')::integer
      AS faltas_confirmadas,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'falta_provavel')::integer
      AS faltas_provaveis,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'indeterminado')::integer
      AS chamadas_indeterminadas,
    COUNT(*) FILTER (
      WHERE c.resultado_evento IN ('aula_cancelada', 'aula_justificada')
    )::integer AS eventos_excluidos,
    COUNT(*) FILTER (WHERE c.possui_conflito)::integer AS conflitos
  FROM classificados c
  GROUP BY
    c.unidade_id,
    c.pessoa_chave,
    c.aluno_id_canonico,
    c.aluno_ids_locais,
    c.identidade_confianca
)
SELECT
  a.unidade_id,
  a.pessoa_chave,
  a.aluno_id_canonico,
  a.aluno_ids_locais,
  a.identidade_confianca,
  a.total_eventos_evidencia,
  a.eventos_resultado_confirmado,
  a.presencas_confirmadas,
  a.faltas_confirmadas,
  a.faltas_provaveis,
  a.chamadas_indeterminadas,
  a.eventos_excluidos,
  a.conflitos,
  CASE
    WHEN a.eventos_resultado_confirmado > 0 THEN ROUND(
      a.presencas_confirmadas::numeric / a.eventos_resultado_confirmado,
      6
    )
    ELSE NULL::numeric
  END AS taxa_presenca_geral,
  CASE
    WHEN (
      a.eventos_resultado_confirmado
      + a.faltas_provaveis
      + a.chamadas_indeterminadas
    ) > 0 THEN ROUND(
      a.eventos_resultado_confirmado::numeric
      / (
        a.eventos_resultado_confirmado
        + a.faltas_provaveis
        + a.chamadas_indeterminadas
      ),
      6
    )
    ELSE 0::numeric
  END AS cobertura_resultado_confirmado,
  CASE
    WHEN a.identidade_confianca = 'baixa' OR a.conflitos > 0 THEN 'baixa'
    WHEN a.eventos_resultado_confirmado = 0 THEN 'sem_base'
    WHEN a.faltas_provaveis + a.chamadas_indeterminadas = 0
      AND a.eventos_resultado_confirmado >= 4 THEN 'alta'
    WHEN a.eventos_resultado_confirmado >= 4
      AND a.eventos_resultado_confirmado::numeric
        / NULLIF(
          a.eventos_resultado_confirmado
          + a.faltas_provaveis
          + a.chamadas_indeterminadas,
          0
        ) >= 0.8 THEN 'media'
    ELSE 'baixa'
  END AS confianca_presenca,
  'frequencia-aluno-canonica-v1'::text AS regra_versao
FROM agregado a;
$$;

comment on function get_frequencia_unidade_canonica_batch_v1(uuid) is
  'MESMA regra de get_frequencia_aluno_canonica_v1, set-based por unidade. '
  'Criada em 02/09/2026 após perfilar get_situacao_alunos_v1: a chamada por pessoa '
  '(~17ms × N) dominava 95% do tempo da RPC. regra_versao permanece a canônica.';

revoke all on function get_frequencia_unidade_canonica_batch_v1(uuid) from public, anon;
grant execute on function get_frequencia_unidade_canonica_batch_v1(uuid)
  to authenticated, service_role, sol_acesso_restrito;

-- ---------------------------------------------------------------------------
-- 2. get_situacao_alunos_v1 otimizada (mesmo contrato, mesmos números)
--    - presença: 1 chamada batch por unidade + hash join (era 1 lateral por pessoa)
--    - fin+ciclo: um único scan de vw_renovacao_ciclos
--    - cadastro_faltando: 1 lateral por linha (era 3 subconsultas correlacionadas)
-- ---------------------------------------------------------------------------
drop function if exists get_situacao_alunos_v1(uuid, date, boolean);

create function get_situacao_alunos_v1(
  p_unidade_id       uuid,
  p_referencia       date    default current_date,
  p_apenas_pendentes boolean default false
)
returns table (
  pessoa_chave              text,
  aluno_id_canonico         integer,
  aluno_ids_locais          integer[],
  nome                      text,
  unidade_id                uuid,
  classificacao             text,
  status_operacional        text,
  matriculas_ativas         integer,
  cursos                    text[],
  anamnese_preenchida       boolean,
  anamnese_em               date,
  anamnese_tipo             text,
  anamnese_flag_sem_registro boolean,
  anamnese_orfa_candidata_id integer,
  anamnese_orfa_match       text,
  tem_instagram             boolean,
  instagram_nao_possui      boolean,
  tem_telefone              boolean,
  tem_responsavel           boolean,
  tem_foto                  boolean,
  tem_data_contrato         boolean,
  contrato_vencido          boolean,
  cadastro_completo         boolean,
  cadastro_faltando         text[],
  presenca_confirmadas      integer,
  faltas_confirmadas        integer,
  faltas_provaveis          integer,
  chamadas_indeterminadas   integer,
  presenca_taxa_geral       numeric,
  presenca_confianca        text,
  presenca_regra_versao     text,
  ultima_aula_em            date,
  dias_desde_ultima_aula    integer,
  inadimplente              boolean,
  faturas_vencidas_abertas  integer,
  em_aviso_previo           boolean,
  aviso_previo_mes_saida    date,
  proxima_renovacao_em      date,
  vence_em_30d              boolean,
  na_comunidade_wa          boolean,
  comunidade_status         text,
  comunidade_capturado_em   timestamptz,
  pendencias                text[],
  fonte                     text,
  regra_versao              text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
stable
as $$
#variable_conflict use_column
declare
  v_autorizado boolean := false;
begin
  if current_user in ('service_role', 'sol_acesso_restrito', 'postgres')
     or coalesce(auth.role(), '') = 'service_role' then
    v_autorizado := true;
  else
    begin
      v_autorizado := coalesce(fn_usuario_atual_tem_permissao('alunos.ver', p_unidade_id), false);
    exception when others then
      v_autorizado := false;
    end;
  end if;

  if not v_autorizado then
    raise exception 'papel nao autorizado para consultar situacao de alunos'
      using errcode = '42501';
  end if;

  return query
  with base as (
    select eo.aluno_id, eo.status_operacional, pc.pessoa_chave,
           a.is_segundo_curso, c.nome as curso_nome
    from vw_alunos_estado_operacional_v131 eo
    join alunos a on a.id = eo.aluno_id and a.arquivado_em is null
    join vw_aluno_pessoa_chave pc on pc.aluno_id = eo.aluno_id
    left join cursos c on c.id = a.curso_id
    where eo.entra_base_ativa = true
      and a.unidade_id = p_unidade_id
  ),
  pessoas as (
    select b.pessoa_chave,
           count(*) as matriculas_ativas,
           array_agg(distinct b.curso_nome::text order by b.curso_nome::text)
             filter (where b.curso_nome is not null) as cursos,
           coalesce(min(b.aluno_id) filter (where not b.is_segundo_curso),
                    min(b.aluno_id)) as aluno_id_canonico,
           (array_agg(b.status_operacional order by b.is_segundo_curso, b.aluno_id))[1]
             as status_operacional
    from base b
    group by 1
  ),
  vivas as (
    select a.id, pc.pessoa_chave, a.nome, a.nome_normalizado, a.classificacao,
           a.idade_atual, a.instagram, a.instagram_nao_possui, a.whatsapp,
           a.telefone, a.responsavel_nome, a.responsavel_telefone,
           a.foto_url, a.photo_url, a.data_inicio_contrato, a.anamnese_preenchida
    from alunos a
    join vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
    where a.unidade_id = p_unidade_id
      and a.arquivado_em is null
      and pc.pessoa_chave in (select pessoa_chave from pessoas)
  ),
  contatos as (
    select v.pessoa_chave, ac.telefone
    from vivas v
    join aluno_contatos ac on ac.aluno_id = v.id
    where nullif(btrim(coalesce(ac.telefone, '')), '') is not null
  ),
  telefones_pessoa as (
    select distinct pessoa_chave, fn_normalizar_telefone_br_key(fone) as telefone_key
    from (
      select pessoa_chave, whatsapp as fone from vivas
      union select pessoa_chave, telefone from vivas
      union select pessoa_chave, responsavel_telefone from vivas
      union select pessoa_chave, telefone as fone from contatos
    ) t
    where fn_normalizar_telefone_br_key(fone) is not null
  ),
  cadastro as (
    select v.pessoa_chave,
           array_agg(distinct v.id order by v.id) as aluno_ids_locais,
           (array_agg(v.nome order by v.classificacao is null, v.id))[1] as nome,
           (array_agg(v.classificacao order by v.classificacao is null, v.id))[1]
             as classificacao,
           bool_or(nullif(btrim(coalesce(v.instagram, '')), '') is not null) as tem_instagram,
           bool_or(coalesce(v.instagram_nao_possui, false)) as instagram_nao_possui,
           bool_or(
             nullif(btrim(coalesce(v.whatsapp, '')), '') is not null
             or nullif(btrim(coalesce(v.telefone, '')), '') is not null
             or nullif(btrim(coalesce(v.responsavel_telefone, '')), '') is not null
           ) or exists (select 1 from contatos ct where ct.pessoa_chave = v.pessoa_chave)
             as tem_telefone,
           bool_or(nullif(btrim(coalesce(v.responsavel_nome, '')), '') is not null)
             as tem_responsavel,
           bool_or(coalesce(nullif(btrim(coalesce(v.foto_url, '')), ''),
                            nullif(btrim(coalesce(v.photo_url, '')), '')) is not null)
             as tem_foto,
           bool_or(v.data_inicio_contrato is not null) as tem_data_contrato,
           bool_or(coalesce(v.anamnese_preenchida, false)) as anamnese_flag
    from vivas v
    group by 1
  ),
  anam as (
    select a.pessoa_chave,
           max(a.created_at)::date as anamnese_em,
           (array_agg(a.tipo_formulario::text order by a.created_at desc))[1] as anamnese_tipo
    from anamneses a
    where a.unidade_id = p_unidade_id
      and a.status = 'completa'
      and a.pessoa_chave is not null
    group by 1
  ),
  orfas as (
    select a.id, a.nome_aluno,
           fn_normalizar_telefone_br_key(a.telefone_aluno) as telefone_key
    from anamneses a
    where a.unidade_id = p_unidade_id
      and a.status = 'completa'
      and a.vinculo_status = 'pendente'
      and a.aluno_id is null
  ),
  orfa_telefone as (
    select tp.pessoa_chave, min(o.id) as orfa_id
    from telefones_pessoa tp
    join orfas o on o.telefone_key = tp.telefone_key
    group by 1
  ),
  orfa_nome as (
    select v.pessoa_chave, min(o.id) as orfa_id
    from vivas v
    join orfas o
      on o.telefone_key is null
      and upper(btrim(o.nome_aluno)) = upper(btrim(v.nome))
    group by 1
  ),
  ultima_aula as (
    select v.pessoa_chave, max(ae.data_aula) as ultima_aula_em
    from vivas v
    join aula_alunos_emusys aa on aa.aluno_id = v.id
    join aulas_emusys ae
      on ae.id = aa.aula_emusys_id
      and ae.data_aula <= p_referencia
      and coalesce(ae.cancelada, false) = false
    group by 1
  ),
  aviso as (
    select v.pessoa_chave, min(m.mes_saida) as mes_saida
    from vivas v
    join movimentacoes_admin_vigentes m on m.aluno_id = v.id
    where m.tipo = 'aviso_previo'
      and m.mes_saida >= date_trunc('month', p_referencia)::date
      and m.mes_saida < (date_trunc('month', p_referencia)::date + interval '2 months')
    group by 1
  ),
  ciclofin as (
    -- um único scan de vw_renovacao_ciclos serve financeiro E ciclo contratual
    select v.pessoa_chave,
           sum(coalesce(rc.faturas_vencidas_abertas, 0))::integer as faturas_vencidas_abertas,
           bool_or(not rc.atividade_extra and not coalesce(rc.renovou, false)
                   and rc.sucedida_por is null
                   and coalesce(rc.nr_aulas_futuras, 0) = 0
                   and rc.data_ultima_aula::date <= p_referencia) as tem_ciclo_vencido,
           bool_or(not rc.atividade_extra and coalesce(rc.nr_aulas_futuras, 0) > 0)
             as tem_ciclo_em_aberto,
           min(rc.venc_ultima_fatura) filter (
             where not rc.atividade_extra
               and not coalesce(rc.renovou, false)
               and rc.venc_ultima_fatura is not null
               and rc.venc_ultima_fatura >= p_referencia
           ) as proxima_renovacao_em
    from vivas v
    join vw_renovacao_ciclos rc on rc.aluno_id = v.id
    group by 1
  ),
  cfg as (
    select campo, aplica_classificacao
    from config_cadastro_obrigatorio
    where unidade_id = p_unidade_id and obrigatorio
  ),
  grupos_captura as (
    select max(p.capturado_em) as ultima_captura,
           count(*) filter (where g.id is not null) as qtd_grupos
    from comunidade_wa_grupos g
    left join comunidade_wa_participantes p on p.grupo_id = g.id
    where g.unidade_id = p_unidade_id and g.ativo
  ),
  comunidade_pessoa as (
    select tp.pessoa_chave, true as na_comunidade
    from telefones_pessoa tp
    where exists (
      select 1
      from comunidade_wa_participantes cp
      join comunidade_wa_grupos g on g.id = cp.grupo_id
      where g.unidade_id = p_unidade_id
        and g.ativo
        and cp.telefone_key = tp.telefone_key
    )
    group by 1
  ),
  -- presença em lote: mesma regra canônica v1, computada 1 vez para a unidade
  freq as (
    select f.pessoa_chave as fk_pessoa_chave,
           f.presencas_confirmadas, f.faltas_confirmadas, f.faltas_provaveis,
           f.chamadas_indeterminadas, f.taxa_presenca_geral,
           f.confianca_presenca, f.regra_versao as freq_regra_versao
    from get_frequencia_unidade_canonica_batch_v1(p_unidade_id) f
  ),
  montagem as (
    select
      p.pessoa_chave,
      p.aluno_id_canonico,
      cd.aluno_ids_locais,
      cd.nome::text as nome,
      p_unidade_id as unidade_id,
      cd.classificacao::text as classificacao,
      p.status_operacional,
      p.matriculas_ativas::integer as matriculas_ativas,
      coalesce(p.cursos, '{}'::text[]) as cursos,
      coalesce(cd.anamnese_flag, false) as anamnese_preenchida,
      an.anamnese_em,
      an.anamnese_tipo,
      (coalesce(cd.anamnese_flag, false) and an.pessoa_chave is null) as anamnese_flag_sem_registro,
      coalesce(ot.orfa_id, on2.orfa_id) as anamnese_orfa_candidata_id,
      case when ot.orfa_id is not null then 'telefone'
           when on2.orfa_id is not null then 'nome' end as anamnese_orfa_match,
      cd.tem_instagram,
      cd.instagram_nao_possui,
      cd.tem_telefone,
      cd.tem_responsavel,
      cd.tem_foto,
      cd.tem_data_contrato,
      coalesce(cf.tem_ciclo_vencido, false) and not coalesce(cf.tem_ciclo_em_aberto, false) as contrato_vencido,
      fq.presencas_confirmadas::integer as presenca_confirmadas,
      fq.faltas_confirmadas::integer as faltas_confirmadas,
      fq.faltas_provaveis::integer as faltas_provaveis,
      fq.chamadas_indeterminadas::integer as chamadas_indeterminadas,
      fq.taxa_presenca_geral as presenca_taxa_geral,
      fq.confianca_presenca as presenca_confianca,
      fq.freq_regra_versao as presenca_regra_versao,
      ua.ultima_aula_em,
      case when ua.ultima_aula_em is not null
           then (p_referencia - ua.ultima_aula_em)::integer end as dias_desde_ultima_aula,
      coalesce(cf.faturas_vencidas_abertas, 0) > 0 as inadimplente,
      coalesce(cf.faturas_vencidas_abertas, 0) as faturas_vencidas_abertas,
      (av.pessoa_chave is not null) as em_aviso_previo,
      av.mes_saida as aviso_previo_mes_saida,
      cf.proxima_renovacao_em,
      (cf.proxima_renovacao_em is not null
       and cf.proxima_renovacao_em <= p_referencia + 30) as vence_em_30d,
      case
        when gc.qtd_grupos = 0 or gc.qtd_grupos is null then null
        when gc.ultima_captura is null then null
        when gc.ultima_captura < now() - interval '2 days' then null
        else coalesce(com.na_comunidade, false)
      end as na_comunidade_wa,
      case
        when gc.qtd_grupos = 0 or gc.qtd_grupos is null then 'sem_grupo_configurado'
        when gc.ultima_captura is null then 'sem_captura'
        when gc.ultima_captura < now() - interval '2 days' then 'captura_desatualizada'
        when com.na_comunidade then 'na_comunidade'
        else 'fora_da_comunidade'
      end as comunidade_status,
      gc.ultima_captura as comunidade_capturado_em,
      -- régua de completude: 1 lateral por linha (era 3 subconsultas repetidas)
      (select coalesce(array_agg(c.campo), '{}'::text[])
       from cfg c
       where (c.aplica_classificacao = 'todas'
              or c.aplica_classificacao = cd.classificacao)
         and case c.campo
               when 'instagram' then not cd.tem_instagram and not cd.instagram_nao_possui
               when 'telefone' then not cd.tem_telefone
               when 'responsavel' then not cd.tem_responsavel
               when 'data_inicio_contrato' then not cd.tem_data_contrato
               when 'foto' then not cd.tem_foto
               else false
             end
      ) as cadastro_faltando,
      gc.qtd_grupos > 0 and gc.ultima_captura >= now() - interval '2 days'
        and com.na_comunidade is not true as pendente_comunidade
    from pessoas p
    join cadastro cd on cd.pessoa_chave = p.pessoa_chave
    left join anam an on an.pessoa_chave = p.pessoa_chave
    left join orfa_telefone ot on ot.pessoa_chave = p.pessoa_chave
    left join orfa_nome on2 on on2.pessoa_chave = p.pessoa_chave
    left join ultima_aula ua on ua.pessoa_chave = p.pessoa_chave
    left join aviso av on av.pessoa_chave = p.pessoa_chave
    left join ciclofin cf on cf.pessoa_chave = p.pessoa_chave
    left join comunidade_pessoa com on com.pessoa_chave = p.pessoa_chave
    left join freq fq on fq.fk_pessoa_chave = p.pessoa_chave
    cross join grupos_captura gc
  )
  select
    m.pessoa_chave,
    m.aluno_id_canonico,
    m.aluno_ids_locais,
    m.nome,
    m.unidade_id,
    m.classificacao,
    m.status_operacional,
    m.matriculas_ativas,
    m.cursos,
    m.anamnese_preenchida,
    m.anamnese_em,
    m.anamnese_tipo,
    m.anamnese_flag_sem_registro,
    m.anamnese_orfa_candidata_id,
    m.anamnese_orfa_match,
    m.tem_instagram,
    m.instagram_nao_possui,
    m.tem_telefone,
    m.tem_responsavel,
    m.tem_foto,
    m.tem_data_contrato,
    m.contrato_vencido,
    (m.cadastro_faltando = '{}'::text[]) as cadastro_completo,
    m.cadastro_faltando,
    m.presenca_confirmadas,
    m.faltas_confirmadas,
    m.faltas_provaveis,
    m.chamadas_indeterminadas,
    m.presenca_taxa_geral,
    m.presenca_confianca,
    m.presenca_regra_versao,
    m.ultima_aula_em,
    m.dias_desde_ultima_aula,
    m.inadimplente,
    m.faturas_vencidas_abertas,
    m.em_aviso_previo,
    m.aviso_previo_mes_saida,
    m.proxima_renovacao_em,
    m.vence_em_30d,
    m.na_comunidade_wa,
    m.comunidade_status,
    m.comunidade_capturado_em,
    (m.cadastro_faltando
     || case when m.anamnese_em is null then array['anamnese'] else '{}'::text[] end
     || case when m.pendente_comunidade then array['comunidade'] else '{}'::text[] end
    ) as pendencias,
    'vivo'::text as fonte,
    'situacao_alunos_v1'::text as regra_versao
  from montagem m
  where not p_apenas_pendentes
     or m.cadastro_faltando <> '{}'::text[]
     or m.anamnese_em is null
     or m.pendente_comunidade
  order by m.nome;
end;
$$;

grant execute on function get_situacao_alunos_v1(uuid, date, boolean)
  to authenticated, service_role, sol_acesso_restrito;
