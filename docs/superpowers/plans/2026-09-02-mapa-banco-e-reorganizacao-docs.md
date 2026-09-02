# Mapa de banco e reorganização da documentação — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar do próprio banco a documentação de schema e de funções que hoje não existe, e redistribuir o mapa de sistema em oito domínios, fechando os buracos medidos em 02/09/2026.

**Architecture:** Um gerador Node lê o Postgres de produção e escreve arquivos `*.gerado.md` determinísticos. A lógica pura (classificação por domínio, cruzamento de consumidores, estado da função, formatação) fica em módulos separados e testados com `node --test` sem banco; só a coleta toca I/O. O conhecimento curado mora ao lado, em arquivo que o gerador nunca sobrescreve.

**Tech Stack:** Node 20+ ESM (`"type": "module"`), `pg` (devDependency nova), `node:test`, Supabase CLI (já instalada, v2.53.6) para os tipos TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-02-mapa-banco-e-reorganizacao-docs-design.md`

## Global Constraints

- **Idioma:** identificadores, comentários e saída em português (convenção do repo).
- **ESM obrigatório:** o `package.json` tem `"type": "module"`; usar `import`, nunca `require`.
- **Testes:** `node --test tests/<nome>.test.mjs`, padrão dos 370 testes existentes. Testes de lógica pura **não** conectam a banco algum.
- **Nenhum arquivo `*.gerado.md` é editado à mão** — todos abrem com o cabeçalho de aviso.
- **Saída determinística:** ordenação estável; arquivo só é reescrito quando o corpo muda.
- **O caminho `docs/MAPA-SISTEMA.md` não pode deixar de existir** — 30+ arquivos apontam para ele.
- **Os oito domínios** são exatamente: `aluno`, `comercial`, `professor`, `financeiro`, `gestao`, `operacao`, `plataforma`, `integracao` (mais o balde `outros`, que sempre gera aviso).
- **Credenciais:** lidas de `.env.local` (`SUPABASE_DB_HOST/PORT/USER/NAME/PASSWORD`). Nunca imprimir senha em log ou erro.

---

### Task 1: Classificação por domínio

**Files:**
- Create: `scripts/mapa-banco/areas.json`
- Create: `scripts/mapa-banco/dominios.mjs`
- Test: `tests/mapaBancoDominios.test.mjs`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `classificarDominio(nome: string): string` e `DOMINIOS: string[]`, usados pelas Tasks 4 e 5.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/mapaBancoDominios.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMINIOS, classificarDominio } from '../scripts/mapa-banco/dominios.mjs';

test('os oito dominios da spec estao declarados', () => {
  assert.deepEqual(DOMINIOS, [
    'aluno', 'comercial', 'professor', 'financeiro',
    'gestao', 'operacao', 'plataforma', 'integracao',
  ]);
});

test('classifica por prefixo', () => {
  assert.equal(classificarDominio('pesquisa_evasao_previews'), 'aluno');
  assert.equal(classificarDominio('leads_campanhas'), 'comercial');
  assert.equal(classificarDominio('fabio_registros_aula'), 'professor');
  assert.equal(classificarDominio('sol_caixa_lotes_v1'), 'financeiro');
  assert.equal(classificarDominio('loja_produtos'), 'operacao');
});

test('excecao nominal vence o prefixo', () => {
  // 'professores_experimentais' comeca com 'professor' mas e' materia comercial
  assert.equal(classificarDominio('professores_experimentais'), 'comercial');
});

test('prefixo mais longo vence o mais curto', () => {
  // 'alunos' -> aluno; 'alunos_emusys_atributos_divergencias' -> integracao
  assert.equal(classificarDominio('alunos'), 'aluno');
  assert.equal(classificarDominio('alunos_emusys_atributos_divergencias'), 'integracao');
});

test('objeto sem regra cai em outros', () => {
  assert.equal(classificarDominio('tabela_que_ninguem_mapeou'), 'outros');
});

test('view herda a regra da tabela (prefixo vw_ e ignorado)', () => {
  assert.equal(classificarDominio('vw_contratos_vencendo'), 'financeiro');
  assert.equal(classificarDominio('vw_jornada_aluno_atual'), 'aluno');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/mapaBancoDominios.test.mjs`
Expected: FAIL com `Cannot find module '../scripts/mapa-banco/dominios.mjs'`

- [ ] **Step 3: Criar o `areas.json`**

```json
{
  "_doc": "Classificacao de objetos do banco por dominio. 'prefixos' casa por inicio do nome (o mais longo vence). 'excecoes' casa o nome exato e vence qualquer prefixo. Objeto sem regra cai em 'outros' e o gerador avisa.",
  "prefixos": {
    "aluno": "aluno",
    "alunos": "aluno",
    "anamnese": "aluno",
    "anamneses": "aluno",
    "banda": "aluno",
    "pesquisa_evasao": "aluno",
    "pesquisas_whatsapp": "aluno",
    "risco_evasao": "aluno",
    "motivos_saida": "aluno",
    "motivos_trancamento": "aluno",
    "movimentacoes_admin": "aluno",
    "farmer": "aluno",
    "radar": "aluno",
    "lead": "comercial",
    "leads": "comercial",
    "crm": "comercial",
    "campanha": "comercial",
    "campanhas": "comercial",
    "canais_origem": "comercial",
    "conversas_campanha": "comercial",
    "mensagens_campanha": "comercial",
    "meta_ads": "comercial",
    "numeros_meta": "comercial",
    "templates_meta": "comercial",
    "motivos_nao_matricula": "comercial",
    "experimentais": "comercial",
    "professores_experimentais": "comercial",
    "agente": "comercial",
    "agentes": "comercial",
    "mila": "comercial",
    "transferencias_mila": "comercial",
    "contatos_bloqueados_campanha": "comercial",
    "respostas_rapidas_campanha": "comercial",
    "professor": "professor",
    "professores": "professor",
    "fabio": "professor",
    "aula": "professor",
    "aulas": "professor",
    "aulas_emusys": "professor",
    "turma": "professor",
    "turmas": "professor",
    "presenca": "professor",
    "health_score": "professor",
    "config_health_score": "professor",
    "la_teacher": "professor",
    "disponibilidade_professor": "professor",
    "programa_fideliza": "professor",
    "programa_matriculador": "professor",
    "caixa": "financeiro",
    "caixas": "financeiro",
    "sol_caixa": "financeiro",
    "emusys_faturas": "financeiro",
    "emusys_fatura": "financeiro",
    "financeiro": "financeiro",
    "fechamento": "financeiro",
    "historico_pagamentos": "financeiro",
    "formas_pagamento": "financeiro",
    "inadimplencia": "financeiro",
    "matriculas_campos_fixados": "financeiro",
    "dados_mensais": "gestao",
    "dados_comerciais": "gestao",
    "metas": "gestao",
    "meta": "gestao",
    "competencias": "gestao",
    "dashboard": "gestao",
    "insights": "gestao",
    "relatorios": "gestao",
    "simulacoes": "gestao",
    "projecao": "gestao",
    "bi": "gestao",
    "loja": "operacao",
    "inventario": "operacao",
    "projeto": "operacao",
    "projetos": "operacao",
    "salas": "operacao",
    "colaborador": "operacao",
    "colaboradores": "operacao",
    "staff_unidade": "operacao",
    "visitas": "operacao",
    "feriados": "operacao",
    "calendario_escolar": "operacao",
    "catalogo_treinamentos": "operacao",
    "planos_acao": "operacao",
    "horarios": "operacao",
    "usuario": "plataforma",
    "usuarios": "plataforma",
    "perfil": "plataforma",
    "perfis": "plataforma",
    "permissoes": "plataforma",
    "perfil_permissoes": "plataforma",
    "rbac": "plataforma",
    "audit_log": "plataforma",
    "auditoria": "plataforma",
    "sol_permissoes": "plataforma",
    "ficha_tokens": "plataforma",
    "emusys": "integracao",
    "whatsapp": "integracao",
    "admin_conversas": "integracao",
    "admin_mensagens": "integracao",
    "automacao": "integracao",
    "automacoes": "integracao",
    "notificacao": "integracao",
    "webhook": "integracao",
    "sync": "integracao",
    "fila": "integracao",
    "lia": "integracao",
    "integracao_tokens": "integracao",
    "base_conhecimento": "integracao",
    "boas_vindas": "integracao",
    "vcards_unidade": "integracao",
    "conversa_estado_whatsapp": "integracao",
    "hermes": "integracao",
    "orquestracao": "integracao"
  },
  "excecoes": {
    "professores_experimentais": "comercial",
    "alunos_emusys_atributos_decisoes": "integracao",
    "alunos_emusys_atributos_divergencias": "integracao",
    "matriculas_divergencias": "integracao",
    "matriculas_divergencias_decisoes": "integracao",
    "matriculas_emusys_decisoes_canonicas": "integracao",
    "unidades": "plataforma",
    "unidades_cursos": "plataforma",
    "unidade_contato_comercial": "comercial",
    "cursos": "operacao",
    "cursos_matriculados": "aluno",
    "curso_emusys_depara": "integracao",
    "tipos_matricula": "aluno",
    "tipos_saida": "aluno",
    "movimentacoes": "aluno"
  }
}
```

