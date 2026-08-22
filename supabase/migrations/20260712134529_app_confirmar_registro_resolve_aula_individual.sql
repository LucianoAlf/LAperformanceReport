-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- BUG CRITICO (pego no teste ao vivo de 12/07, antes de gravar):
-- O Fabio devolveu as 2 fatias com aula_id = 193388 (a aula de TURMA), nao as individuais
-- (193389 = Gustavo, 193393 = Maria). Se confirmasse: o texto do Gustavo ia pra turma, o da
-- Maria SOBRESCREVIA em cima, o relatorio do Gustavo sumia e a ficha dele mostrava o texto
-- da Maria. Vazamento entre alunos + perda de conteudo.
--
-- REGRA (Alf, inegociavel): o registro por aluno vai SEMPRE na aula INDIVIDUAL dele.
-- Nao dependemos do agente mandar o id certo. O banco resolve e, se nao conseguir resolver
-- com seguranca, RECUSA (nao grava na turma "no chute").
create or replace function public.fn_aula_individual_do_aluno(
  p_aula_id  integer,
  p_aluno_id integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_aula  public.aulas_emusys%rowtype;
  v_alvo  integer;
  v_qtd   integer;
begin
  select * into v_aula from public.aulas_emusys where id = p_aula_id;
  if not found then raise exception 'aula_% nao encontrada', p_aula_id; end if;

  -- ja e individual: e o alvo
  if v_aula.tipo = 'individual' then
    return v_aula.id;
  end if;

  -- e turma: procurar a linha individual DESTE aluno no MESMO slot e MESMO professor
  select ae.id into v_alvo
  from public.aulas_emusys ae
  join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id and r.aluno_id = p_aluno_id
  where ae.tipo = 'individual'
    and ae.unidade_id       = v_aula.unidade_id
    and ae.data_hora_inicio = v_aula.data_hora_inicio
    and ae.professor_id is not distinct from v_aula.professor_id
    and coalesce(ae.cancelada,false) = false
  order by ae.id
  limit 1;

  if v_alvo is not null then
    return v_alvo;
  end if;

  -- sem linha individual: so e seguro escrever na turma se ela tiver UM aluno so.
  select count(*) into v_qtd
  from public.aula_alunos_emusys r where r.aula_emusys_id = v_aula.id;

  if v_qtd <= 1 then
    return v_aula.id;
  end if;

  -- turma com 2+ alunos e sem individual: gravar aqui VAZARIA conteudo entre alunos.
  raise exception 'sem_aula_individual_para_aluno_%_na_turma_% (nao gravo na turma: vazaria entre alunos)',
    p_aluno_id, v_aula.id using errcode = '42501';
end
$function$;

revoke all on function public.fn_aula_individual_do_aluno(integer,integer) from public, anon, authenticated;

create or replace function public.app_confirmar_registro(p_registro_id uuid, p_modo text default 'novo')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prof     integer := public.fn_professor_do_usuario();
  v_reg      public.fabio_registros_aula%rowtype;
  v_fatia    record;
  v_user_id  integer;
  v_gravadas integer := 0;
  v_puladas  integer := 0;
  v_pend     jsonb := '[]'::jsonb;
  v_alvo     integer;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_modo not in ('novo','substituir','complementar') then
    raise exception 'Modo inválido: % (use novo, substituir ou complementar)', p_modo;
  end if;
  select u.id into v_user_id from public.usuarios u where u.auth_user_id = auth.uid();

  select * into v_reg from public.fabio_registros_aula
   where id = p_registro_id and parent_id is null;
  if not found then raise exception 'Registro % não encontrado', p_registro_id; end if;
  if v_reg.professor_id is distinct from v_prof then
    raise exception 'Registro não pertence a este professor';
  end if;
  if v_reg.status not in ('rascunho','aguardando_confirmacao') then
    raise exception 'Status % não permite confirmação', v_reg.status;
  end if;

  -- TRONCO INDIVIDUAL (aula de 1 aluno so)
  if v_reg.aluno_id is not null then
    if coalesce(btrim(v_reg.texto_consolidado),'') = '' then
      raise exception 'Registro sem texto consolidado';
    end if;
    v_alvo := public.fn_aula_individual_do_aluno(v_reg.aula_id, v_reg.aluno_id);
    perform public.registrar_aula_fabio(
      p_aula_id => v_alvo, p_texto => v_reg.texto_consolidado,
      p_origem => case when v_reg.origem in ('audio','texto') then v_reg.origem else 'audio' end,
      p_professor_id => v_reg.professor_id, p_modo => p_modo);
    v_gravadas := 1;
    update public.fabio_registros_aula
       set status='gravado_emusys', confirmado_em=now(), confirmado_por=v_user_id
     where id = p_registro_id;
  else
    -- TURMA: cada fatia vai na aula INDIVIDUAL do seu aluno
    for v_fatia in
      select * from public.fabio_registros_aula where parent_id = p_registro_id
    loop
      if coalesce(v_fatia.campos->>'presenca','presente') = 'ausente' then
        v_puladas := v_puladas + 1;
        update public.fabio_registros_aula
           set status='confirmado', confirmado_em=now(), confirmado_por=v_user_id
         where id = v_fatia.id;
      elsif v_fatia.aula_id is null
            or v_fatia.aluno_id is null
            or coalesce(btrim(v_fatia.texto_consolidado),'') = '' then
        v_pend := v_pend || jsonb_build_object(
          'fatia_id', v_fatia.id, 'aluno_id', v_fatia.aluno_id,
          'motivo', case when v_fatia.aula_id is null then 'sem aula vinculada'
                         when v_fatia.aluno_id is null then 'sem aluno vinculado'
                         else 'sem texto' end);
      else
        -- <<< AQUI: o banco resolve a aula individual. Nao confia no id que o agente mandou.
        v_alvo := public.fn_aula_individual_do_aluno(v_fatia.aula_id, v_fatia.aluno_id);

        perform public.registrar_aula_fabio(
          p_aula_id => v_alvo, p_texto => v_fatia.texto_consolidado,
          p_origem => case when v_fatia.origem in ('audio','texto') then v_fatia.origem else 'audio' end,
          p_professor_id => v_reg.professor_id, p_modo => p_modo);
        v_gravadas := v_gravadas + 1;

        update public.fabio_registros_aula
           set status='gravado_emusys', confirmado_em=now(), confirmado_por=v_user_id,
               aula_id = v_alvo,                                   -- corrige o alvo no proprio registro
               campos  = campos || jsonb_build_object('aula_alvo_resolvida', v_alvo)
         where id = v_fatia.id;
      end if;
    end loop;

    if v_gravadas = 0 then
      raise exception 'Nada gravável neste registro (0 fatias graváveis). Pendências: %', v_pend::text;
    end if;

    update public.fabio_registros_aula
       set status = case when jsonb_array_length(v_pend) = 0 then 'gravado_emusys' else 'confirmado' end,
           confirmado_em = now(), confirmado_por = v_user_id
     where id = p_registro_id;
  end if;

  return jsonb_build_object('registro_id', p_registro_id, 'modo', p_modo,
                            'gravadas', v_gravadas, 'ausentes_puladas', v_puladas,
                            'pendencias', v_pend);
end
$function$;

revoke all on function public.app_confirmar_registro(uuid, text) from public, anon;
grant execute on function public.app_confirmar_registro(uuid, text) to authenticated;
