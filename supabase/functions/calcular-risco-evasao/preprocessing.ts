// @ts-nocheck
// Monta o vetor de 54 dimensoes que o modelo espera, a partir das features
// engenheiradas cruas de um aluno. Espelha exatamente o ColumnTransformer do pkl:
//   numericas: imputa mediana (se null) -> padroniza (x-mean)/scale
//   categoricas: imputa 'desconhecido' (se null) -> one-hot (handle_unknown=ignore)
// Validado contra pkl.prep.transform (diff 0.00) — ver estudo/.../validate_port.py

import {
  NUM_FEATURES, NUM_MEDIAN, SCALER_MEAN, SCALER_SCALE,
  CAT_FEATURES, CAT_FILL, CAT_CATEGORIES,
} from './contract.ts';

// Linha engenheirada: 12 numericas (podem vir null) + 10 categoricas (string ou null).
export interface FeaturesAluno {
  idade_atual: number | null;
  tempo_permanencia_meses: number | null;
  valor_parcela: number | null;
  pct_desconto: number | null;
  numero_renovacoes: number | null;
  dias_desde_renovacao: number | null;
  nunca_renovou: number | null;
  taxa_presenca_geral: number | null;
  taxa_presenca_60d: number | null;
  taxa_presenca_30d: number | null;
  dias_desde_ultima_aula: number | null;
  dia_vencimento: number | null;
  classificacao: string | null;
  modalidade: string | null;
  tipo_aluno: string | null;
  status_pagamento: string | null;
  tipo_matricula_nome: string | null;
  canal_origem_nome: string | null;
  forma_pagamento_nome: string | null;
  is_segundo_curso: string | null;
  is_aluno_retorno: string | null;
  anamnese_preenchida: string | null;
}

function isNil(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

export function buildVector(row: FeaturesAluno): number[] {
  const vec: number[] = [];

  // numericas: impute mediana -> scale
  for (let i = 0; i < NUM_FEATURES.length; i++) {
    let v = (row as Record<string, unknown>)[NUM_FEATURES[i]] as number | null;
    if (isNil(v)) v = NUM_MEDIAN[i];
    vec.push((Number(v) - SCALER_MEAN[i]) / SCALER_SCALE[i]);
  }

  // categoricas: impute 'desconhecido' -> one-hot
  for (let j = 0; j < CAT_FEATURES.length; j++) {
    let v = (row as Record<string, unknown>)[CAT_FEATURES[j]] as string | null;
    const val = isNil(v) ? CAT_FILL : String(v);
    const cats = CAT_CATEGORIES[j];
    for (let k = 0; k < cats.length; k++) {
      vec.push(val === cats[k] ? 1.0 : 0.0);
    }
  }

  return vec;
}
