-- MODULO EVENTOS — reordenar os BLOCOS entre si (LAPE-39, fase 3)
--
-- A fase 3 entregou o arrasto das APRESENTACOES e esqueceu o dos blocos: dava para mover
-- um aluno de bloco, mas nao para trocar "Bloco 2" de lugar com "Bloco 3". E a ordem dos
-- blocos e o que mais muda na montagem de um recital — decidir que os pequenos abrem.
--
-- Mesma forma de `evento_grade_reordenar_v1`, inclusive a guarda de quantidade: bloco que
-- a policy esconde nao pode produzir uma reordenacao pela metade com resposta de sucesso.
--
-- ⚠️ O horario NAO e reescrito aqui. Ele e derivado da ordem (`calcularHorariosDaGrade`),
-- entao mudar a ordem ja muda o horario de todo mundo. Persistir seria criar a segunda
-- verdade que a fase 3 evitou de proposito. O `horario_inicial` de um bloco com
-- `inicio_manual` continua valendo — e se, na posicao nova, ele cair antes do fim do
-- anterior, a tela acusa o conflito em vermelho, que e o comportamento desejado: quem
-- digitou a hora decide, o sistema avisa.

create or replace function public.evento_bloco_reordenar_v1(
  p_evento_id bigint,
  p_ids bigint[]   -- na ordem final desejada
)
returns integer
language plpgsql
as $function$
declare
  v_pedidos   integer := coalesce(array_length(p_ids, 1), 0);
  v_aplicados integer;
begin
  if v_pedidos = 0 then
    return 0;
  end if;

  -- Id repetido faria dois blocos disputarem a mesma posicao e o resultado dependeria da
  -- ordem interna do UPDATE — recusar e mais honesto que sortear.
  if v_pedidos <> (select count(distinct id) from unnest(p_ids) as id) then
    raise exception 'evento_bloco_reordenar_v1: a lista tem bloco repetido'
      using errcode = 'P0001';
  end if;

  update public.evento_bloco b
     set ordem      = i.pos,
         updated_at = now()
    from (select id, row_number() over () as pos from unnest(p_ids) as id) i
   where b.id = i.id
     and b.evento_id = p_evento_id;

  get diagnostics v_aplicados = row_count;

  if v_aplicados <> v_pedidos then
    raise exception 'evento_bloco_reordenar_v1: pedi % bloco(s) e alcancei % — nada foi aplicado',
      v_pedidos, v_aplicados using errcode = 'P0001';
  end if;

  return v_aplicados;
end;
$function$;

-- Recriar funcao reconcede EXECUTE a `anon` pelo ALTER DEFAULT PRIVILEGES do schema.
revoke execute on function public.evento_bloco_reordenar_v1(bigint, bigint[]) from public, anon;
grant execute on function public.evento_bloco_reordenar_v1(bigint, bigint[])
  to authenticated, service_role;

comment on function public.evento_bloco_reordenar_v1(bigint, bigint[]) is
  'Aplica a nova ordem dos blocos em UMA transacao, pela posicao no array. Aborta se nao '
  'alcancar todos. Nao toca em horario: ele e derivado da ordem.';
