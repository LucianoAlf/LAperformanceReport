-- Fecha a lacuna do professor_experimental_id: a matricula pode chegar ANTES de a
-- experimental ser promovida a 'experimental_realizada' pelo sync de presenca. Nesse
-- caso a v33 grava null e hoje NINGUEM volta la depois (o sync-presenca-emusys so le
-- `alunos` -- dois .select('id'), linhas 710 e 813 -- nunca escreve).
--
-- Caso real: Amelie Fontoura #1925 (CG). Aula 08/08 11:00 -> matricula 12:24 ->
-- sync promoveu a linha as 14:45. Campo ficou vazio por 46h com a resposta parada
-- em lead_experimentais. Janela medida entre aula e promocao (01-09/08): 0,0h a 25,2h.
--
-- Com p_emusys_lead_id  -> propaga aquele lead (uso pretendido no sync, etapa 2).
-- Sem argumento         -> varre tudo (backfill).
--
-- Validacao em sombra antes de aplicar (10/08/2026):
--   * logica rodada SEM a trava IS NULL contra os 319 alunos que ja tinham valor:
--     125 concordam, 4 discordam -- e 3 das 4 sao o bug da v32 (gravado = titular),
--     ou seja, onde discorda ela esta certa. Nenhuma seria tocada.
--   * BEGIN; select propagar_professor_experimental(); ROLLBACK; -> devolveu 14,
--     identico a sombra. Pos-rollback: 15 ainda vazios, sem residuo.
--   * Execucao real: 14 preenchidas. Manuela #1759 bloqueada pela trava de edicao
--     humana (a Dai esvaziou o campo em 08/06). Segunda execucao: 0 (idempotente).

create or replace function public.propagar_professor_experimental(
  p_emusys_lead_id integer default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_afetados integer := 0;
begin
  with alvo as (
    select a.id, le.profs[1] as professor
      from alunos a
      cross join lateral (
        select array_agg(distinct l2.professor_experimental_id) as profs
          from lead_experimentais l2
         where l2.emusys_lead_id::text = a.emusys_lead_id
           and l2.professor_experimental_id is not null
           and l2.status in ('experimental_realizada', 'convertido')
           and l2.data_experimental <= a.data_matricula
      ) le
     where a.professor_experimental_id is null          -- (1) nunca sobrescreve
       and a.arquivado_em is null
       and a.data_matricula is not null
       and a.emusys_lead_id is not null
       and (p_emusys_lead_id is null
            or a.emusys_lead_id = p_emusys_lead_id::text)
       and array_length(le.profs, 1) = 1                -- (2) recusa ambiguo
       and not exists (                                 -- (3) respeita edicao humana
         select 1
           from audit_log al
          where al.tabela = 'alunos'
            and al.registro_id_text = a.id::text
            and al.origem = 'manual'
            and (al.dados_antigos->>'professor_experimental_id')
                is distinct from (al.dados_novos->>'professor_experimental_id')
       )
  )
  update alunos a
     set professor_experimental_id = alvo.professor
    from alvo
   where a.id = alvo.id
     and a.professor_experimental_id is null;           -- (4) guarda contra corrida

  get diagnostics v_afetados = row_count;
  return v_afetados;
end;
$$;

-- ALTER DEFAULT PRIVILEGES do schema public concede EXECUTE a `anon` em funcao nova;
-- `revoke from public` NAO basta, precisa ser nominal. ACL conferida pos-deploy:
--   {postgres=X/postgres, service_role=X/postgres}
revoke all on function public.propagar_professor_experimental(integer) from public, anon, authenticated;
grant execute on function public.propagar_professor_experimental(integer) to service_role;
