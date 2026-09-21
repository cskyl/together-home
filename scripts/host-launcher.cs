using System;
using System.IO;
using System.Text;

namespace TogetherHome
{
    internal static class HostLauncher
    {
        [STAThread]
        private static int Main(string[] args)
        {
            string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
            string runtime = Path.Combine(root, "runtime");
            string mode = args.Length == 1 ? args[0] : "";
            string script;
            string extra = "";
            switch (mode)
            {
                case "start": script = "launch-host.ps1"; extra = " -Open"; break;
                case "host": script = "launch-host.ps1"; break;
                case "supervise": script = "launch-host.ps1"; extra = " -Supervise"; break;
                case "watch": script = "watch-host.ps1"; break;
                case "stop": script = "stop-host.ps1"; break;
                default: return 2;
            }
            try
            {
                Directory.CreateDirectory(runtime);
                string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
                string arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + Path.Combine(root, "scripts", script) + "\"" + extra;
                // The launcher itself is a Windows-subsystem executable. Its
                // child gets CREATE_NO_WINDOW rather than a hidden console.
                using (ChildProcess child = BackgroundProcess.Start(powershell, arguments, root,
                    Path.Combine(runtime, "launcher-" + mode + ".out.log"),
                    Path.Combine(runtime, "launcher-" + mode + ".err.log")))
                {
                    child.WaitForExit(-1);
                    return child.ExitCode;
                }
            }
            catch (Exception error)
            {
                try
                {
                    File.AppendAllText(Path.Combine(runtime, "launcher-error.log"),
                        DateTime.UtcNow.ToString("o") + " " + mode + " " + error.GetType().FullName + " " + error.HResult + Environment.NewLine,
                        new UTF8Encoding(false));
                }
                catch { }
                return 1;
            }
        }
    }
}
