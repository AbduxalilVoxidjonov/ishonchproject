<#
  Ishonch yangi versiyasini yig'ish (kompyuterdan):
      .\tools\release.ps1 -Version 0.6.1
  Qiladi: testlar -> Ishonch.exe yig'ish -> SHA-256. -Publish berilsa GitHub Release ham yaratadi
  (berilmasa hech narsa yuborilmaydi). Odatiy yo'l: git tag v0.6.1 va git push origin v0.6.1
  (GitHub Actions o'zi chiqaradi: .github\workflows\release.yml).
#>
param(
    [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [switch]$Publish,
    [string]$Repo = 'AbduxalilVoxidjonov/ishonchproject'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    dotnet run -c Release --project tests/AppTests/AppTests.csproj
    if ($LASTEXITCODE -ne 0) { throw "Testlar o'tmadi" }

    $out = Join-Path $root 'publish'
    dotnet publish IshonchDesktop.csproj -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:Version=$Version -o $out
    if ($LASTEXITCODE -ne 0) { throw "Yig'ish xato bilan tugadi" }

    $exe = Join-Path $out 'Ishonch.exe'
    $hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
    "$hash  Ishonch.exe" | Set-Content -NoNewline -Encoding ascii "$exe.sha256"
    Write-Host "Tayyor: $exe ($([math]::Round((Get-Item $exe).Length/1MB,1)) MB)`nSHA-256: $hash"

    if ($Publish) {
        gh release create "v$Version" $exe "$exe.sha256" --repo $Repo --title "Ishonch $Version" --generate-notes
    }
}
finally { Pop-Location }
