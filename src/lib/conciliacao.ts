/**
 * As regras da Conciliação Emusys — compartilhadas pelo computador e pelo
 * celular.
 *
 * Esta é a única aba em que o toque ESCREVE no cadastro do aluno. Por isso
 * aqui mora, além do vocabulário (o que cada divergência significa, quais são
 * os dois lados), a régua que decide **o que pode ser resolvido no telefone**
 * — e, quando não pode, o motivo, para a tela dizer em vez de só desabilitar.
 */

export interface AtributoParaConciliar {
  id: number;
  aluno_id: number | null;
  aluno_nome?: string | null;
  emusys_student_id?: string | null;
  emusys_matricula_id?: string | null;
  tipo_divergencia: string;
  campo: string;
  valor_nosso: any;
  valor_emusys: any;
  sugestao: any;
  severidade: string;
  instagram_nao_possui?: boolean;
  status_operacional?: string | null;
  is_ex_aluno?: boolean;
}

export interface MatriculaParaConciliar {
  id: number;
  aluno_id: number | null;
  aluno_nome: string | null;
  tipo_divergencia: string;
  campo: string | null;
  valor_nosso: any;
  valor_api: any;
  sugestao: any;
  severidade: string | null;
}

/** Rótulo e grupo de cada tipo de divergência de atributo. */
export const ATRIBUTO_TIPO_ROTULO: Record<string, { label: string; grupo: string; cor: string }> = {
  foto_ausente: { label: 'Foto ausente', grupo: 'imagem', cor: 'violet' },
  instagram_ausente: { label: 'Instagram ausente', grupo: 'imagem', cor: 'violet' },
  instagram_divergente: { label: 'Instagram diverge', grupo: 'imagem', cor: 'violet' },
  contato_divergente: { label: 'Contato do cadastro', grupo: 'cadastro', cor: 'sky' },
  responsavel_divergente: { label: 'Responsavel do cadastro', grupo: 'cadastro', cor: 'sky' },
  status_financeiro_divergente: { label: 'Status financeiro', grupo: 'financeiro', cor: 'orange' },
  forma_pagamento_divergente: { label: 'Forma de pagamento', grupo: 'financeiro', cor: 'orange' },
  aguardando_renovacao_divergente: { label: 'Aguardando renovacao', grupo: 'financeiro', cor: 'orange' },
  anamnese_pendente: { label: 'Anamnese pendente', grupo: 'contrato', cor: 'amber' },
  contrato_assinatura_pendente: { label: 'Contrato sem assinatura', grupo: 'contrato', cor: 'amber' },
  data_nascimento_divergente: { label: 'Nascimento diverge', grupo: 'cadastro', cor: 'red' },
};

/** Campos que o sync sabe aplicar sozinho — os que têm "valor do Emusys". */
export const ATRIBUTO_CAMPOS_APLICAVEIS = new Set([
  'foto_url',
  'instagram',
  'telefone',
  'email',
  'responsavel_nome',
  'responsavel_telefone',
  'status_pagamento',
  'forma_pagamento_id',
  'aguardando_renovacao',
  'data_nascimento',
]);

export const STATUS_PAGAMENTO_LABEL: Record<string, string> = {
  em_dia: 'Em dia',
  inadimplente: 'Inadimplente',
  atrasado: 'Atrasado',
};

export function fmtDataCurta(d: any): string {
  if (!d) return '—';
  const data = new Date(String(d) + 'T00:00:00');
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
}

export function textoCurtoValor(v: any): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(textoCurtoValor).filter(Boolean).join(', ') || '—';
  if (typeof v !== 'object') return String(v);

  const preferidos = [
    'status_pagamento', 'status_financeiro', 'inadimplente', 'forma_pagamento',
    'cobranca_automatica_status', 'telefone', 'email', 'responsavel', 'instagram',
    'foto_url', 'anamnese_preenchida', 'contrato_assinado', 'aguardando_renovacao', 'valor_parcela',
  ];
  const partes = preferidos
    .filter(chave => v[chave] != null && v[chave] !== '')
    .map(chave => `${chave.replaceAll('_', ' ')}: ${String(v[chave])}`);

  if (partes.length) return partes.join(' · ');
  return Object.entries(v)
    .slice(0, 3)
    .map(([chave, valor]) => `${chave.replaceAll('_', ' ')}: ${textoCurtoValor(valor)}`)
    .join(' · ') || '—';
}

