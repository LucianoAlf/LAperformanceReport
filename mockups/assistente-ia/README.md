# Assistente IA — Mockups de Redesign

Três variações **dentro do tema do app** (slate + violet + emerald, dark mode, cantos arredondados estilo Tailwind/Radix). Não são experimentos fora da identidade — diferenciam-se por **densidade de informação, tipografia secundária e estrutura da resposta**, não pela paleta.

Abrir [`index.html`](./index.html) no navegador para a galeria de comparação.

## Tema base (compartilhado)

- **Cores:** `slate-900` (#0f172a) base, `slate-800` (#1e293b) superfícies, `slate-700` (#334155) bordas, `violet-600` (#7c3aed) acento principal, `emerald-500` (#10b981) status/feedback positivo.
- **Modo:** dark mode (mesmo `bg-slate-900`/`text-slate-200` do app).
- **Forma:** cantos arredondados (10–20px), bordas finas, sombras suaves com leve glow violeta.
- **Fonte base:** Geist (substituível pela fonte sans atual do app).

## As três direções

### 01 · Refined Sober — [`1-editorial.html`](./1-editorial.html)
- **Vibe:** Linear/Vercel — profissional, denso, refinado.
- **Tipografia:** Geist + Geist Mono (números/dados).
- **Estrutura:** `Resultado` e `Critério` viram **campos rotulados key/value**, número em mono dentro de chip violeta. Bolha do usuário sólida (`violet-600`).
- **Diferencial:** hierarquia clara, sem floreio. Espaçamento controlado.

### 02 · Data Console — [`2-terminal.html`](./2-terminal.html)
- **Vibe:** Para usuário power — sente que é BI tool, não chatbot.
- **Tipografia:** Geist + **Geist Mono em destaque** (dados em primeiro plano).
- **Estrutura:** pílulas de escopo (unidade, modo) no topo, **card de fato com o número "398" grande em mono violeta**, badge âmbar de "contexto insuficiente", `Critério` em bloco separado, **statusbar inferior** estilo Supabase Studio com atalhos e modelo.
- **Diferencial:** os dados saltam aos olhos, não ficam escondidos no texto. Métricas (tokens, tempo) expostas.

### 03 · Conversation-led — [`3-ember.html`](./3-ember.html)
- **Vibe:** Mais respiro e personalidade — sem fugir do dark/violet.
- **Tipografia:** Geist + **Instrument Serif itálico (pontual)** — só no nome "Assistente" e na frase de abertura da IA, com drop cap violeta.
- **Estrutura:** cantos generosos (`rounded-2xl`/`3xl`), bolha do usuário em **vidro violeta** (gradient + border), reactions em pílulas redondas, ornamento sutil.
- **Diferencial:** o toque de serifa quebra a sensação genérica de "chat IA" sem virar fora-de-tema; quase tudo continua sans.

## Conteúdo de teste (idêntico nas três)

Cada mockup renderiza fielmente o mesmo conteúdo da tela real, para comparação justa:
- Header com avatar, nome, status online (dot emerald) e 4 botões (histórico, novo, expandir, fechar).
- Selector de unidade (Recreio).
- Welcome com bullets de capacidades.
- Pergunta: _"quantos bolsistas tem no recreio?"_
- Resposta com **Resultado** (398 alunos · campo bolsistas ausente) e **Critério** (igual ao screenshot real).
- Reações: útil / não foi / tentar de novo.
- Composer com placeholder e botão enviar.
- Footer com modelo (`gpt-4o-mini`) e atalhos.

## Próximos passos
Depois de escolher uma direção, refinamos:
- Estados adicionais (loading com pulsos violeta, erro, conversa longa).
- Painel de histórico (drawer lateral).
- Renderização de tabelas markdown na resposta.
- Migração para os componentes React do app (`AuditoriaWidget.tsx`).