- [ ] **Step 4: Implementar `dominios.mjs`**

```javascript
// scripts/mapa-banco/dominios.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const areas = JSON.parse(fs.readFileSync(path.join(AQUI, 'areas.json'), 'utf8'));

export const DOMINIOS = [
  'aluno', 'comercial', 'professor', 'financeiro',
  'gestao', 'operacao', 'plataforma', 'integracao',
];

export const SEM_DOMINIO = 'outros';

// Prefixos ordenados do mais longo para o mais curto: 'alunos_emusys' precisa
// vencer 'alunos', senao a divergencia de sync viraria dominio de aluno.
const prefixosOrdenados = Object.entries(areas.prefixos)
  .sort(([a], [b]) => b.length - a.length);

function semPrefixoDeView(nome) {
  return nome.startsWith('vw_') ? nome.slice(3) : nome;
}

export function classificarDominio(nome) {
  const base = semPrefixoDeView(nome);
  if (areas.excecoes[base]) return areas.excecoes[base];
  if (areas.excecoes[nome]) return areas.excecoes[nome];
  for (const [prefixo, dominio] of prefixosOrdenados) {
    if (base === prefixo || base.startsWith(`${prefixo}_`)) return dominio;
  }
  return SEM_DOMINIO;
}
```

- [ ] **Step 5: Rodar o teste até passar**

Run: `node --test tests/mapaBancoDominios.test.mjs`
Expected: PASS nos 6 testes. Se `vw_contratos_vencendo` falhar, confira que o prefixo `contratos` não existe — ele cai por `outros`; nesse caso acrescente `"contratos": "financeiro"` em `prefixos` e rode de novo.

- [ ] **Step 6: Commit**

```bash
git add scripts/mapa-banco/areas.json scripts/mapa-banco/dominios.mjs tests/mapaBancoDominios.test.mjs
git commit -m "feat(mapa-banco): classificacao de objetos por dominio"
```

---

### Task 2: Cruzamento de consumidores

**Files:**
- Create: `scripts/mapa-banco/consumidores.mjs`
- Test: `tests/mapaBancoConsumidores.test.mjs`

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: `mapearConsumidores({ nomes, fontes }): Map<string, Array<{fonte, origem}>>`, usada pelas Tasks 3 e 5. `fontes` é `Array<{fonte: 'front'|'edge'|'funcao'|'view'|'cron'|'trigger', origem: string, texto: string}>`.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/mapaBancoConsumidores.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { mapearConsumidores } from '../scripts/mapa-banco/consumidores.mjs';

test('encontra chamada no front', () => {
  const mapa = mapearConsumidores({
    nomes: ['get_agenda_dia'],
    fontes: [{ fonte: 'front', origem: 'src/hooks/useAgenda.ts', texto: "supabase.rpc('get_agenda_dia', {})" }],
  });
  assert.deepEqual(mapa.get('get_agenda_dia'), [
    { fonte: 'front', origem: 'src/hooks/useAgenda.ts' },
  ]);
});

test('NAO casa nome que e prefixo de outro', () => {
  // 'get_kpis' nao pode ser dado como consumido so porque 'get_kpis_v2' aparece
  const mapa = mapearConsumidores({
    nomes: ['get_kpis', 'get_kpis_v2'],
    fontes: [{ fonte: 'front', origem: 'a.ts', texto: "supabase.rpc('get_kpis_v2')" }],
  });
  assert.deepEqual(mapa.get('get_kpis'), []);
  assert.equal(mapa.get('get_kpis_v2').length, 1);
});

test('funcao nao conta como consumidora de si mesma', () => {
  const mapa = mapearConsumidores({
    nomes: ['fn_x'],
    fontes: [{ fonte: 'funcao', origem: 'fn_x', texto: 'begin return fn_x(); end' }],
  });
  assert.deepEqual(mapa.get('fn_x'), []);
});

test('deduplica a mesma origem citada varias vezes', () => {
  const mapa = mapearConsumidores({
    nomes: ['fn_y'],
    fontes: [{ fonte: 'funcao', origem: 'fn_z', texto: 'select fn_y(); select fn_y();' }],
  });
  assert.equal(mapa.get('fn_y').length, 1);
});

test('acha nome dentro de comando de cron', () => {
  const mapa = mapearConsumidores({
    nomes: ['fn_enfileirar_relatorio_presenca'],
    fontes: [{ fonte: 'cron', origem: 'relatorio-presenca-pendencias-9h', texto: "select fn_enfileirar_relatorio_presenca();" }],
  });
  assert.equal(mapa.get('fn_enfileirar_relatorio_presenca')[0].fonte, 'cron');
});

