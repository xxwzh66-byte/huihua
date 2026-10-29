$ErrorActionPreference = "Stop"
$env:RUSTUP_HOME = "D:\demo\toolchain\rustup"
$env:CARGO_HOME = "D:\demo\toolchain\cargo"
$env:PATH = "D:\demo\toolchain\mingw64\bin;D:\demo\toolchain\jdk17\jdk-17.0.20.1+1\bin;D:\demo\toolchain\cargo\bin;$env:PATH"

$ndkBin = "D:\demo\toolchain\android-ndk-r27c\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkBin\aarch64-linux-android29-clang.cmd"
$env:CC_aarch64_linux_android = "$ndkBin\aarch64-linux-android29-clang.cmd"
$env:CXX_aarch64_linux_android = "$ndkBin\aarch64-linux-android29-clang++.cmd"
$env:AR_aarch64_linux_android = "$ndkBin\llvm-ar.exe"

Set-Location "D:\demo\Paint-v1\src-tauri"
& cargo build --release --target aarch64-linux-android --lib --features custom-protocol
Write-Output "cargo exit=$LASTEXITCODE"
