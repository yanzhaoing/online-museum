# 民间藏品线上博物馆

这是一个基于 Vite + Vue 3 的线上博物馆前端项目，包含互动展线、藏品检索、专题路线、观展足迹、对照分析和沉浸式浏览效果。构建后仍然输出为静态文件，可部署到 GitHub Pages 或任何静态文件服务器。

## 快速启动

Windows 下双击：

- `启动线上博物馆.bat`
- 浏览器打开 `http://127.0.0.1:8765/online-museum/index.html`
- 关闭时双击 `关闭线上博物馆.bat`

也可以手动启动：

```powershell
npm install
npm run dev
```

然后访问：

```text
http://127.0.0.1:8765/online-museum/index.html
```

## 仓库包含什么

- `online-museum/index.html`：主页面
- `online-museum/src/`：Vue 组件、状态组合函数与目录工具
- `online-museum/styles.css`：视觉与动效
- `online-museum/data/catalog.js`：馆藏目录数据
- `online-museum/thumbs/`：缩略图素材
- `vite.config.js` / `package.json`：Vite + Vue 开发与静态构建配置
- `启动线上博物馆.bat` / `关闭线上博物馆.bat`：本地启动与关闭脚本
- `ASSET_GUIDE.md`：原始大素材放置说明
- `MACOS_BUILD_DEV_GUIDE.md`：macOS 下使用移动硬盘素材的开发与构建说明

## 关于原始素材

完整原始档案约 34GB，且存在多个超过 GitHub 100MB 限制的 PDF。为了让仓库可正常推送和克隆，原始大文件没有纳入 Git。

页面仍会显示缩略图和目录信息；如需启用“打开原始档案”，请按 [ASSET_GUIDE.md](./ASSET_GUIDE.md) 将原始素材目录放回项目根目录。

macOS 下如果原始素材在移动硬盘 `/Volumes/Untitled/民间藏品`，请按 [MACOS_BUILD_DEV_GUIDE.md](./MACOS_BUILD_DEV_GUIDE.md) 用符号链接映射素材目录，不需要复制 34GB 文件。

## 发布说明

开发源码需要通过 Vite 运行：

```powershell
npm run dev
```

生成静态发布文件：

```powershell
npm run build
```

构建结果输出到 `dist/`。若部署到公开网站而不上传原始大素材，展厅、检索、缩略图、导览与对照功能可用；“打开原始档案”链接需要额外配置素材托管。
