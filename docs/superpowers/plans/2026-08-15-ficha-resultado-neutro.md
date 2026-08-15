# Ficha Técnica — resultado claro e linguagem neutra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a primeira etapa da Ficha Técnica explícita e neutralizar os textos derivados do perfil no Time.

**Architecture:** A tela pública continuará sendo um HTML estático servido em `public/ficha-tecnica/index.html`; apenas a hierarquia e os textos do resultado serão ajustados. O Time continuará consumindo `src/data/perfilTextos.ts`, com um nome curto calculado no componente somente para o cabeçalho do briefing.

**Tech Stack:** HTML/CSS/JavaScript estático, React/TypeScript, Node `node:test`, Vite.

---

### Task 1: Criar o contrato RED da nova experiência

**Files:**
- Create: `tests/fichaTecnicaResultadoNeutralidade.test.mjs`
- Read: `public/ficha-tecnica/index.html`
- Read: `src/data/perfilTextos.ts`
- Read: `src/components/App/Time/FichaColaborador.tsx`

- [ ] **Step 1: Write the failing test**

Criar o contrato abaixo, que captura a ordem do resultado, o CTA, o subtítulo
derivado do segundo artista, a neutralidade e o nome curto do briefing:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resultSource = fs.readFileSync(path.join(root, 'public/ficha-tecnica/index.html'), 'utf8');
const perfilSource = fs.readFileSync(path.join(root, 'src/data/perfilTextos.ts'), 'utf8');
const timeSource = fs.readFileSync(path.join(root, 'src/components/App/Time/FichaColaborador.tsx'), 'utf8');

test('resultado anuncia a etapa no eyebrow antes da frase do codinome', () => {
  assert.match(resultSource, /<p class="eyebrow result-eyebrow">[\\s\\S]*?Seu perfil LA[\\s\\S]*?Parte 1 de 2[\\s\\S]*?<\\/p>/);
  assert.equal(resultSource.includes('id="resultProgress"'), false);
  assert.ok(resultSource.indexOf('result-eyebrow') < resultSource.indexOf('id="resultHello"'));
  assert.ok(resultSource.indexOf('id="resultHello"') < resultSource.indexOf('id="resultCodename"'));
});

test('resultado orienta explicitamente para a última parte', () => {
  assert.match(resultSource, /class="btn btn-primary"[^>]*id="btnRider"/);
  assert.match(resultSource, />Falta a última parte →<\\/button>/);
  assert.match(resultSource, /São mais 5 minutos\. É a parte que mais ajuda a gente a te conhecer\./);
});

test('subtítulo usa o artista secundário, não a palavra do chip', () => {
  assert.match(resultSource, /resultSubline[\\s\\S]*?com tempero.*s\.artista/);
});

test('textos derivados do perfil não usam pronomes de gênero fixos', () => {
  assert.doesNotMatch(perfilSource, /\\b(?:ela|dela|nela|ele|dele|nele)\\b/i);
  assert.match(perfilSource, /não se desestabiliza fácil/);
  assert.match(perfilSource, /combine o prazo junto/);
  assert.match(perfilSource, /Reconhecimento funciona por/);
  assert.match(perfilSource, /não entrega abaixo do padrão que se cobra/);
});

test('bloco de valores também usa título neutro', () => {
  assert.match(timeSource, /O que prioriza/);
  assert.doesNotMatch(timeSource, /O que ela prioriza/i);
});

