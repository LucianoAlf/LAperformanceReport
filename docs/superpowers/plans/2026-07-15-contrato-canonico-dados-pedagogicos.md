# Plano de Implementacao do Contrato Canonico Pedagogico

> Execucao incremental, com um unico escritor e comparacao em sombra antes do cutover.

## Fase 0 - Contencao P0 (15-16/07)

1. Criar testes de contrato para grants do pente-fino e confianca do churn.
2. Revogar `fabio_agent` de `fabio_pente_fino_unidade`; manter `service_role`.
3. Expor confianca baixa nas previsoes atuais sem apagar o historico.
4. Ajustar Sucesso do Aluno para nao apresentar o score atual como fato confiavel.
5. Validar migration, build, grants e tela.

## Fase 1 - Inventario e contrato (15-16/07)

1. Catalogar consumidores diretos e indiretos de `aluno_presenca`.
2. Mapear grants, crons, Edge Functions, views, RPCs e telas.
3. Classificar cada objeto: bruto, semantico, derivado, snapshot ou legado.
4. Registrar responsavel, periodo, grao e risco de cada metrica.

## Fase 2 - Identidade e carteira (16-17/07)

1. Criar read model de pessoa por unidade com chave Emusys e fallback sinalizado.
2. Criar carteira canonica independente de presenca.
3. Criar ocupacao canonica por pessoa/turma.
4. Corrigir `get_carteira_professor_periodo_canonica` e seus testes.
5. Comparar junho com a lista ouro do Quintela nas tres unidades.

## Fase 3 - Presenca semantica (20-21/07)

1. Preservar evidencia bruta existente.
2. Criar classificacao semantica versionada e auditavel.
3. Ajustar sync para nao promover estado desconhecido a falta confirmada.
4. Preservar escritas confiaveis do LA Teacher e retificacoes manuais.
5. Classificar historico apenas com o nivel de confianca demonstravel.

## Fase 4 - Read models separados (21-22/07)

1. Jornada contratual sem agregados de presenca.
2. Carteira de pessoas.
3. Ocupacao de turmas.
4. Presenca/frequencia semantica.
5. Deprecar `vw_jornada_aluno_com_presenca` para novos consumidores.

## Fase 5 - Consumidores P0/P1 (22-28/07)

Ordem de cutover:

1. `features_churn_alunos_ativos` e modelo de risco.
2. Health Score do aluno e cron de recalc.
3. KPIs/Health Score de professor e relatorio da coordenacao.
4. `fabio_contexto_professor`, briefing e pente-fino.
5. Sucesso do Aluno, ficha e historicos pedagogicos.

## Fase 6 - Testes ouro e invariantes (durante todas as fases)

- pessoa duplicada conta uma vez na carteira;
- dois cursos continuam duas jornadas;
- duas turmas regulares contam duas ocupacoes;
- banda nao entra na media de turma;
- unidade e competencia nao vazam;
- indeterminado nunca vira falta;
- cobertura sem login nao vira 0%;
- taxas ficam entre 0 e 100;
- snapshots fechados nao substituem fonte atual;
- comparacao antiga/nova registra diferencas explicadas.

## Fase 7 - Cutover e aposentadoria (28-29/07)

1. Migrar um consumidor por vez.
2. Observar logs e resultados em sombra.
3. Manter rollback para cada troca.
4. Revogar novos acessos a objetos legados.
5. Liberar pente-fino somente depois da assinatura dos testes.

## Pontos de confirmacao humana

A coordenacao sera chamada apenas quando existir uma decisao real de negocio, com
amostra nominal e alternativas fechadas. Falha tecnica, join, deduplicacao ou timezone
nao serao devolvidos como pergunta para a equipe.
