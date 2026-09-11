-- 20260911110000 — a presença do registro volta a sair quando o PROFESSOR confirma
--
-- Desde 05/09 16:07 BRT (cutover da superfície `la_teacher` para
-- `canonico_v2`), o roteador `fabio_emitir_presenca_por_registro` manda o
-- registro para `fabio_emitir_presenca_registro_canonica_v2_interno`, que
-- exige `auth.role() = 'service_role'`. Quem confirma no app é o professor
-- (`authenticated`), pela cadeia security definer
--   fn_confirmar_registro_core -> fabio_emitir_presenca_por_registro_e_devolutiva
--   -> fabio_emitir_presenca_por_registro -> ..._canonica_v2_interno
-- A trava recusa, e o `exception when others` do gancho engole: o registro
-- grava e a presença não sai, sem erro em lugar nenhum. Medido pelo LA
-- Teacher: a última presença `fabio_audio` é de 05/09 15:58; de lá até 11/09,
-- 127 registros confirmados de 10 professores não lançaram presença.
--
-- O caminho legado já resolvia isso com `app.presenca_fabio_trusted`: a
-- `fabio_criar_comando_chamada_v1` liga a flag, e o
-- `fn_criar_comando_presenca_core_v2` aceita service_role OU a flag. No v2,
-- DUAS portas do caminho do registro não aceitavam (medido com o contexto do
-- erro, uma de cada vez):
--   fabio_emitir_presenca_registro_canonica_v2_interno  (a primeira)
--   fabio_criar_comando_chamada_v2                       (logo abaixo dela)
--
-- Conserto:
--   1. as duas aceitam a mesma flag, com a mesma regra do core;
--   2. o roteador liga a flag SÓ em volta da chamada v2 e devolve o valor que
--      estava antes (se o interno levantar, a subtransação do gancho desfaz o
--      set_config junto).
-- A porta continua fechada para chamada direta: o EXECUTE do interno segue só
-- com postgres; o de `fabio_criar_comando_chamada_v2` e o do roteador, só com
-- postgres/service_role -- o professor não chama nenhuma das três. O teste e
-- os mutantes moram no LA Teacher (scripts/presenca-registro/), que roda o
-- ensaio em BEGIN/ROLLBACK contra este banco.

-- 1) as duas portas aceitam a flag. Troca de texto conferida: uma guarda em cada.
do $$
declare
  v_fn     regprocedure;
  v_def    text;
  v_guarda text := $g$if coalesce(auth.role(), '') <> 'service_role' then$g$;
  v_nova   text := $g$if coalesce(auth.role(), '') <> 'service_role'
     and current_setting('app.presenca_fabio_trusted', true) is distinct from 'on' then$g$;
  v_n      integer;
begin
  foreach v_fn in array array[
    'public.fabio_emitir_presenca_registro_canonica_v2_interno(uuid)'::regprocedure,
    'public.fabio_criar_comando_chamada_v2(uuid,integer,integer,integer[],text)'::regprocedure
  ] loop
    v_def := pg_get_functiondef(v_fn);
    if position('app.presenca_fabio_trusted' in v_def) > 0 then
      raise notice '% ja aceita a flag -- nada a fazer', v_fn;
      continue;
    end if;
    v_n := (length(v_def) - length(replace(v_def, v_guarda, ''))) / length(v_guarda);
    if v_n <> 1 then
      raise exception 'esperava 1 guarda em %, achei %', v_fn, v_n;
    end if;
    execute replace(v_def, v_guarda, v_nova);
  end loop;
end $$;

-- 2) o roteador liga a flag só em volta da chamada v2
create or replace function public.fabio_emitir_presenca_por_registro(p_registro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_unidade_id uuid;
  v_modo       text;
  v_flag_antes text;
  v_res        jsonb;
begin
  select ae.unidade_id
    into v_unidade_id
    from public.fabio_registros_aula registro
    join public.aulas_emusys ae on ae.id = registro.aula_id
   where registro.id = p_registro_id
     and registro.parent_id is null;
  if not found then
    return public.fabio_emitir_presenca_por_registro_publicacao_legado_v1(p_registro_id);
  end if;

  v_modo := public.fn_presenca_rollout_modo_interno_v1(v_unidade_id, 'la_teacher');
  if v_modo = 'canonico_v2' then
    -- Quem chega aqui já passou pela porta do dono: fn_confirmar_registro_core
    -- confere o professor do registro, e o bridge chama com service_role.
    v_flag_antes := current_setting('app.presenca_fabio_trusted', true);
    perform set_config('app.presenca_fabio_trusted', 'on', true);
    v_res := public.fabio_emitir_presenca_registro_canonica_v2_interno(p_registro_id);
    perform set_config('app.presenca_fabio_trusted', coalesce(v_flag_antes, ''), true);
    return v_res;
  end if;

  return public.fabio_emitir_presenca_por_registro_publicacao_legado_v1(p_registro_id);
end
$function$;