/** Os dois lados de uma divergência de atributo, e o que se sugere fazer. */
export function descricaoAtributo(
  item: Pick<AtributoParaConciliar, 'tipo_divergencia' | 'valor_nosso' | 'valor_emusys' | 'sugestao'>,
): { nosso: string; emusys: string; sugestao: string } {
  if (item.tipo_divergencia === 'foto_ausente') {
    return { nosso: 'Sem foto no LA Report', emusys: 'Foto disponivel no Emusys', sugestao: 'Aplicar foto do Emusys' };
  }
  if (item.tipo_divergencia === 'anamnese_pendente') {
    return { nosso: 'Anamnese nao preenchida', emusys: 'Checklist interno do LA Report', sugestao: 'Cobrar preenchimento' };
  }
  if (item.tipo_divergencia === 'contrato_assinatura_pendente') {
    return { nosso: 'Contrato sem assinatura', emusys: 'Checklist interno do LA Report', sugestao: 'Regularizar assinatura' };
  }
  if (item.tipo_divergencia === 'forma_pagamento_divergente') {
    const nossaForma = item.valor_nosso?.nome
      ? `${item.valor_nosso.nome}${item.valor_nosso.sigla ? ` (${item.valor_nosso.sigla})` : ''}`
      : 'Sem forma de pagamento definida';
    const formaEmusys = item.valor_emusys?.forma_pagamento || '—';
    return {
      nosso: nossaForma,
      emusys: formaEmusys,
      sugestao: item.sugestao?.forma_pagamento ? `Definir como ${item.sugestao.forma_pagamento}` : '—',
    };
  }
  if (item.tipo_divergencia === 'status_financeiro_divergente') {
    const label = (s: any) => STATUS_PAGAMENTO_LABEL[String(s || '').toLowerCase()] || String(s || '—');
    return {
      nosso: label(item.valor_nosso?.status_pagamento),
      emusys: label(item.valor_emusys?.status_pagamento),
      sugestao: item.sugestao?.status_pagamento ? `Definir como ${label(item.sugestao.status_pagamento)}` : '—',
    };
  }
  if (item.tipo_divergencia === 'data_nascimento_divergente') {
    return {
      nosso: fmtDataCurta(item.valor_nosso?.data_nascimento),
      emusys: fmtDataCurta(item.valor_emusys?.data_nascimento),
      sugestao: item.sugestao?.data_nascimento
        ? `Definir como ${fmtDataCurta(item.sugestao.data_nascimento)} (confirmar com a escola antes)`
        : '—',
    };
  }
  return {
    nosso: textoCurtoValor(item.valor_nosso),
    emusys: textoCurtoValor(item.valor_emusys),
    sugestao: textoCurtoValor(item.sugestao),
  };
}

export function grupoAtributo(item: Pick<AtributoParaConciliar, 'severidade' | 'tipo_divergencia' | 'valor_emusys'>): string {
  if (item.severidade === 'alta') return 'criticas';
  if (item.tipo_divergencia === 'status_financeiro_divergente' && item.valor_emusys?.status_pagamento === 'inadimplente') {
    return 'criticas';
  }
  return ATRIBUTO_TIPO_ROTULO[item.tipo_divergencia]?.grupo || 'cadastro';
}

export function origemAtributo(item: Pick<AtributoParaConciliar, 'severidade' | 'tipo_divergencia' | 'valor_emusys'>): string {
  const grupo = grupoAtributo(item);
  if (grupo === 'contrato') return 'Checklist interno LA Report';
  if (item.tipo_divergencia === 'foto_ausente' || item.tipo_divergencia.includes('instagram')) return 'Emusys -> LA Report';
  if (grupo === 'financeiro') return 'Contrato Emusys';
  return 'LA Report x Emusys';
}

