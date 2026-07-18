param(
  [string]$DownloadsPath = (Join-Path $env:USERPROFILE 'Downloads'),
  [int[]]$ProfessorIds = @(),
  [string[]]$Unidades = @()
)

$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture

$sources = @(
  [pscustomobject]@{
    unidade = 'Barra'
    arquivo = 'relatorio_exportado (5).xlsx'
    professores = @(
      [pscustomobject]@{ id = 26; nome = 'Matheus Lana da Silva'; alias = 'Matheus Silva'; alias_pattern = 'Matheus Silva' }
      [pscustomobject]@{ id = 3; nome = 'Daiana Pacifico da Silva dos Anjos'; alias = 'Daiana Anjos'; alias_pattern = 'Daiana Anjos' }
      [pscustomobject]@{ id = 6; nome = 'Gabriel Antony Alves de Araujo'; alias = 'Gabriel Araujo'; alias_pattern = 'Gabriel Ara.jo' }
      [pscustomobject]@{ id = 49; nome = 'Jeyson Gaia Ramos'; alias = 'Jeyson Ramos'; alias_pattern = 'Jeyson Ramos' }
    )
  }
  [pscustomobject]@{
    unidade = 'Campo Grande'
    arquivo = 'relatorio_exportado (2).xlsx'
    professores = @(
      [pscustomobject]@{ id = 30; nome = 'Pedro Sergio Figueiredo da Gloria'; alias = 'Pedro Gloria'; alias_pattern = 'Pedro Gl.ria' }
      [pscustomobject]@{ id = 14; nome = 'Jordan Barbosa do Rego'; alias = 'Jordan Rego'; alias_pattern = 'Jordan R.go' }
      [pscustomobject]@{ id = 7; nome = 'Gabriel Barbosa Rufino Otavio'; alias = 'Gabriel Otavio'; alias_pattern = 'Gabriel Ot.vio' }
      [pscustomobject]@{ id = 35; nome = 'Rodrigo Pinheiro Gomes'; alias = 'Rodrigo Gomes'; alias_pattern = 'Rodrigo Gomes' }
    )
  }
  [pscustomobject]@{
    unidade = 'Recreio'
    arquivo = 'relatorio_exportado (4).xlsx'
    professores = @(
      [pscustomobject]@{ id = 33; nome = 'Ramon Pina Morais'; alias = 'Ramon Morais'; alias_pattern = 'Ramon Morais' }
      [pscustomobject]@{ id = 43; nome = 'Alexandre de Sa Ritta do Espirito Santo'; alias = 'Alexandre Santo'; alias_pattern = 'Alexandre Santo' }
      [pscustomobject]@{ id = 32; nome = 'Rafael Alves Souza (Akeem)'; alias = 'Rafael (Akeem)'; alias_pattern = 'Rafael \(Akeem\)' }
      [pscustomobject]@{ id = 21; nome = 'Lucas da Silva Guimaraes'; alias = 'Lucas Guimaraes'; alias_pattern = 'Lucas Guimar.es' }
    )
  }
)

function Get-HeaderColumn {
  param(
    [hashtable]$Headers,
    [string]$Pattern
  )

  $header = $Headers.Keys |
    Where-Object { $_ -match $Pattern } |
    Select-Object -First 1
  if (-not $header) {
    throw "Cabecalho nao encontrado: $Pattern"
  }
  return $Headers[$header]
}

