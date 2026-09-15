-- LAPE-34 — expor QUAL contato do aluno esta na comunidade WhatsApp.
--
-- A LAPE-33 respondia so "esta ou nao esta". O pedido do Hugo: dizer tambem de quem e o
-- numero que casou -- do proprio aluno ou do responsavel -- porque quem fala pela crianca
-- costuma ser o responsavel, e a equipe precisa saber com quem falar.
--
-- A v1 DESCARTAVA essa informacao: o CTE `fones` normalizava alunos.telefone,
-- alunos.whatsapp, alunos.responsavel_telefone e aluno_contatos.telefone num unico
-- telefone_key, e `matches` fazia DISTINCT sem carregar de onde veio.
--
-- Medido em 14/09 -- 705 numeros de 680 alunos que estao na comunidade:
--   so campo do RESPONSAVEL                269 (38%)
--   MESMO numero em aluno E responsavel    217 (31%)
--   so campo do ALUNO                      217 (31%)
--   so em aluno_contatos                     2
--
-- ⚠️ Os 31% do meio NAO sao indecisao nossa: e o cadastro que guarda o mesmo numero nos
-- dois campos. Escolher um seria inventar o que o cadastro nao diz -- mesma regua de
-- `sem_captura` nao virar "fora" na LAPE-33. Por isso existe o valor
-- `aluno_e_responsavel`, e a tela o escreve por extenso.
--
-- ⚠️ `union all` no lugar de `union` no CTE `fones`: a origem passou a importar e o mesmo
-- numero costuma estar em varios campos. A deduplicacao migrou para `fones_agg`, que
-- COMBINA as origens do mesmo numero em vez de escolher uma.
--
-- ⚠️ A exibicao usa o telefone COMO ESTA no cadastro, nunca a telefone_key: a
-- fn_normalizar_telefone_br_key descarta o 9o digito do celular (21987654321 ->
-- 2187654321), entao a key mostraria um numero que ninguem reconhece.
--
-- ⚠️ 25 alunos tem 2+ numeros distintos dentro do grupo (mae e pai, tipicamente).
-- `contatos_no_grupo` traz todos, em ordem deterministica -- sem o ORDER BY a tela
-- trocaria de contato a cada carregamento.
--
-- ⚠️ O CTE junta os telefones de todas as matriculas da mesma PESSOA (pessoa_chave), como
-- na v1. O numero pode vir de outro cadastro da mesma pessoa; e correto (e a mesma
-- pessoa), e por isso o rotulo fala do aluno/responsavel, nunca "desta matricula".
--
-- Paridade e custo medidos contra a v1: estado identico (680 na_comunidade / 1039 fora /
-- 1719 total) e 1.161 ms contra 1.143 ms (+1,6%), buffers 4.149 contra 4.147. Importa
-- porque esta view roda no mesmo Promise.all da leitura financeira, que ate hoje vivia a
-- 665 ms do teto de 8s (PR #465).

create or replace view public.vw_aluno_comunidade_wa_v1 as
with fones as (
  select a.id as aluno_id, a.unidade_id, pc.pessoa_chave,
         fn_normalizar_telefone_br_key(f.fone::text) as telefone_key,
         f.origem, f.fone::text as telefone_original,
         null::text as contato_nome, null::text as contato_parentesco, false as contato_principal
  from alunos a
  join vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  join vw_aluno_pessoa_chave irmas on irmas.pessoa_chave = pc.pessoa_chave and irmas.unidade_id = pc.unidade_id
  join alunos a2 on a2.id = irmas.aluno_id
  cross join lateral (values
    ('aluno'::text, a2.telefone), ('aluno'::text, a2.whatsapp), ('responsavel'::text, a2.responsavel_telefone)
  ) f(origem, fone)
  where fn_normalizar_telefone_br_key(f.fone::text) is not null
  union all
  select a.id, a.unidade_id, pc.pessoa_chave,
         fn_normalizar_telefone_br_key(ac.telefone::text),
         'contato_extra'::text, ac.telefone::text, ac.nome::text, ac.parentesco::text, coalesce(ac.principal,false)
  from alunos a
  join vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  join vw_aluno_pessoa_chave irmas on irmas.pessoa_chave = pc.pessoa_chave and irmas.unidade_id = pc.unidade_id
  join aluno_contatos ac on ac.aluno_id = irmas.aluno_id
  where fn_normalizar_telefone_br_key(ac.telefone::text) is not null
),
fones_agg as (
  select aluno_id, unidade_id, pessoa_chave, telefone_key,
         bool_or(origem='aluno') as e_do_aluno,
         bool_or(origem='responsavel') as e_do_responsavel,
         bool_or(origem='contato_extra') as e_contato_extra,
         bool_or(contato_principal) as e_contato_principal,
         (array_agg(telefone_original order by length(telefone_original) desc, telefone_original))[1] as telefone_exibicao,
         (array_agg(contato_nome) filter (where contato_nome is not null))[1] as contato_nome,
         (array_agg(contato_parentesco) filter (where contato_parentesco is not null))[1] as contato_parentesco
  from fones group by aluno_id, unidade_id, pessoa_chave, telefone_key
),
grupos_ativos as (
  select g.id, g.unidade_id, g.nome,
         (select max(p.capturado_em) from comunidade_wa_participantes p where p.grupo_id = g.id) as ultima_captura
  from comunidade_wa_grupos g where g.ativo
),
captura_global as (select max(ultima_captura) as mais_recente, count(*) as total_grupos from grupos_ativos),
matches as (
  select f.aluno_id, f.unidade_id as aluno_unidade_id, g.id as grupo_id, g.unidade_id as grupo_unidade_id,
         g.nome as grupo_nome, g.ultima_captura, f.telefone_key, f.telefone_exibicao,
         f.contato_nome, f.contato_parentesco, f.e_contato_principal,
         case when f.e_do_aluno and f.e_do_responsavel then 'aluno_e_responsavel'
              when f.e_do_aluno then 'aluno'
              when f.e_do_responsavel then 'responsavel'
              else 'contato_extra' end as de_quem
  from fones_agg f
  join comunidade_wa_participantes p on p.telefone_key = f.telefone_key
  join grupos_ativos g on g.id = p.grupo_id
),
match_escolhido as (
  select distinct on (m.aluno_id) m.aluno_id, m.grupo_id, m.grupo_nome, m.grupo_unidade_id,
         m.grupo_unidade_id = m.aluno_unidade_id as grupo_mesma_unidade, m.ultima_captura
  from matches m
  order by m.aluno_id, (m.grupo_unidade_id = m.aluno_unidade_id) desc, m.ultima_captura desc nulls last, m.grupo_id
),
contatos_do_grupo as (
  select mm.aluno_id,
         (array_agg(mm.telefone_exibicao order by mm.ord, mm.telefone_key))[1] as contato_telefone,
         (array_agg(mm.de_quem order by mm.ord, mm.telefone_key))[1] as contato_de_quem,
         (array_agg(mm.contato_nome order by mm.ord, mm.telefone_key))[1] as contato_nome,
         (array_agg(mm.contato_parentesco order by mm.ord, mm.telefone_key))[1] as contato_parentesco,
         count(*)::int as contatos_no_grupo_total,
         jsonb_agg(jsonb_build_object('telefone', mm.telefone_exibicao, 'de_quem', mm.de_quem,
                                      'nome', mm.contato_nome, 'parentesco', mm.contato_parentesco)
                   order by mm.ord, mm.telefone_key) as contatos_no_grupo
  from (
    select m.*, case m.de_quem when 'aluno_e_responsavel' then 1 when 'aluno' then 2
                               when 'responsavel' then 3 else 4 end
                + case when m.e_contato_principal then -1 else 0 end as ord
    from matches m
  ) mm
  join match_escolhido me on me.aluno_id = mm.aluno_id and me.grupo_id = mm.grupo_id
  group by mm.aluno_id
),
outros_grupos as (
  select m.aluno_id, array_agg(distinct m.grupo_nome order by m.grupo_nome) as nomes
  from matches m join match_escolhido me on me.aluno_id = m.aluno_id and m.grupo_id <> me.grupo_id
  group by m.aluno_id
)
select a.id as aluno_id, a.unidade_id,
       case when me.aluno_id is not null then 'na_comunidade'
            when cg.total_grupos = 0 then 'sem_grupo_configurado'
            when cg.mais_recente is null then 'sem_captura'
            when cg.mais_recente < (now() - '2 days'::interval) then 'captura_desatualizada'
            else 'fora_da_comunidade' end as estado,
       me.grupo_id, me.grupo_nome, me.grupo_unidade_id, me.grupo_mesma_unidade,
       me.ultima_captura as capturado_em, og.nomes as outros_grupos_nomes,
       cdg.contato_telefone, cdg.contato_de_quem, cdg.contato_nome, cdg.contato_parentesco,
       cdg.contatos_no_grupo_total, cdg.contatos_no_grupo
from alunos a
cross join captura_global cg
left join match_escolhido me on me.aluno_id = a.id
left join outros_grupos og on og.aluno_id = a.id
left join contatos_do_grupo cdg on cdg.aluno_id = a.id;

comment on column public.vw_aluno_comunidade_wa_v1.contato_de_quem is
  'De quem e o numero que casou no grupo: aluno | responsavel | aluno_e_responsavel | contato_extra. "aluno_e_responsavel" e o cadastro guardando o MESMO numero nos dois campos (31% dos casos em 14/09), nao indecisao -- escolher um seria inventar.';
comment on column public.vw_aluno_comunidade_wa_v1.contato_telefone is
  'Telefone COMO ESTA no cadastro, nunca a telefone_key (que descarta o 9o digito do celular).';
comment on column public.vw_aluno_comunidade_wa_v1.contatos_no_grupo is
  'Todos os numeros desta pessoa dentro do grupo escolhido, em ordem deterministica. 25 alunos tem 2+ (mae e pai, tipicamente).';

-- A ACL da view nao pode reabrir para anon: comunidade_wa_grupos/participantes tem RLS
-- ligado e ZERO policy, e esta view roda como o dono (security_invoker default = false).
-- CREATE OR REPLACE preserva a ACL, mas a armadilha do ALTER DEFAULT PRIVILEGES ja mordeu
-- neste repo mais de uma vez -- entao a migration CONFERE em vez de confiar.
do $$
declare acl text;
begin
  select coalesce(relacl::text, '') into acl from pg_class where relname = 'vw_aluno_comunidade_wa_v1';
  if acl like '%anon=%' then
    raise exception 'vw_aluno_comunidade_wa_v1 ficou legivel por anon: %', acl;
  end if;
  if acl not like '%authenticated=r/%' then
    raise exception 'vw_aluno_comunidade_wa_v1 sem SELECT para authenticated: %', acl;
  end if;
end $$;
