-- Fonte única de "esta matrícula está na comunidade do WhatsApp?" (14/09/2026)
--
-- Pedido do Luciano no grupo, depois de a Krissya pedir o selo de comunidade no report:
-- "quem dos alunos que se matricularam esse mês está dentro da comunidade ou não? O aluno
-- OU O RESPONSÁVEL, né?" — e era justamente o "ou" que não existia.
--
-- 🔴 HAVIA TRÊS IMPLEMENTAÇÕES DA MESMA PERGUNTA, E AS DUAS DO COMERCIAL ESTAVAM ERRADAS:
--   1. get_situacao_alunos_sem_contrato_assinado_core_v1  ✅ correta (pessoa, 4 telefones,
--      grupo DA UNIDADE, e guarda de captura que devolve "não sei" em vez de "false").
--   2. get_estrelas_matriculador_v1 (a ESTRELA do HUNTER 360)  ❌
--   3. radar_pendencias_comerciais_v1 (o que a Mila cobra)     ❌ — copiei a 2 em 14/09.
--
-- As duas erradas usam `coalesce(nullif(responsavel_telefone,''), telefone)`: um telefone SÓ.
-- Com responsável preenchido, o telefone do próprio aluno NUNCA é consultado — e quem está na
-- comunidade pelo número dele é declarado fora. Não leem `whatsapp` nem `aluno_contatos`
-- (a aba "Contatos" da ficha), não escopam pelo grupo da unidade e não têm guarda de captura:
-- se o cron de sincronização falhar, a base inteira vira "fora da comunidade" e a Mila sai
-- acusando todo mundo.
--
-- MEDIDO na coorte real de jun–set/2026 (matriculas_comerciais_lista_v1), régua atual × canônica:
--   jun 48 matrículas: 35 acusados -> 34 reais  (1 acusado errado)
--   jul 49            : 40 -> 39               (1)
--   ago 66            : 28 -> 21               (7 — 25% da lista era falsa)
--   set 22            : 13 -> 12               (1)
-- **acusado_errado 10 · escapou_errado 0**: a correção é de mão única, só tira falso positivo.
-- Caso nomeado: Mariana de Oliveira Azevedo (Recreio) estava na comunidade e era cobrada.
--
-- ⚠️ EVIDÊNCIA POSITIVA VENCE FRESCOR, de propósito — e aqui ela DIVERGE da situação do aluno,
-- que anula tudo quando a captura está velha. Captura velha não inventa participante: quem
-- aparece lá esteve lá. Anular o positivo faria a estrela do HUNTER 360 APAGAR por falha de
-- cron, punindo a consultora por um job que não é dela. Já o negativo exige captura fresca,
-- senão a Mila cobraria a equipe inteira no dia em que o sync cair.
-- ⚠️ A situação do aluno (TOM/Sol/Lia/app) NÃO foi tocada: outro consumidor, outra política de
-- ausência, e mexer nela é risco desproporcional ao pedido. Convergir as duas fica declarado.
-- ⚠️ A pessoa é (unidade_id, pessoa_chave): quem faz 2 cursos tem 2 linhas em `alunos` e entra
-- na comunidade uma vez só — conferir só a matrícula da vez diria "fora" na outra.

create or replace function public.aluno_comunidade_estado_v1(p_aluno_id integer)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  with alvo as (
    select pc.aluno_id, pc.unidade_id, pc.pessoa_chave
      from public.vw_aluno_pessoa_chave pc
     where pc.aluno_id = p_aluno_id
  ),
  -- todas as matrículas da MESMA pessoa na mesma unidade (2 cursos = 2 linhas)
  irmas as (
    select pc.aluno_id
      from public.vw_aluno_pessoa_chave pc
      join alvo t on t.pessoa_chave = pc.pessoa_chave and t.unidade_id = pc.unidade_id
  ),
  -- os QUATRO campos onde um telefone da família pode estar
  fones as (
    select distinct public.fn_normalizar_telefone_br_key(f.fone) as tk
      from irmas i
      join public.alunos a on a.id = i.aluno_id
      cross join lateral (values (a.telefone), (a.whatsapp), (a.responsavel_telefone)) f(fone)
     where public.fn_normalizar_telefone_br_key(f.fone) is not null
    union
    select distinct public.fn_normalizar_telefone_br_key(ac.telefone)
      from irmas i
      join public.aluno_contatos ac on ac.aluno_id = i.aluno_id
     where public.fn_normalizar_telefone_br_key(ac.telefone) is not null
  ),
  grupos as (
    select g.id,
           (select max(p.capturado_em) from public.comunidade_wa_participantes p
             where p.grupo_id = g.id) as ultima
      from public.comunidade_wa_grupos g
      join alvo t on t.unidade_id = g.unidade_id
     where g.ativo
  )
  select case
    when exists (select 1
                   from public.comunidade_wa_participantes p
                   join grupos g on g.id = p.grupo_id
                   join fones f on f.tk = p.telefone_key)            then 'na_comunidade'
    when (select count(*) from grupos) = 0                            then 'sem_grupo_configurado'
    when (select max(ultima) from grupos) is null                     then 'sem_captura'
    when (select max(ultima) from grupos) < now() - interval '2 days' then 'captura_desatualizada'
    else 'fora_da_comunidade'
  end;
