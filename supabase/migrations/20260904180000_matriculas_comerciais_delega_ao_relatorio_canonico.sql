-- CORRECAO: matriculas_comerciais_v1 estava inventando regra propria.
--
-- O relatorio comercial que a equipe recebe todo dia ja tem o predicado
-- canonico, dentro de montar_relatorio_comercial_mensal_payload_sem_pagantes_v1.
-- Medido em ago/2026 contra o relatorio real: CG batia (24), mas Recreio dava
-- 21 contra 23 e Barra 17 contra 19 — a minha versao excluia 4 pessoas por
-- "sem passaporte pago", e duas delas sao Alice Cagnin e Felipe Portella, casos
-- JA REGISTRADOS no CLAUDE.md de fatura que nao casa por matricula. Ou seja: o
-- filtro de passaporte pago tem falso negativo conhecido e e redundante — quem
-- nao e bolsista/banda/transferencia e tem parcela > 0 ja e matricula do
-- comercial.
--
-- Agora esta funcao REPLICA o predicado do relatorio, para a Mila e o relatorio
-- nunca discordarem:
--   · fora banda/coral (is_projeto_banda ou nome do curso)
--   · fora BOLSISTA_INT, BOLSISTA_PARC, BANDA, TRANSFERENCIA
--   · exige conta_como_pagante OU entra_ticket_medio
--   · exige valor_parcela > 0
--   · fora arquivado e status excluido/cancelado
--   · agrupa por PESSOA+data (2 cursos no mesmo dia = 1 matricula) e exige que a
--     pessoa tenha ao menos uma linha principal (nao 2o curso)
--
-- Depois desta migration: CG 24 · Recreio 23 · Barra 19 — identico ao relatorio.
--
-- `passaporte_pago` continua sendo devolvido — como INFORMACAO, nunca filtro.
drop function if exists public.matriculas_comerciais_v1(uuid, date, date);
create or replace function public.matriculas_comerciais_v1(
  p_unidade_id uuid, p_de date, p_ate date
) returns table(
  aluno_id integer, nome text, curso text, tipo_matricula text,
  valor_parcela numeric, valor_passaporte numeric, data_matricula date,
  conta boolean, motivo_fora text, passaporte_pago boolean
)
language sql stable security definer set search_path = public as $function$
  with fat as (
    select distinct f.emusys_matricula_id
    from emusys_faturas f
    where f.unidade_id = p_unidade_id
      and (f.descricao ~* 'taxa de matr' or f.descricao ~* 'passaporte')
      and f.data_pagamento is not null
  ),
  base as (
    select a.id, a.nome::text nm, c.nome::text cur, tm.nome::text tmn,
           a.valor_parcela, a.valor_passaporte, a.data_matricula,
           coalesce(a.is_segundo_curso, false) seg,
           upper(coalesce(tm.codigo, '')) cod,
           (a.emusys_matricula_id is not null
            and exists (select 1 from fat f where f.emusys_matricula_id::text = a.emusys_matricula_id::text)) pass,
           lower(regexp_replace(trim(coalesce(a.nome, '')), '\s+', ' ', 'g')) || '|tel:' ||
             regexp_replace(coalesce(nullif(a.telefone, ''), a.responsavel_telefone, ''), '\D', '', 'g') pessoa_key,
           (a.arquivado_em is null
            and lower(coalesce(a.status, '')) not in ('excluido','excluida','cancelado','cancelada')) viva,
           (coalesce(c.is_projeto_banda, false) = false
            and lower(coalesce(c.nome, '')) not like '%banda%'
            and lower(coalesce(c.nome, '')) not like '%canto coral%') curso_regular,
           (upper(coalesce(tm.codigo, '')) not in ('BOLSISTA_INT','BOLSISTA_PARC','BANDA','TRANSFERENCIA')
            and (coalesce(tm.conta_como_pagante, false) or coalesce(tm.entra_ticket_medio, false))) tipo_ok,
           (coalesce(a.valor_parcela, 0) > 0) tem_parcela
    from alunos a
    left join cursos c on c.id = a.curso_id
    left join tipos_matricula tm on tm.id = a.tipo_matricula_id
    where a.unidade_id = p_unidade_id
      and a.data_matricula >= p_de and a.data_matricula < p_ate
  ),
  -- uma linha por PESSOA+data: a principal representa; 2o curso do mesmo dia soma junto
  eleita as (
    select distinct on (pessoa_key, data_matricula) *
    from base
    where viva and curso_regular and tipo_ok and tem_parcela and not seg and cod <> 'SEGUNDO_CURSO'
    order by pessoa_key, data_matricula, id
  )
  select b.id, b.nm, b.cur, b.tmn, b.valor_parcela, b.valor_passaporte, b.data_matricula,
         (b.id in (select id from eleita)),
         case
           when b.id in (select id from eleita) then null
           when b.seg or b.cod = 'SEGUNDO_CURSO' then 'segundo_curso'
           when not b.viva then 'arquivada_ou_cancelada'
           when not b.curso_regular then 'banda_ou_coral'
           when not b.tipo_ok then 'bolsista_banda_ou_transferencia'
           when not b.tem_parcela then 'sem_valor_de_parcela'
           else 'mesma_pessoa_ja_contada_no_dia'
         end,
         b.pass
  from base b
  order by b.data_matricula, b.nm
$function$;

comment on function public.matriculas_comerciais_v1(uuid, date, date) is
'Matriculas que contam para o COMERCIAL num periodo. REPLICA o predicado canonico do relatorio comercial (montar_relatorio_comercial_mensal_payload_sem_pagantes_v1): fora 2o curso, bolsista, banda/coral, transferencia, sem parcela, arquivada; agrupa por pessoa+data. Devolve todas as linhas com o motivo de exclusao. `passaporte_pago` e informativo, NAO filtra (tem falso negativo conhecido: fatura que nao casa por matricula, casos Alice Cagnin e Felipe Portella).';

revoke all on function public.matriculas_comerciais_v1(uuid, date, date) from public, anon, authenticated;
grant execute on function public.matriculas_comerciais_v1(uuid, date, date) to service_role, mila_acesso_restrito;
