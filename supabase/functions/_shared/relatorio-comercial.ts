import {
  formatarDataHoraPublica,
  validarTextoPublicoRelatorio,
} from "./relatorio-publico.ts";

export interface ValorMedio {
  soma: number;
  denominador: number;
  media: number;
}

export interface TicketsMatriculas {
  parcelas: ValorMedio;
  passaportes: ValorMedio;
}

export interface TaxaExpMatInput {
  taxa: number | null;
  conversoes: number;
  denominador: number;
  pendencias: number;
}

export interface ProximaExperimental {
  snapshotAtivo: boolean;
  cancelada: boolean;
  situacao: "agendada" | "presente" | "faltou" | "cancelada" | "sem_status";
  dataAula: string;
  horarioAula: string | null;
  alunoNome: string;
  cursoNome: string;
  emusysAulaId?: number | string | null;
  participanteChave?: string | null;
}

export interface JanelaRelatorioComercialBrt {
  ano: number;
  mes: number;
  dia: number;
  data: string;
  dataGeracao: string;
  hora: string;
  instanteGeracao: string;
  dataInicioSnapshot: string;
  dataFimSnapshot: string;
  inicioDiaBRT: string;
  fimDiaBRTExclusivo: string;
}

function adicionarDiasIso(data: string, dias: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!match) throw new Error("DATA_REFERENCIA_COMERCIAL_INVALIDA");
  const valor = new Date(0);
  valor.setUTCHours(12, 0, 0, 0);
  valor.setUTCFullYear(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + dias,
  );
  return valor.toISOString().slice(0, 10);
}

function partesReferenciaBrt(dataReferencia: Date) {
  if (!Number.isFinite(dataReferencia.getTime())) {
    throw new Error("DATA_REFERENCIA_COMERCIAL_INVALIDA");
  }
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(dataReferencia);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value || "";
  const ano = Number(valor("year"));
  const mes = Number(valor("month"));
  const dia = Number(valor("day"));
  const hora = Number(valor("hour"));
  const minuto = Number(valor("minute"));
  if (![ano, mes, dia, hora, minuto].every(Number.isFinite)) {
    throw new Error("DATA_REFERENCIA_COMERCIAL_INVALIDA");
  }
  return {
    ano,
    mes,
    dia,
    data: `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${
      String(dia).padStart(2, "0")
    }`,
    hora: `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`,
  };
}

export function parseDataReferenciaComercialBrt(valor: unknown): string {
  if (typeof valor !== "string") {
    throw new Error("DATA_REFERENCIA_COMERCIAL_INVALIDA");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!match) throw new Error("DATA_REFERENCIA_COMERCIAL_INVALIDA");

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const calendario = new Date(0);
  calendario.setUTCHours(12, 0, 0, 0);
  calendario.setUTCFullYear(ano, mes - 1, dia);
  if (
    ano < 1 || calendario.getUTCFullYear() !== ano ||
    calendario.getUTCMonth() !== mes - 1 || calendario.getUTCDate() !== dia
  ) {
    throw new Error("DATA_REFERENCIA_COMERCIAL_INVALIDA");
  }

  return valor;
}

export function resolverJanelaRelatorioComercialBrt(
  dataReferencia?: string,
  instanteGeracao: Date = new Date(),
): JanelaRelatorioComercialBrt {
  const geracao = partesReferenciaBrt(instanteGeracao);
  const data = dataReferencia === undefined
    ? geracao.data
    : parseDataReferenciaComercialBrt(dataReferencia);
  const [ano, mes, dia] = data.split("-").map(Number);
  const inicioDia = inicioDiaNoFuso(data, "America/Sao_Paulo");
  const fimDia = inicioDiaNoFuso(
    adicionarDiasIso(data, 1),
    "America/Sao_Paulo",
  );
  return {
    ano,
    mes,
    dia,
    data,
    dataGeracao: geracao.data,
    hora: geracao.hora,
    instanteGeracao: instanteGeracao.toISOString(),
    dataInicioSnapshot: `${String(ano).padStart(4, "0")}-${
      String(mes).padStart(2, "0")
    }-01`,
    dataFimSnapshot: adicionarDiasIso(data, 7),
    inicioDiaBRT: inicioDia.toISOString(),
    fimDiaBRTExclusivo: fimDia.toISOString(),
  };
}

