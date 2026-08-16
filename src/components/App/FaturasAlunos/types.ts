import type { InadimplenciaCanonicaItem } from '@/lib/inadimplenciaCanonica';

export type FaturaAlunoSelecionada = InadimplenciaCanonicaItem | null;

export interface CadastroFaturaAlunoRow {
  id: number;
  nome: string;
  unidade_id: string;
  status: string | null;
  cursos: { nome: string | null } | { nome: string | null }[] | null;
}
