/// <reference lib="deno.ns" />

// Edge temporaria, estritamente somente leitura, para auditar a fotografia
// completa do Emusys antes de aplicar a reconciliação de grade em produção.
// O token é efêmero e esta versão será invalidada por novo deploy logo após a
// prévia; expiração não é, por si só, consumo atômico de uso único.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AlunoNaAulaEmusys,
  buscarPaginaAulasEmusys,
  buscarTodasAulasEmusys,
} from "../_shared/emusys-aulas.ts";
import { montarSnapshotGradeEmusys } from "../_shared/reconciliacao-grade-snapshot.ts";
import {
  type AulaLocalParaPrevisualizacao,
  type PresencaParaPrevisualizacao,
  previsualizarReconciliacaoGrade,
  type VinculoLocalParaPrevisualizacao,
} from "../_shared/previsualizacao-reconciliacao-grade.ts";

const ESCOLA_ID_CAMPO_GRANDE = 39;
const UNIDADE_ID_CAMPO_GRANDE = "2ec861f6-023f-4d7b-9927-3960ad8c2a92";
// Previa concluida em 15/08/2026. Esta versao e deliberadamente inoperante:
// nao reintroduzir um token para repetir a fotografia sem nova autorizacao.
const PREVIEW_TOKEN_SHA256 =
  "0000000000000000000000000000000000000000000000000000000000000000";
const PREVIEW_TOKEN_EXPIRA_EM = "2000-01-01T00:00:00Z";
const MAX_PAGINAS_EMUSYS = 120;
const TIMEOUT_EMUSYS_MS = 30_000;
const LIMITE_ITENS_RETORNO = 1_000;
const TAMANHO_PAGINA_BANCO = 500;

const respostaHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

interface AulaEmusysPrevisualizacao extends Record<string, unknown> {
  id: number;
  categoria: string;
  data_hora_inicio: string;
  alunos: AlunoNaAulaEmusys[];
}

function json(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: respostaHeaders,
  });
}

function hojeBrt(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256(valor: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(valor),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function igualTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let indice = 0; indice < a.length; indice++) {
    diferenca |= a.charCodeAt(indice) ^ b.charCodeAt(indice);
  }
  return diferenca === 0;
}

async function autenticado(req: Request): Promise<boolean> {
  const expiraEm = new Date(PREVIEW_TOKEN_EXPIRA_EM).getTime();
  const token = req.headers.get("x-grade-preview-token");
  if (
    !Number.isFinite(expiraEm) || Date.now() > expiraEm || !token ||
    token.length !== 64
  ) {
    return false;
  }
  return igualTempoConstante(await sha256(token), PREVIEW_TOKEN_SHA256);
}

function chaveServiceRole(): string | null {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  return chave || null;
}

function numeroInteiro(valor: unknown): number | null {
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isSafeInteger(numero) ? numero : null;
}