$fn$;

comment on function public.aluno_comunidade_estado_v1(integer) is
  'Fonte unica do comercial para "esta matricula esta na comunidade do WhatsApp?". Resolve por PESSOA '
  '(unidade_id + pessoa_chave), varre telefone/whatsapp/responsavel_telefone de todas as matriculas dela '
  'e os telefones de aluno_contatos, e casa contra o grupo ATIVO da unidade. Cinco estados: na_comunidade, '
  'fora_da_comunidade, sem_grupo_configurado, sem_captura, captura_desatualizada. Evidencia positiva vence '
  'frescor (captura velha nao inventa participante); o negativo exige captura de ate 2 dias, para falha de '
  'cron nunca virar acusacao. Consumidores: radar_pendencias_comerciais_v1 e get_estrelas_matriculador_v1.';

revoke all on function public.aluno_comunidade_estado_v1(integer) from public, anon;
grant execute on function public.aluno_comunidade_estado_v1(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Consumidor 1: o que a Mila COBRA
do $mig$
declare
  v_src text; v_novo text;
  v_de text := 'where not exists (
       select 1 from public.comunidade_wa_participantes p
        where p.telefone_key = public.fn_normalizar_telefone_br_key(
                coalesce(nullif(a.responsavel_telefone, ''''), a.telefone)))';
  v_para text := 'where public.aluno_comunidade_estado_v1(cm.aluno_id) = ''fora_da_comunidade''';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'radar_pendencias_comerciais_v1';
  if v_src is null then raise exception 'RADAR_PENDENCIAS_AUSENTE'; end if;
  if (length(v_src) - length(replace(v_src, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ANCORA_RADAR_COMUNIDADE: esperava 1 ocorrencia';
  end if;
  v_novo := replace(v_src, v_de, v_para);
  execute v_novo;
end $mig$;

-- ---------------------------------------------------------------------------
-- Consumidor 2: a ESTRELA do HUNTER 360 (o mesmo defeito apagava estrela de unidade)
do $mig$
declare
  v_src text; v_novo text;
  v_de1 text := 'public.fn_normalizar_telefone_br_key(coalesce(nullif(a.responsavel_telefone,''''), a.telefone)) tk';
  v_para1 text := '(public.aluno_comunidade_estado_v1(mc.aluno_id) = ''na_comunidade'') tk';
  v_de2 text := 'and exists (select 1 from public.comunidade_wa_participantes p where p.telefone_key = o.tk)) mat_comunidade';
  v_para2 text := 'and o.tk) mat_comunidade';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_estrelas_matriculador_v1';
  if v_src is null then raise exception 'ESTRELAS_AUSENTE'; end if;
  if (length(v_src) - length(replace(v_src, v_de1, ''))) / length(v_de1) <> 1 then
    raise exception 'ANCORA_ESTRELA_TK: esperava 1 ocorrencia';
  end if;
  if (length(v_src) - length(replace(v_src, v_de2, ''))) / length(v_de2) <> 1 then
    raise exception 'ANCORA_ESTRELA_MAT_COMUNIDADE: esperava 1 ocorrencia';
  end if;
  v_novo := replace(replace(v_src, v_de1, v_para1), v_de2, v_para2);
  execute v_novo;
end $mig$;
