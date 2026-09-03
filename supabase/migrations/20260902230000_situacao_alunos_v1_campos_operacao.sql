-- ============================================================================
-- 2026-09-02 — situacao_alunos v1: recorte por período + responsável + professor
-- ============================================================================
-- Pedidos do uso real pelo TOM (primeira noite no ar, 02/09):
--   - Fabíola (Sucesso do Aluno): recorte por período ("dos matriculados em
--     agosto, quantos estão sem foto?") → data_matricula na linha, sem parâmetro
--     novo; o filtro por período é do consumidor.
--     As DUAS leituras de "aluno de agosto" saem juntas:
--       entrou_em            = min(data_matricula) — quando virou aluno da escola
--       matricula_recente_em = max(data_matricula) — matrícula mais nova (2º curso conta)
--   - Alf: a lista "fora da comunidade" precisa dizer COM QUEM falar — criança
--     não entra em grupo de WhatsApp. → responsavel_nome (principal de
--     aluno_contatos, fallback alunos.responsavel_nome; NULL honesto).
--     Sem telefone do responsável: decisão LGPD do Alf (o nome basta).
--   - professores[] / aulas_resumo[] por pessoa — "fala com o professor da Alice"
--     sem abrir outra RPC. Custam ~zero (vem de alunos/cursos/professores).
--
-- Aceite acordado (criterioso de propósito):
--   1. Performance NÃO pode piorar o ~1s atual do CG — medido pelo PostgREST
--      com service_role (o caminho do TOM), não por psql.
--   2. Grants provados DEPOIS do drop+recreate chamando pelo PostgREST.
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
  entrou_em                 date,
  matricula_recente_em      date,
  responsavel_nome          text,
  professores               text[],
  aulas_resumo              text[],
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
           a.is_segundo_curso, a.dia_aula, a.horario_aula,
           c.nome as curso_nome, pr.nome as professor_nome
    from vw_alunos_estado_operacional_v131 eo
    join alunos a on a.id = eo.aluno_id and a.arquivado_em is null
    join vw_aluno_pessoa_chave pc on pc.aluno_id = eo.aluno_id
    left join cursos c on c.id = a.curso_id
    left join professores pr on pr.id = a.professor_atual_id
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
             as status_operacional,
           array_agg(distinct b.professor_nome::text order by b.professor_nome::text)
             filter (where b.professor_nome is not null) as professores,
           array_agg(distinct (
             b.curso_nome::text
             || case when nullif(trim(concat_ws(' ', b.dia_aula,
                     to_char(b.horario_aula, 'HH24:MI'))), '') is not null
                     then ' — ' || trim(concat_ws(' ', b.dia_aula,
                          to_char(b.horario_aula, 'HH24:MI')))
                     else '' end
           ) order by
             b.curso_nome::text
             || case when nullif(trim(concat_ws(' ', b.dia_aula,
                     to_char(b.horario_aula, 'HH24:MI'))), '') is not null
                     then ' — ' || trim(concat_ws(' ', b.dia_aula,
                          to_char(b.horario_aula, 'HH24:MI')))
                     else '' end
           ) filter (where b.curso_nome is not null) as aulas_resumo
    from base b
    group by 1
  ),
  vivas as (
    select a.id, pc.pessoa_chave, a.nome, a.nome_normalizado, a.classificacao,
           a.idade_atual, a.instagram, a.instagram_nao_possui, a.whatsapp,
           a.telefone, a.responsavel_nome, a.responsavel_telefone,
           a.foto_url, a.photo_url, a.data_inicio_contrato, a.anamnese_preenchida,
           a.data_matricula
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
  contato_principal as (
    -- com quem falar: o contato marcado como principal primeiro
    select distinct on (v.pessoa_chave) v.pessoa_chave, ac.nome::text as nome
    from vivas v
    join aluno_contatos ac on ac.aluno_id = v.id
      and nullif(btrim(coalesce(ac.nome, '')), '') is not null
    order by v.pessoa_chave, ac.principal desc nulls last, ac.id
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
           min(v.data_matricula) as entrou_em,
           max(v.data_matricula) as matricula_recente_em,
           max(v.responsavel_nome::text) filter (
             where nullif(btrim(coalesce(v.responsavel_nome, '')), '') is not null
           ) as responsavel_nome_vivas,
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
      cd.entrou_em,
      cd.matricula_recente_em,
      coalesce(cpp.nome, cd.responsavel_nome_vivas) as responsavel_nome,
      coalesce(p.professores, '{}'::text[]) as professores,
      coalesce(p.aulas_resumo, '{}'::text[]) as aulas_resumo,
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
    left join contato_principal cpp on cpp.pessoa_chave = p.pessoa_chave
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
    m.entrou_em,
    m.matricula_recente_em,
    m.responsavel_nome,
    m.professores,
    m.aulas_resumo,
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

-- drop+recreate APAGA os privilégios — repor é parte da migration, não do aceite
grant execute on function get_situacao_alunos_v1(uuid, date, boolean)
  to authenticated, service_role, sol_acesso_restrito;
