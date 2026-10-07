-- Harness do teste de cobertura de click-ids (migration 20261002050000).
-- Mesma fixture do harness de agendamento + colunas gclid/meta_ctwa_clid.
-- ATENÇÃO: este harness provê a view SEM as flags — as flags vêm da migration sob teste
-- (a migration recria a view com create or replace). Para o stub funcionar, a view
-- precisa existir sobre uma tabela que já tenha as colunas gclid/meta_ctwa_clid.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'mike_mcp') then create role mike_mcp nologin noinherit nobypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'sol_acesso_restrito') then create role sol_acesso_restrito nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'mila_acesso_restrito') then create role mila_acesso_restrito nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'fabio_agent') then create role fabio_agent nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'lia_acesso_restrito') then create role lia_acesso_restrito nologin; end if;
end $$;

create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$ select 'service_role' $$;

create table if not exists public.unidades (id uuid primary key, codigo text, nome text);
truncate public.unidades;
insert into public.unidades values
  ('11111111-1111-1111-1111-111111111111', 'CG', 'Campo Grande'),
  ('22222222-2222-2222-2222-222222222222', 'REC', 'Recreio'),
  ('33333333-3333-3333-3333-333333333333', 'BARRA', 'Barra da Tijuca');

-- mínimos que a view referencia (joins auxiliares + função de telefone)
create table if not exists public.canais_origem (id int primary key, nome text);
create table if not exists public.cursos (id uuid primary key, nome text);
create table if not exists public.professores (id uuid primary key, nome text);
create table if not exists public.meta_ads_cache (source_id text primary key, ad_name text, campaign_name text);
create table if not exists public.leads_campanhas (lead_id uuid, created_at timestamptz, campanha_nome text);
create table if not exists public.instagram_sessoes (telefone_chave text, iniciada_em timestamptz, ultima_atividade_em timestamptz, transferido boolean, conta text, estagio text, interesse text);
create table if not exists public.lead_experimentais (lead_id uuid, data_experimental date, status text);
create or replace function public.fn_normalizar_telefone_br_key(t text) returns text language sql immutable as $$ select regexp_replace(coalesce(t,''),'\D','','g') $$;

-- leads mínimos com as colunas que a view lê (l_1.*)
create table if not exists public.leads (
  id uuid primary key, nome text, telefone text, unidade_id uuid, canal_origem_id int,
  curso_interesse_id uuid, professor_experimental_id uuid, meta_ad_source_id text,
  data_contato date, created_at timestamptz, data_primeiro_contato timestamptz,
  data_ultimo_contato timestamptz, data_experimental date, data_passagem_mila timestamptz,
  data_conversao date, data_arquivamento timestamptz, converteu boolean, aluno_id uuid,
  status text, experimental_realizada boolean, faltou_experimental boolean,
  experimental_agendada boolean, motivo_nao_matricula text, temperatura text,
  agente_comercial text, gclid text, meta_ctwa_clid text
);
truncate public.leads;
insert into public.leads
  (id, nome, telefone, unidade_id, data_contato, created_at, data_experimental,
   converteu, aluno_id, data_conversao, status, gclid, meta_ctwa_clid)
values
  -- janela 25/09–01/10 (fim exclusivo 02/10):
  ('a0000000-0000-0000-0000-000000000001','L1','5511','11111111-1111-1111-1111-111111111111','2026-09-25','2026-09-25T10:00','2026-09-28',false,null,null,'novo','GCLID-SEGREDO-001',null),
  ('a0000000-0000-0000-0000-000000000002','L2','5522','11111111-1111-1111-1111-111111111111','2026-09-26','2026-09-26T10:00','2026-09-29',false,null,null,'novo',null,'CTWA-SEGREDO-002'),
  ('a0000000-0000-0000-0000-000000000003','L3','5533','11111111-1111-1111-1111-111111111111','2026-09-27','2026-09-27T10:00',null,false,null,null,'novo','GCLID-SEGREDO-003','CTWA-SEGREDO-003'),
  ('a0000000-0000-0000-0000-000000000004','L4','5544','22222222-2222-2222-2222-222222222222','2026-09-28','2026-09-28T10:00',null,false,null,null,'novo',null,null),
  ('a0000000-0000-0000-0000-000000000005','L5','5555','22222222-2222-2222-2222-222222222222','2026-09-30','2026-09-30T10:00',null,true,'b0000000-0000-0000-0000-00000000000a','2026-10-03','novo',null,null),
  ('a0000000-0000-0000-0000-000000000006','L6','5566','33333333-3333-3333-3333-333333333333','2026-10-01','2026-10-01T10:00',null,false,null,null,'novo',null,null),
  ('a0000000-0000-0000-0000-000000000007','L7','5577','11111111-1111-1111-1111-111111111111','2026-09-24','2026-09-24T10:00',null,false,null,null,'novo','GCLID-FORA-JANELA',null);
