# Dominio Comercial — LA Music

## Pagina Principal
- `src/components/App/Comercial/ComercialPage.tsx` (~5000 linhas)
- 3 tabs: Lancamentos, Programa Matriculador+ LA, Tarefas Rapidas

## Cards de Entrada Rapida (quickInputCards)
| Card | Tipo | Etapa Default | Status filtro |
|------|------|---------------|--------------|
| Leads Atendidos | `lead` | 1 (Novo) | `novo` |
| Experimental | `experimental` | 5 (Exp. Agendada) | `experimental_*` |
| Visita | `visita` | 6 (Visita) | `visita_escola` |
| Matricula | `matricula` | 10 (Convertido) | `convertido` |

- Cada card abre modal de lote (tabela com multiplas linhas)
- Estado: `modalOpen: 'lead' | 'experimental' | 'visita' | 'matricula' | null`

## Modais de Lote (Batch)
- Arrays: `loteLeads[]`, `loteExperimentais[]`, `loteVisitas[]` de `LoteLinha`
- Interface `LoteLinha`: id, aluno_nome, telefone, canal_origem_id, curso_id, quantidade, status_experimental?, professor_id?, sabia_preco?
- Funcoes: `addLinha*()`, `removeLinha*()`, `updateLinha*()`, `handleSaveLote*()`
- Leads: INSERT novo (etapa 1). Experimentais/Visitas: UPDATE se match por telefone, INSERT se nao

## Sistema de Etapas (Mover Etapa)
- Popover em cada lead nas 3 tabs (Leads, Experimentais, Visitas) com botoes de transicao
- Transicoes definidas em `transicoesEtapa` (ver regras-negocio.md)
- Botao "Voltar" via `voltarEtapa` (desfazer transicao acidental)
- Para Exp. Agendada (etapa 5): formulario com combobox professor (cmdk/Command) + date picker
- `handleMoverEtapa(leadId, novaEtapa, extras?)`: atualiza BD + sincroniza 3 states (leadsMes, experimentaisMes, visitasMes)
- `handleBulkMoverEtapa(novaEtapa, extras?)`: batch via `selecionadosFunil: Set<number>`

## Combobox Professor
- Usa `Command` (cmdk) em vez de Select simples — permite busca por nome
- Componente em `src/components/ui/command.tsx` (shadcn)
- Padrao: Command + CommandInput + CommandList + CommandEmpty + CommandGroup + CommandItem

## Funil Pipeline (FunnelPipelineNav)
- Componente: `src/components/App/Comercial/FunnelPipelineNav.tsx`
- 4 etapas: Novos → Experimentais → Visitas → Matriculas
- **Base do funil = primeira etapa (Novos)** — % de conversao relativo a base
- "Novos" = `leadsMes.length` (todos os leads do periodo, NAO apenas status='novo')
- Porcentagens: experimentais/total, matriculas/total (funil de conversao real)
- Componente exibe: icone, label, contagem, % do total, barra de progresso

## Detalhamento do Funil
- 4 sub-tabs: Leads, Experimentais, Visitas, Matriculas
- Cada tab filtra por status (ver regras-negocio.md "Filtro por Tab")
- Badges mostram contagem filtrada (ex: leads so conta status=novo)
- Busca global por nome em todos os periodos
- Filtro de possiveis duplicatas (mesmo telefone em periodos diferentes)
- **Filtros por canal e curso** no detalhamento (alem dos filtros de status por tab)
- Edicao inline em campos como canal, curso, professor
- Selecao em lote + exclusao em lote de leads (ver padroes-codigo.md "Batch/Lote")

## Funcoes Utilitarias
- `normalizePhone(tel)`: remove nao-digitos, adiciona `55` se 10-11 digitos
- `maskPhone(value)`: formata para `(XX) XXXXX-XXXX`
- `checkLeadByPhone(telefone, linhaId, tipo)`: busca lead por telefone, pre-preenche dados

## Autocomplete
- `ComboboxNome`: sugere nomes de leads existentes
- `ComboboxTelefone`: sugere telefones de leads existentes
- `sugestoesLeads[]`: carregado da tabela `leads` filtrado por unidade

