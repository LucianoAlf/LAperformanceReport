# Auditoria SELECT-only - fonte canonica do pente-fino do Fabio

**Data:** 15/07/2026
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`
**RPC auditada:** `public.fabio_pente_fino_unidade(integer, text, integer)`
**Escopo:** professores, vinculos por unidade, login LA Teacher, carteira, presenca/faltas, cobertura de registro e recorte JSON.
**Metodo:** somente `SELECT`, `pg_get_functiondef`, `pg_get_viewdef`, `information_schema` e leitura do codigo local. Nenhum dado, schema, RPC, view ou Edge Function foi alterado.

## 1. Veredito geral

## NAO APROVADO para uso oficial pela coordenacao

A RPC acerta o isolamento por unidade e usa fontes adequadas para professor ativo, vinculo professor/unidade e cobertura de registro. Ela tambem evita atribuir `0%` a professores sem acesso ao LA Teacher.

Entretanto, dois problemas impedem que o resultado seja tratado como fonte oficial hoje:

1. **A carteira e contada por `aluno_id` local, nao por pessoa.** Um mesmo aluno pode ter duas linhas locais por possuir dois cursos. Foram encontrados **24 casos ativos, dentro da carteira do mesmo professor/unidade, em que uma pessoa possui mais de um `aluno_id`**. Isso pode inflar carteira e quantidade de alunos com faltas recorrentes.
2. **`status = 'ausente'` nao distingue falta real de chamada nao registrada.** O sync transforma todo valor diferente de `presente` em `ausente` depois de 24 horas. Em Campo Grande, a RPC marcou **41 dos 44 alunos do Caio** como tendo tres ou mais faltas em 60 dias. Em julho, os registros desse professor mostram **138 ausencias e apenas 4 presencas**, uma mudanca abrupta em relacao a junho que e compativel com falta de chamada/materializacao automatica, nao com uma conclusao pedagogica segura.

Ha ainda um defeito confirmado em `vw_jornada_aluno_com_presenca`: o join de disciplina nao elimina presencas que nao casaram. Isso nao altera diretamente o `count(distinct j.aluno_id)` atual da RPC, mas torna a view insegura como fonte de presenca por matricula/disciplina e cria risco de regressao.

## 2. Matriz de fontes

| Metrica | Fonte atual | E canonica? | Risco atual | Recomendacao |
|---|---|---:|---|---|
| Professor global ativo | `professores.ativo` | Sim | Baixo | Manter. Evitar `coalesce(..., true)` como permissao futura; o campo esta preenchido em todos os vinculos atuais. |
| Vinculo professor/unidade | `professores_unidades.emusys_ativo` | Sim, com ressalva de frescor | Medio | Manter o vinculo por ID Emusys e expor a data de `last_seen_em`. O sync automatico de professores e semanal. |
| Login LA Teacher | `professores.usuario_id is not null` | Parcial | Medio | Exigir tambem `usuarios.ativo = true`, `usuarios.auth_user_id is not null` e perfil de professor. Hoje o unico vinculo existente passa em todos esses testes. |
| Carteira atual | `vw_jornada_aluno_com_presenca`, filtrada por professor/unidade | Base canonica, view inadequada | Alto | Ler a jornada atual sem os agregados de presenca, preferencialmente `vw_fabio_carteira_professor` ou `vw_jornada_aluno_atual`, e contar pessoa por Emusys. |
| Pessoa unica na carteira | `count(distinct j.aluno_id)` | Nao | Alto | Usar chave de pessoa escopada por unidade: `emusys_aluno_id`; somente quando ausente, usar `aluno_id` como fallback. |
| Presenca/falta bruta | `aluno_presenca` | Canonica como registro ingerido, nao como verdade semantica completa | Alto | Separar `presente`, `falta confirmada`, `justificada` e `nao registrada`. Nao promover `ausente` bruto a fato pedagogico. |
| Falta recorrente | `status='ausente'` e `>= 3` em janela rolante | Nao, no estado atual | Critico | Usar apenas como sinal provisoriamente bloqueado. Liberar depois de resolver chamada nao registrada, justificadas, identidade e atualizacao de correcoes. |
| Cobertura de registro | `vw_aderencia_registro_professor` | Sim, para o recorte testado | Baixo/medio | Manter `anotacoes_fabio OR anotacoes`. Explicitar mes por professor e a regra de aulas elegiveis. |
| Cobertura para sem-login | Gate na RPC | Sim | Baixo | Manter `null` e `sem_acesso_ao_app_ainda`, nunca `0%`. Fortalecer a verificacao de login. |
| Mes de cobertura | Ultimo `mes` por professor/unidade | Sim, mas misturado no relatorio | Medio | Incluir `mes_referencia` de forma explicita no recorte geral ou declarar que cada linha pode ter mes diferente. |

## 3. RPC atual

### 3.1 Estrutura e permissoes

A funcao e `STABLE`, `SECURITY DEFINER`, usa `search_path = public` e, no momento da auditoria, possui `EXECUTE` apenas para:

- `postgres`
- `service_role`
- `fabio_agent`

Nao ha grant para `public`, `anon` ou `authenticated`.

O parametro `p_usuario_id` e validado contra um usuario ativo com `perfil = 'admin'`. Como a RPC e `SECURITY DEFINER`, esse ID nao e comparado ao `auth.uid()` do chamador. O risco esta contido pelos grants atuais, mas a validacao deixaria de ser uma fronteira de seguranca se a RPC fosse aberta a outros papeis.

### 3.2 Filtros por unidade

Todos os blocos principais filtram a unidade corretamente:

- professor: `professores_unidades.unidade_id = v_unidade_id`;
- carteira: `j.unidade_id = v_unidade_id`;
- faltas: `ap.unidade_id = v_unidade_id`;
- cobertura: `ar.unidade_id = v_unidade_id`.

O teste multiunidade confirmou isolamento:

| Professor | Unidade | Carteira RPC | 3+ faltas | Cobertura |
|---|---:|---:|---:|---:|
| Caio Tenorio | Campo Grande | 44 | 41 | `null`, sem login |
| Caio Tenorio | Recreio | 5 | 1 | `null`, sem login |
| Matheus Felipe | Campo Grande | 14 | 5 | 4% (1/28), jul/2026 |
| Matheus Felipe | Recreio | 5 | 1 | 55% (6/11), jul/2026 |
| Pedro Sergio | Campo Grande | 24 | 13 | `null`, sem login |

Nao foi encontrado vazamento entre unidades nesses testes.

### 3.3 Recorte JSON

O objeto `recorte` contem:

- `unidade`;
- `janela_dias`;
- `fonte_carteira`;
- `regra_faltas_recorrentes`;
- texto explicando a cobertura;
- `gerado_em`.

Ressalvas:

- nao existe `mes_referencia` explicito dentro de `recorte`;
- o mes aparece somente em `cobertura_registro_unidade.mes_referencia`, por professor;
- carteira e atual, faltas sao uma janela rolante, e cobertura usa o ultimo mes encontrado. Sao tres recortes temporais diferentes no mesmo retorno;
- `data_aula >= current_date - p_janela_dias` inclui o dia atual e o dia de corte. Com `60`, sao potencialmente 61 datas de calendario;
- nao ha limite minimo/maximo para `p_janela_dias`.

## 4. Professores, unidades e login

### 4.1 Professor ativo e vinculo por unidade

A combinacao correta para o pente-fino e:

```text
professores.ativo = true
professores_unidades.unidade_id = unidade solicitada
professores_unidades.emusys_ativo = true
```

Estado atual auditado:

- 82 vinculos professor/unidade;
- 75 vinculos operacionais ativos;
- nenhum ativo com `last_seen_em` nulo;
- nenhum ativo sem ser visto nas ultimas 48 horas;
- nenhum vinculo inativo com jornada ativa;
- nenhum vinculo inativo com aula futura contendo aluno.

O caso Leonardo Castro esta correto:

- Barra: ativo, 20 jornadas e aulas futuras com alunos;
- Campo Grande: inativo/ignorado, identidade historica preservada, 3 slots futuros vazios e nenhuma jornada ativa.

### 4.2 Frescor do vinculo

O job `sync-professores-emusys-semanal` roda aos domingos. O ultimo job consultado terminou com sucesso. Mesmo assim, **`emusys_ativo` pode ficar ate aproximadamente sete dias sem refletir uma mudanca feita no Emusys**, salvo execucao manual.

Portanto, a fonte e adequada, mas o pente-fino deveria mostrar a data de frescor ou exigir um limite operacional de `last_seen_em`.

### 4.3 Login LA Teacher

Existe FK `professores.usuario_id -> usuarios.id`. A funcao canonica `fn_professor_do_usuario()` exige:

- correspondencia entre `usuarios.auth_user_id` e `auth.uid()`;
- usuario ativo;
- professor ativo.

A RPC do pente-fino usa somente `p.usuario_id is not null`.

Estado atual:

- apenas Matheus Felipe possui `usuario_id` entre professores ativos;
- o usuario existe, esta ativo, tem `auth_user_id` e `perfil = 'professor'`;
- nao ha anomalia atual de login.

Conclusao: o criterio simplificado produz o resultado certo hoje, mas nao e robusto como regra definitiva.

## 5. Carteira de alunos

### 5.1 Qual fonte representa melhor o presente

`vw_jornada_aluno_atual` parte de `aluno_jornada_matricula_disciplina` e considera `status_matricula = 'ativa'`. Essa e a melhor fonte atual para saber quais matriculas/disciplinas estao na carteira do professor.

`vw_professores_carteira_resumo` usa `alunos.professor_atual_id` e `alunos.status = 'ativo'`. Essa leitura plana esta atrasada em casos reais.

Exemplo Caio, Campo Grande:

| Fonte | Resultado |
|---|---:|
| RPC / jornada atual | 44 pessoas por `aluno_id` |
| `vw_professores_carteira_resumo` | 45 linhas |
| `alunos.professor_atual_id` | 45 linhas |
| snapshot auditado de jun/2026 | 51 alunos |

O snapshot de junho nao deve ser comparado diretamente com a carteira atual de julho.

A diferenca atual 44 x 45 foi explicada integralmente:

- duas linhas planas ainda atribuiam alunos ao Caio, mas o snapshot recente do Emusys mostra uma matricula com outro professor e outra finalizada;
- uma linha plana estava como `trancado`, mas o snapshot recente da jornada mostra matricula ativa, professor Caio e 19 aulas futuras.

Neste caso, a jornada atual e mais fiel que `alunos.professor_atual_id`.

### 5.2 Divergencias sistemicas entre fontes

Nos 75 vinculos ativos professor/unidade:

- 37 divergem entre a contagem da RPC e `vw_professores_carteira_resumo`;
- 41 divergem entre a RPC e a contagem de pessoas derivada da tabela plana;
- 13 professor/unidade possuem pelo menos uma pessoa representada por mais de um `aluno_id` na jornada.

Esses numeros demonstram que a diferenca nao e um caso isolado.

### 5.3 Identidade de aluno e multi-curso

A Luiza Pimentel possui:

- `aluno_id = 265`, Teclado, Emusys aluno 3183;
- `aluno_id = 1465`, Canto, Emusys aluno 3183;
- duas matriculas ativas com o mesmo professor.

Isso nao e necessariamente uma duplicacao acidental: e a representacao operacional de dois cursos. Para uma metrica de **pessoas na carteira**, porem, ela deve valer uma vez. A RPC atual a conta duas vezes.

Auditoria global:

- 180 identidades Emusys possuem mais de uma linha local nao arquivada;
- nenhuma combinacao de mesmo nome + nascimento apresentou mais de um ID Emusys, portanto nao apareceu evidencia de uma segunda identidade externa para a mesma pessoa;
- 24 identidades ativas possuem mais de um `aluno_id` dentro do mesmo professor/unidade;
- esses 24 casos estao distribuidos em 13 vinculos professor/unidade.

Conclusao: o problema nao e simplesmente "alunos duplicados". O banco tem granularidade por matricula/curso em `alunos`, enquanto o pente-fino quer contar pessoas.

### 5.4 Defeito em `vw_jornada_aluno_com_presenca`

A view faz:

```sql
left join aluno_presenca ap
  on ap.aluno_id = j.aluno_id
 and ap.unidade_id = j.unidade_id
