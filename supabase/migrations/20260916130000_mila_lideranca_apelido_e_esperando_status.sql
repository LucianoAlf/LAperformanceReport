-- A Mila chamou o Alf de "LUCIANO" no relatório da liderança (16/09/2026)
--
-- Achado ao investigar por que o cabeçalho do briefing diário saiu
-- "BOM DIA, LUCIANO" — o Alf pediu para chamar de "Alf", como todo o resto do
-- sistema já faz (ver [[o-usuario-e-o-alf]]).
--
-- 🔴 RAIZ, com prova em código: `mila_lideranca_ativa_v1()` (migration
-- 20260907000000) calcula `apelido` com `split_part(u.nome, ' ', 1)` —
-- primeiro token do nome cru. Para "Luciano Alf" isso é literalmente
-- "Luciano". A função certa já existia desde 04/09 (`mila_apelido_v1`, usada
-- pelo briefing das CONSULTORAS) e tem um mecanismo pronto para apelido
-- diferente do primeiro nome: um parênteses no cadastro — `"Fulana (Fu)"` →
-- apelido "Fu". A migration de 07/09 simplesmente não reusou a fonte única
-- que já existia (mesma família do "DRY antes de criar" quebrado).
--
-- `mila_briefing_lideranca_v1` tinha o MESMO buraco: devolvia `quem.nome` cru
-- sem `apelido`, então qualquer lugar do prompt que lesse o JSON via `quem`
-- (não só o cabeçalho templated) via "Luciano Alf" por extenso.
--
-- FIX: as duas funções passam a chamar `mila_apelido_v1(nome)`, e o cadastro
-- do Alf ganha o parênteses que a função já sabe ler — `"Luciano Alf (Alf)"`.
-- Provado antes de aplicar (transação abortada): lideranca_apelido = "Alf",
-- briefing_quem.apelido = "Alf". Hugo (outro membro da liderança, recebe_briefing
-- = false) não entra na lista — comportamento inalterado, é opt-in por
-- cargo, não por regra nova.

create or replace function public.mila_lideranca_ativa_v1()
returns table(telefone text, nome text, apelido text, nivel text, departamento text)
language sql
stable security definer
set search_path to 'public', 'governanca'
as $$
  select u.telefone, u.nome, public.mila_apelido_v1(u.nome) as apelido, u.nivel, u.departamento
  from governanca.agente_usuarios u
  where u.ativo
    and u.recebe_briefing                       -- ⚠️ opt-in, nao cargo
    and (lower(u.nivel) = 'diretoria'
         or (lower(u.departamento) = 'comercial' and lower(u.nivel) = 'lider'))
  order by (lower(u.nivel) = 'diretoria'), u.nome;
$$;

