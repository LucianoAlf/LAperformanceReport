-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Espelha a cadeia vw_jornada_aluno_atual -> vw_jornada_aluno_com_presenca -> vw_jornada_professor_atual,
-- trocando o filtro para trancada. 100% aditivo: nenhuma view/RPC existente e alterada.

create view public.vw_jornada_aluno_trancado
with (security_invoker = on) as
 SELECT j.id,
    j.unidade_id,
    u.nome AS unidade_nome,
    j.aluno_id,
    a.nome AS aluno_nome,
    a.telefone,
    a.whatsapp,
    a.responsavel_nome,
    a.responsavel_telefone,
    j.emusys_aluno_id,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.emusys_disciplina_id,
    j.curso_id,
    COALESCE(c.nome, j.curso_nome_emusys::character varying) AS curso_nome,
    j.curso_nome_emusys,
    j.professor_id,
    COALESCE(p.nome, j.professor_nome_emusys::character varying) AS professor_nome,
    j.emusys_professor_id,
    j.professor_nome_emusys,
    j.status_matricula,
    j.qtd_contratos,
    j.nr_aulas_contratadas,
    j.nr_aulas_passadas,
    j.nr_aulas_futuras,
    j.proxima_aula_numero,
    j.percentual_jornada,
        CASE
            WHEN j.nr_aulas_contratadas IS NULL THEN NULL::text
            WHEN COALESCE(j.nr_aulas_futuras, 0) > 0 AND j.proxima_aula_numero IS NOT NULL THEN (('Aula '::text || j.proxima_aula_numero) || '/'::text) || j.nr_aulas_contratadas
            WHEN COALESCE(j.nr_aulas_passadas, 0) >= j.nr_aulas_contratadas THEN ((j.nr_aulas_contratadas || '/'::text) || j.nr_aulas_contratadas) || ' concluida'::text
            ELSE (COALESCE(j.nr_aulas_passadas, 0) || '/'::text) || j.nr_aulas_contratadas
        END AS jornada_label,
    j.data_primeira_aula,
    j.data_ultima_aula,
    j.dia_semana,
    j.horario,
    j.fonte_ultima_atualizacao,
    j.ultima_sincronizacao_emusys,
    j.updated_at
   FROM aluno_jornada_matricula_disciplina j
     LEFT JOIN unidades u ON u.id = j.unidade_id
     LEFT JOIN alunos a ON a.id = j.aluno_id
     LEFT JOIN cursos c ON c.id = j.curso_id
     LEFT JOIN professores p ON p.id = j.professor_id
  WHERE j.status_matricula = 'trancada'::text;

revoke all on public.vw_jornada_aluno_trancado from public, anon, authenticated;
grant select on public.vw_jornada_aluno_trancado to authenticated;

