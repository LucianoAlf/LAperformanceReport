# Audit Logs — Spec

## Objetivo
Rastrear todas as ações manuais dos usuários no sistema, registrando quem fez o quê, quando, e o que mudou.

## Abordagem
Trigger genérico no PostgreSQL (`AFTER INSERT/UPDATE/DELETE`) aplicado a 22 tabelas. Zero mudança no frontend para captura — apenas expansão da tela de auditoria existente.

## Banco de Dados

### Tabela: `audit_log` (existente, expandida)
Campos novos:
- `auth_user_id UUID` — auth.uid() do Supabase
- `usuario_nome TEXT` — email/nome do JWT
- `registro_id_int INTEGER` — PK integer (tabelas com id int)
- `origem TEXT DEFAULT 'manual'` — manual | system | webhook | cron

Campos existentes mantidos: `id`, `tabela`, `registro_id`, `acao`, `dados_antigos`, `dados_novos`, `usuario`, `created_at`

### Função trigger: `fn_audit_log()`
- Captura `auth.uid()` via `current_setting('request.jwt.claims')`
- Grava `to_jsonb(OLD)` e `to_jsonb(NEW)`
- Classifica origem: se tem `auth.uid()` → manual, senão → system
- `SECURITY DEFINER` para garantir permissão de escrita
- Retorna `COALESCE(NEW, OLD)` — não interfere na operação

### Tabelas monitoradas (22)
- Alunos: `alunos`, `turmas_explicitas`, `turmas_alunos`
- Comercial: `leads`, `lead_experimentais`, `crm_pipeline_etapas`
- Movimentações: `movimentacoes_admin`, `renovacoes`
- Professores: `professores`, `professor_acoes`, `professor_360_avaliacoes`, `professor_360_ocorrencias`
- Operacional: `salas`, `cursos`, `unidades`
- Financeiro: `dados_mensais`, `metas`, `metas_kpi`
- Lojinha: `loja_produtos`
- Projetos: `projetos`, `projeto_tarefas`
- Config: `config_health_score_professor`

### Índices
- `(tabela, created_at)`
- `(auth_user_id, created_at)`
- `(created_at)` — para limpeza

### Limpeza automática
pg_cron semanal: `DELETE FROM audit_log WHERE created_at < NOW() - interval '90 days'`

## Frontend

### Tela: expandir `TabAuditoria.tsx` existente
- Filtros: usuário, tabela, ação (INSERT/UPDATE/DELETE), período, origem
- Busca server-side por conteúdo do registro (nome aluno, lead, etc.)
- Lista com: data, usuário, ação, tabela, badge de origem
- Expandir registro: diff antes/depois
- Paginação server-side (limit 50 por página)

## Estimativas
- ~1.100 registros/dia
- ~100k registros em 90 dias
- Latência: ~1-2ms por operação (imperceptível)
- Storage: ~500MB em 90 dias (controlado pela limpeza)

## Não inclui
- Log de leitura (SELECT) — só escritas
- Log de login/logout — mantém separado em `auditoria_acesso`
- Notificações em tempo real de mudanças
