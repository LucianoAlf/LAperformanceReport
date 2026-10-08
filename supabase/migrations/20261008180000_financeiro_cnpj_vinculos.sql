-- Resolvedor compartilhado CNPJ -> responsavel/aluno (pedido SF via Alf,
-- 08/10/2026). O Emusys nao expõe CNPJ em nenhum endpoint (verificado
-- OpenAPI v1.4.0 + changelog ate v1.8.3), entao o mapa e aprendido dos Pix
-- de CNPJ que o Super Folha casa manualmente
-- (financeiro_extrato_vinculos -> fatura -> aluno).
--
--   1) private.calcular_financeiro_cnpj_hmac: clone do HMAC de CPF, mas
--      para 14 digitos. Mesmo cofre, chave propria.
--   2) financeiro_cnpj_vinculos: (unidade, cnpj_hmac, fatura) -> aluno,
--      com contagem de vezes e datas. CNPJ em claro nunca e guardado —
--      so HMAC + mascara para depuracao ('**.***.***/****-12').
--   3) financeiro_cnpj_ignorados: CNPJs que NUNCA devem sugerir aluno
--      (empresas da propria LA, adquirentes como PagSeguro).
--   4) publicar_financeiro_cnpj_vinculos_v1: ingestao (aceita lote;
--      acao='ignorar' alimenta a lista de ignorados).
--   5) resolver_financeiro_cnpj_v1: devolve sugestoes rankeadas
--      (ultimo casamento mais recente primeiro; desempate por vezes).
--
-- RLS sem policy + grants espelham o espelho financeiro (leitura pelas
-- funcoes SECURITY DEFINER; escrita so por service_role).

create extension if not exists pgcrypto;

-- Chave propria para CNPJ (nao reusa a de CPF — espacos de entrada distintos).
-- Se ja existir, vault.create_secret atualiza — mas so criamos se ausente.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
     where name = 'financeiro_doc_hmac_key_v1'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'financeiro_doc_hmac_key_v1'
    );
  end if;
end $$;

create or replace function private.calcular_financeiro_cnpj_hmac(p_cnpj_digitos text)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'private', 'vault', 'extensions'
as $function$
declare
  v_secret text;
begin
  if p_cnpj_digitos is null or p_cnpj_digitos !~ '^[0-9]{14}$' then
    raise exception 'CNPJ_INVALIDO: esperado documento com quatorze digitos'
      using errcode = '22023';
  end if;

  select decrypted_secret
    into v_secret
    from vault.decrypted_secrets
   where name = 'financeiro_doc_hmac_key_v1'
   limit 1;

  if v_secret is null or v_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'CNPJ_HMAC_KEY_INVALIDA' using errcode = '55000';
  end if;

  return encode(
    extensions.hmac(
      convert_to(p_cnpj_digitos, 'UTF8'),
      decode(v_secret, 'hex'),
      'sha256'
    ),
    'hex'
  );
end;
$function$;

-- Mascara para depuracao sem guardar o documento: '**.***.789/****-90'
create or replace function private.mascarar_cnpj(p_cnpj_digitos text)
 returns text
 language sql
 immutable
as $function$
  select case
    when p_cnpj_digitos ~ '^[0-9]{14}$'
      then '**.***.' || substr(p_cnpj_digitos, 4, 3) || '/****-' || right(p_cnpj_digitos, 2)
    else null
  end;
$function$;

create table if not exists public.financeiro_cnpj_vinculos (
  unidade_id uuid not null references public.unidades (id),
  cnpj_hmac text not null,
  cnpj_mascarado text not null,
  emusys_fatura_id bigint not null,
  emusys_matricula_id bigint,
  emusys_student_id bigint,
  aluno_id integer,
  vezes integer not null default 1,
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  ultimo_casado_em timestamptz,
  fonte text not null default 'super_folha',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (unidade_id, cnpj_hmac, emusys_fatura_id)
);

comment on table public.financeiro_cnpj_vinculos is
  'Mapa aprendido CNPJ -> fatura/aluno. Alimentado pelo Super Folha a cada casamento manual confirmado. So HMAC, nunca CNPJ em claro.';

create table if not exists public.financeiro_cnpj_ignorados (
  cnpj_hmac text primary key,
  cnpj_mascarado text not null,
  motivo text not null,
  criado_em timestamptz not null default now()
);

