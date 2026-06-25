# Design — Mensagens Automáticas (Sucesso do Aluno) + Carrossel de Boas-Vindas da Equipe

> Status: aprovado para spec — 2026-06-25
> Módulo: Sucesso do Aluno
> Abordagem escolhida: **A — Reuso (`crm_templates_whatsapp`) + tabela de equipe (`staff_unidade`)**

## 1. Contexto e problema

As mensagens automáticas de WhatsApp do projeto vivem em dois mundos desconexos:
- **Manuais** (`crm_templates_whatsapp`): texto editável, usadas no inbox pelo TemplateSelector.
- **Automações** (`enviar-boas-vindas-matricula`, `enviar-pesquisa-pos-primeira-aula`): texto **hardcoded** dentro da edge, invisível e não editável pela UI.

O usuário (gestor) não tem onde **ver** quais mensagens automáticas existem no módulo Sucesso do Aluno, nem editar o texto delas sem depender de dev.

Em paralelo, validamos hoje (via curl) uma nova mensagem de boas-vindas: um **carrossel da equipe por unidade** (foto + nome/cargo de cada membro) + card da comunidade + contato da secretaria, enviada pela caixa 3 (Sol – Sucesso do Aluno). Falta tirar isso do curl e colocar no sistema.

## 2. Objetivo

1. Criar uma tela em **Sucesso do Aluno** que **lista** as automações do módulo e mostra o que cada uma dispara.
2. Tornar **editável** o texto da nova automação (carrossel da equipe).
3. Implementar a automação do **carrossel da equipe** como edge, com **disparo manual** (de teste) por ora.

## 3. Escopo

### Dentro (Fase 1)
- Tabela `staff_unidade` + seed da equipe atual (Recreio/CG/Barra + CEOs globais).
- Colunas em `unidades`: `link_comunidade`, `secretaria_whatsapp`, `secretaria_fixo`.
- 1 template novo em `crm_templates_whatsapp` (texto do carrossel, editável).
- Edge `enviar-boas-vindas-equipe` (monta carrossel + comunidade, disparo manual).
- Subaba "Mensagens Automáticas" em Sucesso do Aluno: lista 3 automações; edita texto do carrossel; botão "Disparar teste".
- Limpeza: apagar edge temporária `upload-staff-foto`; migrar `staff/img/mapa.md` pro banco.

### Fora (fases futuras)
- Edição do texto das 2 automações existentes (boas-vindas matrícula, pesquisa 1ª aula) — na Fase 1 elas só **aparecem (ver)**, read-only.
- Disparo automático do carrossel na matrícula (Fase 1 é manual).
- CRUD visual da equipe (adicionar/remover/trocar foto pela UI) + upload de foto na tela.
- Replicar pro fluxo de régua/outros marcos.

## 4. Arquitetura

### 4.1 Banco

**`staff_unidade`** (nova)
| Campo | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| unidade_id | uuid FK unidades, **null = global** | CEOs ficam global |
| nome | text | |
| cargo | text | ex: "Gerente de Relacionamento" |
| foto_url | text | URL pública do bucket `staff-fotos` |
| ordem | int | ordem no carrossel |
| ativo | bool default true | |
| created_at / updated_at | timestamptz | |

- RLS: leitura por usuário autenticado; escrita admin (padrão das tabelas de config).
- Globais (`unidade_id IS NULL`) entram em **todas** as unidades, por último.

**`unidades`** — novas colunas: `link_comunidade text`, `secretaria_whatsapp text`, `secretaria_fixo text`.

**`crm_templates_whatsapp`** — 1 linha nova:
- `contexto='sucesso_aluno'`, `tipo='automacao_boas_vindas_equipe'`, `slug='boas_vindas_equipe'`, `ativo=true`.
- `conteudo` = texto com placeholders: `{responsavel}`, `{aluno}`, `{curso}`, `{unidade}`, `{secretaria_whatsapp}`, `{secretaria_fixo}`, `{equipe}` (lista "nome — cargo" gerada do staff).

### 4.2 Edge `enviar-boas-vindas-equipe` (nova)

- **Input:** `{ unidadeId, numeroDestino, responsavel?, aluno?, curso? }`.
- **Lê:** `staff_unidade` (da unidade + globais, por `ordem`); `crm_templates_whatsapp` (texto, substitui placeholders — inclusive `{equipe}` gerado dos membros); `unidades` (link_comunidade, secretaria_whatsapp, secretaria_fixo).
- **Monta e envia** (caixa 3, via `getUazapiCredentials({caixaId:3})`):
  1. `POST /send/carousel` — `text` = texto montado; um card por membro (foto + `*nome* — cargo`) com botão URL "Entrar na comunidade" → `link_comunidade`.
  2. `POST /send/text` (delay) — mensagem da comunidade (textinho + link, `linkPreview:true`) → gera o card nativo "Entrar na comunidade".
