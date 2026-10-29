$ErrorActionPreference = "Stop"
$so = "D:\demo\Paint-v1\src-tauri\target\aarch64-linux-android\release\libhuihua_lib.so"
if (-not (Test-Path -LiteralPath $so)) {
  $alt = Get-ChildItem "D:\demo\Paint-v1\src-tauri\target\aarch64-linux-android\release" -Filter "lib*_lib.so" | Select-Object -First 1
  if ($alt) { $so = $alt.FullName } else { throw "no .so found" }
}
Write-Output "so=$so"
$jni = "D:\demo\Paint-v1\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $jni | Out-Null
Get-ChildItem $jni | ForEach-Object { Remove-Item $_.FullName -Force }
$dest = Join-Path $jni (Split-Path $so -Leaf)
Copy-Item -LiteralPath $so -Destination $dest -Force
$strip = "D:\demo\toolchain\android-ndk-r27c\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-strip.exe"
if (Test-Path $strip) { & $strip --strip-debug $dest }
Get-ChildItem $jni | Select-Object Name, Length
