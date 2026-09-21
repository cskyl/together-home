using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace TogetherHome
{
    // Owns a process handle, not the lifetime of the process. Disposing this
    // object does not stop the child or close its inherited log file handles.
    public sealed class ChildProcess : IDisposable
    {
        private readonly SafeProcessHandle processHandle;
        public int Id { get; private set; }

        internal ChildProcess(int id, IntPtr handle)
        {
            Id = id;
            processHandle = new SafeProcessHandle(handle, true);
        }

        public IntPtr Handle
        {
            get
            {
                ThrowIfDisposed();
                return processHandle.DangerousGetHandle();
            }
        }

        public bool WaitForExit(int timeoutMs)
        {
            ThrowIfDisposed();
            if (timeoutMs < -1) throw new ArgumentOutOfRangeException("timeoutMs");
            uint result = BackgroundProcessNative.WaitForSingleObject(processHandle,
                timeoutMs == -1 ? UInt32.MaxValue : (uint)timeoutMs);
            if (result == 0) return true;
            if (result == 258) return false;
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not wait for the background process.");
        }

        public int ExitCode
        {
            get
            {
                if (!WaitForExit(0)) throw new InvalidOperationException("The background process is still running.");
                uint code;
                if (!BackgroundProcessNative.GetExitCodeProcess(processHandle, out code))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not read the background process exit code.");
                return unchecked((int)code);
            }
        }

        public void Kill()
        {
            if (WaitForExit(0)) return;
            if (!BackgroundProcessNative.TerminateProcess(processHandle, 1))
            {
                int error = Marshal.GetLastWin32Error();
                if (!WaitForExit(0))
                    throw new Win32Exception(error, "Could not stop the background process.");
            }
        }

        public void Dispose() { processHandle.Dispose(); }

        private void ThrowIfDisposed()
        {
            if (processHandle.IsClosed) throw new ObjectDisposedException("ChildProcess");
        }
    }

    public static class BackgroundProcess
    {
        public static ChildProcess Start(string executable, string arguments,
            string workingDirectory, string stdoutPath, string stderrPath)
        {
            if (String.IsNullOrWhiteSpace(executable)) throw new ArgumentException("An executable is required.", "executable");
            if (String.IsNullOrWhiteSpace(workingDirectory)) throw new ArgumentException("A working directory is required.", "workingDirectory");
            if (String.IsNullOrWhiteSpace(stdoutPath) || String.IsNullOrWhiteSpace(stderrPath))
                throw new ArgumentException("Separate stdout and stderr file paths are required.");
            string program = Path.GetFullPath(executable);
            string directory = Path.GetFullPath(workingDirectory);
            string output = Path.GetFullPath(stdoutPath);
            string errorOutput = Path.GetFullPath(stderrPath);
            if (String.Equals(output, errorOutput, StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("Stdout and stderr must use different files.");
            if (program.IndexOf('"') >= 0 || program.IndexOf('\0') >= 0 || (arguments != null && arguments.IndexOf('\0') >= 0))
                throw new ArgumentException("An executable or argument contains an invalid character.");
            if (!File.Exists(program)) throw new FileNotFoundException("The background executable does not exist.", program);
            if (!Directory.Exists(directory)) throw new DirectoryNotFoundException("The background working directory does not exist.");

            // CreateProcess receives an explicit executable. Arguments are
            // already quoted by the trusted caller; no shell interprets them.
            StringBuilder command = new StringBuilder("\"" + program + "\"" +
                (String.IsNullOrEmpty(arguments) ? "" : " " + arguments));
            if (command.Length >= 32767) throw new ArgumentException("The background command line is too long.");

            BackgroundProcessNative.SecurityAttributes security = new BackgroundProcessNative.SecurityAttributes();
            security.Length = Marshal.SizeOf(typeof(BackgroundProcessNative.SecurityAttributes));
            security.InheritHandle = true;
            using (SafeFileHandle input = OpenFile("NUL", 0x80000000u, 3, ref security))
            using (SafeFileHandle stdout = OpenFile(output, 0x40000000u, 2, ref security))
            using (SafeFileHandle stderr = OpenFile(errorOutput, 0x40000000u, 2, ref security))
            {
                IntPtr attributeList = IntPtr.Zero;
                IntPtr handleList = IntPtr.Zero;
                bool attributesInitialized = false;
                BackgroundProcessNative.ProcessInformation process = new BackgroundProcessNative.ProcessInformation();
                try
                {
                    IntPtr bytes = IntPtr.Zero;
                    BackgroundProcessNative.InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref bytes);
                    if (bytes == IntPtr.Zero)
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not size background process attributes.");
                    attributeList = Marshal.AllocHGlobal(bytes);
                    if (!BackgroundProcessNative.InitializeProcThreadAttributeList(attributeList, 1, 0, ref bytes))
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not initialize background process attributes.");
                    attributesInitialized = true;
                    handleList = Marshal.AllocHGlobal(3 * IntPtr.Size);
                    Marshal.WriteIntPtr(handleList, 0, input.DangerousGetHandle());
                    Marshal.WriteIntPtr(handleList, IntPtr.Size, stdout.DangerousGetHandle());
                    Marshal.WriteIntPtr(handleList, 2 * IntPtr.Size, stderr.DangerousGetHandle());
                    // PROC_THREAD_ATTRIBUTE_HANDLE_LIST: only the three standard
                    // file handles may be inherited, never unrelated parent handles.
                    if (!BackgroundProcessNative.UpdateProcThreadAttribute(attributeList, 0,
                        new IntPtr(0x00020002), handleList, new IntPtr(3 * IntPtr.Size), IntPtr.Zero, IntPtr.Zero))
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not select background standard handles.");

                    BackgroundProcessNative.StartupInfoEx startup = new BackgroundProcessNative.StartupInfoEx();
                    startup.StartupInfo.Size = Marshal.SizeOf(typeof(BackgroundProcessNative.StartupInfoEx));
                    startup.StartupInfo.Flags = 0x00000100; // STARTF_USESTDHANDLES
                    startup.StartupInfo.StandardInput = input.DangerousGetHandle();
                    startup.StartupInfo.StandardOutput = stdout.DangerousGetHandle();
                    startup.StartupInfo.StandardError = stderr.DangerousGetHandle();
                    startup.AttributeList = attributeList;
                    // CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT.
                    // Never request CREATE_NEW_CONSOLE or DETACHED_PROCESS.
                    if (!BackgroundProcessNative.CreateProcessW(program, command, IntPtr.Zero, IntPtr.Zero,
                        true, 0x08080000u, IntPtr.Zero, directory, ref startup, out process))
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not create the background process.");
                    ChildProcess child = new ChildProcess(unchecked((int)process.ProcessId), process.Process);
                    process.Process = IntPtr.Zero; // ownership moved to SafeProcessHandle
                    return child;
                }
                finally
                {
                    if (process.Thread != IntPtr.Zero) BackgroundProcessNative.CloseHandle(process.Thread);
                    if (process.Process != IntPtr.Zero) BackgroundProcessNative.CloseHandle(process.Process);
                    if (attributesInitialized) BackgroundProcessNative.DeleteProcThreadAttributeList(attributeList);
                    if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
                    if (handleList != IntPtr.Zero) Marshal.FreeHGlobal(handleList);
                    GC.KeepAlive(input);
                    GC.KeepAlive(stdout);
                    GC.KeepAlive(stderr);
                }
            }
        }

        private static SafeFileHandle OpenFile(string path, uint access, uint disposition,
            ref BackgroundProcessNative.SecurityAttributes security)
        {
            // FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE permits
            // live log inspection. The child writes directly to these files.
            SafeFileHandle file = BackgroundProcessNative.CreateFileW(path, access, 7,
                ref security, disposition, 0x80, IntPtr.Zero);
            if (file.IsInvalid)
            {
                int error = Marshal.GetLastWin32Error();
                file.Dispose();
                throw new Win32Exception(error, "Could not open a background standard stream.");
            }
            return file;
        }
    }

    internal static class BackgroundProcessNative
    {
        [StructLayout(LayoutKind.Sequential)]
        internal struct SecurityAttributes
        {
            internal int Length;
            internal IntPtr SecurityDescriptor;
            [MarshalAs(UnmanagedType.Bool)] internal bool InheritHandle;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        internal struct StartupInfo
        {
            internal int Size;
            internal IntPtr Reserved, Desktop, Title;
            internal uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
            internal ushort ShowWindow, ReservedSize;
            internal IntPtr ReservedBytes, StandardInput, StandardOutput, StandardError;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct StartupInfoEx
        {
            internal StartupInfo StartupInfo;
            internal IntPtr AttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct ProcessInformation
        {
            internal IntPtr Process, Thread;
            internal uint ProcessId, ThreadId;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern SafeFileHandle CreateFileW(string name, uint access, uint share,
            ref SecurityAttributes security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CreateProcessW(string application, StringBuilder command,
            IntPtr processSecurity, IntPtr threadSecurity, [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
            uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInformation process);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute,
            IntPtr value, IntPtr size, IntPtr previousValue, IntPtr returnSize);
        [DllImport("kernel32.dll")]
        internal static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern uint WaitForSingleObject(SafeProcessHandle process, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetExitCodeProcess(SafeProcessHandle process, out uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool TerminateProcess(SafeProcessHandle process, uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool CloseHandle(IntPtr handle);
    }
}
