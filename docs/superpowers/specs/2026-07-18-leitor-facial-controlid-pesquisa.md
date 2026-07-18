# Leitor Facial (Control iD iDFace Pro) → LA Report — Pesquisa técnica e decisões

> **Status:** parado / arquivado para aplicar algum dia. Não iniciado.
> **Data:** 2026-07-18. Piloto pretendido: Campo Grande.
> **Origem:** conversa a partir de `~/Downloads/plano-leitor-facial-presenca (1).md` (documento do Alf/Hugo).
> **Objetivo desta nota:** guardar a pesquisa da API (cara de refazer) + o que já existe no banco + as decisões tomadas, para retomar sem recomeçar do zero.

---

## 1. A ideia, em uma frase

Câmera facial na entrada da escola = carimbo físico e automático de que a pessoa **esteve na unidade**, para eliminar o "esqueci de lançar presença" na raiz. O leitor **não** decide presença-em-aula; ele fornece (ou não) evidência de presença física.

**Correção de escopo feita na conversa (Hugo):** pensar a câmera como **uma via da escola física até o LA Report**, sem envolver o Emusys. A resolução de identidade é 100% dentro do nosso banco.

**Piloto redirecionado (Hugo):** começar por **professor + colaborador/administração**, não aluno. Motivos: universo pequeno (~60 pessoas), o pessoal da administração fica na escola o dia todo (cobaia fácil), o professor bate o próprio rosto (não existe "responsável do professor"), e é a dor #1 do documento.

---

## 2. Achados da API Control iD (linha de Acesso)

Doc oficial: https://www.controlid.com.br/docs/access-api-pt/
Exemplos: https://github.com/controlid/integracao • https://github.com/controlid/Exemplos-dedicados-a-linha-Acesso
Postman: https://documenter.getpostman.com/view/10800185/SztHW4xo

API REST, JSON sobre HTTP. Sessão via `POST /login.fcgi` (`{"login":"admin","password":"admin"}` default) → devolve `session`, reusado como `?session=...`.

### 2.1 Objeto `users` — a chave de identidade
Fonte: `.../objetos/lista-de-objetos/#users`

10 campos, só isto: `id` (int64), `registration` (string, "matrícula"), `name` (string), `password`, `salt`, `user_type_id` (1=visitante), `begin_time`, `end_time`, `image_timestamp`, `last_access`.

- **NÃO existe campo custom/metadata/observação.** `registration` é o **único** lugar para guardar um ID do nosso lado.
- `registration` é **string livre**, filtrável via `load_objects` `where`. **Não é documentado como unique** (ao contrário de `cards.value`, `pins.value` etc., que a doc marca explicitamente como único). O exemplo oficial mostra vários users com `registration:""` → provavelmente aceita vazio/duplicado.
- Foto: `user_set_image.fcgi` (lote: `user_set_image_list.fcgi`); o equipamento extrai o template facial sozinho. `user_get_image.fcgi`/`user_list_images` para ler. **iDFace não exige lidar com template** — basta a foto.
- `change_logs` rastreia insert/update/delete em `users`/`templates`/`face_templates`/`cards` — **detector de "o iDSecure mexeu no cadastro"**. Só existe no iDFace. Rotaciona a cada 10 mil operações.

### 2.2 `access_logs` — o evento de batida
Fonte: `.../objetos/lista-de-objetos/#access_logs`

Campos: `id` (int64), `time` (Unix timestamp), `event` (int), `device_id`, `identifier_id`, `user_id`, `portal_id`, `identification_rule_id`, `qrcode_value`, `uhf_tag`, `pin_value`, `card_value`, `confidence` (0–1800, grau de confiança do rosto), `mask` (1=com máscara), `log_type_id`.

**Tabela de códigos de `event` (documentada, 1–15):**
| event | significado |
|---|---|
| 3 | Não identificado |
| 6 | Acesso negado |
| **7** | **Acesso concedido** ← identificação bem-sucedida |
| 11 | Acesso por botoeira |
| 12 | Acesso pela interface web |

(demais: 1=equip. inválido, 2=parâmetros inválidos, 4=pendente, 5=timeout, 8=acesso depende de +1 pessoa, 9=não-admin, 10=aberto via API sem motivo, 13=desistência iDBlock, 14=sem resposta, 15=interfonia iDFace.)

