-- Presença do professor lançada pela secretaria era apagada pelo sync do Emusys.
--
-- Medido em 12/08/2026: 77 de 83 marcações (92,8%) voltaram para 'ausente' em até
-- 15 minutos. `aulas_emusys.professor_presenca` é escrita por QUATRO caminhos
-- (sync-presenca-emusys nos modos presenca/agenda/metadados + sync-grade-futura-emusys),
-- e o Emusys manda 'ausente' por default em toda aula que ainda não ocorreu. O modo
-- metadados roda a cada 15 min cobrindo ontem→+14 dias, então a marcação humana durava
-- no máximo um ciclo de cron.
--
-- Por que trigger e não trava na edge: a casa já tem os dois padrões nesta mesma tabela.
-- O da edge (`cancelamentosHumanos`, protegendo `cancelada`) cobre apenas
-- `sync-presenca-emusys` — `sync-grade-futura-emusys:171` grava `cancelada` sem a
-- proteção, então o cancelamento humano tem um furo latente (ainda não exercitado:
-- zero linhas com `cancelada_origem` preenchido). O do banco
-- (`trg_proteger_anotacoes_fabio`, protegendo `anotacoes_fabio`) cobre todo caminho de
-- escrita sem ninguém precisar lembrar. Este segue o segundo padrão e, de quebra, fecha
-- o furo do cancelamento.

-- 1. Procedência da decisão humana, espelhando `cancelada_origem`.
alter table public.aulas_emusys
  add column if not exists professor_presenca_origem text;

