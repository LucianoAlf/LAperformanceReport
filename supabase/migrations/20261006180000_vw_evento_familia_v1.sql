-- Filtro "Família" do seletor da Grade de Eventos (pedido do Arthur/Hugo, 06/10/2026).
--
-- Pergunta: quais alunos ativos têm um FAMILIAR que também é aluno ativo da mesma unidade?
-- Regra forte (medida em 06/10: 45 pares nas 3 unidades, 14 ms):
--   o telefone do RESPONSÁVEL de um aluno é o telefone/whatsapp de um aluno adulto (18+)
--   E o primeiro nome do responsável cadastrado é o primeiro nome desse adulto.
-- ⚠️ Só telefone dá 143 pares e mistura irmãos (o número da mãe está no cadastro de um filho
--    e como responsável do outro) — por isso o nome é exigido.
-- ⚠️ Pega também cônjuge (aluno adulto cujo responsável cadastrado é a esposa aluna): o rótulo
--    é "família", nunca "pai e filho".
-- Uma linha por (pessoa, familiar), nos DOIS sentidos, para o seletor perguntar só por pessoa.
-- security_invoker: lê `alunos` com a RLS de quem chama (unidade vê a própria).
-- Custo: leitura sob demanda ao abrir o seletor; sem cron, sem escrita.

create or replace view public.vw_evento_familia_v1
with (security_invoker = true) as
with ativo as (
  select a.unidade_id,
         pc.pessoa_chave,
         a.nome,
         a.data_nascimento,
         a.telefone_key,
         a.whatsapp_key,
         a.responsavel_telefone_key,
         lower(public.unaccent(split_part(trim(coalesce(a.responsavel_nome, '')), ' ', 1))) as resp_primeiro,
         lower(public.unaccent(split_part(trim(a.nome), ' ', 1))) as primeiro
  from public.alunos a
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  where a.status = 'ativo'
), par as (
  select distinct
         f.unidade_id,
         f.pessoa_chave as dependente_chave,
         f.nome         as dependente_nome,
         r.pessoa_chave as responsavel_chave,
         r.nome         as responsavel_nome
  from ativo f
  join ativo r
    on r.unidade_id = f.unidade_id
   and r.pessoa_chave <> f.pessoa_chave
   and f.responsavel_telefone_key is not null
   and f.responsavel_telefone_key in (r.telefone_key, r.whatsapp_key)
   and f.resp_primeiro <> ''
   and f.resp_primeiro = r.primeiro
   and r.data_nascimento <= (current_date - interval '18 years')
)
select unidade_id, dependente_chave as pessoa_chave, responsavel_chave as familiar_chave,
       responsavel_nome as familiar_nome, 'responsavel'::text as familiar_papel
from par
union all
select unidade_id, responsavel_chave, dependente_chave, dependente_nome, 'dependente'::text
from par;

comment on view public.vw_evento_familia_v1 is
  'Alunos ativos com familiar também aluno ativo na mesma unidade (telefone do responsável = telefone do adulto E primeiro nome bate). Uma linha por (pessoa, familiar), nos dois sentidos. familiar_papel: responsavel = o familiar é o responsável cadastrado desta pessoa; dependente = esta pessoa é a responsável do familiar. Inclui cônjuge: rótulo é família.';

revoke all on public.vw_evento_familia_v1 from public, anon, authenticated;
grant select on public.vw_evento_familia_v1 to authenticated, service_role;