- ⚠️ `event=7` **não** é específico de face — vale p/ cartão/PIN/QR também. Para saber que foi facial, olhar `identifier_id`/`confidence`.
- ⚠️ **`user_id=0` NÃO é documentado como "desconhecido".** Filtrar por `event=7`, não por `user_id`. O exemplo de payload do documento original usa `event=12` (interface web) — ou seja, **não** é exemplo de batida de rosto.
- ⚠️ **Timezone do `time` é ambíguo** — doc diz "Unix Timestamp" mas nunca confirma UTC, e há `ntp.timezone` configurável à parte. Precisa ser **medido no equipamento** (comparar epoch cru vs. `system_information.time`). Erro de 3h corrompe a evidência "por dia".

### 2.3 Monitor vs Push — os dois canais assíncronos (equipamento → nós)
- **Monitor**: equipamento faz POST em `hostname:port/path` a cada inserção em `access_logs`. Endpoint real: `POST /api/notifications/dao` (multiplexa access_logs/templates/cards/alarm_logs — **checar `object`**). Payload traz tudo como **string**. ⚠️ **Sem retry / sem garantia de entrega documentada** — best-effort.
- **Push**: equipamento faz `GET /push` a cada `push_request_period` perguntando "tem comando?". Servidor responde `{verb, endpoint, body, contentType, queryString}` e o equipamento executa localmente, devolvendo `POST /result`. **`load_objects` é o exemplo oficial** → dá para mandar comando arbitrário a equipamento atrás de NAT, sem VPN. É o mecanismo do próprio iDCloud da Control iD.

