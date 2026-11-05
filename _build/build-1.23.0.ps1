# Manual mirror of _build/build-apk.ps1 (that script aborts on vite's stderr warning
# under $ErrorActionPreference="Stop"). Steps: cargo -> jniLibs -> gradle -> apksigner.
$ErrorActionPreference = "Continue"
$root = "D:\demo\Paint-v1"
$tauri = "$root\src-tauri"
$android = "$tauri\gen\android"
$toolchain = "D:\demo\toolchain"
$sdk = "D:\demo\android-sdk"
$Version = "1.23.0"

$jdk = Get-ChildItem "$toolchain\jdk17\jdk-*" -Directory | Select-Object -First 1
$ndk = Get-ChildItem "$toolchain\android-ndk-*" -Directory | Select-Object -First 1
$ndkBin = "$($ndk.FullName)\toolchains\llvm\prebuilt\windows-x86_64\bin"

$env:TEMP = "D:\demo\_tmp"
$env:TMP = "D:\demo\_tmp"
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:RUSTUP_HOME = "$toolchain\rustup"
$env:CARGO_HOME = "$toolchain\cargo"
$env:GRADLE_USER_HOME = "D:\demo\_tmp\gradle"
$env:PATH = @("$toolchain\mingw64\bin", "$($jdk.FullName)\bin", "$toolchain\cargo\bin", "$sdk\platform-tools", $env:PATH) -join ";"

$cc = "$ndkBin\aarch64-linux-android29-clang.cmd"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $cc
$env:CC_aarch64_linux_android = $cc
$env:CXX_aarch64_linux_android = "$ndkBin\aarch64-linux-android29-clang++.cmd"
$env:AR_aarch64_linux_android = "$ndkBin\llvm-ar.exe"

Write-Host "== cargo build"
Push-Location $tauri
& "$toolchain\cargo\bin\cargo.exe" build --release --target aarch64-linux-android --lib --features custom-protocol
$code = $LASTEXITCODE
Pop-Location
Write-Host "cargo exit=$code"
if ($code -ne 0) { exit 1 }

Write-Host "== copy so"
$so = Get-ChildItem "$tauri\target\aarch64-linux-android\release" -Filter "lib*_lib.so" | Select-Object -First 1
$jni = "$android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $jni | Out-Null
Get-ChildItem $jni -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item -LiteralPath $so.FullName -Destination $jni -Force
& "$ndkBin\llvm-strip.exe" --strip-debug "$jni\$($so.Name)"
Write-Host "so $($so.Name) $((Get-Item "$jni\$($so.Name)").Length) bytes"

Write-Host "== gradle"
Push-Location $android
& "$($env:USERPROFILE)\.gradle\wrapper\dists\gradle-8.14.3-bin\cv11ve7ro1n3o1j4so8xd9n66\gradle-8.14.3\bin\gradle.bat" --no-daemon -g "D:\demo\_tmp\gradle" assembleRelease
$gcode = $LASTEXITCODE
Pop-Location
Write-Host "gradle exit=$gcode"
if ($gcode -ne 0) { exit 1 }

Write-Host "== sign"
$unsigned = "$android\app\build\outputs\apk\release\app-release-unsigned.apk"
$apk = "$root\dist-apk\huihua-$Version-arm64.apk"
New-Item -ItemType Directory -Force -Path "$root\dist-apk" | Out-Null
& "$sdk\build-tools\35.0.0\apksigner.bat" sign --ks "$root\_build\huihua-release.jks" --ks-key-alias huihua --ks-pass "pass:huihua2026" --key-pass "pass:huihua2026" --out $apk $unsigned
Write-Host "apksigner exit=$LASTEXITCODE"
& "$sdk\build-tools\35.0.0\apksigner.bat" verify --print-certs $apk 2>&1 | Select-Object -First 4
& "$sdk\build-tools\35.0.0\aapt2.exe" dump badging $apk 2>&1 | Select-String "package:|application-label:"
Write-Host "APK    $apk"
Write-Host "size   $((Get-Item $apk).Length)"
Write-Host "sha256 $((Get-FileHash $apk -Algorithm SHA256).Hash.ToLower())"
