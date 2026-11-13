# Pantalla en negro: una ventana negra encima de todo en cada monitor, sin cursor.
# Sustituye a apagar la pantalla de verdad, porque en los portátiles con Modern Standby (S0)
# apagar la pantalla suspende el PC. El sonido sigue. Se quita al mover el ratón o pulsar una tecla.
# Lo lanza server/power.js.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Name Dpi -Namespace MandoPc -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(System.IntPtr v);'
[void][MandoPc.Dpi]::SetProcessDpiAwarenessContext([IntPtr]-4)

$start = [System.Windows.Forms.Cursor]::Position
$forms = @()

$close = {
  foreach ($f in $forms) { $f.Hide() }
  [System.Windows.Forms.Application]::Exit()
}

foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
  $form = New-Object System.Windows.Forms.Form
  $form.FormBorderStyle = 'None'
  $form.BackColor = [System.Drawing.Color]::Black
  $form.ShowInTaskbar = $false
  $form.TopMost = $true
  $form.StartPosition = 'Manual'
  $form.Bounds = $screen.Bounds
  $form.KeyPreview = $true
  $form.Add_MouseMove({
    $p = [System.Windows.Forms.Cursor]::Position
    # Un margen de unos píxeles para que no se quite solo por un temblor del ratón.
    if ([Math]::Abs($p.X - $start.X) + [Math]::Abs($p.Y - $start.Y) -gt 12) { & $close }
  })
  $form.Add_MouseDown({ & $close })
  $form.Add_KeyDown({ & $close })
  $forms += $form
}

foreach ($f in $forms) { $f.Show() }
[System.Windows.Forms.Cursor]::Hide()
$forms[0].Activate()
[System.Windows.Forms.Application]::Run()
[System.Windows.Forms.Cursor]::Show()
