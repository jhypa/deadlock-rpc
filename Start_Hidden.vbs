Set WshShell = CreateObject("WScript.Shell") 
WshShell.Run "bun run deadlock_service.ts", 0
Set WshShell = Nothing