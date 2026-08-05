# Temp tool: verify generated utool icons
Add-Type -AssemblyName System.Drawing

$ico = 'C:\Users\Administrator\Code\my-rust\my-apps\tools\utool\src-tauri\icons\icon.ico'
$bytes = [System.IO.File]::ReadAllBytes($ico)
$count = [BitConverter]::ToUInt16($bytes, 4)
Write-Host "icon.ico frames=$count"
for ($i = 0; $i -lt $count; $i++) {
    $o = 6 + 16 * $i
    $w = $bytes[$o]; if ($w -eq 0) { $w = 256 }
    $sz = [BitConverter]::ToUInt32($bytes, $o + 8)
    Write-Host "  frame[$i] ${w}x$w size=$sz"
}

foreach ($f in @('tray-dark.png', 'tray-light.png')) {
    $path = "C:\Users\Administrator\Code\my-rust\my-apps\tools\utool\src-tauri\icons\$f"
    $bmp = [System.Drawing.Bitmap]::new($path)
    $pts = @(@(8, 8), @(16, 8), @(8, 16), @(16, 16))
    $out = @()
    foreach ($p in $pts) {
        $c = $bmp.GetPixel($p[0], $p[1])
        $out += "($($c.R),$($c.G),$($c.B))"
    }
    Write-Host "$f ($($bmp.Width)x$($bmp.Height)): $($out -join ' ')"
    $bmp.Dispose()
}