do $mig$
declare
  v_src text; v_novo text;
  v_de text := $de$'quem', jsonb_build_object('nome', v_quem.nome, 'nivel', v_quem.nivel),$de$;
  v_para text := $para$'quem', jsonb_build_object('nome', v_quem.nome, 'apelido', mila_apelido_v1(v_quem.nome), 'nivel', v_quem.nivel),$para$;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
   where p.proname = 'mila_briefing_lideranca_v1';
  if v_src is null then raise exception 'MILA_BRIEFING_LIDERANCA_AUSENTE'; end if;
  if (length(v_src) - length(replace(v_src, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ANCORA_QUEM_LIDERANCA: esperava 1 ocorrencia';
  end if;
  v_novo := replace(v_src, v_de, v_para);
  execute v_novo;
end $mig$;

update governanca.agente_usuarios set nome = 'Luciano Alf (Alf)'
 where telefone = '5521981278047' and nome = 'Luciano Alf';

-- ---------------------------------------------------------------------------
-- "76 conversas esperando" — a guarda de status que faltava (16/09/2026)
--
-- Mesmo dia, mesmo relatório, um segundo achado ao auditar se o número era
-- real: `snapshot_atendimento_consultor_v1()` (migration 20260905130000)
-- calcula `abertas` filtrando `conversa_status = 'open'`, mas calcula
-- `esperando_cliente`/`esperando_4h`/`esperando_24h` só com
-- `ultimo_autor = 'contact'` — SEM olhar o status da conversa. Uma conversa
-- resolvida no Chatwoot (cliente mandou a última mensagem, a equipe resolveu
-- sem responder por texto — comum quando o fechamento já foi feito por áudio,
-- caso real: Bruno Bastos/CG, conv 20164, última mensagem é "👍" depois de a
-- Vitória já ter avisado que a partir dali quem fala é a secretaria) ficaria
-- contada como "esperando" para sempre.
--
-- Medido HOJE contra o Chatwoot ao vivo: para Vitória (78) e Kailane (39) o
-- conjunto inteiro já está com `conversa_status = 'open'` — a guarda não muda
-- o número agora, porque o dado está limpo desde o fechamento de 09/09
-- (COALESCE(vivo, congelado) em `atendimento_conversa_estado`, ver a entrada
-- "O PRIVADO DA CONSULTORA..." no CLAUDE.md). Mas sem a guarda explícita, o
-- dia em que esse dado voltar a atrasar (mesma classe do incidente de 09/09)
-- volta a inflar em silêncio — e ninguém saberia, porque `abertas` continuaria
-- parecendo coerente.
--
-- ⚠️ Isso NÃO resolve o outro falso positivo medido no mesmo caso (Bruno
-- Bastos): conversa "👍" ainda está `open` porque a Vitória não clicou
-- Resolver — isso é filtro de CORTESIA (mesma classe do fix de 09/09 em
-- radar_marcar_foto_conversas_v1), não de status, e fica de fora deste
-- commit — decisão do Alf pendente (ver PR).
do $mig$
declare
  v_src text; v_novo text;
  v_de1 text := $de1$count(*) filter (where e.ultimo_autor = 'contact'),$de1$;
  v_para1 text := $para1$count(*) filter (where e.ultimo_autor = 'contact' and e.conversa_status = 'open'),$para1$;
  v_de2 text := $de2$count(*) filter (where e.ultimo_autor = 'contact' and e.horas_desde_ultima >= 4),$de2$;
  v_para2 text := $para2$count(*) filter (where e.ultimo_autor = 'contact' and e.conversa_status = 'open' and e.horas_desde_ultima >= 4),$para2$;
  v_de3 text := $de3$count(*) filter (where e.ultimo_autor = 'contact' and e.horas_desde_ultima >= 24),$de3$;
  v_para3 text := $para3$count(*) filter (where e.ultimo_autor = 'contact' and e.conversa_status = 'open' and e.horas_desde_ultima >= 24),$para3$;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
   where p.proname = 'snapshot_atendimento_consultor_v1';
  if v_src is null then raise exception 'SNAPSHOT_ATENDIMENTO_AUSENTE'; end if;
  if (length(v_src) - length(replace(v_src, v_de1, ''))) / length(v_de1) <> 1 then raise exception 'ANCORA_1'; end if;
  if (length(v_src) - length(replace(v_src, v_de2, ''))) / length(v_de2) <> 1 then raise exception 'ANCORA_2'; end if;
  if (length(v_src) - length(replace(v_src, v_de3, ''))) / length(v_de3) <> 1 then raise exception 'ANCORA_3'; end if;
  v_novo := replace(replace(replace(v_src, v_de1, v_para1), v_de2, v_para2), v_de3, v_para3);
  execute v_novo;
end $mig$;

-- Regrava a foto de HOJE com a função corrigida. Datas passadas NÃO são
-- reconstruíveis: `atendimento_conversa_estado` é espelho do ESTADO ATUAL,
-- não um log histórico — rodar a função para um dia passado sobrescreveria
-- aquele dia com o número de HOJE, corrompendo a série. Por isso o backfill
-- para de propósito em "hoje".
select public.snapshot_atendimento_consultor_v1();