/**
 * A identidade do aluno numa divergência de atributo.
 *
 * ⚠️ `emusys_student_id` sozinho NÃO identifica pessoa (91 ids aparecem em
 * duas unidades, com nomes diferentes) — por isso ele é o terceiro degrau,
 * depois do `aluno_id` local e da matrícula.
 */
export function chaveAlunoAtributo(
  item: Pick<AtributoParaConciliar, 'id' | 'aluno_id' | 'emusys_matricula_id' | 'emusys_student_id'>,
): string {
  if (item.aluno_id) return `aluno:${item.aluno_id}`;
  if (item.emusys_matricula_id) return `mat:${item.emusys_matricula_id}`;
  if (item.emusys_student_id) return `student:${item.emusys_student_id}`;
  return `atributo:${item.id}`;
}

// ---------------------------------------------------------------------------
// A régua do celular
// ---------------------------------------------------------------------------

export type MotivoSemDecisao =
  | 'checklist'
  | 'precisa_digitar'
  | 'precisa_escolher'
  | 'precisa_conferir_fora'
  | 'varios_candidatos'
  | 'cria_cadastro'
  | 'sem_sugestao';

/**
 * Por que esta divergência não se resolve no telefone — em uma frase que a
 * tela mostra.
 *
 * ⚠️ Desabilitar um botão sem dizer o motivo transfere a dúvida para a
 * pessoa: ela fica sem saber se é falta de permissão, se está carregando, ou
 * se aquele caso é diferente.
 */
export const EXPLICACAO_SEM_DECISAO: Record<MotivoSemDecisao, string> = {
  checklist: 'É uma pendência a cobrar, não um dado a corrigir — não há valor do Emusys para aplicar.',
  precisa_digitar: 'Depende de digitar um valor; o teclado do computador evita erro de dígito.',
  precisa_escolher: 'Depende de escolher numa lista que só existe na tela do computador.',
  precisa_conferir_fora: 'Pede conferência com a escola antes de gravar.',
  varios_candidatos: 'Há mais de um candidato no Emusys — escolher o errado escreve na ficha de outra pessoa.',
  cria_cadastro: 'Criaria um cadastro novo, não corrige um existente.',
  sem_sugestao: 'O sync não propôs um valor, então não há dois lados para comparar.',
};

export interface Decisao {
  pode: boolean;
  motivo?: MotivoSemDecisao;
}

/**
 * Um ATRIBUTO pode ser decidido no celular?
 *
 * 🔴 A pergunta é sempre a mesma: **existem dois lados e um toque basta para
 * escolher entre eles?** Se a resposta exige digitar, escolher numa lista,
 * conferir com alguém ou desambiguar entre pessoas, ela não é uma decisão de
 * telefone — é uma decisão que dá para tomar errado com o polegar.
 *
 * ⚠️ Medido em 22/09: dos 330 atributos abertos, **293 (89%) são
 * `anamnese_pendente`** — checklist interno, onde o "lado do Emusys" é a
 * frase "Checklist interno do LA Report". Não há o que aplicar; oferecer um
 * botão ali seria oferecer uma escrita sem conteúdo.
 */
export function decisaoDeAtributoNoCelular(
  item: Pick<AtributoParaConciliar, 'tipo_divergencia' | 'campo' | 'sugestao'>,
): Decisao {
  if (item.tipo_divergencia === 'anamnese_pendente' || item.tipo_divergencia === 'contrato_assinatura_pendente') {
    return { pode: false, motivo: 'checklist' };
  }
  // A própria sugestão do sistema manda confirmar com a escola antes.
  if (item.tipo_divergencia === 'data_nascimento_divergente') {
    return { pode: false, motivo: 'precisa_conferir_fora' };
  }
  if (item.tipo_divergencia === 'forma_pagamento_divergente' && !item.sugestao?.forma_pagamento) {
    return { pode: false, motivo: 'precisa_escolher' };
  }
  if (!ATRIBUTO_CAMPOS_APLICAVEIS.has(item.campo)) {
    return { pode: false, motivo: 'sem_sugestao' };
  }
  return { pode: true };
}

