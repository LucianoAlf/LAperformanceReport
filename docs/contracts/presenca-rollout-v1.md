# Contrato de rollout da presença canônica v2

## Grão e estado inicial

Uma configuração representa exatamente `unidade_id + superficie`.

Superfícies governadas:

- `agenda`
- `sol`
- `la_teacher`
- `lia`
- `mila`
- `relatorios`
- `kpis`

Modos:

- `legado`: o consumidor publica o contrato anterior;
- `sombra`: o legado continua publicado e o v2 é apenas comparado;
- `canonico_v2`: o consumidor publica a ocorrência canônica v2.

A migration cria as sete superfícies de cada unidade em `sombra`. Isso é publicação técnica, não cutover.

## Escrita

Não existe escrita direta para aplicação, agentes ou administradores. Toda transição usa:

```text
admin_alterar_presenca_rollout_v1(
  unidade_id,
  superficie,
  modo,
  motivo,
  request_id,
  evidencia
)
```

Regras:

- somente `service_role` ou usuário autenticado reconhecido por `is_admin()`;
- `request_id` é idempotente e não pode ser reutilizado com payload diferente;
- toda transição gera evento append-only;
- `canonico_v2` só pode vir de `sombra`;
- sete dias são necessários, mas não suficientes: todos os gates também precisam estar verdes.

Evidência mínima para ativar `canonico_v2`:

```json
{
  "dias_operacionais": 7,
  "sem_explicacao": 0,
  "sync_completo": true,
  "agenda_sol_convergente": true,
  "comandos_sem_recibo": 0,
  "decisoes_humanas_sobrescritas": 0,
  "vazamento_acl": 0
}
```

## Leitura

- `get_presenca_rollout_modo_v1`: consulta operacional apenas para `service_role`;
- `fn_presenca_rollout_modo_interno_v1`: helper sem `EXECUTE` público, destinado a RPCs `SECURITY DEFINER` de propriedade controlada;
- ausência de configuração retorna `legado` de forma fail-closed.

## Portas governadas

As implementações canônicas ficam privadas. As portas já consumidas pelos apps
despacham por unidade e superfície:

| Superfície | Porta pública | Legado preservado |
|---|---|---|
| Agenda | `get_agenda_dia_v2` | `get_agenda_dia` adaptada ao envelope atual |
| Sol | `fn_texto_relatorio_presenca` | cópia da função viva anterior à v2 |
| LA Teacher/Fábio | `app_minha_agenda_sessao` e `fabio_professor_presencas_periodo` | `app_minha_agenda_sessao_base_v1` e `fabio_professor_presencas_periodo_legado_v1` |
| Lia, Mila e BI | `get_presenca_contexto_agente_v1` | envelope sem inferência de presença bruta |
| KPIs | `get_faltas_periodo_v2`, `vw_absenteismo_aluno`, `vw_radar_aluno_sinais` | função e views vivas anteriores à v2 |
| Relatórios/detalhes | `get_presenca_ocorrencias_periodo_v2` | leitura regular anterior sobre `aluno_presenca` |

Em `sombra`, as RPCs calculam a implementação canônica dentro de bloco isolado,
mas devolvem a resposta legada. As comparações numéricas persistentes continuam
no contrato de shadow; falha da v2 não derruba a operação legada. Em
`canonico_v2`, somente a implementação privada v2 é publicada. Em `legado`, a
v2 não participa da resposta e nenhuma migration reversa é necessária.

As views externas permanecem `security_invoker`. O acesso às cópias privadas
passa por funções governadas com `search_path` fixo e autorização por unidade;
não existe `SELECT` autenticado direto nas views privadas capaz de contornar a
flag.

## Rollback

Rollback não apaga eventos, presenças, faltas, recibos nem retificações. Ele cria uma transição para `legado` e exige motivo iniciado por `rollback:` mais um gatilho governado:

```text
sync_incompleto_sem_bloqueio
divergencia_agenda_sol
comando_sem_recibo
decisao_humana_sobrescrita
vazamento_acl
delta_sem_explicacao
```

Depois do rollback, a trilha permanece disponível em `presenca_rollout_eventos` e a investigação usa os mesmos eventos canônicos; nenhuma migration destrutiva faz parte do procedimento.

## Segurança

- RLS habilitada nas duas tabelas;
- `anon` e `authenticated` sem leitura ou DML direto;
- `service_role` com leitura, mas sem DML direto;
- função administrativa com `search_path` fixo e autorização explícita;
- lock transacional por unidade/superfície;
- índices para a chave atual, `request_id` e histórico por unidade/superfície.
- implementações canônicas e legadas privadas sem `EXECUTE`/`SELECT` direto de
  `anon` ou `authenticated`.