comment on table public.financeiro_cnpj_ignorados is
  'CNPJs que nunca viram sugestao de aluno: empresas da propria LA e adquirentes (PagSeguro etc.).';

alter table public.financeiro_cnpj_vinculos enable row level security;
alter table public.financeiro_cnpj_ignorados enable row level security;

revoke all on public.financeiro_cnpj_vinculos from public, anon, authenticated;
revoke all on public.financeiro_cnpj_ignorados from public, anon, authenticated;
grant all on public.financeiro_cnpj_vinculos to service_role;
grant all on public.financeiro_cnpj_ignorados to service_role;
grant select on public.financeiro_cnpj_vinculos to mila_acesso_restrito, fabio_agent, lia_acesso_restrito;
grant select on public.financeiro_cnpj_ignorados to mila_acesso_restrito, fabio_agent, lia_acesso_restrito;

-- Ingestao: o SF manda o casamento confirmado; a fatura resolve
-- matricula/aluno aqui embaixo. acao='ignorar' alimenta a lista de fora.
create or replace function public.publicar_financeiro_cnpj_vinculos_v1(
  p_items jsonb,
  p_fonte text default 'super_folha'
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_gravados integer := 0;
  v_ignorados integer := 0;
  v_rejeitados jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items deve ser array' using errcode = '22023';
  end if;

  with itens as (
    select
      item,
      regexp_replace(coalesce(item->>'cnpj', ''), '\D', '', 'g') as cnpj_digitos,
      lower(coalesce(item->>'acao', 'vincular')) as acao
    from jsonb_array_elements(p_items) as linha(item)
  ),
  validados as (
    select
      i.*,
      u.id as unidade_id,
      f.emusys_matricula_id,
      f.emusys_student_id,
      case
        when i.cnpj_digitos !~ '^[0-9]{14}$' then 'cnpj_invalido'
        when i.acao not in ('vincular', 'ignorar') then 'acao_invalida'
        when i.acao = 'vincular'
             and (i.item->>'emusys_fatura_id') !~ '^[0-9]+$' then 'fatura_invalida'
        when i.acao = 'vincular' and u.id is null then 'unidade_desconhecida'
        when i.acao = 'vincular' and f.emusys_fatura_id is null then 'fatura_desconhecida'
      end as motivo_rejeicao
    from itens i
    left join public.unidades u
      on u.id = case when coalesce(i.item->>'unidade_id','') ~* '^[0-9a-f-]{36}$'
                     then (i.item->>'unidade_id')::uuid end
         or u.codigo = upper(coalesce(i.item->>'unidade_codigo', i.item->>'unidade', ''))
    left join public.emusys_faturas f
      on f.unidade_id = u.id
     and case when (i.item->>'emusys_fatura_id') ~ '^[0-9]+$'
              then f.emusys_fatura_id = (i.item->>'emusys_fatura_id')::bigint end
  ),
  -- O mesmo (unidade, cnpj, fatura) pode vir repetido no lote; ON CONFLICT
  -- nao aceita tocar a mesma linha duas vezes, entao consolidamos antes.
  dedup as (
    select
      unidade_id, cnpj_digitos,
      (item->>'emusys_fatura_id')::bigint as emusys_fatura_id,
      max(emusys_matricula_id) as emusys_matricula_id,
      max(emusys_student_id) as emusys_student_id,
      count(*) as ocorrencias,
      max(coalesce(nullif(item->>'casado_em','')::timestamptz, now())) as ultimo_casado_em
    from validados
    where acao = 'vincular' and motivo_rejeicao is null
    group by unidade_id, cnpj_digitos, (item->>'emusys_fatura_id')::bigint
  ),
  ignorados as (
    insert into public.financeiro_cnpj_ignorados (cnpj_hmac, cnpj_mascarado, motivo)
    select
      private.calcular_financeiro_cnpj_hmac(v.cnpj_digitos),
      private.mascarar_cnpj(v.cnpj_digitos),
      coalesce(nullif(v.item->>'motivo',''), 'marcado_ignorar')
    from validados v
    where v.acao = 'ignorar' and v.motivo_rejeicao is null
    on conflict (cnpj_hmac) do update
      set motivo = excluded.motivo
    returning cnpj_hmac
  ),
  gravados as (
    insert into public.financeiro_cnpj_vinculos (
      unidade_id, cnpj_hmac, cnpj_mascarado, emusys_fatura_id,
      emusys_matricula_id, emusys_student_id, aluno_id,
      vezes, ultimo_casado_em, fonte
    )
    select
      v.unidade_id,
      private.calcular_financeiro_cnpj_hmac(v.cnpj_digitos),
      private.mascarar_cnpj(v.cnpj_digitos),
      v.emusys_fatura_id,
      v.emusys_matricula_id,
      v.emusys_student_id,
      a.id,
      v.ocorrencias,
      v.ultimo_casado_em,
      coalesce(nullif(p_fonte,''), 'super_folha')
    from dedup v
    left join public.alunos a
      on a.unidade_id = v.unidade_id
     and a.emusys_matricula_id = v.emusys_matricula_id::text
    on conflict (unidade_id, cnpj_hmac, emusys_fatura_id) do update
      set vezes = financeiro_cnpj_vinculos.vezes + excluded.vezes,
          ultimo_visto_em = now(),
          ultimo_casado_em = greatest(
            coalesce(excluded.ultimo_casado_em, financeiro_cnpj_vinculos.ultimo_casado_em),
            financeiro_cnpj_vinculos.ultimo_casado_em
          ),
          aluno_id = coalesce(excluded.aluno_id, financeiro_cnpj_vinculos.aluno_id),
          atualizado_em = now()
    returning unidade_id
  )
  select
    (select count(*) from gravados),
    (select count(*) from ignorados),
    (select coalesce(jsonb_agg(jsonb_build_object(
       'cnpj_mascarado', private.mascarar_cnpj(v.cnpj_digitos),
       'motivo', v.motivo_rejeicao
     )), '[]'::jsonb) from validados v where v.motivo_rejeicao is not null)
  into v_gravados, v_ignorados, v_rejeitados;

  return jsonb_build_object(
    'recebidos', jsonb_array_length(p_items),
    'gravados', v_gravados,
    'ignorados', v_ignorados,
    'rejeitados', v_rejeitados
  );
end;
$function$;

-- Resolucao: sugestoes rankeadas por (unidade, aluno) — ultimo casamento
-- mais recente primeiro, desempate por soma de vezes. CNPJs ignorados
-- nunca voltam.
create or replace function public.resolver_financeiro_cnpj_v1(p_cnpj text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_digitos text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_hmac text;
  v_sugestoes jsonb;
begin
  if v_digitos !~ '^[0-9]{14}$' then
    return jsonb_build_object('ok', false, 'motivo', 'cnpj_invalido', 'sugestoes', '[]'::jsonb);
  end if;

  v_hmac := private.calcular_financeiro_cnpj_hmac(v_digitos);

  if exists (select 1 from public.financeiro_cnpj_ignorados i where i.cnpj_hmac = v_hmac) then
    return jsonb_build_object('ok', true, 'ignorado', true, 'sugestoes', '[]'::jsonb);
  end if;

  with filtrados as (
    select v.*, u.codigo as unidade_codigo
    from public.financeiro_cnpj_vinculos v
    join public.unidades u on u.id = v.unidade_id
    where v.cnpj_hmac = v_hmac
  ),
  por_aluno as (
    select
      f.unidade_id,
      f.unidade_codigo,
      f.aluno_id,
      coalesce(a.nome::text, 'Aluno nao vinculado') as aluno_nome,
      array_agg(distinct f.emusys_matricula_id) filter (where f.emusys_matricula_id is not null)
        as emusys_matricula_ids,
      jsonb_agg(jsonb_build_object(
        'emusys_fatura_id', f.emusys_fatura_id,
        'vezes', f.vezes,
        'ultimo_casado_em', f.ultimo_casado_em
      ) order by f.ultimo_casado_em desc nulls last) as faturas,
      sum(f.vezes) as vezes_total,
      max(coalesce(f.ultimo_casado_em, f.ultimo_visto_em)) as mais_recente
    from filtrados f
    left join public.alunos a
      on a.unidade_id = f.unidade_id
     and (a.id = f.aluno_id or a.emusys_matricula_id = f.emusys_matricula_id::text)
    group by f.unidade_id, f.unidade_codigo, f.aluno_id, a.nome
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.mais_recente desc, p.vezes_total desc), '[]'::jsonb)
    into v_sugestoes
    from por_aluno p;

  return jsonb_build_object(
    'ok', true,
    'cnpj_mascarado', private.mascarar_cnpj(v_digitos),
    'total_sugestoes', jsonb_array_length(v_sugestoes),
    'sugestoes', v_sugestoes
  );
end;
$function$;

-- Baixas desfeitas: quando uma fatura 'paga' volta a outro status (ou e
-- removida) no espelho, o SF precisa saber — senao a Maria mantem o ok em
-- parcela que reabriu. A trigger registra o estado ANTES da baixa sumir.
create table if not exists public.financeiro_baixas_desfeitas (
  id bigint generated always as identity primary key,
  unidade_id uuid not null,
  unidade_codigo text,
  emusys_fatura_id bigint not null,
  emusys_matricula_id bigint,
  emusys_student_id bigint,
  status_novo text,
  data_pagamento_anterior date,
  valor_pago_anterior numeric,
  forma_pagamento_anterior text,
  detectado_em timestamptz not null default now()
);

comment on table public.financeiro_baixas_desfeitas is
  'Auditoria: fatura que era paga e voltou a aberta/estornada/removida no espelho Emusys.';

alter table public.financeiro_baixas_desfeitas enable row level security;
revoke all on public.financeiro_baixas_desfeitas from public, anon, authenticated;
grant all on public.financeiro_baixas_desfeitas to service_role;
grant select on public.financeiro_baixas_desfeitas to mila_acesso_restrito, fabio_agent, lia_acesso_restrito;

create or replace function private.trg_financeiro_baixa_desfeita()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.financeiro_baixas_desfeitas (
    unidade_id, unidade_codigo, emusys_fatura_id,
    emusys_matricula_id, emusys_student_id,
    status_novo, data_pagamento_anterior,
    valor_pago_anterior, forma_pagamento_anterior
  ) values (
    coalesce(new.unidade_id, old.unidade_id), coalesce(new.unidade_codigo, old.unidade_codigo),
    old.emusys_fatura_id, old.emusys_matricula_id, old.emusys_student_id,
    case when tg_op = 'DELETE' then 'removida' else new.status end,
    old.data_pagamento, old.valor_pago, old.payload->>'forma_pagamento_transacao'
  );
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_baixa_desfeita on public.emusys_faturas;
create trigger trg_baixa_desfeita
  after update on public.emusys_faturas
  for each row
  when (old.status = 'paga' and new.status is distinct from 'paga')
  execute function private.trg_financeiro_baixa_desfeita();

drop trigger if exists trg_baixa_desfeita_delete on public.emusys_faturas;
create trigger trg_baixa_desfeita_delete
  after delete on public.emusys_faturas
  for each row
  when (old.status = 'paga')
  execute function private.trg_financeiro_baixa_desfeita();

-- Baixadas para o SF: leitura direta do espelho emusys_faturas (fresco a
-- cada 15 min na competencia vigente; 60 min em M-1/M-2; backlog 2h no
-- resto) + a auditoria de baixas desfeitas, numa unica corrente ordenada.
--
-- Paginacao por cursor composto: '2026-10-08T16:33:26.703Z|45198'.
-- Filtro INCLUSIVO (sincronizado_em, emusys_fatura_id) >= cursor — o SF
-- deduplica por emusys_fatura_id. tem_mais/proximo_cursor fecham o ciclo.
create or replace function public.exportar_financeiro_baixadas_v1(
  p_desde_data_pagamento date default null,
  p_sincronizado_desde timestamptz default null,
  p_cursor text default null,
  p_unidade_id uuid default null,
  p_limite integer default 500
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 500), 2000));
  v_cur_ts timestamptz;
  v_cur_id bigint := -9223372036854775808;
  v_eventos jsonb;
  v_tem_mais boolean := false;
  v_cursor text;
