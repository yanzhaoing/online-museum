@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "PORT=8765"
set "PID_FILE=%ROOT%.online-museum-server.pid"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port=%PORT%; $pidFile='%PID_FILE%'; $candidateIds=@(); if (Test-Path -LiteralPath $pidFile) { $saved=Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1; if ($saved -match '^\d+$') { $candidateIds += [int]$saved } }; $connections=Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object {$_.State -eq 'Listen'}; if ($connections) { $candidateIds += ($connections | Select-Object -ExpandProperty OwningProcess -Unique) }; $candidateIds=$candidateIds | Select-Object -Unique; if (-not $candidateIds) { Write-Host 'Online museum service is not running.'; exit 0 }; $stopped=$false; foreach ($processId in $candidateIds) { $proc=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $processId) -ErrorAction SilentlyContinue; if ($proc -and ($proc.CommandLine -match 'vite' -or $proc.CommandLine -match 'npm run dev')) { Stop-Process -Id $processId -Force; Write-Host ('Stopped online museum service on port ' + $port + ' process ' + $processId); $stopped=$true } }; if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }; if (-not $stopped) { Write-Host 'No matching online museum Vite service was found. Nothing was stopped.' }"

echo.
echo Close this window when finished.
pause
