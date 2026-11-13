' Mando PC: arranca el servidor en segundo plano (si no estaba ya) y abre el panel, sin consola.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "node scripts\launch.js", 0, False
