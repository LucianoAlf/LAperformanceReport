/**
 * Mensagem do botao "Atualizar faturas deste aluno" (caixa, LAPE-56).
 *
 * Toda resposta vira uma frase que a ADM entende e um tom. Nenhum desfecho fica
 * mudo: "nada novo" precisa dizer que a consulta rodou, senao parece que o
 * botao nao funcionou; e falha precisa dizer que NADA foi alterado.
 */

export type TomAvisoFaturas = 'sucesso' | 'info' | 'erro';

export interface AvisoFaturas {
  tom: TomAvisoFaturas;
  mensagem: string;
}

export interface FaturaResumoEmusys {
  emusys_fatura_id: string;
  descricao: string;
  competencia: string;
  status: string;
  valor_original: number;
  valor_pago: number | null;
}

export interface RespostaAtualizarFaturas {
  ok?: boolean;
  codigo?: string;
  erro?: string;
  retry_after_s?: number;
  total_emusys?: number;
  novas?: number;
  alteradas?: number;
  faturas_novas?: FaturaResumoEmusys[];
}

const reais = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

function descreverFatura(f: FaturaResumoEmusys) {
  const valor = f.valor_pago ?? f.valor_original;
  return `${f.descricao || `fatura ${f.emusys_fatura_id}`} (${reais(Number(valor))}, ${f.status})`;
}

/**
 * @param httpStatus status HTTP da resposta, quando houve (null = nem chegou a responder).
 * @param resposta corpo JSON devolvido pela edge, quando legivel.
 * @param erroRede mensagem de erro de rede/cliente, quando nao houve resposta.
 */
export function avisoDaAtualizacao(
  httpStatus: number | null,
  resposta: RespostaAtualizarFaturas | null,
  erroRede?: string | null,
): AvisoFaturas {
  if (resposta?.ok === true) {
    const novas = resposta.novas ?? 0;
    const alteradas = resposta.alteradas ?? 0;
    const total = resposta.total_emusys ?? 0;
    if (novas === 0 && alteradas === 0) {
      return {
        tom: 'info',
        mensagem: `Consultei o Emusys: nada novo para este aluno (${total} fatura${total === 1 ? '' : 's'}, todas ja estavam no Report).`,
      };
    }
    const partes: string[] = [];
    if (novas > 0) partes.push(`${novas} fatura${novas === 1 ? ' nova trazida' : 's novas trazidas'}`);
    if (alteradas > 0) partes.push(`${alteradas} atualizada${alteradas === 1 ? '' : 's'}`);
    const exemplos = (resposta.faturas_novas ?? []).slice(0, 3).map(descreverFatura);
    const sufixo = exemplos.length ? `: ${exemplos.join('; ')}${novas > exemplos.length ? '…' : ''}` : '';
    return { tom: 'sucesso', mensagem: `Emusys consultado — ${partes.join(' e ')}${sufixo}. Escolha na lista abaixo.` };
  }

  const codigo = resposta?.codigo ?? '';
  const detalhe = resposta?.erro ? ` (${resposta.erro})` : '';
  if (httpStatus === 429 || codigo === 'EMUSYS_LIMITE') {
    const espera = resposta?.retry_after_s && resposta.retry_after_s > 0 ? resposta.retry_after_s : 60;
    return {
      tom: 'erro',
      mensagem: `O Emusys esta limitando as consultas agora. Nada foi alterado — tente de novo em ${espera < 60 ? `${espera} segundos` : '1 minuto'}.`,
    };
  }
  if (httpStatus === 504 || codigo === 'EMUSYS_TIMEOUT') {
    return { tom: 'erro', mensagem: 'O Emusys nao respondeu a tempo. Nada foi alterado — tente de novo.' };
  }
  if (codigo === 'SEM_ID_EMUSYS') {
    return { tom: 'erro', mensagem: 'Este aluno nao tem vinculo com o Emusys, entao nao ha o que buscar.' };
  }
  if (httpStatus === 401) {
    return { tom: 'erro', mensagem: 'Sua sessao expirou. Entre de novo e tente outra vez.' };
  }
  if (httpStatus === 403 || codigo === 'ESCOPO' || codigo === 'ACESSO') {
    return { tom: 'erro', mensagem: `Voce nao tem permissao para atualizar faturas desta unidade${detalhe}.` };
  }
  if (codigo === 'GRAVACAO_FALHOU') {
    return { tom: 'erro', mensagem: `Consultei o Emusys, mas nao consegui gravar no Report. Nada foi alterado${detalhe}.` };
  }
  if (codigo === 'EMUSYS_ERRO') {
    return { tom: 'erro', mensagem: `O Emusys respondeu com erro. Nada foi alterado${detalhe}.` };
  }
  if (httpStatus == null) {
    return {
      tom: 'erro',
      mensagem: `Nao consegui falar com o servidor${erroRede ? ` (${erroRede})` : ''}. Nada foi alterado — confira a conexao e tente de novo.`,
    };
  }
  return { tom: 'erro', mensagem: `Falha ao atualizar (HTTP ${httpStatus})${detalhe}. Nada foi alterado.` };
}
