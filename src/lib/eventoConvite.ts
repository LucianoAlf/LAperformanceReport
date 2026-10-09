/**
 * Convite do recital por WhatsApp (LAPE-39, item 10 da reunião de 08/10/2026).
 *
 * Fonte única da MONTAGEM do texto: a prévia da tela e o envio usam o resultado desta
 * função, e a edge `evento-enviar-convite` manda exatamente o texto que a pessoa viu.
 * O texto-base é o que a Fernanda (Recreio) já mandava às famílias, trocando à mão só
 * data, horário e bloco; aqui esses pedaços viram campos.
 */

export const CAMPOS_DO_CONVITE = [
  { campo: '{saudacao}', descricao: 'Bom dia, Boa tarde ou Boa noite (pela hora do envio)' },
  { campo: '{responsavel}', descricao: 'Primeiro nome de quem recebe' },
  { campo: '{aluno}', descricao: 'Nome do aluno' },
  { campo: '{bloco}', descricao: 'Bloco do aluno (ex.: BLOCO 1)' },
  { campo: '{data}', descricao: 'Data do bloco (ex.: 14/11/2026)' },
  { campo: '{dia_semana}', descricao: 'Dia da semana em maiúsculas (ex.: SÁBADO)' },
  { campo: '{horario}', descricao: 'Horário de início do bloco (ex.: 09h00)' },
] as const;

export const CONVITE_PADRAO = `{saudacao} {responsavel}!

Temos uma notícia maravilhosa: A participação de {aluno} no Recital Musical 2026 está confirmada! 🥳😍

Nosso recital será organizado por blocos, para que todos possam levar uma boa quantidade de convidados e para garantirmos uma experiência ainda mais agradável e bem organizada.

{aluno} está no {bloco}! 😎

📅 Data: {data} ({dia_semana})
📍 Local: Av. José Wilker, 600 - Barra da Tijuca (Centro de convenções Union Suítes)
🕓 Horário do {bloco}: {horario}

Pedimos que cheguem com 10 minutinhos de antecedência, para que tudo ocorra de forma tranquila. Cada apresentação terá duração média de 5 minutos.

⚠️ Informações importantes:

➡️ Cada aluno poderá levar até 2 convidados.
Por gentileza, envie o nome completo de todos os convidados até o dia 7/11.
A entrada será permitida apenas para os nomes que estiverem na lista e no horário do bloco informado.

➡️ Não será possível realizar trocas de bloco, devido ao planejamento e organização do evento.

🥰 Contamos com a colaboração e o carinho de todos para que este dia seja lindo, emocionante e inesquecível para nossos pequenos artistas.`;

const DIAS = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];

/** Hora cheia em BRT, independente do fuso do navegador. */
function horaBrt(agora: Date): number {
  return Number(
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(agora),
  ) % 24;
}

export function saudacaoPorHora(agora: Date = new Date()): string {
  const h = horaBrt(agora);
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** '2026-11-14' → { data: '14/11/2026', dia: 'SÁBADO' }. Data pura, sem fuso. */
export function dataDoBloco(iso: string | null): { data: string; dia: string } | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, a, me, d] = m;
  const dia = new Date(Date.UTC(Number(a), Number(me) - 1, Number(d))).getUTCDay();
  return { data: `${d}/${me}/${a}`, dia: DIAS[dia] };
}

/** '09:00' ou '09:00:00' → '09h00'. */
export function horarioDoBloco(hora: string | null): string {
  const m = hora?.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}h${m[2]}` : '';
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';

/** Junta "A", "A e B", "A, B e C". */
function juntar(itens: string[]): string {
  const u = [...new Set(itens.filter(Boolean))];
  if (u.length <= 1) return u[0] ?? '';
  return `${u.slice(0, -1).join(', ')} e ${u[u.length - 1]}`;
}

export interface BlocoDoConvite {
  nome: string;
  /** 'AAAA-MM-DD' efetivo do bloco (já resolvido pelo cálculo da grade). */
  data: string | null;
  /** Início do bloco, 'HH:MM'. */
  inicio: string | null;
}

export interface DadosDoConvite {
  destinatario: string;
  aluno: string;
  /** Na ordem do recital. Quem toca em 2 blocos recebe os dois no mesmo convite. */
  blocos: BlocoDoConvite[];
  agora?: Date;
}

/** O nome do bloco em caixa alta, como a Fernanda escreve ("BLOCO 1"). */
const nomeDoBloco = (nome: string) => nome.trim().toLocaleUpperCase('pt-BR');

export function montarConvite(modelo: string, dados: DadosDoConvite): string {
  const datas = dados.blocos.map((b) => dataDoBloco(b.data));
  const valores: Record<string, string> = {
    '{saudacao}': saudacaoPorHora(dados.agora),
    '{responsavel}': primeiroNome(dados.destinatario),
    '{aluno}': dados.aluno.trim(),
    '{bloco}': juntar(dados.blocos.map((b) => nomeDoBloco(b.nome))),
    '{data}': juntar(datas.map((d) => d?.data ?? '')),
    '{dia_semana}': juntar(datas.map((d) => d?.dia ?? '')),
    '{horario}': juntar(dados.blocos.map((b) => horarioDoBloco(b.inicio))),
  };
  return Object.entries(valores).reduce((t, [campo, valor]) => t.split(campo).join(valor), modelo);
}

/** Campos que ficaram sem valor (ex.: bloco sem data). A edge recusa texto com `{campo}`. */
export function camposSemValor(dados: DadosDoConvite): string[] {
  const faltam: string[] = [];
  if (!dados.destinatario.trim()) faltam.push('{responsavel}');
  if (!dados.blocos.length) faltam.push('{bloco}');
  if (dados.blocos.some((b) => !dataDoBloco(b.data))) faltam.push('{data}');
  if (dados.blocos.some((b) => !horarioDoBloco(b.inicio))) faltam.push('{horario}');
  return faltam;
}

/** Telefone para exibir: '5521987654321' → '(21) 98765-4321'. */
export function telefoneLegivel(tel: string): string {
  const d = tel.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}
