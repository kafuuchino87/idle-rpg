' 在桌面建立「幻域編年史」捷徑（雙擊一次即可，之後從桌面點即可開遊戲）
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
desktop = shell.SpecialFolders("Desktop")

shortcutPath = desktop & "\幻域編年史.lnk"
Set lnk = shell.CreateShortcut(shortcutPath)
lnk.TargetPath = "wscript.exe"
lnk.Arguments = """" & projectDir & "\啟動遊戲.vbs"""
lnk.WorkingDirectory = projectDir
lnk.IconLocation = projectDir & "\veilreach.ico, 0"
lnk.Description = "幻域編年史 · Chronicle of Veilreach — 銀月狐巫月凜的旅程"
lnk.WindowStyle = 1
lnk.Save

MsgBox "桌面捷徑已建立：幻域編年史" & vbCrLf & vbCrLf & "雙擊桌面圖示即可啟動遊戲。", 64, "完成"