left join aulas_emusys ae
  on ae.id = ap.aula_emusys_id
 and (... regra de disciplina ...)
```

Mas os agregados contam `ap.id`, nao `ae.id`. Portanto, quando a aula nao casa com a disciplina, `ae` fica nulo e `ap` continua sendo contado.

Impacto medido:

- 1.188 jornadas ativas;
- 1.166 jornadas possuem ao menos uma presenca ligada apenas por aluno/unidade que nao casou com a disciplina;
- 42.807 associacoes de presenca foram ligadas inicialmente por aluno/unidade;
- 25.250 casaram com disciplina/curso;
- 17.557 nao casaram, mas ainda assim entram nos agregados da view.

O fallback por `curso_emusys_id` casou 17.483 associacoes e o ID exato de matricula/disciplina casou 7.767.

**Importante:** a RPC atual nao usa os campos `presencas`, `faltas` ou `percentual_presenca_contrato` dessa view. Ela usa somente as linhas-base `j`. Assim, o defeito nao causa diretamente as 41 faltas do Caio, mas a view nao deve ser declarada fonte canonica de presenca por disciplina.

## 6. Presenca e faltas

### 6.1 Como o sync grava hoje

No arquivo `supabase/functions/sync-presenca-emusys/index.ts`:

- linha 19: maturidade de falta = 24 horas;
- linhas 101-109: aula cancelada nao materializa falta; aula precisa ter terminado ha pelo menos 24 horas;
- linha 1217: qualquer valor diferente de `presente` vira `ausente`;
- linhas 1236-1237: grava `status='ausente'` e `status_presenca='falta'`;
- linha 1242: `respondido_em` recebe o horario do sync, nao o horario real da chamada;
- linhas 1244-1246: conflito por aluno/aula usa `ignoreDuplicates: true`.

Consequencias:

1. A API/sync nao preserva um estado distinto de `nao registrado`.
2. Depois de 24 horas, um valor nao presente e materializado como falta.
3. Uma correcao posterior no Emusys nao atualiza automaticamente a linha ja existente, pois o conflito e ignorado.
4. Correcoes feitas pela RPC administrativa ou pelo LA Teacher ficam preservadas, mas a tabela deixa de ser um espelho sempre atual do Emusys.

### 6.2 Qualidade dos ultimos 60 dias

Foram encontrados:

- 20.132 registros;
- 12.612 `presente`;
- 7.520 `ausente`;
- 20.123 originados do Emusys;
- 9 originados do LA Teacher;
- nenhuma duplicata por aluno/aula;
- correspondencia integral entre `status` legado e `status_presenca` canonico nesse recorte.

Das 7.520 ausencias:

- 7.378 estao em aulas que nao possuem nenhum aluno presente;
- apenas 142 estao em aulas com mistura de presentes e ausentes;
- 554 estao marcadas em aulas justificadas.

Uma aula individual com o unico aluno ausente pode ser uma falta real. Portanto, o dado acima nao prova que todas as 7.378 sejam falsas. Ele prova que o banco nao consegue separar falta real de chamada nao registrada com seguranca suficiente para um relatorio de governanca.

### 6.3 Caso Caio / Campo Grande

Na janela de 60 dias:

| Mes | Presentes | Ausentes | Alunos com registro |
|---|---:|---:|---:|
| mai/2026 | 82 | 27 | 51 |
| jun/2026 | 89 | 98 | 52 |
| jul/2026 | 4 | 138 | 47 |

A RPC retorna 41 de 44 alunos atuais com tres ou mais faltas. O salto de julho impede interpretar esse numero como um fato pedagogico sem validacao de chamada.

### 6.4 Faltas justificadas

A RPC inclui faltas justificadas no limiar de tres ocorrencias.

Na carteira atual de toda a rede:

- 647 sinais por `>= 3` ausencias totais;
- 603 sinais por `>= 3` ausencias nao justificadas;
- 44 pessoas entram no sinal somente por causa de justificadas.

No teste de Matheus Felipe/Recreio, o unico aluno sinalizado deixa de ser sinalizado quando justificadas sao separadas.

### 6.5 Frequencia e gap de sync

Os jobs noturnos de presenca das tres unidades estavam ativos e o ultimo ciclo consultado terminou com sucesso. Ha execucoes de segunda a sexta e no sabado. Nao ha job equivalente de presenca no domingo.

A janela buscada por esses jobs e curta (5 ou 7 dias). Com `ignoreDuplicates`, uma correcao antiga feita no Emusys pode nao ser refletida no LA Report.

### 6.6 Seguranca da regra `>= 3`

`>= 3` e uma regra razoavel para **triagem operacional**, desde que cada ocorrencia seja uma falta confirmada e a identidade seja deduplicada por pessoa.

Hoje esses pre-requisitos nao estao satisfeitos. A regra nao deve ser exibida como desempenho, reincidencia confirmada ou fato para cobranca da equipe.

## 7. Registro pedagogico

`vw_aderencia_registro_professor` considera corretamente uma aula registrada quando existe:

```sql
anotacoes_fabio nao vazia OR anotacoes Emusys nao vazia
```

A view tambem:

- exclui aulas canceladas;
- considera somente aulas encerradas;
- exclui a linha de turma quando existe linha individual equivalente no mesmo horario/professor/unidade;
- agrupa por professor, unidade e mes.

Teste do unico professor com login:

| Professor | Unidade | Mes | Aulas | Com registro | Cobertura |
|---|---|---|---:|---:|---:|
| Matheus Felipe | Campo Grande | jul/2026 | 28 | 1 | 4% |
| Matheus Felipe | Recreio | jul/2026 | 11 | 6 | 55% |

As 39 aulas desses dois recortes eram normais, individuais e com alunos. Nao apareceu distorcao por slot vazio no caso testado.

A RPC so retorna cobertura quando `professores.usuario_id is not null`:

- Matheus: cobertura dinamica exibida;
- Caio: `null`, sinal `sem_acesso_ao_app_ainda`;
- Pedro Sergio: `null`, sinal `sem_acesso_ao_app_ainda`.

Portanto, professor sem login nao recebe `0% em X aulas` como avaliacao. Esse comportamento esta correto.

Ressalva: a view em si nao filtra categoria de aula nem quantidade de alunos. Isso nao afetou o teste de Matheus, mas a regra de aulas elegiveis deve permanecer explicita antes de ampliar o uso.

## 8. Testes minimos solicitados

### Caio em Campo Grande

- vinculo ativo e recente no Emusys;
- carteira da jornada: 44;
- carteira plana: 45;
- diferenca explicada por tres cadastros planos desatualizados em relacao ao snapshot da jornada;
- 41 alunos sinalizados com 3+ faltas: **nao confiavel para uso oficial** devido ao padrao de julho.

### Matheus com login

- Matheus Felipe, `professor_id=25`, `usuario_id=32`;
- usuario ativo, perfil professor e `auth_user_id` presente;
- cobertura aparece por unidade e mes;
- Campo Grande: 14 IDs locais na carteira, mas 13 pessoas Emusys;
- a RPC conta uma pessoa duas vezes na carteira de Campo Grande.

### Pedro Sergio sem login

- `usuario_id` nulo;
- cobertura retorna `null`, nunca 0%;
- sinal correto: `sem_acesso_ao_app_ainda`;
- Campo Grande: jornada 24, carteira plana 33, confirmando que a fonte plana nao pode substituir a jornada.

### Professor multiunidade

Caio e Matheus foram testados em Campo Grande e Recreio. Carteira, faltas e cobertura permaneceram isoladas por unidade.

## 9. Respostas diretas as quatro fontes questionadas

### 9.1 `aluno_presenca`

**Veredito:** fonte canonica de armazenamento, mas nao confiavel sozinha para declarar falta real.

Ela recebe Emusys e LA Teacher, nao possui duplicatas aluno/aula e esta consistente entre `status` e `status_presenca`. Porem, o sync materializa todo nao-presente como falta depois de 24 horas, nao distingue chamada ausente e ignora conflitos posteriores. Use-a como evento ingerido, nao como verdade pedagogica sem qualificacao.

### 9.2 Identidade duplicada

**Veredito:** ainda impacta a metrica de pessoa.

Luiza representa dois cursos validos, nao duas pessoas. Ha 180 identidades Emusys com multiplas linhas locais e 24 casos ativos em que isso ocorre dentro do mesmo professor/unidade. A RPC usa `aluno_id`, portanto pode contar a mesma pessoa mais de uma vez.

Nao foi encontrado caso nao arquivado de mesmo nome+nascimento associado a dois IDs Emusys diferentes. Isso reduz o risco de duplicacao de identidade externa, mas nao resolve a granularidade multi-curso.

### 9.3 Vinculo aula x matricula em `vw_jornada_aluno_com_presenca`

**Veredito:** nao e solido para presenca por disciplina.

O fallback nao elimina o registro que nao casou, porque o agregado conta `ap.id`. Foram medidas 17.557 associacoes sem match de disciplina ainda contadas. A view pode duplicar ou misturar presencas entre jornadas de um mesmo `aluno_id`.

### 9.4 `professores_unidades.emusys_ativo`

**Veredito:** canonico e correto no estado atual, com ressalva de latencia.

Todos os 75 vinculos ativos tinham `last_seen_em` recente e nao foi encontrado vinculo inativo com jornada ativa ou aula futura com aluno. O caso Leonardo/CG esta correto. Como o sync automatico e semanal, uma mudanca pode demorar ate o proximo ciclo para aparecer.

## 10. Recomendacao antes de liberar

Para o pente-fino poder ir para Quintela e Juliana como fonte oficial, recomenda-se, em uma segunda tarefa com alteracoes autorizadas:

1. trocar a fonte de carteira para a jornada sem os agregados defeituosos de presenca;
2. contar pessoa por `(unidade_id, emusys_aluno_id)`, com fallback para `aluno_id` quando o ID Emusys estiver ausente;
3. fazer a mesma deduplicacao na contagem de pessoas com faltas recorrentes;
4. nao tratar todo `ausente` Emusys como falta confirmada sem distinguir chamada nao registrada;
5. separar faltas justificadas no JSON;
6. definir precedencia para atualizacao de presenca: correcao manual/LA Teacher deve ser preservada, enquanto linha de origem Emusys precisa aceitar correcao posterior do proprio Emusys;
7. substituir `status='ausente'` por `status_presenca='falta'` na regra canonica, mantendo compatibilidade enquanto os dois campos estiverem consistentes;
8. fortalecer `tem_login` com usuario ativo, `auth_user_id` e perfil;
9. explicitar no `recorte` a data da carteira, o corte de maturidade da presenca, o mes da cobertura e a defasagem do sync de professores;
10. corrigir ou retirar de uso os agregados de presenca de `vw_jornada_aluno_com_presenca`.

## 11. Decisao final

**Nao enviar o pente-fino atual para a coordenacao como relatorio oficial.**

Ele pode ser usado internamente como diagnostico tecnico, com as faltas bloqueadas e a carteira rotulada como contagem provisoria por ID local. Professores/unidades, isolamento por unidade e cobertura de registro passaram nos testes. Carteira por pessoa e faltas recorrentes precisam ser corrigidas antes da liberacao.

## 12. Queries principais usadas

Todas as consultas abaixo sao somente leitura.

### Definicao da RPC

```sql
select p.oid::regprocedure::text as assinatura,
       p.prosecdef,
       p.provolatile,
       p.proacl,
       pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fabio_pente_fino_unidade';
