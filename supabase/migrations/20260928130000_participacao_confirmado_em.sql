-- 28/09/2026 — evento_participacao.confirmado_em: quando a pessoa virou 'participa'.
--
-- Pedido do LA Teacher (28/09): a carteira do professor cresce junto com as
-- confirmacoes e eles querem mostrar "aluno novo no recital". `created_at` nao serve
-- (a linha pode nascer 'indefinido' ou via check-in) e `updated_at` muda a cada
-- convidado editado. Por isso e TRIGGER e nao escrita no caminho: o tri-state da aba
-- Alunos, o marcar-em-lote e o INSERT do check-in passam todos por aqui.
--
-- Semantica: ultimo instante em que o status VIROU 'participa'. Saindo para 'nao' ou
-- 'indefinido' o carimbo fica — e um fato historico ("chegou a confirmar em X"),
-- nao uma copia do status atual. Re-confirmando, re-carimba.

alter table public.evento_participacao
  add column if not exists confirmado_em timestamptz;
comment on column public.evento_participacao.confirmado_em is
  'Ultimo instante em que status virou participa. Fica mesmo se a pessoa desiste depois.';

create or replace function public.fn_evento_participacao_confirmado_em()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.status = 'participa' then
    new.confirmado_em := coalesce(new.confirmado_em, now());
  elsif tg_op = 'UPDATE'
        and new.status = 'participa'
        and old.status is distinct from 'participa' then
    new.confirmado_em := now();
  end if;
  return new;
end;
$$;
revoke all on function public.fn_evento_participacao_confirmado_em()
  from public, anon, authenticated;

drop trigger if exists trg_evento_participacao_confirmado_em on public.evento_participacao;
create trigger trg_evento_participacao_confirmado_em
  before insert or update on public.evento_participacao
  for each row execute function public.fn_evento_participacao_confirmado_em();

-- Backfill honesto: para quem ja esta 'participa', a melhor aproximacao existente e o
-- created_at da linha (o lote inicial da Barra nasceu confirmado). Quem nunca
-- confirmou fica NULL — e a resposta correta, nao zero.
update public.evento_participacao
   set confirmado_em = created_at
 where status = 'participa' and confirmado_em is null;
