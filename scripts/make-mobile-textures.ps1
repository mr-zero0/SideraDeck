# Builds 4K copies of the 8K zoom textures for phones (public/textures/hires/4k/, gitignored with hires/).
# Solar System Scope publishes only 2K and 8K, so phones get a downscaled 8K: sharper than 2K at a
# quarter of the GPU memory. Windows PowerShell / .NET System.Drawing; if these files are missing the
# app falls back to 2K on phones.
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'public\textures\hires'
$dst = Join-Path $src '4k'
New-Item -ItemType Directory -Force $dst | Out-Null
$maxWidth = 4096
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]90)

Get-ChildItem $src -File | ForEach-Object {
  $out = Join-Path $dst $_.Name
  if (Test-Path $out) { return }
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  try {
    $w = [Math]::Min($maxWidth, $img.Width)
    $h = [int]($img.Height * $w / $img.Width)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()
    if ($_.Extension -eq '.png') { $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png) } else { $bmp.Save($out, $jpeg, $params) }
    $bmp.Dispose()
    Write-Output "OK $($_.Name) -> ${w}x${h}"
  } finally { $img.Dispose() }
}