- **Registra** em `admin_mensagens` (como `enviar-vcard` faz). `verify_jwt`: conforme padrão (chamada autenticada do front).
- **Erros:** valida unidade/número; retorna `{ok:false, erro}` com status claro; loga falha.

> Formato já validado hoje: carrossel sem texto nos cards funciona; botão URL com texto custom "Entrar na comunidade" funciona; caption/encoding UTF-8 ok via edge (Deno). **Limitação conhecida:** carrossel (mensagem interativa) **não renderiza em iPhone/iOS** — entregue mas invisível. Aceito por ora (decisão do usuário).

### 4.3 Frontend — subaba "Mensagens Automáticas"

- Local: Sucesso do Aluno → nova subaba ao lado de Acompanhamento/Pesquisas/Cartões.
- Lista 3 automações como cards:
  | Automação | Gatilho | Fase 1 |
  |---|---|---|
  | Boas-vindas da equipe (carrossel) | Manual | **editável** + "Disparar teste" |
  | Boas-vindas de matrícula (vídeo professor) | Automático na matrícula | ver (read-only) |
  | Pesquisa pós-1ª aula | Manual (modal) | ver (read-only) |
- **Editar texto** (só carrossel): editor reusa padrão do `ModalGerenciarTemplates` → salva `crm_templates_whatsapp`.
- **Disparar teste**: modal escolhe unidade + número → chama `enviar-boas-vindas-equipe`.
- Hook novo `useAutomacoesSucessoAluno` (lista/edita) seguindo o padrão de hooks do projeto.

## 5. Fluxo de dados (carrossel)

```
Tela "Disparar teste" (unidade + número)
  → edge enviar-boas-vindas-equipe
    → lê staff_unidade + crm_templates_whatsapp + unidades
    → monta carrossel (cards) + msg comunidade
    → UAZAPI caixa 3 (/send/carousel, /send/text)
    → registra em admin_mensagens
```

## 6. Dados a migrar (do `mapa.md` → banco)

**Equipe** (cargos do mapa de 2026-06-25):
- Recreio: Daiana (Secretaria), Fernanda (Secretaria), Clayton (Gerente de Relacionamento)
- CG: Jereh (Gerente de Relacionamento), Jhon (Secretaria), Gabi (Secretaria), Vitória (Comercial)
- Barra: Anne Krissya (Gerente de Relacionamento), Arthur (Secretaria), Duda (Secretaria), Kailane (Comercial)
- Global (CEOs): card único "Luciano e Anne — Direção" (foto `geral/luciano-anne.png`)

**Fotos** (já no bucket `staff-fotos`): `recreio/{daiana.jpeg,fernanda.jpg,clayton.jpeg}`, `cg/{jereh,jhon,gabi,vitoria}.jpg`, `barra/{krissya,arthur,duda,kailane}.jpg`, `geral/luciano-anne.png`.

**Comunidades:** CG `…/CqECiLkdvJZ2vQYFJT8v7N`, Barra `…/CQQyziknpqwCKvZPMLT3kY?mode=wwt`, Recreio `…/JLnoXDNJEOjGn0tDKlzsdF`.

**Secretarias** (do mapa — ⚠️ **a confirmar**, formato dos números estava ambíguo):
- CG: Wpp (21) 96552-9851 · Fixo (21) 2412-0461
- Recreio: Wpp (21) 3955-1135 · Fixo (21) 3411-5703
- Barra: Wpp (21) 96957-5619 · Fixo (21) 3400-8891

## 7. Tratamento de erro
- Edge valida `unidadeId`/`numeroDestino`; sem equipe cadastrada → erro claro.
- Foto inacessível → o card pode falhar; bucket é público (mitigado).
- Falha de envio UAZAPI → retorna 502 com a mensagem, registra falha; tela mostra toast.

## 8. Testes
- Edge: disparo manual pros números de teste (formato já validado hoje em 25/06).
- Editar texto na tela → próximo disparo reflete a mudança.
- Conferir card da comunidade e contato da secretaria por unidade.

## 9. Limpeza / dívida
- **Apagar** a edge temporária `upload-staff-foto` (`verify_jwt=false`, não deve ficar aberta) após o seed.
- `staff/img/mapa.md` deixa de ser fonte de verdade (vira o banco); manter como referência histórica ou remover.

## 10. Pontos abertos (resolver antes/durante implementação)
1. **Números das secretarias** — confirmar com o usuário (o Wpp do Recreio `3955-1135` parece fixo, sem 9º dígito).
2. Lista de nomes no texto (`{equipe}`) vs. só nos cards — decisão: gerar `{equipe}` do staff e manter no texto (editável), redundância proposital com os cards.
