/**
 * perfilTextos.ts
 *
 * Tabelas fixas de texto para montar o briefing "Antes de falar com {nome}"
 * e os blocos "Perfil" / "Como reconhecer" da ficha de colaborador.
 *
 * Estes textos serao revisados por gente de negocio — manter separados do
 * componente para facilitar edicao.
 *
 * Regra: nunca nomear os instrumentos. Usar "perfil" e "como reconhecer".
 */

// ---------------------------------------------------------------------------
// CORES DE IDENTIDADE (cor do perfil primario)
// ---------------------------------------------------------------------------
export const PERFIL_CORES: Record<string, string> = {
  SLASH: '#e4484d',
  CAZUZA: '#db9e04',
  AMY: '#4e7cf6',
  FRANK: '#2a9d8f',
};

// ---------------------------------------------------------------------------
// NOMES DE EXIBICAO (sem nomear o instrumento)
// ---------------------------------------------------------------------------
export const PERFIL_NOMES: Record<string, string> = {
  SLASH: 'Slash',
  CAZUZA: 'Cazuza',
  AMY: 'Amy',
  FRANK: 'Frank',
};

// ---------------------------------------------------------------------------
// VALORIZACAO — nomes de exibicao
// ---------------------------------------------------------------------------
export const VALORIZACAO_NOMES: Record<string, string> = {
  PALAVRAS: 'Palavras',
  TEMPO: 'Tempo',
  APOIO: 'Apoio',
  SIMBOLO: 'Símbolo',
};

// ---------------------------------------------------------------------------
// TEXTO DO PERFIL (temperamento primario)
// Usado em:
//   - Briefing paragrafo 1 ("Como ela reage")
//   - Bloco "Perfil" (Forca / Escorrego)
// ---------------------------------------------------------------------------
export interface TextoPerfil {
  /** O que a pessoa traz — frase curta pro briefing */
  reage: string;
  /** Ponto cego — frase curta pro briefing (continuacao do reage) */
  pontoCego: string;
  /** Forca — bloco Perfil */
  forca: string;
  /** Escorrego — bloco Perfil */
  escorrego: string;
  /** Subtitulo do perfil (ex.: "Estabilidade com tempero de conexao") */
  subtitulo: (secundario: string) => string;
}

export const PERFIS_TEXTOS: Record<string, TextoPerfil> = {
  SLASH: {
    reage: 'Ela <b>entra em acao rapido</b> e puxa o ritmo quando tudo esta parado.',
    pontoCego: 'Em compensacao, pode atropelar quem precisa de mais tempo pra processar — pise no freio antes de cobrar.',
    forca: 'Empurra a situacao pra frente quando ninguem toma a iniciativa',
    escorrego: 'Impaciencia com quem vai devagar; pode parecer que nao escuta',
    subtitulo: (s) => `Impulso com tempero de ${s.toLowerCase()}`,
  },
  CAZUZA: {
    reage: 'Ela <b>le o ambiente e conecta as pessoas</b> antes de qualquer outra coisa.',
    pontoCego: 'Por outro lado, raramente vai trazer o problema desconfortavel sozinha — pergunte diretamente em vez de esperar.',
    forca: 'Conecta o time e le o clima antes de ninguem',
    escorrego: 'Evita o atrito necessario; demora pra trazer problema',
    subtitulo: (s) => `Conexao com tempero de ${s.toLowerCase()}`,
  },
  AMY: {
    reage: 'Ela <b>mapeia tudo antes de se mover</b> e traz a resposta certa na hora certa.',
    pontoCego: 'Porem, pode parecer que esta demorando demais quando o urgente bate na porta — combine checkpoints pra nao sufocar.',
    forca: 'Ve o quadro inteiro e prepara antes de agir',
    escorrego: 'Paralisia por analise; custa a largar quando falta dado',
    subtitulo: (s) => `Visao com tempero de ${s.toLowerCase()}`,
  },
  FRANK: {
    reage: 'Ela <b>nao se desestabiliza facil</b> e traz a temperatura pra baixo quando o ambiente esquenta.',
    pontoCego: 'Dificilmente vai levantar sozinha um problema que esta incomodando — pergunte diretamente em vez de esperar que ela traga.',
    forca: 'Segura o barco quando o mar agita',
    escorrego: 'Calma virando inercia; evita o atrito necessario',
    subtitulo: (s) => `Estabilidade com tempero de ${s.toLowerCase()}`,
  },
};

// ---------------------------------------------------------------------------
// TEXTO DE VALORIZACAO (linguagem de valorizacao primaria)
// Usado em:
//   - Briefing paragrafo 2 ("Como reconhecer")
//   - Bloco "Como reconhecer" (1º e 2º)
// ---------------------------------------------------------------------------
export interface TextoValorizacao {
  /** Frase pratica de como reconhecer */
  reconhecer: string;
  /** Frase do briefing — como funciona com ela */
  briefing: string;
}

export const VALORIZACAO_TEXTOS: Record<string, TextoValorizacao> = {
  PALAVRAS: {
    reconhecer: 'Reconhecimento dito ou escrito, especifico, na frente dos outros.',
    briefing: 'Reconhecimento com ela funciona por <b>palavra dita</b>, e melhor ainda na frente do time.',
  },
  TEMPO: {
    reconhecer: 'Atencao exclusiva, conversa sem pauta.',
    briefing: 'Reconhecimento com ela funciona por <b>tempo dedicado</b> — conversa sem pauta, atencao exclusiva.',
  },
  APOIO: {
    reconhecer: 'Alguem que se ofereceu pra ajudar quando precisou, sem pedir.',
    briefing: 'Reconhecimento com ela funciona por <b>apoio concreto</b> — alguem que botou a mao na massa junto.',
  },
  SIMBOLO: {
    reconhecer: 'Presente e lembranca — algo fisico que mostra que pensaram nela.',
    briefing: 'Reconhecimento com ela funciona por <b>simbolos</b> — presente e lembranca passam longe de despercebidos.',
  },
};

