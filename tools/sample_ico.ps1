# Temp tool: sample colors of generated PNG-in-ICO files
Add-Type -AssemblyName System.Drawing

foreach ($f in @('utools-blue.ico', 'utools-blue-white.ico')) {
    $path = "C:\Users\Administrator\Code\my-rust\app-icons\icons\tools\$f"
    $all = [System.IO.File]::ReadAllBytes($path)
    $png = New-Object byte[] ($all.Length - 22)
    [System.Array]::Copy($all, 22, $png, 0, $png.Length)
    $ms = [System.IO.MemoryStream]::new(([byte[]]$png))
    $bmp = [System.Drawing.Bitmap]::new($ms)
    $pts = @(@(64, 32), @(32, 96), @(96, 96), @(128, 96), @(64, 128), @(224, 224))
    $out = @()
    foreach ($p in $pts) {
        $c = $bmp.GetPixel($p[0], $p[1])
        $out += "($($c.R),$($c.G),$($c.B))"
    }
    Write-Host "$f ($($bmp.Width)x$($bmp.Height)) samples: $($out -join ' ')"
    $bmp.Dispose(); $ms.Dispose()
}
