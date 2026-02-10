Set WshShell = CreateObject("WScript.Shell") 
WshShell.Run "DeadlockRPC.exe", 0, False
Set WshShell = Nothing