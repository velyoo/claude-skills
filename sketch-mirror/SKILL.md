---
name: sketch-mirror
description: 安装并启动 Sketch Mirror —— 将 Sketch 设计稿实时镜像到手机预览的工具。当用户说"启动 mirror"、"预览设计"、"sketch mirror"、"镜像到手机"时触发。
---

# Sketch Mirror 安装 & 启动向导

你是 Sketch Mirror 的安装向导。按以下步骤引导用户完成配置，每步执行完等待用户确认再继续。遇到错误时对照「常见问题」排查。

---

## Step 0 — 检测环境

依次检查以下四项，缺少哪项就引导用户安装：

**检查 Node.js：**
让用户在终端运行：
```bash
node -v
```
- 有版本号 → OK
- `command not found` → 引导安装：前往 https://nodejs.org 下载 LTS 版本，双击 .pkg 安装，安装完重开终端再试

**检查 sketch-mirror 文件夹：**
询问用户是否已收到并解压 `sketch-mirror.zip`。
- 已解压 → 询问解压位置（默认假设在下载文件夹 `~/Downloads/sketch-mirror`）
- 未收到 → 告知需要先向管理员索取

**检查 Sketch MCP：**
告知用户：打开 Sketch → 菜单栏「Sketch」→「设置」→ 找到 MCP 开关，确认已打开。

**检查 Tailscale：**
让用户在终端运行：
```bash
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
```
- 看到设备列表 → OK
- 报错或找不到 → 引导安装：Mac App Store 搜索「Tailscale」安装，注册账号登录

---

## Step 1 — 开启 Tailscale HTTPS（首次必做）

告知用户：
1. 用浏览器打开 https://login.tailscale.com/admin/dns
2. 找到页面中的「HTTPS Certificates」
3. 确认开关已打开

> 没有这一步，启动时会报证书错误。

---

## Step 2 — 安装手机端 Tailscale（首次必做）

告知用户：
- iPhone：App Store 搜索「Tailscale」安装，登录**和 Mac 同一个账号**
- Android：Google Play 搜索「Tailscale」安装，登录同一账号

---

## Step 3 — 启动服务器

让用户找到解压后的 sketch-mirror 文件夹，**双击「启动 Mirror.command」**。

终端窗口会自动弹出，首次启动会显示「正在安装依赖…」，等待约 10-30 秒。

启动成功后终端会显示：
```
Sketch Mirror is running!
Tailscale: https://xxx.tail424fbc.ts.net:3000
手机扫描下方二维码连接：
[二维码]
```

---

## Step 4 — 手机连接

告知用户：
1. 打开手机摄像头或任意扫码 App
2. 扫描终端里的二维码
3. 手机浏览器会打开预览页面

---

## Step 5 — 手机打开方式

**Android（推荐直接用 Chrome，不需要安装）：**
1. 用 Chrome 扫码打开页面
2. 点击屏幕一次，自动进入真全屏（系统栏完全消失）
3. 无需安装到桌面，体验已经是最佳

> 如果想安装到桌面：点右上角 ⋮ 菜单 → 「添加到主屏幕」，但注意桌面 App 模式下全屏效果反而不如直接用 Chrome

**iPhone（Safari）：**
1. 用 Safari 扫码打开页面（不能用 Chrome for iOS）
2. 点底部**分享按钮** → 「添加到主屏幕」→「添加」
3. 从桌面图标打开，状态栏会半透明叠在内容上

---

## Step 6 — 开始预览

告知用户：
1. 回到 Sketch，点击选中一个 **Frame**（注意：要选整个 Frame，不是里面的子图层）
2. 手机屏幕会在约 2 秒内自动显示该 Frame 的预览
3. 左右滑动手机屏幕可切换到上一个/下一个 Frame

**手势操作说明：**
- 左右滑动 → 切换 Frame
- 单击屏幕 → 显示/隐藏操作按钮
- 双击屏幕 → 切换 1:1 / 填充显示模式
- 双指捏合 → 自由缩放
- 上下滑动 → 浏览超长设计稿

---

## 常见问题

**启动时报 `EADDRINUSE: address already in use 3000`**
上一次的服务器没关。让用户在终端运行：
```bash
pkill -f "node server.js"
```
然后重新双击启动脚本。

**启动时报 `Could not connect to Sketch MCP` 或 `SSE connect timeout`**
- 确认 Sketch 已打开
- 确认 Sketch 设置里 MCP 开关是打开的
- 如果开关已开但还是报错：**关掉 MCP 开关再重新打开**，然后重新双击启动脚本
- 仍然不行：完全退出 Sketch 重新打开

**启动时报证书错误 / `tailscale cert` 失败**
- 确认 Tailscale 已登录并连接（菜单栏有 Tailscale 图标）
- 确认已在 https://login.tailscale.com/admin/dns 开启「HTTPS Certificates」

**手机扫码后打不开 / 一直转圈**
- 确认手机也安装了 Tailscale 并登录同一账号
- 确认手机 Tailscale 处于连接状态（图标不是灰色）

**预览画面一直空白，终端有 `●` 出现**
- 确认在 Sketch 里选中的是整个 **Frame（Artboard）**，不是 Frame 内部的子图层
- 尝试点击手机页面的刷新按钮（右下角）

**导出报错 `EPERM` 或 `EISDIR`**
某个图层名称和文件夹冲突。重启服务器（终端按 `Ctrl+C`，再双击启动脚本）。

**终端输出一直是 `○`（空心圆）**
服务器正常运行，但 Sketch 里没有选中任何 Frame。回到 Sketch 点击选中一个 Frame 即可。

**手机上更新后页面没有变化 / 显示旧版本**
普通刷新页面即可（地址栏重新回车）。如果还是旧版本，在 Chrome 地址栏输入地址重新打开。

**iOS 顶部显示状态栏（时间/电量）**
iOS 系统限制，PWA 无法隐藏状态栏，这是已知问题。状态栏是半透明叠在内容上，不影响预览区域。要彻底隐藏需要打包原生 App。Android 不受此限制。

**安装为桌面 App 后图标是黑色方块**
可以替换 `public/icon-192.png` 和 `public/icon-512.png` 为自定义图标（PNG 格式，分别 192×192 和 512×512 像素），然后卸载重装 App 即可。
