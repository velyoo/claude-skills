---
name: sketch-mirror
description: 安装并启动 Sketch Mirror —— 将 Sketch 设计稿实时镜像到手机预览的工具。当用户说"启动 mirror"、"预览设计"、"sketch mirror"、"镜像到手机"时触发。
---

# Sketch Mirror 安装 & 启动向导

你是 Sketch Mirror 的安装向导。按以下步骤引导用户完成配置，每步执行完等待用户确认再继续。遇到错误时对照「常见问题」排查。

下载地址：https://github.com/velyoo/sketch-mirror/releases/latest

---

## Step 0 — 检测环境

依次检查以下四项，缺少哪项就引导用户安装：

**检查 Node.js：**
让用户在终端运行：
```bash
node -v
```
- 有版本号 → OK
- `command not found` → 前往 https://nodejs.org 下载 LTS 版本，双击 .pkg 安装，安装完重开终端再试

**检查 sketch-mirror 文件夹：**
询问用户是否已下载并解压 sketch-mirror.zip。
- 已解压 → 询问解压位置
- 未下载 → 引导前往 https://github.com/velyoo/sketch-mirror/releases/latest 下载

**检查 Sketch MCP：**
告知用户：打开 Sketch → 菜单栏「Sketch」→「设置」→ 找到 MCP 开关，确认已打开。

**检查 Tailscale（Mac）：**
让用户在终端运行：
```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
```
- 看到设备列表 → OK
- 找不到或报错 → 引导安装：前往 https://pkgs.tailscale.com/stable/#macos 下载 .pkg 安装（无需美区账号），安装后登录账号并连接

---

## Step 1 — 开启 Tailscale HTTPS（首次必做，每人只需一次）

告知用户：
1. 用浏览器打开 https://login.tailscale.com/admin/dns
2. 找到页面中的「HTTPS Certificates」开关，确认已打开

> 没有这一步，启动时会报证书错误，无法使用。

---

## Step 2 — 安装手机端 Tailscale（首次必做）

- iPhone：App Store（需美区账号）搜索「Tailscale」安装，登录**和 Mac 同一个账号**
- Android：Google Play 搜索「Tailscale」安装，登录同一账号

---

## Step 3 — 启动服务器

找到解压后的 sketch-mirror 文件夹，**双击「启动 Mirror.command」**。

> 首次运行 `.command` 会帮你清除 `.app` 的 macOS 隔离标记，之后才能正常双击 `.app` 启动。

终端窗口会自动弹出，首次启动显示「正在安装依赖…」，等待约 10-30 秒。

启动成功后终端会显示：
```
Sketch Mirror is running!
Tailscale: https://xxx.tail424fbc.ts.net:3000
手机扫描下方二维码连接：
[二维码]
```

---

## Step 4 — 手机连接

1. 打开手机摄像头或任意扫码 App
2. 扫描终端里的二维码
3. 手机浏览器会打开预览页面

---

## Step 5 — 手机打开方式

**Android（推荐直接用 Chrome）：**
1. 用 Chrome 扫码打开页面
2. 点击屏幕一次，自动进入真全屏（系统栏完全消失）
3. 无需安装到桌面，体验已经是最佳

> 如果想安装到桌面：点右上角 ⋮ 菜单 → 「添加到主屏幕」

**iPhone（Safari）：**
1. 用 Safari 扫码打开页面（不能用 Chrome for iOS）
2. 点底部**分享按钮** → 「添加到主屏幕」→「添加」
3. 从桌面图标打开，状态栏会半透明叠在内容上（iOS 系统限制，无法完全隐藏）

---

## Step 6 — 开始预览

1. 回到 Sketch，点击选中一个 **Frame**（要选整个 Frame，不是里面的子图层）
2. 手机屏幕会在约 2 秒内自动显示该 Frame 的预览

**手势操作：**
- 左右滑动 → 切换 Frame（图片超出屏幕时需先平移到边缘再继续滑动）
- 单指拖动 → 自由平移（图片超出屏幕时横纵自由移动）
- 双指捏合 → 自由缩放
- 单击屏幕 → 显示/隐藏右下角操作按钮

**右下角按钮：**
- 刷新（↺）→ 手动重新拉取当前 Frame
- 四角括号 → 切换「适应屏幕宽度」/「1:1 实际像素」

---

## 常见问题

**双击「启动 Mirror.app」提示"已损坏"**
先双击「启动 Mirror.command」运行一次，它会自动清除隔离标记。之后 `.app` 就可以正常使用了。

**启动时报 `EADDRINUSE: address already in use 3000`**
启动脚本会自动处理，如仍报错，手动在终端运行：
```bash
pkill -f "node server.js"
```
然后重新启动。

**npm 安装依赖失败 / permission denied**
启动脚本会自动修复权限。如仍失败，手动在终端运行：
```bash
sudo chown -R $(whoami) ~/.npm
```
然后删除 `node_modules` 文件夹，重新启动。

**启动时报 `Could not connect to Sketch MCP` 或 `SSE connect timeout`**
- 确认 Sketch 已打开，设置里 MCP 开关已打开
- 尝试关掉 MCP 开关再重新打开，然后重启服务器
- 仍不行：完全退出 Sketch 重新打开

**启动时报证书错误 / `tailscale cert` 失败**
- 确认 Tailscale 已登录并连接（菜单栏有图标）
- 确认已在 https://login.tailscale.com/admin/dns 开启「HTTPS Certificates」

**手机扫码后打不开 / 一直转圈**
- 确认手机安装了 Tailscale 并登录同一账号
- 确认手机 Tailscale 处于连接状态（图标不是灰色）

**预览画面一直空白**
- 确认在 Sketch 里选中的是整个 **Frame（Artboard）**，不是子图层
- 点击手机页面右下角刷新按钮

**终端输出一直是 `○`（空心圆）**
服务器正常，但 Sketch 里没有选中任何 Frame，回到 Sketch 点选一个即可。

**手机页面显示旧版本**
在 Chrome 地址栏重新输入地址打开，或清除浏览器缓存。