begin
  if p_desde_data_pagamento is null and p_sincronizado_desde is null and p_cursor is null then
    raise exception 'informe desde_data_pagamento, sincronizado_desde ou cursor' using errcode = '22023';
  end if;

  if p_cursor is not null then
    v_cur_ts := split_part(p_cursor, '|', 1)::timestamptz;
    v_cur_id := split_part(p_cursor, '|', 2)::bigint;
  end if;

  with eventos as (
    select
      'baixada'::text as situacao,
      ef.unidade_id, u.codigo as unidade_codigo, ef.emusys_fatura_id,
      ef.emusys_matricula_id, ef.emusys_student_id,
      a.id as aluno_id,
      ef.descricao, ef.data_vencimento, ef.data_pagamento,
      ef.valor_original, ef.valor_pago, ef.juros_e_multa,
      ef.payload->>'forma_pagamento_transacao' as forma_pagamento,
      ef.payload->>'transacao_id' as transacao_id,
      null::text as status_novo,
      ef.synced_at as sincronizado_em
    from public.emusys_faturas ef
    join public.unidades u on u.id = ef.unidade_id
    left join public.alunos a
      on a.unidade_id = ef.unidade_id
     and a.emusys_matricula_id = ef.emusys_matricula_id::text
    where ef.status = 'paga'
      and (p_unidade_id is null or ef.unidade_id = p_unidade_id)

    union all

    select
      'desfeita'::text,
      d.unidade_id, coalesce(d.unidade_codigo, u2.codigo), d.emusys_fatura_id,
      d.emusys_matricula_id, d.emusys_student_id,
      a2.id,
      null, null, d.data_pagamento_anterior,
      null, d.valor_pago_anterior, null,
      d.forma_pagamento_anterior, null,
      d.status_novo,
      d.detectado_em
    from public.financeiro_baixas_desfeitas d
    left join public.unidades u2 on u2.id = d.unidade_id
    left join public.alunos a2
      on a2.unidade_id = d.unidade_id
     and a2.emusys_matricula_id = d.emusys_matricula_id::text
    where (p_unidade_id is null or d.unidade_id = p_unidade_id)
  ),
  filtrados as (
    select * from eventos e
    where
      case when p_cursor is not null
           then (e.sincronizado_em, e.emusys_fatura_id) >= (v_cur_ts, v_cur_id)
           else true end
      and case when p_cursor is null and p_sincronizado_desde is not null
           then e.sincronizado_em >= p_sincronizado_desde
           else true end
      and case when p_desde_data_pagamento is not null
           then e.data_pagamento >= p_desde_data_pagamento
                or (e.situacao = 'desfeita' and e.sincronizado_em::date >= p_desde_data_pagamento)
           else true end
    order by e.sincronizado_em, e.emusys_fatura_id
    limit v_limite + 1
  )
  select jsonb_agg(to_jsonb(f)) into v_eventos from filtrados f;

  if v_eventos is not null and jsonb_array_length(v_eventos) > v_limite then
    v_tem_mais := true;
    v_eventos := (select jsonb_agg(elem) from (
      select elem from jsonb_array_elements(v_eventos) with ordinality as t(elem, ord)
      where ord <= v_limite order by ord
    ) ultimos);
  end if;

  if v_eventos is not null and jsonb_array_length(v_eventos) > 0 then
    v_cursor := (
      select (elem->>'sincronizado_em') || '|' || (elem->>'emusys_fatura_id')
      from jsonb_array_elements(v_eventos) with ordinality as t(elem, ord)
      order by ord desc limit 1
    );
  end if;

  return jsonb_build_object(
    'gerado_em', now(),
    'total', coalesce(jsonb_array_length(v_eventos), 0),
    'tem_mais', v_tem_mais,
    'proximo_cursor', v_cursor,
    'itens', coalesce(v_eventos, '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.exportar_financeiro_baixadas_v1(date, timestamptz, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.exportar_financeiro_baixadas_v1(date, timestamptz, text, uuid, integer) to service_role;

-- Permissoes iguais ao resolvedor de CPF.
revoke all on function public.publicar_financeiro_cnpj_vinculos_v1(jsonb, text) from public, anon, authenticated;
revoke all on function public.resolver_financeiro_cnpj_v1(text) from public, anon, authenticated;
grant execute on function public.publicar_financeiro_cnpj_vinculos_v1(jsonb, text) to service_role;
grant execute on function public.resolver_financeiro_cnpj_v1(text) to service_role;
grant execute on function public.resolver_financeiro_cnpj_v1(text) to mila_acesso_restrito, fabio_agent, lia_acesso_restrito;
