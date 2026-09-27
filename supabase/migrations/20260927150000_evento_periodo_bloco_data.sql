-- 27/09/2026 — Evento com período de dias e bloco com data própria.
--
-- Medido na resposta do Alf (27/09): Recreio = 13, 14 e 15/11; Campo Grande = 01 a
-- 12/12. O contrato com o LA Teacher pede UM evento por unidade (o relatorio_anual
-- aponta para `evento_id` — três eventos no Recreio deixariam o professor sem saber em
-- qual lançar a música). Então o dia extra NÃO pode ser um evento novo: é o BLOCO que
-- ganha `data` (NULL = o dia do evento), e o evento ganha `data_fim` para o intervalo
-- aparecer na listagem ("13–15/11").
--
-- Regra de horário (documentada em `montarHorarios`): blocos do MESMO dia continuam
-- encadeados; quando a data muda, o bloco novo parte do `horario_inicio` do evento (ou
-- do `horario_inicial` manual). Um dia novo não herda o relógio do dia anterior.

alter table public.evento
  add column if not exists data_fim date
    check (data_fim is null or data_fim >= data_evento);
comment on column public.evento.data_fim is
  'Último dia do recital quando ele ocupa mais de uma data (Recreio 13–15/11). NULL = um dia só.';

alter table public.evento_bloco
  add column if not exists data date;
comment on column public.evento_bloco.data is
  'Dia em que o bloco toca. NULL = data_evento. Recreio tem blocos em 13, 14 e 15/11.';

-- RBAC do módulo: `eventos.ver`/`eventos.editar` nasceram na migration base SEM nenhum
-- perfil marcado (o desenho era "virar pela tela de Permissões"). Liberadas aqui para os
-- perfis que operam o recital — Professor não entra: o lado dele é o LA Teacher.
insert into public.perfil_permissoes (perfil_id, permissao_id)
select pf.id, pm.id
  from public.perfis pf
  cross join public.permissoes pm
 where pf.nome in ('Gerente', 'Farmer', 'Sucesso do Aluno')
   and pm.codigo in ('eventos.ver', 'eventos.editar')
on conflict do nothing;

insert into public.perfil_permissoes (perfil_id, permissao_id)
select pf.id, pm.id
  from public.perfis pf
  join public.permissoes pm on pm.codigo = 'eventos.ver'
 where pf.nome = 'Visualizador'
on conflict do nothing;
