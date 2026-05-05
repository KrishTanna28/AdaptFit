$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $Root ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$EnvFile = Join-Path $Root ".env"

function Import-EnvFile {
  param([string]$Path)

  if (!(Test-Path $Path)) {
    throw "Food detector .env is missing. Copy food-detector\.env.example to food-detector\.env and edit it."
  }

  Get-Content $Path | ForEach-Object {
    $Line = $_.Trim()
    if (!$Line -or $Line.StartsWith("#")) {
      return
    }

    $SeparatorIndex = $Line.IndexOf("=")
    if ($SeparatorIndex -lt 1) {
      return
    }

    $Name = $Line.Substring(0, $SeparatorIndex).Trim()
    $Value = $Line.Substring($SeparatorIndex + 1).Trim().Trim('"').Trim("'")
    if (!(Get-Item -Path "Env:$Name" -ErrorAction SilentlyContinue)) {
      Set-Item -Path "Env:$Name" -Value $Value
    }
  }
}

function Require-Env {
  param([string]$Name)

  $Value = (Get-Item -Path "Env:$Name" -ErrorAction SilentlyContinue).Value
  if (!$Value) {
    throw "$Name must be set in food-detector\.env."
  }
  return $Value
}

if (!(Test-Path $Python)) {
  throw "Food detector venv is missing. Run .\food-detector\setup.ps1 first."
}

Import-EnvFile $EnvFile

$HostValue = Require-Env "FOOD_DETECTOR_HOST"
$PortValue = Require-Env "FOOD_DETECTOR_PORT"

& $Python -m uvicorn server:app --host $HostValue --port $PortValue --app-dir $Root