export function validarExecucaoSnapshotProximas(
  linhas: ReadonlyArray<{ snapshot_execucao_id?: unknown }>,
  execucaoEsperada: string,
): void {
  if (
    !execucaoEsperada ||
    linhas.some((linha) =>
      String(linha.snapshot_execucao_id || "") !== execucaoEsperada
    )
  ) {
    throw new Error("SNAPSHOT_EXPERIMENTAIS_RAW_DIVERGENTE");
  }
}

export type ValorMonetario = number | string | null | undefined;

export interface MatriculaDetalhadaRelatorio {
  data: string;
  aluno: string;
  idade?: number | null;
  curso: string;
  professor: string;
  professorExperimental: string;
  canal: string;
  hunter?: string | null;
  valorPassaporte: ValorMonetario;
  formaPagamentoPassaporte?: string | null;
  parcelas: ValorMonetario[];
  formaPagamentoParcelas?: string | null;
}

export interface RelatorioComercialDados {
  referencia: {
    data: string;
    dataGeracao: string;
    hora: string;
    instanteGeracao: string;
    fuso: "America/Sao_Paulo" | string;
  };
  unidade: { nome: string; hunter: string };
  dia: {
    leads: number;
    experimentaisPrevistas: number;
    experimentaisRealizadas: number;
    faltas: number;
    canceladas: number;
    visitas: number;
    matriculas: number;
    passaportes: number;
  };
  mes: {
    leads: number;
    experimentaisRealizadas: number;
    presencasVinculadas: number;
    faltas: number;
    matriculas: number;
  };
  metas: {
    leads: number;
    experimentais: number;
    matriculas: number;
    ticketParcelas: number;
  };
  tickets: TicketsMatriculas;
  conciliacao: TaxaExpMatInput;
  registrosHoje: {
    leads: number;
    experimentais: number;
    matriculas: number;
  };
  canais: Array<{ nome: string; quantidade: number }>;
  cursos: Array<{ nome: string; quantidade: number }>;
  proximas: ProximaExperimental[];
  alertas: string[];
  matriculasDetalhadas: MatriculaDetalhadaRelatorio[];
  snapshot: { atualizadoEm: string; status: string };
}

const FUSO_BRT = "America/Sao_Paulo";
const UM_DIA_MS = 24 * 60 * 60 * 1_000;
const MAX_CASAS_DECIMAIS = 18;
const MAX_DIGITOS_MONETARIOS = 40;

interface DecimalMonetario {
  unidades: bigint;
  escala: number;
}

function potenciaDez(expoente: number): bigint {
  return 10n ** BigInt(expoente);
}

function normalizarTextoMonetario(valor: string): string | null {
  const limpo = valor.trim().replace(/[^\d,.\-+]/g, "");
  if (!limpo) return null;
  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");
  let normalizado = limpo;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    const separadorDecimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const separadorMilhar = separadorDecimal === "," ? "." : ",";
    normalizado = limpo.split(separadorMilhar).join("");
    if (separadorDecimal === ",") normalizado = normalizado.replace(",", ".");
  } else if (ultimaVirgula >= 0) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if ((limpo.match(/\./g)?.length ?? 0) > 1) {
    const partes = limpo.split(".");
    const decimal = partes.pop();
    normalizado = `${partes.join("")}.${decimal}`;
  }
  return normalizado;
}

function criarDecimalMonetario(valor: ValorMonetario): DecimalMonetario | null {
  if (typeof valor === "number" && !Number.isFinite(valor)) return null;
  const canonico = typeof valor === "number"
    ? String(valor)
    : typeof valor === "string"
    ? normalizarTextoMonetario(valor)
    : null;
  if (!canonico) return null;

  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(canonico);
  if (!match) return null;
  const sinal = match[1] === "-" ? -1n : 1n;
  const inteiros = match[2];
  const fracao = match[3] ?? "";
  const expoente = Number(match[4] ?? 0);
  if (
    !Number.isInteger(expoente) || Math.abs(expoente) > MAX_DIGITOS_MONETARIOS
  ) {
    return null;
  }

  let digitos = `${inteiros}${fracao}`.replace(/^0+(?=\d)/, "");
  let escala = fracao.length - expoente;
  if (escala < 0) {
    digitos += "0".repeat(-escala);
    escala = 0;
  }
  if (
    escala > MAX_CASAS_DECIMAIS ||
    digitos.length > MAX_DIGITOS_MONETARIOS
  ) {
    return null;
  }

  let unidades = BigInt(digitos || "0") * sinal;
  while (escala > 0 && unidades % 10n === 0n) {
    unidades /= 10n;
    escala -= 1;
  }
  return { unidades, escala };
}

