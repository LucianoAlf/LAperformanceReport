# Health Score Professor V3 - Gate 7 configuracao governada

**Data:** 2026-07-18

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Status:** implementado em homologacao; V2 continua produtivo

## 1. Veredito

O Gate 7 foi implementado sem migrar consumidores produtivos. A coordenacao
possui uma interface V3 separada para governar pesos e metas, enquanto a
configuracao V2 permanece visivel e inalterada logo abaixo.

A versao ativa V3 e somente leitura. Toda mudanca segue o ciclo:

1. criar um novo rascunho a partir da versao ativa;
2. informar vigencia futura e justificativa;
3. ajustar pesos e metas em controles independentes;
4. salvar o rascunho;
5. simular o impacto sobre os valores brutos da sombra;
6. ativar em comando separado.

## 2. Controles de negocio

- sliders alteram somente o peso de cada pilar;
- metas usam campos numericos separados e unidade visivel;
- os seis pesos precisam totalizar `100%`;
- permanencia, conversao, media/turma e numero de alunos exigem meta aprovada;
- retencao e presenca podem permanecer sem meta, mas com estado explicito;
- a vigencia deve iniciar no primeiro dia do mes;
- a justificativa fica registrada na versao;
- versoes ativas e snapshots fechados continuam imutaveis;
- nenhuma simulacao publica ou reescreve snapshot.

## 3. Defesa no banco

Foram expostas somente RPCs com `SECURITY DEFINER`, `search_path` fixo e o
guard de `professores.editar`:

- `get_health_score_professor_v3_config_ui`;
- `criar_health_score_professor_v3_config_rascunho`;
- `salvar_health_score_professor_v3_config_rascunho`;
- `simular_health_score_professor_v3_config`;
- `ativar_health_score_professor_v3_config`;
- `get_health_score_professor_v3_snapshot_ui`.

As tabelas internas continuam sem leitura ou escrita direta para
`anon/authenticated`.

A migration de endurecimento criou
`health_score_professor_v3_config_simulacoes`, append-only para o navegador.
Cada simulacao guarda competencia, resultado, autor, data e fingerprint da
configuracao. A ativacao e bloqueada quando:

- nao existe simulacao daquela revisao;
- peso, meta, parametros, vigencia ou justificativa mudaram depois dela;
- a simulacao e anterior ao ultimo salvamento do rascunho.

## 4. Estado remoto conferido

- uma versao V3 ativa;
- nenhum rascunho deixado pelos testes;
- `129` snapshots de sombra preservados;
- zero simulacoes artificiais persistidas durante a verificacao;
- RLS ativo na trilha de simulacoes;
- `anon_select=false` e `authenticated_select=false`;
- RPC de simulacao `SECURITY DEFINER`, volatil, sem `anon` e com acesso
  protegido para `authenticated/service_role`;
- trigger `trg_health_score_professor_v3_exigir_simulacao_atual` ativo.

## 5. Frontend

Arquivos principais:

- `src/components/App/Professores/HealthScoreV3Config.tsx`;
- `src/hooks/useHealthScoreProfessorV3Config.ts`;
- `src/hooks/useHealthScoreProfessorV3.ts`;
- `src/lib/healthScoreProfessorV3.ts`;
- `src/components/App/Professores/ProfessoresPage.tsx`.

O painel exige a feature flag
`VITE_HEALTH_SCORE_V3_CONFIG_ENABLED=true` em producao e a permissao
`professores.editar`. Em desenvolvimento a flag fica habilitada para
homologacao local.

O hook de snapshots preserva `null` e `sem_base`; nao faz fallback para V2 nem
transforma ausencia de dado em zero.

## 6. Validacao visual

No navegador autenticado em `http://localhost:5175/app/professores` foram
confirmados:

- versao ativa `1` bloqueada para edicao;
- pesos `25/25/15/15/10/10`, totalizando `100%`;
- metas de permanencia `12`, conversao `70`, media/turma `1,44` e alunos `33`;
- retencao como aguardando dados e presenca bloqueada ate o inicio;
- formulario separado para criar rascunho futuro;
- painel V2 preservado;
- ausencia de erro novo da configuracao no console.

O componente empilha seus controles no viewport mobile. O shell legado da
aplicacao ainda conserva largura minima e rolagem horizontal em telas
estreitas; essa limitacao e anterior ao Gate 7 e nao foi ampliada para uma
refatoracao global nesta entrega.

## 7. Verificacoes

- `node --test tests/healthScoreProfessorV3Frontend.test.mjs`: `10/10`;
- `node --test tests/*.test.mjs`: `242/242` apos o endurecimento final;
- `npm run build`: exit `0` apos o endurecimento final e a conferencia remota;
- `git diff --check`: sem erro de whitespace;
- validacao real no Chrome autenticado;
- consultas de grants, RLS, trigger e definicao das RPCs no Supabase remoto.

## 8. Proximo Gate

O Gate 8 deve migrar consumidores individualmente, sempre sob feature flag e
com rollback por consumidor. A primeira fatia prevista e o modal individual do
professor. Tabela de Performance, rankings, relatorios, Dashboard, Analytics e
agentes so mudam depois da homologacao da fatia anterior.
