-- Gatilho imediato do escritor de presenca no Emusys.
-- Ate aqui o escritor era so reconciliador (cron a cada 5min). Agora a marca
-- da secretaria/professor dispara a edge no ato; o cron segue como sweeper
-- (retry de 5xx, fichas e o que escapar). A edge e idempotente — chamadas
-- sobrepostas gravam uma linha so no livro (unique por gatilho).
-- Anti-laco na fonte: eventos com fonte='emusys' (o proprio sync relendo o
-- que escrevemos) NAO disparam — corta o laço antes de nascer.

create or replace function fn_presenca_emusys_escritor_disparar()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  perform net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/presenca-emusys-escritor',
    headers := jsonb_build_object(
      'x-sync-token', (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'sync_presenca_edge_token'
         limit 1
      ),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('lookback_dias', 7),
    timeout_milliseconds := 150000
  );
  return null;
end;
$$;

comment on function fn_presenca_emusys_escritor_disparar() is
  'Dispara a edge presenca-emusys-escritor via pg_net quando nasce gatilho de escrita (evento de aluno ou ficha confirmada). Idempotente: a edge dedup pelo livro.';

-- Aluno: cada item_aplicado e uma decisao aplicada (secretaria, professor,
-- fabio_audio). fonte='emusys' nao dispara: e o sync relendo nossa escrita.
drop trigger if exists trg_presenca_emusys_escritor_evento on presenca_acao_eventos;
create trigger trg_presenca_emusys_escritor_evento
  after insert on presenca_acao_eventos
  for each row
  when (new.tipo = 'item_aplicado'
        and new.aluno_id is not null
        and new.aula_id is not null
        and coalesce(new.fonte, '') <> 'emusys')
  execute function fn_presenca_emusys_escritor_disparar();

-- Professor: ficha confirmada/gravada com aula (o UPDATE que confirma e o
-- INSERT que ja nasce confirmado).
drop trigger if exists trg_presenca_emusys_escritor_ficha on fabio_registros_aula;
create trigger trg_presenca_emusys_escritor_ficha
  after insert or update of status, aula_id on fabio_registros_aula
  for each row
  when (new.status in ('confirmado', 'gravado_emusys')
        and new.aula_id is not null)
  execute function fn_presenca_emusys_escritor_disparar();
