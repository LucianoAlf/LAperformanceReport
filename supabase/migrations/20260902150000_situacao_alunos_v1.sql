-- ============================================================================
-- 2026-09-02 — RPC canônica de situação do aluno (por PESSOA) + comunidade WA
-- ============================================================================
-- Origem: brainstorm Alf + auditoria de 02/09/2026 (docs/auditorias).
-- Decisões travadas nesta migration:
--   1. Grão = PESSOA (vw_aluno_pessoa_chave), nunca linha de matrícula.
--   2. Completude de cadastro agrega TODAS as matrículas vivas da pessoa
--      (banda/2º curso inclusos) — aceite Recreio = 82 sem contrato.
--   3. Inadimplência aqui = "tem fatura vencida em aberto" (vw_renovacao_ciclos
--      / emusys_faturas), NÃO a get_inadimplencia_canonica — a canônica exige
--      role authenticated/service_role com JWT e negaria uso via sol_acesso_restrito.
--   4. Risco de evasão fica FORA da v1 (modelo roda esporádico — número velho é ruído).
--   5. Comunidade WA: sem captura fresca, a RPC devolve NULL/sem_captura.
--      Dizer "está fora do grupo" sem ter olhado o grupo é pior que não responder.
-- Prova de aceite (Recreio, 02/09/2026): 336 pessoas · 414 matrículas base ·
--   91 com anamnese · 278 sem Instagram · 82 sem data_inicio_contrato ·
--   3 sem telefone · 2 anamneses órfãs (registros de teste).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalização de telefone BR (regra do 9º dígito)
--    Chave = DDD + 8 dígitos do celular. Casa 21999998888 com 2188889999→não;
--    casa 5521999998888 com 21999998888 com 999998888 (faltando DDD não).
-- ---------------------------------------------------------------------------
create or replace function fn_normalizar_telefone_br_key(p_telefone text)
returns text
language sql
immutable
parallel safe
as $$
  with d as (
    select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') as fone
  ),
  -- remove sufixo de JID e DDI 55
  nat as (
    select case
             when fone like '55%' and length(fone) between 12 and 13
               then substr(fone, 3)
             else fone
           end as fone
    from d
  ),
  -- remove o 9º dígito do celular (11 dígitos começando DDD + 9)
  sem9 as (
    select case
             when length(fone) = 11 and substr(fone, 3, 1) = '9'
               then substr(fone, 1, 2) || substr(fone, 4)
             else fone
           end as fone
    from nat
  )
  select case when length(fone) = 10 then fone else null end
  from sem9;
$$;