## Hooks Relacionados
- `useKPIsComercial(unidadeId, ano, mes)` — KPIs consolidados, funil, leads por canal
- `useComercialData(ano, unidade)` — dados brutos + metas
- `useCheckLeadDuplicado()` — verificacao individual e em lote

## Componentes Auxiliares
- `PlanilhaComercial.tsx` — visao planilha editavel
- `PlanoAcaoComercial.tsx` — insights IA (Gemini)
- `TabProgramaMatriculador.tsx` — programa gamificado hunters
- `AlertasComercial.tsx` — alertas dinamicos por KPIs

## Integracao de Leads — Mapeamento Atual dos Fluxos

### Fontes e Caminhos
| Origem | NocoDB | Emusys | Supabase | nocodb_lead_id | emusys_lead_id |
|--------|--------|--------|----------|----------------|----------------|
| Mila WhatsApp bot (normal) | ✅ direto | ✅ direto | ✅ via Emusys webhook | pode nao ter | ✅ |
| Mila WhatsApp bot (Emusys rejeita) | ✅ direto | ❌ | ❌ | pode nao ter | null |
| Criado no Emusys CRM | ✅ via EB0LibpOJCLhKp7M | ✅ direto | ✅ via EB0LibpOJCLhKp7M | ✅ | ✅ |
| Criado na UI LA Performance | ❌ | ❌ | ✅ direto | null | null |

### Principios
- Leads do Mila chegam ao Supabase via Emusys webhook (`EB0LibpOJCLhKp7M`) — NAO via NocoDB webhook
- Emusys eh o hub central de sync NocoDB↔Supabase
- **RISCO**: se Emusys rejeitar o cadastro (ex: telefone duplicado), o lead fica no NocoDB mas NAO no Supabase
  - Causa: `Cadastrar no Emusys` tem `neverError: true` + `onError: continueRegularOutput` → falha silenciosa
  - Fix pendente: IF node apos `Cadastrar no Emusys` → fallback direto `upsert_lead()` via Postgres
- UI do LA Performance nao sincroniza com NocoDB nem Emusys (manual apenas)
- "Leads Atendidos" no dashboard = `SUM(quantidade)` de leads WHERE `data_contato` no periodo (nao COUNT*)

### Workflows
- **`aHD4kJdzByLwFXA1`**: Agente Mila CG — **PRINCIPAL FONTE DE LEADS**
- **`gSHJHYMOYDQZqleW`**: Agente Mila Recreio — **PRINCIPAL FONTE DE LEADS**
- **`yko5HstPTze0gsIM`**: Agente Mila Barra — **PRINCIPAL FONTE DE LEADS**
  - Os 3 agentes Mila SDR sao a principal origem de leads. Recebem WhatsApp, processam com IA e chamam a API Emusys de cadastro. Emusys dispara webhook → `EB0LibpOJCLhKp7M`
- **`EB0LibpOJCLhKp7M`**: Emusys webhook → Supabase + NocoDB (lead_criado, lead_editado, lead_arquivado). Ativado toda vez que a API de registro de leads do Emusys e chamada (pelos Mila SDR ou manual)
- **`1uP2GhoHG1shEFLg`**: NocoDB webhook. Nó `Upsert Lead` (origem='nocodb') **DESATIVADO desde ~28/03/2026** → NÃO sincroniza NocoDB→Supabase (verificado 2026-05-25: 0 eventos `nocodb`/30d). Hoje só roda o log de métricas. Leads chegam ao Supabase apenas pela via Emusys
- **`dJ7Dc9LHLTSnKIsi`**: Gerenciar CRM NocoDB — apenas UPDATEs (triggered por Chatwoot), NAO cria leads

### Tabelas de Aggregacao (Supabase)
- `experimentais_professor_mensal`: agregado por professor/mes — triggers corrigidos (INSERT+UPDATE+DELETE em status)
- `experimentais_mensal_unidade`: agregado por unidade/mes — triggers corrigidos (INSERT+UPDATE+DELETE em status)
- Backfill executado em 2026-03-11 — 0 divergencias confirmadas
- Detalhes dos workflows em `integracao-infra.md` secao "n8n Workflows"

## Campos da Tabela leads (principais)
- `telefone`, `canal_origem_id`, `curso_interesse_id`, `status`, `etapa_pipeline_id`
- `unidade_id`, `temperatura` (quente/morno/frio), `data_contato`, `arquivado`
