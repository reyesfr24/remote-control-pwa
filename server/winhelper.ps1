# Helper persistente: lee órdenes JSON por stdin (una por línea) y responde por stdout.
# Lo lanza server/winhelper.js. No ejecuta nada que no esté en el switch de abajo.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace MandoPc {
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr p);
    int UnregisterControlChangeNotify(IntPtr p);
    int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float level, ref Guid ctx);
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int GetMasterVolumeLevel(out float level);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint ch, float level, ref Guid ctx);
    int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
    int GetChannelVolumeLevel(uint ch, out float level);
    int GetChannelVolumeLevelScalar(uint ch, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation {
    int GetPeakValue(out float peak);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
  }

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumeratorCom { }

  public static class Audio {
    static Guid IID_Volume = typeof(IAudioEndpointVolume).GUID;
    static Guid IID_Meter = typeof(IAudioMeterInformation).GUID;

    static IMMDevice Device() {
      var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      IMMDevice dev;
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
      return dev;
    }

    static IAudioEndpointVolume Volume() {
      object o;
      Marshal.ThrowExceptionForHR(Device().Activate(ref IID_Volume, 23, IntPtr.Zero, out o));
      return (IAudioEndpointVolume)o;
    }

    public static int GetLevel() {
      float v; Volume().GetMasterVolumeLevelScalar(out v);
      return (int)Math.Round(v * 100);
    }

    public static int SetLevel(int level) {
      level = Math.Max(0, Math.Min(100, level));
      Guid ctx = Guid.Empty;
      var vol = Volume();
      vol.SetMasterVolumeLevelScalar(level / 100f, ref ctx);
      if (level > 0) vol.SetMute(false, ref ctx);
      return level;
    }

    public static bool GetMute() {
      bool m; Volume().GetMute(out m);
      return m;
    }

    public static bool SetMute(bool mute) {
      Guid ctx = Guid.Empty;
      Volume().SetMute(mute, ref ctx);
      return mute;
    }

    public static float Peak() {
      try {
        object o;
        Marshal.ThrowExceptionForHR(Device().Activate(ref IID_Meter, 23, IntPtr.Zero, out o));
        float p; ((IAudioMeterInformation)o).GetPeakValue(out p);
        return p;
      } catch { return 0; }
    }
  }

  public static class Win {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool LockWorkStation();
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

    public static string Title() {
      var sb = new StringBuilder(512);
      GetWindowText(GetForegroundWindow(), sb, sb.Capacity);
      return sb.ToString();
    }

    public static string ProcessName() {
      uint pid;
      GetWindowThreadProcessId(GetForegroundWindow(), out pid);
      try { return Process.GetProcessById((int)pid).ProcessName; } catch { return ""; }
    }

    public static int[] Rect() {
      RECT r;
      if (!GetWindowRect(GetForegroundWindow(), out r)) return new int[] { 0, 0, 0, 0 };
      return new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top };
    }

    // Pulsación de una tecla virtual (multimedia, etc.).
    public static void Tap(byte vk) {
      keybd_event(vk, 0, 1, UIntPtr.Zero);
      keybd_event(vk, 0, 3, UIntPtr.Zero);
    }

    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);

    // Pide cerrar (WM_CLOSE) todas las ventanas visibles de un proceso, como al pulsar la X.
    public static int CloseWindows(uint pid) {
      int n = 0;
      EnumWindows(delegate (IntPtr h, IntPtr l) {
        uint owner;
        GetWindowThreadProcessId(h, out owner);
        if (owner == pid && IsWindowVisible(h)) { PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); n++; }
        return true;
      }, IntPtr.Zero);
      return n;
    }

    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);

    // Minimiza la ventana activa (SW_MINIMIZE = 6). El escritorio y la barra de tareas no se tocan.
    public static bool MinimizeActive() {
      IntPtr h = GetForegroundWindow();
      if (h == IntPtr.Zero) return false;
      var cls = new StringBuilder(256);
      GetClassName(h, cls, cls.Capacity);
      string c = cls.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return false;
      ShowWindow(h, 6);
      return true;
    }

    // SC_MONITORPOWER = 2 apaga la pantalla; se enciende al mover el ratón.
    public static void MonitorOff() { PostMessage((IntPtr)0xFFFF, 0x0112, (IntPtr)0xF170, (IntPtr)2); }
    public static void Lock() { LockWorkStation(); }

    // Windows solo enseña su barra de volumen con las teclas de volumen. Se pulsa una virtual en la
    // dirección del cambio (aparece la barra) y luego se fija el nivel exacto, que la barra refleja.
    public static int SetVolumeWithOsd(int level) {
      level = Math.Max(0, Math.Min(100, level));
      int current = Audio.GetLevel();
      bool up = level > current || (level == current && current < 100);
      Tap(up ? (byte)0xAF : (byte)0xAE);
      System.Threading.Thread.Sleep(60);
      return Audio.SetLevel(level);
    }

    public static bool ToggleMuteWithOsd() {
      Tap(0xAD);
      System.Threading.Thread.Sleep(60);
      return Audio.GetMute();
    }
  }
}
'@

