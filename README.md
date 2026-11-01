# Tomoyo After English Edition（Steam 版本）汉化补丁

## NOTICE

本补丁是源码可见但不可用于任何商业用途的项目，允许非商业目的的使用、修改与分发，禁止将当前项目及其任何基于当前项目的修改版本用于任何商业用途。本补丁按"原样"提供，不提供任何担保。更详细的说明参见 [NOTICE.md](NOTICE.md) 文件，如果当前概述与 NOTICE 产生冲突，以 NOTICE 的说明为准。

## 补丁介绍

本补丁是适用于 Steam 版本《Tomoyo After English Edition》的内存动态汉化补丁，并且可以积累 Steam 游玩时长、解锁成就以及获得集换式卡牌。

本分支在原项目的基础上完成了全部文本的汉化，并附带中文贴图替换文件。

效果图：

![Main Pic](docs/img/main.png)

## 本分支做了什么

原项目已完成补丁引擎（`version.dll`）与文本渲染框架，但译文仅覆盖少量章节。本分支在此基础上：

| 内容 | 说明 |
| --- | --- |
| `patch/` | 98 个章节文件、20,792 条文本，其中 95 个文件含中文（约 22.3 万字） |

**汉化文本的构成方式**：

1. **移植自 PSP 版汉化文本**——PSP 版《智代After》的完整汉化由 CK-GAL 中文化小组（澄空学园）制作，本项目把其中的译文移植到 Steam 版补丁格式中。移植工作由 **DeepSeek-V4.1** 完成：逐章对齐 PSP 剧本与 Steam 版脚本、按说话人和长度特征做带状 DP 匹配、回填到补丁文件。
2. **PSP 版没有的部分由 DeepSeek-V4.1 翻译**——包括 D&T 小游戏的道具与技能说明、结局独白等 PSP 版未以文本形式提供的段落。

**当前状态**：正文已核对完毕（20,792 / 20,792 条），全屏文字无法替换中文，待修复，贴图待修复。

**已知问题**：

1. **全屏逐字叙述不显示中文**——全屏白底逐字弹出的叙述模式（`SEEN9900`）不经过 `ConsumeTextInQuoteMode` hook，中文暂无法显示，该模式下显示英文原文。逆向分析见 [Issue_全屏逐字中文.md](00_文档/Issue_全屏逐字中文.md)。
2. **部分贴图错位**——中文贴图中有个别存在错位，待修复。

## 使用方法

### 1. 安装文本补丁

编译后的 `version.dll` 直接放在游戏所在文件夹即可实现汉化功能。

另外可以在游戏所在的文件夹创建一个 `patch_mode.cfg` 配置文件，文件里面写一个数字，可以用的数字以及对应的含义为：

- 0 = PATCH_RELEASE（正式版汉化补丁模式，只从 DLL 的资源文件中加载汉化文本，当这个配置文件不存在时的缺省值）
- 1 = PATCH_DUMP（导出模式，导出原始文本）
- 2 = PATCH_ARCHIVE（打包模式，将汉化后的文本打包成一个 bin 文件，用于将这个 bin 文件打包进 DLL 中）
- 3 = PATCH_DEBUG（调试补丁模式，优先从 DLL 的资源文件中加载汉化文本，之后如果 patch 文件夹有对应的文本文件，则使用 patch 文件夹中的）
- 4 = PATCH_NONE（禁用汉化补丁）

翻译可以使用模式 3 + patch 文件夹来测试文本显示效果。

### 2. 替换中文贴图

