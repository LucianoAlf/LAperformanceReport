-- A confirmaÃ§Ã£o do registro continua sendo uma declaraÃ§Ã£o humana de que a
-- aula ocorreu: alunos sem uma decisÃ£o humana contrÃ¡ria sÃ£o promovidos a
-- presentes nesse momento. A exceÃ§Ã£o Ã© uma falta humana jÃ¡ canÃ´nica, que nÃ£o
-- pode ser apagada nem gerar conteÃºdo pedagÃ³gico para o aluno ausente.
--
-- Rascunho, autosave, cÃ³pia e duplicaÃ§Ã£o nÃ£o chamam esta funÃ§Ã£o.

create or replace function public.fn_materializar_presenca_padrao(
  p_registro_id uuid,
  p_professor_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_raiz public.fabio_registros_aula%rowtype;
  v_fatia record;
  v_decisao public.aluno_presenca%rowtype;
  v_presenca text;
  v_alterados jsonb := '[]'::jsonb;
  v_ausencias_humanas integer := 0;
begin
  if p_registro_id is null or p_professor_id is null then
    raise exception 'registro_e_professor_obrigatorios';
  end if;

  select * into v_raiz
    from public.fabio_registros_aula
   where id = p_registro_id
     and parent_id is null;
  if not found then
    raise exception 'Registro % nao encontrado', p_registro_id;
  end if;
  if v_raiz.professor_id is distinct from p_professor_id then
    raise exception 'Registro nao pertence a este professor';
  end if;

  for v_fatia in
    select f.id, f.aula_id, f.aluno_id, f.campos
      from public.fabio_registros_aula f
     where coalesce(f.professor_id, v_raiz.professor_id) = p_professor_id
       and (
         (v_raiz.aluno_id is null and f.parent_id = v_raiz.id)
         or (v_raiz.aluno_id is not null and f.id = v_raiz.id)
       )
       and public.fn_presenca_declarada(coalesce(f.campos, '{}'::jsonb)) = 'nao_informada'
     for update of f
  loop
    -- A leitura com lock compartilha a decisÃ£o de chamada com a confirmaÃ§Ã£o:
    -- uma retificaÃ§Ã£o humana concorrente nÃ£o pode ser lida pela metade.
    select * into v_decisao
      from public.aluno_presenca ap
     where ap.aluno_id = v_fatia.aluno_id
       and ap.aula_emusys_id = v_fatia.aula_id
     for key share;

    v_presenca := 'presente';
    if found
       and public.fn_presenca_e_forte(v_decisao.respondido_por)
       and coalesce(
         v_decisao.status_presenca,
         case v_decisao.status when 'ausente' then 'falta' end
       ) in ('falta', 'falta_justificada') then
      v_presenca := 'ausente';
      v_ausencias_humanas := v_ausencias_humanas + 1;
    end if;

    update public.fabio_registros_aula
       set campos = coalesce(campos, '{}'::jsonb)
                    || jsonb_build_object('presenca', v_presenca),
           atualizado_em = now()
     where id = v_fatia.id;

    v_alterados := v_alterados || jsonb_build_array(
      jsonb_build_object(
        'registro_id', v_fatia.id,
        'aluno_id', v_fatia.aluno_id,
        'presenca', v_presenca
      )
    );
  end loop;

  return jsonb_build_object(
    'registro_id', p_registro_id,
    'alterados', v_alterados,
    'quantidade_alterada', jsonb_array_length(v_alterados),
    'ausencias_humanas_preservadas', v_ausencias_humanas
  );
end
$function$;

revoke all on function public.fn_materializar_presenca_padrao(uuid, integer)
  from public, anon, authenticated, service_role;