function somarDecimais(valores: DecimalMonetario[]): DecimalMonetario {
  if (valores.length === 0) return { unidades: 0n, escala: 0 };
  const escala = Math.max(...valores.map((valor) => valor.escala));
  const unidades = valores.reduce(
    (soma, valor) => soma + valor.unidades * potenciaDez(escala - valor.escala),
    0n,
  );
  return { unidades, escala };
}

function decimalParaNumero(valor: DecimalMonetario): number {
  const negativo = valor.unidades < 0n;
  const absoluto = (negativo ? -valor.unidades : valor.unidades).toString()
    .padStart(valor.escala + 1, "0");
  const texto = valor.escala > 0
    ? `${absoluto.slice(0, -valor.escala)}.${absoluto.slice(-valor.escala)}`
    : absoluto;
  const numero = Number(`${negativo ? "-" : ""}${texto}`);
  return Number.isFinite(numero) ? numero : 0;
}

function arredondarDecimalDuasCasas(
  valor: DecimalMonetario,
  divisor = 1n,
): number {
  if (divisor <= 0n) return 0;
  const denominador = potenciaDez(valor.escala) * divisor;
  const numerador = valor.unidades * 100n;
  const negativo = numerador < 0n;
  const absoluto = negativo ? -numerador : numerador;
  let centavos = absoluto / denominador;
  const resto = absoluto % denominador;
  if (resto * 2n >= denominador) centavos += 1n;
  const resultado = Number(negativo ? -centavos : centavos) / 100;
  return Number.isFinite(resultado) ? resultado : 0;
}

function numeroMonetario(valor: ValorMonetario): number {
  const decimal = criarDecimalMonetario(valor);
  return decimal ? decimalParaNumero(decimal) : 0;
}

function numeroPositivo(valor: ValorMonetario): number {
  const numero = numeroMonetario(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

function contagem(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

export function parcelasDoGrupo(matricula: {
  valor_parcela?: ValorMonetario;
  parcelas_relatorio?: ValorMonetario[] | null;
}): number {
  const parcelas = Array.isArray(matricula.parcelas_relatorio)
    ? matricula.parcelas_relatorio.map(criarDecimalMonetario).filter(
      (valor): valor is DecimalMonetario =>
        valor !== null && valor.unidades > 0n,
    )
    : [];

  return parcelas.length > 0
    ? decimalParaNumero(somarDecimais(parcelas))
    : numeroPositivo(matricula.valor_parcela);
}

export function passaporteDoGrupo(matricula: {
  valor_passaporte?: ValorMonetario;
  parcelas_relatorio?: ValorMonetario[] | null;
}): number {
  return numeroPositivo(matricula.valor_passaporte);
}

function calcularValorMedio(valores: ValorMonetario[]): ValorMedio {
  const elegiveis = valores.map(criarDecimalMonetario).filter(
    (valor): valor is DecimalMonetario => valor !== null && valor.unidades > 0n,
  );
  const somaBruta = somarDecimais(elegiveis);
  const denominador = elegiveis.length;

  return {
    soma: arredondarDecimalDuasCasas(somaBruta),
    denominador,
    media: denominador > 0
      ? arredondarDecimalDuasCasas(somaBruta, BigInt(denominador))
      : 0,
  };
}

export function calcularTicketsMatriculas(
  matriculas: Array<{
    valorParcela: ValorMonetario;
    valorPassaporte: ValorMonetario;
  }>,
): TicketsMatriculas {
  return {
    parcelas: calcularValorMedio(matriculas.map((item) => item.valorParcela)),
    passaportes: calcularValorMedio(
      matriculas.map((item) => item.valorPassaporte),
    ),
  };
}

interface PartesDataHora {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuso }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function partesNoFuso(instante: Date, fuso: string): PartesDataHora | null {
  if (!Number.isFinite(instante.getTime()) || !fusoValido(fuso)) return null;
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((item) => item.type === tipo)?.value ?? Number.NaN);
  const resultado = {
    ano: parte("year"),
    mes: parte("month"),
    dia: parte("day"),
    hora: parte("hour"),
    minuto: parte("minute"),
    segundo: parte("second"),
  };
  return Object.values(resultado).every(Number.isFinite) ? resultado : null;
}

function dataNoFuso(instante: Date, fuso: string): string | null {
  const partes = partesNoFuso(instante, fuso);
  if (!partes) return null;
  const mes = String(partes.mes).padStart(2, "0");
  const dia = String(partes.dia).padStart(2, "0");
  return `${partes.ano}-${mes}-${dia}`;
}

function dataValida(valor: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!match) return false;
  const [, ano, mes, dia] = match;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  return data.toISOString().slice(0, 10) === valor;
}

function horarioNormalizado(valor: string | null): string | null {
  if (!valor) return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor.trim());
  if (!match) return null;
  const hora = Number(match[1]);
  const minuto = Number(match[2]);
  const segundo = Number(match[3] ?? 0);
  if (hora > 23 || minuto > 59 || segundo > 59) return null;
  return `${match[1]}:${match[2]}:${String(segundo).padStart(2, "0")}`;
}

