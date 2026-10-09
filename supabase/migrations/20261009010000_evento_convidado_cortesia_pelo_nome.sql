-- Recital: cadastrar o convidado de CORTESIA pelo nome (item 7 da reunião de 08/10/2026)
--
-- A estrutura já existia desde a M3 (`evento_convidado` + ponte `evento_convidado_participacao`
-- + cota por aluno em gatilho deferido), mas nenhuma tela criava cortesia: o convidado só
-- ganhava nome numa venda da Bilheteria. Estas duas funções são o caminho da aba Alunos.
--
-- Por que RPC e não dois INSERTs do front: o convidado e a ponte nascem juntos. Em duas
-- chamadas do PostgREST, falha na segunda deixaria um convidado sem aluno (que aparece na
-- porta e não conta na cota de ninguém).
--
-- SECURITY INVOKER: quem chama precisa da RLS de sempre (unidade do evento). Nada de
-- privilégio novo.
--
-- Bloco: o front manda o bloco escolhido; sem ele, vai o PRIMEIRO bloco da pessoa
-- (menor `evento_bloco.ordem`). ⚠️ O gatilho antigo `fn_evento_convidado_herda_bloco`
-- ordena só por `evento_apresentacao.ordem`, que é a posição DENTRO do bloco — para quem
-- se apresenta em dois blocos ele escolheria um qualquer. Ele só preenche quando
-- `bloco_id` está nulo, então mandar o bloco aqui o neutraliza sem alterá-lo.
--
-- Contagem: `evento_participacao.convidados` (o número "leva N") sobe para o total de
-- nomes quando ficar abaixo dele — senão a aba diria "leva 1" com 3 nomes na lista.
-- Nunca desce sozinho: o número pode incluir gente ainda sem nome.
--
-- Custo: chamada manual da equipe (dezenas por recital). Desprezível.

create or replace function public.evento_convidado_cortesia_adicionar_v1(
  p_evento_id bigint,
  p_aluno_id integer,
  p_nome text,
  p_bloco_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_part_id bigint;
  v_pessoa text;
  v_bloco bigint := p_bloco_id;
  v_conv_id bigint;
  v_nomeados integer;
begin
  if v_nome = '' then
    raise exception 'Escreva o nome do convidado.' using errcode = 'P0001';
  end if;

  -- mesma linha de participação que o seletor e o campo "leva N" usam (por pessoa)
  insert into public.evento_participacao (evento_id, aluno_id)
  values (p_evento_id, p_aluno_id)
  on conflict (evento_id, pessoa_chave) do nothing;

  select p.id, p.pessoa_chave into v_part_id, v_pessoa
    from public.evento_participacao p
   where p.evento_id = p_evento_id
     and p.pessoa_chave = public.fn_evento_pessoa_chave(p_aluno_id, p_evento_id);
  if v_part_id is null then
    raise exception 'evento %: não achei a participação do aluno % (sem permissão nesta unidade?)',
      p_evento_id, p_aluno_id using errcode = 'P0001';
  end if;

  if v_bloco is null then
    select ap.bloco_id into v_bloco
      from public.evento_apresentacao ap
      join public.evento_bloco b on b.id = ap.bloco_id
     where ap.evento_id = p_evento_id and ap.pessoa_chave = v_pessoa
     order by b.ordem, ap.ordem
     limit 1;
  end if;

  insert into public.evento_convidado (evento_id, nome, tipo_entrada, bloco_id)
  values (p_evento_id, v_nome, 'cortesia', v_bloco)
  returning id into v_conv_id;

  -- a cota (trg_evento_convidado_cortesia) confere no COMMIT e desfaz os dois inserts juntos
  insert into public.evento_convidado_participacao (convidado_id, participacao_id)
  values (v_conv_id, v_part_id);

  select count(*) into v_nomeados
    from public.evento_convidado_participacao cp
   where cp.participacao_id = v_part_id;
  update public.evento_participacao
     set convidados = v_nomeados, updated_at = now()
   where id = v_part_id and coalesce(convidados, 0) < v_nomeados;

  return jsonb_build_object('convidado_id', v_conv_id, 'bloco_id', v_bloco, 'nomeados', v_nomeados);
end
$function$;

comment on function public.evento_convidado_cortesia_adicionar_v1(bigint, integer, text, bigint) is
  'Aba Alunos do recital: cria a cortesia nominal + a ponte com a participação, num passo. '
  'Bloco nulo = primeiro bloco da pessoa. Cota conferida pelo gatilho deferido.';

create or replace function public.evento_convidado_cortesia_remover_v1(
  p_convidado_id bigint,
  p_evento_id bigint,
  p_aluno_id integer
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
  v_part_id bigint;
  v_restam integer;
begin
  select c.tipo_entrada into v_tipo
    from public.evento_convidado c
   where c.id = p_convidado_id and c.evento_id = p_evento_id;
  if v_tipo is null then
    raise exception 'convidado % não é do evento % (ou está fora da sua unidade)',
      p_convidado_id, p_evento_id using errcode = 'P0001';
  end if;
  if v_tipo <> 'cortesia' then
    raise exception 'O convidado % veio de uma venda — cancele pela Bilheteria.', p_convidado_id
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.evento_convidado_checkin k where k.convidado_id = p_convidado_id) then
    raise exception 'O convidado % já entrou no recital — desfaça o check-in antes de remover.', p_convidado_id
      using errcode = 'P0001';
  end if;

  select p.id into v_part_id
    from public.evento_participacao p
   where p.evento_id = p_evento_id
     and p.pessoa_chave = public.fn_evento_pessoa_chave(p_aluno_id, p_evento_id);

  delete from public.evento_convidado_participacao
   where convidado_id = p_convidado_id and participacao_id = v_part_id;

  -- irmãos dividem o convidado: só some de vez quando ninguém mais o convidou
  select count(*) into v_restam
    from public.evento_convidado_participacao where convidado_id = p_convidado_id;
  if v_restam = 0 then
    delete from public.evento_convidado where id = p_convidado_id;
  end if;

  return jsonb_build_object('convidado_id', p_convidado_id, 'apagado', v_restam = 0);
end
$function$;

comment on function public.evento_convidado_cortesia_remover_v1(bigint, bigint, integer) is
  'Aba Alunos do recital: tira a cortesia do aluno; apaga o convidado só se nenhum outro '
  'aluno (irmão) o convidou. Recusa vendido e quem já fez check-in.';

revoke all on function public.evento_convidado_cortesia_adicionar_v1(bigint, integer, text, bigint) from public, anon;
revoke all on function public.evento_convidado_cortesia_remover_v1(bigint, bigint, integer) from public, anon;
grant execute on function public.evento_convidado_cortesia_adicionar_v1(bigint, integer, text, bigint) to authenticated, service_role;
grant execute on function public.evento_convidado_cortesia_remover_v1(bigint, bigint, integer) to authenticated, service_role;
