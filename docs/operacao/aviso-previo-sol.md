# Aviso prévio diário da Sol

## Fonte e objetivo

O aviso diário lembra a equipe de finalizar no Emusys uma matrícula cujo aviso
prévio chegou ao fim. Ele não tenta descobrir se o aluno desistiu ou se o aviso
foi cancelado a partir de presença ou de aulas futuras.

O cadastro do aviso entra no LA Report pelos webhooks
`matricula_aviso_previo_adicionado` e `matricula_aviso_previo_editado`. A remoção
é recebida por `matricula_aviso_previo_removido` e só pode localizar com segurança
um registro que tenha `movimentacoes_admin.emusys_aviso_previo_id`.

O `GET /matriculas` é usado apenas para confirmar ao vivo o estado da matrícula.
Esse endpoint não expõe o aviso prévio atual nem informa que um aviso foi
removido.

## Regra operacional

- Aluno já encerrado localmente fica fora antes de consultar a API.
- Registro sem `emusys_aviso_previo_id` é legado sem fonte rastreável e não gera
  cobrança automática.
- Matrícula inativa no Emusys está resolvida e fica fora da mensagem.
- Matrícula ativa cujo contrato começa depois do aviso é tratada como renovação.
- Matrícula ativa cujo contrato engloba o aviso continua pendente.
- O veredito compara o `emusys_matricula_id` do aviso; outro curso do mesmo
  aluno não pode resolver essa pendência.
- Aulas futuras e presença recente não significam que o aviso foi cancelado.
- Falha, resposta vazia ou HTTP 429 nunca vira pendência. Qualquer falha bloqueia
  a mensagem inteira da unidade e deixa erro no log.

## Agendamento e limite da API

Os jobs versionados estão em
`vps/la-hq/sol/crontab-aviso-previo.txt`. Todos usam o mesmo lock global. De
segunda a sexta as unidades são consultadas em horários separados. No sábado há
uma única execução que percorre Barra, Campo Grande e Recreio em série, evitando
que as três disputem o rate limit do Emusys.

O script canônico é
`vps/la-hq/sol/scripts/send-aviso-previo-sol.py`. `--dry-run` não envia mensagem,
não enfileira relatório e não grava vereditos.

## Incidente de 05/09/2026

Três jobs simultâneos no sábado provocaram HTTP 429. O script anterior convertia
a falha em `cobrar`, por isso Miguel Hayashi Dupret, Alice Rodrigues de Santana e
Gabriel Ferreira Marques Machado apareceram mesmo com a matrícula encerrada.

Alana Vasconcelos de Araujo, Tito Lapa Cazarim e Arthur Monteiro de Castro Landim
eram avisos legados sem o ID necessário para receber a remoção. Os registros
foram anulados, preservando a trilha administrativa.

O webhook de Davi Branco Rodrigues trouxe uma data prevista anterior à própria
data do aviso; a data foi corrigida para 01/10/2026 conforme confirmação da
equipe. Luiz Eduardo Philippsen foi corrigido para 14/09/2026, data da última
aula confirmada no período. Payloads futuros com a mesma inconsistência são
quarentenados e deixam uma invariante crítica no log, sem apagar uma correção
válida existente.

## Diagnóstico

O log da execução fica em
`/home/sol/.openclaw/workspace/logs/aviso-previo.log` na VPS `la-hq`. Antes de
atribuir uma cobrança ao aluno, conferir o resultado da RPC
`aviso_previo_pendencias`, o webhook bruto e a consulta ao vivo da matrícula na
unidade correta; IDs do Emusys são locais à unidade.
