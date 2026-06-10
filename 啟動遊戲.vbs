' Chronicle of Veilreach - silent launcher
' Starts:
'   1. python http.server on 8765 (frontend static files)
'   2. node server.js on 8766 (backend API + SQLite)
' Then opens browser to localhost:8765

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = projectDir

' ===== 1. 前端 8765 =====
frontendAlive = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.open "GET", "http://localhost:8765/", False
http.send
If Err.Number = 0 And http.status = 200 Then frontendAlive = True
On Error GoTo 0

If Not frontendAlive Then
  shell.Run "cmd /c python -m http.server 8765", 0, False
  ' 等最多 5 秒看到 server 起來
  i = 0
  Do While i < 20
    WScript.Sleep 250
    On Error Resume Next
    Err.Clear
    http.open "GET", "http://localhost:8765/", False
    http.send
    If Err.Number = 0 And http.status = 200 Then
      frontendAlive = True
      Exit Do
    End If
    On Error GoTo 0
    i = i + 1
  Loop
End If

' ===== 2. 後端 8766 =====
backendAlive = False
On Error Resume Next
http.open "GET", "http://localhost:8766/api/health", False
http.send
If Err.Number = 0 And http.status = 200 Then backendAlive = True
On Error GoTo 0

If Not backendAlive Then
  shell.Run "cmd /c cd /d """ & projectDir & "\server"" && node server.js", 0, False
  ' Node 啟動慢一點，等最多 8 秒
  i = 0
  Do While i < 32
    WScript.Sleep 250
    On Error Resume Next
    Err.Clear
    http.open "GET", "http://localhost:8766/api/health", False
    http.send
    If Err.Number = 0 And http.status = 200 Then
      backendAlive = True
      Exit Do
    End If
    On Error GoTo 0
    i = i + 1
  Loop
End If

' ===== 3. 開瀏覽器 =====
shell.Run "cmd /c start """" http://localhost:8765/", 0, False
