-- ============================================================================
-- 2026-09-02 — situacao_alunos v1: fila de renovação + faturas + base delegada
-- ============================================================================
-- Brainstorm Alf 02/09/2026 — "quantos pagantes/banda/bolsistas/trancados?" NÃO
-- é reimplementado aqui: o resumo DELEGA para get_kpis_alunos_admin_operacional
-- (bloco `base`). O que é novo (fonte real, sem dono anterior):
--   - proxima_renovacao_em / vence_em_30d por pessoa (vw_renovacao_ciclos)
--   - ciclo: vencendo_30d / vencendo_60d
--   - faturas em aberto e vencidas (emusys_faturas, só mensalidade "^Parcela")
--   - renovacoes_pendentes_mes (movimentacoes_admin_vigentes, status não confirmado)
-- Drop+recreate da v1 porque RETURNS TABLE não aceita CREATE OR REPLACE com
-- coluna nova. A função nasceu hoje e ainda não tem consumidores — seguro.
-- ============================================================================

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
  fin as (
    select v.pessoa_chave,
           sum(coalesce(rc.faturas_vencidas_abertas, 0))::integer as faturas_vencidas_abertas
    from vivas v
    join vw_renovacao_ciclos rc on rc.aluno_id = v.id
    group by 1
  ),
  ciclo as (
    select v.pessoa_chave,
           bool_or(not rc.atividade_extra and not coalesce(rc.renovou, false)
                   and rc.sucedida_por is null
                   and coalesce(rc.nr_aulas_futuras, 0) = 0
                   and rc.data_ultima_aula::date <= p_referencia) as tem_ciclo_vencido,
           bool_or(not rc.atividade_extra and coalesce(rc.nr_aulas_futuras, 0) > 0)
             as tem_ciclo_em_aberto,
           -- fila de renovação: última parcela do ciclo vence no futuro e não renovou
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
  )
  select
    p.pessoa_chave,
    p.aluno_id_canonico,
    cd.aluno_ids_locais,
    cd.nome::text,
    p_unidade_id,
    cd.classificacao::text,
    p.status_operacional,
    p.matriculas_ativas::integer,
    coalesce(p.cursos, '{}'::text[]),
    coalesce(cd.anamnese_flag, false),
    an.anamnese_em,
    an.anamnese_tipo,
    (coalesce(cd.anamnese_flag, false) and an.pessoa_chave is null),
    coalesce(ot.orfa_id, on2.orfa_id),
    case when ot.orfa_id is not null then 'telefone'
         when on2.orfa_id is not null then 'nome' end,
    cd.tem_instagram,
    cd.instagram_nao_possui,
    cd.tem_telefone,
    cd.tem_responsavel,
    cd.tem_foto,
    cd.tem_data_contrato,
    coalesce(ci.tem_ciclo_vencido, false) and not coalesce(ci.tem_ciclo_em_aberto, false),
    (coalesce(array(
       select c.campo from cfg c
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
     ), '{}'::text[]) = '{}'::text[]) as cadastro_completo,
    array(
       select c.campo from cfg c
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
    f.presencas_confirmadas::integer,
    f.faltas_confirmadas::integer,
    f.faltas_provaveis::integer,
    f.chamadas_indeterminadas::integer,
    f.taxa_presenca_geral,
    f.confianca_presenca,
    f.regra_versao,
    ua.ultima_aula_em,
    case when ua.ultima_aula_em is not null
         then (p_referencia - ua.ultima_aula_em)::integer end,
    coalesce(fn.faturas_vencidas_abertas, 0) > 0,
    coalesce(fn.faturas_vencidas_abertas, 0),
    (av.pessoa_chave is not null),
    av.mes_saida,
    ci.proxima_renovacao_em,
    (ci.proxima_renovacao_em is not null
     and ci.proxima_renovacao_em <= p_referencia + 30) as vence_em_30d,
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
    (array(
       select c.campo from cfg c
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
     )
     || case when an.pessoa_chave is null then array['anamnese'] else '{}'::text[] end
     || case
          when gc.qtd_grupos > 0 and gc.ultima_captura >= now() - interval '2 days'
               and com.na_comunidade is not true
          then array['comunidade'] else '{}'::text[] end
    ) as pendencias,
    'vivo'::text as fonte,
    'situacao_alunos_v1'::text as regra_versao
  from pessoas p
  join cadastro cd on cd.pessoa_chave = p.pessoa_chave
  left join anam an on an.pessoa_chave = p.pessoa_chave
  left join orfa_telefone ot on ot.pessoa_chave = p.pessoa_chave
  left join orfa_nome on2 on on2.pessoa_chave = p.pessoa_chave
  left join ultima_aula ua on ua.pessoa_chave = p.pessoa_chave
  left join aviso av on av.pessoa_chave = p.pessoa_chave
  left join fin fn on fn.pessoa_chave = p.pessoa_chave
  left join ciclo ci on ci.pessoa_chave = p.pessoa_chave
  left join comunidade_pessoa com on com.pessoa_chave = p.pessoa_chave
  left join lateral get_frequencia_aluno_canonica_v1(p.aluno_id_canonico) f on true
  cross join grupos_captura gc
  where not p_apenas_pendentes
     or array_length(array(
          select c.campo from cfg c
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
        ), 1) is not null
     or an.pessoa_chave is null
     or (gc.qtd_grupos > 0 and gc.ultima_captura >= now() - interval '2 days'
         and com.na_comunidade is not true)
  order by cd.nome;
end;
$$;

grant execute on function get_situacao_alunos_v1(uuid, date, boolean)
  to authenticated, service_role, sol_acesso_restrito;

-- Resumo v2: mesmo agregado de antes + bloco `base` (DELEGADO, não reimplementado)
-- + bloco `ciclo` (fila de renovação) + faturas em aberto.
create or replace function get_situacao_alunos_resumo_v1(
  p_unidade_id uuid,
  p_referencia date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
stable
as $$
declare
  r record;
  v_totais jsonb;
  v_faturas record;
  v_renov_pendentes integer;
  v_comp date := date_trunc('month', p_referencia)::date;
begin
  select
    count(*) as total_pessoas,
    count(*) filter (where not (s.pendencias @> array['anamnese'])) as com_anamnese,
    count(*) filter (where s.pendencias @> array['anamnese']) as sem_anamnese,
    count(*) filter (where s.cadastro_faltando @> array['instagram']) as sem_instagram,
    count(*) filter (where s.cadastro_faltando @> array['telefone']) as sem_telefone,
    count(*) filter (where s.cadastro_faltando @> array['responsavel']) as sem_responsavel,
    count(*) filter (where s.cadastro_faltando @> array['data_inicio_contrato']) as sem_contrato,
    count(*) filter (where s.cadastro_faltando @> array['foto']) as sem_foto,
    count(*) filter (where s.cadastro_completo) as cadastro_completo,
    count(*) filter (where s.inadimplente) as inadimplentes,
    count(*) filter (where s.em_aviso_previo) as em_aviso_previo,
    count(*) filter (where s.contrato_vencido) as contrato_vencido,
    count(*) filter (where s.vence_em_30d) as vencendo_em_30d,
    count(*) filter (where s.proxima_renovacao_em is not null
                      and s.proxima_renovacao_em <= p_referencia + 60) as vencendo_em_60d,
    count(*) filter (where s.anamnese_flag_sem_registro) as anamnese_flag_sem_registro,
    count(*) filter (where s.anamnese_orfa_candidata_id is not null) as anamnese_orfa_candidata,
    count(*) filter (where s.comunidade_status = 'na_comunidade') as na_comunidade,
    count(*) filter (where s.comunidade_status = 'fora_da_comunidade') as fora_da_comunidade,
    count(*) filter (where s.comunidade_status = 'sem_grupo_configurado') as comunidade_sem_grupo,
    count(*) filter (where s.comunidade_status = 'sem_captura') as comunidade_sem_captura,
    count(*) filter (where s.comunidade_status = 'captura_desatualizada') as comunidade_desatualizada,
    max(s.comunidade_capturado_em) as comunidade_capturado_em,
    count(*) filter (where s.presenca_confianca is not null) as com_presenca_canonica,
    round(avg(s.presenca_taxa_geral) filter (where s.presenca_taxa_geral is not null) * 100, 1)
      as presenca_media_pct
  into r
  from get_situacao_alunos_v1(p_unidade_id, p_referencia, false) s;

  -- bloco base DELEGADO à RPC canônica de KPI (não duplicar regra de negócio)
  select payload->'totais' into v_totais
  from (select get_kpis_alunos_admin_operacional(
                 p_unidade_id,
                 extract(year from p_referencia)::int,
                 extract(month from p_referencia)::int
               ) as payload) t;

  -- faturas de mensalidade em aberto (mesma tabela vista pela vw_renovacao_ciclos)
  select
    count(*)::integer as em_aberto,
    count(*) filter (where f.data_vencimento < p_referencia)::integer as vencidas
  into v_faturas
  from emusys_faturas f
  where f.unidade_id = p_unidade_id
    and f.status = 'aberta'
    and f.descricao ~ '^Parcela';

  -- renovações lançadas na competência vigente ainda não confirmadas
  select count(*)::integer into v_renov_pendentes
  from movimentacoes_admin_vigentes m
  where m.unidade_id = p_unidade_id
    and m.tipo = 'renovacao'
    and coalesce(m.renovacao_status, '') not in ('confirmada', 'antecipada_confirmada')
    and coalesce(date_trunc('month', m.competencia_referencia)::date,
                 date_trunc('month', m.data)::date) = v_comp;

  return jsonb_build_object(
    'unidade_id', p_unidade_id,
    'referencia', p_referencia,
    'medido_em', now(),
    'fonte', 'vivo',
    'regra_versao', 'situacao_alunos_v1',
    'total_pessoas', r.total_pessoas,
    'completude_pct', case when r.total_pessoas > 0
        then round(r.cadastro_completo::numeric / r.total_pessoas * 100, 1) end,
    'base', jsonb_build_object(
      'fonte', 'get_kpis_alunos_admin_operacional',
      'alunos_ativos', v_totais->'alunos_ativos',
      'alunos_pagantes', v_totais->'alunos_pagantes',
      'bolsistas_integrais', v_totais->'bolsistas_integrais',
      'bolsistas_parciais', v_totais->'bolsistas_parciais',
      'alunos_trancados', v_totais->'alunos_trancados',
      'matriculas_banda', v_totais->'matriculas_banda',
      'matriculas_ativas', v_totais->'matriculas_ativas',
      'novas_matriculas', v_totais->'novas_matriculas'
    ),
    'ciclo', jsonb_build_object(
      'vencendo_em_30d', r.vencendo_em_30d,
      'vencendo_em_60d', r.vencendo_em_60d,
      'contrato_vencido', r.contrato_vencido,
      'renovacoes_pendentes_mes', v_renov_pendentes
    ),
    'faturas', jsonb_build_object(
      'em_aberto', v_faturas.em_aberto,
      'vencidas', v_faturas.vencidas,
      'escopo', 'mensalidade (descricao ^Parcela), status aberta'
    ),
    'pendentes', jsonb_build_object(
      'anamnese', r.sem_anamnese,
      'instagram', r.sem_instagram,
      'telefone', r.sem_telefone,
      'responsavel', r.sem_responsavel,
      'data_inicio_contrato', r.sem_contrato,
      'foto', r.sem_foto
    ),
    'com_anamnese', r.com_anamnese,
    'anamnese_flag_sem_registro', r.anamnese_flag_sem_registro,
    'anamnese_orfa_candidata', r.anamnese_orfa_candidata,
    'sinais', jsonb_build_object(
      'inadimplentes', r.inadimplentes,
      'em_aviso_previo', r.em_aviso_previo,
      'presenca_media_pct', r.presenca_media_pct,
      'com_presenca_canonica', r.com_presenca_canonica
    ),
    'comunidade', jsonb_build_object(
      'na_comunidade', r.na_comunidade,
      'fora_da_comunidade', r.fora_da_comunidade,
      'sem_grupo_configurado', r.comunidade_sem_grupo,
      'sem_captura', r.comunidade_sem_captura,
      'captura_desatualizada', r.comunidade_desatualizada,
      'capturado_em', r.comunidade_capturado_em
    )
  );
end;
$$;
