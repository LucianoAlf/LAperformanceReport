import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
  phoneColumn: string | null
  totalRows: number
}

export interface ValidacaoContatos {
  validos: { telefone: string; variaveis: Record<string, string> }[]
  duplicatas: number
  invalidos: number
  total: number
}

const PHONE_HINTS = ['phone', 'telefone', 'celular', 'whatsapp', 'numero', 'número', 'tel', 'fone', 'mobile']

function detectPhoneColumn(headers: string[]): string | null {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const hint of PHONE_HINTS) {
    const idx = lower.findIndex(h => h.includes(hint))
    if (idx !== -1) return headers[idx]
  }
  return headers[0] ?? null
}

function normalizarTelefone(raw: string): string | null {
  // Se tem múltiplos números (separados por vírgula, barra ou quebra de linha), pegar o primeiro
  const primeiro = raw.split(/[,;/\n]/).map(s => s.trim()).find(s => s.replace(/\D/g, '').length >= 10) ?? raw
  const digits = primeiro.replace(/\D/g, '')
  if (digits.length < 10) return null
  // Adicionar prefixo 55 se não tiver (telefone BR)
  if (digits.length === 10 || digits.length === 11) return '55' + digits
  if (digits.length === 12 || digits.length === 13) return digits
  return null
}

export function parseCSV(file: File): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      complete(results) {
        const headers = results.meta.fields ?? []
        const rows = results.data as Record<string, string>[]
        resolve({ headers, rows, phoneColumn: detectPhoneColumn(headers), totalRows: rows.length })
      },
      error(err: Error) { reject(err) },
    })
  })
}

export function parseBulkPhones(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map(p => p.trim().replace(/\D/g, ''))
    .filter(p => p.length >= 10)
}

export function parseExcel(file: File): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })
        const headers = rows.length > 0 ? Object.keys(rows[0]) : []
        resolve({ headers, rows, phoneColumn: detectPhoneColumn(headers), totalRows: rows.length })
      } catch (err) { reject(err) }
    }
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsArrayBuffer(file)
  })
}

/** Valida, normaliza e deduplica contatos */
export function validarContatos(
  rows: Record<string, string>[],
  phoneColumn: string,
): ValidacaoContatos {
  const vistos = new Set<string>()
  const validos: { telefone: string; variaveis: Record<string, string> }[] = []
  let duplicatas = 0
  let invalidos = 0

  for (const row of rows) {
    const rawPhone = row[phoneColumn] ?? ''
    const telefone = normalizarTelefone(rawPhone)

    if (!telefone) {
      invalidos++
      continue
    }

    if (vistos.has(telefone)) {
      duplicatas++
      continue
    }

    vistos.add(telefone)
    validos.push({ telefone, variaveis: row })
  }

  return { validos, duplicatas, invalidos, total: rows.length }
}

/** Valida telefones colados em bulk */
export function validarBulkPhones(text: string): ValidacaoContatos {
  const linhas = text.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean)
  const vistos = new Set<string>()
  const validos: { telefone: string; variaveis: Record<string, string> }[] = []
  let duplicatas = 0
  let invalidos = 0

  for (const raw of linhas) {
    const telefone = normalizarTelefone(raw)
    if (!telefone) { invalidos++; continue }
    if (vistos.has(telefone)) { duplicatas++; continue }
    vistos.add(telefone)
    validos.push({ telefone, variaveis: {} })
  }

  return { validos, duplicatas, invalidos, total: linhas.length }
}
