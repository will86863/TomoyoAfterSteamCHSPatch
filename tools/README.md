# tools

本目录是把 PSP 版汉化译文迁移进 Steam 版补丁（`../patch/`）时用的脚本，Node.js 环境，无第三方依赖。

## 目录

| 路径 | 说明 |
| --- | --- |
| `alignlib.js` | 核心库：补丁文件解析、说话人与长度特征、带状 DP 对齐。其余脚本大多依赖它 |
| `build_v*.js` | 对齐与回填的迭代版本，`build_v24.js` 是最终版的思路（按文件区间强制 DP 重映射） |
| `maps/` | 中间产物：PSP 句到补丁条目的映射表（`map_dated.json` 为日期锚定版，`map_merged.json` 为合并版） |
| `psp/clean2/` | 从 PSP 版 `.scr` 提取并清洗后的译文，一句一行，按章节分文件 |
| `check_*.js` | 校验：GBK 可编码性、译文是否超过 `length` 字段、标记与结构一致性等 |
| `verify_*.js` | 对齐结果与结构验证 |
| `diag_*.js` | 单点诊断：定位超长、错位、语义异常的具体条目 |

## 常用脚本

```bash
# 译文能否全部用 GBK 编码（引擎只认 GBK 字形）
node check_gbk2.js

# 哪些条目译文 GBK 字节数超过 length 字段（超过会导致补丁整体拒载）
node check_overlen.js

# 对齐可行性：官方骨架 × PSP 译文 的逐章条数对比
node check_align.js
```

默认读取仓库的 `../patch/`。若要看 `build_*` 生成的中间产物，设 `PATCH_OUT=./out_patch`。

## 两个前提

- `psp/clean2/` 是从 **PSP 版游戏本体的 `.scr` 文件**提取的，这部分文本随本仓库分发；但 `.scr` 原始文件本身属于游戏资源，没有放进来。需要重跑提取脚本的话，请自备 PSP 版游戏文件。
- `guide/ctx.js`、`guide/hexprobe.js` 同理，需要把 `.scr` 放到 `guide/scr/` 下才能运行。

## 关于超长条目

`check_overlen.js` 会报出约 979 条译文 GBK 字节数超过 `length` 字段。这是已知情况：补丁 DLL 在初始化时对超长条目的处理见上游仓库的历史讨论。**不要**用 `replace_flag` 绕过——那会越界覆盖原始脚本缓冲区，有崩溃风险。
