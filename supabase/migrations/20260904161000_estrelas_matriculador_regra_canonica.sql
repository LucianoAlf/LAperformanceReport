-- Estrelas do MATRICULADOR + LA sobre a regra canonica de matricula comercial.
--
-- Corrige o que a Mila disse a Vitoria em 04/09 ("30 matriculas" contra 24 reais)
-- e o show-up, que so contava experimental e ignorava VISITA — o programa soma as
-- duas (PDF oficial). CG/ago: 42 experimentais + 28 visitas = 70 contra meta 55;
-- a Mila anunciava "42 de 55, faltam 13", ou seja, dizia que faltava uma estrela
-- que ja estava ganha. Efeito medido nas 3 unidades (ago/2026):
--   CG      30 -> 24 matriculas · show-up 42 -> 70 · 2 -> 3 estrelas
--   Recreio 26 -> 21 · Barra 22 -> 17
--
-- ⚠️ VISITA NAO TEM CONFIRMACAO DE COMPARECIMENTO: as linhas de `visitas` estao
-- TODAS em 'agendada' (criadas pela Mila; ninguem marca quem veio). O numero vai
-- com a ressalva `visitas_confirmadas: false`, para a Mila dizer isso em vez de
-- afirmar comparecimento que nao medimos. Hoje so CG tem visitas registradas.
--
-- ⚠️ No mes corrente o show-up para em HOJE (v_ate_ef): contar experimental e
-- visita ja agendadas para o resto do mes daria estrela por agenda, nao por
-- comparecimento.
--
-- Depende de matriculas_comerciais_v1 (migration 20260904160000).
create or replace function public.get_estrelas_matriculador_v1(
  p_solicitante_telefone text,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo'::text)))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo'::text)))::integer
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare
  v_quem record; v_de date; v_ate date; v_ate_ef date; v_out jsonb := '[]'::jsonb; r record;
