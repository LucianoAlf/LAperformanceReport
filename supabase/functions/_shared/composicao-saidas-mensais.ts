/**
 * Como uma saída do mês é classificada, e quais delas entram na conta de alunos perdidos.
 *
 * Existe como módulo único porque o mesmo número é publicado por DOIS relatórios — o
 * administrativo do WhatsApp e o Gerencial com IA — e ainda vai para dentro do prompt da
 * IA. Cada um classificava por conta própria, e foi assim que o Gerencial passou meses
 * publicando "Total de saídas: 37" ao lado de um churn de 8,68% calculado sobre 29, no
 * mesmo bloco da tela (Recreio, ago/2026).
 *
 * REGRAS-DE-NEGOCIO §3.5 e §5: bolsista, atividade extra (banda/coral), 2º curso e
 * transferência ficam fora dos DOIS lados da conta. Continuam listados e visíveis — a
 * coordenação precisa saber que houve saída de banda; o que não pode é isso virar aluno
 * perdido no indicador.
 */

export type TipoSaida =
  | "interrompido"
  | "nao_renovou"
  | "interrompido_2_curso"
  | "interrompido_bolsista"
  | "interrompido_banda"
  | "transferencia";

/** Os quatro tipos que a regra da casa mantém fora do total. */
const FORA_DO_TOTAL: ReadonlySet<TipoSaida> = new Set<TipoSaida>([
  "interrompido_2_curso",
  "interrompido_bolsista",
  "interrompido_banda",
  "transferencia",
]);

export function classificarSaida(item: { tipo_evasao?: unknown }): TipoSaida {
  const tipo = String(item?.tipo_evasao ?? "").trim().toLocaleLowerCase("pt-BR");
  if (tipo.includes("nao_renov") || tipo.includes("não_renov")) return "nao_renovou";
  if (tipo.includes("2_curso") || tipo.includes("segundo")) return "interrompido_2_curso";
  if (tipo.includes("bols")) return "interrompido_bolsista";
  if (tipo.includes("banda")) return "interrompido_banda";
  if (tipo.includes("transfer")) return "transferencia";
  return "interrompido";
}

export function entraNoTotal(tipo: TipoSaida): boolean {
  return !FORA_DO_TOTAL.has(tipo);
}

export interface ComposicaoSaidas {
  interrompido: number;
  segundoCurso: number;
  bolsista: number;
  banda: number;
  transferencia: number;
  naoRenovacoes: number;
  /** O que a regra conta como saída: interrompidos + não renovações. */
  totalQueConta: number;
  /** Bolsista + atividade extra + 2º curso + transferência. */
  foraDoTotal: number;
  /** Soma bruta, sem recorte — o que `indicadores_retencao.total_evasoes` traz. */
  totalBruto: number;
  /** Divergências encontradas; vazio quando tudo fecha. Quem chama decide se loga. */
  avisos: string[];
}

/**
 * `evasoes` é a lista de saídas do mês; `naoRenovacoes` vem de um campo próprio do payload
 * porque as não-renovações são uma lista separada. Se a lista de evasões trouxer um item
 * classificado como não-renovação, ele NÃO é somado ao campo — seria contar a mesma pessoa
 * duas vezes; vira aviso, para o defeito aparecer em vez de virar número inflado.
 */
export function composicaoDeSaidas(
  evasoes: Array<{ tipo_evasao?: unknown }>,
  naoRenovacoes: number,
  totalBruto: number,
): ComposicaoSaidas {
  const quebra = {
    interrompido: 0,
    segundoCurso: 0,
    bolsista: 0,
    banda: 0,
    transferencia: 0,
  };
  let naoRenovacoesNaLista = 0;

  for (const item of evasoes ?? []) {
    switch (classificarSaida(item)) {
      case "interrompido_2_curso":
        quebra.segundoCurso += 1;
        break;
      case "interrompido_bolsista":
        quebra.bolsista += 1;
        break;
      case "interrompido_banda":
        quebra.banda += 1;
        break;
      case "transferencia":
        quebra.transferencia += 1;
        break;
      case "nao_renovou":
        naoRenovacoesNaLista += 1;
        break;
      default:
        quebra.interrompido += 1;
    }
  }

  const foraDoTotal = quebra.segundoCurso + quebra.bolsista + quebra.banda +
    quebra.transferencia;
  const totalQueConta = quebra.interrompido + naoRenovacoes;
  const avisos: string[] = [];

  if (naoRenovacoesNaLista > 0) {
    avisos.push(
      `lista de evasoes traz ${naoRenovacoesNaLista} nao-renovacao(oes); ` +
        `o total usa o campo (${naoRenovacoes}) para nao contar a mesma pessoa duas vezes`,
    );
  }
  if (totalQueConta + foraDoTotal !== totalBruto) {
    avisos.push(
      `composicao nao fecha com o total bruto: ${totalQueConta} + ${foraDoTotal} <> ${totalBruto}`,
    );
  }

  return { ...quebra, naoRenovacoes, totalQueConta, foraDoTotal, totalBruto, avisos };
}
