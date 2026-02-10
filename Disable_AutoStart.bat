:: Save this as Disable_AutoStart.bat
@echo off
echo Removing Deadlock RPC from Startup...
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DeadlockRPC.lnk"
echo.
echo Removed. You can still run the program manually.
pause