begin
  select * into v_quem from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_de := make_date(p_ano, p_mes, 1);
  v_ate := (v_de + interval '1 month')::date;
  -- no mês corrente não conta agenda futura como show-up
  v_ate_ef := least(v_ate, ((now() at time zone 'America/Sao_Paulo')::date + 1));

  for r in
    with cfg as (
      select c.*, u.nome unidade from public.programa_matriculador_estrelas_config c
        join public.unidades u on u.id = c.unidade_id
       where c.ano = p_ano and (v_quem.unidade_id is null or c.unidade_id = v_quem.unidade_id)
    ),
    mat as (  -- FONTE ÚNICA da matrícula comercial
      select c.unidade_id, m.*
      from cfg c, lateral public.matriculas_comerciais_v1(c.unidade_id, v_de, v_ate) m
    ),
    ok as (
      select mc.unidade_id, mc.aluno_id, mc.valor_parcela,
             coalesce(a.anamnese_preenchida, false) anam,
             public.fn_normalizar_telefone_br_key(coalesce(nullif(a.responsavel_telefone,''), a.telefone)) tk
      from mat mc join public.alunos a on a.id = mc.aluno_id
      where mc.conta
    ),
    agg as (
      select c.unidade_id, c.unidade, c.meta_matriculas, c.meta_showup, c.ticket_referencia, c.ticket_bonus, c.meta_indicacao,
        (select count(*) from ok o where o.unidade_id = c.unidade_id) matriculas,
        (select round(avg(nullif(o.valor_parcela,0)),2) from ok o where o.unidade_id = c.unidade_id) ticket,
        (select jsonb_object_agg(f.motivo_fora, f.n) from (
            select mc.motivo_fora, count(*) n from mat mc
             where mc.unidade_id = c.unidade_id and mc.motivo_fora is not null group by 1) f) fora,
        (select count(*) from public.lead_experimentais le
          where le.unidade_id = c.unidade_id and le.status in ('experimental_realizada','convertido')
            and le.data_experimental >= v_de and le.data_experimental < v_ate_ef) exp_realizadas,
        (select count(*) from public.visitas v
          where v.unidade_id = c.unidade_id and v.data >= v_de and v.data < v_ate_ef) visitas,
        (select count(*) from ok o
            where o.unidade_id = c.unidade_id
              and exists (select 1 from public.leads l join public.canais_origem co on co.id = l.canal_origem_id
                           where l.aluno_id = o.aluno_id and co.nome in ('Indicação','Family'))) mat_indicacao,
        (select count(*) from ok o where o.unidade_id = c.unidade_id
              and exists (select 1 from public.leads l where l.aluno_id = o.aluno_id)) mat_com_lead,
        (select count(*) from ok o where o.unidade_id = c.unidade_id and o.anam) mat_anamnese,
        (select count(*) from ok o where o.unidade_id = c.unidade_id
              and exists (select 1 from public.comunidade_wa_participantes p where p.telefone_key = o.tk)) mat_comunidade
      from cfg c
    )
    select a.*,
      (a.matriculas >= a.meta_matriculas) e1,
      (a.exp_realizadas + a.visitas >= a.meta_showup) e2,
      (coalesce(a.ticket,0) >= a.ticket_referencia + a.ticket_bonus) e3,
      (a.mat_indicacao >= a.meta_indicacao) e4,
      (a.matriculas > 0 and a.mat_anamnese = a.matriculas and a.mat_comunidade = a.matriculas) e5,
      (select nome from public.unidade_contato_comercial ucc where ucc.unidade_id = a.unidade_id and ucc.ativo limit 1) hunter
    from agg a
  loop
    v_out := v_out || jsonb_build_object(
      'unidade', r.unidade, 'hunter', r.hunter, 'competencia', to_char(v_de, 'MM/YYYY'),
      'estrelas', (r.e1::int + r.e2::int + r.e3::int + r.e4::int + r.e5::int),
      'matricula_plus', jsonb_build_object('ganhou', r.e1, 'feito', r.matriculas, 'meta', r.meta_matriculas,
                                           'faltam', greatest(0, r.meta_matriculas - r.matriculas),
                                           'nao_contadas', coalesce(r.fora, '{}'::jsonb),
                                           'regra', 'nao entram: 2o curso, bolsista, banda/atividade extra, e quem nao pagou passaporte'),
      'show_up', jsonb_build_object('ganhou', r.e2, 'feito', r.exp_realizadas + r.visitas,
                                    'experimentais', r.exp_realizadas, 'visitas', r.visitas,
                                    'meta', r.meta_showup, 'faltam', greatest(0, r.meta_showup - r.exp_realizadas - r.visitas),
                                    'visitas_confirmadas', false,
                                    'ressalva', 'visita nao tem confirmacao de comparecimento no sistema: e o total agendado no mes'),
      'ticket_premiado', jsonb_build_object('ganhou', r.e3, 'ticket_medio', r.ticket, 'alvo', r.ticket_referencia + r.ticket_bonus),
      'max_indicacao', jsonb_build_object('ganhou', r.e4, 'feito', r.mat_indicacao, 'meta', r.meta_indicacao,
                                          'cobertura', jsonb_build_object('matriculas_com_lead_vinculado', r.mat_com_lead, 'de', r.matriculas,
                                                                          'nota', 'PISO: so conta indicacao quando a matricula tem lead vinculado')),
      'hunter_360', jsonb_build_object('ganhou', r.e5, 'com_anamnese', r.mat_anamnese, 'na_comunidade', r.mat_comunidade, 'de', r.matriculas,
                                       'faltam_anamnese', r.matriculas - r.mat_anamnese, 'faltam_comunidade', r.matriculas - r.mat_comunidade),
      'desempate', jsonb_build_object('acima_da_media', r.matriculas - r.meta_matriculas, 'indicacao_family', r.mat_indicacao)
    );
  end loop;

  return jsonb_build_object('ok', true, 'solicitante', v_quem.nome, 'escopo',
           case when v_quem.unidade_id is null then 'todas' else 'unidade' end,
           'programa', 'MATRICULADOR + LA (estrelas, ago-nov ' || p_ano || ')', 'unidades', v_out);
end;
$function$;

revoke all on function public.get_estrelas_matriculador_v1(text,int,int) from public, anon, authenticated;
grant execute on function public.get_estrelas_matriculador_v1(text,int,int) to service_role, mila_acesso_restrito;
