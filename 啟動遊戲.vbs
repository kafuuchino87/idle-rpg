' Chronicle of Veilreach - silent launcher
' Starts python http.server (background) and opens browser to localhost:8765

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = projectDir

' Try to check if server already running (don't start duplicate)
serverAlive = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.open "GET", "http://localhost:8765/", False
http.send
If Err.Number = 0 And http.status = 200 Then serverAlive = True
On Error GoTo 0

If Not serverAlive Then
  ' Start python http.server hidden (window style 0 = hidden)
  shell.Run "cmd /c python -m http.server 8765", 0, False
  ' Wait for server to come up (max 5 seconds)
  i = 0
  Do While i < 20
    WScript.Sleep 250
    On Error Resume Next
    Err.Clear
    http.open "GET", "http://localhost:8765/", False
    http.send
    If Err.Number = 0 And http.status = 200 Then
      serverAlive = True
      Exit Do
    End If
    On Error GoTo 0
    i = i + 1
  Loop
End If

' Open browser via cmd start (more reliable across Windows configs)
shell.Run "cmd /c start """" http://localhost:8765/", 0, False
