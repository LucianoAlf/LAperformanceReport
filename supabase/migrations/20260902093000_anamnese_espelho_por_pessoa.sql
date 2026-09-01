-- LAPE-19 — alunos.anamnese_preenchida vira ESPELHO da anamnese da pessoa.
-- Spec:  docs/superpowers/specs/2026-09-01-anamnese-por-pessoa-design.md
-- Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 2)
--
-- POR QUE O FLAG CONTINUA EXISTINDO: tres consumidores o leem sem passar pela
-- ficha -- o filtro da Lista de Alunos, a Conciliacao (`anamnese_pendente`, gerado
-- pelo sync-matriculas-emusys) e `features_churn_alunos_ativos`, do modelo de
-- risco de evasao. Mata-lo exigiria mexer nos tres; espelha-lo faz os tres
-- herdarem a correcao.
--
-- SEGURANCA DO RECALCULO: medido em 01/09/2026, ha 0 linhas com o flag `true` sem
-- anamnese vinculada. O recalculo so LIGA -- nao existe caso de desligar.

create or replace function public.fn_sincronizar_anamnese_preenchida_pessoa(
  p_unidade_id uuid,
  p_pessoa_chave text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anam   public.anamneses%rowtype;
  v_linhas integer := 0;
begin
  if p_unidade_id is null or p_pessoa_chave is null then
    return 0;
  end if;

  -- A vigente e a completa mais recente. As anteriores ficam como historico
  -- (a ficha as expoe), nunca sao apagadas.
  select * into v_anam
    from public.anamneses
   where unidade_id = p_unidade_id
     and pessoa_chave = p_pessoa_chave
     and status = 'completa'
   order by created_at desc
   limit 1;

  if not found then
    return 0;
  end if;

  update public.alunos a
     set anamnese_preenchida = true,
         anamnese_preenchida_em = coalesce(a.anamnese_preenchida_em, v_anam.created_at, now()),
         temperamento_codinome = v_anam.temperamento_codinome,
         updated_at = now()
    from public.vw_aluno_pessoa_chave v
   where v.aluno_id = a.id
     and a.unidade_id = p_unidade_id
     and v.pessoa_chave = p_pessoa_chave
     and (a.anamnese_preenchida is distinct from true
          or a.temperamento_codinome is distinct from v_anam.temperamento_codinome);

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$function$;

revoke execute on function public.fn_sincronizar_anamnese_preenchida_pessoa(uuid, text) from public;
revoke execute on function public.fn_sincronizar_anamnese_preenchida_pessoa(uuid, text) from anon;
revoke execute on function public.fn_sincronizar_anamnese_preenchida_pessoa(uuid, text) from authenticated;
grant execute on function public.fn_sincronizar_anamnese_preenchida_pessoa(uuid, text) to service_role;

-- Gatilho 1: anamnese criada ou completada. Antes marcava SO a linha vinculada.
create or replace function public.fn_atualizar_aluno_anamnese()
returns trigger
language plpgsql
as $function$
begin
  if new.aluno_id is not null and new.status = 'completa' then
    perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, new.pessoa_chave);
  end if;
  return new;
end;
$function$;

-- Gatilho 2: matricula nova. Continua adotando anamnese orfa por nome
-- (unidade + tipo, como antes) e passa a herdar tambem a anamnese ja vinculada
-- da pessoa -- que e o caso do aluno que entra num segundo curso.
create or replace function public.fn_vincular_anamnese_pendente()
returns trigger
language plpgsql
as $function$
declare
  v_chave text;
begin
  update public.anamneses set
    aluno_id = new.id,
    vinculo_status = 'vinculado'
  where vinculo_status = 'pendente'
    and aluno_id is null
    and unidade_id = new.unidade_id
    and lower(btrim(nome_aluno)) = lower(btrim(new.nome))
    and tipo_formulario = new.classificacao;

  select pessoa_chave into v_chave
    from public.vw_aluno_pessoa_chave where aluno_id = new.id;

  perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, v_chave);
  return new;
end;
$function$;

-- Gatilho 3 (NOVO): o vinculo com o Emusys pode chegar DEPOIS, pelo sync. Sem
-- este gatilho, a linha que nasce sem emusys_student_id e o recebe mais tarde
-- ficaria para tras em silencio -- e exatamente o bug que motivo_saida_id teve
-- ate 20/08/2026, quando a resolucao era so no INSERT.
create or replace function public.fn_alunos_vinculo_emusys_anamnese()
returns trigger
language plpgsql
as $function$
declare
  v_chave text;
begin
  select pessoa_chave into v_chave
    from public.vw_aluno_pessoa_chave where aluno_id = new.id;
  perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, v_chave);
  return new;
end;
$function$;

drop trigger if exists trg_alunos_vinculo_emusys_anamnese on public.alunos;
create trigger trg_alunos_vinculo_emusys_anamnese
  after update of emusys_student_id on public.alunos
  for each row
  when (new.emusys_student_id is distinct from old.emusys_student_id)
  execute function public.fn_alunos_vinculo_emusys_anamnese();

-- Recalculo geral.
do $$
declare r record;
begin
  for r in
    select distinct unidade_id, pessoa_chave
      from public.anamneses
     where status = 'completa' and pessoa_chave is not null
  loop
    perform public.fn_sincronizar_anamnese_preenchida_pessoa(r.unidade_id, r.pessoa_chave);
  end loop;
end $$;
