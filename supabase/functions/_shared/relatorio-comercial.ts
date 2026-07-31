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
}

export interface MatriculaDetalhadaRelatorio {
  data: string;
  aluno: string;
  idade?: number | null;
  curso: string;
  professor: string;
  professorExperimental: string;
  canal: string;
  hunter?: string | null;
  valorPassaporte: number;
  formaPagamentoPassaporte?: string | null;
  parcelas: number[];
  formaPagamentoParcelas?: string | null;
}

export interface RelatorioComercialDados {
  referencia: {
    data: string;
    hora: string;
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

function numeroPositivo(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

function arredondarDuasCasas(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function parcelasDoGrupo(matricula: {
  valor_parcela?: number | null;
  parcelas_relatorio?: number[] | null;
}): number {
  const parcelas = Array.isArray(matricula.parcelas_relatorio)
    ? matricula.parcelas_relatorio.map(numeroPositivo).filter((valor) =>
      valor > 0
    )
    : [];

  return arredondarDuasCasas(
    parcelas.length > 0
      ? parcelas.reduce((soma, valor) => soma + valor, 0)
      : numeroPositivo(matricula.valor_parcela),
  );
}

export function passaporteDoGrupo(matricula: {
  valor_passaporte?: number | null;
}): number {
  return arredondarDuasCasas(numeroPositivo(matricula.valor_passaporte));
}

function calcularValorMedio(valores: number[]): ValorMedio {
  const elegiveis = valores.map(numeroPositivo).filter((valor) => valor > 0);
  const soma = arredondarDuasCasas(
    elegiveis.reduce((total, valor) => total + valor, 0),
  );
  const denominador = elegiveis.length;

  return {
    soma,
    denominador,
    media: denominador > 0 ? arredondarDuasCasas(soma / denominador) : 0,
  };
}

export function calcularTicketsMatriculas(
  matriculas: Array<{ valorParcela: number; valorPassaporte: number }>,
): TicketsMatriculas {
  return {
    parcelas: calcularValorMedio(matriculas.map((item) => item.valorParcela)),
    passaportes: calcularValorMedio(
      matriculas.map((item) => item.valorPassaporte),
    ),
  };
}

function dataBrt(instante: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO_BRT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
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

function instanteExperimental(
  linha: ProximaExperimental,
  dataGeracaoBrt: string,
): number | null {
  if (!dataValida(linha.dataAula)) return null;
  const horario = horarioNormalizado(linha.horarioAula);
  if (!horario && linha.horarioAula) return null;
  if (!horario && linha.dataAula === dataGeracaoBrt) return null;

  // O contrato operacional usa datas locais do Emusys. BRT corresponde a UTC-03.
  const isoBrt = `${linha.dataAula}T${horario ?? "00:00:00"}-03:00`;
  const instante = Date.parse(isoBrt);
  return Number.isFinite(instante) ? instante : null;
}

function normalizarChave(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
    .toLocaleLowerCase("pt-BR");
}

export function selecionarProximasExperimentais(
  linhas: ProximaExperimental[],
  instanteGeracao: Date,
  limite = 10,
): { itens: ProximaExperimental[]; excedentes: number } {
  if (!Number.isFinite(instanteGeracao.getTime())) {
    return { itens: [], excedentes: 0 };
  }

  const inicio = instanteGeracao.getTime();
  const fim = inicio + (7 * UM_DIA_MS);
  const diaGeracao = dataBrt(instanteGeracao);
  const vistos = new Set<string>();
  const elegiveis = linhas.filter((linha) => {
    if (
      !linha.snapshotAtivo || linha.cancelada || linha.situacao !== "agendada"
    ) {
      return false;
    }
    const instante = instanteExperimental(linha, diaGeracao);
    if (instante === null || instante <= inicio || instante > fim) return false;

    const chave = [
      linha.dataAula,
      horarioNormalizado(linha.horarioAula) ?? "sem-horario",
      normalizarChave(linha.alunoNome),
      normalizarChave(linha.cursoNome),
    ].join("|");
    if (vistos.has(chave)) return false;
    vistos.add(chave);
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

  const taxaInformada = Number(input.taxa);
  const taxa = Number.isFinite(taxaInformada)
    ? taxaInformada
    : (conversoes / denominador) * 100;
  return `*${
    formatarPercentual(taxa)
  }%* (${conversoes}/${denominador})${aviso}`;
}

function moeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(valor) ? valor : 0).replace(/\u00a0/g, " ");
}

function percentualFracao(numerador: number, denominador: number): string {
  if (!Number.isFinite(denominador) || denominador <= 0) return "*SEM BASE*";
  const num = Number.isFinite(numerador) ? numerador : 0;
  return `*${
    formatarPercentual((num / denominador) * 100)
  }%* (${num}/${denominador})`;
}

function dataExtenso(data: string): string {
  if (!dataValida(data)) return data;
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
  if (!dataValida(data)) return data;
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function instanteReferencia(dados: RelatorioComercialDados): Date {
  const horario = horarioNormalizado(dados.referencia.hora) ?? "00:00:00";
  return new Date(`${dados.referencia.data}T${horario}-03:00`);
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
  return itens.map((item) => `• ${item.nome}: *${item.quantidade}*`);
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
      ? `${matricula.aluno} (${idade} anos)`
      : matricula.aluno;
    const passaportePagamento = matricula.formaPagamentoPassaporte
      ? ` (${matricula.formaPagamentoPassaporte})`
      : "";
    const parcelasPagamento = matricula.formaPagamentoParcelas
      ? ` (${matricula.formaPagamentoParcelas})`
      : "";
    return [
      `MAT. ${String(indice + 1).padStart(2, "0")}`,
      `📅 Data: ${dataCurta(matricula.data)}`,
      `👤 Aluno: ${aluno}`,
      `🎵 Curso: ${matricula.curso || "Não informado"}`,
      `👨‍🏫 Professor: ${matricula.professor || "Não informado"}`,
      `🎸 Prof. Experimental: ${matricula.professorExperimental || "Não teve"}`,
      `📱 Canal: ${matricula.canal || "Não informado"}`,
      `👤 Hunter: ${matricula.hunter || hunterPadrao}`,
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
  const futuras = selecionarProximasExperimentais(
    dados.proximas,
    instanteReferencia(dados),
  );
  const linhasFuturas = futuras.itens.length > 0
    ? futuras.itens.map((item) => {
      const horario = horarioNormalizado(item.horarioAula)?.slice(0, 5);
      return `• ${item.dataAula}${
        horario ? ` ${horario}` : ""
      }: ${item.alunoNome} — ${item.cursoNome}`;
    })
    : ["Nenhuma experimental futura no intervalo"];
  if (futuras.excedentes > 0) {
    linhasFuturas.push(`… e mais ${futuras.excedentes}`);
  }

  const alertas = dados.alertas.length > 0
    ? dados.alertas.map((alerta) => `• ${alerta}`)
    : ["Nenhum gap operacional identificado"];

  return [
    separador,
    "📊 *RELATÓRIO DIÁRIO COMERCIAL*",
    `🏢 *${dados.unidade.nome.toLocaleUpperCase("pt-BR")}*`,
    `📆 ${dataExtenso(dados.referencia.data)}`,
    `👤 ${dados.unidade.hunter}`,
    separador,
    "",
    "⚡ *RESUMO DO DIA*",
    separador,
    `• Leads entrantes: *${dados.dia.leads}*`,
    `• Experimentais previstas no dia: *${dados.dia.experimentaisPrevistas}*`,
    `• Experimentais realizadas hoje: *${dados.dia.experimentaisRealizadas}*`,
    `• Faltas hoje: *${dados.dia.faltas}*`,
    `• Canceladas hoje: *${dados.dia.canceladas}*`,
    `• Visitas: *${dados.dia.visitas}*`,
    `• Matrículas comerciais: *${dados.dia.matriculas}*`,
    `• Passaportes: *${moeda(dados.dia.passaportes)}*`,
    "",
    "📈 *MÊS ATÉ AGORA*",
    separador,
    `• Leads: *${dados.mes.leads}* / meta ${dados.metas.leads}`,
    `• Experimentais realizadas: *${dados.mes.experimentaisRealizadas}* / meta ${dados.metas.experimentais}`,
    `• Presença + vínculo confirmados: *${dados.mes.presencasVinculadas}*`,
    `• Faltas: *${dados.mes.faltas}*`,
    `• Matrículas: *${dados.mes.matriculas}* / meta ${dados.metas.matriculas}`,
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
    `• Leads registrados: *${dados.registrosHoje.leads}*`,
    `• Agendamentos registrados: *${dados.registrosHoje.experimentais}*`,
    `• Matrículas registradas: *${dados.registrosHoje.matriculas}*`,
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
    ...formatarDetalhes(dados.matriculasDetalhadas, dados.unidade.hunter),
    "🔎 *FONTES E SNAPSHOT*",
    separador,
    "• Fontes: get_kpis_comercial_canonicos_v2 + snapshot vigente GET /aulas + coorte detalhada de matrículas",
    `• Snapshot Emusys: ${dados.snapshot.status}`,
    `• Atualizado em: ${
      snapshotEmBrt(dados.snapshot.atualizadoEm, dados.referencia.fuso)
    }`,
    `• Gerado em: ${
      dataCurta(dados.referencia.data)
    } às ${dados.referencia.hora} (${dados.referencia.fuso})`,
    separador,
  ].join("\n");
}
