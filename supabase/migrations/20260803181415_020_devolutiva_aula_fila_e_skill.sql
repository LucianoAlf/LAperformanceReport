-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 020 — devolutiva de aula: fila, skill versionada e a fronteira family-safe.
-- Cabeçalho completo em supabase/migrations/020-devolutiva-aula-fila-e-skill.sql

create or replace function public.fn_devolutiva_fonte(p_tronco jsonb, p_fatia jsonb)
returns jsonb language sql immutable parallel safe as $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'objetivo',      nullif(btrim(coalesce(p_fatia->>'objetivo',   p_tronco->>'objetivo')),   ''),
    'conteudo',      nullif(btrim(coalesce(p_fatia->>'atividades', p_tronco->>'atividades')), ''),
    'progresso',     nullif(btrim(p_fatia->>'progresso'), ''),
    'proximo_passo', nullif(btrim(p_fatia->>'proximo_passo'), ''),
    'repertorio',    nullif(btrim(coalesce(p_fatia->>'repertorio', p_tronco->>'repertorio')), ''),
    'dever_casa',    nullif(btrim(coalesce(p_fatia->>'dever_casa', p_tronco->>'dever_casa')), '')
  ))
$function$;

comment on function public.fn_devolutiva_fonte is
  'Projecao family-safe do registro: SO os campos liberados. Lista de permissao — campo novo fica fora por padrao (migration 020).';

create table if not exists public.fabio_skills (
  id uuid primary key default gen_random_uuid(),
  nome text not null, versao integer not null, conteudo text not null,
  ativa boolean not null default false, notas text,
  criado_em timestamptz not null default now(), criado_por text);

create unique index if not exists uq_fabio_skills_nome_versao on public.fabio_skills (nome, versao);
create unique index if not exists uq_fabio_skills_ativa on public.fabio_skills (nome) where ativa;

create table if not exists public.fabio_devolutivas (
  id uuid primary key default gen_random_uuid(),
  registro_fatia_id uuid not null references public.fabio_registros_aula(id) on delete cascade,
  aluno_id integer not null, professor_id integer not null,
  destinatario text, destinatario_override text, destinatario_origem text,
  destinatario_nome text, destinatario_decidido_por integer, destinatario_decidido_em timestamptz,
  idade_na_geracao integer,
  texto_normal text, texto_apoio_casa text,
  skill_id uuid references public.fabio_skills(id), skill_versao integer,
  status text not null default 'pendente',
  lease_token uuid, lease_expira_em timestamptz, proxima_tentativa_em timestamptz,
  aguardando_desde timestamptz, envio_chave text, envio_recibo text,
  erro text, tentativas integer not null default 0,
  oferecida_em timestamptz, copiada_em timestamptz, editada_em timestamptz,
  compartilhada_em timestamptz, envio_confirmado_em timestamptz,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  constraint fabio_devolutivas_status_check check (status = any (array[
    'pendente','gerando','aguardando_destinatario','gerada',
    'oferecida','entrega_incerta','falhou','descartada'])),
  constraint fabio_devolutivas_destinatario_check check (
    destinatario is null or destinatario in ('responsavel','aluno')),
  constraint fabio_devolutivas_override_check check (
    destinatario_override is null or destinatario_override in ('responsavel','aluno')));

create unique index if not exists uq_fabio_devolutiva_por_registro
  on public.fabio_devolutivas (registro_fatia_id);
create index if not exists ix_fabio_devolutivas_fila
  on public.fabio_devolutivas (status, proxima_tentativa_em);

