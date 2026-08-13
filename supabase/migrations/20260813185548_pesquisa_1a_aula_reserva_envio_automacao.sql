-- Trava de duplicata do AUTO-DISPARO da pesquisa de 1a aula.
--
-- Motivo: 39 das 42 duplicatas medidas (27 alunos, desde 03/07/2026) vieram do disparo das
-- 11h, em series paralelas defasadas 0,4-1,2s percorrendo a mesma lista. A edge de envio nao
-- consultava nada antes do POST, e a protecao que existia (RPC de candidatos excluir quem tem
-- enviado_ok) so alcanca quem le a lista DEPOIS de alguem marcar -- inutil contra corrida.
--
-- Ler-e-entao-enviar nao resolveria: as execucoes leem no mesmo segundo, antes de qualquer
-- marcacao. Por isso a reserva e feita numa unica instrucao, serializada pelo banco na chave
-- UNIQUE (aluno_id, tipo, data_matricula): uma execucao leva a linha, as outras recebem vazio.
--
-- Vale SO para a automacao (decisao do Hugo, 13/08/2026): o reenvio manual da Fabi pela aba
-- Pos-1a Aula continua livre, inclusive segundos depois -- os 3 casos manuais medidos foram
-- cliques propositais dela.

alter table public.pesquisas_whatsapp
  add column if not exists tentativa_envio_em timestamptz;

comment on column public.pesquisas_whatsapp.tentativa_envio_em is
  'Carimbo da RESERVA de envio (automacao). Marcado ANTES do POST e limpo se o envio falhar. '
  'Nao confundir com enviado_em, que significa envio bem-sucedido e e lido pela aba e pelas '
  'RPCs de status -- por isso a reserva nao pode reaproveita-lo.';

create or replace function public.reservar_envio_pesquisa_whatsapp(
  p_aluno_id integer,
  p_unidade_id uuid,
  p_tipo text,
  p_data_matricula date,
  p_janela_minutos integer default 10
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.pesquisas_whatsapp (
    aluno_id, unidade_id, tipo, data_matricula, enviado_ok, tentativa_envio_em
  )
  values (p_aluno_id, p_unidade_id, p_tipo, p_data_matricula, false, now())
  on conflict (aluno_id, tipo, data_matricula) do update
     set tentativa_envio_em = now(),
         erro_detalhes = null
   -- Envio recente por QUALQUER via bloqueia a automacao: se a Fabi acabou de mandar a mao,
   -- o cron nao repete em cima.
   where coalesce(pesquisas_whatsapp.tentativa_envio_em, pesquisas_whatsapp.enviado_em) is null
      or coalesce(pesquisas_whatsapp.tentativa_envio_em, pesquisas_whatsapp.enviado_em)
         < now() - make_interval(mins => p_janela_minutos)
  returning id into v_id;

  return v_id is not null;
end;
$$;

comment on function public.reservar_envio_pesquisa_whatsapp(integer, uuid, text, date, integer) is
  'Reserva atomica de envio da pesquisa. true = pode enviar; false = ja houve envio/tentativa '
  'dentro da janela, entao PULE. Chamada so pelo caminho automatico (origem=auto).';

revoke all on function public.reservar_envio_pesquisa_whatsapp(integer, uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.reservar_envio_pesquisa_whatsapp(integer, uuid, text, date, integer) to service_role;
