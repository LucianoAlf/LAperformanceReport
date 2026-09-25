-- RPCs do form de caixa para ler `emusys_faturas`.
-- Por que: a tabela é espelho service-role (sem policy de authenticated). O form
-- lia direto nela — o search funcionava porque vai pela RPC canônica
-- (security definer), mas "vincular outras faturas" e a resolução da FK no submit
-- batiam na RLS e voltavam vazio: o botão listava "nenhuma fatura" e o lançamento
-- salvava SEM vínculo, em silêncio. Medido em 25/09/2026 com o caso do Lucas
-- Azevedo (12 parcelas no cartão, R$ 4.752).
-- Mesmo controle de acesso da canônica: service_role, admin ou usuário da unidade.

create or replace function public.caixa_faturas_do_aluno_v1(
  p_unidade_id uuid,
  p_emusys_student_id bigint
)
returns table (
  id uuid,
  emusys_fatura_id bigint,
  competencia date,
  data_vencimento date,
  status text,
  valor_original numeric,
  valor_pago numeric,
  desconto_fixo numeric,
  desconto_condicional numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select f.id, f.emusys_fatura_id, f.competencia, f.data_vencimento, f.status,
         f.valor_original, f.valor_pago, f.desconto_fixo, f.desconto_condicional
    from public.emusys_faturas f
   where f.unidade_id = p_unidade_id
     and f.emusys_student_id = p_emusys_student_id
     and (
       coalesce(auth.role(), '') = 'service_role'
       or public.is_admin()
       or f.unidade_id in (select public.get_user_unidade_ids())
     )
   order by f.competencia;
$$;

create or replace function public.caixa_fatura_resolver_id_v1(
  p_unidade_id uuid,
  p_emusys_fatura_id bigint
)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select f.id
    from public.emusys_faturas f
   where f.unidade_id = p_unidade_id
     and f.emusys_fatura_id = p_emusys_fatura_id
     and (
       coalesce(auth.role(), '') = 'service_role'
       or public.is_admin()
       or f.unidade_id in (select public.get_user_unidade_ids())
     )
   limit 1;
$$;

grant execute on function public.caixa_faturas_do_aluno_v1(uuid, bigint) to authenticated;
grant execute on function public.caixa_fatura_resolver_id_v1(uuid, bigint) to authenticated;

comment on function public.caixa_faturas_do_aluno_v1 is
  'Todas as faturas do aluno no espelho (sem janela de competência) para o vínculo composto do caixa. Security definer porque emusys_faturas é service-only.';
comment on function public.caixa_fatura_resolver_id_v1 is
  'Resolve a FK emusys_faturas.id a partir do par (unidade, emusys_fatura_id) para o form de caixa. Security definer pela mesma razão.';