test('nome ausente devolve lista vazia, nunca undefined', () => {
  const mapa = mapearConsumidores({ nomes: ['fn_orfa'], fontes: [] });
  assert.deepEqual(mapa.get('fn_orfa'), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/mapaBancoConsumidores.test.mjs`
Expected: FAIL com `Cannot find module`

- [ ] **Step 3: Implementar**

```javascript
// scripts/mapa-banco/consumidores.mjs

// Fronteira de identificador: o caractere antes e depois do nome nao pode ser
// parte de um identificador SQL/JS. Sem isso, 'get_kpis' casaria dentro de
// 'get_kpis_v2' e toda funcao antiga pareceria viva.
function ocorre(texto, nome) {
  const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escapado}([^A-Za-z0-9_]|$)`).test(texto);
}

export function mapearConsumidores({ nomes, fontes }) {
  const mapa = new Map(nomes.map((nome) => [nome, []]));
  for (const nome of nomes) {
    const vistos = new Set();
    for (const { fonte, origem, texto } of fontes) {
      // Uma funcao que menciona o proprio nome (recursao, RAISE) nao e consumidora.
      if (fonte === 'funcao' && origem === nome) continue;
      const chave = `${fonte}:${origem}`;
      if (vistos.has(chave)) continue;
      if (!ocorre(texto, nome)) continue;
      vistos.add(chave);
      mapa.get(nome).push({ fonte, origem });
    }
  }
  return mapa;
}
```

- [ ] **Step 4: Rodar até passar**

Run: `node --test tests/mapaBancoConsumidores.test.mjs`
Expected: PASS nos 6 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/mapa-banco/consumidores.mjs tests/mapaBancoConsumidores.test.mjs
git commit -m "feat(mapa-banco): cruzamento de consumidores com fronteira de identificador"
```

---

### Task 3: Estado das funções

**Files:**
- Create: `scripts/mapa-banco/estados.mjs`
- Test: `tests/mapaBancoEstados.test.mjs`

**Interfaces:**
- Consumes: formato de consumidores da Task 2.
- Produces: `classificarEstado(funcao, consumidores, todasAsFuncoes): { estado, anon, motivo }`, usada pela Task 4.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/mapaBancoEstados.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { classificarEstado, nomeBase } from '../scripts/mapa-banco/estados.mjs';

const nomes = ['get_x_v1', 'get_x_v3', 'get_y', 'fn_trg'];

test('com consumidor no front e ATIVA', () => {
  const r = classificarEstado({ nome: 'get_y', anon: false }, [{ fonte: 'front', origem: 'a.ts' }], nomes);
  assert.equal(r.estado, 'ATIVA');
});

test('so chamada por outra funcao e SO-INTERNA', () => {
  const r = classificarEstado({ nome: 'get_y', anon: false }, [{ fonte: 'funcao', origem: 'fn_z' }], nomes);
  assert.equal(r.estado, 'SO-INTERNA');
});

test('sem nenhum consumidor e ORFA', () => {
  const r = classificarEstado({ nome: 'get_y', anon: false }, [], nomes);
  assert.equal(r.estado, 'ORFA');
});

test('versao antiga com versao maior viva e LEGADO', () => {
  const r = classificarEstado({ nome: 'get_x_v1', anon: false }, [], nomes);
  assert.equal(r.estado, 'LEGADO');
  assert.match(r.motivo, /get_x_v3/);
});

test('LEGADO vence ORFA mas nao vence ATIVA', () => {
  const r = classificarEstado({ nome: 'get_x_v1', anon: false }, [{ fonte: 'front', origem: 'a.ts' }], nomes);
  assert.equal(r.estado, 'ATIVA');
  assert.match(r.motivo, /get_x_v3/);
});

test('flag anon e ortogonal ao estado', () => {
  const r = classificarEstado({ nome: 'get_y', anon: true }, [], nomes);
  assert.equal(r.estado, 'ORFA');
  assert.equal(r.anon, true);
});

test('nomeBase remove o sufixo de versao', () => {
  assert.equal(nomeBase('get_x_v12'), 'get_x');
  assert.equal(nomeBase('get_x'), 'get_x');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/mapaBancoEstados.test.mjs`
Expected: FAIL com `Cannot find module`

- [ ] **Step 3: Implementar**

```javascript
// scripts/mapa-banco/estados.mjs

export function nomeBase(nome) {
  return nome.replace(/_v\d+$/, '');
}

function versao(nome) {
  const m = nome.match(/_v(\d+)$/);
  return m ? Number(m[1]) : 0;
}

export function classificarEstado(funcao, consumidores, todasAsFuncoes) {
  const { nome, anon } = funcao;
  const base = nomeBase(nome);
  const minhaVersao = versao(nome);

  const maior = todasAsFuncoes
    .filter((outro) => outro !== nome && nomeBase(outro) === base)
    .filter((outro) => versao(outro) > minhaVersao)
    .sort((a, b) => versao(b) - versao(a))[0];

  const motivo = maior ? `existe versao maior: ${maior}` : '';

  if (consumidores.length === 0) {
    // LEGADO e mais informativo que ORFA: diz por que ninguem chama.
    return { estado: maior ? 'LEGADO' : 'ORFA', anon, motivo };
  }
  const soFuncao = consumidores.every((c) => c.fonte === 'funcao');
  return { estado: soFuncao ? 'SO-INTERNA' : 'ATIVA', anon, motivo };
}
```

- [ ] **Step 4: Rodar até passar**

Run: `node --test tests/mapaBancoEstados.test.mjs`
Expected: PASS nos 7 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/mapa-banco/estados.mjs tests/mapaBancoEstados.test.mjs
git commit -m "feat(mapa-banco): estado da funcao derivado de consumidor e versao"
```

---

### Task 4: Formatação determinística

**Files:**
- Create: `scripts/mapa-banco/formatar.mjs`
- Test: `tests/mapaBancoFormatar.test.mjs`

**Interfaces:**
- Consumes: `classificarDominio` (Task 1), `classificarEstado` (Task 3).
- Produces: `formatarTabelas(dados)`, `formatarFuncoes(dados)`, `formatarDetalhe(dominio, dados)`, `escreverSeMudou(caminho, corpo, meta)` — usadas pela Task 5. Todas devolvem string; só `escreverSeMudou` toca disco.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/mapaBancoFormatar.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatarTabelas, escreverSeMudou, CABECALHO_AVISO } from '../scripts/mapa-banco/formatar.mjs';

const dados = {
  tabelas: [
    { nome: 'alunos', tipo: 'tabela', dominio: 'aluno', colunas: 42, linhas: 1200, rls: true, policies: 3, fks: 4, comentario: 'Matriculas, nao pessoas' },
    { nome: 'vw_alunos_ativos', tipo: 'view', dominio: 'aluno', colunas: 12, linhas: null, rls: false, policies: 0, fks: 0, comentario: '' },
  ],
};

test('saida e identica para a mesma entrada', () => {
  assert.equal(formatarTabelas(dados), formatarTabelas(dados));
});

test('ordena por dominio e depois por nome, independente da ordem de entrada', () => {
  const invertido = { tabelas: [...dados.tabelas].reverse() };
  assert.equal(formatarTabelas(invertido), formatarTabelas(dados));
});

test('view sem contagem de linhas nao imprime zero enganoso', () => {
  const saida = formatarTabelas(dados);
  assert.match(saida, /vw_alunos_ativos.*\|\s*—\s*\|/);
  assert.doesNotMatch(saida, /vw_alunos_ativos.*\|\s*0\s*\|/);
});

test('escreverSeMudou nao reescreve quando o corpo e igual', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapa-'));
  const alvo = path.join(dir, 'x.gerado.md');
  escreverSeMudou(alvo, 'corpo', { ref: 'abc', data: '2026-09-02' });
  const antes = fs.statSync(alvo).mtimeMs;
  const mudou = escreverSeMudou(alvo, 'corpo', { ref: 'abc', data: '2026-09-99' });
  assert.equal(mudou, false);
  assert.equal(fs.statSync(alvo).mtimeMs, antes);
  assert.match(fs.readFileSync(alvo, 'utf8'), /2026-09-02/);
});

test('escreverSeMudou reescreve quando o corpo muda', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapa-'));
  const alvo = path.join(dir, 'x.gerado.md');
  escreverSeMudou(alvo, 'corpo A', { ref: 'abc', data: '2026-09-02' });
  const mudou = escreverSeMudou(alvo, 'corpo B', { ref: 'abc', data: '2026-09-03' });
  assert.equal(mudou, true);
  assert.match(fs.readFileSync(alvo, 'utf8'), /corpo B/);
  assert.match(fs.readFileSync(alvo, 'utf8'), /2026-09-03/);
});

test('todo arquivo gerado carrega o aviso de nao editar', () => {
  assert.match(CABECALHO_AVISO, /NÃO EDITE/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/mapaBancoFormatar.test.mjs`
Expected: FAIL com `Cannot find module`

- [ ] **Step 3: Implementar**

```javascript
// scripts/mapa-banco/formatar.mjs
import fs from 'node:fs';
import path from 'node:path';

export const CABECALHO_AVISO = 'GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.';

const SEPARADOR = '\n<!-- fim do cabecalho gerado -->\n';

function cabecalho({ ref, data }) {
  return `<!-- ${CABECALHO_AVISO}\n     Banco: ${ref} · Gerado em: ${data} -->\n`;
}

// A data no cabecalho tornaria todo arquivo sujo a cada execucao. Comparando so
// o corpo, arquivo sem mudanca conserva a data da ultima alteracao real.
export function escreverSeMudou(caminho, corpo, meta) {
  if (fs.existsSync(caminho)) {
    const atual = fs.readFileSync(caminho, 'utf8');
    const corpoAtual = atual.split(SEPARADOR).slice(1).join(SEPARADOR);
    if (corpoAtual === corpo) return false;
  }
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, cabecalho(meta) + SEPARADOR + corpo, 'utf8');
  return true;
}

function ordenar(itens) {
  return [...itens].sort((a, b) =>
    a.dominio.localeCompare(b.dominio, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function celulaLinhas(valor) {
  return valor === null || valor === undefined ? '—' : String(valor);
}

export function formatarTabelas(dados) {
  const linhas = [
    '# Tabelas e views',
    '',
    'Uma linha por objeto. Detalhe de colunas em `detalhe/<dominio>.md`.',
    '',
    '| Objeto | Tipo | Domínio | Colunas | Linhas | RLS | FKs | Comentário |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const t of ordenar(dados.tabelas)) {
    const rls = t.rls ? `sim (${t.policies})` : 'não';
    linhas.push(`| \`${t.nome}\` | ${t.tipo} | ${t.dominio} | ${t.colunas} | ${celulaLinhas(t.linhas)} | ${rls} | ${t.fks} | ${t.comentario || ''} |`);
  }
  return `${linhas.join('\n')}\n`;
}

