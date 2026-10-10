-- Ficha Técnica LA — bloco "Minha carreira na música" (professores).
-- Mesmo desenho do Rider (20260805161447): bloco autodeclarado, sempre editável
-- pela própria pessoa pelo mesmo link de token, histórico por versão.
-- Campos: bio curta, instrumentos/nível, estilos, referências, trajetória,
-- formação, o que mais gosta de ensinar, 3 temas pra Dica do Mestre,
-- redes sociais (Instagram/YouTube/outra) e consentimento de vídeo/áudio.
-- Escrita: só a edge ficha-tecnica (service_role) e o dono/admin via app.
-- Leitura externa: mike_professores_carreira_v1 (sem telefone/e-mail/perfil).
-- Rollback pareado: supabase/rollbacks/20261009210000_ficha_carreira_musical_ROLLBACK.sql

create table if not exists public.colaborador_carreira (
  id bigserial primary key,
  colaborador_id integer not null unique references public.colaboradores(id) on delete cascade,
  respostas jsonb not null default '{}'::jsonb,
  versao integer not null default 1,
  preenchido_em timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.colaborador_carreira_versoes (
  id bigserial primary key,
  colaborador_id integer not null references public.colaboradores(id) on delete cascade,
  versao integer not null,
  respostas jsonb not null,
  registrado_em timestamptz not null default now()
);

create index if not exists idx_carreira_versoes_colaborador
  on public.colaborador_carreira_versoes(colaborador_id, versao desc);

comment on table public.colaborador_carreira is
  'Bloco "Minha carreira na música" da Ficha Técnica (departamento Professores). A pessoa é dona do conteúdo e edita quando quiser pelo mesmo link da ficha; histórico em colaborador_carreira_versoes.';

comment on column public.colaborador_carreira.respostas is
  'jsonb com os ids canônicos do bloco: bio_curta, instrumentos_nivel, estilos, referencias, trajetoria, formacao, gosta_ensinar, dica_mestre_1..3, instagram, youtube, outra_rede, topa_video_audio (sim_video_audio|so_video|so_audio|nao_topa). Banco de campos mora na edge ficha-tecnica, como no Rider.';

alter table public.colaborador_carreira enable row level security;
alter table public.colaborador_carreira_versoes enable row level security;

-- Leitura: próprio dono, admin e perfil unidade (mesma régua do Rider, 20260805201022)
create policy carreira_leitura on public.colaborador_carreira
  for select to authenticated
  using (
    colaborador_id in (select c.id from public.colaboradores c where c.usuario_id = auth.uid())
    or exists (select 1 from public.usuarios u
               where u.auth_user_id = auth.uid() and u.perfil = 'admin')
    or exists (select 1 from public.usuarios u
               join public.colaboradores c on c.id = colaborador_carreira.colaborador_id
               where u.auth_user_id = auth.uid()
                 and u.perfil = 'unidade'
                 and u.unidade_id = c.unidade_id)
  );

create policy carreira_escrita_dono on public.colaborador_carreira
  for all to authenticated
  using (
    colaborador_id in (select c.id from public.colaboradores c where c.usuario_id = auth.uid())
    or exists (select 1 from public.usuarios u
               where u.auth_user_id = auth.uid() and u.perfil = 'admin')
  )
  with check (
    colaborador_id in (select c.id from public.colaboradores c where c.usuario_id = auth.uid())
    or exists (select 1 from public.usuarios u
               where u.auth_user_id = auth.uid() and u.perfil = 'admin')
  );

comment on policy carreira_leitura on public.colaborador_carreira is
  'Leitura: próprio dono, admin (todas unidades) e perfil unidade (só a sua). Professor não lê de colegas.';

create policy carreira_versoes_admin on public.colaborador_carreira_versoes
  for select to authenticated
  using (exists (select 1 from public.usuarios u
                 where u.auth_user_id = auth.uid() and u.perfil = 'admin'));

-- Agente Sol: leitura restrita, mesmo padrão já usado no Rider
grant select on public.colaborador_carreira to sol_acesso_restrito;
drop policy if exists carreira_sol_readonly on public.colaborador_carreira;
create policy carreira_sol_readonly on public.colaborador_carreira
  for select to sol_acesso_restrito using (true);
