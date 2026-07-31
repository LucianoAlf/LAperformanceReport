export interface ResumoMatriculasAdmin {
  matriculasAtivas: number;
  matriculasBase: number;
  matriculasBanda: number;
  matriculasAdicionais: number;
  matriculasCoral: number;
  alunosComExatamente2Cursos: number;
  alunosComExatamente3Cursos: number;
  alunosCom4OuMaisCursos: number;
}

export type FaixaPoliticaTrancamento =
  | "contratual"
  | "extensao_gerencial"
  | "fora_da_politica"
  | "data_ausente";

export interface TrancamentoAdminItem {
  alunoNome: string;
  cursoNome: string | null;
  dataInicio: string | null;
  dataFinal: string | null;
  diasTrancado: number | null;
  faixaPolitica: FaixaPoliticaTrancamento;
  motivo: string | null;
}

export interface TrancamentosAdmin {
  totalAlunos: number;
  totalMatriculas: number;
  itens: TrancamentoAdminItem[];
}

const PRIORIDADE_TRANCAMENTO: Record<FaixaPoliticaTrancamento, number> = {
  fora_da_politica: 0,
  data_ausente: 1,
  extensao_gerencial: 2,
  contratual: 3,
};

const ROTULO_TRANCAMENTO: Record<FaixaPoliticaTrancamento, string> = {
  fora_da_politica: "FORA DA POLÍTICA",
  data_ausente: "DATA DE INÍCIO AUSENTE",
  extensao_gerencial: "EXTENSÃO GERENCIAL",
  contratual: "PERÍODO CONTRATUAL",
};

function dataPtBr(data: string | null): string {
  if (!data) return "Não informada";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : data;
}

export function parseDataReferenciaAdminBrt(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("DATA_REFERENCIA_ADMIN_INVALIDA");
  }

  const [ano, mes, dia] = value.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw new Error("DATA_REFERENCIA_ADMIN_INVALIDA");
  }

  return value;
}

export function formatarResumoMatriculasAdmin(
  resumo: ResumoMatriculasAdmin,
): string {
  const partes = [
    `${resumo.matriculasBase} base`,
    `${resumo.matriculasBanda} banda`,
    `${resumo.matriculasAdicionais} adicionais`,
  ];
  if (resumo.matriculasCoral > 0) {
    partes.push(`${resumo.matriculasCoral} coral`);
  }

  return [
    `• Matrículas Ativas: *${resumo.matriculasAtivas}* (${partes.join(" + ")})`,
    `• Matrículas em Banda: *${resumo.matriculasBanda}*`,
    `• Matrículas adicionais: *${resumo.matriculasAdicionais}*`,
    `- Alunos com 2 cursos: *${resumo.alunosComExatamente2Cursos}*`,
    `- Alunos com 3 cursos: *${resumo.alunosComExatamente3Cursos}*`,
    `- Alunos com 4 ou mais cursos: *${resumo.alunosCom4OuMaisCursos}*`,
    `• Alunos no Coral: *${resumo.matriculasCoral}*`,
  ].join("\n");
}

export function formatarTrancamentosAdmin(
  dados: TrancamentosAdmin,
): string {
  let texto = "⏸️ *TRANCAMENTOS ATUAIS";
  texto +=
    ` (${dados.totalAlunos} alunos / ${dados.totalMatriculas} matrículas)*\n`;
  texto += "━━━━━━━━━━━━━━━━━━━━━━\n";

  if (dados.itens.length === 0) {
    return `${texto}Nenhuma matrícula trancada no momento.`;
  }

  const itens = [...dados.itens].sort((a, b) => {
    const prioridade = PRIORIDADE_TRANCAMENTO[a.faixaPolitica] -
      PRIORIDADE_TRANCAMENTO[b.faixaPolitica];
    if (prioridade !== 0) return prioridade;
    return (b.diasTrancado ?? -1) - (a.diasTrancado ?? -1);
  });

  itens.forEach((item, index) => {
    texto += `${index + 1}) Nome: *${item.alunoNome}*\n`;
    texto += `   Curso: ${item.cursoNome || "Não informado"}\n`;
    texto += `   Início: ${dataPtBr(item.dataInicio)}\n`;
    texto += item.diasTrancado === null
      ? "   Tempo trancado: Não calculável\n"
      : `   Tempo trancado: *${item.diasTrancado} dias*\n`;
    texto += `   Retorno previsto: ${dataPtBr(item.dataFinal)}\n`;
    texto += `   Situação: *${ROTULO_TRANCAMENTO[item.faixaPolitica]}*\n`;
    texto += `   Motivo: ${item.motivo || "Não informado"}\n\n`;
  });

  return texto.trimEnd();
}
