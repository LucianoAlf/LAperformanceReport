# P0.1H - Retencao, Graficos e Relatorios Administrativos

Data: 2026-06-09

## 1. Resumo executivo

O P0.1G colocou uma fonte canonica de KPIs de alunos no banco:

- `get_kpis_alunos_canonicos(uuid, integer, integer)`
- `get_dados_relatorio_gerencial(...)` agora injeta `kpis_alunos_canonicos`
- `get_dados_retencao_ia(...)` tambem injeta `kpis_alunos_canonicos`

Mas a camada de retencao ainda nao esta 100% saneada.

Status honesto:

- KPIs executivos de alunos: caminho canonico criado e validado nas telas principais.
- Retencao operacional: ainda mistura `vw_kpis_retencao_mensal` com `movimentacoes_admin`.
- Relatorio administrativo: alunos/matriculas estao alinhados no arquivo local, mas retencao ainda usa view + movimentacoes.
- Graficos de retencao/renovacao: ainda dependem de `dados_mensais`, `vw_kpis_retencao_mensal` e movimentacoes, conforme o contexto.
- Edge Function `relatorio-admin-whatsapp` esta ativa no projeto, mas nao foi confirmado que o codigo implantado e identico ao arquivo local.

Conclusao: nao deprecar `vw_kpis_retencao_mensal` ainda. Ela continua referenciada.

## 2. Evidencia de banco

Projeto confirmado:

- `https://ouqwbbermlzqqvtqwlul.supabase.co`

### Maio/2026 fechado

`competencias_mensais`:

| Unidade | Maio/2026 |
|---|---|
| Campo Grande | fechado |
| Barra | fechado |
| Recreio | fechado |

Para Maio fechado, fonte oficial deve ser `dados_mensais`.

Comparacao importante:

| Unidade | Fonte | Evasoes | Churn/Taxa |
|---|---|---:|---:|
| Campo Grande | `dados_mensais` | 13 | 2.77 |
| Campo Grande | `vw_kpis_retencao_mensal` | 13 | 2.90 |
| Barra | `dados_mensais` | 13 | 5.88 |
| Barra | `vw_kpis_retencao_mensal` | 13 | 5.78 |
| Recreio | `dados_mensais` | 19 | 6.09 |
| Recreio | `vw_kpis_retencao_mensal` | 19 | 6.05 |

A view fica proxima, mas nao e fonte historica segura porque calcula sobre base viva.

### Junho/2026 aberto

`get_kpis_alunos_canonicos` para Junho aberto:

| Unidade | Ativos | Pagantes | Matriculas | Banda | 2o Curso | Kids | School | Evasoes | Churn |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Campo Grande | 479 | 449 | 543 | 39 | 27 | 194 | 285 | 2 | 0.45 |
| Barra | 228 | 225 | 259 | 18 | 13 | 147 | 81 | 3 | 1.33 |
| Recreio | 327 | 315 | 407 | 59 | 24 | 173 | 154 | 17 | 5.40 |

Esses numeros batem com a logica canonica viva de alunos.

## 3. Causa raiz encontrada

`vw_kpis_retencao_mensal`:

- deduplica evasoes por nome/unidade/ano/mes;
- considera `evasao` e `nao_renovacao` por `data`;
- conta `aviso_previo` por `data`, nao por `mes_saida`;
- calcula base de taxa com `alunos` atuais;
- nao consulta `competencias_mensais`;
- nao usa `dados_mensais` quando o mes esta fechado.

Logo:

- serve como view operacional aproximada;
- nao serve como fonte canonica historica;
- nao deve ser usada cegamente para mes fechado;
- nao deve ser base unica para relatorio executivo de competencia.

## 4. Mapa de fontes por componente