function instanteLocalNoFuso(
  data: string,
  horario: string,
  fuso: string,
): Date | null {
  if (!dataValida(data) || !fusoValido(fuso)) return null;
  const horaNormalizada = horarioNormalizado(horario);
  if (!horaNormalizada) return null;
  const [ano, mes, dia] = data.split("-").map(Number);
  const [hora, minuto, segundo] = horaNormalizada.split(":").map(Number);
  const alvo: PartesDataHora = { ano, mes, dia, hora, minuto, segundo };
  const palpiteUtc = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  const offsets = new Set<number>();

  for (const deslocamento of [-UM_DIA_MS, 0, UM_DIA_MS]) {
    const instantePalpite = new Date(palpiteUtc + deslocamento);
    const partes = partesNoFuso(instantePalpite, fuso);
    if (!partes) continue;
    const representadoComoUtc = Date.UTC(
      partes.ano,
      partes.mes - 1,
      partes.dia,
      partes.hora,
      partes.minuto,
      partes.segundo,
    );
    offsets.add(representadoComoUtc - instantePalpite.getTime());
  }

  const candidatos = [...offsets]
    .map((offset) => new Date(palpiteUtc - offset))
    .filter((candidato) => {
      const partes = partesNoFuso(candidato, fuso);
      return partes !== null && Object.entries(alvo).every(
        ([chave, valor]) => partes[chave as keyof PartesDataHora] === valor,
      );
    })
    .sort((a, b) => a.getTime() - b.getTime());
  return candidatos[0] ?? null;
}

function inicioDiaNoFuso(data: string, fuso: string): Date {
  for (let hora = 0; hora <= 5; hora += 1) {
    const instante = instanteLocalNoFuso(
      data,
      String(hora).padStart(2, "0") + ":00:00",
      fuso,
    );
    if (instante) return instante;
  }
  throw new Error("DATA_REFERENCIA_COMERCIAL_INVALIDA");
}

function instanteExperimental(
  linha: ProximaExperimental,
  dataGeracaoLocal: string,
  fuso: string,
): number | null {
  if (!dataValida(linha.dataAula)) return null;
  const horario = horarioNormalizado(linha.horarioAula);
  if (!horario && linha.horarioAula) return null;
  if (!horario && linha.dataAula === dataGeracaoLocal) return null;

  return instanteLocalNoFuso(
    linha.dataAula,
    horario ?? "00:00:00",
    fuso,
  )?.getTime() ?? null;
}

