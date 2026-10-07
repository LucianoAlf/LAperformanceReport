-- LAPE-61 — id da aula vindo do webhook de experimental (Emusys v1.8.1, 04/10/2026).
--
-- O que mudou no Emusys: os 3 webhooks de experimental passaram a trazer `aula.aula_id` (o
-- mesmo id de GET /aulas, ESTAVEL no reagendamento) e `aula.data_hora_inicio_original`.
-- Pedido nosso de 29/09 (96 reagendamentos desde maio, mesma aula contada duas vezes e o
-- relatorio comercial de CG travado de 25 a 29/09).
--
-- Por que coluna NOVA e nao `emusys_aula_id`:
--   `trg_experimental_normaliza_referencia_aula` (BEFORE INSERT/UPDATE OF emusys_aula_id) zera
--   todo id que ainda nao esta em `aulas_emusys` como experimental e o estaciona em
--   `emusys_agendamento_id`. Ele existe por causa do `body.id` (id de EVENTO) gravado como id de
--   aula em ago/2026. Experimental recem-marcada quase nunca esta na grade ainda (sync de
--   15 min), entao o id oficial seria descartado justamente no caso que interessa — e
--   `emusys_agendamento_id` ja guarda o id do EVENTO, sobrescrito pelo observador a cada entrega.
--   `emusys_aula_id_webhook` guarda o id declarado pelo Emusys no webhook, sem esse filtro.
--
-- Efeito:
--   1. o observador localiza a linha pelo id e atualiza NO LUGAR no reagendamento/cancelamento;
--   2. quando a grade chega, `fn_experimental_recebe_id_da_aula` liga `emusys_aula_id` pela
--      coluna nova ANTES de tentar lead+data+hora/nome (que erram no reagendamento).
--
-- Custo: indice parcial pequeno (~50 linhas/semana); o trigger ganha 1 lookup indexado por
-- linha de `aula_alunos_emusys` que ja dispara hoje. Desprezivel.

alter table public.lead_experimentais
  add column if not exists emusys_aula_id_webhook integer;

comment on column public.lead_experimentais.emusys_aula_id_webhook is
  'Id da aula declarado pelo Emusys no webhook de experimental (aula.aula_id, v1.8.1 de 04/10/2026). '
  'Estavel no reagendamento. Nao passa pelo filtro de grade de emusys_aula_id: a aula pode ainda nao '
  'estar em aulas_emusys. Escrito so pelo observador (debug-webhook-emusys-observador).';

-- Uma linha VIVA por aula. Cancelada fica fora: o reagendamento reaproveita o id e a linha
-- velha cancelada nao pode segurar a trava (foi o defeito de 29/09 com emusys_aula_id).
create unique index if not exists uq_lead_exp_aula_webhook
  on public.lead_experimentais (unidade_id, emusys_aula_id_webhook)
  where emusys_aula_id_webhook is not null and status::text <> 'cancelada';

create or replace function public.fn_experimental_recebe_id_da_aula()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_aula record;
  v_alvo bigint;
  v_qtd int;
begin
  select
    a.emusys_id,
    a.unidade_id,
    a.data_aula,
    a.categoria,
    (a.data_hora_inicio at time zone 'America/Sao_Paulo')::time as horario_aula
  into v_aula
  from public.aulas_emusys a
  where a.id = new.aula_emusys_id;

  if v_aula.categoria is distinct from 'experimental' then
    return new;
  end if;

  if exists (
    select 1
    from public.lead_experimentais o
    where o.unidade_id = v_aula.unidade_id
      and o.emusys_aula_id = v_aula.emusys_id
  ) then
    return new;
  end if;

  -- 0. (LAPE-61) O Emusys ja disse qual linha e esta aula: casamento deterministico, sem
  --    depender de data/hora (que o reagendamento muda) nem de nome digitado.
  select count(*), min(le.id)
  into v_qtd, v_alvo
  from public.lead_experimentais le
  where le.unidade_id = v_aula.unidade_id
    and le.emusys_aula_id_webhook = v_aula.emusys_id
    and le.emusys_aula_id is null
    and le.status::text <> 'cancelada';

  if v_qtd = 1 then
    update public.lead_experimentais
    set emusys_aula_id = v_aula.emusys_id
    where id = v_alvo;
    return new;
  end if;

  if new.emusys_lead_id is not null then
    select count(*), min(le.id)
    into v_qtd, v_alvo
    from public.lead_experimentais le
    where le.unidade_id = v_aula.unidade_id
      and le.emusys_lead_id = new.emusys_lead_id
      and le.data_experimental = v_aula.data_aula
      and le.horario_experimental = v_aula.horario_aula
      and (
        le.emusys_aula_id is null
        or not exists (
          select 1
          from public.aulas_emusys x
          where x.unidade_id = le.unidade_id
            and x.emusys_id = le.emusys_aula_id
            and lower(btrim(coalesce(x.categoria, ''))) = 'experimental'
        )
      );

    if v_qtd = 1 then
      update public.lead_experimentais
      set emusys_aula_id = v_aula.emusys_id
      where id = v_alvo;
      return new;
    end if;
    if v_qtd > 1 then
      return new;
    end if;
  end if;

  select count(*), min(le.id)
  into v_qtd, v_alvo
  from public.lead_experimentais le
  where le.unidade_id = v_aula.unidade_id
    and le.data_experimental = v_aula.data_aula
    and le.horario_experimental = v_aula.horario_aula
    and lower(unaccent(btrim(le.nome_aluno))) = new.aluno_nome_normalizado
    and (
      le.emusys_aula_id is null
      or not exists (
        select 1
        from public.aulas_emusys x
        where x.unidade_id = le.unidade_id
          and x.emusys_id = le.emusys_aula_id
          and lower(btrim(coalesce(x.categoria, ''))) = 'experimental'
      )
    );

  if v_qtd = 1 then
    update public.lead_experimentais
    set emusys_aula_id = v_aula.emusys_id
    where id = v_alvo;
  end if;

  return new;
end
$function$;