| Tela/Relatorio | Arquivo | Item | Fonte atual | Classificacao | Risco |
|---|---|---|---|---|---|
| Administrativo | `src/components/App/Administrativo/AdministrativoPage.tsx` | Cards de alunos | `fetchKPIsAlunosCanonicos` | OK | Baixo |
| Administrativo | `AdministrativoPage.tsx` | Renovacoes/evasoes/resumo retencao | `vw_kpis_retencao_mensal` + `movimentacoes_admin` | Parcial | Medio |
| Administrativo | `AdministrativoPage.tsx` | Churn card/alerta | calculado de `resumo` | Parcial | Pode divergir de snapshot fechado |
| Administrativo | `ModalRelatorio.tsx` | Relatorio diario manual | props de `AdministrativoPage` + queries de aviso por `mes_saida` | Parcial | Herdado do resumo misto |
| Administrativo | `ModalRelatorio.tsx` | Relatorio mensal manual | props de `AdministrativoPage` | Parcial | MRR/taxa podem herdar mistura |
| Administrativo | `ModalRelatorio.tsx` | Relatorio gerencial IA | RPC `get_dados_relatorio_gerencial` | OK para alunos, parcial para retencao | Retencao ainda legado |
| Relatorio automatico WhatsApp | `supabase/functions/relatorio-admin-whatsapp/index.ts` | Alunos/matriculas | helper local canonica | OK local | Deploy drift nao descartado |
| Relatorio automatico WhatsApp | `relatorio-admin-whatsapp/index.ts` | Renovacoes/evasoes | `vw_kpis_retencao_mensal` + `movimentacoes_admin` | Parcial | Divergencia operacional |
| Analytics/Gestao | `src/components/GestaoMensal/TabGestao.tsx` | Cards alunos/financeiro | `fetchKPIsAlunosCanonicos` / `dados_mensais` | OK | Baixo |
| Analytics/Gestao | `TabGestao.tsx` | Aba Retencao cards/graficos | `vw_kpis_retencao_mensal`, `dados_mensais`, `movimentacoes_admin` | Parcial | Fonte varia por contexto |
| Hook Retencao | `src/hooks/useKPIsRetencao.ts` | Retencao | fechado usa canonica parcial; aberto usa view; fallback direto | Perigoso | Fallback antigo recalcula |
| Simulador/Historicos | `src/hooks/useDadosHistoricos.ts` | taxa renovacao viva | `vw_kpis_retencao_mensal` | Parcial | Ainda depende da view |
| Plano IA Retencao | `PlanoAcaoRetencao.tsx` | dados IA | `get_dados_retencao_ia` | Parcial | `kpis_retencao` vem da view legado |

## 5. Casos operacionais citados pelo Alf

### Recreio - Leticia Ferreira Vasconcelos

Banco real:

- id 582: Teclado, regular, pagante, R$ 420, status ativo.
- id 1000: Canto, segundo curso, `tipo_matricula_id=3`, `BOLSISTA_INT`, status ativo.

Conclusao:

- dado esta consistente no banco;
- fonte canonica deve contar Leticia como:
  - 1 aluna ativa;
  - 1 pagante;
  - 1 vinculo de 2o curso;
  - 1 pessoa com bolsa integral;
- se a linha expandida nao mostra badge de bolsa, e bug visual na tabela, nao bug de fonte.

### Recreio - Olivia Freire Rodrigues Oliveira

Banco real:

- existe uma linha no LA Report como `Matrícula em Banda` / Power Kids / Ramon.
- Alf informou que falta curso de Bateria no LA Report.

Conclusao:

- e divergencia operacional de cadastro/sync com Emusys;
- nao corrigir por KPI;
- abrir ajuste nominal controlado ou fluxo de sync, sem mexer nos snapshots.

## 6. Relatorios administrativos

### Manual frontend

`ModalRelatorio.tsx` usa dados recebidos de `AdministrativoPage`.

Isso significa:

- se `AdministrativoPage` esta certo para alunos, relatorio manual tende a estar certo para alunos;
- se `AdministrativoPage` mistura retencao, relatorio manual herda essa mistura.

### Automatico WhatsApp

`supabase/functions/relatorio-admin-whatsapp/index.ts` local:

- ja calcula alunos/matriculas por regra canonica viva;
- ainda consulta `vw_kpis_retencao_mensal` para resumo de retencao;
- ainda combina com `movimentacoes_admin` usando `Math.max`;
- lista avisos previos por `mes_saida` do proximo mes, o que esta alinhado com a regra operacional recente.

Ponto pendente:

- a funcao deployada `relatorio-admin-whatsapp` esta ativa, versao 30;
- nao foi possivel ler o source implantado pelo path temporario listado;
- portanto ainda falta confirmar/deployar a versao local corrigida antes de afirmar que o WhatsApp automatico esta 100% alinhado.

## 7. Graficos

### Ja melhorou

`DashboardPage.tsx`:

- evolucao de alunos: historico por `dados_mensais`, mes corrente por fonte canonica;
- resumo por unidade: mes atual por fonte canonica, historico por `dados_mensais`.

`TabGestao.tsx`:

- cards de alunos e financeiro do mes atual usam fonte canonica;
- graficos financeiros usam `dados_mensais` e complementam mes atual com fonte canonica.

### Ainda parcial

`TabGestao.tsx`:

