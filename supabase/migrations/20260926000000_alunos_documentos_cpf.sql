-- Documentos (CPF) do aluno e do responsável, espelhados de GET /matriculas (Emusys).
-- Por quê: o Pix recebido no banco identifica o PAGADOR por CPF (Pluggy paymentData),
-- e quem paga é quase sempre o responsável. Sem esta coluna não havia como resolver
-- "de quem é este Pix" por documento — só por nome/planilha.
-- Fonte: responsavel.cpf / aluno.cpf da API /matriculas (v1.7.0). Espelho local
-- (emusys_api_payload) capturado em 27/06/2026 é anterior ao campo — por isso o
-- backfill é por pull novo, não pelo payload antigo.
-- Formato: 11 dígitos, sem máscara. LGPD: dado cadastral da própria escola
-- (o Emusys já o detém); para integração externa (Super Folha) trafega só o hash HMAC.

alter table public.alunos
  add column if not exists aluno_cpf text,
  add column if not exists responsavel_cpf text,
  add column if not exists responsavel_emusys_id integer;

comment on column public.alunos.aluno_cpf is
  'CPF do próprio aluno (11 dígitos), espelhado de GET /matriculas aluno.cpf. Frequentemente vazio em menor de idade.';
comment on column public.alunos.responsavel_cpf is
  'CPF do responsável financeiro (11 dígitos), espelhado de GET /matriculas responsavel.cpf. É o documento que aparece como pagador nos Pix do banco.';
comment on column public.alunos.responsavel_emusys_id is
  'id da pessoa responsável no Emusys (responsavel.id de /matriculas). Une irmãos sob o mesmo pagador (mesmo CPF, vários alunos).';

-- join por documento do pagador (reconciliação Pix -> aluno)
create index if not exists idx_alunos_responsavel_cpf
  on public.alunos (responsavel_cpf)
  where responsavel_cpf is not null;

create index if not exists idx_alunos_aluno_cpf
  on public.alunos (aluno_cpf)
  where aluno_cpf is not null;
