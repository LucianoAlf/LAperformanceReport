#!/usr/bin/env node
// Gera a migração de carga dos 11 blocos da base comercial A PARTIR dos
// arquivos aprovados em `docs/base-conhecimento-comercial/`.
//
// 🔴 POR QUE UM GERADOR E NÃO SQL ESCRITO À MÃO: o texto dos blocos é conteúdo
// aprovado pelo Alf, e a regra dele é "não reescreva, não resuma, não melhore".
// Transcrever 84 KB de markdown à mão para dentro de um INSERT é exatamente
// como se perde uma linha sem ninguém perceber — a mesma razão pela qual as
// funções grandes do banco são patcheadas por `pg_get_functiondef` + replace,
// nunca redigitadas. Aqui o arquivo é a fonte; a migração é derivada dele.
//
// O mapeamento para o schema é LOSSLESS: `titulo` = o H1 sem o `# `, `conteudo`
// = tudo depois do H1. Remontar `# ${titulo}\n${conteudo}` devolve o arquivo
// original byte a byte — e é preciso ser assim porque `get_base_conhecimento`
// já imprime `## {titulo}` antes do conteúdo; deixar o H1 dentro duplicaria o
// cabeçalho no texto que a Mila recebe.
//
//   node scripts/gerar-carga-base-comercial.mjs > supabase/migrations/<ts>_carga.sql
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'docs', 'base-conhecimento-comercial');

// ⚠️ `publico` é UM valor, e o índice do Alf lista dois em vários blocos
// ("comercial · liderança"). A regra que resolve isso está na RPC: `lideranca`
// enxerga `comercial` também. Então o bloco vai no público MAIS ABERTO em que
// ele é legítimo, e só é marcado `lideranca` quando NÃO pode chegar à
// consultora. Os blocos 8 e 11 são os que o Alf mandou blindar.
// 🔴 NENHUM bloco entra como `lead`: isso mudaria o prompt da Mila SDR, e a
// instrução foi explícita — "sem tocar na SDR".
const META = {
  'bloco-01-atendimento-bumerangue.md':        { publico: 'comercial', versao: '0.4' },
  'bloco-02-indicacao-la-talent.md':           { publico: 'comercial', versao: '0.2' },
  'bloco-03-experiencia-antes-durante-depois.md': { publico: 'comercial', versao: '0.2' },
  'bloco-04-objecoes.md':                      { publico: 'comercial', versao: '0.2' },
  'bloco-05-retomada-com-data.md':             { publico: 'comercial', versao: '0.1' },
  'bloco-06-campanha-e-corridinha.md':         { publico: 'lideranca', versao: '0.1' },
  'bloco-07-midia-paga.md':                    { publico: 'lideranca', versao: '0.1' },
  'bloco-08-lideranca-comercial.md':           { publico: 'lideranca', versao: '0.1' },
  'bloco-09-calendario-comercial.md':          { publico: 'lideranca', versao: '0.1' },
  'bloco-10-ex-aluno-reativacao.md':           { publico: 'comercial', versao: '0.1' },
  'bloco-11-pre-atendimento-mila-sdr.md':      { publico: 'lideranca', versao: '0.1' },
  // ⚠️ RECORTE do 11, decidido pelo Alf em 06/09: as regras de conduta de quem
  // recebe o bastao sao trabalho de consultor; o diagnostico do bot e as taxas
  // por unidade ficam com a lideranca. Bloco medido na mao de quem e medido
  // por ele vira cobranca, e a Mila e parceira.
  'bloco-12-lead-que-vem-do-bot.md':           { publico: 'comercial', versao: '0.1' },
};

const TAG = '$bloco_md$';   // conferido: não aparece em nenhum bloco

