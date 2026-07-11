// @ts-nocheck
// Contrato de pre-processamento do modelo de churn — extraido do pipeline sklearn
// (ColumnTransformer: SimpleImputer + StandardScaler + OneHotEncoder).
// Espelha exatamente o que o .pkl faz antes de chamar score(). NAO editar a mao.
// Regenerar via estudo/pesquisas/churn-alunos/preprocessing_contract.json.

// Ordem das 12 features numericas (posicoes 0..11 do vetor de entrada do modelo)
export const NUM_FEATURES = [
  'idade_atual', 'tempo_permanencia_meses', 'valor_parcela', 'pct_desconto',
  'numero_renovacoes', 'dias_desde_renovacao', 'nunca_renovou',
  'taxa_presenca_geral', 'taxa_presenca_60d', 'taxa_presenca_30d',
  'dias_desde_ultima_aula', 'dia_vencimento',
];

// Mediana do treino — usada pra imputar numerica nula (mesma ordem de NUM_FEATURES)
export const NUM_MEDIAN = [
  12.0, 10.0, 385.0, 0.16331096196868009, 0.0, -1.0, 1.0,
  0.7, 0.6666666666666666, 0.6, 5.0, 5.0,
];

export const SCALER_MEAN = [
  16.496339677891655, 15.584919472913617, 345.1919546120059, 0.25559237935596624,
  0.07759882869692533, 11.493411420204978, 0.8279648609077599, 0.6307777929336194,
  0.6102207126733128, 0.5468352339126821, 8.48462664714495, 5.685212298682284,
];

export const SCALER_SCALE = [
  13.810935301180862, 17.41004172764604, 140.61740832459094, 1.441293883742622,
  0.27562590047345914, 32.28283046040077, 0.37741098289497854, 0.2546972377986277,
  0.27870224996629567, 0.31972124937967045, 13.976113725755416, 2.780216831189348,
];

// Ordem das 10 features categoricas
export const CAT_FEATURES = [
  'classificacao', 'modalidade', 'tipo_aluno', 'status_pagamento',
  'tipo_matricula_nome', 'canal_origem_nome', 'forma_pagamento_nome',
  'is_segundo_curso', 'is_aluno_retorno', 'anamnese_preenchida',
];

// Valor de imputacao de categorica nula (antes do one-hot)
export const CAT_FILL = 'desconhecido';

// Categorias conhecidas por coluna (ordem = ordem das colunas one-hot no vetor).
// handle_unknown='ignore': valor fora da lista -> todas as colunas dessa feature = 0.
export const CAT_CATEGORIES = [
  ['EMLA', 'LAMK'],
  ['individual', 'turma'],
  ['bolsista_integral', 'bolsista_parcial', 'nao_pagante', 'pagante', 'pagante_2_curso'],
  ['desconhecido', 'em_dia', 'inadimplente', 'sem_parcela'],
  ['Bolsista Integral', 'Bolsista Parcial', 'Matrícula em Banda', 'Regular', 'Segundo Curso', 'Transferencia Interna'],
  ['Ex-aluno', 'Facebook', 'Family', 'Google', 'Indicação', 'Instagram', 'Outros', 'Visita/Placa', 'desconhecido'],
  ['Boleto', 'Cartão de Débito', 'Cheque', 'Crédito Recorrente', 'Dinheiro', 'Pix', 'desconhecido'],
  ['False', 'True', 'desconhecido'],
  ['False', 'True'],
  ['False', 'True'],
];

// Importancia global de cada feature original (Random Forest feature_importances_ agregada
// das colunas one-hot). Usada pra montar os 'fatores' (explicabilidade) por aluno.
export const FEATURE_IMPORTANCE: Record<string, number> = {
  taxa_presenca_geral: 0.2302,
  taxa_presenca_30d: 0.2222,
  taxa_presenca_60d: 0.1935,
  dias_desde_ultima_aula: 0.1566,
  tempo_permanencia_meses: 0.0384,
  valor_parcela: 0.0317,
  status_pagamento: 0.0229,
  pct_desconto: 0.0219,
  idade_atual: 0.0136,
  forma_pagamento_nome: 0.0123,
  tipo_matricula_nome: 0.0116,
  dias_desde_renovacao: 0.0115,
  tipo_aluno: 0.0082,
  nunca_renovou: 0.0073,
  is_segundo_curso: 0.0057,
  canal_origem_nome: 0.0042,
  classificacao: 0.0038,
  dia_vencimento: 0.0020,
  numero_renovacoes: 0.0014,
  modalidade: 0.0007,
  anamnese_preenchida: 0.0002,
  is_aluno_retorno: 0.0000,
};

// Faixas de risco a partir da probabilidade (0..1).
// Vocabulario alinhado a check constraint de risco_evasao (baixo/atencao/critico),
// mesmo dos status do health score.
export function faixaRisco(p: number): 'baixo' | 'atencao' | 'critico' {
  if (p < 0.3) return 'baixo';
  if (p < 0.6) return 'atencao';
  return 'critico';
}

// Versao do modelo — gravada em risco_evasao.modelo_versao pra rastrear qual modelo pontuou.
export const MODELO_VERSAO = 'rf_churn_v1_2026-07-02';
