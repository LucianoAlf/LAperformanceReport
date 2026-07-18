param(
  [string[]]$Paths = @(
    'C:\Users\Texeira\Downloads\relatorio_exportado (6).xlsx',
    'C:\Users\Texeira\Downloads\relatorio_exportado (7).xlsx'
  )
)

$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$summaries = @()

try {
  foreach ($path in $Paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    $workbook = $excel.Workbooks.Open($path, 0, $true)
    try {
      $sheet = $workbook.Worksheets.Item(1)
      $usedRange = $sheet.UsedRange
      $values = $usedRange.Value2
      $rowCount = $usedRange.Rows.Count
      $columnCount = $usedRange.Columns.Count
      $headers = @{}

      for ($column = 1; $column -le $columnCount; $column++) {
        $headers[[string]$values[1, $column]] = $column
      }

      $periods = @()
      $mismatches = @()

      for ($row = 2; $row -le $rowCount; $row++) {
        $studentName = [string]$values[$row, $headers['Aluno(a)']]
        $notesHeader = $headers.Keys |
          Where-Object { $_ -match '^Observa' } |
          Select-Object -First 1
        $notes = [string]$values[$row, $headers[$notesHeader]]
        $enrollmentHeader = $headers.Keys |
          Where-Object { $_ -match '^Matriculas / Sit' } |
          Select-Object -First 1
        $enrollmentColumn = $headers[$enrollmentHeader]
        $enrollmentsText = [string]$values[$row, $enrollmentColumn]
        $enrollmentDatesText = [string]$values[$row, $headers['Data Matric.']]
        $dateBlocks = @(
          [regex]::Matches($enrollmentDatesText, '\d{2}/\d{2}/\d{4}') |
            ForEach-Object { $_.Value }
        )
        $enrollmentBlocks = @(
          [regex]::Matches(
            $enrollmentsText,
            '(?im)-Prof\.\s*(?<professor>[^\r\n]+)\s*\r?\n-\s*(?<status>Interrompido|Conclu.do|Finalizado|Trancado|N.o Renovou|Em Andamento)(?:\s*(?:\(Conclus.o|em)\s*(?<fim>\d{2}/\d{2}/\d{4})\)?)?'
          )
        )

        if (
          $enrollmentsText -match '(?i)Peterson|Biancamano' -and
          $enrollmentBlocks.Count -ne $dateBlocks.Count
        ) {
          $mismatches += [pscustomobject]@{
            aluno = $studentName
            blocos_matricula = $enrollmentBlocks.Count
            blocos_data = $dateBlocks.Count
            data_matricula = $enrollmentDatesText
            matriculas = $enrollmentsText
          }
        }

        for ($index = 0; $index -lt $enrollmentBlocks.Count; $index++) {
          $block = $enrollmentBlocks[$index]
          if ($block.Groups['professor'].Value -notmatch '(?i)Peterson|Biancamano') {
            continue
          }

          $startRaw = if ($index -lt $dateBlocks.Count) {
            $dateBlocks[$index]
          } else {
            ''
          }
          $start = $null
          $end = $null
          $status = 'outro'

          if ($startRaw -match '(?<date>\d{2}/\d{2}/\d{4})') {
            $start = [datetime]::ParseExact($Matches.date, 'dd/MM/yyyy', $culture)
          }

          $statusCapturado = $block.Groups['status'].Value
          $fimCapturado = $block.Groups['fim'].Value
          if ($statusCapturado -match '(?i)Em Andamento') {
            $status = 'em_andamento'
          } elseif ($fimCapturado) {
            $status = $statusCapturado.ToLowerInvariant()
            $end = [datetime]::ParseExact($fimCapturado, 'dd/MM/yyyy', $culture)
          }

          $months = $null
          if ($start -and $end -and $end -ge $start) {
            $months = ($end - $start).TotalDays / 30.44
          }

          $periods += [pscustomobject]@{
            aluno = $studentName
            inicio = $start
            fim = $end
            status = $status
            meses = $months
            bloco = $block.Value
            observacoes = $notes
          }
        }
      }

      $closed = @($periods | Where-Object { $_.fim })
      $eligible = @($closed | Where-Object { $_.meses -ge 4 })
      $average = ($eligible | Measure-Object meses -Average).Average

      $summaries += [pscustomobject]@{
        arquivo = [IO.Path]::GetFileName($path)
        alunos_com_peterson = @($periods.aluno | Sort-Object -Unique).Count
        blocos_peterson = $periods.Count
        encerrados = $closed.Count
        ativos = @($periods | Where-Object { $_.status -eq 'em_andamento' }).Count
        status_nao_resolvido = @(
          $periods | Where-Object { -not $_.fim -and $_.status -ne 'em_andamento' }
        ).Count
        elegiveis_quatro_meses = $eligible.Count
        inicio_mais_antigo = (
          $periods | Where-Object { $_.inicio } | Sort-Object inicio | Select-Object -First 1
        ).inicio
        inicio_mais_recente = (
          $periods | Where-Object { $_.inicio } | Sort-Object inicio -Descending | Select-Object -First 1
        ).inicio
        media_matricula_nao_oficial = if ($null -eq $average) {
          $null
        } else {
          [math]::Round($average, 2)
        }
        divergencias_alinhamento = $mismatches.Count
        divergencias = @($mismatches)
        periodos = @($periods)
      }

      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($usedRange)
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sheet)
    } finally {
      $workbook.Close($false)
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
    }
  }
} finally {
  $excel.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$summaries | ConvertTo-Json -Depth 8
