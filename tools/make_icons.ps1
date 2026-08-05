# Temp tool: generate utool icon resources
#  - icon.ico: multi-size (16,24,32,48,64,128,256) keep-white blue variant
#  - icon.png: 256x256 keep-white blue variant
#  - tray-dark.png: 32x32 keep-white blue variant (dark taskbar)
#  - tray-light.png: 32x32 deep-blue variant (light taskbar)
Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\Administrator\Code\my-rust\app-icons\icons\tools\utools.ico'
$out = 'C:\Users\Administrator\Code\my-rust\my-apps\tools\utool\src-tauri\icons'
$base = New-Object System.Drawing.Icon($src)
$bmp256 = $base.ToBitmap()  # 256x256

function Map-Blue([System.Drawing.Bitmap]$bmp, [int]$B0r, [int]$B0g, [int]$B0b, [int]$B1r, [int]$B1g, [int]$B1b, [bool]$keepWhite) {
    $rect = New-Object System.Drawing.Rectangle(0, 0, $bmp.Width, $bmp.Height)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $data.Stride
    $bytes = New-Object byte[] ($stride * $bmp.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        $row = $y * $stride
        for ($x = 0; $x -lt $bmp.Width; $x++) {
            $i = $row + $x * 4
            $a = $bytes[$i + 3]
            if ($a -eq 0) { continue }
            $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]
            $L = 0.299 * $r + 0.587 * $g + 0.114 * $b
            if ($keepWhite -and $L -gt 200) { continue }
            $n = $L / 255.0
            $bytes[$i]     = [byte][math]::Round($B0b + ($B1b - $B0b) * $n)
            $bytes[$i + 1] = [byte][math]::Round($B0g + ($B1g - $B0g) * $n)
            $bytes[$i + 2] = [byte][math]::Round($B0r + ($B1r - $B0r) * $n)
        }
    }
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
    $bmp.UnlockBits($data)
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-Scaled([System.Drawing.Bitmap]$srcBmp, [int]$size) {
    $nb = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($nb)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcBmp, 0, 0, $size, $size)
    $g.Dispose()
    return $nb
}

function Get-PngBytes([System.Drawing.Bitmap]$bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $arr = $ms.ToArray()
    $ms.Dispose()
    return $arr
}

# --- keep-white variant (blue gradient + white kept) ---
$bw = New-Object System.Drawing.Bitmap($bmp256)
Map-Blue $bw 10 40 110 96 176 255 $true
Save-Png (New-Scaled $bw 32) "$out\tray-dark.png"
Save-Png (New-Scaled $bw 256) "$out\icon.png"

# --- deep-blue variant (all mapped, darker) ---
$dl = New-Object System.Drawing.Bitmap($bmp256)
Map-Blue $dl 6 18 58 55 115 210 $false
Save-Png (New-Scaled $dl 32) "$out\tray-light.png"

# --- multi-size icon.ico from keep-white variant ---
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()
foreach ($s in $sizes) {
    $sc = New-Scaled $bw $s
    $frames += ,@($s, $sc)
}
$entries = @()
$offset = 6 + 16 * $frames.Count
$data = New-Object System.Collections.Generic.List[byte]
foreach ($fr in $frames) {
    $s = $fr[0]; $bmp = $fr[1]
    $png = Get-PngBytes $bmp
    $entries += ,@($s, $png.Length, $offset)
    $offset += $png.Length
    foreach ($b in $png) { $data.Add($b) }
    $bmp.Dispose()
}
$fs = [System.IO.File]::Create("$out\icon.ico")
$bw2 = New-Object System.IO.BinaryWriter($fs)
$bw2.Write([uint16]0); $bw2.Write([uint16]1); $bw2.Write([uint16]$frames.Count)
foreach ($e in $entries) {
    $s = $e[0]
    $bw2.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))
    $bw2.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))
    $bw2.Write([byte]0); $bw2.Write([byte]0)
    $bw2.Write([uint16]1); $bw2.Write([uint16]32)
    $bw2.Write([uint32]$e[1]); $bw2.Write([uint32]$e[2])
}
$bw2.Write($data.ToArray())
$bw2.Flush(); $fs.Dispose()

$bw.Dispose(); $dl.Dispose(); $bmp256.Dispose(); $base.Dispose()
Write-Host "done -> $out"
Get-ChildItem $out | Select-Object Name, Length
