# macOS 开发与构建指南

本指南用于在 macOS 上使用移动硬盘里的完整原始素材运行本项目。当前移动硬盘素材根目录为：

```text
/Volumes/Untitled/民间藏品
```

项目代码仓库位于：

```text
/Users/ylly_bot/clawd-dev/repos/online-museum
```

## 目录关系

`online-museum/data/catalog.js` 里的原始档案路径以 `../` 开头，例如：

```text
../弓文君（已改好）/弓文君（器物类）/MJCP-GWJ-QW.01-0001.jpg
```

因此浏览器访问 `online-museum/index.html` 时，原始素材目录必须和代码里的 `online-museum/` 目录处在同一级。Windows 版本通常直接把所有素材目录放在项目根目录。macOS 上不复制 34GB 原始素材，推荐把移动硬盘目录用符号链接映射到仓库根目录。

映射后仓库根目录会像这样：

```text
online-museum/
├─ online-museum/
├─ package.json
├─ vite.config.js
├─ 弓文君（已改好） -> /Volumes/Untitled/民间藏品/弓文君（已改好）
├─ 张维民（已上传数字档案室） -> /Volumes/Untitled/民间藏品/张维民（已上传数字档案室）
├─ 馆内 党史办（字画类）(已上传数字档案室） -> /Volumes/Untitled/民间藏品/馆内 党史办（字画类）(已上传数字档案室）
└─ ...
```

## 一次性映射移动硬盘素材

先确认移动硬盘已经挂载：

```bash
ls "/Volumes/Untitled/民间藏品"
```

然后在仓库根目录执行：

```bash
cd "/Users/ylly_bot/clawd-dev/repos/online-museum"
ASSET_ROOT="/Volumes/Untitled/民间藏品"

for source in "$ASSET_ROOT"/*; do
  name="$(basename "$source")"
  if [ "$name" = "online-museum" ]; then
    continue
  fi
  if [ ! -e "$name" ] && [ ! -L "$name" ]; then
    ln -s "$source" "$name"
  fi
done
```

这个操作只创建符号链接，不会复制原始素材。以后只要移动硬盘仍挂载在同一路径，链接就会继续有效。

检查映射是否成功：

```bash
ls -l "弓文君（已改好）"
ls "馆内 党史办（字画类）(已上传数字档案室）"
```

如果移动硬盘名称以后不是 `Untitled`，路径会变成 `/Volumes/新的名称/民间藏品`。这种情况下删除旧链接后，用新的 `ASSET_ROOT` 重新执行上面的映射命令。

## 安装依赖

首次运行需要安装 Node.js LTS，然后安装依赖：

```bash
cd "/Users/ylly_bot/clawd-dev/repos/online-museum"
npm install
```

## 本地开发运行

启动开发服务器：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:8765/online-museum/index.html
```

如果 `8765` 已被占用，Vite 会使用另一个可用端口。终端输出里会显示实际端口，把地址里的端口改成实际端口即可。

停止服务：

```bash
Control-C
```

## 构建静态文件

生成发布文件：

```bash
npm run build
```

构建结果输出到：

```text
dist/
```

注意：`dist/` 只包含网页代码、目录数据、缩略图和截图，不包含移动硬盘里的原始大文件。如果要让构建后的“打开原始档案”链接继续可用，需要把构建出的 `dist/online-museum/` 放到一个和原始素材目录同级的位置。

在当前移动硬盘结构下，可以这样更新硬盘里的网页文件：

```bash
npm run build
rsync -a --delete "dist/online-museum/" "/Volumes/Untitled/民间藏品/online-museum/"
```

然后用任意静态文件服务器把 `/Volumes/Untitled/民间藏品` 作为站点根目录提供出去，访问：

```text
/online-museum/index.html
```

这样 `../弓文君（已改好）/...` 这类原始档案链接会继续指向同级素材目录。

## 重新生成目录数据

通常不需要重新生成 `online-museum/data/catalog.js`。如果移动硬盘里的原始素材有增删，并且已经完成符号链接映射，可以在仓库根目录重新生成目录：

```bash
python3 online-museum/scripts/build_catalog.py
```

该脚本会扫描仓库根目录下的素材目录，跳过 `online-museum/` 代码目录，并更新：

```text
online-museum/data/catalog.js
online-museum/thumbs/
```

## 常见问题

如果页面能打开但原始档案打不开，先确认对应素材链接在仓库根目录存在：

```bash
ls "弓文君（已改好）"
```

如果提示找不到文件，说明移动硬盘没有挂载、卷名变化，或符号链接还没有创建。

如果浏览器地址是 `file://.../online-museum/index.html`，不要用这种方式测试开发版。请使用 `npm run dev` 提供的 `http://127.0.0.1:8765/online-museum/index.html`。

如果要公开部署且不能上传 34GB 原始素材，请保留当前构建方式，只部署 `dist/`。展厅、检索、缩略图、导览与对照功能仍可用；“打开原始档案”需要另行配置对象存储或文件服务器。
