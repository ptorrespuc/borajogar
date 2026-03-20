param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$SqlFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);

  [DllImport("Advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
  public static extern bool CredFree([In] IntPtr cred);
}
"@

function Get-SupabaseCliToken {
  $pointer = [IntPtr]::Zero
  $ok = [CredMan]::CredRead("Supabase CLI:supabase", 1, 0, [ref]$pointer)

  if (-not $ok) {
    throw "Nao foi possivel ler a credencial 'Supabase CLI:supabase' do Windows Credential Manager."
  }

  try {
    $credential = [System.Runtime.InteropServices.Marshal]::PtrToStructure(
      $pointer,
      [type][CredMan+CREDENTIAL]
    )

    $bytes = New-Object byte[] $credential.CredentialBlobSize
    [System.Runtime.InteropServices.Marshal]::Copy(
      $credential.CredentialBlob,
      $bytes,
      0,
      $credential.CredentialBlobSize
    )

    return [System.Text.Encoding]::UTF8.GetString($bytes).TrimEnd([char]0)
  } finally {
    [CredMan]::CredFree($pointer) | Out-Null
  }
}

function Split-SqlStatements {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $statements = New-Object System.Collections.Generic.List[string]
  $current = New-Object System.Text.StringBuilder
  $inSingleQuote = $false
  $inDoubleQuote = $false
  $lineComment = $false
  $blockComment = $false
  $dollarTag = $null

  for ($i = 0; $i -lt $Sql.Length; $i++) {
    $char = $Sql[$i]
    $nextChar = if ($i + 1 -lt $Sql.Length) { $Sql[$i + 1] } else { [char]0 }

    if ($lineComment) {
      [void]$current.Append($char)
      if ($char -eq "`n") {
        $lineComment = $false
      }
      continue
    }

    if ($blockComment) {
      [void]$current.Append($char)
      if ($char -eq "*" -and $nextChar -eq "/") {
        [void]$current.Append($nextChar)
        $i++
        $blockComment = $false
      }
      continue
    }

    if ($null -ne $dollarTag) {
      if (
        $char -eq "$" -and
        $i + $dollarTag.Length - 1 -lt $Sql.Length -and
        $Sql.Substring($i, $dollarTag.Length) -eq $dollarTag
      ) {
        [void]$current.Append($dollarTag)
        $i += $dollarTag.Length - 1
        $dollarTag = $null
        continue
      }

      [void]$current.Append($char)
      continue
    }

    if ($inSingleQuote) {
      [void]$current.Append($char)
      if ($char -eq "'" -and $nextChar -eq "'") {
        [void]$current.Append($nextChar)
        $i++
        continue
      }
      if ($char -eq "'") {
        $inSingleQuote = $false
      }
      continue
    }

    if ($inDoubleQuote) {
      [void]$current.Append($char)
      if ($char -eq '"' -and $nextChar -eq '"') {
        [void]$current.Append($nextChar)
        $i++
        continue
      }
      if ($char -eq '"') {
        $inDoubleQuote = $false
      }
      continue
    }

    if ($char -eq "-" -and $nextChar -eq "-") {
      [void]$current.Append($char)
      [void]$current.Append($nextChar)
      $i++
      $lineComment = $true
      continue
    }

    if ($char -eq "/" -and $nextChar -eq "*") {
      [void]$current.Append($char)
      [void]$current.Append($nextChar)
      $i++
      $blockComment = $true
      continue
    }

    if ($char -eq "'") {
      [void]$current.Append($char)
      $inSingleQuote = $true
      continue
    }

    if ($char -eq '"') {
      [void]$current.Append($char)
      $inDoubleQuote = $true
      continue
    }

    if ($char -eq "$") {
      $closingIndex = $Sql.IndexOf("$", $i + 1)
      if ($closingIndex -gt $i) {
        $candidate = $Sql.Substring($i, $closingIndex - $i + 1)
        if ($candidate -match '^\$[A-Za-z_][A-Za-z0-9_]*\$$|^\$\$$') {
          [void]$current.Append($candidate)
          $i = $closingIndex
          $dollarTag = $candidate
          continue
        }
      }
    }

    if ($char -eq ";") {
      $statement = $current.ToString().Trim()
      if ($statement.Length -gt 0) {
        $statements.Add($statement)
      }
      $current.Clear() | Out-Null
      continue
    }

    [void]$current.Append($char)
  }

  $remaining = $current.ToString().Trim()
  if ($remaining.Length -gt 0) {
    $statements.Add($remaining)
  }

  return $statements
}

function Invoke-SupabaseManagementQuery {
  param(
    [Parameter(Mandatory = $true)][string]$Token,
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$Query
  )

  $headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
    Accept = "application/json"
  }

  $body = @{ query = $Query } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" -Headers $headers -Method Post -Body $body
}

function Invoke-SupabaseManagementQueryWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$Token,
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$Query,
    [int]$MaxAttempts = 5,
    [int]$DelaySeconds = 4
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      return Invoke-SupabaseManagementQuery -Token $Token -ProjectRef $ProjectRef -Query $Query
    } catch {
      if ($attempt -ge $MaxAttempts) {
        throw
      }

      Write-Output ("Retrying statement after failure ({0}/{1})" -f $attempt, $MaxAttempts)
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

$token = Get-SupabaseCliToken
$sql = Get-Content -Path $SqlFile -Raw
$statements = Split-SqlStatements -Sql $sql

if ($statements.Count -eq 0) {
  throw "Nenhuma instrucao SQL encontrada em $SqlFile."
}

Write-Output "Applying $($statements.Count) statements from $SqlFile"

for ($index = 0; $index -lt $statements.Count; $index++) {
  $statement = $statements[$index]
  $preview = ($statement -replace '\s+', ' ')
  if ($preview.Length -gt 90) {
    $preview = $preview.Substring(0, 90) + "..."
  }

  Write-Output ("[{0}/{1}] {2}" -f ($index + 1), $statements.Count, $preview)
  Invoke-SupabaseManagementQueryWithRetry -Token $token -ProjectRef $ProjectRef -Query $statement | Out-Null
}

Write-Output "Completed $SqlFile"