-- janela: 6 leads; gclid: L1+L3=2; ctwa: L2+L3=2; algum: L1,L2,L3=3 (L7 fora)

-- a janela usa entrou_em = coalesce(data_contato, d_criado) — data_contato preenchida.
-- L3 tem linha de experimental (cancelada): evidência de agendamento pelo lado da linha.
truncate public.lead_experimentais;
insert into public.lead_experimentais values
  ('a0000000-0000-0000-0000-000000000001', '2026-09-28', 'experimental_agendada'),
  ('a0000000-0000-0000-0000-000000000003', '2026-09-27', 'cancelada');

-- canais para por_canal:
truncate public.canais_origem;
insert into public.canais_origem values (1,'Instagram'),(3,'Google'),(5,'Indicação');
update public.leads set canal_origem_id = 1 where nome in ('L1','L6','L7');
update public.leads set canal_origem_id = 3 where nome in ('L2','L3');
update public.leads set canal_origem_id = 5 where nome in ('L4','L5');

-- view no def vigente de produção (20260904105000), SEM as flags novas — a migration sob
-- teste a substitui via create or replace. Em seguida a ACL viva de produção (lida em
-- 03/10): service_role full + 4 papéis restritos de leitura, SEM authenticated.

create or replace view public.vw_jornada_lead_v1 as
 WITH exp AS (
         SELECT le.lead_id,
            count(*) AS aulas_experimentais,
            min(le.data_experimental) AS primeira_experimental,
            max(le.data_experimental) AS ultima_experimental,
            count(*) FILTER (WHERE le.status::text = ANY (ARRAY['experimental_realizada'::text, 'convertido'::text])) AS exp_realizadas,
            count(*) FILTER (WHERE le.status::text = 'experimental_faltou'::text) AS exp_faltas,
            count(*) FILTER (WHERE le.status::text = 'cancelada'::text) AS exp_canceladas,
            count(*) FILTER (WHERE le.status::text = 'experimental_agendada'::text) AS exp_agendadas
           FROM lead_experimentais le
          WHERE le.lead_id IS NOT NULL
          GROUP BY le.lead_id
        ), camp AS (
         SELECT lc.lead_id,
            min(lc.created_at) AS primeira_campanha_em,
            string_agg(DISTINCT lc.campanha_nome, ' | '::text) AS campanhas
           FROM leads_campanhas lc
          GROUP BY lc.lead_id
        ), insta AS (
         SELECT s.telefone_chave,
            min(s.iniciada_em) AS ig_primeira_em,
            max(s.ultima_atividade_em) AS ig_ultima_em,
            bool_or(s.transferido) AS ig_transferido,
            (array_agg(s.conta ORDER BY s.ultima_atividade_em DESC))[1] AS ig_conta,
            (array_agg(s.estagio ORDER BY s.ultima_atividade_em DESC))[1] AS ig_estagio,
            (array_agg(s.interesse ORDER BY s.ultima_atividade_em DESC))[1] AS ig_interesse
           FROM instagram_sessoes s
          WHERE s.telefone_chave IS NOT NULL
          GROUP BY s.telefone_chave
        ), base AS (
         SELECT l_1.*,
            (l_1.data_primeiro_contato AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_primeiro_contato,
            (l_1.data_ultimo_contato AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_ultimo_contato,
            (l_1.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS d_criado,
            (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date AS hoje_brt
           FROM leads l_1
        )
 SELECT l.id AS lead_id, l.nome, l.telefone,
    fn_normalizar_telefone_br_key(l.telefone::text) AS telefone_chave,
    l.unidade_id, u.nome AS unidade_nome, l.curso_interesse_id,
    cur.nome AS curso_interesse, co.nome AS canal_origem,
    l.meta_ad_source_id, ads.ad_name AS anuncio, ads.campaign_name AS campanha_meta,
    camp.campanhas AS campanhas_whatsapp,
    ins.ig_conta AS instagram_conta, ins.ig_interesse AS instagram_interesse,
    ins.ig_estagio AS instagram_estagio, ins.ig_transferido AS instagram_transferido,
    COALESCE(l.data_contato, l.d_criado) AS entrou_em,
    l.data_primeiro_contato AS primeiro_contato_em,
    l.data_passagem_mila AS passagem_mila_em,
    l.data_experimental AS experimental_agendada_para,
    exp.primeira_experimental AS experimental_real_em,
    l.data_conversao AS convertido_em, l.data_arquivamento AS arquivado_em,
    l.data_ultimo_contato AS ultimo_contato_em,
        CASE
            WHEN l.converteu THEN 'convertido'::text
            WHEN l.status::text = 'arquivado'::text OR l.data_arquivamento IS NOT NULL THEN 'perdido'::text
            -- FONTE CANÔNICA manda quando existe linha
            WHEN COALESCE(exp.aulas_experimentais, 0::bigint) > 0 THEN
            CASE
                WHEN COALESCE(exp.exp_realizadas, 0::bigint) > 0 THEN 'experimental_realizada'::text
                WHEN COALESCE(exp.exp_faltas, 0::bigint) > 0 THEN 'experimental_faltou'::text
                WHEN COALESCE(exp.exp_agendadas, 0::bigint) > 0 THEN 'experimental_agendada'::text
                ELSE 'em_atendimento'::text
            END
            -- resgate para quem não tem NENHUMA linha canônica (histórico antigo)
            WHEN l.experimental_realizada THEN 'experimental_realizada'::text
            WHEN l.faltou_experimental THEN 'experimental_faltou'::text
            WHEN l.experimental_agendada OR l.data_experimental IS NOT NULL THEN 'experimental_agendada'::text
            WHEN l.data_primeiro_contato IS NOT NULL THEN 'em_atendimento'::text
            ELSE 'novo'::text
        END AS etapa,
    l.d_primeiro_contato - COALESCE(l.data_contato, l.d_criado) AS dias_ate_primeiro_contato,
    l.hoje_brt - GREATEST(COALESCE(l.d_ultimo_contato, '-infinity'::date), COALESCE(l.d_primeiro_contato, '-infinity'::date), COALESCE(l.data_experimental, '-infinity'::date), COALESCE(l.data_contato, '-infinity'::date), COALESCE(l.d_criado, '-infinity'::date)) AS dias_parado,
    l.hoje_brt - COALESCE(l.data_contato, l.d_criado) AS dias_no_funil,
    COALESCE(exp.aulas_experimentais, 0::bigint) AS aulas_experimentais,
    COALESCE(exp.exp_realizadas, 0::bigint) AS experimentais_realizadas,
    COALESCE(exp.exp_faltas, 0::bigint) AS experimentais_faltou,
    prof.nome AS professor_experimental,
    l.converteu, l.aluno_id, l.motivo_nao_matricula, l.temperatura,
    l.agente_comercial, l.status AS status_bruto, l.created_at,
    COALESCE(exp.exp_canceladas, 0::bigint) AS experimentais_canceladas,
    COALESCE(exp.exp_agendadas, 0::bigint) AS experimentais_agendadas,
    exp.ultima_experimental AS ultima_experimental_em
   FROM base l
     LEFT JOIN unidades u ON u.id = l.unidade_id
     LEFT JOIN canais_origem co ON co.id = l.canal_origem_id
     LEFT JOIN cursos cur ON cur.id = l.curso_interesse_id
     LEFT JOIN professores prof ON prof.id = l.professor_experimental_id
     LEFT JOIN meta_ads_cache ads ON ads.source_id = l.meta_ad_source_id
     LEFT JOIN exp ON exp.lead_id = l.id
     LEFT JOIN camp ON camp.lead_id = l.id
     LEFT JOIN insta ins ON ins.telefone_chave = fn_normalizar_telefone_br_key(l.telefone::text);


revoke all on public.vw_jornada_lead_v1 from public, anon, authenticated;
grant all on public.vw_jornada_lead_v1 to service_role;
grant select on public.vw_jornada_lead_v1 to sol_acesso_restrito, mila_acesso_restrito, fabio_agent, lia_acesso_restrito;

create table if not exists harness_acl_viva (acl text);
delete from harness_acl_viva;
insert into harness_acl_viva
  select c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='vw_jornada_lead_v1';
