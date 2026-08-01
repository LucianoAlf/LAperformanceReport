-- Prosodia V2 da pesquisa de evasao.
-- A Edge compativel com os placeholders V1 e V2 deve ser publicada antes
-- desta migration. Templates V1 permanecem imutaveis para auditoria.

begin;

do $$
declare
  v_templates_v1 integer;
begin
  select count(*)
    into v_templates_v1
  from public.pesquisa_evasao_templates
  where chave = 'evasao_aberta'
    and versao = 1
    and publico in ('direto', 'responsavel');

  if v_templates_v1 <> 2 then
    raise exception 'templates V1 ausentes: esperado 2, encontrado %',
      v_templates_v1;
  end if;
end
$$;

insert into public.pesquisa_evasao_templates (
  chave,
  versao,
  publico,
  corpo,
  ativo,
  criado_por_usuario_id
)
values
(
  'evasao_aberta', 2, 'direto',
  $template_direto$
{{aluno_primeiro_nome}}! Aqui é {{assinatura_com_artigo}}, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que você passou com a gente. As portas estarão sempre abertas para você!

Posso te fazer uma única pergunta?

> *Se você pudesse mudar alguma coisa aqui na LA para que a sua experiência fosse melhor, o que você mudaria?*

_Pedimos a gentileza de responder com sinceridade. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos._

Pode responder com texto ou áudio. Fique à vontade. 🙏
$template_direto$,
  false,
  null
),
(
  'evasao_aberta', 2, 'responsavel',
  $template_responsavel$
{{responsavel_primeiro_nome}}! Aqui é {{assinatura_com_artigo}}, do Sucesso do Aluno da LA Music. 🎵

Queria agradecer pelo tempo que {{aluno_primeiro_nome}} passou com a gente. As portas estarão sempre abertas!

Posso lhe fazer uma única pergunta?

> *Se você pudesse mudar alguma coisa aqui na LA para que a experiência {{aluno_com_preposicao}} fosse melhor, o que você mudaria?*

_Pedimos a gentileza de responder com sinceridade. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos._

Pode responder com texto ou áudio. Fique à vontade. 🙏
$template_responsavel$,
  false,
  null
)
on conflict (chave, versao, publico)
do update set
  corpo = excluded.corpo,
  criado_por_usuario_id = excluded.criado_por_usuario_id;

update public.pesquisa_evasao_templates
set ativo = false
where chave = 'evasao_aberta'
  and publico in ('direto', 'responsavel')
  and ativo = true;

update public.pesquisa_evasao_templates
set ativo = true
where chave = 'evasao_aberta'
  and versao = 2
  and publico in ('direto', 'responsavel');

do $$
declare
  v_templates_v2 integer;
  v_publicos_ativos integer;
  v_ativos_invalidos integer;
begin
  select count(*)
    into v_templates_v2
  from public.pesquisa_evasao_templates
  where chave = 'evasao_aberta'
    and versao = 2
    and publico in ('direto', 'responsavel');

  if v_templates_v2 <> 2 then
    raise exception 'templates V2 invalidos: esperado 2, encontrado %',
      v_templates_v2;
  end if;

  select count(*)
    into v_publicos_ativos
  from (
    select publico
    from public.pesquisa_evasao_templates
    where chave = 'evasao_aberta'
      and ativo = true
      and publico in ('direto', 'responsavel')
    group by publico
  ) as publicos;

  select count(*)
    into v_ativos_invalidos
  from (
    select publico, count(*) as quantidade
    from public.pesquisa_evasao_templates
    where chave = 'evasao_aberta'
      and ativo = true
      and publico in ('direto', 'responsavel')
    group by publico
    having count(*) <> 1
  ) as ativos_invalidos;

  if v_publicos_ativos <> 2 or v_ativos_invalidos <> 0 then
    raise exception
      'templates V2 ativos invalidos: publicos %, grupos invalidos %',
      v_publicos_ativos,
      v_ativos_invalidos;
  end if;
end
$$;

-- A fila aplica a mesma decisao conservadora da Edge. Sem data de nascimento,
-- o destinatario nao pode ser determinado com seguranca e o envio fica bloqueado.

