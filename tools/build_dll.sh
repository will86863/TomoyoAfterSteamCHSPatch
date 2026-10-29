#!/usr/bin/env bash
# 编译 version.dll（Release | Win32），并把 SEEN_CHS.TXT 作为 RCDATA 资源打包进去。
# 用法: bash tools/build_dll.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJ="$ROOT/VersionInjectionPatch"

# 1) 定位 MSBuild
MSBUILD=""
for p in \
  "/d/VSBuildTools/VS/MSBuild/Current/Bin/MSBuild.exe" \
  "/c/Program Files/Microsoft Visual Studio/2022/BuildTools/MSBuild/Current/Bin/MSBuild.exe" \
  "/c/Program Files/Microsoft Visual Studio/2022/Community/MSBuild/Current/Bin/MSBuild.exe"
do
  [ -f "$p" ] && MSBUILD="$p" && break
done
if [ -z "$MSBUILD" ]; then
  echo "!! 找不到 MSBuild.exe，请确认 Build Tools 已安装" >&2
  exit 1
fi
echo "==> MSBuild: $MSBUILD"

# 2) 生成 SEEN_CHS.TXT（资源）
echo "==> 打包译文..."
node "$ROOT/tools/pack_seen.js" "$PROJ/SEEN_CHS.TXT"

# 3) 编译
echo "==> 编译 Release|Win32 ..."
"$MSBUILD" "$ROOT/TomoyoAfterSteamCHSPatch.sln" \
  -p:Configuration=Release -p:Platform=Win32 \
  -verbosity:minimal -nologo

# 4) 找产物
DLL="$(find "$PROJ" -name version.dll -path '*Release*' | head -1)"
if [ -z "$DLL" ]; then
  echo "!! 编译完成但找不到 version.dll" >&2
  exit 1
fi
echo "==> 产物: $DLL ($(stat -c%s "$DLL") 字节)"