- busca `vw_kpis_retencao_mensal` para dados de retencao do periodo atual;
- evolucao de churn/taxa renovacao usa `dados_mensais` historico e injeta mes atual parcialmente;
- taxa de renovacao do mes atual ainda vem de `vw_kpis_retencao_mensal`.

`useKPIsRetencao.ts`:

- aberto: usa `vw_kpis_retencao_mensal`;
- fechado/preliminar: zera muitos detalhes;
- fallback direto em tabelas inclui `aviso_previo` como evasao, o que conflita com a regra do Alf.

## 8. Regras que precisam ficar explicitas

### Alunos/KPIs executivos

Ja decidido:

- fechado: `dados_mensais`;
- mes atual aberto: `get_kpis_alunos_canonicos` / helper canonica viva;
- passado aberto sem snapshot: preliminar/indisponivel, sem recalculo silencioso.

### Retencao operacional

Proposta P0.1H:

- relatorio diario de operacao usa `movimentacoes_admin`;
- aviso previo aparece por `mes_saida`, nao como churn do mes de lancamento;
- `nao_renovacao` conta como evasao/churn apenas quando a regra de saida real estiver definida;
- transferencia interna nao deve entrar em churn global;
- renovacao antecipada fica fora deste pacote, por decisao do Alf.

### Historico/competencia fechada

Proposta:

- card executivo de churn/evasoes de mes fechado deve vir de `dados_mensais`;
- detalhe nominal pode ser exibido como operacional/auditavel, mas nao pode sobrescrever o numero fechado.

## 9. Patch recomendado P0.1H

Sem migration e sem deploy automatico:

1. Criar helper frontend de retencao operacional:
   - recebe `movimentacoes_admin`, `alunosPagantesCanonicos`, `ano`, `mes`, `unidade`;
   - calcula evasoes/nao renovacoes/avisos/renovacoes de forma unica;
   - nao conta `aviso_previo` como evasao/churn;
   - deixa avisos por `mes_saida`.

2. Ajustar `useKPIsRetencao.ts`:
   - remover fallback antigo perigoso;
   - fechado: usar `dados_mensais` para total/churn e marcar detalhes como operacionais;
   - aberto: usar helper operacional + base canonica de alunos.

3. Ajustar `AdministrativoPage.tsx`:
   - parar de buscar `vw_kpis_retencao_mensal` diretamente;
   - usar helper de retencao operacional;
   - manter listas nominais em `movimentacoes_admin`.

4. Ajustar `TabGestao.tsx`:
   - substituir uso de `vw_kpis_retencao_mensal` para mes atual por helper/hook P0.1H;
   - preservar historico fechado em `dados_mensais`.

5. Ajustar `relatorio-admin-whatsapp/index.ts` local:
   - trocar helper duplicada de alunos por RPC `get_kpis_alunos_canonicos`;
   - trocar resumo de retencao por logica operacional local igual ao frontend;
   - nao deployar sem APPROVE separado.

6. Patch visual Leticia:
   - garantir badge de bolsa integral/parcial tambem quando `tipo_aluno` indicar bolsa, alem de `tipo_matricula_id/nome`.

## 10. O que NAO aprovar ainda

- Deprecar `vw_kpis_retencao_mensal`.
- Alterar `dados_mensais`.
- Reclassificar avisos previos/renovacao antecipada sem regra final.
- Deployar Edge Function automatico sem QA de texto gerado.
- Usar relatorio automatico como prova de fonte canonica ate confirmar deploy.

## 11. QA do proximo patch

Validar visualmente e por SELECT-only:

1. Campo Grande / Junho:
   - alunos canonicos seguem 479/449/543/39/27;
   - retencao nao conta aviso previo como evasao;
   - relatorio manual bate com cards.
2. Recreio / Junho:
   - alunos canonicos seguem 327/315/407/59/24;
   - Leticia aparece com segundo curso bolsista no detalhe;
   - Olivia continua como pendencia operacional de cadastro/sync.
3. Barra / Junho:
   - alunos canonicos seguem 228/225/259/18/13.
4. Maio fechado:
   - churn/evasoes executivos continuam `dados_mensais`;
   - detalhes nominais, se exibidos, sao rotulados como operacionais.
5. Build:
   - `npm run build`.

## 12. Decisao atual

P0.1H deve continuar com patch de frontend/Edge local, sem migration.

Depois disso, fazer uma etapa separada:

- deploy controlado de `relatorio-admin-whatsapp`;
- teste de geracao sem envio real, se existir modo seguro;
- so entao reativar/confiar no relatorio automatico como fonte saneada.
