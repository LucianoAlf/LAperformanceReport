-- Espelho COMPLETO de documentos (CPF) de alunos e responsáveis do Emusys.
-- Diferença para alunos.responsavel_cpf: `alunos` só contém quem a escola cadastrou
-- aqui (~1.7k); o Emusys tem ~4k pessoas (ativos, trancados, inativos). Para
-- reconciliar Pix histórico — que pode ser de aluno que já saiu — o documento
-- precisa resolver também fora do cadastro vivo.
-- Chave: (unidade_id, emusys_student_id) — ids do Emusys são por unidade.
-- Formato: 11 dígitos sem máscara. Para o Super Folha trafega só hash HMAC.

create table if not exists public.emusys_pessoas_documentos (
  unidade_id uuid not null references public.unidades(id),
  emusys_student_id text not null,
  aluno_nome text,
  aluno_cpf text,
  responsavel_emusys_id integer,
  responsavel_nome text,
  responsavel_cpf text,
  synced_at timestamptz not null default now(),
  primary key (unidade_id, emusys_student_id)
);

comment on table public.emusys_pessoas_documentos is
  'Espelho de CPFs de aluno/responsável de GET /matriculas (Emusys), todos os status — inclusive alunos sem linha em `alunos`. Resolve "CPF do pagador do Pix -> aluno" também no histórico.';

create index if not exists idx_epd_responsavel_cpf
  on public.emusys_pessoas_documentos (responsavel_cpf)
  where responsavel_cpf is not null;

create index if not exists idx_epd_aluno_cpf
  on public.emusys_pessoas_documentos (aluno_cpf)
  where aluno_cpf is not null;

create index if not exists idx_epd_responsavel_id
  on public.emusys_pessoas_documentos (responsavel_emusys_id)
  where responsavel_emusys_id is not null;

alter table public.emusys_pessoas_documentos enable row level security;

-- leitura no mesmo recorte de `alunos`: admin ou usuário da própria unidade
create policy epd_select_policy on public.emusys_pessoas_documentos
  for select to authenticated
  using (is_admin() or (unidade_id in (select get_user_unidade_ids())));