function Convert-DateOrNull {
  param([string]$Value)

  if ($Value -notmatch '(?<date>\d{2}/\d{2}/\d{4})') {
    return $null
  }
  return [datetime]::ParseExact($Matches.date, 'dd/MM/yyyy', $culture)
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$result = @()

try {
  $selectedSources = @(
    $sources | Where-Object {
      $Unidades.Count -eq 0 -or $_.unidade -in $Unidades
    }
  )

  foreach ($source in $selectedSources) {
    $path = Join-Path $DownloadsPath $source.arquivo
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Arquivo obrigatorio nao encontrado: $path"
    }

    $workbook = $excel.Workbooks.Open($path, 0, $true)
    try {
      $sheet = $workbook.Worksheets.Item(1)
      $usedRange = $sheet.UsedRange
      $values = $usedRange.Value2
      $headers = @{}

      for ($column = 1; $column -le $usedRange.Columns.Count; $column++) {
        $headers[[string]$values[1, $column]] = $column
      }

      $studentNumberColumn = Get-HeaderColumn $headers '^N. do Aluno$'
      $studentNameColumn = Get-HeaderColumn $headers '^Aluno\(a\)$'
      $enrollmentColumn = Get-HeaderColumn $headers '^Matriculas / Sit'
      $enrollmentDateColumn = Get-HeaderColumn $headers '^Data Matric\.'

      $selectedProfessors = @(
        $source.professores | Where-Object {
          $ProfessorIds.Count -eq 0 -or $_.id -in $ProfessorIds
        }
      )

      foreach ($professor in $selectedProfessors) {
        $periods = @()
        $alignmentErrors = @()

        for ($row = 2; $row -le $usedRange.Rows.Count; $row++) {
          $studentNumber = [string]$values[$row, $studentNumberColumn]
          $studentName = [string]$values[$row, $studentNameColumn]
          $enrollmentsText = [string]$values[$row, $enrollmentColumn]
          if ($enrollmentsText -notmatch $professor.alias_pattern) {
            continue
          }

          $enrollmentDatesText = [string]$values[$row, $enrollmentDateColumn]
          $dateBlocks = @(
            [regex]::Matches($enrollmentDatesText, '\d{2}/\d{2}/\d{4}') |
              ForEach-Object { $_.Value }
          )
          $enrollmentBlocks = @(
            [regex]::Matches(
              $enrollmentsText,
              '(?im)(?:^|\r?\n)(?<curso>[^\r\n]+)\s*\r?\n(?:-(?<modulo>(?!Prof\.)[^\r\n]+)\s*\r?\n)?-Prof\.\s*(?<professor>[^\r\n]+)\s*\r?\n-\s*(?<status>Interrompido|Conclu.do|Finalizado|Trancado|N.o Renovou|Em Andamento)(?:\s*(?:\(Conclus.o|em)\s*(?<fim>\d{2}/\d{2}/\d{4})\)?)?'
            )
          )

          if ($enrollmentBlocks.Count -ne $dateBlocks.Count) {
            $alignmentErrors += [pscustomobject]@{
              numero_aluno_export = $studentNumber
              aluno = $studentName
              blocos_matricula = $enrollmentBlocks.Count
              blocos_data = $dateBlocks.Count
            }
          }

          for ($index = 0; $index -lt $enrollmentBlocks.Count; $index++) {
            $block = $enrollmentBlocks[$index]
            if ($block.Groups['professor'].Value.Trim() -notmatch ('^' + $professor.alias_pattern + '$')) {
              continue
            }

            $start = if ($index -lt $dateBlocks.Count) {
              Convert-DateOrNull $dateBlocks[$index]
            } else {
              $null
            }
            $end = Convert-DateOrNull $block.Groups['fim'].Value
            $statusRaw = $block.Groups['status'].Value
            $status = if ($statusRaw -match '(?i)Em Andamento') {
              'em_andamento'
            } else {
              $statusRaw.ToLowerInvariant()
            }
            $months = if ($start -and $end -and $end -ge $start) {
              ($end - $start).TotalDays / 30.44
            } else {
              $null
            }

            $periods += [pscustomobject]@{
              numero_aluno_export = $studentNumber
              aluno = $studentName
              curso = $block.Groups['curso'].Value.Trim()
              modulo = $block.Groups['modulo'].Value.Trim()
              inicio_matricula = if ($start) { $start.ToString('yyyy-MM-dd') } else { $null }
              fim_administrativo = if ($end) { $end.ToString('yyyy-MM-dd') } else { $null }
              status = $status
              meses_matricula = $months
            }
          }
        }

        $closed = @($periods | Where-Object { $_.fim_administrativo })
        $eligible = @($closed | Where-Object { $_.meses_matricula -ge 4 })
        $average = ($eligible | Measure-Object meses_matricula -Average).Average

        $result += [pscustomobject]@{
          unidade = $source.unidade
          arquivo = $source.arquivo
          professor_id = $professor.id
          professor = $professor.nome
          alias_export = $professor.alias
          pessoas = @($periods.numero_aluno_export | Sort-Object -Unique).Count
          periodos_administrativos = $periods.Count
          encerrados = $closed.Count
          ativos = @($periods | Where-Object { $_.status -eq 'em_andamento' }).Count
          elegiveis_quatro_meses = $eligible.Count
          inicio_mais_antigo = (
            $periods |
              Where-Object { $_.inicio_matricula } |
              Sort-Object inicio_matricula |
              Select-Object -First 1
          ).inicio_matricula
          media_matricula_nao_oficial = if ($null -eq $average) {
            $null
          } else {
            [math]::Round($average, 2)
          }
          divergencias_alinhamento = $alignmentErrors.Count
          divergencias = @($alignmentErrors)
          periodos = @($periods)
        }
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

$result | ConvertTo-Json -Depth 8
