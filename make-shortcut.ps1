$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut('C:\Users\adati\Desktop\ClassNotes.lnk')
$sc.TargetPath = 'C:\Users\adati\Desktop\ClassNotes\ClassNotes.exe'
$sc.WorkingDirectory = 'C:\Users\adati\Desktop\ClassNotes'
$sc.IconLocation = 'C:\Users\adati\Desktop\ClassNotes\ClassNotes.exe,0'
$sc.Description = 'ClassNotes'
$sc.Save()
Test-Path 'C:\Users\adati\Desktop\ClassNotes.lnk'
