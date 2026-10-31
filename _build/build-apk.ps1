<#
    一条命令出 APK：vite build → cargo → copy .so → gradle → 签名 → 三件套校验。

    和 _build/cargo_android.ps1 / copy_so.ps1 / gradle_assemble.ps1 的区别：
    那三个脚本把 D:\demo\Paint-v1 和 D:\demo\toolchain 写死了，换个目录就报错；
    这个按脚本位置推算仓库根，工具链路径从参数或环境变量取。

    用法：
      powershell.exe -NoProfile -ExecutionPolicy Bypass -File _build\build-apk.ps1 `
        -Toolchain D:\demo\toolchain -Sdk D:\demo\android-sdk

    前置（缺哪个它会直接说）：
      -Toolchain 下要有 rustup\ cargo\ mingw64\ jdk17\jdk-17*\ android-ndk-r27c\
      -Sdk       下要有 platforms\android-36 build-tools\35.0.0 platform-tools
      _build\huihua-release.jks（签名用，不在仓库里，必须找回同一份）
#>
param(
  [string]$Toolchain = $env:HUIHUA_TOOLCHAIN,
  [string]$Sdk = $env:HUIHUA_SDK,
  [string]$Version = "",
  [string]$Keystore = "",
  [string]$KeyAlias = "huihua",
  [string]$KeyPass = "huihua2026"
)

$ErrorActionPreference = "Stop"
function jp([string]$a, [string]$b) {
  # Join-Path 在盘符不存在时会直接抛 DriveNotFoundException；纯字符串拼接不碰文件系统。
  if ($a -and $b) { return [System.IO.Path]::Combine($a, $b) }
  if ($a) { return $a }
  return $b
}

$root = Split-Path $PSScriptRoot -Parent
$tauri = jp $root "src-tauri"
$android = jp $tauri "gen\android"

function Fail($msg) { Write-Host "缺少：$msg" -ForegroundColor Red; exit 1 }

# 默认路径按机器挑：老开发机在 D:\demo，新环境（这台）在 C:\demo。
if (-not $Toolchain) {
  $Toolchain = if (Test-Path "D:\demo\toolchain") { "D:\demo\toolchain" } else { "C:\demo\toolchain" }
}
if (-not $Sdk) {
  $Sdk = if (Test-Path "D:\demo\android-sdk") { "D:\demo\android-sdk" } else { "C:\demo\android-sdk" }
}
if (-not $Version) {
  $Version = (Get-Content (jp $root "package.json") -Raw | ConvertFrom-Json).version
}
if (-not $Keystore) { $Keystore = jp $PSScriptRoot "huihua-release.jks" }

$jdk = Get-ChildItem (jp $Toolchain "jdk17") -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer } | Select-Object -First 1
$ndk = Get-ChildItem (jp $Toolchain "android-ndk-*") -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer } | Select-Object -First 1

$missing = @()
foreach ($p in @(
    @{ n = "rustup";       v = (jp $Toolchain "rustup") },
    @{ n = "cargo";        v = (jp $Toolchain "cargo\bin\cargo.exe") },
    @{ n = "JDK 17";       v = ($jdk | ForEach-Object FullName) },
    @{ n = "Android NDK";  v = ($ndk | ForEach-Object FullName) },
    @{ n = "Android SDK";  v = (jp $Sdk "platforms\android-36") },
    @{ n = "build-tools";  v = (jp $Sdk "build-tools\35.0.0") },
    @{ n = "签名 keystore"; v = $Keystore }
  )) {
  if (-not $p.v -or -not (Test-Path -LiteralPath $p.v)) { $missing += "$($p.n) → $($p.v)" }
}
if ($missing.Count) {
  Write-Host "缺这些工具（装好或改路径后重跑）：" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  ✗ $_" }
  exit 1
}

$jdkHome = $jdk.FullName
$ndkBin = jp $ndk.FullName "toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
$env:RUSTUP_HOME = jp $Toolchain "rustup"
$env:CARGO_HOME = jp $Toolchain "cargo"
$env:PATH = @(
  (jp $Toolchain "mingw64\bin"),
  (jp $jdkHome "bin"),
  (jp $Toolchain "cargo\bin"),
  (jp $Sdk "platform-tools"),
  $env:PATH
) -join ";"

$cc = jp $ndkBin "aarch64-linux-android29-clang.cmd"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $cc
$env:CC_aarch64_linux_android = $cc
$env:CXX_aarch64_linux_android = (jp $ndkBin "aarch64-linux-android29-clang++.cmd")
$env:AR_aarch64_linux_android = (jp $ndkBin "llvm-ar.exe")

Write-Host "仓库   $root"
Write-Host "版本   $Version"
Write-Host "工具链 $Toolchain"
Write-Host "SDK    $Sdk"
Write-Host ""

# 1) 前端产物
Push-Location $root
& node node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { Fail "vite build" }
$indexJs = (Get-ChildItem (jp $root "dist\assets") -Filter "index-*.js" | Select-Object -First 1).Name
Write-Host "前端   dist/assets/$indexJs" -ForegroundColor Green
Pop-Location

# 2) Rust → .so
Push-Location $tauri
& cargo build --release --target aarch64-linux-android --lib --features custom-protocol
if ($LASTEXITCODE -ne 0) { Fail "cargo build" }
Pop-Location

# 3) .so 进 jniLibs（strip 掉调试段）
$soDir = jp $tauri "target\aarch64-linux-android\release"
$so = Get-ChildItem $soDir -Filter "lib*_lib.so" | Select-Object -First 1
if (-not $so) { Fail ".so（$soDir）" }
$jni = jp $android "app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $jni | Out-Null
Get-ChildItem $jni | Remove-Item -Force
Copy-Item -LiteralPath $so.FullName -Destination $jni -Force
$strip = jp $ndkBin "llvm-strip.exe"
if (Test-Path $strip) { & $strip --strip-debug (jp $jni $so.Name) }
$soSize = (Get-Item (jp $jni $so.Name)).Length
Write-Host "so     $($so.Name) $soSize 字节" -ForegroundColor Green

# 4) Gradle
Push-Location $android
& .\gradlew.bat --no-daemon assembleRelease --stacktrace
if ($LASTEXITCODE -ne 0) { Fail "gradlew assembleRelease" }
Pop-Location

# 5) 签名
$unsigned = jp $android "app\build\outputs\apk\release\app-release-unsigned.apk"
if (-not (Test-Path $unsigned)) { Fail "未签名的 APK（$unsigned）" }
$outDir = jp $root "dist-apk"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$apk = jp $outDir "huihua-$Version-arm64.apk"
$apksigner = jp $Sdk "build-tools\35.0.0\apksigner.bat"
& $apksigner sign --ks $Keystore --ks-key-alias $KeyAlias `
  --ks-pass "pass:$KeyPass" --key-pass "pass:$KeyPass" --out $apk $unsigned
if ($LASTEXITCODE -ne 0) { Fail "apksigner" }

# 6) 三件套
& $apksigner verify --print-certs $apk | Select-Object -First 4
$aapt = jp $Sdk "build-tools\35.0.0\aapt2.exe"
if (Test-Path $aapt) {
  & $aapt dump badging $apk | Select-String "package:|application-label:" | Select-Object -First 2
}
$hash = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLower()
Write-Host ""
Write-Host "APK    $apk" -ForegroundColor Green
Write-Host "大小   $((Get-Item $apk).Length) 字节"
Write-Host "SHA256 $hash"
Write-Host ""
Write-Host "下一步：node _build/publish-1.17.0.cjs（会自动上传并把 Release 转正）"
