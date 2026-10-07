-- M11 — Palco com quantidades + pedidos de "toca junto" + edição após envio.
--
-- Contrato fechado com o LA Teacher (30/09): a view `vw_relatorio_anual_recital_v1`
-- ganhou `rider_quantidades` (jsonb {id: n}, ausente = 1), `rider_extras`
-- (jsonb [{gaveta, texto, qtd}]) e `editado_apos_envio_em`; o CASE fixo de nomes do
-- sync é substituído pelo catálogo `relatorio_anual_item_palco` (id/rotulo/tipo).
-- `rider_outros` agora duplica os extras em texto — só entra quando NÃO há extras.
-- Toca junto: `vw_relatorio_anual_toca_junto_v1` é service_role; a coordenação lê
-- por `evento_toca_junto_lista_v1` (escopada) e decide por `evento_toca_junto_decidir_v1`,
-- que junta na grade ANTES de confirmar — se a junção falha, o pedido não vira
-- 'confirmado' órfão.

alter table public.evento_apresentacao
  add column if not exists editado_apos_envio_em timestamptz;

comment on column public.evento_apresentacao.editado_apos_envio_em is
  'Espelho de vw_relatorio_anual_recital_v1.editado_apos_envio_em: quando o professor '
  'mexeu na música ou no palco depois de enviar o relatório. A grade mostra o selo '
  '"editou após envio" — a coordenação confere antes de aprovar.';

