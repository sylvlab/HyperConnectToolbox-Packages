param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$glyphs=[ordered]@{windows=0xE770;service=0xE713;status=0xE946;device=0xE7F8;camera=0xE722;audio=0xE8D6;mouse=0xE962;plugin=0xEA86}
$null=New-Item -ItemType Directory -Force -Path $OutputDirectory
foreach($id in $glyphs.Keys){
    $path=Join-Path $OutputDirectory ($id+'.png')
    if(Test-Path -LiteralPath $path){throw "Icon already exists: $path"}
    $bitmap=[Drawing.Bitmap]::new(64,64)
    $graphics=[Drawing.Graphics]::FromImage($bitmap)
    $font=[Drawing.Font]::new('Segoe MDL2 Assets',28,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
    $background=[Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255,23,91,166))
    $foreground=[Drawing.SolidBrush]::new([Drawing.Color]::White)
    $format=[Drawing.StringFormat]::new()
    try {
        if($font.Name -ne 'Segoe MDL2 Assets'){throw 'The Windows icon font is unavailable.'}
        $graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.TextRenderingHint=[Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $graphics.Clear([Drawing.Color]::Transparent)
        $graphics.FillEllipse($background,4,4,56,56)
        $format.Alignment=[Drawing.StringAlignment]::Center
        $format.LineAlignment=[Drawing.StringAlignment]::Center
        $graphics.DrawString([string][char]$glyphs[$id],$font,$foreground,[Drawing.RectangleF]::new(0,0,64,64),$format)
        $bitmap.Save($path,[Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $format.Dispose(); $foreground.Dispose(); $background.Dispose(); $font.Dispose()
        $graphics.Dispose(); $bitmap.Dispose()
    }
}
