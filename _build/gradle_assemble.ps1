$ErrorActionPreference = "Continue"
$env:JAVA_HOME = "D:\demo\toolchain\jdk17\jdk-17.0.20.1+1"
$env:ANDROID_HOME = "D:\demo\android-sdk"
$env:ANDROID_SDK_ROOT = "D:\demo\android-sdk"
$env:PATH = "$env:JAVA_HOME\bin;D:\demo\android-sdk\platform-tools;$env:PATH"

Set-Location "D:\demo\Paint-v1\src-tauri\gen\android"
& .\gradlew.bat --no-daemon assembleRelease --stacktrace 2>&1 | Select-Object -Last 80
Write-Output "gradle exit=$LASTEXITCODE"
