@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT=%~dp0"
set "PID_FILE=%ROOT%.online-museum-server.pid"
set "PORT_FILE=%ROOT%.online-museum-server.port"
set "NODEJS_DIR=C:\Program Files\nodejs"

cd /d "%ROOT%"

if exist "%NODEJS_DIR%\node.exe" (
  set "PATH=%NODEJS_DIR%;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js LTS, then run this file again:
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Please reinstall Node.js LTS.
  echo.
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules\" (
  echo Installing project dependencies. This only needs to run the first time...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed. Check the npm error above.
    pause
    exit /b 1
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root='%ROOT%'; $pidFile='%PID_FILE%'; $portFile='%PORT_FILE%'; $port=8765; $existingMuseum=$null; foreach ($candidate in 8765..8795) { $listening=Get-NetTCPConnection -LocalPort $candidate -ErrorAction SilentlyContinue | Where-Object {$_.State -eq 'Listen'}; if ($listening) { $owner=$listening | Select-Object -First 1 -ExpandProperty OwningProcess; $proc=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $owner) -ErrorAction SilentlyContinue; if ($proc -and ($proc.CommandLine -match 'vite' -or $proc.CommandLine -match 'npm.cmd run dev' -or $proc.CommandLine -match 'npm run dev')) { $existingMuseum=@{ Port=$candidate; Pid=$owner }; break } } }; if ($existingMuseum) { Set-Content -LiteralPath $pidFile -Value $existingMuseum.Pid -Encoding ascii; Set-Content -LiteralPath $portFile -Value $existingMuseum.Port -Encoding ascii; exit 0 }; foreach ($candidate in 8765..8795) { $listening=Get-NetTCPConnection -LocalPort $candidate -ErrorAction SilentlyContinue | Where-Object {$_.State -eq 'Listen'}; if (-not $listening) { $port=$candidate; break } }; if ($port -eq 8795 -and (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object {$_.State -eq 'Listen'})) { Write-Host 'No free port found between 8765 and 8795.'; exit 2 }; $cmd='npm.cmd run dev -- --host 127.0.0.1 --port ' + $port; $proc=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/c',$cmd) -WorkingDirectory $root -WindowStyle Hidden -PassThru; Set-Content -LiteralPath $pidFile -Value $proc.Id -Encoding ascii; Set-Content -LiteralPath $portFile -Value $port -Encoding ascii; Start-Sleep -Seconds 4; exit 0"

if errorlevel 2 (
  echo.
  echo Startup failed because no available port was found.
  pause
  exit /b 2
)

set /p PORT=<"%PORT_FILE%"
set "URL=http://127.0.0.1:%PORT%/online-museum/index.html"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url='%URL%'; $ok=$false; for ($i=0; $i -lt 20; $i++) { try { $r=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok=$true; break } } catch { Start-Sleep -Milliseconds 500 } }; if (-not $ok) { Write-Host 'Vite started but the page did not respond yet. Wait a few seconds and refresh the browser.'; exit 3 }"

start "" "%URL%"

echo Online museum started:
echo %URL%
echo.
echo If the page did not open, copy the URL above into your browser.
pause