/**
 * Uma divergência de MATRÍCULA pode ser decidida no celular?
 *
 * ⚠️ `status_divergente` entra, e é a mais consequente da tela — ela move o
 * aluno entre ativo, trancado e evadido. Entra porque é genuinamente binária
 * (o sync já propôs um valor e os dois lados cabem lado a lado), e sai do
 * lote: no telefone é uma por vez, com o nome inteiro à vista e um segundo
 * toque para confirmar.
 */
export function decisaoDeMatriculaNoCelular(
  item: Pick<MatriculaParaConciliar, 'tipo_divergencia' | 'sugestao'>,
): Decisao {
  if (item.tipo_divergencia === 'ambiguo') return { pode: false, motivo: 'varios_candidatos' };
  if (item.tipo_divergencia === 'ausente_nosso_sistema') return { pode: false, motivo: 'cria_cadastro' };
  if (item.tipo_divergencia === 'valor_divergente') return { pode: false, motivo: 'precisa_digitar' };
  if (item.tipo_divergencia === 'status_divergente' || item.tipo_divergencia === 'classificacao_divergente') {
    return item.sugestao != null ? { pode: true } : { pode: false, motivo: 'sem_sugestao' };
  }
  return { pode: false, motivo: 'sem_sugestao' };
}

/**
 * Status cru do Emusys (`ativa`/`trancada`/`finalizada`) e o nosso
 * (`ativo`/`trancado`/`evadido`) em pt-BR legível.
 */
export const STATUS_LABEL: Record<string, string> = {
  ativa: 'Ativa', trancada: 'Trancada', finalizada: 'Finalizada',
  ativo: 'Ativo', trancado: 'Trancado', evadido: 'Evadido', inativo: 'Inativo',
};

export function fmtStatus(s: any): string {
  return STATUS_LABEL[String(s || '').toLowerCase()] || String(s || '—');
}

/**
 * Os dois lados de uma divergência de MATRÍCULA, em texto curto.
 *
 * 🔴 No `status_divergente` o lado do Emusys é `status_sugerido_la_report`, e
 * **não** `status_emusys`. Os dois campos existem porque são vocabulários
 * diferentes — lá a matrícula é "trancada", aqui o aluno fica "trancado" —, e
 * pôr "Ativo → Trancada" lado a lado faz parecer que há uma diferença de
 * conteúdo onde só há diferença de palavra. O que vai ser gravado é o
 * sugerido; é ele que a pessoa precisa ver antes de confirmar.
 *
 * ⚠️ `tiposMatricula` traduz o código do tipo (`BOLSISTA_INT`) para o nome que
 * a escola usa. Sem o mapa, o código aparece cru — nunca um traço, que
 * esconderia que existe um valor ali.
 */
export function ladosDaMatricula(
  item: Pick<MatriculaParaConciliar, 'tipo_divergencia' | 'valor_nosso' | 'valor_api' | 'sugestao'>,
  tiposMatricula: ReadonlyMap<string, string> = new Map(),
): { nosso: string; emusys: string } {
  const v = item.valor_api ?? {};

  if (item.tipo_divergencia === 'status_divergente') {
    return {
      nosso: fmtStatus(item.valor_nosso?.status),
      emusys: fmtStatus(v.status_sugerido_la_report ?? item.sugestao),
    };
  }

  if (item.tipo_divergencia === 'classificacao_divergente') {
    const nome = (codigo: any) =>
      codigo ? (tiposMatricula.get(String(codigo)) ?? String(codigo)) : '—';
    return { nosso: nome(item.valor_nosso?.tipo), emusys: nome(v.tipo_sugerido ?? item.sugestao) };
  }

  if (item.tipo_divergencia === 'valor_divergente') {
    const parcela = v.parcela_comercial ?? item.sugestao;
    return {
      nosso: item.valor_nosso?.valor_parcela != null ? fmtBRL(item.valor_nosso.valor_parcela) : '—',
      emusys: parcela != null ? fmtBRL(parcela) : '—',
    };
  }

  if (item.tipo_divergencia === 'ausente_nosso_sistema') {
    const partes = [v.nome, v.disciplinas].filter(Boolean).join(' · ');
    return { nosso: 'Não existe aqui', emusys: partes || `Emusys #${v.emusys_id ?? '?'}` };
  }

  if (Array.isArray(v.candidatos)) {
    const n = v.candidatos.length;
    return { nosso: '—', emusys: `${n} ${n === 1 ? 'candidato' : 'candidatos'} no Emusys` };
  }

  return { nosso: textoCurtoValor(item.valor_nosso), emusys: textoCurtoValor(item.valor_api) };
}

