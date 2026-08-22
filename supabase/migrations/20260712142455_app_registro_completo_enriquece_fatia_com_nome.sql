-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- A tela mostrava "Aluno" em vez de "Gustavo"/"Maria Isabel" porque a RPC devolvia
-- to_jsonb(fabio_registros_aula) — que tem aluno_id, mas NAO tem o nome. O front nao tinha
-- como acertar. Bug do banco, nao da UI.
-- Fix ADITIVO: cada fatia ganha aluno_nome, aluno_primeiro_nome e a aula individual alvo.
-- Nada e removido do contrato: as chaves antigas continuam iguais.
create or replace function public.app_registro_completo(p_registro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_prof   integer := public.fn_professor_do_usuario();
  v_tronco jsonb;
  v_fatias jsonb;
  v_aula   jsonb;
begin
  if v_prof is null then return jsonb_build_object('erro','sem_professor'); end if;

  select to_jsonb(r) into v_tronco from public.fabio_registros_aula r
   where r.id = p_registro_id and r.parent_id is null and r.professor_id = v_prof;
  if v_tronco is null then return jsonb_build_object('erro','nao_encontrado'); end if;

  select coalesce(jsonb_agg(
           to_jsonb(r)
           || jsonb_build_object(
                'aluno_nome',           a.nome,
                'aluno_primeiro_nome',  split_part(btrim(a.nome), ' ', 1),
                'aluno_foto_url',       a.foto_url,
                -- a aula individual onde o texto DESTE aluno sera realmente gravado
                'aula_id_alvo',         case when r.aluno_id is not null
                                             then public.fn_aula_individual_do_aluno(r.aula_id, r.aluno_id)
                                        end
              )
           order by a.nome), '[]'::jsonb)
    into v_fatias
    from public.fabio_registros_aula r
    left join public.alunos a on a.id = r.aluno_id
   where r.parent_id = p_registro_id;

  select jsonb_build_object(
           'data_aula', v.data_aula, 'hora', v.horario_inicio_brt,
           'turma', v.turma_nome, 'curso', v.curso_nome, 'tipo', v.aula_tipo)
    into v_aula
    from public.vw_fabio_aulas_contexto v
   where v.aula_local_id = (v_tronco->>'aula_id')::integer
   limit 1;

  return jsonb_build_object('tronco', v_tronco, 'fatias', v_fatias, 'aula', v_aula);
end $function$;

revoke all on function public.app_registro_completo(uuid) from public, anon;
grant execute on function public.app_registro_completo(uuid) to authenticated;
