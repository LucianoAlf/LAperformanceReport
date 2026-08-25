-- Corrige a v1 de `fn_reagendamento_limpa_chamada_alunos` (aplicada minutos antes).
--
-- O QUE QUEBROU: o `exception when others then return new` envolvia o UPDATE **e** o log.
-- `automacao_log` tem `aluno_nome` e `evento` NOT NULL, que eu não preenchi — o INSERT
-- estourava e o handler engolia a limpeza junto. Provado em transação revertida: o
-- professor limpava (`presente/agenda_secretaria` -> `ausente/NULL`) e as decisões de
-- aluno ficavam intactas (1 -> 1).
--
-- ⚠️ É LITERALMENTE o caso que o CLAUDE.md já documenta sobre esta mesma tabela: "a 1ª
-- versão gravava 'aviso', violava o CHECK e caía no `exception when others`, deixando
-- justamente o alerta sem rastro". Errar duas vezes no mesmo lugar é sinal de que a
-- forma estava errada, não o valor: **o trabalho não pode dividir handler com o log**.
--
-- Agora o UPDATE roda fora de qualquer handler (se falhar, o sync falha e alguém vê) e o
-- log tem bloco próprio — o rastro é desejável, mas não é ele que segura a correção.
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

  -- Toda linha existente e' necessariamente anterior a este UPDATE, entao qualquer
  -- decisao forte aqui foi tomada sobre a ocorrencia antiga.
  -- SEM exception handler de proposito: se isto falhar, tem de aparecer.
  update public.aluno_presenca ap
     set status = case when ap.emusys_presenca_bruta = 'presente' then 'presente' else 'ausente' end,
         status_presenca = case when ap.emusys_presenca_bruta = 'presente' then 'presente' else null end,
         respondido_por = 'emusys',
         respondido_em = null,
         espelhado_de_presenca_id = null,
         data_aula = new.data_aula,
         horario_aula = (new.data_hora_inicio at time zone 'America/Sao_Paulo')::time
   where ap.aula_emusys_id = new.id
     and public.fn_presenca_e_forte(ap.respondido_por);
  get diagnostics v_qtd = row_count;

  if v_qtd > 0 then
    begin
      insert into public.automacao_log(aluno_nome, evento, acao, status, detalhes)
      values ('(aula ' || new.id || ')', 'presenca', 'presenca_limpa_por_reagendamento', 'warn',
        jsonb_build_object('aula_id', new.id, 'emusys_id', new.emusys_id,
          'de', old.data_hora_inicio, 'para', new.data_hora_inicio, 'linhas', v_qtd));
    exception when others then
      null;  -- log e' desejavel, nao e' pre-requisito da correcao
    end;
  end if;

  return new;
end;
$function$;;
