-- Corrige a premissa da migration anterior: eu escrevi que `emusys_presenca_bruta` "e' o
-- que o Emusys diz e continua sendo fato". ERRADO — ela e' fato sobre o dia ANTIGO.
--
-- COMO APARECEU: no teste em transacao revertida o professor voltava a `presente` depois
-- da limpeza. Cadeia: (1) a protecao limpa professor_presenca no BEFORE; (2) o trigger de
-- reagendamento reseta as linhas de aluno no AFTER, preservando `emusys_presenca_bruta`;
-- (3) como a bruta dizia 'presente', o reset gravava `status_presenca='presente'`; (4) o
-- `trg_professor_presente_quando_aluno_presente` viu 'presente' e RE-MARCOU o professor.
-- Resultado: `presente/NULL` — sem origem humana, mas afirmando presenca numa aula que
-- ainda nao aconteceu. O mesmo sintoma que a Mayra reportou, por outro caminho.
--
-- A ocorrencia mudou de dia: NADA daquela chamada sobrevive, nem a foto do Emusys. O
-- proximo ciclo do sync repoe a bruta com o valor da ocorrencia nova, que e' o certo.
create or replace function public.fn_reagendamento_limpa_chamada_alunos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_qtd integer;
begin
  if new.data_hora_inicio is not distinct from old.data_hora_inicio then
    return new;
  end if;

  -- SEM exception handler de proposito: se isto falhar, tem de aparecer.
  -- ⚠️ `status_presenca` vai a NULL SEMPRE. Deixa-lo em 'presente' (por causa da bruta
  -- antiga) faz `trg_professor_presente_quando_aluno_presente` re-marcar o professor.
  update public.aluno_presenca ap
     set status = 'ausente',
         status_presenca = null,
         respondido_por = 'emusys',
         respondido_em = null,
         espelhado_de_presenca_id = null,
         emusys_presenca_bruta = null,
         emusys_presenca_bruta_anterior = ap.emusys_presenca_bruta,
         emusys_presenca_alterada_em = now(),
         data_aula = new.data_aula,
         horario_aula = (new.data_hora_inicio at time zone 'America/Sao_Paulo')::time
   where ap.aula_emusys_id = new.id
     and (public.fn_presenca_e_forte(ap.respondido_por)
          or ap.status_presenca is not null
          or ap.emusys_presenca_bruta is not null);
  get diagnostics v_qtd = row_count;

  if v_qtd > 0 then
    begin
      insert into public.automacao_log(aluno_nome, evento, acao, status, detalhes)
      values ('(aula ' || new.id || ')', 'presenca', 'presenca_limpa_por_reagendamento', 'warn',
        jsonb_build_object('aula_id', new.id, 'emusys_id', new.emusys_id,
          'de', old.data_hora_inicio, 'para', new.data_hora_inicio, 'linhas', v_qtd));
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$function$;

-- Backfill: a bruta antiga ainda esta pendurada nas aulas ja reagendadas.
do $bf$
declare v_n integer;
begin
  perform set_config('app.escrita_humana_aula', 'on', true);

  update public.aluno_presenca ap
     set status = 'ausente', status_presenca = null, respondido_por = 'emusys',
         respondido_em = null, espelhado_de_presenca_id = null,
         emusys_presenca_bruta_anterior = ap.emusys_presenca_bruta,
         emusys_presenca_bruta = null, emusys_presenca_alterada_em = now()
    from public.aulas_emusys ae
   where ae.id = ap.aula_emusys_id
     and ae.reagendada
     and ae.data_hora_inicio > now()
     and (ap.status_presenca is not null or ap.emusys_presenca_bruta is not null);
  get diagnostics v_n = row_count;

  update public.aulas_emusys ae
     set professor_presenca = 'ausente', professor_presenca_origem = null
   where ae.reagendada and ae.data_hora_inicio > now()
     and (ae.professor_presenca = 'presente' or ae.professor_presenca_origem is not null);

  raise notice 'backfill bruta: % linhas', v_n;
end $bf$;;
