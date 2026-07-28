-- Disponibilidade canônica do LA Report.
-- O formulário trabalha apenas com Segunda-Sábado e não deve preservar aliases legados.

do $$
declare
  v_linhas integer;
begin
  update public.professores_unidades pu
  set disponibilidade = pu.disponibilidade - 'Sexta-feira',
      updated_at = now()
  from public.professores p,
       public.unidades u
  where p.id = pu.professor_id
    and u.id = pu.unidade_id
    and p.nome = 'Matheus Sterque Mendes'
    and u.nome = 'Campo Grande'
    and pu.disponibilidade ? 'Sexta-feira';

  get diagnostics v_linhas = row_count;

  if v_linhas <> 1 then
    raise exception
      'esperada uma disponibilidade órfã de Matheus Sterque Mendes em Campo Grande; encontradas %',
      v_linhas;
  end if;
end;
$$;

create or replace function public.fn_disponibilidade_professor_canonica_valida(
  p_disponibilidade jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_disponibilidade is null then
    return true;
  end if;

  if jsonb_typeof(p_disponibilidade) <> 'object'
     or not public.fn_disponibilidade_professor_valida(p_disponibilidade) then
    return false;
  end if;

  return not exists (
    select 1
    from jsonb_object_keys(p_disponibilidade) as dia(chave)
    where dia.chave not in ('Segunda', 'Quarta', 'Quinta', 'Sexta')
      and encode(convert_to(dia.chave, 'UTF8'), 'hex') not in (
        '546572c3a761',
        '53c3a16261646f'
      )
  );
exception
  when others then
    return false;
end;
$$;

revoke all on function public.fn_disponibilidade_professor_canonica_valida(jsonb)
  from public, anon, authenticated;

alter table public.professores_unidades
  drop constraint if exists professores_unidades_disponibilidade_canonica_check;

alter table public.professores_unidades
  add constraint professores_unidades_disponibilidade_canonica_check
  check (
    public.fn_disponibilidade_professor_canonica_valida(disponibilidade)
  ) not valid;

alter table public.professores_unidades
  validate constraint professores_unidades_disponibilidade_canonica_check;

comment on function public.fn_disponibilidade_professor_canonica_valida(jsonb) is
  'Valida a disponibilidade oficial do LA Report no domínio exato Segunda-Sábado.';

comment on constraint professores_unidades_disponibilidade_canonica_check
  on public.professores_unidades is
  'Impede chaves de dia fora do domínio canônico usado pela Gestão de Professores.';
