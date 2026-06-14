# Windows npm dev 演示指南

这份指南用于在 Windows 电脑或 Windows Server 上直接运行开发模式，方便现场操作、演示和调试线上博物馆。它不是生产部署方案；正式部署仍应使用 `npm run build` 生成 `dist/`。

## 适用场景

- 在 Windows 上打开项目并演示完整前端。
- 需要现场操作虚拟展馆、藏品检索、专题浏览和原始档案链接。
- 需要临时改代码后立即刷新浏览器看效果。

## 准备环境

需要先安装：

- Windows 10/11 或 Windows Server
- Node.js LTS，安装时保留默认的 npm 选项
- Chrome、Edge 或其他现代浏览器

安装完成后，重新打开 PowerShell 或命令提示符，确认 Node 和 npm 可用：

```powershell
node -v
npm -v
```

如果提示找不到 `node` 或 `npm`，请重新安装 Node.js LTS，或关闭终端后重新打开。

## 项目目录

把项目放到一个路径简单的位置，例如：

```text
D:\online-museum
```

目录里应该能看到这些文件：

```text
online-museum\
package.json
vite.config.js
启动线上博物馆.bat
关闭线上博物馆.bat
```

后续命令都需要在包含 `package.json` 的项目根目录执行。

## 方法一：手动运行 npm dev

打开 PowerShell，进入项目根目录：

```powershell
cd D:\online-museum
```

第一次运行先安装依赖：

```powershell
npm install
```

启动开发服务器：

```powershell
npm run dev
```

正常情况下，浏览器访问：

```text
http://127.0.0.1:8765/online-museum/index.html
```

如果 `8765` 已被占用，Vite 会在终端里显示实际端口，例如 `8766`。这时按终端里的端口访问：

```text
http://127.0.0.1:8766/online-museum/index.html
```

停止服务时，在运行 `npm run dev` 的终端里按：

```text
Ctrl + C
```

## 方法二：双击脚本运行

也可以直接双击：

```text
启动线上博物馆.bat
```

脚本会自动完成这些事：

- 检查 Node.js 和 npm 是否存在。
- 如果没有 `node_modules`，自动执行 `npm install`。
- 从 `8765` 到 `8795` 之间选择可用端口。
- 启动 Vite 开发服务器。
- 自动打开浏览器。

关闭演示服务时，双击：

```text
关闭线上博物馆.bat
```

脚本模式适合非开发人员现场演示；手动 `npm run dev` 更适合开发调试。

## 局域网内让其他设备访问

默认开发服务器只绑定 `127.0.0.1`，也就是只允许本机访问。这样最安全，适合在 Windows 机器本机演示。

如果需要同一局域网内的手机、平板或其他电脑访问，可以手动启动：

```powershell
npm run dev -- --host 0.0.0.0 --port 8765
```

然后在 Windows 防火墙里允许 TCP `8765` 端口。其他设备访问：

```text
http://<Windows机器IP>:8765/online-museum/index.html
```

示例：

```text
http://192.168.1.20:8765/online-museum/index.html
```

只建议在可信局域网中这样做。不要把 Vite 开发服务器直接暴露到公网。

## 原始大素材

仓库里保留了缩略图、目录数据和虚拟展馆所需资源，所以不放原始大素材也能浏览展厅、搜索藏品和操作导览。

如果需要页面里的“打开原始档案”链接也可用，请把原始素材目录放到项目根目录，和 `online-museum` 文件夹同级。完整目录列表见 [ASSET_GUIDE.md](./ASSET_GUIDE.md)。

目录结构示例：

```text
D:\online-museum\
├─ online-museum\
├─ package.json
├─ 启动线上博物馆.bat
├─ 弓文君（已改好）\
├─ 张维民（已上传数字档案室）\
├─ 徐星宇（已上传数字档案室）\
└─ ...
```

如果原始素材不在项目根目录，“打开原始档案”可能 404，但不影响网站主体浏览。

## 常见问题

`node` 不是内部或外部命令：

安装 Node.js LTS 后重新打开 PowerShell。如果仍然失败，检查 `C:\Program Files\nodejs` 是否在系统 `Path` 中。

`npm install` 下载失败：

先确认 Windows 机器可以访问 npm registry。如果公司网络需要代理，请先配置 npm 代理。网络恢复后重新执行 `npm install`。

浏览器打开 404：

确认服务是在项目根目录启动的，并且 URL 包含 `/online-museum/index.html`。只访问 `http://127.0.0.1:8765/` 不是正确入口。

端口被占用：

双击脚本会自动换到 `8765` 到 `8795` 之间的可用端口。手动模式请看终端输出的实际端口。

局域网其他设备打不开：

确认启动命令使用了 `--host 0.0.0.0`，Windows 防火墙放行了对应端口，并且访问的是 Windows 机器的局域网 IP。

“打开原始档案”不可用：

确认原始素材目录已经放在项目根目录，且目录名和 [ASSET_GUIDE.md](./ASSET_GUIDE.md) 中列出的名称一致。

## 开发模式和生产构建的区别

开发演示：

```powershell
npm run dev
```

生产构建：

```powershell
npm run build
```

`npm run dev` 适合现场操作和调试；`npm run build` 会生成 `dist/`，适合放到静态服务器或生产包里部署。
