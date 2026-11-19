param(
  [Parameter(Mandatory)]
  [string]$ExecutablePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('AkspIconResources' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public static class AkspIconResources
{
    private const int Icon = 3;
    private const int GroupIcon = 14;

    [DllImport("kernel32.dll", ExactSpelling = true, CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr BeginUpdateResourceW(string fileName, bool deleteExisting);

    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    private static extern bool UpdateResourceW(IntPtr handle, IntPtr type, IntPtr name,
        ushort language, byte[] data, int size);

    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    private static extern bool EndUpdateResourceW(IntPtr handle, bool discard);

    private static void WriteResource(IntPtr handle, int type, int id, byte[] data)
    {
        if (!UpdateResourceW(handle, (IntPtr)type, (IntPtr)id, 0, data, data.Length))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not write icon resource.");
    }

    public static void Embed(string executable, int[] sizes, byte[][] frames)
    {
        IntPtr handle = BeginUpdateResourceW(executable, false);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not open launcher resources.");

        bool discard = true;
        try
        {
            using (var buffer = new MemoryStream())
            using (var group = new BinaryWriter(buffer))
            {
                // GRPICONDIR stores resource IDs in place of ICO file offsets.
                group.Write((ushort)0);
                group.Write((ushort)1);
                group.Write((ushort)frames.Length);
                for (int index = 0; index < frames.Length; index++)
                {
                    ushort id = (ushort)(index + 1);
                    byte dimension = sizes[index] == 256 ? (byte)0 : (byte)sizes[index];
                    group.Write(dimension);
                    group.Write(dimension);
                    group.Write((byte)0);
                    group.Write((byte)0);
                    group.Write((ushort)1);
                    group.Write((ushort)32);
                    group.Write((uint)frames[index].Length);
                    group.Write(id);
                    WriteResource(handle, Icon, id, frames[index]);
                }
                group.Flush();
                WriteResource(handle, GroupIcon, 1, buffer.ToArray());
            }
            discard = false;
        }
        finally
        {
            if (!EndUpdateResourceW(handle, discard) && !discard)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not save launcher resources.");
        }
    }
}
'@
}

[int[]]$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$frames = [System.Collections.Generic.List[byte[]]]::new()
# Icon artwork uses head, hand, and mouth sprites from the game's matching UI.
# https://github.com/ArknightsAssets/ArknightsAssets2/tree/cn/assets/dyn/ui/autochess/%5Buc%5Dautochessouter/matching/auto_chess_matching
$source = [Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'icon-source.png'))
try {
  foreach ($size in $sizes) {
    $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($source, 0, 0, $size, $size)
      } finally {
        $graphics.Dispose()
      }
      $buffer = [IO.MemoryStream]::new()
      try {
        $bitmap.Save($buffer, [Drawing.Imaging.ImageFormat]::Png)
        $frames.Add($buffer.ToArray())
      } finally {
        $buffer.Dispose()
      }
    } finally {
      $bitmap.Dispose()
    }
  }
} finally {
  $source.Dispose()
}

[AkspIconResources]::Embed($ExecutablePath, $sizes, $frames.ToArray())
