# 一整套展馆图 · 需求与两种获取路径

给老板预览用的"展馆图整套方案"，按展厅角色共 8 张，风格统一对标现有的 2D 路线背景
`online-museum/textures/guqin-gallery-room-v1.png`（暖光、白墙、深木格栅、灰石地面、玻璃展柜、空荡无人）。

## 规格

- 横构图，建议 3:2 或 16:9，宽 ≥1600px
- 写实摄影感，色温约 3000K，无主灯氛围照明（轨道射灯 + 展柜内灯带）
- 米白展墙、深胡桃木格栅/梁柱、深灰磨光石材地面（轻微反光）
- **全部空荡无人；墙面/展签留白，不出现任何可读文字**（AI 生图务必强调这点，否则中文变乱码）

## 角色清单

| # | 角色 | 画面要点 |
|---|------|---------|
| 1 | 序厅 | 入口大厅，整面留白主展墙（将来放展览标题），一侧木格栅屏风 |
| 2 | 文献厅 A | 通顶玻璃文献展柜整墙，内部书册虚化，洗墙灯带 |
| 3 | 文献厅 B | 展墙 + 斜面文献展台（翻阅姿态的展台，空台面） |
| 4 | 器物厅 A | 独立玻璃展柜阵列，柜内青瓷/陶器等器物虚化，重点射灯 |
| 5 | 器物厅 B | 中央岛台展柜 + 背景展墙，暖光聚焦柜内 |
| 6 | 字画厅 A | 长展墙悬挂立轴字画（画芯内容虚化不可读），深木画框 |
| 7 | 字画厅 B | 手卷/册页平柜 + 墙面单幅立轴，柔和顶光 |
| 8 | 走廊 | 纵深走廊，一侧展墙一侧木格栅，尽头柔光 |

## 路径 A：AI 生成（推荐，与现有背景同源）

用 `gpt-image-prompts.md` 里的 8 条提示词在 GPT image 逐张生成。
生成后把图放进 `online-museum/textures/`（命名如 `hall-01-entrance.png`）即可接入。

## 路径 B：公开图库下载（需在无限制网络下执行）

本机网络实测：Unsplash/Pexels 网页与 API、Flickr、Wikimedia Commons、Openverse 均被拦，
国内搜索引擎结果几乎全带图库水印或别家展览标题，不可用。
以下链接在可正常访问外网的网络（如手机热点）下打开挑图：

- Unsplash 搜索：<https://unsplash.com/s/photos/museum-exhibition-hall> 、 <https://unsplash.com/s/photos/chinese-museum>
- Pexels 搜索：<https://www.pexels.com/search/museum%20exhibition%20hall/> 、 <https://www.pexels.com/search/gallery%20interior/>
- Flickr（CC 授权筛选）：<https://www.flickr.com/search/?license=4%2C5%2C9%2C10&text=museum%20gallery%20interior>

挑好后执行 `fetch-hall-images.sh`（把选中的图片 URL 填进去），自动下载到本目录并校验尺寸。
授权：Unsplash/Pexels 可免费商用无需署名；Flickr 按各图 CC 条款（CC-BY 需署名）。
