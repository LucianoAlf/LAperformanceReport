/**
 * O mínimo que a linha e a folha precisam saber de um aluno.
 *
 * Deliberadamente ESTRUTURAL, não um tipo novo de domínio: tanto o `Aluno` da
 * `AlunosPage` (que já traz `professor_nome`/`curso_nome`/`unidade_codigo`
 * planos) quanto o `AlunoLista` de `useAlunosLista` satisfazem isto sem
 * conversão. Um tipo próprio obrigaria um adaptador, e adaptador entre duas
 * formas da mesma entidade é onde elas começam a divergir.
 *
 * Tudo além de `id` e `nome` é opcional porque as duas origens preenchem
 * conjuntos diferentes — a folha esconde o campo que não veio em vez de
 * mostrar "—", que não informa nada.
 */
export interface AlunoNaLinha {
  id: number;
  nome: string;
  status?: string | null;
  status_pagamento?: string | null;
  aguardando_renovacao?: boolean | null;
  dia_aula?: string | null;
  horario_aula?: string | null;
  professor_nome?: string | null;
  curso_nome?: string | null;
  unidade_codigo?: string | null;
  tipo_matricula_nome?: string | null;
  valor_parcela?: number | null;
  dia_vencimento?: number | null;
  data_matricula?: string | null;
  data_saida?: string | null;
  tempo_permanencia_meses?: number | null;
  anamnese_preenchida?: boolean | null;
  telefone?: string | null;
  whatsapp?: string | null;
  responsavel_telefone?: string | null;
}