export function formatarFuncoes(dados) {
  const linhas = [
    '# Funções',
    '',
    '`ÓRFÃ` é sinal, não veredito: n8n, scripts da VPS e chamadas diretas ao',
    'PostgREST não são visíveis para o gerador.',
    '',
  ];
  const porDominio = new Map();
  for (const f of ordenar(dados.funcoes)) {
    if (!porDominio.has(f.dominio)) porDominio.set(f.dominio, []);
    porDominio.get(f.dominio).push(f);
  }
  for (const [dominio, funcoes] of porDominio) {
    linhas.push(`## ${dominio}`, '', '| Função | Estado | Segurança | Consumidores |', '|---|---|---|---|');
    for (const f of funcoes) {
      const seguranca = [f.secdef ? 'DEFINER' : 'INVOKER', f.anon ? '🔓 anon' : ''].filter(Boolean).join(' · ');
      const consumidores = f.consumidores.length
        ? f.consumidores.map((c) => `${c.fonte}:${c.origem}`).join(', ')
        : (f.motivo || 'sem consumidor conhecido');
      linhas.push(`| \`${f.nome}(${f.args})\` | ${f.estado} | ${seguranca} | ${consumidores} |`);
    }
    linhas.push('');
  }
  return `${linhas.join('\n')}\n`;
}

export function formatarDetalhe(dominio, dados) {
  const linhas = [`# Detalhe do banco — ${dominio}`, ''];
  for (const t of ordenar(dados.tabelas).filter((t) => t.dominio === dominio)) {
    linhas.push(`## ${t.nome}`, '');
    if (t.comentario) linhas.push(`> ${t.comentario}`, '');
    linhas.push('| Coluna | Tipo | Nulo | Default | Referência |', '|---|---|---|---|---|');
    for (const c of t.detalheColunas) {
      linhas.push(`| \`${c.nome}\` | ${c.tipo} | ${c.nulo ? 'sim' : 'não'} | ${c.padrao || ''} | ${c.referencia || ''} |`);
    }
    linhas.push('');
    if (t.indicesUnicos.length) linhas.push(`**Únicos:** ${t.indicesUnicos.join(', ')}`, '');
    if (t.triggers.length) linhas.push(`**Triggers:** ${t.triggers.join(', ')}`, '');
  }
  return `${linhas.join('\n')}\n`;
}
```

- [ ] **Step 4: Rodar até passar**

Run: `node --test tests/mapaBancoFormatar.test.mjs`
Expected: PASS nos 6 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/mapa-banco/formatar.mjs tests/mapaBancoFormatar.test.mjs
git commit -m "feat(mapa-banco): formatacao deterministica e escrita condicional"
```