### 2.4 🔴 Conflito com iDSecure (nome correto: **iDSecure**, não "iDSegure")
- **Monitor e Push são slots ÚNICOS.** `monitor.hostname` e `push_server.push_remote_address` são campos **escalares** — não há lista/multicast/fan-out. Sobrescrever **rouba** o canal, não adiciona ouvinte.
- **Documentado que o iDSecure SaaS ocupa o Push**: `push_remote_address = https://push.idsecure.com.br/api` (`.../modo-push/idcloud/`). Se CG usa iDSecure SaaS, **o Push é intocável** — apontar p/ nós desliga a escola do iDCloud.
- iDSecure **on-premise** ocupa qual canal? **NÃO DOCUMENTADO** — descobrir no equipamento.
- O documento original (seção 3.4 + item #10 da seção 8) **já trava escrita de cadastro** (`create_objects`/`user_set_image`) até o Rafael definir quem é dono do cadastro. Regra "dois escritores em hardware".

### 2.5 Recon read-only (rodar ANTES de qualquer escrita)
`get_configuration.fcgi` existe (POST, precisa de session). Sequência que responde tudo sem alterar nada:
```bash
# 1. sessão
curl -X POST "http://10.10.100.133/login.fcgi" -d '{"login":"admin","password":"admin"}'
# 2. quem ocupa Monitor e Push?
curl -X POST "http://10.10.100.133/get_configuration.fcgi?session=$S" \
  -d '{"monitor":["hostname","port","path"],"push_server":["push_remote_address","push_request_period"]}'
# 3. vínculo iDCloud? modo online? hora do equipamento (resolve timezone)?
curl -X POST "http://10.10.100.133/system_information.fcgi?session=$S"
```
`system_information` devolve `iDCloud_code` (denuncia iDSecure SaaS), `online` (modo), `time`, `serial`, `version`.
Decisão-chave: se `push_remote_address` contém `push.idsecure.com.br` → Push ocupado. Se `monitor.hostname` preenchido → Monitor ocupado. Se ambos → sobra **polling de `load_objects` sobre `access_logs`** (cursor por `id`), read-only, não quebra o iDSecure.

---

## 3. O que JÁ EXISTE no banco do LA Report (não reinventar)

Projeto: `ouqwbbermlzqqvtqwlul` (mesmo do LA Report).

- **Conceito de "pessoa" pronto:** `vw_aluno_identidade_unidade_canonica` agrupa 1.174 matrículas ativas em **997 pessoas** por `(unidade_id, pessoa_chave)`, com `identidade_confianca` e `aluno_id_canonico`. Convenção de chave: `emusys:123` / `local:456`. → a ponte do leitor deve seguir o mesmo padrão (`professor:12` / `colaborador:5`).
- **Infra de ponto de professor JÁ construída e VAZIA:** tabela `professor_ponto_confirmacoes` (campo `origem` livre, 0 linhas) + views `vw_ponto_professor_aulas` e `vw_ponto_professor_diario`. ⚠️ Exige `aula_emusys_id NOT NULL` → é ponto **por aula**, e a `vw_ponto_professor_aulas` já faz uma Estratégia A melhor que o documento: ancora na **primeira e última evidência** do dia e credita as aulas no meio (resolve sozinha o caso "bateu 14h, passou mal, foi embora").
- **Universo de teste:** 48 professores ativos (36 vínculos em CG), 12 colaboradores (`colaboradores`), 11 staff (`staff_unidade`). ~60 pessoas → auditar a ponte de identidade na mão é viável.
- ⚠️ `professores` e `colaboradores` são tabelas separadas, ambas com `id` inteiro que colidem → ponte precisa de chave composta.
- `staff_unidade`: nome/cargo/foto_url/unidade — já tem foto de staff.

---

## 4. Decisões tomadas na conversa

1. **Piloto = professor + colaborador** (não aluno). Aluno esbarra em responsável-bate-o-rosto e em mexer na `vw_aluno_presenca_semantica_v1` (dado publicado).
2. **v1 para em "quem esteve na escola"** — evento cru + identidade resolvida + view/tela de auditoria. **Não** ir até ponto-por-aula na v1 (o próprio documento, seção 6, diz que a evidência é "de dia, não de aula"). É exatamente a Fase 1/2 do documento.
3. **Ingestão agnóstica a transporte** — a edge recebe uma batida e grava; não sabe se veio de Monitor, polling ou curl de teste. Permite construir/testar hoje com o payload já conhecido e plugar o transporte depois.
4. **Timezone**: gravar `timestamptz` + guardar epoch cru no `payload_raw`; se o equipamento mandar hora local, conserto é reprocessar, não perda de dado.

### Design esboçado (v1) — NÃO implementado
Camadas: `[transporte] → edge idface-webhook → leitor_facial_eventos (append-only) → leitor_facial_pessoas (ponte) → vw_leitor_facial_presenca_dia`.
- `leitor_facial_eventos`: `controlid_log_id` unique (idempotência), grava **tudo** inclusive event 3/6; filtro `event=7` na leitura.
- `leitor_facial_pessoas`: `controlid_user_id → pessoa_chave` (`professor:`/`colaborador:`), guarda `nome_equipamento` p/ detectar divergência com iDSecure, `vinculo_confianca`.
- `leitor_facial_dispositivos`: `device_id → unidade`.

### Painel de cadastro remoto (discutido, não decidido)
- **É possível** cadastrar/gerenciar do LA Report remotamente — via Push (equipamento vem buscar comando) ou via **túnel Tailscale numa máquina de CG + REST direto** (recomendado: síncrono, não consome canal, não briga com iDSecure).
- **Bloqueado por política, não por técnica:** escrita de cadastro trava até o Rafael definir dono do cadastro (doc seção 3.4/#10). Além disso, **a base do equipamento já está cadastrada com fotos** — o painel de cadastro é feature de gestão, não o que destrava o piloto.
- Recomendação: painel **só-leitura** primeiro (lista `users` do equipamento × professores/colaboradores do LA Report, vincular gravando só no nosso banco), botões de escrita destravam depois do OK do Rafael.

---

## 5. Bloqueios / pendências para retomar

- [ ] **Rafael**: rodar o recon read-only (seção 2.5) em CG — descobrir se Monitor/Push estão ocupados pelo iDSecure e medir o timezone do `time`. Dados de rede já recebidos no doc original: **IP 10.10.100.133, firmware 6.24.7, standalone**.
- [ ] **Rafael**: confirmar quem é dono do cadastro (nós × iDSecure) antes de qualquer escrita.
- [ ] Conseguir máquina em CG para Tailscale (destrava polling + painel síncrono sem tocar em Monitor/Push).
- [ ] Fase 0 real: `login.fcgi` + `load_objects` em `users` (só leitura) → lista de quem está cadastrado, ponto de partida da auditoria de identidade. **Bônus imediato:** se a lista tiver ~1.200 nomes de aluno, alunos batem o próprio rosto; se tiver muitos responsáveis, a Estratégia A cobre menos gente do que o documento supõe.
- [ ] Coordenar com o Codex (lado LA Report) p/ não colidir em tabelas/migrations.

---

## 6. Correções ao documento original (`plano-leitor-facial-presenca (1).md`)
Ao retomar, ajustar no documento do Alf/Hugo:
- "iDSegure" → **iDSecure** (todas as menções).
- Seção 3.2: o payload de exemplo é `event=12` (interface web), **não** uma batida de rosto; a batida é `event=7`.
- Seção 3.5 / arquitetura: `idface-reconciliacao` está como "(opcional, backup)" — **não é opcional**, é fonte de verdade (Monitor não tem garantia de entrega).
- Seção 3.4: Monitor também é slot único e pode estar ocupado pelo iDSecure — não só o Push.
- Adicionar os links da doc (o documento não linka nenhuma fonte).