create or replace function public.listar_evadidos_para_pesquisa_v2(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_status varchar,
  p_ano integer,
  p_mes integer,
  p_busca text
)
returns table (
  total_count bigint,
  evasao_id integer,
  aluno_id integer,
  nome text,
  telefone text,
  curso text,
  professor text,
  tempo_meses integer,
  data_evasao date,
  motivo_catalogado text,
  motivo_legado text,
  pesquisa_producao_status text,
  pesquisa_producao_id uuid,
  resposta_producao_texto text,
  resposta_producao_audio_url text,
  resposta_producao_tipo text,
  respondido_producao_em timestamptz,
  is_menor boolean,
  responsavel_nome text,
  publico_tipo text,
  bloqueio_codigo text,
  elegivel_envio boolean,
  elegibilidade_regra text,
  possui_historico_teste boolean,
  quantidade_testes bigint,
  ultimo_teste_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with base_autorizada as (
  select
    m.id as evasao_id,
    m.aluno_id,
    a.id as aluno_registro_id,
    coalesce(m.aluno_nome, a.nome)::text as nome,
    nullif(btrim(m.telefone_snapshot), '')::text as telefone,
    c.nome::text as curso,
    pr.nome::text as professor,
    greatest(
      0,
      coalesce(m.tempo_permanencia_meses, a.tempo_permanencia_meses, 0)
    )::integer as tempo_meses,
    m.data as data_evasao,
    ms.nome::text as motivo_catalogado,
    m.motivo::text as motivo_legado,
    coalesce(producao.status, 'pendente')::text as pesquisa_producao_status,
    producao.id as pesquisa_producao_id,
    producao.resposta_texto::text as resposta_producao_texto,
    producao.resposta_audio_url::text as resposta_producao_audio_url,
    producao.resposta_tipo::text as resposta_producao_tipo,
    producao.respondido_em as respondido_producao_em,
    a.data_nascimento,
    (
      a.data_nascimento is not null
      and extract(year from age(current_date, a.data_nascimento))::integer < 18
    ) as is_menor,
    a.responsavel_nome::text as responsavel_nome,
    a.responsavel_telefone::text as responsavel_telefone,
    publico_interno.aluno_id as publico_interno_aluno_id,
    case
      when publico_interno.aluno_id is not null then publico_interno.tipo
      when a.data_nascimento is null then 'indeterminado'
      when extract(year from age(current_date, a.data_nascimento))::integer < 18
        then 'responsavel'
      else 'aluno'
    end::text as publico_tipo,
    coalesce(testes.quantidade_testes, 0)::bigint as quantidade_testes,
    testes.ultimo_teste_em
  from public.movimentacoes_admin as m
  left join public.alunos as a on a.id = m.aluno_id
  left join public.pesquisa_evasao_publicos_internos as publico_interno
    on publico_interno.aluno_id = m.aluno_id
   and publico_interno.ativo = true
  left join public.cursos as c on c.id = coalesce(m.curso_id, a.curso_id)
  left join public.professores as pr
    on pr.id = coalesce(m.professor_id, a.professor_atual_id)
  left join public.motivos_saida as ms on ms.id = m.motivo_saida_id
  left join lateral (
    select pe0.*
    from public.pesquisa_evasao as pe0
    where pe0.evasao_id = m.id
      and pe0.modo_teste = false
    order by pe0.created_at desc, pe0.id desc
    limit 1
  ) as producao on true
  left join lateral (
    select
      count(*) filter (where pe_t.modo_teste = true)::bigint as quantidade_testes,
      max(coalesce(pe_t.enviado_em, pe_t.created_at))
        filter (where pe_t.modo_teste = true) as ultimo_teste_em
    from public.pesquisa_evasao as pe_t
    where pe_t.evasao_id = m.id
  ) as testes on true
  where m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id)
    and (p_unidade_id is null or m.unidade_id = p_unidade_id)
    and (
      auth.role() = 'service_role'
      or public.fn_pesquisa_evasao_usuario_interno_ativo()
    )
    and (p_status is null or coalesce(producao.status, 'pendente') = p_status)
    and (p_ano is null or extract(year from m.data)::integer = p_ano)
    and (p_mes is null or extract(month from m.data)::integer = p_mes)
    and (
      nullif(btrim(p_busca), '') is null
      or coalesce(m.aluno_nome, a.nome, '') ilike ('%' || btrim(p_busca) || '%')
      or coalesce(c.nome, '') ilike ('%' || btrim(p_busca) || '%')
      or coalesce(pr.nome, '') ilike ('%' || btrim(p_busca) || '%')
      or coalesce(ms.nome, m.motivo, '') ilike ('%' || btrim(p_busca) || '%')
      or coalesce(m.telefone_snapshot, '') ilike ('%' || btrim(p_busca) || '%')
    )
),
telefone_extraida as (
  select
    base_autorizada.*,
    nullif(regexp_replace(telefone, '[^0-9]', '', 'g'), '') as telefone_digitos,
    nullif(
      regexp_replace(responsavel_telefone, '[^0-9]', '', 'g'),
      ''
    ) as responsavel_telefone_digitos
  from base_autorizada
),
classificada as (
  select
    telefone_extraida.*,
    case
      when telefone_digitos ~ '^[0-9]{10,11}$' then '55' || telefone_digitos
      when telefone_digitos ~ '^55[0-9]{10,11}$' then telefone_digitos
      else telefone_digitos
    end as telefone_normalizado,
    case
      when responsavel_telefone_digitos ~ '^[0-9]{10,11}$'
        then '55' || responsavel_telefone_digitos
      when responsavel_telefone_digitos ~ '^55[0-9]{10,11}$'
        then responsavel_telefone_digitos
      else responsavel_telefone_digitos
    end as responsavel_telefone_normalizado
  from telefone_extraida
),
bloqueada as (
  select
    classificada.*,
    case
      when aluno_id is null or aluno_registro_id is null then 'sem_aluno'
      when data_nascimento is null then 'data_nascimento_ausente'
      when publico_interno_aluno_id is not null then 'publico_interno'
      when is_menor and nullif(btrim(responsavel_nome), '') is null
        then 'responsavel_sem_nome'
      when is_menor and responsavel_telefone_normalizado is null
        then 'responsavel_sem_telefone'
      when is_menor
       and responsavel_telefone_normalizado !~ '^55[0-9]{10,11}$'
        then 'responsavel_telefone_invalido'
      when is_menor
       and telefone_normalizado is distinct from responsavel_telefone_normalizado
        then 'telefone_responsavel_divergente'
      when telefone_normalizado is null then 'sem_telefone'
      when telefone_normalizado !~ '^55[0-9]{10,11}$' then 'telefone_invalido'
      when motivo_catalogado is null then 'motivo_nao_catalogado'
      when exists (
        select 1
        from public.pesquisa_evasao as pe_aberta
        cross join lateral (
          select nullif(
            regexp_replace(pe_aberta.telefone_destino_snapshot, '[^0-9]', '', 'g'),
            ''
          ) as telefone_aberta_digitos
        ) as telefone_aberta
        cross join lateral (
          select case
            when telefone_aberta_digitos ~ '^[0-9]{10,11}$'
              then '55' || telefone_aberta_digitos
            when telefone_aberta_digitos ~ '^55[0-9]{10,11}$'
              then telefone_aberta_digitos
            else telefone_aberta_digitos
          end as telefone_aberta_normalizado
        ) as telefone_aberta_canonica
        where pe_aberta.modo_teste = false
          and pe_aberta.evasao_id <> classificada.evasao_id
          and telefone_aberta_normalizado = classificada.telefone_normalizado
          and pe_aberta.envio_status in (
            'enviando', 'incerto', 'enviado', 'entregue', 'lido'
          )
          and pe_aberta.resposta_status in ('sem_resposta', 'coletando')
      ) then 'pesquisa_aberta_no_mesmo_numero'
      else null
    end::text as bloqueio_codigo
  from classificada
),
elegibilidade as (
  select
    bloqueada.*,
    (
      bloqueio_codigo is null
      and pesquisa_producao_status in ('pendente', 'falha_envio', 'sem_whatsapp')
    ) as elegivel_envio,
    case
      when bloqueio_codigo is not null then bloqueio_codigo
      when pesquisa_producao_status not in (
        'pendente', 'falha_envio', 'sem_whatsapp'
      ) then 'status_producao_nao_enviavel'
      else 'elegivel'
    end::text as elegibilidade_regra
  from bloqueada
)
select
  count(*) over () as total_count,
  evasao_id,
  aluno_id,
  nome,
  telefone,
  curso,
  professor,
  tempo_meses,
  data_evasao,
  motivo_catalogado,
  motivo_legado,
  pesquisa_producao_status,
  pesquisa_producao_id,
  resposta_producao_texto,
  resposta_producao_audio_url,
  resposta_producao_tipo,
  respondido_producao_em,
  is_menor,
  responsavel_nome,
  publico_tipo,
  bloqueio_codigo,
  elegivel_envio,
  elegibilidade_regra,
  quantidade_testes > 0 as possui_historico_teste,
  quantidade_testes,
  ultimo_teste_em
from elegibilidade
order by
  case pesquisa_producao_status
    when 'pendente' then 1
    when 'falha_envio' then 2
    when 'sem_whatsapp' then 3
    when 'enviado' then 4
    when 'respondido' then 5
    else 6
  end,
  data_evasao desc,
  evasao_id desc
limit least(greatest(coalesce(p_limite, 50), 1), 100)
offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.listar_evadidos_para_pesquisa_v2(
  uuid, integer, integer, varchar, integer, integer, text
) from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.listar_evadidos_para_pesquisa_v2(
  uuid, integer, integer, varchar, integer, integer, text
) to authenticated, service_role;

commit;