---

### Task 5: Coleta do banco e orquestração

**Files:**
- Create: `scripts/mapa-banco/consultas.mjs`
- Create: `scripts/gerar-mapa-banco.mjs`
- Create: `docs/banco/README.md`
- Modify: `package.json` (adicionar `pg` em devDependencies e o script `mapa:banco`)

**Interfaces:**
- Consumes: `classificarDominio` (T1), `mapearConsumidores` (T2), `classificarEstado` (T3), `formatar*`/`escreverSeMudou` (T4).
- Produces: os arquivos em `docs/banco/`.

- [ ] **Step 1: Instalar a dependência e declarar o script**

```bash
npm install --save-dev pg
npm pkg set scripts.mapa:banco="node scripts/gerar-mapa-banco.mjs"
```

- [ ] **Step 2: Escrever as consultas**

```javascript
// scripts/mapa-banco/consultas.mjs

export const SQL_TABELAS = `
select c.relname as nome,
       case c.relkind when 'r' then 'tabela' else 'view' end as tipo,
       c.relrowsecurity as rls,
       case when c.relkind = 'r' then greatest(c.reltuples, 0)::bigint else null end as linhas,
       coalesce(obj_description(c.oid), '') as comentario
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v')
order by c.relname`;

export const SQL_COLUNAS = `
select c.relname as tabela, a.attname as coluna,
       format_type(a.atttypid, a.atttypmod) as tipo,
       not a.attnotnull as nulo,
       coalesce(pg_get_expr(d.adbin, d.adrelid), '') as padrao,
       coalesce(col_description(c.oid, a.attnum), '') as comentario
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
where n.nspname = 'public' and c.relkind in ('r', 'v')
order by c.relname, a.attnum`;

export const SQL_FKS = `
select src.relname as tabela, att.attname as coluna,
       tgt.relname as ref_tabela, att2.attname as ref_coluna
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class tgt on tgt.oid = con.confrelid
join pg_namespace n on n.oid = src.relnamespace
join unnest(con.conkey) with ordinality as k(attnum, ord) on true
join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = k.ord
join pg_attribute att on att.attrelid = src.oid and att.attnum = k.attnum
join pg_attribute att2 on att2.attrelid = tgt.oid and att2.attnum = fk.attnum
where con.contype = 'f' and n.nspname = 'public'
order by src.relname, att.attname`;

export const SQL_POLICIES = `
select tablename as tabela, count(*)::int as total
from pg_policies where schemaname = 'public'
group by tablename`;

export const SQL_INDICES_UNICOS = `
select tablename as tabela, indexname as indice
from pg_indexes
where schemaname = 'public' and indexdef ilike 'create unique%'
order by tablename, indexname`;

export const SQL_TRIGGERS = `
select c.relname as tabela, t.tgname as trigger, p.proname as funcao
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and n.nspname = 'public'
order by c.relname, t.tgname`;

export const SQL_FUNCOES = `
select p.proname as nome,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as secdef,
       p.prorettype::regtype::text as retorno,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado,
       coalesce(p.prosrc, '') as corpo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname`;

export const SQL_VIEWS_DEF = `
select c.relname as nome, pg_get_viewdef(c.oid) as corpo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'`;

export const SQL_CRON = `select jobname, command, active from cron.job order by jobname`;
```

- [ ] **Step 3: Escrever o orquestrador**

```javascript
// scripts/gerar-mapa-banco.mjs
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DOMINIOS, SEM_DOMINIO, classificarDominio } from './mapa-banco/dominios.mjs';
import { mapearConsumidores } from './mapa-banco/consumidores.mjs';
import { classificarEstado } from './mapa-banco/estados.mjs';
import { escreverSeMudou, formatarDetalhe, formatarFuncoes, formatarTabelas } from './mapa-banco/formatar.mjs';
import * as Q from './mapa-banco/consultas.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'docs/banco');

function lerEnv() {
  const texto = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8');
  const pegar = (chave) => (texto.match(new RegExp(`^${chave}=(.*)$`, 'm')) || [, ''])[1].trim();
  return {
    host: pegar('SUPABASE_DB_HOST'),
    port: Number(pegar('SUPABASE_DB_PORT') || 5432),
    user: pegar('SUPABASE_DB_USER'),
    database: pegar('SUPABASE_DB_NAME'),
    password: pegar('SUPABASE_DB_PASSWORD'),
    ssl: { rejectUnauthorized: false },
  };
}

function poolerUrl() {
  const arquivo = path.join(RAIZ, 'supabase/.temp/pooler-url');
  return fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8').trim() : '';
}

async function conectar() {
  const direta = lerEnv();
  try {
    const cliente = new pg.Client(direta);
    await cliente.connect();
    return cliente;
  } catch (erro) {
    // A conexao direta em db.*.supabase.co pode ser IPv6-only. Nunca imprimir a senha.
    console.error(`[mapa-banco] conexao direta falhou em ${direta.host}:${direta.port} — ${erro.message}`);
    const url = poolerUrl();
    if (!url) throw new Error('sem pooler-url para tentar o fallback; abortando sem escrever arquivo');
    const cliente = new pg.Client({
      connectionString: url.replace('[YOUR-PASSWORD]', encodeURIComponent(direta.password)),
      ssl: { rejectUnauthorized: false },
    });
    await cliente.connect();
    console.error('[mapa-banco] usando o pooler');
    return cliente;
  }
}