-- ---------------------------------------------------------------------------
-- 2. Comunidade WhatsApp — grupos + participantes (alimentado pela edge
--    sincronizar-comunidade-whatsapp via UAZAPI /group/info)
-- ---------------------------------------------------------------------------
create table if not exists comunidade_wa_grupos (
  id          bigint generated always as identity primary key,
  unidade_id  uuid not null references unidades(id),
  jid         text not null unique,          -- JID do grupo/anúncio da comunidade
  nome        text not null,
  caixa_id    integer references whatsapp_caixas(id),  -- caixa membro do grupo
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists comunidade_wa_participantes (
  id                 bigint generated always as identity primary key,
  grupo_id           bigint not null references comunidade_wa_grupos(id) on delete cascade,
  telefone_key       text not null,          -- fn_normalizar_telefone_br_key
  telefone_original  text,                   -- como veio do WhatsApp (auditoria)
  capturado_em       timestamptz not null default now(),
  unique (grupo_id, telefone_key)
);

create index if not exists idx_comunidade_wa_part_key
  on comunidade_wa_participantes (telefone_key);

alter table comunidade_wa_grupos enable row level security;
alter table comunidade_wa_participantes enable row level security;
-- Sem policies: leitura só via RPC (SECURITY DEFINER) e escrita só via service_role.

comment on table comunidade_wa_grupos is
  'Grupos/comunidades de WhatsApp por unidade, lidos pela edge sincronizar-comunidade-whatsapp (POST /group/info UAZAPI).';
comment on table comunidade_wa_participantes is
  'Foto mais recente dos participantes de cada grupo. Linhas somem quando o participante some na captura seguinte (é estado atual, não histórico).';

-- ---------------------------------------------------------------------------
-- 3. Configuração de completude de cadastro — por unidade e por classificação
--    (LAMK/EMLA). Régua de negócio editável, não hardcode dentro da RPC.
-- ---------------------------------------------------------------------------
create table if not exists config_cadastro_obrigatorio (
  id                   bigint generated always as identity primary key,
  unidade_id           uuid not null references unidades(id),
  campo                text not null check (campo in
                         ('instagram', 'telefone', 'responsavel', 'data_inicio_contrato', 'foto')),
  obrigatorio          boolean not null default true,
  aplica_classificacao text not null default 'todas' check (aplica_classificacao in ('todas', 'LAMK', 'EMLA')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (unidade_id, campo, aplica_classificacao)
);

alter table config_cadastro_obrigatorio enable row level security;

comment on table config_cadastro_obrigatorio is
  'Régua de completude de cadastro por unidade × classificação. Editável pelo gerente; a RPC get_situacao_alunos_v1 honra esta tabela.';

-- Defaults aprovados no brainstorm de 02/09/2026 (Alf)
insert into config_cadastro_obrigatorio (unidade_id, campo, obrigatorio, aplica_classificacao)
select u.id, c.campo, true, c.aplica
from (values
  ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid),  -- Recreio
  ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid),  -- Barra
  ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid)   -- Campo Grande
) as u(id)
cross join (values
  ('instagram',           'todas'),
  ('telefone',            'todas'),
  ('responsavel',         'LAMK'),
  ('data_inicio_contrato','todas'),
  ('foto',                'todas')
) as c(campo, aplica)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. RPC canônica: get_situacao_alunos_v1 — UMA LINHA POR PESSOA
-- ---------------------------------------------------------------------------
create or replace function get_situacao_alunos_v1(
  p_unidade_id       uuid,
  p_referencia       date    default current_date,
  p_apenas_pendentes boolean default false
)
returns table (
  -- identidade
  pessoa_chave              text,
  aluno_id_canonico         integer,
  aluno_ids_locais          integer[],
  nome                      text,
  unidade_id                uuid,
  classificacao             text,
  status_operacional        text,
  matriculas_ativas         integer,
  cursos                    text[],
  -- anamnese
  anamnese_preenchida       boolean,
  anamnese_em               date,
  anamnese_tipo             text,
  anamnese_flag_sem_registro boolean,
  anamnese_orfa_candidata_id integer,
  anamnese_orfa_match       text,
  -- cadastro
  tem_instagram             boolean,
  instagram_nao_possui      boolean,
  tem_telefone              boolean,
  tem_responsavel           boolean,
  tem_foto                  boolean,
  tem_data_contrato         boolean,
  contrato_vencido          boolean,
  cadastro_completo         boolean,
  cadastro_faltando         text[],
  -- presença (propagada da canônica por pessoa — nunca recalculada aqui)
  presenca_confirmadas      integer,
  faltas_confirmadas        integer,
  faltas_provaveis          integer,
  chamadas_indeterminadas   integer,
  presenca_taxa_geral       numeric,
  presenca_confianca        text,
  presenca_regra_versao     text,
  -- recência + financeiro + ciclo
  ultima_aula_em            date,
  dias_desde_ultima_aula    integer,
  inadimplente              boolean,
  faturas_vencidas_abertas  integer,
  em_aviso_previo           boolean,
  aviso_previo_mes_saida    date,
  -- comunidade WhatsApp
  na_comunidade_wa          boolean,
  comunidade_status         text,
  comunidade_capturado_em   timestamptz,
  -- meta
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
  -- Guard no padrão listar_lia_alertas_pendencias_administrativas:
  -- service_role/sol_acesso_restrito/postgres passam direto; demais precisam
  -- da permissão 'alunos.ver' na unidade.
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
    -- matrículas da base ativa canônica (entra_base_ativa + não arquivadas)
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
           -- matrícula canônica = a 1ª matrícula (não-segundo-curso) da pessoa
           coalesce(min(b.aluno_id) filter (where not b.is_segundo_curso),
                    min(b.aluno_id)) as aluno_id_canonico,
           (array_agg(b.status_operacional order by b.is_segundo_curso, b.aluno_id))[1]
             as status_operacional
    from base b
    group by 1
  ),
  vivas as (
    -- TODAS as matrículas vivas da pessoa — cadastro é da pessoa (decisão 02/09/2026)
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
    -- anamnese é da PESSOA (pessoa_chave) — LAPE-19
    select a.pessoa_chave,
           true as anamnese_ok,
           max(a.created_at)::date as anamnese_em,
           (array_agg(a.tipo_formulario::text order by a.created_at desc))[1] as anamnese_tipo
    from anamneses a
    where a.unidade_id = p_unidade_id
      and a.status = 'completa'
      and a.pessoa_chave is not null
    group by 1
  ),
  orfas as (
    -- formulário respondido que ninguém vinculou — candidata por telefone/nome
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
    -- aviso prévio cobre o mês vigente do aviso + o seguinte (regra canônica)
    select v.pessoa_chave, min(m.mes_saida) as mes_saida
    from vivas v
    join movimentacoes_admin_vigentes m on m.aluno_id = v.id
    where m.tipo = 'aviso_previo'
      and m.mes_saida >= date_trunc('month', p_referencia)::date
      and m.mes_saida < (date_trunc('month', p_referencia)::date + interval '2 months')
    group by 1
  ),
  fin as (
    -- "fatura vencida em aberto" — mesma fonte da vw_renovacao_ciclos
    select v.pessoa_chave,
           bool_or(coalesce(rc.inadimplente, false)) as inadimplente_emusys,
           sum(coalesce(rc.faturas_vencidas_abertas, 0))::integer as faturas_vencidas_abertas
    from vivas v
    join vw_renovacao_ciclos rc on rc.aluno_id = v.id
    group by 1
  ),
  ciclo as (
    select v.pessoa_chave,
           -- contrato vencido: tem ciclo acadêmico encerrado sem sucessão
           -- E nenhum ciclo acadêmico com aulas futuras
           bool_or(not rc.atividade_extra and not coalesce(rc.renovou, false)
                   and rc.sucedida_por is null
                   and coalesce(rc.nr_aulas_futuras, 0) = 0
                   and rc.data_ultima_aula::date <= p_referencia) as tem_ciclo_vencido,
           bool_or(not rc.atividade_extra and coalesce(rc.nr_aulas_futuras, 0) > 0)
             as tem_ciclo_em_aberto
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
    -- anamnese: devolve o PAR (flag, registro) — a flag é de mão única
    coalesce(cd.anamnese_flag, false),
    an.anamnese_em,
    an.anamnese_tipo,
    (coalesce(cd.anamnese_flag, false) and an.pessoa_chave is null),
    coalesce(ot.orfa_id, on2.orfa_id),
    case when ot.orfa_id is not null then 'telefone'
         when on2.orfa_id is not null then 'nome' end,
    -- cadastro
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
    -- presença canônica por pessoa
    f.presencas_confirmadas::integer,
    f.faltas_confirmadas::integer,
    f.faltas_provaveis::integer,
    f.chamadas_indeterminadas::integer,
    f.taxa_presenca_geral,
    f.confianca_presenca,
    f.regra_versao,
    -- recência + financeiro + ciclo
    ua.ultima_aula_em,
    case when ua.ultima_aula_em is not null
         then (p_referencia - ua.ultima_aula_em)::integer end,
    coalesce(fn.faturas_vencidas_abertas, 0) > 0,
    coalesce(fn.faturas_vencidas_abertas, 0),
    (av.pessoa_chave is not null),
    av.mes_saida,
    -- comunidade WA: sem captura fresca = NULL, nunca false
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
    -- meta
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

comment on function get_situacao_alunos_v1(uuid, date, boolean) is
  'Situação operacional por PESSOA (dedupe vw_aluno_pessoa_chave; base = entra_base_ativa). '
  'Completude agrega todas as matrículas vivas. Presença propagada de get_frequencia_aluno_canonica_v1. '
  'Comunidade WA: NULL/sem_captura sem captura fresca (< 2 dias). regra_versao: situacao_alunos_v1.';

revoke all on function get_situacao_alunos_v1(uuid, date, boolean) from public, anon;
grant execute on function get_situacao_alunos_v1(uuid, date, boolean)
  to authenticated, service_role, sol_acesso_restrito;

-- ---------------------------------------------------------------------------
-- 5. Resumo agregado: "quantos faltam X" sem puxar a lista inteira
-- ---------------------------------------------------------------------------
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
    count(*) filter (where s.anamnese_flag_sem_registro) as anamnese_flag_sem_registro,
    count(*) filter (where s.anamnese_orfa_candidata_id is not null) as anamnese_orfa_candidata,
    count(*) filter (where s.comunidade_status = 'na_comunidade') as na_comunidade,
    count(*) filter (where s.comunidade_status = 'fora_da_comunidade') as fora_da_comunidade,
    count(*) filter (where s.comunidade_status = 'sem_grupo_configurado') as comunidade_sem_grupo,
    count(*) filter (where s.comunidade_status = 'sem_captura') as comunidade_sem_captura,
    count(*) filter (where s.comunidade_status = 'captura_desatualizada') as comunidade_desatualizada,
    max(s.comunidade_capturado_em) as comunidade_capturado_em,
    count(*) filter (where s.presenca_confianca is not null) as com_presenca_canonica,
    round(avg(s.presenca_taxa_geral) filter (where s.presenca_taxa_geral is not null), 1)
      as presenca_media
  into r
  from get_situacao_alunos_v1(p_unidade_id, p_referencia, false) s;

  return jsonb_build_object(
    'unidade_id', p_unidade_id,
    'referencia', p_referencia,
    'medido_em', now(),
    'fonte', 'vivo',
    'regra_versao', 'situacao_alunos_v1',
    'total_pessoas', r.total_pessoas,
    'completude_pct', case when r.total_pessoas > 0
        then round(r.cadastro_completo::numeric / r.total_pessoas * 100, 1) end,
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
      'contrato_vencido', r.contrato_vencido,
      'presenca_media', r.presenca_media,
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

comment on function get_situacao_alunos_resumo_v1(uuid, date) is
  'Agregados da get_situacao_alunos_v1 (mesma base, mesma versão). Para agente responder "quantos faltam X" sem puxar a lista.';

revoke all on function get_situacao_alunos_resumo_v1(uuid, date) from public, anon;
grant execute on function get_situacao_alunos_resumo_v1(uuid, date)
  to authenticated, service_role, sol_acesso_restrito;