create or replace function public.fabio_enfileirar_devolutivas(p_registro_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_n integer;
begin
  with elegiveis as (
    select r.id, r.aluno_id, r.professor_id
      from public.fabio_registros_aula r
     where (r.id = p_registro_id or r.parent_id = p_registro_id)
       and r.aluno_id is not null
       and r.status = 'gravado_emusys'
       and r.confirmado_em is not null
       and public.fn_presenca_declarada(r.campos) = 'presente'
  )
  insert into public.fabio_devolutivas (registro_fatia_id, aluno_id, professor_id, status)
  select id, aluno_id, professor_id, 'pendente' from elegiveis
  on conflict (registro_fatia_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

create or replace function public.fabio_devolutiva_claim(
  p_worker text, p_lote integer default 5, p_lease_minutos integer default 5)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_token uuid := gen_random_uuid(); v_itens jsonb;
begin
  with alvo as (
    select d.id from public.fabio_devolutivas d
     where d.status = 'pendente'
       and (d.proxima_tentativa_em is null or d.proxima_tentativa_em <= now())
     order by d.criado_em limit greatest(p_lote, 1) for update skip locked
  ), tomadas as (
    update public.fabio_devolutivas d
       set status='gerando', lease_token=v_token,
           lease_expira_em = now() + make_interval(mins => p_lease_minutos),
           tentativas = d.tentativas + 1, atualizado_em = now()
      from alvo where d.id = alvo.id
    returning d.id, d.registro_fatia_id, d.aluno_id, d.professor_id)
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_itens from tomadas t;
  return jsonb_build_object('ok', true, 'worker', p_worker,
                            'lease_token', v_token, 'itens', v_itens);
end $function$;

create or replace function public.fabio_devolutiva_gerada(
  p_id uuid, p_lease_token uuid, p_texto_normal text, p_texto_apoio_casa text,
  p_destinatario text, p_destinatario_nome text, p_idade integer,
  p_skill_id uuid, p_skill_versao integer)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_n integer;
begin
  update public.fabio_devolutivas
     set status='gerada', texto_normal=p_texto_normal, texto_apoio_casa=p_texto_apoio_casa,
         destinatario=p_destinatario, destinatario_nome=p_destinatario_nome,
         destinatario_origem=coalesce(destinatario_origem,'idade'),
         idade_na_geracao=p_idade, skill_id=p_skill_id, skill_versao=p_skill_versao,
         erro=null, atualizado_em=now()
   where id=p_id and status='gerando'
     and lease_token=p_lease_token and lease_expira_em > now();
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;

create or replace function public.fabio_devolutiva_falhou(
  p_id uuid, p_lease_token uuid, p_erro text, p_backoff_segundos integer default 300)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_n integer; v_teto constant integer := 5;
begin
  update public.fabio_devolutivas
     set status = case when tentativas >= v_teto then 'falhou' else 'pendente' end,
         erro = p_erro,
         proxima_tentativa_em = now() + make_interval(secs => greatest(p_backoff_segundos,1)),
         lease_token=null, lease_expira_em=null, atualizado_em=now()
   where id=p_id and status='gerando'
     and lease_token=p_lease_token and lease_expira_em > now();
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;

create or replace function public.fabio_devolutiva_aguardar_destinatario(
  p_id uuid, p_lease_token uuid, p_motivo text)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare v_n integer;
begin
  update public.fabio_devolutivas
     set status='aguardando_destinatario', aguardando_desde=now(), erro=p_motivo,
         lease_token=null, lease_expira_em=null, atualizado_em=now()
   where id=p_id and status='gerando'
     and lease_token=p_lease_token and lease_expira_em > now();
  get diagnostics v_n = row_count;
  return v_n > 0;
end $function$;

create or replace function public.fabio_emitir_presenca_por_registro_e_devolutiva(p_registro_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_presenca jsonb; v_devs integer := 0;
begin
  begin v_presenca := public.fabio_emitir_presenca_por_registro(p_registro_id);
  exception when others then v_presenca := jsonb_build_object('aplicado',false,'erro',sqlerrm); end;
  begin v_devs := public.fabio_enfileirar_devolutivas(p_registro_id);
  exception when others then v_devs := -1; end;
  return jsonb_build_object('presenca', v_presenca, 'devolutivas_enfileiradas', v_devs);
end $function$;

insert into public.fabio_skills (nome, versao, conteudo, ativa, notas, criado_por)
select 'devolutiva_aula', 1, $skill$
Você escreve a DEVOLUTIVA DE UMA AULA para o professor encaminhar.

QUEM LÊ
- Se o destinatário for "responsavel": fale COM o responsável, pelo nome, e do
  aluno em terceira pessoa.
- Se for "aluno": fale com ele, em segunda pessoa.
- Sem nome do responsável: fale com a família SEM vocativo nominal. Nunca invente
  nome, nunca escreva "Sr(a). Responsável".

O QUE ENTRA
- Só o que está na fonte recebida. Você NÃO acrescenta fato nenhum.
- Diga o que a criança FEZ e o que vem DEPOIS.
- Fora: dificuldade técnica, comparação com outros alunos, diagnóstico de
  comportamento, qualquer coisa que soe como avaliação de valor.
- Recital/apresentação só se houver data real na fonte. Sem data, não existe.

AS DUAS VERSÕES
1. normal.
2. apoio_casa: pede parceria para praticar. REGRA: PEDIR, NUNCA ACUSAR.
   - NÃO: "o Gustavo não praticou esta semana."
   - SIM: "Um pouquinho de prática em casa, uns 10 minutos por dia, ajudaria
     muito o Gustavo a fixar o que ele já conseguiu na aula."
   Quem lê não pode terminar com sensação de bronca — nem ele, nem o filho.

TOM
Curto, caloroso, concreto. WhatsApp, não ofício. Sem emoji em excesso.
$skill$, true, 'Versao inicial — tom aprovado pelo Alf no desenho.', 'migration-020'
where not exists (select 1 from public.fabio_skills where nome='devolutiva_aula' and versao=1);

alter table public.fabio_devolutivas enable row level security;
alter table public.fabio_skills enable row level security;

revoke all on function
  public.fabio_enfileirar_devolutivas(uuid),
  public.fabio_devolutiva_claim(text, integer, integer),
  public.fabio_devolutiva_gerada(uuid, uuid, text, text, text, text, integer, uuid, integer),
  public.fabio_devolutiva_falhou(uuid, uuid, text, integer),
  public.fabio_devolutiva_aguardar_destinatario(uuid, uuid, text),
  public.fabio_emitir_presenca_por_registro_e_devolutiva(uuid),
  public.fn_devolutiva_fonte(jsonb, jsonb)
from public, anon, authenticated;

grant execute on function
  public.fabio_enfileirar_devolutivas(uuid),
  public.fabio_devolutiva_claim(text, integer, integer),
  public.fabio_devolutiva_gerada(uuid, uuid, text, text, text, text, integer, uuid, integer),
  public.fabio_devolutiva_falhou(uuid, uuid, text, integer),
  public.fabio_devolutiva_aguardar_destinatario(uuid, uuid, text),
  public.fabio_emitir_presenca_por_registro_e_devolutiva(uuid),
  public.fn_devolutiva_fonte(jsonb, jsonb)
to service_role, fabio_agent;