async function main() {
  const cliente = await conectar();
  const q = async (sql) => (await cliente.query(sql)).rows;
  const [tabelas, colunas, fks, policies, unicos, triggers, funcoes, viewsDef, crons] = await Promise.all([
    q(Q.SQL_TABELAS), q(Q.SQL_COLUNAS), q(Q.SQL_FKS), q(Q.SQL_POLICIES),
    q(Q.SQL_INDICES_UNICOS), q(Q.SQL_TRIGGERS), q(Q.SQL_FUNCOES), q(Q.SQL_VIEWS_DEF), q(Q.SQL_CRON),
  ]);
  await cliente.end();

  const refDoBanco = lerEnv().host.split('.')[0].replace('db-', '').replace('db', '') || 'producao';
  const meta = { ref: refDoBanco, data: new Date().toISOString().slice(0, 10) };

  const fkPorTabela = new Map();
  for (const fk of fks) {
    if (!fkPorTabela.has(fk.tabela)) fkPorTabela.set(fk.tabela, []);
    fkPorTabela.get(fk.tabela).push(fk);
  }
  const policyPorTabela = new Map(policies.map((p) => [p.tabela, p.total]));
  const agrupar = (linhas, chave, valor) => {
    const m = new Map();
    for (const l of linhas) {
      if (!m.has(l[chave])) m.set(l[chave], []);
      m.get(l[chave]).push(valor(l));
    }
    return m;
  };
  const colunasPorTabela = agrupar(colunas, 'tabela', (c) => c);
  const unicosPorTabela = agrupar(unicos, 'tabela', (u) => u.indice);
  const triggersPorTabela = agrupar(triggers, 'tabela', (t) => `${t.trigger} → ${t.funcao}`);

  const avisos = [];
  const dadosTabelas = tabelas.map((t) => {
    const dominio = classificarDominio(t.nome);
    if (dominio === SEM_DOMINIO) avisos.push(`sem dominio: ${t.nome}`);
    const minhasColunas = colunasPorTabela.get(t.nome) || [];
    const minhasFks = fkPorTabela.get(t.nome) || [];
    const refDe = new Map(minhasFks.map((f) => [f.coluna, `${f.ref_tabela}.${f.ref_coluna}`]));
    return {
      nome: t.nome, tipo: t.tipo, dominio,
      colunas: minhasColunas.length,
      linhas: t.linhas === null ? null : Number(t.linhas),
      rls: t.rls, policies: policyPorTabela.get(t.nome) || 0,
      fks: minhasFks.length, comentario: t.comentario,
      detalheColunas: minhasColunas.map((c) => ({
        nome: c.coluna, tipo: c.tipo, nulo: c.nulo, padrao: c.padrao,
        referencia: refDe.get(c.coluna) || '',
      })),
      indicesUnicos: unicosPorTabela.get(t.nome) || [],
      triggers: triggersPorTabela.get(t.nome) || [],
    };
  });

  const fontes = [];
  const varrer = (dir, fonte, filtro) => {
    if (!fs.existsSync(dir)) return;
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!entrada.isFile() || !filtro.test(entrada.name)) continue;
      const completo = path.join(entrada.parentPath || entrada.path, entrada.name);
      fontes.push({ fonte, origem: path.relative(RAIZ, completo).replaceAll('\\', '/'), texto: fs.readFileSync(completo, 'utf8') });
    }
  };
  varrer(path.join(RAIZ, 'src'), 'front', /\.(ts|tsx)$/);
  varrer(path.join(RAIZ, 'supabase/functions'), 'edge', /\.ts$/);
  for (const f of funcoes) fontes.push({ fonte: 'funcao', origem: f.nome, texto: f.corpo });
  for (const v of viewsDef) fontes.push({ fonte: 'view', origem: v.nome, texto: v.corpo });
  for (const c of crons) fontes.push({ fonte: 'cron', origem: c.jobname, texto: c.command });
  for (const t of triggers) fontes.push({ fonte: 'trigger', origem: `${t.tabela}.${t.trigger}`, texto: t.funcao });

  const nomesFuncoes = [...new Set(funcoes.map((f) => f.nome))];
  const consumidoresPorNome = mapearConsumidores({ nomes: nomesFuncoes, fontes });

  const dadosFuncoes = funcoes.map((f) => {
    const dominio = classificarDominio(f.nome.replace(/^(get|fn|trg|app|sol)_/, ''));
    if (dominio === SEM_DOMINIO) avisos.push(`sem dominio: ${f.nome}()`);
    const consumidores = consumidoresPorNome.get(f.nome) || [];
    const { estado, anon, motivo } = classificarEstado({ nome: f.nome, anon: f.anon }, consumidores, nomesFuncoes);
    return { nome: f.nome, args: f.args, dominio, secdef: f.secdef, anon, estado, motivo, consumidores };
  });

  const dados = { tabelas: dadosTabelas, funcoes: dadosFuncoes };
  let escritos = 0;
  if (escreverSeMudou(path.join(SAIDA, 'TABELAS.gerado.md'), formatarTabelas(dados), meta)) escritos += 1;
  if (escreverSeMudou(path.join(SAIDA, 'FUNCOES.gerado.md'), formatarFuncoes(dados), meta)) escritos += 1;
  for (const dominio of [...DOMINIOS, SEM_DOMINIO]) {
    const corpo = formatarDetalhe(dominio, dados);
    if (escreverSeMudou(path.join(SAIDA, 'detalhe', `${dominio}.md`), corpo, meta)) escritos += 1;
  }

  console.log(`[mapa-banco] ${dadosTabelas.length} tabelas/views, ${dadosFuncoes.length} funcoes, ${escritos} arquivos reescritos`);
  const orfas = dadosFuncoes.filter((f) => f.estado === 'ORFA').length;
  const anons = dadosFuncoes.filter((f) => f.anon).length;
  console.log(`[mapa-banco] orfas: ${orfas} · executaveis por anon: ${anons}`);
  if (avisos.length) {
    console.warn(`[mapa-banco] ${avisos.length} objeto(s) sem dominio — classifique em scripts/mapa-banco/areas.json:`);
    for (const aviso of avisos) console.warn(`  - ${aviso}`);
  }
}

main().catch((erro) => {
  console.error(`[mapa-banco] FALHOU: ${erro.message}`);
  process.exit(1);
});
```

- [ ] **Step 4: Rodar de verdade**

Run: `npm run mapa:banco`
Expected: imprime as contagens (500 tabelas/views, 1.185 funções) e a lista de objetos sem domínio. Se a conexão direta falhar, deve imprimir a linha `conexao direta falhou` e seguir pelo pooler — nunca escrever arquivo pela metade.

- [ ] **Step 5: Zerar os avisos de domínio**

Acrescente em `scripts/mapa-banco/areas.json` (`prefixos` ou `excecoes`) uma regra para cada objeto listado no aviso, e rode `npm run mapa:banco` de novo até a contagem de avisos ser 0.

- [ ] **Step 6: Provar o determinismo**

```bash
npm run mapa:banco && git add -A docs/banco && git commit -q -m "wip: primeira geracao"
npm run mapa:banco
git diff --stat -- docs/banco
```
Expected: `git diff` vazio na segunda execução.

- [ ] **Step 7: Escrever o `docs/banco/README.md`**

```markdown
# Mapa do banco

| Arquivo | O que é | Quem escreve |
|---|---|---|
| `TABELAS.gerado.md` | Uma linha por tabela/view | script |
| `FUNCOES.gerado.md` | Uma linha por função, com estado e consumidores | script |
| `detalhe/<dominio>.md` | Colunas, tipos, FK, únicos, triggers | script |
| `NOTAS.md` | Armadilhas e decisões | pessoas |

Regenerar: `npm run mapa:banco` (lê `.env.local`, conexão direta com fallback no pooler).

Rodar depois de qualquer migration. O gerador só reescreve arquivo cujo corpo
mudou, então `git diff` mostra exatamente o que o banco ganhou ou perdeu.

