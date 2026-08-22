-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- O professor não pode lançar presença de novo quando a secretaria já lançou.
-- Ver 20260815030000_o_registro_mostra_a_presenca_ja_lancada.sql no repo para o
-- contexto completo. Só EXIBIÇÃO: não toca em precedência nem em quem escreve.
create or replace function public.app_registro_completo(p_registro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prof   integer := public.fn_professor_do_usuario();
  v_tronco jsonb;
  v_fatias jsonb;
  v_aula   jsonb;
  v_ja     jsonb;
  v_aula_id integer;
begin
  if v_prof is null then return jsonb_build_object('erro','sem_professor'); end if;

  select to_jsonb(r) into v_tronco from public.fabio_registros_aula r
   where r.id = p_registro_id and r.parent_id is null and r.professor_id = v_prof;
  if v_tronco is null then return jsonb_build_object('erro','nao_encontrado'); end if;

  v_aula_id := (v_tronco->>'aula_id')::integer;

  select coalesce(jsonb_agg(
           to_jsonb(r)
           || jsonb_build_object(
                'aluno_nome',          a.nome,
                'aluno_primeiro_nome', split_part(btrim(a.nome), ' ', 1),
                'aluno_foto_url',      a.foto_url,
                'aula_id_alvo',        case when r.aluno_id is not null
                                            then public.fn_aula_individual_do_aluno(r.aula_id, r.aluno_id) end,
                -- Presença JÁ lançada (secretaria/Emusys/professor). Só leitura:
                -- o cliente mostra com carimbo e bloqueia a edição quando
                -- `presenca_travada` é true.
                'presenca_lancada',    pres.presenca,
                'presenca_fonte',      pres.respondido_por,
                'presenca_travada',    coalesce(pres.fecha_chamada, false)
              )
           order by a.nome), '[]'::jsonb)
    into v_fatias
    from public.fabio_registros_aula r
    left join public.alunos a on a.id = r.aluno_id
    left join lateral (
      select
        coalesce(ap.status_presenca,
          case ap.status when 'presente' then 'presente'
                         when 'ausente'  then 'falta' end) as presenca,
        ap.respondido_por,
        public.fn_presenca_fecha_chamada(
          coalesce(ap.status_presenca,
            case ap.status when 'presente' then 'presente'
                           when 'ausente'  then 'falta' end),
          ap.respondido_por) as fecha_chamada
        from public.aluno_presenca ap
       where r.aluno_id is not null
         and ap.aluno_id = r.aluno_id
         and ap.aula_emusys_id in (v_aula_id, r.aula_id)
       order by public.fn_presenca_fecha_chamada(
                  coalesce(ap.status_presenca,
                    case ap.status when 'presente' then 'presente'
                                   when 'ausente'  then 'falta' end),
                  ap.respondido_por) desc,
                ap.respondido_em desc nulls last,
                ap.aula_emusys_id
       limit 1
    ) pres on true
   where r.parent_id = p_registro_id;

  select jsonb_build_object(
           'data_aula', v.data_aula, 'hora', v.horario_inicio_brt,
           'turma', v.turma_nome, 'curso', v.curso_nome, 'tipo', v.aula_tipo)
    into v_aula
    from public.vw_fabio_aulas_contexto v
   where v.aula_local_id = v_aula_id limit 1;

  v_ja := public.fn_aula_ja_registrada(v_aula_id);

  return jsonb_build_object(
    'tronco', v_tronco,
    'fatias', v_fatias,
    'aula',   v_aula,
    'aula_ja_registrada', (jsonb_array_length(v_ja) > 0),
    'ja_registrados', v_ja,
    -- o front DEVE mandar 'substituir' ou 'complementar' quando aula_ja_registrada = true.
    -- Se mandar 'novo', o banco recusa (nao destroi o trabalho do professor).
    'modo_exigido', case when jsonb_array_length(v_ja) > 0 then 'substituir|complementar' else 'novo' end
  );
end $function$;
