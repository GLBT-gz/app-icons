# Temp tool: verify utools-blue.ico colors + generate keep-white variant
Add-Type -AssemblyName System.Drawing

function New-BlueIco([string]$src, [string]$dst, [bool]$keepWhite) {
    $icon = New-Object System.Drawing.Icon($src)
    $bmp = $icon.ToBitmap()
    $w = $bmp.Width; $h = $bmp.Height
    $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $data.Stride
    $bytes = New-Object byte[] ($stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

    $B0r = 10;   $B0g = 40;  $B0b = 110
    $B1r = 96;   $B1g = 176; $B1b = 255
    for ($y = 0; $y -lt $h; $y++) {
        $row = $y * $stride
        for ($x = 0; $x -lt $w; $x++) {
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
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $png = $ms.ToArray()
    $ms.Dispose(); $bmp.Dispose(); $icon.Dispose()

    $fs = [System.IO.File]::Create($dst)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$png.Length); $bw.Write([uint32]22)
    $bw.Write($png)
    $bw.Flush(); $fs.Dispose()
    return $png
}

$orig = 'C:\Users\Administrator\Code\my-rust\app-icons\icons\tools\utools.ico'

$p1 = New-BlueIco $orig 'C:\Users\Administrator\Code\my-rust\app-icons\icons\tools\utools-blue.ico' $false
Write-Host "utools-blue.ico: $($p1.Length + 22) bytes"

$p2 = New-BlueIco $orig 'C:\Users\Administrator\Code\my-rust\app-icons\icons\tools\utools-blue-white.ico' $true
Write-Host "utools-blue-white.ico: $($p2.Length + 22) bytes"

foreach ($f in @('utools-blue.ico', 'utools-blue-white.ico')) {
    $path = "C:\Users\Administrator\Code\my-rust\app-icons\icons\tools\$f"
    $icon = New-Object System.Drawing.Icon($path)
    $bmp = $icon.ToBitmap()
    $pts = @(@(64, 32), @(32, 96), @(96, 96), @(128, 96), @(64, 128), @(224, 224))
    $out = @()
    foreach ($p in $pts) {
        $c = $bmp.GetPixel($p[0], $p[1])
        $out += "($($c.R),$($c.G),$($c.B))"
    }
    Write-Host "$f samples: $($out -join ' ')"
    $bmp.Dispose(); $icon.Dispose()
}