**`ÓRFÃ` é sinal, não veredito:** n8n, scripts da VPS e chamadas diretas ao
PostgREST não são visíveis para o gerador. Antes de apagar qualquer coisa,
confirme fora do repo.
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json scripts/ docs/banco/
git commit -m "feat(mapa-banco): gerador de schema e catalogo de funcoes"
```

---

### Task 6: NOTAS.md curado

**Files:**
- Create: `docs/banco/NOTAS.md`

**Interfaces:**
- Consumes: a saída real da Task 5 (contagens de órfãs, anon, legado).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Levantar os achados do gerador**

```bash
grep -c "🔓 anon" docs/banco/FUNCOES.gerado.md
grep -c "| ORFA |" docs/banco/FUNCOES.gerado.md
grep -c "| LEGADO |" docs/banco/FUNCOES.gerado.md
grep "| ORFA |" docs/banco/FUNCOES.gerado.md | grep "🔓 anon" | head -20
```

- [ ] **Step 2: Escrever o arquivo com os números reais**

Estrutura obrigatória (preencher com os números do Step 1, nunca com estimativa):

```markdown
# Notas do banco

O que um script não descobre. O fato mecânico está nos `*.gerado.md` ao lado.

> Armadilhas de regra de negócio continuam no `CLAUDE.md` e em `.claude/memory/`.
> Este arquivo não as duplica — registra o que saiu da leitura do próprio banco.

## Achados da varredura de 2026-09-02

### <N> funções executáveis por `anon`

<lista das que são ÓRFÃ + anon, que é a combinação mais perigosa: ninguém chama,
e qualquer um pode chamar>

A causa é o `ALTER DEFAULT PRIVILEGES` do schema `public`, descrito no
`CLAUDE.md`: recriar função reabre `EXECUTE` para `anon`, e `revoke ... from
public` não basta — precisa de `revoke execute ... from anon` nominal.

### <N> funções sem consumidor conhecido

Sinal, não veredito — ver o aviso no `README.md`.

### <N> funções marcadas como LEGADO

Existe versão maior viva do mesmo nome-base.
```

- [ ] **Step 3: Commit**

```bash
git add docs/banco/NOTAS.md
git commit -m "docs(banco): notas curadas com os achados da primeira varredura"
```

---

### Task 7: MAPA-SISTEMA dividido em domínios

**Files:**
- Create: `docs/sistema/aluno.md`, `comercial.md`, `professor.md`, `financeiro.md`, `gestao.md`, `operacao.md`, `plataforma.md`, `integracao.md`
- Modify: `docs/MAPA-SISTEMA.md` (vira índice)

**Interfaces:**
- Consumes: os oito domínios da Task 1.
- Produces: os caminhos `docs/sistema/<dominio>.md`, citados pela Task 8 e pelo `CLAUDE.md` na Task 10.

- [ ] **Step 1: Guardar o original para conferência**

```bash
cp docs/MAPA-SISTEMA.md /tmp/mapa-original.md
grep -c "" /tmp/mapa-original.md
```

- [ ] **Step 2: Distribuir as seções**

Cada seção `## ` do original vai para exatamente um arquivo, **com o texto
preservado na íntegra** (esta task redistribui, não reescreve):

| Seção do original | Destino |
|---|---|
| Alunos, Sucesso do Aluno, Retenção, Bandas | `aluno.md` |
| Comercial, Pré-Atendimento, Campanhas | `comercial.md` |
| Professores, Agenda, Health Score Professor V3 | `professor.md` |
| Administrativo, Fechamento mensal, Super Folha | `financeiro.md` |
| Dashboard, Gestão Mensal, Metas | `gestao.md` |
| Salas, Projetos, Automações, Entrada, Histórico | `operacao.md` |
| Config, Admin, Feedback do professor | `plataforma.md` |
| Apêndice — Edge functions por categoria | `integracao.md` |

Cada arquivo abre com:

```markdown
# Mapa do sistema — <domínio>

> Índice geral: [`docs/MAPA-SISTEMA.md`](../MAPA-SISTEMA.md) ·
> Banco: [`docs/banco/detalhe/<domínio>.md`](../banco/detalhe/<domínio>.md)
```

- [ ] **Step 3: Provar que nada se perdeu**

```bash
cat docs/sistema/*.md | grep -c "^### " ; grep -c "^### " /tmp/mapa-original.md
```
Expected: o total de subseções `###` nos oito arquivos é **igual ou maior** que
no original (maior só se a Task 8 já tiver acrescentado algo). Se for menor,
alguma seção foi perdida na distribuição — encontre e mova antes de seguir.

- [ ] **Step 4: Reescrever o `MAPA-SISTEMA.md` como índice**

