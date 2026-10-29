#!/usr/bin/env bash
# 构建 v1.0.0 发布包
# 用法: bash tools/make_release.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GAME="$(cd "$ROOT/.." && pwd)"
VER="1.0.0"
OUTROOT="$GAME/release_out"
PKGDIR="$OUTROOT/TomoyoAfterSteamCHSPatch-v$VER"

echo "==> 仓库: $ROOT"
echo "==> 版本: v$VER"

rm -rf "$PKGDIR"
mkdir -p "$PKGDIR"

# 1) version.dll
DLL="$(find "$ROOT" -name version.dll -path '*Release*' -not -path '*/node_modules/*' 2>/dev/null | head -1)"
if [ -z "$DLL" ]; then
  echo "!! 找不到编译产物 version.dll。先运行 tools/build_dll.sh" >&2
  exit 1
fi
echo "==> DLL: $DLL ($(stat -c%s "$DLL") 字节)"
cp "$DLL" "$PKGDIR/version.dll"

# 2) 补丁说明与配置文件模板
cat > "$PKGDIR/patch_mode.cfg" <<'EOF'
0
EOF

cat > "$PKGDIR/使用说明.txt" <<'EOF'
Tomoyo After English Edition（Steam）简体中文补丁 v1.0.0
=========================================================

【包含内容】
  version.dll     汉化补丁主程序（文本已内嵌）
  g00-chs.zip     中文贴图替换包（984 个 .g00 文件）
  guide.html      全成就中文指南（PSP 对照），下载名 guide.html
  patch_mode.cfg  补丁模式配置

【安装步骤】
1. 把 version.dll 复制到游戏安装目录，例如：
   ...\steamapps\common\Tomoyo After ~It's a Wonderful Life~ English Edition\
2. 把 g00-chs.zip 解压后的所有 .g00 文件复制到游戏目录下的 g00\ 文件夹，
   覆盖同名文件。（覆盖前建议先备份原 g00 文件夹）
3. 启动游戏。

【关于 patch_mode.cfg】
  0 = 正式版（默认，只用 DLL 内嵌文本）
  1 = 导出原始文本
  2 = 打包模式
  3 = 调试模式（优先用游戏目录下 patch\ 文件夹的文本）
  4 = 禁用补丁
  一般玩家保持 0 即可。

【卸载】
  删除 version.dll 即可。贴图从备份恢复。

【已知问题】
  个别中文贴图存在错位，待后续版本修复。
  文本翻译已全部完成，正在做一周目实测校对。

【译文来源】
  PSP 版汉化文本：CK-GAL 中文化小组（澄空学园）PSP 完整汉化补丁 ver1.20
  移植与 PSP 未覆盖部分的翻译：DeepSeek-V4.1
  中文贴图：提取自 PC 18 禁版（Nice Rabbit 反河蟹补丁）

【许可】
  仅限非商业用途。原始项目：
  https://github.com/VLSMB/TomoyoAfterSteamCHSPatch
EOF

# 3) 贴图压缩包
echo "==> 打包贴图..."
POWERSHELL="/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
[ -x "$POWERSHELL" ] || POWERSHELL="powershell"
# MSYS 路径转 Windows 路径；路径含空格与单引号，改用环境变量传入避免引号地狱
WIN_SRC="$(cygpath -w "$ROOT/g00-chs" 2>/dev/null || echo "$ROOT/g00-chs")"
WIN_DST="$(cygpath -w "$PKGDIR/g00-chs.zip" 2>/dev/null || echo "$PKGDIR/g00-chs.zip")"
G00_SRC="$WIN_SRC" ZIP_DST="$WIN_DST" "$POWERSHELL" -NoProfile -ExecutionPolicy Bypass -Command \
  'Compress-Archive -Path (Join-Path $env:G00_SRC "*.g00") -DestinationPath $env:ZIP_DST -CompressionLevel Optimal -Force'

# 4) 攻略 HTML
echo "==> 复制攻略..."
cp "$ROOT/guide/Tomoyo After 全成就中文指南（PSP对照）.html" "$PKGDIR/攻略.html"

# 5) 汇总
echo
echo "==> 产物:"
ls -lh "$PKGDIR"
echo
echo "==> 总大小: $(du -sh "$PKGDIR" | cut -f1)"