test('briefing usa apelido ou primeiro nome, sem alterar o nome completo do topo', () => {
  assert.match(timeSource, /const nome = ficha\.apelido \|\| ficha\.nome/);
  assert.match(timeSource, /const nomeCurto = ficha\.apelido\?\.trim\(\) \|\| ficha\.nome\.trim\(\)/);
  assert.match(timeSource, /\.split\(\/\\\\s\+\//);
  assert.match(timeSource, /<Briefing[\\s\\S]*?nome=\\{nomeCurto\\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test tests/fichaTecnicaResultadoNeutralidade.test.mjs
```

Expected: FAIL because the current HTML has no combined eyebrow or new CTA and
the profile catalog still contains gendered text.

### Task 2: Implementar a hierarquia da tela pública

**Files:**
- Modify: `public/ficha-tecnica/index.html` (CSS e markup de `#screen-result`)

- [ ] **Step 1: Write the minimal implementation**

Adicionar os estilos específicos:

```css
.result-eyebrow{display:flex; align-items:center; justify-content:center; gap:8px;}
.result-eyebrow .result-divider{color:var(--line);}
.btn-primary{background:var(--teal); color:var(--teal-ink); box-shadow:0 6px 18px rgba(42,157,143,.35);}
.result-note{max-width:42ch; margin:10px auto 0; color:var(--muted); font-size:.82rem; line-height:1.45;}
```

No início de `#screen-result`, colocar o eyebrow combinado e manter `hello`
imediatamente antes do codinome:

```html
<p class="eyebrow result-eyebrow">
  <span>Seu perfil LA</span>
  <span class="result-divider" aria-hidden="true">·</span>
  <span>Parte 1 de 2</span>
</p>
<div class="halo" id="halo"><img id="resultImg" src="" alt=""></div>
<p class="hello" id="resultHello"></p>
<div class="codename" id="resultCodename"></div>
```

Trocar somente o CTA e acrescentar sua mensagem:

```html
<button class="btn btn-primary" id="btnRider" onclick="irParaRider()">Falta a última parte →</button>
<p class="result-note">São mais 5 minutos. É a parte que mais ajuda a gente a te conhecer.</p>
```

Preservar a regra existente de `showResult`:

```js
document.getElementById("resultSubline").textContent = `com tempero ${s.artista}`;
```

- [ ] **Step 2: Run test to verify the result portion passes**

Run:

```powershell
node --test tests/fichaTecnicaResultadoNeutralidade.test.mjs
```

Expected: the result-order, CTA and `s.artista` assertions pass; only the
neutrality and Time-name assertions remain failing.

### Task 3: Neutralizar o catálogo do Time e encurtar o cabeçalho do briefing

**Files:**
- Modify: `src/data/perfilTextos.ts` (perfil, reconhecimento, valores e fallbacks)
- Modify: `src/components/App/Time/FichaColaborador.tsx` (nome curto e título do Bloco D)

- [ ] **Step 1: Replace all fixed-gender output text**

Reescrever as quatro frases `reage` sem `Ela`, remover `sozinha`/`ela` dos
quatro pontos cegos, usar `Reconhecimento funciona por ...` nas cinco frases de
briefing, neutralizar as cinco frases de `VALORIZACAO_EVITE`, trocar o caso
Frank para `combine o prazo junto`, e trocar `EXCELENCIA` para
`não entrega abaixo do padrão que se cobra`.

Atualizar os fallbacks com o mesmo critério. Ao terminar, a busca abaixo deve
retornar zero ocorrências em `perfilTextos.ts`:

```powershell
rg -n "\\b(Ela|ela|Dela|dela|Nela|nela|Ele|ele|Dele|dele|Nele|nele)\\b" src/data/perfilTextos.ts
```

- [ ] **Step 2: Use the short name only in the briefing**

Manter a identidade atual e acrescentar:

```ts
const nome = ficha.apelido || ficha.nome;
const nomeCurto = ficha.apelido?.trim() || ficha.nome.trim().split(/\s+/)[0] || ficha.nome;
```

Passar `nomeCurto` para `Briefing`, mantendo `nome` no topo e no Rider. Trocar
o comentário e o heading do bloco de valores para `O que prioriza`.

- [ ] **Step 3: Run the focused test to verify GREEN**

Run:

```powershell
node --test tests/fichaTecnicaResultadoNeutralidade.test.mjs
```

Expected: all tests in the new contract pass.

### Task 4: Verificação completa e commit

**Files:**
- Verify: `public/ficha-tecnica/index.html`
- Verify: `src/data/perfilTextos.ts`
- Verify: `src/components/App/Time/FichaColaborador.tsx`
- Verify: `tests/fichaTecnicaResultadoNeutralidade.test.mjs`

- [ ] **Step 1: Run the ficha-focused regression set**

Run:

```powershell
npm test -- tests/fichaTecnicaResultadoNeutralidade.test.mjs tests/fichaTecnicaProfessorContract.test.mjs tests/fichaEmitirTokenContract.test.mjs
```

Expected: the pretest contracts and all ficha tests pass with zero failures.

- [ ] **Step 2: Build the frontend**

Run:

```powershell
npm run build
```

Expected: Vite exits with code 0.

- [ ] **Step 3: Check the patch**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only the planned files are changed.

- [ ] **Step 4: Commit**

```powershell
git add public/ficha-tecnica/index.html src/data/perfilTextos.ts src/components/App/Time/FichaColaborador.tsx tests/fichaTecnicaResultadoNeutralidade.test.mjs docs/superpowers/specs/2026-08-15-ficha-resultado-neutro-design.md docs/superpowers/plans/2026-08-15-ficha-resultado-neutro.md
git commit -m "fix(ficha): clarify result continuation and neutralize profile text"
```

Report the branch, commit hash, tests, build, and that no production deploy was
performed in this cycle.