```markdown
# Mapa do sistema

Por página: rota, componentes, hooks, RPCs e edge functions. Dividido por
domínio — o mesmo vocabulário do [mapa do banco](banco/README.md).

| Domínio | Rotas | Arquivo |
|---|---|---|
| aluno | `/app/alunos`, `/app/sucesso-aluno`, `/app/retencao`, `/app/bandas` | [sistema/aluno.md](sistema/aluno.md) |
| comercial | `/app/comercial`, `/app/pre-atendimento`, `/app/campanhas`, `/app/trafego-pago` | [sistema/comercial.md](sistema/comercial.md) |
| professor | `/app/professores`, `/app/agenda` | [sistema/professor.md](sistema/professor.md) |
| financeiro | `/app/administrativo`, `/app/faturas` | [sistema/financeiro.md](sistema/financeiro.md) |
| gestao | `/app`, `/app/gestao-mensal`, `/app/metas`, `/app/relatorios` | [sistema/gestao.md](sistema/gestao.md) |
| operacao | `/app/salas`, `/app/projetos`, `/app/time`, `/app/automacoes`, `/app/entrada/*` | [sistema/operacao.md](sistema/operacao.md) |
| plataforma | `/app/config`, `/app/admin/*`, `/feedback/:token` | [sistema/plataforma.md](sistema/plataforma.md) |
| integracao | edge functions e crons (sem rota própria) | [sistema/integracao.md](sistema/integracao.md) |
```

- [ ] **Step 5: Commit**

```bash
git add docs/MAPA-SISTEMA.md docs/sistema/
git commit -m "docs(sistema): divide o mapa em oito dominios, indice no caminho antigo"
```

---

### Task 8: Preencher os módulos, edges e crons ausentes

**Files:**
- Modify: `docs/sistema/comercial.md` (Tráfego Pago), `financeiro.md` (Faturas), `gestao.md` (Relatórios), `operacao.md` (Time, Spreadsheet), `plataforma.md` (AdminTools), `integracao.md` (24 edges + 12 crons)

**Interfaces:**
- Consumes: arquivos da Task 7.
- Produces: nada consumido adiante.

- [ ] **Step 1: Listar o que falta, do código**

```bash
for m in TrafegoPago FaturasAlunos AdminTools Spreadsheet Pages; do
  echo "== $m"; ls src/components/App/$m | head -8
done
grep -n "trafego-pago\|'faturas'\|'time'\|relatorios" src/router.tsx
```

- [ ] **Step 2: Levantar hooks, RPCs e edges de cada módulo**

```bash
for m in TrafegoPago FaturasAlunos AdminTools Spreadsheet; do
  echo "== $m"
  grep -rhoE "\.rpc\(\s*'[a-z0-9_]+'" src/components/App/$m | sort -u
  grep -rhoE "functions\.invoke\(\s*'[a-z0-9-]+'" src/components/App/$m | sort -u
done
```

- [ ] **Step 3: Escrever a seção de cada módulo**

Uma seção `### ` por rota, no arquivo do domínio, seguindo exatamente o formato
das seções que já existem (rota, componentes, hooks, RPCs, edges, armadilhas).

- [ ] **Step 4: Cobrir as 24 edges e os 12 crons órfãos em `integracao.md`**

As edges: `bi-agent-lamusic`, `caixa-financeiro-whatsapp`, `classificar-resposta-evasao`, `criar-sessao-feedback`, `deletar-mensagem-lead`, `editar-mensagem-lead`, `ficha-criar-pessoa`, `ficha-emitir-token`, `ficha-export`, `ficha-tecnica`, `lojinha-alerta-estoque`, `lojinha-enviar-comprovante`, `lojinha-relatorio-professor`, `lojinha-relatorio-vendas`, `monitor-saude-webhook`, `notificar-anamnese`, `perfil-professor`, `previsualizar-reconciliacao-grade-emusys`, `processar-conversa-evasao`, `reagir-mensagem`, `sync-students-studio`, `transcrever-audio`, `transcrever-mensagem-evasao`, `webhook-whatsapp-status`.

Os crons: `cleanup-job-run-details`, `cleanup-reconstrucao-professor-obsoleta`, `fabio-retomar-audio-experimental`, `financeiro-sync-anteriores-60m`, `financeiro-sync-atual-15m`, `financeiro-sync-backlog-2h`, `la-os-coletar-pg-cron`, `la-os-dead-man`, `monitor-saude-fabio`, `promover-periodos-professor-ativos-exatos`, `reconciliar-experimental-aulas`, `reconciliar-health-score-professor-v3-alertas`.

Para cada um: o que faz, o que dispara, e — no caso dos crons — o horário. Ler a
fonte antes de escrever (regra do `CLAUDE.md`: é proibido descrever automação de
memória ou por inferência do nome):

```bash
sed -n '1,60p' supabase/functions/<nome>/index.ts
```

E, para os crons, a definição real:

```sql
select jobname, schedule, command, active from cron.job where jobname = '<nome>';
```

- [ ] **Step 5: Conferir que os buracos fecharam**

```bash
for m in TrafegoPago FaturasAlunos AdminTools Spreadsheet Pages; do
  grep -rqi "$m" docs/sistema/ || echo "AINDA FALTA: $m"
done
```
Expected: nenhuma saída.

- [ ] **Step 6: Commit**

```bash
git add docs/sistema/
git commit -m "docs(sistema): cobre 5 modulos, 24 edges e 12 crons que nao estavam mapeados"
```

---

### Task 9: Regenerar o database.types.ts

**Files:**
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada consumido pelas outras tasks (independente de propósito).

- [ ] **Step 1: Medir o estado atual**

```bash
grep -c "Row: {" src/types/database.types.ts
npx tsc --noEmit 2>&1 | grep -c "error TS" || true
```
Anote os dois números — são a linha de base.

- [ ] **Step 2: Regenerar**

```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
grep -c "Row: {" src/types/database.types.ts
```
Expected: o segundo número passa de 11 para algo próximo de 500 (tabelas + views).

- [ ] **Step 3: Medir o delta**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS" || true
npx tsc --noEmit 2>&1 | grep "error TS" | head -20
```

- [ ] **Step 4: Decidir com o número na mão**

Se o total de erros **não subiu**: commitar junto. Se subiu, commitar assim
mesmo, **em commit isolado**, e relatar ao Hugo o número e os arquivos afetados —
a decisão de corrigir agora ou depois é dele. Não silenciar erro com `any` nem
reverter a geração sem avisar.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.types.ts
git commit -m "chore(types): regenera database.types.ts (11 -> 378 tabelas)"
```

---

### Task 10: Amarrar no CLAUDE.md e fechar a branch

**Files:**
- Modify: `CLAUDE.md`
- Create: `daily-notes/2026-09-02.md` (ou acrescentar seção, se já existir)

- [ ] **Step 1: Atualizar o bloco de referência rápida do `CLAUDE.md`**

No bloco `> **Referência rápida (consultar PRIMEIRO):**`, acrescentar:

```markdown
> - **[`docs/banco/README.md`](docs/banco/README.md)** — mapa do banco **gerado do próprio Postgres**: tabelas, views, colunas, FK, RLS e o catálogo das 1.185 funções com estado (ATIVA/SÓ-INTERNA/ÓRFÃ/LEGADO) e consumidores. Regenerar com `npm run mapa:banco` **depois de toda migration**. Armadilhas curadas em `docs/banco/NOTAS.md`.
```

E no mesmo bloco, ajustar a linha do `MAPA-SISTEMA.md` para dizer que ele agora
é índice de `docs/sistema/<dominio>.md`.

- [ ] **Step 2: Registrar no daily-note**

Seção `## Documentação: mapa de banco e divisão do mapa de sistema (~HHh BRT)`
com: o que foi medido (os números do levantamento), o que foi criado, e as
pendências que ficaram (migração das armadilhas do `CLAUDE.md` para o `NOTAS.md`;
`rules/` ainda inexistente; sem verificação no CI).

- [ ] **Step 3: Rodar a suíte que toca o que foi mexido**

```bash
node --test tests/mapaBancoDominios.test.mjs tests/mapaBancoConsumidores.test.mjs tests/mapaBancoEstados.test.mjs tests/mapaBancoFormatar.test.mjs
```
Expected: todos passam.

- [ ] **Step 4: Conferir o remoto antes de fechar**

```bash
git fetch origin
git rev-list --count HEAD..origin/main
git status --short
```
Se houver commits novos na `main`, rebasear ou mergear antes de abrir o PR.

- [ ] **Step 5: Commit, push e PR**

```bash
git add CLAUDE.md daily-notes/2026-09-02.md
git commit -m "docs: aponta o CLAUDE.md para o mapa de banco e registra a rodada"
git push -u origin docs/mapa-banco-e-reorganizacao
gh pr create --title "docs: mapa de banco gerado e mapa de sistema por dominio" --body "..."
```

- [ ] **Step 6: Mergear e apagar a branch**

Governança do repo: frente encerrada = merge feito. Não deixar PR aberto com
trabalho já aplicado.

```bash
gh pr merge --merge --delete-branch
```