export function fmtBRL(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export type LadoEscolhido = 'emusys' | 'nosso';

export interface PassoDaDecisao {
  /** Qual lado está aguardando confirmação; `null` = ninguém escolheu ainda. */
  confirmando: LadoEscolhido | null;
  /** Só aqui a escrita acontece. */
  gravar: LadoEscolhido | null;
}

/**
 * A decisão em DUAS etapas — escolher, depois confirmar.
 *
 * 🔴 Mora aqui, e não dentro do JSX, porque a garantia que importa não é
 * "existe um botão Confirmar na tela": é que **nenhum caminho leva de "nada
 * escolhido" direto a "gravar"**. Isso se prova com valores; com um teste que
 * procura a palavra "Confirmar" no arquivo, não — o texto continua lá mesmo
 * quando o ramo que o mostra vira inalcançável.
 *
 * ⚠️ Um toque que grava de primeira é o desenho errado num aparelho que se
 * usa em pé, no balcão, com uma mão — e nesta aba cada gravação entra na
 * ficha de um aluno. O segundo toque não é burocracia: é a diferença entre
 * "escolhi" e "encostei".
 */
export function passoDaDecisao(
  atual: LadoEscolhido | null,
  evento: { tipo: 'escolher'; lado: LadoEscolhido } | { tipo: 'confirmar' } | { tipo: 'voltar' },
): PassoDaDecisao {
  if (evento.tipo === 'escolher') return { confirmando: evento.lado, gravar: null };
  if (evento.tipo === 'voltar') return { confirmando: null, gravar: null };
  // `confirmar` grava o que estava escolhido — e sem escolha anterior `atual`
  // é `null`, então não grava nada. É o caminho que um clique duplo ou um
  // evento repetido produziria, e ele se fecha sozinho.
  //
  // ⚠️ Uma guarda `if (atual == null) return …` aqui seria redundante: ela
  // devolve exatamente esta linha. Mutação em 22/09 mostrou isso — removê-la
  // não mudava resultado nenhum, que é a definição de código morto.
  return { confirmando: null, gravar: atual };
}

export interface ResumoDaFila {
  total: number;
  decidiveis: number;
  soLeitura: number;
  /** Quantos de cada motivo — para a tela dizer o que está esperando o computador. */
  porMotivo: Record<string, number>;
}

/**
 * Quanto da fila dá para resolver aqui.
 *
 * ⚠️ O número existe porque "6 de 350" e "350" contam histórias diferentes:
 * sem ele, quem abre a aba no celular pensa que tem 350 decisões pela frente.
 */
export function resumirFila<T>(itens: readonly T[], regua: (item: T) => Decisao): ResumoDaFila {
  const porMotivo: Record<string, number> = {};
  let decidiveis = 0;
  for (const item of itens) {
    const d = regua(item);
    if (d.pode) decidiveis += 1;
    else if (d.motivo) porMotivo[d.motivo] = (porMotivo[d.motivo] ?? 0) + 1;
  }
  return { total: itens.length, decidiveis, soLeitura: itens.length - decidiveis, porMotivo };
}
