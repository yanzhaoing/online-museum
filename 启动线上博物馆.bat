@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "PORT=8765"
set "URL=http://127.0.0.1:%PORT%/online-museum/index.html"
set "PID_FILE=%ROOT%.online-museum-server.pid"

cd /d "%ROOT%"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Python is still needed for catalog rebuild scripts.
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Please install Node.js or add npm to PATH.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$port=%PORT%; $root='%ROOT%'; $pidFile='%PID_FILE%'; $listening=Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object {$_.State -eq 'Listen'}; if (-not $listening) { $proc=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c','npm run dev') -WorkingDirectory $root -WindowStyle Hidden -PassThru; Set-Content -LiteralPath $pidFile -Value $proc.Id -Encoding ascii; Start-Sleep -Seconds 2; exit 0 }; $owner=$listening | Select-Object -First 1 -ExpandProperty OwningProcess; $proc=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $owner) -ErrorAction SilentlyContinue; if ($proc -and $proc.CommandLine -match 'vite') { Set-Content -LiteralPath $pidFile -Value $owner -Encoding ascii; exit 0 }; Write-Host ('Port ' + $port + ' is already used by another program. Please close it or change PORT in this BAT file.'); exit 2"

if errorlevel 2 (
  echo.
  echo Startup failed because port %PORT% is occupied by another program.
  pause
  exit /b 2
)

start "" "%URL%"

echo Online museum started:
echo %URL%
echo.
echo If the page did not open, copy the URL above into your browser.
pause
