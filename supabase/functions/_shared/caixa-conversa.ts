// Fonte única da pergunta "qual conversa da Caixa de Entrada pertence a este número?".
//
// Existia uma cópia dessa lógica em cada produtor de mensagem (boas-vindas de matrícula,
// boas-vindas da equipe, pesquisa de 1ª aula, webhook de inbox), cada uma com um pedaço
// diferente da regra — foi o que fez a conversa do responsável nascer como contato externo
// e sem unidade. Consumidor novo chama esta função; não reimplementar.
//
// A chave da conversa é o NÚMERO, nunca o aluno: `uq_admin_conversas_jid_depto` garante
// uma conversa por (whatsapp_jid, departamento), e o mesmo aluno pode ter duas (a do
// telefone dele e a do responsável). Buscar por `aluno_id` com `.maybeSingle()` — o que o
// código antigo fazia — falha justamente nesses casos.
// @ts-nocheck

export function somenteDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

export interface ResolucaoConversa {
  conversaId: string | null;
  /** Dono da conversa DEPOIS da resolução — pode diferir do alunoId pedido (ver irmãos). */
  alunoId: number | null;
  /** Como a conversa foi obtida: útil no log quando algo não bate. */
  via: 'existente' | 'vinculada' | 'criada' | 'corrida' | 'falha';
}

/**
 * Resolve (e cria, se preciso) a conversa da Caixa para um número.
 *
 * `alunoId`/`unidadeId` são opcionais: quando o chamador já sabe de quem é a matrícula
 * (webhook de matrícula nova, por exemplo), a conversa nasce ou passa a ser vinculada.
 * Sem eles a conversa fica como contato externo, que é o correto para número que não
 * pertence a nenhum aluno — inclusive o da própria equipe, que recebe notificação interna
 * pela mesma caixa.
 */
export async function resolverConversaDaCaixa(
  supabase: any,
  {
    jid,
    departamento,
    caixaId,
    alunoId = null,
    unidadeId = null,
    nomeExterno = null,
  }: {
    jid: string;
    departamento: string;
    caixaId: number;
    alunoId?: number | null;
    unidadeId?: string | null;
    nomeExterno?: string | null;
  },
): Promise<ResolucaoConversa> {
  const numero = somenteDigitos(jid);
  if (!numero) return { conversaId: null, alunoId: null, via: 'falha' };

  const { data: existente } = await supabase
    .from('admin_conversas')
    .select('id, aluno_id, unidade_id')
    .eq('whatsapp_jid', numero)
    .eq('departamento', departamento)
    .maybeSingle();

  if (existente?.id) {
    // Dono já definido: preservar SEMPRE. Dois irmãos dividem o número do responsável e
    // a conversa é uma só — trocar o dono reescreveria o histórico do outro.
    if (existente.aluno_id) {
      return { conversaId: existente.id, alunoId: existente.aluno_id, via: 'existente' };
    }

    if (alunoId) {
      await supabase
        .from('admin_conversas')
        .update({ aluno_id: alunoId, unidade_id: unidadeId ?? null })
        .eq('id', existente.id);
      return { conversaId: existente.id, alunoId, via: 'vinculada' };
    }

    return { conversaId: existente.id, alunoId: null, via: 'existente' };
  }

  const nova = alunoId
    ? {
        aluno_id: alunoId,
        unidade_id: unidadeId ?? null,
        departamento,
        caixa_id: caixaId,
        whatsapp_jid: numero,
        status: 'aberta',
      }
    : {
        aluno_id: null,
        telefone_externo: numero,
        nome_externo: nomeExterno || numero,
        // ⚠️ unidade_id FICA NULL em conversa externa, de propósito. A caixa consolidada
        // faz `webhook-whatsapp-inbox` procurar a conversa externa com `unidade_id IS NULL`
        // (processExternalAdminMessage); com a unidade preenchida ele não a encontra, tenta
        // inserir, esbarra em uq_admin_conversas_jid_depto e DESCARTA a mensagem recebida.
        // Só se preenche unidade junto com aluno_id, quando a conversa deixa de ser externa.
        unidade_id: null,
        departamento,
        caixa_id: caixaId,
        whatsapp_jid: numero,
        status: 'aberta',
      };

  const { data: criada, error: erroCriar } = await supabase
    .from('admin_conversas')
    .insert(nova)
    .select('id')
    .single();

  if (criada?.id) {
    return { conversaId: criada.id, alunoId: alunoId ?? null, via: 'criada' };
  }

  // Corrida com o webhook (o contato respondeu no mesmo instante) ou conversa criada
  // entre o select e o insert: o índice único recusa. Reaproveita a que venceu.
  const { data: porJid } = await supabase
    .from('admin_conversas')
    .select('id, aluno_id')
    .eq('whatsapp_jid', numero)
    .eq('departamento', departamento)
    .maybeSingle();

  if (porJid?.id) {
    if (!porJid.aluno_id && alunoId) {
      await supabase
        .from('admin_conversas')
        .update({ aluno_id: alunoId, unidade_id: unidadeId ?? null })
        .eq('id', porJid.id);
      return { conversaId: porJid.id, alunoId, via: 'corrida' };
    }
    return { conversaId: porJid.id, alunoId: porJid.aluno_id ?? null, via: 'corrida' };
  }

  console.error('[caixa-conversa] conversa não resolvida', {
    numero,
    departamento,
    alunoId,
    erro: erroCriar?.message ?? null,
    codigo: erroCriar?.code ?? null,
  });
  return { conversaId: null, alunoId: null, via: 'falha' };
}
