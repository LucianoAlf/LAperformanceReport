-- supabase/migrations/20261002150000_barra_set26_arquiva_leads_duplicados_sync_aluno.sql
--
-- Arquiva 3 leads da Barra que o gatilho sync_aluno_to_leads criou na matricula de setembro
-- por nao achar o lead real (telefone/nome diferentes, ou lead real ja ligado a outro aluno).
-- Apontados pela Kailane na fila "Origem pendente" em 02/10/2026 e conferidos na API do
-- Emusys (/leads/por_id): cada pessoa tem UM lead no Emusys, que ja existe aqui.
--
--   14234 Lara Boldrine   -> real 13319 (Emusys 7269, 19/08, Instagram)
--   14522 Pedro Morais    -> real 13413 (Emusys 7281, 24/08, Indicacao) - 2o curso
--   14335 Lucas Amaral    -> real 14153 (Emusys 7416, lead da familia, 15/09, Google)
--
-- Nenhum dos 3 tem experimental nem aluno com lead_origem_id apontando para ele. Arquivar e
-- reversivel; trg_audit registra antes/depois. Efeito: saem da fila de origem pendente e da
-- contagem de leads de setembro (Barra 152 -> 149). Nao corrige meses anteriores.

do $$
declare v_n int;
begin
  select count(*) into v_n
  from public.leads l
  join (values (14234, 13319), (14522, 13413), (14335, 14153)) p(sintetico, real) on p.sintetico = l.id
  join public.leads r on r.id = p.real
  join public.alunos a on a.id = l.aluno_id
  where l.unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
    and l.origem_registro = 'sync_aluno'
    and not coalesce(l.arquivado, false)
    and r.unidade_id = l.unidade_id
    and not coalesce(r.arquivado, false)
    and a.emusys_lead_id = coalesce(r.emusys_lead_id, -1)::text
    and not exists (select 1 from public.lead_experimentais le where le.lead_id = l.id)
    and not exists (select 1 from public.alunos a2 where a2.lead_origem_id = l.id);
  if v_n <> 3 then raise exception 'esperava 3 leads duplicados aptos, achou %', v_n; end if;

  update public.leads
  set arquivado = true,
      data_arquivamento = (now() at time zone 'America/Sao_Paulo')::date,
      motivo_arquivamento = 'Duplicado: criado pelo sistema na matricula; o lead real do Emusys ja existe (migration 20261002150000)'
  where id in (14234, 14522, 14335) and origem_registro = 'sync_aluno' and not coalesce(arquivado, false);
  get diagnostics v_n = row_count;
  if v_n <> 3 then raise exception 'arquivou % leads, esperava 3', v_n; end if;
end $$;
