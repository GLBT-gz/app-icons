# 临时工具脚本：把 utools.ico 的黑色渐变映射为蓝色渐变，另存为 utools-blue.ico
Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\Administrator\Code\my-rust\app-icons\icons\tools\utools.ico'
$dst = 'C:\Users\Administrator\Code\my-rust\app-icons\icons\tools\utools-blue.ico'

$icon = New-Object System.Drawing.Icon($src)
$bmp = $icon.ToBitmap()
$w = $bmp.Width; $h = $bmp.Height
Write-Host "bitmap ${w}x${h}"

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

# 统计原图：不透明像素的亮度范围 + 代表性颜色（最亮/最暗采样）
$minL = 255; $maxL = 0
$samples = New-Object System.Collections.Generic.List[string]
for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
        $i = $row + $x * 4
        $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]; $a = $bytes[$i + 3]
        if ($a -gt 0) {
            $L = [int](0.299 * $r + 0.587 * $g + 0.114 * $b)
            if ($L -lt $minL) { $minL = $L }
            if ($L -gt $maxL) { $maxL = $L }
            if (($x % 32 -eq 0) -and ($y % 32 -eq 0)) { $samples.Add("($r,$g,$b)@($x,$y)") }
        }
    }
}
Write-Host "opaque lum range: min=$minL max=$maxL"
Write-Host "samples: $($samples -join ' ')"

# 亮度 -> 蓝色渐变映射（保留 alpha，渐变层次不变）
$B0r = 10;   $B0g = 40;  $B0b = 110   # 深蓝
$B1r = 96;   $B1g = 176; $B1b = 255   # 亮蓝
for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
        $i = $row + $x * 4
        $a = $bytes[$i + 3]
        if ($a -eq 0) { continue }
        $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]
        $n = (0.299 * $r + 0.587 * $g + 0.114 * $b) / 255.0
        $bytes[$i]     = [byte][math]::Round($B0b + ($B1b - $B0b) * $n)
        $bytes[$i + 1] = [byte][math]::Round($B0g + ($B1g - $B0g) * $n)
        $bytes[$i + 2] = [byte][math]::Round($B0r + ($B1r - $B0r) * $n)
    }
}
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$bmp.UnlockBits($data)

# 保存 PNG 字节流
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()
$ms.Dispose(); $bmp.Dispose(); $icon.Dispose()

# 重新组装 ICO（ICONDIR + PNG entry，256x256 的 w/h 字段记为 0）
$fs = [System.IO.File]::Create($dst)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)   # reserved
$bw.Write([uint16]1)   # type: icon
$bw.Write([uint16]1)   # count
$bw.Write([byte]0); $bw.Write([byte]0)   # width=256, height=256
$bw.Write([byte]0); $bw.Write([byte]0)   # colors, reserved
$bw.Write([uint16]1)                     # planes
$bw.Write([uint16]32)                    # bitcount
$bw.Write([uint32]$png.Length)           # data size
$bw.Write([uint32]22)                    # data offset
$bw.Write($png)
$bw.Flush(); $fs.Dispose()
Write-Host "written: $dst ($($png.Length + 22) bytes)"