```

### Definicao das views

```sql
select c.relname,
       pg_get_viewdef(c.oid, true)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'vw_jornada_aluno_com_presenca',
    'vw_jornada_aluno_atual',
    'vw_aderencia_registro_professor',
    'vw_professores_carteira_resumo',
    'vw_fabio_carteira_professor'
  );
```

### Comparacao de carteira

```sql
select j.professor_id,
       j.unidade_id,
       count(*) as jornadas,
       count(distinct j.aluno_id) as ids_locais,
       count(distinct coalesce(
         'e:' || j.emusys_aluno_id::text,
         'l:' || j.aluno_id::text
       )) as pessoas
from vw_jornada_aluno_com_presenca j
group by j.professor_id, j.unidade_id;
```

```sql
select professor_id, unidade_id, total_alunos
from vw_professores_carteira_resumo;
```

### Pessoas com multiplos IDs no mesmo professor

```sql
select unidade_id,
       professor_id,
       emusys_aluno_id,
       count(distinct aluno_id) as ids_locais
from vw_jornada_aluno_atual
where emusys_aluno_id is not null
group by unidade_id, professor_id, emusys_aluno_id
having count(distinct aluno_id) > 1;
```

### Qualidade de presenca na janela

```sql
select status,
       status_presenca,
       respondido_por,
       count(*)
