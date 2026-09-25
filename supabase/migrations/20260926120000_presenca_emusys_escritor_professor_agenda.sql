-- Professor marcado pela Agenda (botoes Presente/Ausente do card e o ajuste
-- fino por aula) passa a alimentar o escritor Emusys.
--
-- Os eventos ja existiam em presenca_acao_eventos (professor_id set,
-- aluno_id null): dia-inteiro tem aula_id null e toca N aulas; por-aula tem
-- aula_id = id interno. Tres ajustes de banco:
--
-- 1) Livro: unique por (evento, modo, linha) — um evento de dia-inteiro
--    grava uma linha por aula alvo. Aluno continua 1:1.
-- 2) Livro: aula_emusys_id nullable — evento de professor sem aula alvo
--    (professor sem aula naquele dia) grava linha para sair da fila.
-- 3) Gatilho: professor_id sozinho tambem dispara (aula_id pode ser null).
--    fonte='emusys' segue fora (anti-laco).

drop index if exists presenca_emusys_escrita_evento_uk;
create unique index presenca_emusys_escrita_evento_uk
  on public.presenca_emusys_escrita (presenca_evento_id, modo, coalesce(linha_emusys_id, 0))
  where presenca_evento_id is not null;

alter table public.presenca_emusys_escrita
  alter column aula_emusys_id drop not null;

drop trigger if exists trg_presenca_emusys_escritor_evento on presenca_acao_eventos;
create trigger trg_presenca_emusys_escritor_evento
  after insert on presenca_acao_eventos
  for each row
  when (new.tipo = 'item_aplicado'
        and coalesce(new.fonte, '') <> 'emusys'
        and ((new.aluno_id is not null and new.aula_id is not null)
             or new.professor_id is not null))
  execute function fn_presenca_emusys_escritor_disparar();
