-- 30/09/2026: o rider do LA Teacher ganhou "Pedal de sustain" (id `pedal_sustain`, pedido do
-- Isaque: item obrigatório de quem toca teclas). Sem esta linha o sync já espelhava o item,
-- mas com o nome cru ("pedal sustain") e contado em `codigos_sem_mapa`.
-- Corpo = pg_get_functiondef da função no ar em 30/09 + a linha nova do `case`.

CREATE OR REPLACE FUNCTION public.evento_recital_sincronizar_v1(p_evento_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_todos_adm_vazios boolean;
begin
  if not public.fn_evento_pode_ver(p_evento_id) then
    raise exception 'EVENTO_FORA_DO_ESCOPO' using errcode = '42501';
  end if;

  -- Toda escrita que esta funÃ§Ã£o faz nos campos de detalhe Ã© do professor.
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

    -- O snapshot atualiza SEMPRE: Ã© o que alimenta o painel de relatÃ³rios e a
    -- divergÃªncia, mesmo quando o professor ainda nÃ£o lanÃ§ou a mÃºsica.
    update public.evento_apresentacao
       set professor = to_jsonb(v), professor_em = v.atualizado_em, updated_at = now()
     where id = v_ap_id;

    -- SÃ³ copia os detalhes depois que o professor LANÃ‡OU o cartÃ£o (musica_lancada_em).
    if v.musica_lancada_em is not null then
      select (a.musica is null and a.musica_artista is null and a.musica_link is null
              and a.playback_path is null and a.duracao_segundos is null)
        into v_todos_adm_vazios
        from public.evento_apresentacao a where a.id = v_ap_id;

      if v_todos_adm_vazios or exists (
        select 1 from public.evento_apresentacao a
         where a.id = v_ap_id and a.detalhes_origem = 'professor'
      ) then
        -- ApresentaÃ§Ã£o virgem â†’ o professor toma posse; jÃ¡ do professor â†’ ele Ã© a fonte.
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
        -- O ADM jÃ¡ escreveu algo: sÃ³ o que estiver VAZIO Ã© preenchido. O que divergir
        -- fica como estÃ¡ e a tela acusa comparando com o snapshot.
        update public.evento_apresentacao a
           set musica = coalesce(a.musica, v.musica_titulo),
               musica_artista = coalesce(a.musica_artista, v.musica_artista),
               musica_link = coalesce(a.musica_link, v.musica_link),
               playback_path = coalesce(a.playback_path, v.musica_playback_path),
               duracao_segundos = coalesce(a.duracao_segundos, v.musica_duracao_segundos),
               updated_at = now()
         where a.id = v_ap_id;
      end if;

      -- Rider: a lista do professor Ã© a fonte â€” espelhada por inteiro a cada sync.
      delete from public.evento_apresentacao_item
       where apresentacao_id = v_ap_id and origem = 'professor';

      if not coalesce(v.rider_nada, false) then
        foreach v_codigo in array coalesce(v.rider_itens, '{}'::text[]) loop
          v_tipo := 'equipamento';
          v_nome := replace(v_codigo, '_', ' ');
          case v_codigo
            when 'microfone_voz'         then v_nome := 'Microfone de voz';
            when 'pedestal_microfone'    then v_nome := 'Pedestal de microfone';
            when 'microfone_instrumento' then v_nome := 'Microfone de instrumento';
            when 'teclado'               then v_tipo := 'instrumento'; v_nome := 'Teclado';
            when 'pedal_sustain'         then v_nome := 'Pedal de sustain';
            when 'bateria'               then v_tipo := 'instrumento'; v_nome := 'Bateria';
            when 'amp_guitarra'          then v_nome := 'Amplificador de guitarra';
            when 'amp_baixo'             then v_nome := 'Amplificador de baixo';
            when 'cabo_p10'              then v_nome := 'Cabo P10';
            when 'banco'                 then v_nome := 'Banco';
            when 'estante'               then v_nome := 'Estante';
            when 'instrumento_proprio'   then v_tipo := 'instrumento'; v_nome := 'Instrumento prÃ³prio';
            else v_sem_mapa := v_sem_mapa || v_codigo;
          end case;
          insert into public.evento_apresentacao_item
            (apresentacao_id, tipo, nome, quantidade, origem, codigo)
          values (v_ap_id, v_tipo, v_nome, 1, 'professor', v_codigo);
          v_itens := v_itens + 1;
        end loop;

        if nullif(btrim(coalesce(v.rider_outros, '')), '') is not null then
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