from aluno_presenca
where data_aula >= current_date - 60
group by status, status_presenca, respondido_por;
```

```sql
with por_aula as (
  select aula_emusys_id,
         count(*) filter (where status = 'presente') as presentes,
         count(*) filter (where status = 'ausente') as ausentes
  from aluno_presenca
  where data_aula >= current_date - 60
  group by aula_emusys_id
)
select count(*) filter (where presentes = 0 and ausentes > 0) as aulas_sem_presente,
       sum(ausentes) filter (where presentes = 0 and ausentes > 0) as faltas_nessas_aulas,
       count(*) filter (where presentes > 0 and ausentes > 0) as aulas_mistas
from por_aula;
```

### Teste da falha de match da view de jornada

```sql
select j.id as jornada_id,
       count(ap.id) as presencas_ligadas_por_aluno_unidade,
       count(ae.id) as presencas_que_casaram_disciplina,
       count(ap.id) filter (where ae.id is null) as presencas_sem_match
from vw_jornada_aluno_atual j
left join aluno_presenca ap
  on ap.aluno_id = j.aluno_id
 and ap.unidade_id = j.unidade_id
left join aulas_emusys ae
  on ae.id = ap.aula_emusys_id
 and (
   ae.matricula_disciplina_id = j.emusys_matricula_disciplina_id
   or (
     ae.matricula_disciplina_id is null
     and ae.curso_emusys_id = j.emusys_disciplina_id
   )
 )
group by j.id;
```

### Cobertura de registro do Matheus

```sql
select v.professor_id,
       u.nome as unidade,
       v.mes,
       v.aulas,
       v.com_registro,
       v.pct_cobertura
from vw_aderencia_registro_professor v
join unidades u on u.id = v.unidade_id
where v.professor_id = 25
order by u.nome, v.mes desc;
```

### Frescor de professores/unidades

```sql
select p.id,
       p.nome,
       u.nome as unidade,
       pu.emusys_id,
       pu.emusys_ativo,
       pu.validacao_status,
       pu.last_seen_em
from professores_unidades pu
join professores p on p.id = pu.professor_id
join unidades u on u.id = pu.unidade_id
order by p.nome, u.nome;
```

### Teste da RPC por unidade

```sql
select public.fabio_pente_fino_unidade(
  2,
  'Campo Grande',
  60
);
```

```sql
select public.fabio_pente_fino_unidade(
  2,
  'Recreio',
  60
);
```

### Jobs de sincronizacao

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname ilike '%professor%'
   or jobname ilike '%presenca%'
order by jobname;
```