create view public.vw_jornada_aluno_trancado_com_presenca
with (security_invoker = on) as
 SELECT j.id,
    j.unidade_id,
    j.unidade_nome,
    j.aluno_id,
    j.aluno_nome,
    j.telefone,
    j.whatsapp,
    j.responsavel_nome,
    j.responsavel_telefone,
    j.emusys_aluno_id,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.emusys_disciplina_id,
    j.curso_id,
    j.curso_nome,
    j.curso_nome_emusys,
    j.professor_id,
    j.professor_nome,
    j.emusys_professor_id,
    j.professor_nome_emusys,
    j.status_matricula,
    j.qtd_contratos,
    j.nr_aulas_contratadas,
    j.nr_aulas_passadas,
    j.nr_aulas_futuras,
    j.proxima_aula_numero,
    j.percentual_jornada,
    j.jornada_label,
    j.data_primeira_aula,
    j.data_ultima_aula,
    j.dia_semana,
    j.horario,
    j.fonte_ultima_atualizacao,
    j.ultima_sincronizacao_emusys,
    j.updated_at,
    count(ap.id) FILTER (WHERE ap.status::text = 'presente'::text)::integer AS presencas,
    count(ap.id) FILTER (WHERE ap.status::text = 'ausente'::text)::integer AS faltas,
    count(ap.id)::integer AS aulas_com_presenca_registrada,
        CASE
            WHEN count(ap.id) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(ap.id) FILTER (WHERE ap.status::text = 'presente'::text)::numeric / NULLIF(count(ap.id), 0)::numeric, 2)
        END AS percentual_presenca_contrato,
    max(ap.data_aula) AS ultima_aula_registrada
   FROM vw_jornada_aluno_trancado j
     LEFT JOIN aluno_presenca ap ON ap.aluno_id = j.aluno_id AND ap.unidade_id = j.unidade_id
     LEFT JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id AND (ae.matricula_disciplina_id = j.emusys_matricula_disciplina_id OR ae.matricula_disciplina_id IS NULL AND ae.curso_emusys_id = j.emusys_disciplina_id)
  GROUP BY j.id, j.unidade_id, j.unidade_nome, j.aluno_id, j.aluno_nome, j.telefone, j.whatsapp, j.responsavel_nome, j.responsavel_telefone, j.emusys_aluno_id, j.emusys_matricula_id, j.emusys_matricula_disciplina_id, j.emusys_disciplina_id, j.curso_id, j.curso_nome, j.curso_nome_emusys, j.professor_id, j.professor_nome, j.emusys_professor_id, j.professor_nome_emusys, j.status_matricula, j.qtd_contratos, j.nr_aulas_contratadas, j.nr_aulas_passadas, j.nr_aulas_futuras, j.proxima_aula_numero, j.percentual_jornada, j.jornada_label, j.data_primeira_aula, j.data_ultima_aula, j.dia_semana, j.horario, j.fonte_ultima_atualizacao, j.ultima_sincronizacao_emusys, j.updated_at;

revoke all on public.vw_jornada_aluno_trancado_com_presenca from public, anon, authenticated;
grant select on public.vw_jornada_aluno_trancado_com_presenca to authenticated;

create view public.vw_jornada_professor_trancado
with (security_invoker = on) as
 select j.*
 from public.vw_jornada_aluno_trancado_com_presenca j
 where j.professor_id is not null;

revoke all on public.vw_jornada_professor_trancado from public, anon, authenticated;
grant select on public.vw_jornada_professor_trancado to authenticated;

-- RPC para o dropdown por professor (mesma checagem de permissao do get_jornada_professor)
create or replace function public.get_jornada_professor_trancados(p_professor_id integer)
 returns setof vw_jornada_professor_trancado
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select j.*
  from public.vw_jornada_professor_trancado j
  where j.professor_id = p_professor_id
    and (
      coalesce(auth.role(), '') = 'service_role'
      or public.fn_professor_do_usuario() = p_professor_id
      or public.fn_usuario_atual_tem_permissao('professores.carteira', j.unidade_id)
      or exists (
        select 1
        from public.usuarios u
        where u.auth_user_id = auth.uid()
          and coalesce(u.ativo, true)
          and (
            u.perfil = 'admin'
            or (u.perfil = 'unidade' and u.unidade_id = j.unidade_id)
          )
      )
    )
  order by j.aluno_nome, j.curso_nome;
$function$;

revoke execute on function public.get_jornada_professor_trancados(integer) from anon;
grant execute on function public.get_jornada_professor_trancados(integer) to authenticated;

-- RPC agregada para o badge de contagem no cabecalho (mesmo modelo de confianca do get_carteira_professores:
-- sem checagem extra na funcao, tela ja e gated por permissao no frontend/rota).
create or replace function public.get_contagem_trancados_professores(p_unidade_id uuid default null)
 returns table(professor_id integer, total_trancados integer)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select j.professor_id, count(*)::integer as total_trancados
  from public.vw_jornada_professor_trancado j
  where p_unidade_id is null or j.unidade_id = p_unidade_id
  group by j.professor_id;
$function$;

revoke execute on function public.get_contagem_trancados_professores(uuid) from anon;
grant execute on function public.get_contagem_trancados_professores(uuid) to authenticated;
