# Auditoria - jornada, catalogo formal e ativacao V3

**Data:** 2026-07-21, revisada em 2026-07-22
**Projeto:** LA Report / Supabase `ouqwbbermlzqqvtqwlul`
**Escopo:** curso atual da jornada, pendencias professor/curso e configuracao do Health Score Professor V3

## Veredito

A jornada operacional foi reconciliada com a grade recorrente atual do Emusys, sem substituir a autoridade do catalogo formal governado no LA Report. As tres pendencias apontadas em 21/07 eram cursos antigos gravados no payload de matricula, nao atribuicoes atuais dos professores.

Em 22/07, uma verificacao correta da fila encontrou uma quarta divergencia: Gabriel Barbosa aparecia em Musicalizacao Infantil porque aulas reagendadas estavam concorrendo com a grade recorrente para definir o curso atual. A regra foi corrigida para que reagendamento preserve sua disciplina historica, mas nunca redefina a disciplina corrente da matricula.

Depois do backfill:

- 36 correcoes possuem trilha em `jornada_curso_resolucao_log`;
- Gabriel Barbosa foi resolvido para `Bateria T`, curso e disciplina Emusys `27`;
- zero excecoes atuais permanecem em `get_professor_curso_modalidade_excecoes_v2(null, null, false)`;
- zero jornadas ativas divergem do resolvedor da grade atual;
- 35 metadados de curso de origem foram reparados pelo de-para oficial;
- o payload original continua preservado nas colunas `*_origem`;
- novos syncs nao conseguem restaurar silenciosamente um curso antigo sobre a grade atual.

## Regra canonica

1. `professor_unidade_curso_modalidade` e a fonte de verdade do catalogo formal professor/curso/unidade no LA Report.
2. `aluno_jornada_matricula_disciplina` representa a jornada operacional atual por matricula/disciplina.
3. A grade recorrente nao reagendada de `aulas_emusys`, resolvida pelo de-para oficial, confirma o curso atual quando o GET de matriculas ainda entrega uma disciplina antiga.
4. O Emusys entra como conferencia e evidencia operacional; ele nao recria automaticamente o catalogo formal governado.
5. Divergencia historica preservada nao deve aparecer como pendencia operacional atual.
6. Aula reagendada e evidencia historica da mesma aula movida; ela nao altera o curso atual da jornada.

## Casos confirmados

| Professor | Unidade | Curso antigo preservado | Curso atual resolvido | Evidencia |
|---|---|---|---|---|
| Lucas Amorim Souza | Barra | Musicalizacao Preparatoria | Bateria | 6 aulas, 4 futuras |
| Ana Beatriz Paz de Almeida | Campo Grande | Guitarra | Musicalizacao Infantil | 5 aulas, 3 futuras |
| Marcos (Marquinhos) da Silva Saturnino | Campo Grande | Bateria | Contrabaixo | 5 aulas, 3 futuras |
| Gabriel Barbosa Rufino Otavio | Campo Grande | Musicalizacao Infantil em aulas reagendadas | Bateria T | 5 aulas regulares nao reagendadas |

## Componentes aplicados

- `fn_resolver_jornada_curso_grade_atual_v1`: escolhe o curso atual por unidade e matricula-disciplina usando somente recorrencia nao reagendada.
- `backfill_jornada_curso_grade_atual_v1`: executa reconciliacao idempotente e paginavel.
- trigger em `aluno_jornada_matricula_disciplina`: protege escrita futura contra regressao do payload antigo e resolve o curso de origem pelo de-para escopado por unidade.
- `jornada_curso_resolucao_log`: registra antes, depois, fonte, confianca e evidencias.
- guard de oferta formal: impede marcar como `nao_ofertada` uma combinacao que possui oferta formal ativa.
- guard de ativacao: usa as excecoes atuais canonicas; diagnostico historico continua visivel, mas nao bloqueia sozinho a configuracao futura.
- simulacao V3: timeout administrativo isolado de 60 segundos, sem mudar formula ou fingerprint.
- leitura da configuracao V3: timeout explicito de 60 segundos nas duas camadas da RPC, evitando erro `57014` em cache frio sem alterar o resultado.

## Configuracao V3

A configuracao numero 3 foi ativada com:

- vigencia inicial em `2026-09-01`;
- 63 metas segmentadas configuradas;
- 7 combinacoes realmente nao ofertadas;
- pesos e metas globais versionados;
- simulacao registrada pelo usuario Luciano antes da ativacao.

A versao 2 continua vigente ate `2026-08-31`. Isso evita sobreposicao e preserva o periodo ja publicado.

Na interface, a versao sem rascunho aberto e apresentada como `Configuracao ativa`, com `Metas ativas` e `Validada na ativacao`. Esses rotulos nao mudam a governanca: novas alteracoes continuam exigindo criar, salvar, simular e ativar outro rascunho.

## O que a ativacao nao faz

Ativar uma configuracao e diferente de publicar um ciclo. A ativacao:

- nao reescreve snapshots de junho ou julho;
- nao transforma score parcial em oficial;
- nao libera ranking ou premiacao antes do fechamento homologado;
- nao troca automaticamente todos os consumidores antigos.

A virada completa para a luz exige snapshots fechados na vigencia V3 e migracao validada, consumidor por consumidor, de cards, Analytics, relatorios, Edge Functions, Fabio e LA Teacher.

## Consultas de verificacao

```sql
select count(*)
from public.get_professor_curso_modalidade_excecoes_v2(null, null, false);

select versao, status, vigencia_inicio, vigencia_fim, ativado_por, ativado_em
from public.health_score_professor_v3_config_versoes
where versao in (2, 3)
order by versao;

select estado, count(*)
from public.health_score_professor_v3_config_metas_curso_modalidade
where config_id = '0e6a01ab-073a-46f0-9148-5412e795d9da'
group by estado;
```
