-- Motivo obrigatório quando o aluno NÃO vai ao recital (LAPE-39, item 11 da reunião de 08/10/2026).
--
-- O cadastro dos motivos é da própria equipe (decisão do Hugo, 09/10): cada unidade cria,
-- renomeia e desativa os seus na aba Alunos. Motivo não se apaga — só desativa — para o
-- "não vai" já gravado continuar dizendo por quê.
--
-- A obrigatoriedade mora no BANCO, mas só para quem marca pela tela (sessão de usuário que
-- não é família nem LA Teacher): confirmação da família e escrita de sistema seguem livres.
-- Linhas antigas com 'nao' sem motivo (58 em 09/10) não são tocadas; a tela as mostra
-- como "sem motivo" e deixa preencher.
--
-- Custo/dia: zero rotina; um gatilho de linha em evento_participacao (escrita humana, rara).

create table if not exists public.evento_motivo_ausencia (
  id          bigint generated always as identity primary key,
  unidade_id  uuid not null references public.unidades(id),
  nome        text not null check (length(btrim(nome)) between 2 and 80),
  ativo       boolean not null default true,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
comment on table public.evento_motivo_ausencia is
  'Motivos de o aluno não ir ao recital, cadastrados pela equipe de cada unidade. '
  'Não se apaga: desativa (ativo=false), para o histórico continuar legível.';

create unique index if not exists uq_evento_motivo_ausencia_nome
  on public.evento_motivo_ausencia (unidade_id, lower(btrim(nome)));

alter table public.evento_motivo_ausencia enable row level security;
create policy evento_motivo_ausencia_escopada on public.evento_motivo_ausencia
  for all
  using ((select is_admin()) or unidade_id in (select get_user_unidade_ids()))
  with check ((select is_admin()) or unidade_id in (select get_user_unidade_ids()));
revoke all on public.evento_motivo_ausencia from public, anon, authenticated;
grant select, insert, update on public.evento_motivo_ausencia to authenticated;
grant all on public.evento_motivo_ausencia to service_role;

-- Ponto de partida (provisório): a equipe renomeia ou desativa o que não servir.
insert into public.evento_motivo_ausencia (unidade_id, nome, ordem, created_by)
select u.id, m.nome, m.ordem, null
  from public.unidades u
 cross join (values
   ('Viagem', 1),
   ('Compromisso no dia do recital', 2),
   ('Não quer se apresentar', 3),
   ('Saúde', 4),
   ('Outro', 99)
 ) as m(nome, ordem)
 where u.ativo
on conflict do nothing;

alter table public.evento_participacao
  add column if not exists motivo_ausencia_id bigint references public.evento_motivo_ausencia(id),
  add column if not exists motivo_ausencia_obs text;
comment on column public.evento_participacao.motivo_ausencia_id is
  'Por que a pessoa NÃO vai (status=nao). Obrigatório quando a equipe marca pela tela; '
  'limpo sozinho quando o status deixa de ser nao.';

create or replace function public.fn_evento_participacao_motivo_ausencia()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
declare
  v_unidade uuid;
begin
  if new.status is distinct from 'nao' then
    new.motivo_ausencia_id  := null;
    new.motivo_ausencia_obs := null;
    return new;
  end if;

  if new.motivo_ausencia_id is not null then
    select m.unidade_id into v_unidade
      from public.evento_motivo_ausencia m where m.id = new.motivo_ausencia_id;
    if v_unidade is distinct from new.unidade_id then
      raise exception 'evento_participacao: o motivo % não é da unidade do evento', new.motivo_ausencia_id
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Sem motivo: só recusa a marcação NOVA feita pela equipe na tela.
  if (tg_op = 'INSERT' or old.status is distinct from 'nao')
     and auth.uid() is not null
     and coalesce(public.fn_evento_origem_escrita(), '') not in ('familia', 'la_teacher', 'sol', 'sistema') then
    raise exception 'motivo_obrigatorio: escolha o motivo de o aluno não ir ao recital'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Roda DEPOIS do gatilho que deriva unidade_id (ordem alfabética: "deriva" < "motivo").
drop trigger if exists trg_evento_participacao_motivo_ausencia on public.evento_participacao;
create trigger trg_evento_participacao_motivo_ausencia
  before insert or update on public.evento_participacao
  for each row execute function public.fn_evento_participacao_motivo_ausencia();
