-- M12 — Formandos do recital (pedido do coordenador Marcos, aprovado pelo Alf 30/09).
--
-- A regra única mora no LA Teacher: fn_passagem_de_ciclo + vw_recital_passagem_de_ciclo_v1
-- (Kids→School faz 12 no ano; Bebês→Preparatória faz 2 no ano E está em Bebês).
-- Aqui o selo é marcado SOZINHO em evento_participacao a cada sync do recital, e a
-- coordenação pode marcar/desmarcar à mão — 'manual' prevalece: a rotina nunca
-- sobrescreve uma decisão humana. Formatura é da PESSOA: aluno com 2 cursos = 1
-- formando, e o selo vale nos dois números em que ele toca.

alter table public.evento_participacao
  add column if not exists formatura_origem text;

comment on column public.evento_participacao.formatura_origem is
  'Quem decidiu o selo de formando: ''auto'' = a rotina pela view do LA Teacher; '
  '''manual'' = a coordenação marcou/desmarcou à mão e a rotina NÃO sobrescreve. '
  'NULL nas linhas anteriores à M12 é tratado como ''auto''.';

alter table public.evento_participacao
  drop constraint if exists evento_participacao_formatura_origem_check;
alter table public.evento_participacao
  add constraint evento_participacao_formatura_origem_check
    check (formatura_origem in ('auto', 'manual'));

alter table public.evento_participacao
  drop constraint evento_participacao_formatura_tipo_check;
alter table public.evento_participacao
  add constraint evento_participacao_formatura_tipo_check
    check (formatura_tipo in ('kids', 'la', 'bebes'));

-- A única linha 'la' (tipo aposentado: formatura por conclusão de curso não se usa)
-- era do Bento (aluno 2536, nasc. 2023, LAMK): não é formando por nenhuma das duas
-- regras — o selo sai. Se a coordenação discordar, marca à mão e vira 'manual'.
update public.evento_participacao
   set formatura = false, formatura_tipo = null, formatura_origem = null, updated_at = now()
 where formatura_tipo = 'la';

-- ── sync automático: marca e desmarca 'auto'; nunca toca 'manual' ──────────────
create or replace function public.evento_formandos_sincronizar_v1(p_evento_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v jsonb;
begin
  if not public.fn_evento_pode_ver(p_evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;

  with f as (
    -- Quem passa de ciclo, por PESSOA (aluno com 2 cursos vira 1 linha na view por
    -- curso, mas o formando é um só — distinct no pessoa_chave).
    select v.pessoa_chave, v.aluno_id,
           min(case v.tipo
                 when 'kids_para_school' then 'kids'
                 when 'bebes_para_preparatoria' then 'bebes'
               end) as tipo
      from public.vw_recital_passagem_de_ciclo_v1 v
     where v.evento_id = p_evento_id
     group by v.pessoa_chave, v.aluno_id
  ),
  ins as (
    -- Formando sem linha de participação (ninguém mexeu no status ainda): nasce
    -- 'indefinido' já marcado — esperar o "participa" atrasaria a contagem de beca.
    insert into public.evento_participacao
      (evento_id, unidade_id, pessoa_chave, aluno_id, status,
       formatura, formatura_tipo, formatura_origem)
    select p_evento_id, e.unidade_id, f.pessoa_chave, f.aluno_id, 'indefinido',
           true, f.tipo, 'auto'
      from f
      cross join (select e.unidade_id from public.evento e where e.id = p_evento_id) e
     where not exists (
       select 1 from public.evento_participacao p
        where p.evento_id = p_evento_id and p.pessoa_chave = f.pessoa_chave)
    returning 1
  ),
  upd as (
    update public.evento_participacao p
       set formatura = true,
           formatura_tipo = f.tipo,
           formatura_origem = 'auto',
           updated_at = now()
      from f
     where p.evento_id = p_evento_id
       and p.pessoa_chave = f.pessoa_chave
       and p.formatura_origem is distinct from 'manual'
       and (p.formatura is distinct from true
            or p.formatura_tipo is distinct from f.tipo
            or p.formatura_origem is null)
    returning 1
  ),
  del as (
    -- Quem a rotina marcou e saiu da view (aniversário recalculado, curso trocado)
    -- perde o selo. 'manual' fica — a decisão humana manda.
    update public.evento_participacao p
       set formatura = false, formatura_tipo = null, formatura_origem = null,
           updated_at = now()
     where p.evento_id = p_evento_id
       and p.formatura
       and coalesce(p.formatura_origem, 'auto') = 'auto'
       and not exists (select 1 from f where f.pessoa_chave = p.pessoa_chave)
    returning 1
  )
  select jsonb_build_object(
    'evento_id', p_evento_id,
    'formandos_na_view', (select count(*) from f),
    'inseridos', (select count(*) from ins),
    'marcados', (select count(*) from upd),
    'desmarcados', (select count(*) from del),
    'manuais_preservados', (select count(*) from public.evento_participacao p
                              where p.evento_id = p_evento_id and p.formatura_origem = 'manual')
  ) into v;

  return v;
end;
$function$;

comment on function public.evento_formandos_sincronizar_v1 is
  'Espelha vw_recital_passagem_de_ciclo_v1 (LA Teacher) em evento_participacao: marca '
  'formandos como ''auto'', desmarca quem saiu da view e nunca toca decisão ''manual''. '
  'Chamada por evento_recital_sincronizar_v1 e disponível sozinha para testes.';

-- ── decisão manual da coordenação ─────────────────────────────────────────────
create or replace function public.evento_formando_definir_v1(
  p_evento_id bigint,
  p_pessoa_chave text,
  p_aluno_id integer,
  p_tipo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.fn_evento_pode_ver(p_evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;
  if p_tipo is not null and p_tipo not in ('kids', 'bebes') then
    raise exception 'FORMATURA_TIPO_INVALIDO: use kids ou bebes' using errcode = '22023';
  end if;

  insert into public.evento_participacao
    (evento_id, unidade_id, pessoa_chave, aluno_id, status,
     formatura, formatura_tipo, formatura_origem)
  select p_evento_id, e.unidade_id, p_pessoa_chave, p_aluno_id, 'indefinido',
         p_tipo is not null, p_tipo, 'manual'
    from public.evento e where e.id = p_evento_id
  on conflict (evento_id, pessoa_chave) do update
     set formatura = p_tipo is not null,
         formatura_tipo = p_tipo,
         formatura_origem = 'manual',
         updated_at = now();

  return jsonb_build_object('ok', true, 'tipo', p_tipo);
end;
$function$;

comment on function public.evento_formando_definir_v1 is
  'Coordenação marca (p_tipo kids|bebes) ou desmarca (p_tipo null) o selo de formando '
  'à mão. Grava formatura_origem=''manual'' — a rotina automática nunca sobrescreve.';

revoke all on function public.evento_formandos_sincronizar_v1(bigint) from public, anon;
grant execute on function public.evento_formandos_sincronizar_v1(bigint) to authenticated;
revoke all on function public.evento_formando_definir_v1(bigint, text, integer, text) from public, anon;
grant execute on function public.evento_formando_definir_v1(bigint, text, integer, text) to authenticated;

-- A rotina anda junto com o sync do recital: o botão "Sincronizar LA Teacher" e o
-- cron de planilhas acabam cobrindo os dois sem gatilho novo.
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
  v_formandos jsonb;
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

  -- Formandos: mesma fonte do Teacher, mesma rodada. Falha aqui não pode derrubar o
  -- sync do recital inteiro — o selo de beca volta na próxima corrida.
  begin
    v_formandos := public.evento_formandos_sincronizar_v1(p_evento_id);
  exception when others then
    v_formandos := jsonb_build_object('erro', sqlerrm);
  end;

  return jsonb_build_object(
    'evento_id', p_evento_id,
    'relatorios_lidos', (select count(*) from public.vw_relatorio_anual_recital_v1
                          where evento_id = p_evento_id),
    'casadas', v_casadas,
    'nao_casadas', v_nao_casadas,
    'apresentacoes_atualizadas', v_campos,
    'itens_professor', v_itens,
    'codigos_sem_mapa', to_jsonb(v_sem_mapa),
    'formandos', v_formandos,
    'sincronizado_em', now()
  );
end;
$function$;
