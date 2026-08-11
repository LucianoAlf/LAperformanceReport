# Comparativos de Fechamentos Mensais — Plano de Implementação

> **Para execução:** aplicar as tarefas nesta sessão seguindo o ciclo RED/GREEN e validar o RPC em produção sem alterar snapshots fechados.

**Objetivo:** carregar a competência mensal anterior no produtor canônico, validar equivalência por domínio/hash e publicar o motivo estruturado quando o comparativo não for elegível.

**Arquitetura:** o produtor continua somente leitura sobre `fechamento_mensal_snapshots`. Para julho, ele consulta junho (`ano/mês` calculados com virada de ano), exige os domínios administrativos e comerciais fechados, calcula fingerprints determinísticos e compara os payloads. O renderer apenas apresenta o estado e os valores já calculados.

**Tecnologias:** PostgreSQL/Supabase RPC, migrations SQL, testes Node/Deno e Edge Function existente.

---

### Tarefa 1 — Reproduzir o comportamento atual

**Arquivos:**
- Teste: `tests/relatorioGerencialComparativos.test.mjs`

- [ ] Criar teste que exija `anterior.status = 'nao_carregado'` como falha da implementação atual e depois invertê-lo para o contrato desejado: motivo estruturado, fingerprint anterior e estados dos domínios.
- [ ] Executar o teste antes da migration e confirmar RED.

### Tarefa 2 — Implementar carregamento anterior

**Arquivos:**
- Criar: `supabase/migrations/20260811170000_relatorio_gerencial_comparativos_anterior.sql`

- [ ] Republicar `get_relatorio_gerencial_canonico_v1` preservando o payload atual e calculando `v_ano_anterior`/`v_mes_anterior` com virada de ano.
- [ ] Consultar os documentos canônicos anterior e atual sem recompor KPIs.
- [ ] Classificar motivos: `fechamento_anterior_nao_fechado`, `dominio_anterior_ausente`, `payload_anterior_invalido`, `fingerprint_incompativel` ou `fechamentos_equivalentes`.
- [ ] Preencher `comparativos.atual`, `comparativos.anterior`, `fingerprint_atual`, `fingerprint_anterior` e `disponibilidade`.
- [ ] Manter `indisponivel` quando junho não tiver os domínios equivalentes; não modificar snapshots.

### Tarefa 3 — Validar

- [ ] Rodar testes focados e build.
- [ ] Aplicar migration no Supabase de produção, executar o RPC para Recreio julho/2026 e conferir motivo real de junho.
- [ ] Gerar o relatório publicado e confirmar que o texto exibe o motivo estruturado sem inventar tendência.
- [ ] Commitar e enviar somente migration/testes relacionados.
