/**
 * PONTE GOOGLE APPS SCRIPT — Recitais LA Music (v2)
 *
 * Roda como a conta do Alf (dono das pastas). A edge recital-drive-sync envia
 * playbacks; a edge recital-sheets-sync usa as ACOES de planilha abaixo.
 *
 * ⚠️ DEPLOY: cole este arquivo inteiro sobre a versao atual do Apps Script
 * (script.google.com → projeto da ponte → Deploy → Manage deployments →
 * edit → New version). Sem a versao nova, a sheets-sync recebe
 * {ok:false, erro:'acao_desconhecida'}.
 *
 * O token mora em PropertiesService (chave RECITAL_TOKEN) ou pode ficar
 * hard-coded abaixo — a edge manda sempre o mesmo em `token`.
 *
 * Contrato:
 *   POST { token, ... }  sem `acao`      -> upload de playback (v1, mantido)
 *   POST { token, acao: 'garantir_pasta',    pastaPai, nome }        -> {ok,id,criada}
 *   POST { token, acao: 'garantir_planilha', pastaPai, nome }        -> {ok,id,criada}
 *   POST { token, acao: 'ler_aba',          planilha, aba }          -> {ok,linhas:[[..]]}
 *   POST { token, acao: 'reescrever_aba',   planilha, aba, linhas, proteger? } -> {ok}
 *   POST { token, acao: 'proteger_planilha', planilha }              -> {ok}
 *   POST { token, acao: 'compartilhar',     arquivo, emails[], papel } -> {ok, falhas[]}
 */

const PASTA_RAIZ_ID = '1s7pchXIKrzpwtCKyguZedG-VXd8ho2Re'; // Recitais LA Music 2026
const PROP_TOKEN = 'RECITAL_TOKEN';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const esperado = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN)
      || ''; // fallback: manter compat com token embutido se a v1 tinha
    if (!esperado || body.token !== esperado) {
      return saida({ ok: false, erro: 'token_invalido' });
    }

    // v1 (playback): sem `acao` -> upload, comportamento preservado
    if (!body.acao) return saida(uploadPlayback(body));

    switch (body.acao) {
      case 'garantir_pasta':     return saida(garantirPasta(body));
      case 'garantir_planilha':  return saida(garantirPlanilha(body));
      case 'ler_aba':            return saida(lerAba(body));
      case 'reescrever_aba':     return saida(reescreverAba(body));
      case 'proteger_planilha':  return saida(protegerPlanilha(body));
      case 'compartilhar':       return saida(compartilhar(body));
      default:                   return saida({ ok: false, erro: 'acao_desconhecida' });
    }
  } catch (err) {
    return saida({ ok: false, erro: String(err).slice(0, 300) });
  }
}

function saida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── v1: upload de playback (inalterado) ─────────────────────────────────────
function uploadPlayback(body) {
  const subpastas = body.subpastas || [];
  let pasta = DriveApp.getFolderById(PASTA_RAIZ_ID);
  for (const nome of subpastas) {
    const it = pasta.getFoldersByName(String(nome));
    pasta = it.hasNext() ? it.next() : pasta.createFolder(String(nome));
  }
  const blob = Utilities.newBlob(
    Utilities.base64Decode(body.conteudoBase64),
    body.tipo || 'application/octet-stream',
    String(body.nome || 'arquivo.bin')
  );
  // substitui arquivo de mesmo nome (idempotente)
  const antigos = pasta.getFilesByName(blob.getName());
  while (antigos.hasNext()) antigos.next().setTrashed(true);
  const f = pasta.createFile(blob);
  return { ok: true, id: f.getId(), url: f.getUrl() };
}

// ── v2: pastas e planilhas ──────────────────────────────────────────────────
function garantirPasta(body) {
  const pai = DriveApp.getFolderById(body.pastaPai || PASTA_RAIZ_ID);
  const it = pai.getFoldersByName(String(body.nome));
  if (it.hasNext()) return { ok: true, id: it.next().getId(), criada: false };
  return { ok: true, id: pai.createFolder(String(body.nome)).getId(), criada: true };
}

function garantirPlanilha(body) {
  const pai = DriveApp.getFolderById(body.pastaPai || PASTA_RAIZ_ID);
  const nome = String(body.nome);
  const it = pai.getFilesByName(nome);
  while (it.hasNext()) {
    const f = it.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return { ok: true, id: f.getId(), criada: false };
    }
  }
  const ss = SpreadsheetApp.create(nome);
  const arquivo = DriveApp.getFileById(ss.getId());
  arquivo.moveTo(pai);
  return { ok: true, id: ss.getId(), criada: true };
}

function lerAba(body) {
  const ss = SpreadsheetApp.openById(body.planilha);
  const aba = ss.getSheetByName(String(body.aba));
  if (!aba) return { ok: true, linhas: [] };
  const rng = aba.getDataRange();
  if (rng.isBlank()) return { ok: true, linhas: [] };
  return { ok: true, linhas: rng.getDisplayValues() };
}

function reescreverAba(body) {
  const ss = SpreadsheetApp.openById(body.planilha);
  const nomeAba = String(body.aba);
  let aba = ss.getSheetByName(nomeAba);
  if (!aba) aba = ss.insertSheet(nomeAba);
  aba.clearContents();
  // protecao antiga some junto se a aba era protegida; reaplicamos depois
  const linhas = body.linhas || [];
  if (linhas.length) {
    const cols = Math.max.apply(null, linhas.map(function (l) { return l.length; }));
    const normal = linhas.map(function (l) {
      const c = l.slice(); while (c.length < cols) c.push(''); return c;
    });
    aba.getRange(1, 1, normal.length, cols).setValues(normal);
    aba.getRange(1, 1, 1, cols).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  if (body.proteger) protegerAba_(aba);
  return { ok: true, linhas: linhas.length };
}

// So o DONO (a conta da ponte) edita. Equipe/professor tem share reader.
function protegerAba_(aba) {
  const existentes = aba.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (const p of existentes) p.remove();
  const protecao = aba.protect().setDescription('Espelho LA Report — edite no sistema');
  protecao.removeEditors(protecao.getEditors());
  // warningOnly=false: nem aviso de "tem certeza?" — a planilha e somente leitura
  return true;
}

function protegerPlanilha(body) {
  const ss = SpreadsheetApp.openById(body.planilha);
  for (const aba of ss.getSheets()) protegerAba_(aba);
  return { ok: true };
}

function compartilhar(body) {
  const arquivo = DriveApp.getFileById(body.arquivo);
  const papel = body.papel === 'writer' ? DriveApp.Permission.EDIT : DriveApp.Permission.VIEW;
  const falhas = [];
  for (const email of body.emails || []) {
    try {
      arquivo.addViewer(String(email).trim()); // Fase 1: sempre leitor
    } catch (err) {
      falhas.push({ email: email, erro: String(err).slice(0, 160) });
    }
  }
  return { ok: true, falhas: falhas };
}