export function selecionarProximasExperimentais(
  linhas: ProximaExperimental[],
  instanteGeracao: Date,
  limite = 10,
  fuso = FUSO_BRT,
): { itens: ProximaExperimental[]; excedentes: number } {
  const diaGeracao = dataNoFuso(instanteGeracao, fuso);
  if (!diaGeracao) {
    return { itens: [], excedentes: 0 };
  }

  const inicio = instanteGeracao.getTime();
  const fim = inicio + (7 * UM_DIA_MS);
  const vistos = new Set<string>();
  const elegiveis = linhas.filter((linha) => {
    if (
      !linha.snapshotAtivo || linha.cancelada || linha.situacao !== "agendada"
    ) {
      return false;
    }
    const instante = instanteExperimental(linha, diaGeracao, fuso);
    if (instante === null || instante <= inicio || instante > fim) return false;

    const aulaId = String(linha.emusysAulaId ?? "").trim();
    const participante = String(linha.participanteChave ?? "").trim();
    if (aulaId && aulaId !== "0" && participante) {
      const chave = `${aulaId}|${participante}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
    }
    return true;
  }).sort((a, b) => {
    const porData = a.dataAula.localeCompare(b.dataAula);
    if (porData !== 0) return porData;
    const porHorario = (horarioNormalizado(a.horarioAula) ?? "00:00:00")
      .localeCompare(horarioNormalizado(b.horarioAula) ?? "00:00:00");
    if (porHorario !== 0) return porHorario;
    return a.alunoNome.localeCompare(b.alunoNome, "pt-BR", {
      sensitivity: "base",
    });
  });

  const limiteSeguro = Number.isInteger(limite) && limite >= 0 ? limite : 10;
  return {
    itens: elegiveis.slice(0, limiteSeguro),
    excedentes: Math.max(0, elegiveis.length - limiteSeguro),
  };
}

function formatarPercentual(valor: number): string {
  const seguro = Number.isFinite(valor) ? valor : 0;
  return seguro.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatarTaxaExpMatDiaria(input: TaxaExpMatInput): string {
  const denominador = Number.isFinite(input.denominador)
    ? Math.max(0, Math.trunc(input.denominador))
    : 0;
  const conversoes = Number.isFinite(input.conversoes)
    ? Math.max(0, Math.trunc(input.conversoes))
    : 0;
  const pendencias = Number.isFinite(input.pendencias)
    ? Math.max(0, Math.trunc(input.pendencias))
    : 0;
  const aviso = pendencias > 0
    ? ` — ⚠️ ${pendencias} ${
      pendencias === 1 ? "pendência" : "pendências"
    } em auditoria`
    : "";

  if (denominador === 0) return `*SEM BASE*${aviso}`;

  const taxaInformada = input.taxa === null ? Number.NaN : Number(input.taxa);
  const taxa = Number.isFinite(taxaInformada)
    ? taxaInformada
    : (conversoes / denominador) * 100;
  return `*${
    formatarPercentual(taxa)
  }%* (${conversoes}/${denominador})${aviso}`;
}

function moeda(valor: ValorMonetario): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numeroMonetario(valor)).replace(/\u00a0/g, " ");
}

function percentualFracao(numerador: number, denominador: number): string {
  const den = contagem(denominador);
  if (den === 0) return "*SEM BASE*";
  const num = contagem(numerador);
  return `*${formatarPercentual((num / den) * 100)}%* (${num}/${den})`;
}

function textoSeguro(valor: unknown, fallback = ""): string {
  const semControles = String(valor ?? "").replace(
    // deno-lint-ignore no-control-regex -- controles sao o alvo da limpeza
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g,
    "",
  );
  const texto = semControles
    .replace(/[\t\r\n\u2028\u2029]/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/gu, " ")
    .trim();
  return texto || fallback;
}

function dataExtenso(data: string): string {
  if (!dataValida(data)) return textoSeguro(data, "Data inválida");
  const [ano, mes, dia] = data.split("-").map(Number);
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${dia}/${meses[mes - 1]}/${ano}`;
}

function dataCurta(data: string): string {
  if (!dataValida(data)) return textoSeguro(data, "Data inválida");
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function instanteReferencia(dados: RelatorioComercialDados): Date {
  if (
    dados.referencia.fuso !== FUSO_BRT ||
    !fusoValido(dados.referencia.fuso)
  ) {
    throw new Error("Fuso horário inválido");
  }
  if (
    !dataValida(dados.referencia.data) ||
    !dataValida(dados.referencia.dataGeracao) ||
    !horarioNormalizado(dados.referencia.hora)
  ) {
    throw new Error("Referência temporal inválida");
  }
  const instante = new Date(dados.referencia.instanteGeracao);
  const partes = partesNoFuso(instante, dados.referencia.fuso);
  const horaLocal = partes
    ? String(partes.hora).padStart(2, "0") + ":" +
      String(partes.minuto).padStart(2, "0")
    : "";
  if (
    !Number.isFinite(instante.getTime()) || !partes ||
    dataNoFuso(instante, dados.referencia.fuso) !==
      dados.referencia.dataGeracao ||
    horaLocal !== dados.referencia.hora
  ) {
    throw new Error("Referência temporal inválida");
  }
  return instante;
}

function snapshotEmBrt(valor: string, fuso: string): string {
  const instante = new Date(valor);
  if (!Number.isFinite(instante.getTime())) return "horário inválido";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso || FUSO_BRT,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")}/${parte("year")} às ${
    parte("hour")
  }:${parte("minute")}:${parte("second")}`;
}

function linhasRanking(
  itens: Array<{ nome: string; quantidade: number }>,
  vazio: string,
): string[] {
  if (itens.length === 0) return [vazio];
  return itens.map((item) =>
    `• ${textoSeguro(item.nome, "Não informado")}: *${
      contagem(item.quantidade)
    }*`
  );
}

function formatarParcelasDetalhe(
  matricula: MatriculaDetalhadaRelatorio,
): string {
  const parcelas = matricula.parcelas.map(numeroPositivo).filter((valor) =>
    valor > 0
  );
  if (parcelas.length === 0) return moeda(0);
  return parcelas.map(moeda).join(" + ");
}

function formatarDetalhes(
  matriculas: MatriculaDetalhadaRelatorio[],
  hunterPadrao: string,
): string[] {
  if (matriculas.length === 0) {
    return ["Nenhuma matrícula comercial no período"];
  }

  return matriculas.flatMap((matricula, indice) => {
    const idade = numeroPositivo(matricula.idade);
    const aluno = idade > 0
      ? `${textoSeguro(matricula.aluno, "Não informado")} (${idade} anos)`
      : textoSeguro(matricula.aluno, "Não informado");
    const passaportePagamento = matricula.formaPagamentoPassaporte
      ? ` (${textoSeguro(matricula.formaPagamentoPassaporte)})`
      : "";
    const parcelasPagamento = matricula.formaPagamentoParcelas
      ? ` (${textoSeguro(matricula.formaPagamentoParcelas)})`
      : "";
    return [
      `MAT. ${String(indice + 1).padStart(2, "0")}`,
      `📅 Data: ${dataCurta(matricula.data)}`,
      `👤 Aluno: ${aluno}`,
      `🎵 Curso: ${textoSeguro(matricula.curso, "Não informado")}`,
      `👨‍🏫 Professor: ${textoSeguro(matricula.professor, "Não informado")}`,
      `🎸 Prof. Experimental: ${
        textoSeguro(matricula.professorExperimental, "Não teve")
      }`,
      `📱 Canal: ${textoSeguro(matricula.canal, "Não informado")}`,
      `👤 Hunter: ${
        textoSeguro(matricula.hunter || hunterPadrao, "Comercial")
      }`,
      `💵 Pass: ${moeda(matricula.valorPassaporte)}${passaportePagamento}`,
      `💵 Parc: ${formatarParcelasDetalhe(matricula)}${parcelasPagamento}`,
      "",
    ];
  });
}

export function formatarRelatorioComercialDiario(
  dados: RelatorioComercialDados,
): string {
  const separador = "━━━━━━━━━━━━━━━━━━━━━━";
  const referencia = instanteReferencia(dados);
  const futuras = selecionarProximasExperimentais(
    dados.proximas,
    referencia,
    10,
    dados.referencia.fuso,
  );
  const linhasFuturas = futuras.itens.length > 0
    ? futuras.itens.map((item) => {
      const horario = horarioNormalizado(item.horarioAula)?.slice(0, 5);
      const quando = formatarDataHoraPublica(item.dataAula, horario);
      return `• ${quando}: ${
        textoSeguro(item.alunoNome, "Não informado")
      } — ${textoSeguro(item.cursoNome, "Não informado")}`;
    })
    : ["Nenhuma experimental futura no intervalo"];
  if (futuras.excedentes > 0) {
    linhasFuturas.push(`… e mais ${futuras.excedentes}`);
  }

  const alertas = dados.alertas.length > 0
    ? dados.alertas.map((alerta) =>
      `• ${textoSeguro(alerta, "Alerta sem descrição")}`
    )
    : ["Nenhum gap operacional identificado"];
  const unidadeNome = textoSeguro(dados.unidade.nome, "Unidade")
    .toLocaleUpperCase("pt-BR");
  const hunter = textoSeguro(dados.unidade.hunter, "Comercial");

  const texto = [
    separador,
    "📊 *RELATÓRIO DIÁRIO COMERCIAL*",
    `🏢 *${unidadeNome}*`,
    `📆 ${dataExtenso(dados.referencia.data)}`,
    `👤 ${hunter}`,
    separador,
    "",
    "⚡ *RESUMO DO DIA*",
    separador,
    `• Leads entrantes: *${contagem(dados.dia.leads)}*`,
    `• Experimentais previstas no dia: *${
      contagem(dados.dia.experimentaisPrevistas)
    }*`,
    `• Experimentais realizadas hoje: *${
      contagem(dados.dia.experimentaisRealizadas)
    }*`,
    `• Faltas hoje: *${contagem(dados.dia.faltas)}*`,
    `• Canceladas hoje: *${contagem(dados.dia.canceladas)}*`,
    `• Visitas: *${contagem(dados.dia.visitas)}*`,
    `• Matrículas comerciais: *${contagem(dados.dia.matriculas)}*`,
    `• Passaportes: *${moeda(dados.dia.passaportes)}*`,
    "",
    "📈 *MÊS ATÉ AGORA*",
    separador,
    `• Leads: *${contagem(dados.mes.leads)}* / meta ${
      contagem(dados.metas.leads)
    }`,
    `• Experimentais realizadas: *${
      contagem(dados.mes.experimentaisRealizadas)
    }* / meta ${contagem(dados.metas.experimentais)}`,
    `• Presença + vínculo confirmados: *${
      contagem(dados.mes.presencasVinculadas)
    }*`,
    `• Faltas: *${contagem(dados.mes.faltas)}*`,
    `• Matrículas: *${contagem(dados.mes.matriculas)}* / meta ${
      contagem(dados.metas.matriculas)
    }`,
    `• Ticket médio das parcelas: *${
      moeda(dados.tickets.parcelas.media)
    }* / meta ${moeda(dados.metas.ticketParcelas)}`,
    `• Ticket médio dos passaportes: *${
      moeda(dados.tickets.passaportes.media)
    }*`,
    "",
    "📊 *FUNIL DO MÊS*",
    separador,
    `• Lead → Experimental: ${
      percentualFracao(dados.mes.experimentaisRealizadas, dados.mes.leads)
    }`,
    `• Experimental → Matrícula: ${
      formatarTaxaExpMatDiaria(dados.conciliacao)
    }`,
    `• Lead → Matrícula: ${
      percentualFracao(dados.mes.matriculas, dados.mes.leads)
    }`,
    "",
    "📌 *REGISTROS CRIADOS HOJE*",
    separador,
    `• Leads registrados: *${contagem(dados.registrosHoje.leads)}*`,
    `• Agendamentos registrados hoje: *${
      contagem(dados.registrosHoje.experimentais)
    }*`,
    `• Matrículas registradas: *${contagem(dados.registrosHoje.matriculas)}*`,
    "",
    "📲 *TOP CANAIS E CURSOS DO DIA*",
    separador,
    "Canais:",
    ...linhasRanking(dados.canais, "Nenhum canal registrado hoje"),
    "Cursos:",
    ...linhasRanking(dados.cursos, "Nenhum curso registrado hoje"),
    "",
    "🗓️ *PRÓXIMAS EXPERIMENTAIS*",
    separador,
    ...linhasFuturas,
    "",
    "⚠️ *ALERTAS E CONCILIAÇÃO*",
    separador,
    ...alertas,
    "",
    "📝 *LISTA DETALHADA*",
    separador,
    ...formatarDetalhes(dados.matriculasDetalhadas, hunter),
    `📅 Informações atualizadas em: ${
      snapshotEmBrt(dados.snapshot.atualizadoEm, dados.referencia.fuso)
    }`,
    `📅 Relatório gerado em: ${
      dataCurta(dados.referencia.dataGeracao)
    } às ${dados.referencia.hora}`,
    separador,
  ].join("\n");

  return validarTextoPublicoRelatorio(texto);
}