中文贴图（`g00-chs`，984 个 `.g00` 文件）以压缩包形式提供，请在 [Releases](https://github.com/will86863/TomoyoAfterSteamCHSPatch/releases) 页面下载，解压后复制到游戏安装目录的 `g00/` 文件夹，覆盖同名文件。

> 贴图与文本是两套独立的东西：只装 DLL 不换贴图，画面里的字仍是原文；只换贴图不装 DLL，对话文本仍是原文。
>
> 贴图版权归 **Nice Rabbit**，本仓库不分发其散文件，仅随发布包提供。

### 3. 使用 `patch/` 目录（可选）

仓库中的 `patch/` 目录是完整译文，可直接放到游戏根目录，配合 `patch_mode.cfg` 写 `3` 使用。这样无需重新打包 DLL 即可更新译文。

## 编译

本项目使用 Microsoft Visual Studio 2022（工具集版本 v143，Windows SDK 10.0）编译，目标平台为 Win32，配置类型为动态链接库（DLL），使用多字节字符集。

## 项目贡献者

**程序**：VLSMB（原项目作者）

**译文**

- PSP 版汉化文本：CK-GAL 中文化小组（澄空学园）· PSP 完整汉化补丁 ver1.20（2009-04-11，移植自 PS2 版汉化资源）
- 移植与补译：DeepSeek-V4.1

**中文贴图**：Nice Rabbit（PC 18 禁版反河蟹补丁）

**攻略**：咲夜 · [Steam 指南](https://steamcommunity.com/sharedfiles/filedetails/?id=3488465923)

**测试与维护**：will86863

## 翻译进度

本分支已完成全部章节（20,792 / 20,792 条）。原项目的逐章清单已不再适用，当前工作转为一周目实测与错位修正。

## 致谢

- [VLSMB/TomoyoAfterSteamCHSPatch](https://github.com/VLSMB/TomoyoAfterSteamCHSPatch)——补丁引擎与原始框架
- CK-GAL 中文化小组（澄空学园）——PSP 版汉化文本
- Nice Rabbit——PC 版中文贴图
- 咲夜——Steam 全成就指南

## 许可

本分支遵循原项目 NOTICE，仅限非商业用途。分发时请保留原项目链接与本 NOTICE。

---

## 仓库结构

本仓库承载**补丁源码**与**最终成品译文**。

```text
.
├── VersionInjectionPatch/    补丁引擎 C 源码（version.dll）
├── TomoyoAfterSteamCHSPatch.sln
├── docs/                     README 配图
├── NOTICE.md                 授权说明
│
└── patch/                    ★ 最终成品译文（100 个文件）
```

### 各目录说明

| 目录 | 内容 | 说明 |
| --- | --- | --- |
| `patch/` | `SEEN0001`~`SEEN9900` + `name.txt` + `pe_resource.txt` | **最终成品**，即游戏 `patch_mode.cfg=3` 时读取的译文。GBK 编码，LF 换行 |
| `VersionInjectionPatch/` | C 源码 | 编译产出 `version.dll`，需 VS2022 + v143 工具集 |

`patch/` 下的 `SEEN####.txt` 结构：

```text
type seen628
count 298

====================
index 1
offset 266
name NULL
length 40
====================
原文
====================
译文
====================
```

- 编码 **GBK**，换行 **LF**（`.gitattributes` 已锁定，禁止转换）
- `length` 是原文 GBK 字节数，译文不得超过
- 改 `patch/*.txt` **不需要重编 DLL**，运行期会重新加载

### 关于贴图

中文贴图（984 个 `.g00`）版权归 **Nice Rabbit**，本仓库不分发散文件，仅随 [Releases](https://github.com/will86863/TomoyoAfterSteamCHSPatch/releases) 的发布包提供。

### 关于工作区

汉化过程的完整记录（阶段报告、对齐数据、迁移脚本、Issue 稿）保留在本地工作区，未纳入本仓库。核心结论已写入本 README 与各 Issue 文件。

### 编译与使用

见上文「使用方法」与「编译」两节。编译产物为 `Release/version.dll`（约 1,001,472 字节），放入游戏根目录即可。

### 版本历史

| 版本 | 说明 |
| --- | --- |
| v1.2.0 | 更新 `patch/` 至完整译文；移除 `guide/`、`tools/`；重编 `version.dll`（去除诊断埋点） |
| v1.0.0 | 首个完整汉化发布 |
