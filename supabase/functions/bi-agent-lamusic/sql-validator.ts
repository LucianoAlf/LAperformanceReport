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
];

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
  for (const col of SENSITIVE_COLUMNS) {
    if (sqlLower.includes(col)) {
      return { valid: false, reason: `Acesso a coluna sensível bloqueado: ${col}` };
    }
  }

  for (const table of BLOCKED_TABLES) {
    if (sqlLower.includes(table.toLowerCase())) {
      return { valid: false, reason: `Acesso à tabela bloqueado: ${table}` };
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
