-- Fonte unica de "de quem e este numero?" para a Caixa de Entrada.
--
-- A busca que existia dentro do webhook-whatsapp-inbox era `telefone LIKE '%<sufixo>'
-- OR whatsapp LIKE '%<sufixo>'`. Dois furos medidos em 12/09/2026:
--   1. nunca lia `responsavel_telefone` — e a familia costuma escrever pelo numero do
--      responsavel (392 numeros de responsavel de aluno ATIVO nao aparecem em
--      telefone/whatsapp de ninguem);
--   2. o LIKE compara contra o campo cru, e 446 cadastros ativos guardam o telefone com
--      mascara ("(21) 99879-6116") — o sufixo de digitos nunca casa. Simulando o jid que
--      o WhatsApp entrega, 335 dos 654 numeros do proprio aluno (51%) ja nao eram
--      reconhecidos hoje.
-- Consequencia: a conversa nascia como contato externo (EXTERNO / SEM UNIDADE / NAO
-- CADASTRADO) e a mensagem ficava sem `aluno_id`, entao o selo do aluno na bolha nao
-- tinha o que mostrar.
--
-- A normalizacao mora em fn_normalizar_telefone_br_key (IMMUTABLE) e a identidade da
-- pessoa em vw_aluno_pessoa_chave — esta funcao LE as duas, nunca reimplementa.
create index if not exists idx_alunos_key_telefone
  on public.alunos (public.fn_normalizar_telefone_br_key(telefone))
  where telefone is not null;

create index if not exists idx_alunos_key_whatsapp
  on public.alunos (public.fn_normalizar_telefone_br_key(whatsapp))
  where whatsapp is not null;

create index if not exists idx_alunos_key_responsavel_telefone
  on public.alunos (public.fn_normalizar_telefone_br_key(responsavel_telefone))
  where responsavel_telefone is not null;

-- O corpo vigente da funcao esta na migration 20260912200328 (corrige via_responsavel).
create or replace function public.resolver_aluno_caixa_por_telefone_v1(
  p_telefone text,
  p_unidade_id uuid default null
) returns jsonb
language sql
stable
as $$
with entrada as (
  select public.fn_normalizar_telefone_br_key(p_telefone) as chave
),
cand as (
  select a.id,
         a.nome,
         a.unidade_id,
         a.status,
         coalesce(a.is_segundo_curso, false) as is_segundo_curso,
         pc.pessoa_chave,
         (a.status in ('ativo','aviso_previo','trancado')) as vivo,
         (public.fn_normalizar_telefone_br_key(a.telefone) = e.chave
          or public.fn_normalizar_telefone_br_key(a.whatsapp) = e.chave) as via_aluno
  from entrada e
  join public.alunos a
    on e.chave is not null
   and (public.fn_normalizar_telefone_br_key(a.telefone) = e.chave
     or public.fn_normalizar_telefone_br_key(a.whatsapp) = e.chave
     or public.fn_normalizar_telefone_br_key(a.responsavel_telefone) = e.chave)
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
),
-- Matricula viva manda sobre encerrada: ex-aluno e irmao ativo dividindo o numero do
-- responsavel nao pode virar ambiguidade. So quando NENHUMA esta viva o encerrado responde.
vivos as (
  select * from cand
  where vivo or not exists (select 1 from cand where vivo)
),
-- A caixa do Sucesso do Aluno e consolidada (p_unidade_id nulo); caixa de unidade fixa
-- prefere a propria unidade, com fallback global — quem escreve pode ser de outra.
escopo as (
  select * from vivos v
  where p_unidade_id is null
     or v.unidade_id = p_unidade_id
     or not exists (select 1 from vivos v2 where v2.unidade_id = p_unidade_id)
),
-- Pessoa = (unidade_id, pessoa_chave): `alunos` e matricula, entao 2 cursos da mesma
-- pessoa sao 1 so dono. emusys_student_id colide entre unidades, por isso a unidade entra
-- na chave — a mesma id em duas unidades conta como duas pessoas (recusa, nao chute).
pessoas as (
  select count(distinct e.unidade_id::text || '|' || e.pessoa_chave) as qtd from escopo e
),
eleito as (
  select * from escopo
  order by is_segundo_curso, id
  limit 1
)
select case
  when (select count(*) from escopo) = 0
    then jsonb_build_object('status', 'nenhum')
  when (select qtd from pessoas) > 1
    then jsonb_build_object(
      'status', 'ambiguo',
      'candidatos', (
        select jsonb_agg(distinct jsonb_build_object(
          'aluno_id', e.id, 'nome', e.nome, 'unidade_id', e.unidade_id))
        from escopo e
      )
    )
  else jsonb_build_object(
    'status', 'unico',
    'aluno_id', (select id from eleito),
    'nome', (select nome from eleito),
    'unidade_id', (select unidade_id from eleito),
    -- so para log: distingue "o aluno escreveu" de "o responsavel escreveu".
    'via_responsavel', (select not bool_or(via_aluno) from escopo)
  )
end;
$$;

comment on function public.resolver_aluno_caixa_por_telefone_v1(text, uuid) is
'Caixa de Entrada: resolve o dono de um numero (telefone, whatsapp OU responsavel_telefone), normalizado, colapsando matriculas na mesma pessoa. Devolve status unico|ambiguo|nenhum. Ambiguo = irmaos no mesmo numero: NAO escolhe, quem decide e quem le a mensagem.';

-- ALTER DEFAULT PRIVILEGES do schema public concede EXECUTE a anon em funcao nova:
-- revogar nominalmente (ver "Regras Importantes" do CLAUDE.md).
revoke all on function public.resolver_aluno_caixa_por_telefone_v1(text, uuid) from public, anon;
grant execute on function public.resolver_aluno_caixa_por_telefone_v1(text, uuid) to authenticated, service_role;
