-- Mila PROATIVA — 2º ajuste do ensaio (Vitória, manhã 05/09): `quentes_agora`
-- levava `identificacao` (método + chave de telefone) e a Mila mandou
-- "2159059426 — entrar na conversa AGORA" para a consultora. O NOME estava em
-- `contexto` ("Hetiene escreveu e só a Mila respondeu — 12h sem humano") e o
-- lead em `entidade_id`. Agora `quem` = nome do lead (fallback: o contexto),
-- e vai junto `o_que_houve` (o contexto, legível) e `situacao` (tipo_sinal).
-- Patch por replace guardado sobre o corpo vigente (padrão do repo), para não
-- transcrever a função inteira de novo.

do $do$
declare
  v_def text;
  v_ant text := $a$  select jsonb_agg(jsonb_build_object(
           'sinal_id', s.id, 'quem', s.identificacao, 'leitura', s.interpretacao, 'orientacao', s.orientacao,
           'desde', to_char(s.detectado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
         order by s.detectado_em desc), count(*)
    into v_calor, v_n_calor
  from (select * from radar_sinais
        where unidade_id = v_un and status = 'aberto' and regra_codigo = 'R18'
          and detectado_em >= (p_data - 1)::timestamp
        order by detectado_em desc limit 5) s;$a$;
  v_novo text := $b$  select jsonb_agg(jsonb_build_object(
           'sinal_id', s.id, 'lead_id', l.id, 'quem', coalesce(l.nome, s.contexto), 'telefone', l.telefone,
           'situacao', s.tipo_sinal, 'o_que_houve', s.contexto, 'orientacao', s.orientacao,
           'desde', to_char(s.detectado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'))
         order by s.detectado_em desc), count(*)
    into v_calor, v_n_calor
  from (select * from radar_sinais
        where unidade_id = v_un and status = 'aberto' and regra_codigo = 'R18'
          and detectado_em >= (p_data - 1)::timestamp
        order by detectado_em desc limit 5) s
  left join leads l on s.entidade_tipo = 'lead' and l.id::text = s.entidade_id::text;$b$;
  n int;
begin
  select pg_get_functiondef('public.mila_briefing_manha_v1(text, date)'::regprocedure) into v_def;
  n := (length(v_def) - length(replace(v_def, v_ant, ''))) / length(v_ant);
  if n <> 1 then raise exception 'ancora do bloco quentes encontrada % vezes (esperado 1)', n; end if;
  execute replace(v_def, v_ant, v_novo);
end $do$;

-- estrela mais perto: dizer EM QUÊ faltam (R$ 3 ≠ 3 matrículas)
create or replace function public.mila_estrela_mais_perto_v1(u jsonb) returns jsonb
language sql immutable as $$
  with cand(estrela, faltam, meta, ganhou, unidade, detalhe) as (values
    ('Matrícula Plus', (u->'matricula_plus'->>'faltam')::numeric, (u->'matricula_plus'->>'meta')::numeric,
       (u->'matricula_plus'->>'ganhou')::boolean, 'matrículas', format('%s de %s matrículas', u->'matricula_plus'->>'feito', u->'matricula_plus'->>'meta')),
    ('Show-up', (u->'show_up'->>'faltam')::numeric, (u->'show_up'->>'meta')::numeric,
       (u->'show_up'->>'ganhou')::boolean, 'experimentais/visitas realizadas', format('%s de %s (experimentais + visitas)', u->'show_up'->>'feito', u->'show_up'->>'meta')),
    ('Max Indicação', (u->'max_indicacao'->>'meta')::numeric - (u->'max_indicacao'->>'feito')::numeric, (u->'max_indicacao'->>'meta')::numeric,
       (u->'max_indicacao'->>'ganhou')::boolean, 'matrículas por indicação/family', format('%s de %s por indicação/family', u->'max_indicacao'->>'feito', u->'max_indicacao'->>'meta')),
    ('Hunter 360', (u->'hunter_360'->>'faltam_anamnese')::numeric + (u->'hunter_360'->>'faltam_comunidade')::numeric, greatest((u->'hunter_360'->>'de')::numeric, 1),
       (u->'hunter_360'->>'ganhou')::boolean, 'anamneses/entradas na comunidade', format('%s anamnese(s) e %s na comunidade faltando, de %s matrículas', u->'hunter_360'->>'faltam_anamnese', u->'hunter_360'->>'faltam_comunidade', u->'hunter_360'->>'de')),
    ('Ticket Premiado', (u->'ticket_premiado'->>'alvo')::numeric - (u->'ticket_premiado'->>'ticket_medio')::numeric, (u->'ticket_premiado'->>'alvo')::numeric,
       (u->'ticket_premiado'->>'ganhou')::boolean, 'R$ no ticket médio', format('ticket médio R$ %s, alvo R$ %s', u->'ticket_premiado'->>'ticket_medio', u->'ticket_premiado'->>'alvo'))
  )
  select jsonb_build_object('estrela', estrela, 'faltam', faltam, 'faltam_em', unidade, 'detalhe', detalhe)
  from cand
  where faltam is not null and meta > 0 and faltam > 0 and not coalesce(ganhou, false)
  order by faltam / meta asc
  limit 1
$$;
revoke all on function public.mila_estrela_mais_perto_v1(jsonb) from public, anon, authenticated;
grant execute on function public.mila_estrela_mais_perto_v1(jsonb) to service_role, mila_acesso_restrito;
