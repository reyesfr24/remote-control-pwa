# Ratón en píxeles físicos reales, válido con varias pantallas y escalados distintos (125 %, 150 %…).
# Todo el bucle corre en C# para que cada orden tarde microsegundos. Lo lanza server/mouse.js.
# Órdenes por stdin, una por línea:
#   m dx dy        mover (en puntos lógicos; se escalan según el monitor donde está el cursor)
#   c boton n      clic (left/right/middle), n = 1 o 2
#   d boton        pulsar      u boton   soltar
#   w dx dy        rueda (120 = una muesca; dy > 0 baja)
#   center         doble clic en el centro de la ventana activa
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace MandoPc {
  public static class MouseLoop {
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }

    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT p, uint flags);
    [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr mon, int type, out uint x, out uint y);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);

    static double restX, restY;

    static double Scale(POINT p) {
      uint dx, dy;
      IntPtr mon = MonitorFromPoint(p, 2);
      if (GetDpiForMonitor(mon, 0, out dx, out dy) != 0) return 1;
      return dx / 96.0;
    }

    static void Send(uint flags, int data) {
      var input = new INPUT[1];
      input[0].type = 0;
      input[0].mi.dwFlags = flags;
      input[0].mi.mouseData = unchecked((uint)data);
      SendInput(1, input, Marshal.SizeOf(typeof(INPUT)));
    }

    static uint Flag(string button, bool down) {
      if (button == "right") return down ? 0x0008u : 0x0010u;
      if (button == "middle") return down ? 0x0020u : 0x0040u;
      return down ? 0x0002u : 0x0004u;
    }

    static void Move(double dx, double dy) {
      POINT p;
      GetCursorPos(out p);
      double s = Scale(p);
      restX += dx * s;
      restY += dy * s;
      int ix = (int)Math.Round(restX);
      int iy = (int)Math.Round(restY);
      restX -= ix;
      restY -= iy;
      if (ix != 0 || iy != 0) SetCursorPos(p.X + ix, p.Y + iy);
    }

    static void Click(string button, int count) {
      for (int i = 0; i < count; i++) {
        Send(Flag(button, true), 0);
        Send(Flag(button, false), 0);
      }
    }

    public static void Run() {
      // Coordenadas físicas reales en todos los monitores.
      SetThreadDpiAwarenessContext((IntPtr)(-4));
      var inv = System.Globalization.CultureInfo.InvariantCulture;
      Console.Out.WriteLine("ready");
      Console.Out.Flush();
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        try {
          var a = line.Trim().Split(' ');
          switch (a[0]) {
            case "m": Move(double.Parse(a[1], inv), double.Parse(a[2], inv)); break;
            case "c": Click(a[1], a.Length > 2 && a[2] == "2" ? 2 : 1); break;
            case "d": Send(Flag(a[1], true), 0); break;
            case "u": Send(Flag(a[1], false), 0); break;
            case "w": {
              int wx = (int)double.Parse(a[1], inv), wy = (int)double.Parse(a[2], inv);
              if (wy != 0) Send(0x0800, -wy);
              if (wx != 0) Send(0x1000, wx);
              break;
            }
            case "center": {
              RECT r;
              if (GetWindowRect(GetForegroundWindow(), out r) && r.Right > r.Left) {
                SetCursorPos((r.Left + r.Right) / 2, (r.Top + r.Bottom) / 2);
                Click("left", 2);
              }
              break;
            }
          }
        } catch (Exception e) {
          Console.Error.WriteLine(e.Message);
        }
      }
    }
  }
}
'@

[MandoPc.MouseLoop]::Run()