create or replace function public.evento_recital_sincronizar_v1(p_evento_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v record;
  v_ap_id bigint;
  v_pessoa text;
  v_casadas integer := 0;
  v_nao_casadas jsonb := '[]'::jsonb;
  v_campos integer := 0;
  v_itens integer := 0;
  v_sem_mapa text[] := '{}';
  v_codigo text;
  v_tipo text;
  v_nome text;
  v_qtd integer;
  v_extra jsonb;
  v_todos_adm_vazios boolean;
begin
  if not public.fn_evento_pode_ver(p_evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;

  -- Toda escrita que esta função faz nos campos de detalhe é do professor.
  perform set_config('evento.sync', '1', true);

  for v in
    select * from public.vw_relatorio_anual_recital_v1 where evento_id = p_evento_id
  loop
    v_pessoa := public.fn_evento_pessoa_chave(v.aluno_id, p_evento_id);

    select a.id into v_ap_id
      from public.evento_apresentacao a
      join public.cursos c on c.id = a.curso_id
     where a.evento_id = p_evento_id
       and a.pessoa_chave = v_pessoa
       and public.fn_curso_base(c.nome) = v.curso_chave
     limit 1;

    if v_ap_id is null then
      v_nao_casadas := v_nao_casadas || jsonb_build_object(
        'aluno_id', v.aluno_id, 'curso', v.curso, 'relatorio_id', v.relatorio_id);
      continue;
    end if;

    v_casadas := v_casadas + 1;

    -- O snapshot atualiza SEMPRE: é o que alimenta o painel de relatórios e a
    -- divergência, mesmo quando o professor ainda não lançou a música. O selo de
    -- edição após o envio vai junto — é estado do relatório, não campo editável.
    update public.evento_apresentacao
       set professor = to_jsonb(v),
           professor_em = v.atualizado_em,
           editado_apos_envio_em = v.editado_apos_envio_em,
           updated_at = now()
     where id = v_ap_id;

    -- Só copia os detalhes depois que o professor LANÇOU o cartão (musica_lancada_em).
    if v.musica_lancada_em is not null then
      select (a.musica is null and a.musica_artista is null and a.musica_link is null
              and a.playback_path is null and a.duracao_segundos is null)
        into v_todos_adm_vazios
        from public.evento_apresentacao a where a.id = v_ap_id;

      if v_todos_adm_vazios or exists (
        select 1 from public.evento_apresentacao a
         where a.id = v_ap_id and a.detalhes_origem = 'professor'
      ) then
        -- Apresentação virgem → o professor toma posse; já do professor → ele é a fonte.
        update public.evento_apresentacao a
           set musica = v.musica_titulo,
               musica_artista = v.musica_artista,
               musica_link = v.musica_link,
               playback_path = v.musica_playback_path,
               duracao_segundos = v.musica_duracao_segundos,
               tem_playback = not coalesce(v.musica_ao_vivo, false)
                              and (v.musica_link is not null or v.musica_playback_path is not null),
               detalhes_origem = 'professor',
               updated_at = now()
         where a.id = v_ap_id;
        v_campos := v_campos + 1;
      else
        -- O ADM já escreveu algo: só o que estiver VAZIO é preenchido. O que divergir
        -- fica como está e a tela acusa comparando com o snapshot.
        update public.evento_apresentacao a
           set musica = coalesce(a.musica, v.musica_titulo),
               musica_artista = coalesce(a.musica_artista, v.musica_artista),
               musica_link = coalesce(a.musica_link, v.musica_link),
               playback_path = coalesce(a.playback_path, v.musica_playback_path),
               duracao_segundos = coalesce(a.duracao_segundos, v.musica_duracao_segundos),
               updated_at = now()
         where a.id = v_ap_id;
      end if;

      -- Rider: a lista do professor é a fonte — espelhada por inteiro a cada sync.
      delete from public.evento_apresentacao_item
       where apresentacao_id = v_ap_id and origem = 'professor';

      if not coalesce(v.rider_nada, false) then
        foreach v_codigo in array coalesce(v.rider_itens, '{}'::text[]) loop
          -- Nome e tipo vêm do catálogo do LA Teacher. Id fora dele ou inativo cai em
          -- codigos_sem_mapa (visível no retorno) e entra com o código cru como nome,
          -- sem quebrar a rodada — migração gradual não pode falhar por item novo.
          select i.rotulo, i.tipo into v_nome, v_tipo
            from public.relatorio_anual_item_palco i
           where i.id = v_codigo and i.ativo;
          if v_nome is null then
            v_sem_mapa := v_sem_mapa || v_codigo;
            v_nome := replace(v_codigo, '_', ' ');
            v_tipo := 'equipamento';
          end if;
          begin
            v_qtd := greatest(coalesce((v.rider_quantidades ->> v_codigo)::integer, 1), 1);
          exception when others then
            -- Quantidade malformada não pode derrubar a rodada inteira — cai para 1 e
            -- marca o código para a coordenação conferir.
            v_qtd := 1;
            v_sem_mapa := v_sem_mapa || v_codigo;
          end;
          insert into public.evento_apresentacao_item
            (apresentacao_id, tipo, nome, quantidade, origem, codigo)
          values (v_ap_id, v_tipo, v_nome, v_qtd, 'professor', v_codigo);
          v_itens := v_itens + 1;
        end loop;

        -- Extras: o que o professor escreveu fora da lista ({gaveta, texto, qtd}).
        for v_extra in
          select value from jsonb_array_elements(coalesce(v.rider_extras, '[]'::jsonb))
        loop
          v_nome := nullif(btrim(coalesce(v_extra ->> 'texto', '')), '');
          if v_nome is not null then
            v_qtd := greatest(coalesce((v_extra ->> 'qtd')::integer, 1), 1);
            insert into public.evento_apresentacao_item
              (apresentacao_id, tipo, nome, quantidade, origem, codigo)
            values (v_ap_id, 'equipamento', v_nome, v_qtd, 'professor', 'extra');
            v_itens := v_itens + 1;
          end if;
        end loop;

        -- rider_outros só entra quando NÃO há extras: a view agora serializa os extras
        -- em texto dentro dele, e mapear os dois duplicaria cada item. O fallback cobre
        -- relatórios antigos (extras null) com texto livre residual.
        if v.rider_extras is null
           and nullif(btrim(coalesce(v.rider_outros, '')), '') is not null then
          insert into public.evento_apresentacao_item
            (apresentacao_id, tipo, nome, quantidade, origem, codigo)
          values (v_ap_id, 'equipamento', btrim(v.rider_outros), 1, 'professor', 'outro');
          v_itens := v_itens + 1;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'evento_id', p_evento_id,
    'relatorios_lidos', (select count(*) from public.vw_relatorio_anual_recital_v1
                          where evento_id = p_evento_id),
    'casadas', v_casadas,
    'nao_casadas', v_nao_casadas,
    'apresentacoes_atualizadas', v_campos,
    'itens_professor', v_itens,
    'codigos_sem_mapa', to_jsonb(v_sem_mapa),
    'sincronizado_em', now()
  );
end;
$function$;

-- ── Toca junto ───────────────────────────────────────────────────────────────
-- A view é service_role; estas RPCs dão à coordenação acesso escopado pelo evento.

drop function if exists public.evento_toca_junto_lista_v1(bigint);
create function public.evento_toca_junto_lista_v1(p_evento_id bigint)
returns table (
  id bigint,
  status text,
  aluno_id integer,
  aluno_nome varchar,
  curso_chave text,
  apresentacao_id bigint,
  com_aluno_id integer,
  com_aluno_nome varchar,
  com_curso_chave text,
  com_apresentacao_id bigint,
  pedido_por_professor_id integer,
  pedido_por_professor_nome varchar,
  pedido_em timestamptz,
  decidido_por text,
  decidido_em timestamptz,
  motivo text
)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select t.id, t.status, t.aluno_id, t.aluno_nome, t.curso_chave, t.apresentacao_id,
         t.com_aluno_id, t.com_aluno_nome, t.com_curso_chave, t.com_apresentacao_id,
         t.pedido_por_professor_id, t.pedido_por_professor_nome, t.pedido_em,
         t.decidido_por, t.decidido_em, t.motivo
    from public.vw_relatorio_anual_toca_junto_v1 t
   where t.evento_id = p_evento_id
     and public.fn_evento_pode_ver(p_evento_id)
   order by t.pedido_em;
$$;

comment on function public.evento_toca_junto_lista_v1 is
  'Pedidos de "toca junto" do evento (todos os status — a grade filtra ''pedido''). '
  'A view do LA Teacher é service_role; aqui a coordenação lê com o escopo do evento.';

-- Um único passo atômico: aprovar JUNTA na grade e só confirma se a junção funcionou
-- (a RPC do LA Teacher é chamada por último — se o juntar lançar erro, a transação
-- desfaz tudo e o pedido continua 'pedido'). Recusar exige motivo.
create or replace function public.evento_toca_junto_decidir_v1(
  p_pedido_id bigint,
  p_aprovar boolean,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v record;
  v_curso_membro integer;
begin
  select t.* into v
    from public.vw_relatorio_anual_toca_junto_v1 t
   where t.id = p_pedido_id;

  if v.id is null then
    raise exception 'TOCA_JUNTO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if not public.fn_evento_pode_ver(v.evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;

  if p_aprovar then
    if v.status <> 'pedido' then
      raise exception 'TOCA_JUNTO_JA_DECIDIDO: %', v.status using errcode = 'P0001';
    end if;
    -- Sem as duas apresentações na grade não há o que juntar — a coordenação cria a
    -- que falta (o professor lançou para alguém fora da grade) ou recusa com motivo.
    if v.apresentacao_id is null or v.com_apresentacao_id is null then
      raise exception 'TOCA_JUNTO_SEM_APRESENTACAO' using errcode = 'P0001';
    end if;
    select a.curso_id into v_curso_membro
      from public.evento_apresentacao a where a.id = v.com_apresentacao_id;
    perform public.evento_apresentacao_juntar_v1(v.apresentacao_id, v.com_aluno_id, v_curso_membro);
    return public.relatorio_anual_toca_junto_decidir_v1(v.id, 'confirmado', null);
  end if;

  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'TOCA_JUNTO_MOTIVO_OBRIGATORIO' using errcode = 'P0001';
  end if;
  return public.relatorio_anual_toca_junto_decidir_v1(v.id, 'recusado', btrim(p_motivo));
end;
$function$;

comment on function public.evento_toca_junto_decidir_v1 is
  'Coordenação decide um pedido de toca junto. Aprovar = juntar na grade PRIMEIRO '
  '(evento_apresentacao_juntar_v1) e só confirmar no LA Teacher se a junção funcionar; '
  'a transação desfaz as duas coisas se qualquer passo falhar. Recusar exige motivo.';

revoke all on function public.evento_toca_junto_lista_v1(bigint) from public, anon;
grant execute on function public.evento_toca_junto_lista_v1(bigint) to authenticated;
revoke all on function public.evento_toca_junto_decidir_v1(bigint, boolean, text) from public, anon;
grant execute on function public.evento_toca_junto_decidir_v1(bigint, boolean, text) to authenticated;
