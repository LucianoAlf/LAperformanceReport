import { mesmoTelefone } from './normalizarTelefone';

/** O que a conversa precisa saber do aluno para decidir o numero de envio. */
export interface CadastroDeEnvio {
  whatsapp?: string | null;
  telefone?: string | null;
}

/**
 * Qual numero do cadastro a conversa DEVERIA estar usando.
 *
 * A ordem (whatsapp primeiro, telefone depois) nao e preferencia de estilo: e a mesma da
 * edge `enviar-mensagem-admin` e da RPC `admin_conversa_usar_numero_do_cadastro_v1`.
 * Inverte-la aqui faria a tela prometer um numero e o botao migrar para outro.
 */
export function numeroDeEnvioDoCadastro(aluno: CadastroDeEnvio | null | undefined): string | null {
  if (!aluno) return null;
  const escolhido = (aluno.whatsapp || '').trim() || (aluno.telefone || '').trim();
  return escolhido || null;
}

/**
 * A conversa esta presa num numero que o cadastro ja nao usa?
 *
 * `admin_conversas.whatsapp_jid` e uma COPIA feita quando a conversa nasceu, e nada a
 * reconcilia depois — corrigir o cadastro nao move o envio. Em 16/09/2026 dois alunos
 * novos ficaram 2 e 5 dias sem receber nada por isso, com o cabecalho da tela exibindo o
 * numero certo o tempo todo.
 *
 * ATENCAO: divergir NAO e, sozinho, defeito. O jid pode ser o numero do responsavel, ou o
 * segundo aparelho da familia — legitimo e diferente do cadastro. Quem decide mostrar o
 * aviso exige tambem uma falha de envio; sem isso o alerta acusaria conversa saudavel, e
 * alerta que erra muito e alerta que a equipe aprende a ignorar.
 */
export function conversaDivergeDoCadastro(
  jid: string | null | undefined,
  aluno: CadastroDeEnvio | null | undefined,
): boolean {
  const cadastro = numeroDeEnvioDoCadastro(aluno);
  if (!jid || !cadastro) return false;
  return !mesmoTelefone(jid, cadastro);
}