// ---------------------------------------------------------------------------
// TEXTO DE "EVITE" (valorizacao com menor pontuacao)
// ---------------------------------------------------------------------------
export const VALORIZACAO_EVITE: Record<string, string> = {
  PALAVRAS: 'Elogio generico e em publico passa batido com ela.',
  TEMPO: 'Conversa longa sem objeto a irrita — vai direto ao ponto.',
  APOIO: 'Oferecer ajuda nao pedida a faz sentir que duvidam dela.',
  SIMBOLO: 'Presente e lembranca passam quase despercebidos com ela.',
};

// ---------------------------------------------------------------------------
// TEXTO DE "COMO COBRAR" (derivado do primario)
// Usado no briefing paragrafo 3
// ---------------------------------------------------------------------------
export const PERFIS_COBRAR: Record<string, string> = {
  SLASH: 'Se precisar de resultado, <b>deixa o objetivo claro e sai do caminho</b>. Microgestao trava.',
  CAZUZA: 'Se precisar de resultado, <b>converse antes de cobrar</b>. Cobranca fria desarma.',
  AMY: 'Se precisar de resultado, <b>traça o plano junto</b>. Pressao sem contexto paralisa.',
  FRANK: 'Se precisar de velocidade, <b>combine o prazo junto com ela</b>. Pressao de cima nao acelera — trava.',
};

// ---------------------------------------------------------------------------
// RIDER CAMPOS — copia da edge function ficha-tecnica (RIDER_CAMPOS)
// Mantido identico para que os rotulos nao divergirem entre formulario e tela
// ---------------------------------------------------------------------------
export const RIDER_CAMPOS = [
  { id: 'rende_mais',      grupo: 'Como eu trabalho',  label: 'Eu rendo mais quando...' },
  { id: 'me_atrapalha',    grupo: 'Como eu trabalho',  label: 'O que me atrapalha ou me tira do sério...' },
  { id: 'melhor_horario',  grupo: 'Como eu trabalho',  label: 'Meu melhor horário do dia é...' },
  { id: 'como_chamar',     grupo: 'Como falar comigo', label: 'A melhor forma de me chamar pra alguma coisa é...' },
  { id: 'quando_quieto',   grupo: 'Como falar comigo', label: 'Quando eu fico quieto, geralmente significa...' },
  { id: 'entendem_errado', grupo: 'Como falar comigo', label: 'Costumam entender errado sobre mim que...' },
  { id: 'feedback',        grupo: 'Feedback',          label: 'Eu prefiro receber feedback assim...' },
  { id: 'quando_erro',     grupo: 'Feedback',          label: 'Quando eu erro, o que mais me ajuda é...' },
  { id: 'tempo_livre',     grupo: 'Fora do trabalho',  label: 'No meu tempo livre eu...' },
  { id: 'habilidade',      grupo: 'Fora do trabalho',  label: 'Uma habilidade minha que quase ninguém aqui conhece...' },
  { id: 'musica',          grupo: 'Fora do trabalho',  label: 'Se fosse escolher uma música pra tocar quando eu chego, seria...' },
  { id: 'quero_aprender',  grupo: 'Fora do trabalho',  label: 'O que eu quero aprender ou desenvolver esse ano...' },
] as const;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/** Formata codinome "AMY/CAZUZA" -> "Amy-Cazuza" */
export function formatarCodinome(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome
    .split('/')
    .map((p) => PERFIL_NOMES[p] || p.charAt(0) + p.slice(1).toLowerCase())
    .join('-');
}

/** Formata valorizacao "PALAVRAS/TEMPO" -> "Palavras · Tempo" */
export function formatarValorizacao(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome
    .split('/')
    .map((p) => VALORIZACAO_NOMES[p] || p.charAt(0) + p.slice(1).toLowerCase())
    .join(' · ');
}

/** Retorna a cor do perfil primario a partir do codinome */
export function corDoPerfil(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  const prim = codinome.split('/')[0];
  return PERFIL_CORES[prim] || null;
}

/** Retorna a chave do perfil primario */
export function perfilPrimario(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome.split('/')[0] || null;
}

/** Retorna a chave do perfil secundario */
export function perfilSecundario(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome.split('/')[1] || null;
}

/** Retorna a chave da valorizacao primaria */
export function valorizacaoPrimaria(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome.split('/')[0] || null;
}

/** Retorna a chave da valorizacao secundaria */
export function valorizacaoSecundaria(codinome: string | null | undefined): string | null {
  if (!codinome) return null;
  return codinome.split('/')[1] || null;
}

/**
 * Encontra a valorizacao com menor pontuacao (o "Evite").
 * valorizacao_contagem vem como {"PALAVRAS":4,"TEMPO":3,"APOIO":1,"SIMBOLO":2}
 */
export function valorizacaoEvite(contagem: Record<string, number> | null | undefined): string | null {
  if (!contagem || typeof contagem !== 'object') return null;
  const entries = Object.entries(contagem);
  if (entries.length === 0) return null;
  // Ordena por valor ascendente — o menor e o "Evite"
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}