$media = @{ playpause = 0xB3; next = 0xB0; prev = 0xB1; stop = 0xB2 }

function Invoke-Order($cmd, $arg) {
  switch ($cmd) {
    'ping'       { return 'pong' }
    'volume.get' { return @{ level = [MandoPc.Audio]::GetLevel(); muted = [MandoPc.Audio]::GetMute() } }
    'volume.set' { [void][MandoPc.Audio]::SetLevel([int]$arg); return @{ level = [MandoPc.Audio]::GetLevel(); muted = [MandoPc.Audio]::GetMute() } }
    'volume.step' { [void][MandoPc.Audio]::SetLevel([MandoPc.Audio]::GetLevel() + [int]$arg); return @{ level = [MandoPc.Audio]::GetLevel(); muted = [MandoPc.Audio]::GetMute() } }
    'volume.osd.set' { [void][MandoPc.Win]::SetVolumeWithOsd([int]$arg); return @{ level = [MandoPc.Audio]::GetLevel(); muted = [MandoPc.Audio]::GetMute() } }
    'volume.osd.step' { [void][MandoPc.Win]::SetVolumeWithOsd([MandoPc.Audio]::GetLevel() + [int]$arg); return @{ level = [MandoPc.Audio]::GetLevel(); muted = [MandoPc.Audio]::GetMute() } }
    'volume.osd.mute' { [void][MandoPc.Win]::ToggleMuteWithOsd(); return @{ level = [MandoPc.Audio]::GetLevel(); muted = [MandoPc.Audio]::GetMute() } }
    'volume.mute' {
      $target = if ($null -eq $arg) { -not [MandoPc.Audio]::GetMute() } else { [bool]$arg }
      [void][MandoPc.Audio]::SetMute($target)
      return @{ level = [MandoPc.Audio]::GetLevel(); muted = [MandoPc.Audio]::GetMute() }
    }
    'status' {
      return @{
        title = [MandoPc.Win]::Title()
        process = [MandoPc.Win]::ProcessName()
        peak = [Math]::Round([MandoPc.Audio]::Peak(), 3)
        level = [MandoPc.Audio]::GetLevel()
        muted = [MandoPc.Audio]::GetMute()
      }
    }
    'media' {
      if (-not $media.ContainsKey([string]$arg)) { throw "Tecla multimedia desconocida" }
      [MandoPc.Win]::Tap([byte]$media[[string]$arg]); return $true
    }
    'lock' { [MandoPc.Win]::Lock(); return $true }
    'window.minimize' { return [MandoPc.Win]::MinimizeActive() }
    'kill.userdatadir' {
      # Cierra solo los navegadores lanzados con nuestro --user-data-dir, nunca el resto.
      $dir = [string]$arg
      if ($dir.Length -lt 10) { throw "Ruta no válida" }
      $find = {
        Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe' OR Name='brave.exe'" |
          Where-Object { $_.CommandLine -and $_.CommandLine.Contains($dir) }
      }
      $procs = @(& $find)
      if ($procs.Count -eq 0) { return 0 }
      # Primero se cierra por las buenas para que el navegador guarde sesiones y cookies.
      $main = $procs | Where-Object { $_.CommandLine -notmatch '--type=' }
      $windows = 0
      foreach ($p in $main) { $windows += [MandoPc.Win]::CloseWindows([uint32]$p.ProcessId) }
      $deadline = (Get-Date).AddSeconds(6)
      while ((Get-Date) -lt $deadline -and @(& $find).Count -gt 0) { Start-Sleep -Milliseconds 250 }
      # Lo que siga vivo (colgado o en segundo plano) se termina a la fuerza.
      foreach ($p in @(& $find)) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }
      return [Math]::Max($windows, 1)
    }
    default { throw "Orden desconocida: $cmd" }
  }
}

[Console]::Out.WriteLine((@{ ready = $true } | ConvertTo-Json -Compress))
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim() -eq '') { continue }
  $id = $null
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    $result = Invoke-Order $req.cmd $req.arg
    $out = @{ id = $id; ok = $true; result = $result }
  } catch {
    $out = @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}