const linhas = [];
linhas.push(`-- CARGA DA BASE DE CONHECIMENTO COMERCIAL v1.0 — 11 blocos, PASSO 2.
--
-- ⚠️ ARQUIVO GERADO por \`scripts/gerar-carga-base-comercial.mjs\` a partir de
--    \`docs/base-conhecimento-comercial/bloco-*.md\`. Não editar o SQL à mão:
--    edite o markdown e gere de novo, senão a fonte e o banco divergem.
--
-- Conteúdo aprovado pelo Alf em 05/09/2026. Entram como **\`candidato\`**: a
-- Krissya é decisora "com Alf" e nada sai de candidato antes de ela ler
-- (passo 0 do plano de carga). \`get_base_conhecimento\` só devolve
-- \`aprovado\`, então **este INSERT não muda uma vírgula do que a Mila SDR
-- recebe hoje** — a prova está no bloco DO ao fim.
--
-- Idempotente por \`titulo\`: rodar de novo não duplica.`);

const arquivos = Object.keys(META);
let ordem = 100;
for (const nome of arquivos) {
  // ⚠️ NORMALIZA a quebra de linha do Windows. Com git no Windows o arquivo vem
  // com CRLF, e em 06/09 isso vazou para dentro do banco: os 11 blocos entraram
  // com carriage return e foi preciso um UPDATE de limpeza. O texto era o mesmo
  // (md5 confere depois de normalizar), mas conteúdo de produção não pode
  // depender do sistema operacional de quem gerou o arquivo.
  const bruto = fs.readFileSync(path.join(DIR, nome), 'utf8')
    .split(String.fromCharCode(13) + String.fromCharCode(10))
    .join(String.fromCharCode(10));
  const quebra = bruto.indexOf('\n');
  const h1 = bruto.slice(0, quebra).replace(/^#\s+/, '').trim();
  const conteudo = bruto.slice(quebra + 1).replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  if (!h1) throw new Error(`sem H1: ${nome}`);
  if (conteudo.includes(TAG)) throw new Error(`a tag de dollar-quote aparece em ${nome}`);
  const m = META[nome];
  linhas.push(`
-- ── ${nome} ──
insert into public.base_conhecimento_blocos
  (titulo, conteudo, unidade_id, ordem, ativo, publico, estado, versao)
select ${TAG}${h1}${TAG}, ${TAG}${conteudo}${TAG}, null, ${ordem}, true, '${m.publico}', 'candidato', '${m.versao}'
where not exists (
  select 1 from public.base_conhecimento_blocos where titulo = ${TAG}${h1}${TAG}
);`);
  ordem += 10;
}

linhas.push(`
-- ── prova: 11 candidatos entraram e a SDR não se mexeu ──────────────────────
do $carga$
declare v_novos int; v_lead int; v_texto text;
begin
  -- ⚠️ Conta TODOS os blocos comerciais, não só os candidatos: depois da 1ª
  -- carga eles viram 'aprovado', e um número fixo de candidatos quebraria a
  -- migration em qualquer rodada seguinte — foi o que aconteceu ao acrescentar
  -- o bloco 12 em 06/09. O total vem da contagem de arquivos, não de um número
  -- digitado, então bloco novo ajusta a trava sozinho.
  select count(*) into v_novos from public.base_conhecimento_blocos
   where publico in ('comercial', 'lideranca');
  if v_novos <> __TOTAL_BLOCOS__ then
    raise exception 'esperava __TOTAL_BLOCOS__ blocos comerciais, achei %', v_novos;
  end if;

  select count(*) into v_lead from public.base_conhecimento_blocos
   where publico = 'lead' and estado = 'aprovado' and ativo;
  if v_lead <> 4 then
    raise exception 'os 4 blocos da Mila SDR mudaram: achei %', v_lead;
  end if;

  -- O que a edge e a tela recebem tem de continuar sendo SO a SDR.
  select get_base_conhecimento(null) into v_texto;
  if position('Bloco 8' in v_texto) > 0 or position('Bloco 11' in v_texto) > 0
     or position('Bumerangue' in v_texto) > 0 then
    raise exception 'VAZAMENTO: bloco comercial/lideranca chegou na montagem da SDR';
  end if;

  raise notice 'carga ok: % blocos comerciais · SDR intacta (4 blocos, % chars)', v_novos, length(v_texto);
end $carga$;`);

// O total vem da CONTAGEM DE ARQUIVOS, não de um número digitado: acrescentar
// um bloco novo passa a ajustar a trava sozinho.
process.stdout.write(
  linhas.join('\n').split('__TOTAL_BLOCOS__').join(String(arquivos.length)) + '\n');
