-- A fila `professores_emusys_divergencias` roda todo dia as 07:00, classifica bem e
-- NUNCA TEVE TELA — zero arquivos em `src/` a referenciam. Foi por isso que o caso do
-- Jonathan (professor ativo na Barra com 10 aulas futuras e nenhum vinculo) ficou aberto
-- desde 07/08 sem ninguem ver: so aparecia para quem fosse cavar no banco.
--
-- ⚠️ A tabela tem RLS LIGADO e ZERO POLICIES. Uma tela lendo direto viria vazia e falharia
-- em silencio — e o mesmo bug que ja pegou a Agenda duas vezes neste projeto. Por isso
-- expomos por RPC SECURITY DEFINER, sem destrancar a tabela.
--
-- Escopo dentro da funcao (ja que RLS nao alcanca SECURITY DEFINER): admin ve tudo; os
-- demais veem so as unidades a que tem vinculo. E a mesma forma das policies do projeto.
--
-- ⚠️ Esta migration deixa um vazamento que a IRMA (`..._e_ferramenta_de_gestao_nao_de_...`)
-- corrige: escopo por unidade sozinho deixa o PROFESSOR ver a fila da unidade dele.
-- Mantida no historico porque e onde mora o desenho das duas RPCs.
do $mig$
begin
  ---------------------------------------------------------------------------
  -- 1. LEITURA
  ---------------------------------------------------------------------------
  create or replace function public.get_professores_divergencias_emusys(
    p_incluir_resolvidas boolean default false,
    p_unidade_id uuid default null
  )
  returns table (
    id bigint,
    unidade_id uuid,
    unidade_codigo text,
    professor_id integer,
    professor_nome text,
    professor_ativo boolean,
    emusys_professor_id integer,
    tipo_divergencia text,
    severidade text,
    nome_la text,
    nome_emusys text,
    sugestao_acao text,
    sugestao_texto text,
    valor_nosso jsonb,
    valor_emusys jsonb,
    resolvido boolean,
    decisao text,
    decidido_por text,
    decidido_em timestamptz,
    detectado_em timestamptz,
    dias_em_aberto integer,
    aulas_futuras_do_emusys integer
  )
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
  as $fn$
    select
      d.id,
      d.unidade_id,
      u.codigo as unidade_codigo,
      d.professor_id,
      coalesce(p.nome, d.nome_la, d.nome_emusys) as professor_nome,
      p.ativo as professor_ativo,
      d.emusys_professor_id,
      d.tipo_divergencia,
      d.severidade,
      d.nome_la,
      d.nome_emusys,
      nullif(d.sugestao ->> 'acao', '') as sugestao_acao,
      coalesce(
        nullif(d.sugestao ->> 'validacao_humana', ''),
        nullif(d.sugestao ->> 'resolucao_final', ''),
        nullif(d.sugestao ->> 'regra', '')
      ) as sugestao_texto,
      d.valor_nosso,
      d.valor_emusys,
      d.resolvido,
      d.decisao,
      d.decidido_por,
      d.decidido_em,
      d.detectado_em,
      greatest(0, (current_date - d.detectado_em::date))::integer as dias_em_aberto,
      -- Quantas aulas FUTURAS existem para esse id do Emusys sem professor nosso.
      -- E o sinal de urgencia: divergencia com aula marcada e alguem dando aula agora.
      (
        select count(*)::integer
        from public.aulas_emusys ae
        where d.emusys_professor_id is not null
          and ae.emusys_professor_id = d.emusys_professor_id
          and ae.unidade_id = d.unidade_id
          and ae.professor_id is null
          and ae.data_aula > current_date
          and not coalesce(ae.cancelada, false)
      ) as aulas_futuras_do_emusys
    from public.professores_emusys_divergencias d
    join public.unidades u on u.id = d.unidade_id
    left join public.professores p on p.id = d.professor_id
    where (p_incluir_resolvidas or not d.resolvido)
      and (p_unidade_id is null or d.unidade_id = p_unidade_id)
      -- escopo do usuario: RLS nao alcanca SECURITY DEFINER, entao e aqui que se decide
      and (
        (select public.is_admin())
        or d.unidade_id in (select public.get_user_unidade_ids())
      )
    order by
      d.resolvido,
      case d.severidade when 'alta' then 1 when 'media' then 2 else 3 end,
      d.detectado_em;
  $fn$;

  comment on function public.get_professores_divergencias_emusys(boolean, uuid) is
    'Fila de divergencias de identidade de professor (nosso cadastro x Emusys). A tabela tem RLS sem policy de proposito; esta RPC e a unica porta de leitura. Escopo: admin ve tudo, demais veem so as proprias unidades.';

  ---------------------------------------------------------------------------
  -- 2. DECISAO
  ---------------------------------------------------------------------------
  create or replace function public.decidir_professor_divergencia_emusys(
    p_id bigint,
    p_decisao text,
    p_observacao text default null
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
  as $fn$
  declare
    v_linha public.professores_emusys_divergencias%rowtype;
    v_autor text;
  begin
    if coalesce(btrim(p_decisao), '') = '' then
      raise exception 'DIVERGENCIA_DECISAO_VAZIA: informe a decisao'
        using errcode = '22023';
    end if;

    select * into v_linha
      from public.professores_emusys_divergencias
     where id = p_id;

    if not found then
      raise exception 'DIVERGENCIA_NAO_ENCONTRADA: id %', p_id
        using errcode = 'P0002';
    end if;

    -- Mesmo escopo da leitura. SECURITY DEFINER ignora RLS, entao a checagem e explicita.
    if not (
      (select public.is_admin())
      or v_linha.unidade_id in (select public.get_user_unidade_ids())
    ) then
      raise exception 'DIVERGENCIA_FORA_DO_ESCOPO: sem acesso a unidade desta divergencia'
        using errcode = '42501';
    end if;

    if v_linha.resolvido then
      raise exception 'DIVERGENCIA_JA_RESOLVIDA: id % decidido em % por %',
        p_id, v_linha.decidido_em, v_linha.decidido_por
        using errcode = '23505';
    end if;

    -- Autoria: e-mail do JWT. Nao aceita valor vindo do cliente, de proposito.
    v_autor := coalesce(
      nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''),
      'usuario:' || coalesce(auth.uid()::text, 'desconhecido')
    );

    update public.professores_emusys_divergencias
       set resolvido = true,
           decisao = btrim(p_decisao),
           decidido_por = v_autor,
           decidido_em = now(),
           sugestao = coalesce(sugestao, '{}'::jsonb)
                      || case
                           when coalesce(btrim(p_observacao), '') = '' then '{}'::jsonb
                           else jsonb_build_object('observacao_humana', btrim(p_observacao))
                         end
     where id = p_id
       and not resolvido        -- guarda contra corrida: 2 pessoas decidindo junto
    returning * into v_linha;

    if not found then
      raise exception 'DIVERGENCIA_JA_RESOLVIDA: alguem decidiu no mesmo instante'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'id', v_linha.id,
      'resolvido', v_linha.resolvido,
      'decisao', v_linha.decisao,
      'decidido_por', v_linha.decidido_por,
      'decidido_em', v_linha.decidido_em
    );
  end;
  $fn$;

  comment on function public.decidir_professor_divergencia_emusys(bigint, text, text) is
    'Registra a decisao humana numa divergencia de professor. Autoria vem do JWT, nunca do cliente. Recusa decidir fora do escopo do usuario e recusa redecidir (guarda de corrida no proprio UPDATE).';

  ---------------------------------------------------------------------------
  -- 3. ACL — ALTER DEFAULT PRIVILEGES deste projeto concede EXECUTE a `anon`.
  --    `revoke from public` NAO basta: precisa ser nominal.
  ---------------------------------------------------------------------------
  revoke all on function public.get_professores_divergencias_emusys(boolean, uuid) from public, anon;
  grant execute on function public.get_professores_divergencias_emusys(boolean, uuid) to authenticated, service_role;

  revoke all on function public.decidir_professor_divergencia_emusys(bigint, text, text) from public, anon;
  grant execute on function public.decidir_professor_divergencia_emusys(bigint, text, text) to authenticated, service_role;
end
$mig$;