function dataDaAula(aula: AulaEmusysPrevisualizacao): string {
  const data = typeof aula.data_hora_inicio === "string"
    ? aula.data_hora_inicio.slice(0, 10)
    : "";
  const dataVerificada = new Date(`${data}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
    Number.isNaN(dataVerificada.getTime()) ||
    dataVerificada.toISOString().slice(0, 10) !== data
  ) {
    throw new Error("FOTOGRAFIA_EMUSYS_DATA_INVALIDA");
  }
  return data;
}

function validarAulaFonte(aula: AulaEmusysPrevisualizacao): void {
  if (
    !Number.isSafeInteger(aula.id) ||
    aula.id <= 0 ||
    typeof aula.categoria !== "string" ||
    aula.categoria.length === 0
  ) {
    throw new Error("FOTOGRAFIA_EMUSYS_AULA_INVALIDA");
  }
  dataDaAula(aula);
  if (aula.categoria === "normal" && !Array.isArray(aula.alunos)) {
    throw new Error("FOTOGRAFIA_EMUSYS_ROSTER_AUSENTE");
  }
}

async function carregarFotografiaEmusys(
  token: string,
  dataInicio: string,
  dataFim: string,
): Promise<AulaEmusysPrevisualizacao[]> {
  let paginasLidas = 0;
  return await buscarTodasAulasEmusys<AulaEmusysPrevisualizacao>({
    dataInicio,
    dataFim,
    fetchPage: async ({ cursor, limite }) => {
      paginasLidas += 1;
      if (paginasLidas > MAX_PAGINAS_EMUSYS) {
        throw new Error("EMUSYS_AULAS_PAGINACAO_EXCEDIDA");
      }
      const pagina = await buscarPaginaAulasEmusys<AulaEmusysPrevisualizacao>({
        token,
        dataInicio,
        dataFim,
        cursor,
        limite,
        signal: AbortSignal.timeout(TIMEOUT_EMUSYS_MS),
      });
      pagina.items.forEach(validarAulaFonte);
      return pagina;
    },
  });
}

function dividirEmLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
    lotes.push(itens.slice(inicio, inicio + tamanho));
  }
  return lotes;
}

async function carregarAulasLocais(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  dataInicio: string,
  dataFim: string,
): Promise<AulaLocalParaPrevisualizacao[]> {
  const aulas: AulaLocalParaPrevisualizacao[] = [];
  for (let inicio = 0;; inicio += TAMANHO_PAGINA_BANCO) {
    const { data, error } = await supabase
      .from("aulas_emusys")
      .select("id, emusys_id")
      .eq("unidade_id", UNIDADE_ID_CAMPO_GRANDE)
      .eq("categoria", "normal")
      .not("cancelada", "is", "true")
      .gte("data_aula", dataInicio)
      .lte("data_aula", dataFim)
      .order("id")
      .range(inicio, inicio + TAMANHO_PAGINA_BANCO - 1);
    if (error) throw new Error("BANCO_AULAS_INDISPONIVEL");
    const pagina = Array.isArray(data) ? data : [];
    for (const registro of pagina) {
      const id = numeroInteiro(registro.id);
      const emusysId = numeroInteiro(registro.emusys_id);
      if (id === null || emusysId === null) {
        throw new Error("BANCO_AULAS_INVALIDO");
      }
      aulas.push({ id, emusys_id: emusysId });
    }
    if (pagina.length < TAMANHO_PAGINA_BANCO) return aulas;
  }
}

async function carregarVinculosLocais(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  aulas: AulaLocalParaPrevisualizacao[],
): Promise<VinculoLocalParaPrevisualizacao[]> {
  const vinculos: VinculoLocalParaPrevisualizacao[] = [];
  for (
    const lote of dividirEmLotes(
      aulas.map((aula) => aula.id),
      TAMANHO_PAGINA_BANCO,
    )
  ) {
    for (let inicio = 0;; inicio += TAMANHO_PAGINA_BANCO) {
      const { data, error } = await supabase
        .from("aula_alunos_emusys")
        .select("id, aula_emusys_id, aluno_id, aluno_emusys_id, aluno_chave")
        .eq("unidade_id", UNIDADE_ID_CAMPO_GRANDE)
        .in("aula_emusys_id", lote)
        .order("id")
        .range(inicio, inicio + TAMANHO_PAGINA_BANCO - 1);
      if (error) throw new Error("BANCO_VINCULOS_INDISPONIVEL");
      const pagina = Array.isArray(data) ? data : [];
      for (const registro of pagina) {
        const id = numeroInteiro(registro.id);
        const aulaEmusysId = numeroInteiro(registro.aula_emusys_id);
        const alunoId = registro.aluno_id === null
          ? null
          : numeroInteiro(registro.aluno_id);
        const alunoEmusysId = registro.aluno_emusys_id === null
          ? null
          : numeroInteiro(registro.aluno_emusys_id);
        if (
          id === null || aulaEmusysId === null ||
          alunoId === null && registro.aluno_id !== null ||
          alunoEmusysId === null && registro.aluno_emusys_id !== null ||
          typeof registro.aluno_chave !== "string"
        ) {
          throw new Error("BANCO_VINCULOS_INVALIDO");
        }
        vinculos.push({
          id,
          aula_emusys_id: aulaEmusysId,
          aluno_id: alunoId,
          aluno_emusys_id: alunoEmusysId,
          aluno_chave: registro.aluno_chave,
        });
      }
      if (pagina.length < TAMANHO_PAGINA_BANCO) break;
    }
  }
  return vinculos;
}

async function carregarPresencasLocais(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  aulas: AulaLocalParaPrevisualizacao[],
): Promise<PresencaParaPrevisualizacao[]> {
  const presencas: PresencaParaPrevisualizacao[] = [];
  for (
    const lote of dividirEmLotes(
      aulas.map((aula) => aula.id),
      TAMANHO_PAGINA_BANCO,
    )
  ) {
    for (let inicio = 0;; inicio += TAMANHO_PAGINA_BANCO) {
      const { data, error } = await supabase
        .from("aluno_presenca")
        .select(
          "aula_emusys_id, aluno_id, status, status_presenca, respondido_por",
        )
        .in("aula_emusys_id", lote)
        .order("aula_emusys_id")
        .order("aluno_id")
        .range(inicio, inicio + TAMANHO_PAGINA_BANCO - 1);
      if (error) throw new Error("BANCO_PRESENCAS_INDISPONIVEL");
      const pagina = Array.isArray(data) ? data : [];
      for (const registro of pagina) {
        const aulaEmusysId = numeroInteiro(registro.aula_emusys_id);
        const alunoId = numeroInteiro(registro.aluno_id);
        if (aulaEmusysId === null || alunoId === null) {
          throw new Error("BANCO_PRESENCAS_INVALIDO");
        }
        presencas.push({
          aula_emusys_id: aulaEmusysId,
          aluno_id: alunoId,
          status: typeof registro.status === "string" ? registro.status : null,
          status_presenca: typeof registro.status_presenca === "string"
            ? registro.status_presenca
            : null,
          respondido_por: typeof registro.respondido_por === "string"
            ? registro.respondido_por
            : null,
        });
      }
      if (pagina.length < TAMANHO_PAGINA_BANCO) break;
    }
  }
  return presencas;
}

function resumirItens<T>(itens: T[]) {
  return {
    total: itens.length,
    truncada: itens.length > LIMITE_ITENS_RETORNO,
    itens: itens.slice(0, LIMITE_ITENS_RETORNO),
  };
}

function somenteTotal(resumo: { total: number }) {
  return { total: resumo.total };
}

async function hashFotografiaCompleta(
  snapshot: Awaited<ReturnType<typeof montarSnapshotGradeEmusys>>,
): Promise<string> {
  return await sha256(JSON.stringify(snapshot));
}

async function hashEstadoLocal(params: {
  aulas: AulaLocalParaPrevisualizacao[];
  vinculos: VinculoLocalParaPrevisualizacao[];
  presencas: PresencaParaPrevisualizacao[];
}): Promise<string> {
  return await sha256(JSON.stringify({
    aulas: [...params.aulas].sort((a, b) => a.id - b.id),
    // A chave só entra na assinatura não reversível; nunca no payload ou log.
    vinculos: [...params.vinculos].sort((a, b) => a.id - b.id),
    presencas: [...params.presencas].sort((a, b) =>
      a.aula_emusys_id - b.aula_emusys_id || a.aluno_id - b.aluno_id
    ),
  }));
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ erro: "metodo_nao_permitido" }, 405);
  if (!await autenticado(req)) return json({ erro: "nao_autorizado" }, 401);

  let corpo: Record<string, unknown>;
  try {
    const recebido = await req.json();
    if (!recebido || typeof recebido !== "object" || Array.isArray(recebido)) {
      return json({ erro: "corpo_invalido" }, 400);
    }
    corpo = recebido as Record<string, unknown>;
  } catch {
    return json({ erro: "corpo_invalido" }, 400);
  }

  const escolaId = corpo.escola_id === undefined
    ? ESCOLA_ID_CAMPO_GRANDE
    : numeroInteiro(corpo.escola_id);
  const janelaDias = corpo.janela_dias === undefined
    ? 35
    : numeroInteiro(corpo.janela_dias);
  if (
    escolaId !== ESCOLA_ID_CAMPO_GRANDE || janelaDias === null ||
    janelaDias < 1 || janelaDias > 60
  ) {
    return json({ erro: "escopo_invalido" }, 400);
  }

  const chave = chaveServiceRole();
  const tokenEmusys = Deno.env.get("EMUSYS_TOKEN_CG")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!chave || !tokenEmusys || !supabaseUrl) {
    return json({ erro: "configuracao_indisponivel" }, 503);
  }

  const dataInicio = hojeBrt();
  const dataFim = somarDias(dataInicio, janelaDias);
  const leituraIniciadaEm = new Date().toISOString();

  try {
    const aulasBrutas = await carregarFotografiaEmusys(
      tokenEmusys,
      dataInicio,
      dataFim,
    );
    const aulasNormais = aulasBrutas.filter((aula) => {
      if (aula.categoria !== "normal") return false;
      const dataAula = dataDaAula(aula);
      return dataAula >= dataInicio && dataAula <= dataFim;
    });
    const snapshot = montarSnapshotGradeEmusys(aulasNormais, normalizarNome);
    if (snapshot.length === 0) {
      return json({
        success: false,
        status: "fotografia_sem_aulas_normais",
        escola_id: ESCOLA_ID_CAMPO_GRANDE,
        janela: { inicio: dataInicio, fim: dataFim },
      });
    }

    const supabase = createClient(supabaseUrl, chave);
    const aulas = await carregarAulasLocais(supabase, dataInicio, dataFim);
    const [vinculos, presencas] = await Promise.all([
      carregarVinculosLocais(supabase, aulas),
      carregarPresencasLocais(supabase, aulas),
    ]);
    const resultado = previsualizarReconciliacaoGrade({
      snapshot,
      aulas,
      vinculos,
      presencas,
    });
    const [fotografiaHash, estadoLocalHash] = await Promise.all([
      hashFotografiaCompleta(snapshot),
      hashEstadoLocal({ aulas, vinculos, presencas }),
    ]);
    const resumos = {
      candidatas: {
        aulas_cancelar: resumirItens(resultado.candidatas.aulas_cancelar),
        vinculos_remover: resumirItens(resultado.candidatas.vinculos_remover),
      },
      protegidas: {
        marcacao_fechada_aula: resumirItens(
          resultado.protegidas.marcacao_fechada_aula,
        ),
        marcacao_fechada_vinculo: resumirItens(
          resultado.protegidas.marcacao_fechada_vinculo,
        ),
        identidade_ambigua: resumirItens(
          resultado.protegidas.identidade_ambigua,
        ),
      },
    };
    const leituraConcluidaEm = new Date().toISOString();
    const base = {
      escola_id: ESCOLA_ID_CAMPO_GRANDE,
      unidade_id: UNIDADE_ID_CAMPO_GRANDE,
      gerado_em: leituraConcluidaEm,
      janela: { inicio: dataInicio, fim: dataFim, dias: janelaDias },
      regra_avaliada: "codigo_do_branch_pre_migration",
      fonte: {
        aulas_brutas: aulasBrutas.length,
        aulas_normais_agrupadas: snapshot.length,
        fotografia_completa_sha256: fotografiaHash,
      },
      local: {
        aulas_normais_ativas: aulas.length,
        vinculos_ativos: vinculos.length,
      },
      consistencia: {
        leitura_local_nao_transacional: true,
        leitura_iniciada_em: leituraIniciadaEm,
        leitura_concluida_em: leituraConcluidaEm,
        estado_local_sha256: estadoLocalHash,
      },
    };
    const truncada = Object.values(resumos.candidatas).some((resumo) =>
      resumo.truncada
    ) ||
      Object.values(resumos.protegidas).some((resumo) => resumo.truncada);

    if (truncada) {
      console.info(
        "[previsualizacao-grade] resultado nao auditavel sem escrita",
      );
      return json({
        success: false,
        status: "resultado_nao_auditavel_truncado",
        resultado_auditavel: false,
        ...base,
        candidatas: {
          aulas_cancelar: somenteTotal(resumos.candidatas.aulas_cancelar),
          vinculos_remover: somenteTotal(resumos.candidatas.vinculos_remover),
        },
        protegidas: {
          marcacao_fechada_aula: somenteTotal(
            resumos.protegidas.marcacao_fechada_aula,
          ),
          marcacao_fechada_vinculo: somenteTotal(
            resumos.protegidas.marcacao_fechada_vinculo,
          ),
          identidade_ambigua: somenteTotal(
            resumos.protegidas.identidade_ambigua,
          ),
        },
      });
    }

    console.info("[previsualizacao-grade] Campo Grande concluida sem escrita");
    return json({
      success: true,
      status: "ok",
      resultado_auditavel: true,
      ...base,
      ...resumos,
    });
  } catch {
    console.error("[previsualizacao-grade] falha sem alteracao");
    return json({ success: false, status: "falha_fonte_ou_banco" }, 503);
  }
});
