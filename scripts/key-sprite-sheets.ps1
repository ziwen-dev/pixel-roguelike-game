Add-Type -AssemblyName System.Drawing

$source = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class MagentaKeyer {
  public static void Convert(string inputPath, string outputPath) {
    using (var src = new Bitmap(inputPath)) {
      var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
      using (var g = Graphics.FromImage(bmp)) {
        g.DrawImage(src, 0, 0, src.Width, src.Height);
      }
      var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
      var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      int stride = data.Stride;
      int bytes = stride * bmp.Height;
      byte[] px = new byte[bytes];
      Marshal.Copy(data.Scan0, px, 0, bytes);
      int bgB = px[0];
      int bgG = px[1];
      int bgR = px[2];
      for (int y = 0; y < bmp.Height; y++) {
        int row = y * stride;
        for (int x = 0; x < bmp.Width; x++) {
          int i = row + x * 4;
          int b = px[i];
          int g = px[i + 1];
          int r = px[i + 2];
          int dist = Math.Abs(r - bgR) + Math.Abs(g - bgG) + Math.Abs(b - bgB);
          bool magenta = r > 145 && b > 110 && g < 120 && Math.Abs(r - b) < 100;
          if (dist < 120 || magenta) px[i + 3] = 0;
        }
      }
      Marshal.Copy(px, 0, data.Scan0, bytes);
      bmp.UnlockBits(data);
      Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
      bmp.Save(outputPath, ImageFormat.Png);
      bmp.Dispose();
    }
  }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing

$inDir = "C:\Users\ziwen\.cursor\projects\d-personal-pixel-roguelike-game\assets"
$outDir = "d:\personal\pixel-roguelike-game\build\sprite-sheets-transparent"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Get-ChildItem $inDir -Filter "sheet-*.jpg" | ForEach-Object {
  $name = $_.BaseName.Substring(6)
  $dest = Join-Path $outDir "$name.png"
  Write-Output "key $name"
  [MagentaKeyer]::Convert($_.FullName, $dest)
}

Write-Output "done"