comment on column public.aulas_emusys.professor_presenca_origem is
  'Quem decidiu a presença do professor. NULL = valor espelhado do Emusys (que manda '
  '''ausente'' por default em aula futura). Preenchido = decisão humana, protegida do '
  'sync por trg_proteger_decisao_humana_aula.';

create index if not exists idx_aulas_emusys_professor_presenca_origem
  on public.aulas_emusys (professor_presenca_origem)
  where professor_presenca_origem is not null;

-- 2. O guarda.
--
-- Discrimina humano de sync por flag de transação, não pelo conteúdo do UPDATE: as RPCs
-- da Agenda declaram `app.escrita_humana_aula`, o sync não. Sem isso, a própria
-- secretaria ficaria impedida de corrigir a marcação que ela mesma fez (presente →
-- ausente seria lido como sobrescrita e revertido).
create or replace function public.fn_proteger_decisao_humana_aula()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Escrita humana declarada por RPC autorizada: passa direto.
  if coalesce(current_setting('app.escrita_humana_aula', true), '') = 'on' then
    return new;
  end if;

  -- Daqui para baixo é sync/automação: decisão humana não é desfeita.
  if old.professor_presenca_origem is not null then
    new.professor_presenca := old.professor_presenca;
    new.professor_presenca_origem := old.professor_presenca_origem;
  end if;

  -- Mesma regra para o cancelamento — a edge já faz isso, menos na
  -- sync-grade-futura-emusys. Aqui vale para todos os caminhos.
  if coalesce(old.cancelada, false) and old.cancelada_origem is not null then
    new.cancelada := true;
    new.cancelada_origem := old.cancelada_origem;
  end if;

  return new;
end;
$function$;

comment on function public.fn_proteger_decisao_humana_aula() is
  'Impede que o sync do Emusys desfaça presença de professor e cancelamento lançados por '
  'humano. Para escrever como humano, a RPC precisa fazer '
  'set_config(''app.escrita_humana_aula'', ''on'', true) na mesma transação. Um eventual '
  '"descancelar" pela Agenda também exigirá essa flag.';

drop trigger if exists trg_proteger_decisao_humana_aula on public.aulas_emusys;
create trigger trg_proteger_decisao_humana_aula
  before update on public.aulas_emusys
  for each row
  execute function public.fn_proteger_decisao_humana_aula();

-- 3. As três RPCs da Agenda passam a declarar a escrita humana e a marcar a procedência.
--    Assinaturas preservadas na íntegra: lista de parâmetros diferente criaria overload
--    em vez de substituir (armadilha do `upsert_lead`, 11/08).

create or replace function public.app_registrar_presenca_professor_dia(
  p_professor_id integer,
  p_data date,
  p_unidade_id uuid,
  p_hora_chegada time without time zone default null::time without time zone,
  p_hora_saida time without time zone default null::time without time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id integer;
  v_aulas_atualizadas integer := 0;
  v_aulas record;
begin
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;
  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;
  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', p_unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  perform set_config('app.escrita_humana_aula', 'on', true);

  for v_aulas in
    select id, data_hora_inicio
    from aulas_emusys
    where professor_id = p_professor_id
      and data_aula = p_data
      and unidade_id = p_unidade_id
      and cancelada = false
      and categoria = 'normal'
  loop
    update aulas_emusys
    set professor_presenca = 'presente',
        professor_presenca_origem = 'agenda_secretaria'
    where id = v_aulas.id;
    v_aulas_atualizadas := v_aulas_atualizadas + 1;
    insert into professor_ponto_confirmacoes (
      professor_id, aula_emusys_id, unidade_id, data_aula,
      estava_presente, origem, respondido_em
    ) values (
      p_professor_id, v_aulas.id, p_unidade_id, p_data,
      true, 'chamada_secretaria', now()
    )
    on conflict (aula_emusys_id, professor_id) do update
    set estava_presente = true, origem = 'chamada_secretaria', respondido_em = now();
  end loop;
  return jsonb_build_object(
    'registrado', true, 'professor_id', p_professor_id, 'data', p_data,
    'aulas_atualizadas', v_aulas_atualizadas
  );
end;
$function$;

create or replace function public.app_remover_presenca_professor_dia(
  p_professor_id integer,
  p_data date,
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id integer;
  v_aulas_afetadas integer := 0;
begin
  select id into v_usuario_id from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true) limit 1;
  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;
  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', p_unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  perform set_config('app.escrita_humana_aula', 'on', true);

  delete from professor_ponto_confirmacoes
  where professor_id = p_professor_id and data_aula = p_data
    and unidade_id = p_unidade_id and origem = 'chamada_secretaria';

  -- 'ausente' com origem preenchida é decisão humana e fica protegida: é o que
  -- distingue "a secretaria marcou ausente" de "o Emusys ainda não lançou".
  update aulas_emusys
  set professor_presenca = 'ausente',
      professor_presenca_origem = 'agenda_secretaria'
  where professor_id = p_professor_id and data_aula = p_data
    and unidade_id = p_unidade_id and cancelada = false and categoria = 'normal';
  get diagnostics v_aulas_afetadas = row_count;

  return jsonb_build_object(
    'removido', true, 'professor_id', p_professor_id, 'data', p_data,
    'aulas_afetadas', v_aulas_afetadas
  );
end;
$function$;

create or replace function public.app_marcar_presenca_professor_aula(
  p_aula_emusys_id integer,
  p_presente boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_usuario_id integer;
  v_aula public.aulas_emusys%rowtype;
begin
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  select * into v_aula from public.aulas_emusys where id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_nao_encontrada';
  end if;

  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  if coalesce(v_aula.cancelada, false) then
    raise exception 'aula_cancelada';
  end if;

  perform set_config('app.escrita_humana_aula', 'on', true);

  update public.aulas_emusys
  set professor_presenca = case when p_presente then 'presente' else 'ausente' end,
      professor_presenca_origem = 'agenda_secretaria'
  where id = v_aula.id;

  insert into public.professor_ponto_confirmacoes (
    professor_id, aula_emusys_id, unidade_id, data_aula,
    estava_presente, origem, respondido_em
  ) values (
    v_aula.professor_id, v_aula.id, v_aula.unidade_id, v_aula.data_aula,
    p_presente, 'chamada_secretaria', now()
  )
  on conflict (aula_emusys_id, professor_id) do update
  set estava_presente = excluded.estava_presente,
      origem = 'chamada_secretaria',
      respondido_em = now();

  return jsonb_build_object(
    'registrado', true,
    'aula_emusys_id', v_aula.id,
    'professor_presenca', case when p_presente then 'presente' else 'ausente' end
  );
end;
$function$;

-- 4. ACL: recriar função reabre EXECUTE para `anon` por causa do
--    ALTER DEFAULT PRIVILEGES do schema public. Revogar nominalmente.
revoke execute on function public.app_registrar_presenca_professor_dia(integer, date, uuid, time without time zone, time without time zone) from anon, public;
revoke execute on function public.app_remover_presenca_professor_dia(integer, date, uuid) from anon, public;
revoke execute on function public.app_marcar_presenca_professor_aula(integer, boolean) from anon, public;
revoke execute on function public.fn_proteger_decisao_humana_aula() from anon, public;

grant execute on function public.app_registrar_presenca_professor_dia(integer, date, uuid, time without time zone, time without time zone) to authenticated, service_role;
grant execute on function public.app_remover_presenca_professor_dia(integer, date, uuid) to authenticated, service_role;
grant execute on function public.app_marcar_presenca_professor_aula(integer, boolean) to authenticated, service_role;
