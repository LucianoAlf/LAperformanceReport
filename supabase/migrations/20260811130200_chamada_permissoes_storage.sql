-- 2026-08-11 — Chamada na Agenda (Fase 2): grants, bucket e leitura de retificacoes
-- Spec: docs/superpowers/plans/2026-08-11-chamada-agenda-motor-presenca.md

-- 1) Permissao agenda.chamada para os perfis operacionais
--    (Admin e Gerente; ampliar depois e um clique na tela de permissoes)
insert into public.perfil_permissoes (perfil_id, permissao_id)
select pf.id, pm.id
from public.perfis pf
cross join public.permissoes pm
where pf.nome in ('Admin', 'Gerente')
  and pm.codigo = 'agenda.chamada'
on conflict do nothing;

-- 2) Leitura escopada das retificacoes (drawer mostra a trilha da aula)
grant select on table public.aluno_presenca_retificacoes to authenticated;

drop policy if exists aluno_presenca_retificacoes_leitura_escopada on public.aluno_presenca_retificacoes;
create policy aluno_presenca_retificacoes_leitura_escopada
  on public.aluno_presenca_retificacoes
  for select
  to authenticated
  using (
    (select public.is_admin())
    or unidade_id = (select public.get_user_unidade_id())
  );

-- 3) Bucket privado para evidencias (atestados, comunicados)
insert into storage.buckets (id, name, public)
values ('presenca-evidencias', 'presenca-evidencias', false)
on conflict (id) do nothing;

-- Leitura/escrita para autenticados (ferramenta interna; arquivo so e
-- referenciado pela propria chamada e acessado via URL assinada)
drop policy if exists presenca_evidencias_leitura on storage.objects;
create policy presenca_evidencias_leitura
  on storage.objects for select to authenticated
  using (bucket_id = 'presenca-evidencias');

drop policy if exists presenca_evidencias_upload on storage.objects;
create policy presenca_evidencias_upload
  on storage.objects for insert to authenticated
  with check (bucket_id = 'presenca-evidencias');
