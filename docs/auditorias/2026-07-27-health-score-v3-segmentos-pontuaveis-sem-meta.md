# Health Score V3 - Inventario de Segmentos Pontuaveis sem Meta

**Data:** 2026-07-27
**Modo:** SELECT-only
**Projeto:** `ouqwbbermlzqqvtqwlul`
**Configuracao auditada:** V3, `0e6a01ab-073a-46f0-9148-5412e795d9da`

## Veredito

Depois de excluir `Aula Experimental` (`curso_id = 45`), nao existe nenhuma
atribuicao formal pontuavel sem meta segmentada nas tres unidades.

| Unidade | Segmentos pedagogicos formais | Com meta configurada | Sem meta |
|---|---:|---:|---:|
| Campo Grande | 22 | 22 | 0 |
| Recreio | 24 | 24 | 0 |
| Barra | 13 | 13 | 0 |

## Aula Experimental

A V3 possui a seguinte regra:

| Unidade | Curso | Modalidade | Capacidade | Meta media/turma | Meta carteira |
|---|---|---|---:|---:|---:|
| Barra | Aula Experimental | Turma | 1 | 1 | 1 |

O curso aparece como atribuicao formal ativa para os 19 professores da Barra.
Essa atribuicao nao deve participar da carteira pedagogica. A experimental e
evento comercial e ja possui indicador proprio em conversao.

## Recomendacao

Classificar o curso no catalogo canonico como `comercial` e fazer catalogo,
carteira, media por turma, simulacao e ativacao filtrarem apenas cursos de
natureza `pedagogica`.

Nao basta remover a linha durante a clonagem. Essa solucao esconderia o segmento
somente na revisao `Jun-Ago`, mas permitiria que ele reaparecesse em novas
configuracoes e diagnosticos.

A linha da V3 deve permanecer intacta como historico. A nova revisao nao deve
clona-la.

## Query principal

```sql
with cfg as (
  select id
  from public.health_score_professor_v3_config_versoes
  where versao = 3
), faltantes as (
  select
    u.nome as unidade,
    a.curso_id,
    c.nome as curso,
    a.modalidade,
    count(distinct a.professor_id)::integer as professores,
    string_agg(distinct p.nome, ' | ' order by p.nome) as professores_nomes
  from public.professor_unidade_curso_modalidade a
  join cfg on true
  join public.unidades u on u.id = a.unidade_id
  join public.cursos c on c.id = a.curso_id
  join public.professores p on p.id = a.professor_id
  left join public.health_score_professor_v3_config_metas_curso_modalidade m
    on m.config_id = cfg.id
   and m.unidade_id = a.unidade_id
   and m.curso_id = a.curso_id
   and m.modalidade = a.modalidade
   and m.estado = 'configurada'
  where a.status = 'ativo'
    and a.vigencia_fim is null
    and a.confianca in ('alta', 'revisada')
    and a.curso_id <> 45
    and m.id is null
  group by u.nome, a.curso_id, c.nome, a.modalidade
)
select *
from faltantes
order by unidade, curso, modalidade;
```

**Resultado em 2026-07-27:** lista vazia.

## Limite desta auditoria

Nenhum dado foi alterado. A classificacao canonica e os filtros entram somente
na futura migration prevista no plano tecnico.
