// Validação e sanitização de SQL para o agente BI

const DANGEROUS_PATTERNS = [
  /;\s*DROP\s+/i, /;\s*DELETE\s+/i, /;\s*TRUNCATE\s+/i,
  /;\s*UPDATE\s+.*SET\s+/i, /;\s*INSERT\s+/i,
  /;\s*ALTER\s+/i, /;\s*CREATE\s+/i,
  /--/, /\/\*/, /UNION\s+SELECT/i,
  /INTO\s+OUTFILE/i, /LOAD_FILE/i,
  /;\s*GRANT\s+/i, /;\s*REVOKE\s+/i, /;\s*EXECUTE\s+/i,
];

const SENSITIVE_COLUMNS = ['password', 'senha', 'api_key', 'secret', 'token', 'hash'];

const BLOCKED_TABLES = [
  'bi_agent_config_lamusic', 'bi_query_cache_lamusic',
  'auth.users', 'whatsapp_caixas', 'mila_config', 'assistente_ia_config',
  'aluno_presenca',
];

const BLOCKED_ANALYTICAL_COLUMNS = ['percentual_presenca'];
const ALLOWED_PRESENCE_RELATIONS = new Set(['vw_presenca_ocorrencia_canonica_v2']);
const PRESENCE_RELATION_PATTERN = /(?:presenca|frequencia|absenteismo)/iu;

function extractSQLRelations(sql: string): string[] {
  const relations: string[] = [];
  const relationPattern = /\b(?:from|join)\s+(?:"?[a-z_][\w$]*"?\.)?"?([a-z_][\w$]*)"?/giu;
  let match: RegExpExecArray | null;
  while ((match = relationPattern.exec(sql)) !== null) relations.push(match[1].toLowerCase());
  return relations;
}

export function validateSQL(sql: string): { valid: boolean; reason?: string } {
  const trimmed = sql.trim();

  if (!trimmed.toUpperCase().startsWith('SELECT') && !trimmed.toUpperCase().startsWith('WITH')) {
    return { valid: false, reason: 'Apenas SELECT e WITH (CTE) são permitidos.' };
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Padrão SQL perigoso detectado: ${pattern.source}` };
    }
  }

  const sqlLower = trimmed.toLowerCase();
  for (const col of BLOCKED_ANALYTICAL_COLUMNS) {
    if (new RegExp(`\\b${col}\\b`, 'iu').test(trimmed)) {
      return { valid: false, reason: `Acesso a coluna analítica legada bloqueado: ${col}` };
    }
  }

  for (const col of SENSITIVE_COLUMNS) {
    if (sqlLower.includes(col)) {
      return { valid: false, reason: `Acesso a coluna sensível bloqueado: ${col}` };
    }
  }

  for (const table of BLOCKED_TABLES) {
    const escapedTable = table.replace('.', '\\.');
    if (new RegExp(`\\b${escapedTable}\\b`, 'iu').test(trimmed)) {
      return { valid: false, reason: `Acesso à tabela bloqueado: ${table}` };
    }
  }

  for (const relation of extractSQLRelations(trimmed)) {
    if (PRESENCE_RELATION_PATTERN.test(relation) && !ALLOWED_PRESENCE_RELATIONS.has(relation)) {
      return {
        valid: false,
        reason: `Relação de presença não canônica bloqueada: ${relation}. Use vw_presenca_ocorrencia_canonica_v2 ou a tool get_presenca_canonica.`,
      };
    }
  }

  return { valid: true };
}

export function ensureLimit(sql: string, maxRows: number): string {
  if (!/\bLIMIT\b/i.test(sql)) {
    return `${sql.replace(/;\s*$/, '')} LIMIT ${maxRows}`;
  }
  return sql;
}

export function normalizeSQL(sql: string): string {
  return sql.toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\s*=\s*/g, '=').trim();
}

export function extractTablesFromText(text: string): string[] {
  const matches = text.match(/(?:relation|table)\s+"?(\w+)"?/gi) || [];
  const tables: string[] = [];
  for (const m of matches) {
    const name = m.replace(/(?:relation|table)\s+"?/i, '').replace(/"$/, '');
    if (name && !tables.includes(name)) tables.push(name);
  }
  // Also extract from FROM/JOIN clauses
  const fromMatches = text.match(/(?:FROM|JOIN)\s+(\w+)/gi) || [];
  for (const m of fromMatches) {
    const name = m.replace(/(?:FROM|JOIN)\s+/i, '');
    if (name && !tables.includes(name) && !['select', 'where', 'and', 'or', 'on'].includes(name.toLowerCase())) {
      tables.push(name);
    }
  }
  return tables;
}
