# 民间藏品线上博物馆

这是一个静态线上博物馆项目，包含互动展线、藏品检索、专题路线、观展足迹、对照分析和沉浸式浏览效果。

## 快速启动

Windows 下双击：

- `启动线上博物馆.bat`
- 浏览器打开 `http://127.0.0.1:8765/online-museum/index.html`
- 关闭时双击 `关闭线上博物馆.bat`

也可以手动启动：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:8765/online-museum/index.html
```

## 仓库包含什么

- `online-museum/index.html`：主页面
- `online-museum/app.js`：交互逻辑
- `online-museum/styles.css`：视觉与动效
- `online-museum/data/catalog.js`：馆藏目录数据
- `online-museum/thumbs/`：缩略图素材
- `启动线上博物馆.bat` / `关闭线上博物馆.bat`：本地启动与关闭脚本
- `ASSET_GUIDE.md`：原始大素材放置说明

## 关于原始素材

完整原始档案约 34GB，且存在多个超过 GitHub 100MB 限制的 PDF。为了让仓库可正常推送和克隆，原始大文件没有纳入 Git。

页面仍会显示缩略图和目录信息；如需启用“打开原始档案”，请按 [ASSET_GUIDE.md](./ASSET_GUIDE.md) 将原始素材目录放回项目根目录。

## 发布说明

该项目是静态页面，可以部署到 GitHub Pages 或任何静态文件服务器。若部署到公开网站而不上传原始大素材，展厅、检索、缩略图、导览与对照功能可用；“打开原始档案”链接需要额外配置素材托管。
