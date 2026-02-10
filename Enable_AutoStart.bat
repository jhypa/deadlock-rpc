@echo off
echo Installing Deadlock RPC to Startup...

set "TARGET_SCRIPT=%~dp0Start_Hidden.vbs"
set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DeadlockRPC.lnk"

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_SCRIPT%'; $s.WorkingDirectory = '%~dp0'; $s.Save()"

echo.
echo Success! Deadlock RPC will now start silently when you log in.
echo You can close this window.
pause