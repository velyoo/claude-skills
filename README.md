# claude-skills

设计师的 Claude Code 技能包，基于 Sketch MCP 的设计工作流提效工具。

## 安装方法

1. 下载需要的 SKILL.md 文件
2. 拖进 VSCode，让 Claude 把这个文件安装成 skill

更新时重新下载最新版本，重复以上步骤即可。

## 技能列表

### icon-scan — 图标扫描 & 整理

扫描 Sketch 文件中所有页面的图标，自动去重、过滤噪音，在「图标」页生成灰底网格展示。

**直接告诉 Claude 就能触发，例如：**
- "帮我整理图标"
- "扫描一下文件里的图标"
- "生成图标展示"

**主要功能**
- 自动识别 SymbolInstance 和纯矢量 Group 两种图标形态
- 按 symbolId / 规范化名称去重；Group 保留最小实例（最接近实际 UI 尺寸）
- 密度过滤：排除名字含 `-24px` 但实际以 72px 放置的高密度噪音
- 按尺寸分桶（步长 4px），≥44px 的归入插画组混排
- 插画组固定 6 列，避免每行只有 1-2 个图标

---

### design-audit — UI 设计走查

自动检查设计稿的规范问题。

**直接告诉 Claude 就能触发，例如：**
- "帮我走查"
- "检查一下这个页面的布局"
- "走查选中的 Frame"

**检查范围：** 像素对齐 · 4pt 网格 · 行高规范 · 按钮尺寸 · 硬编码颜色 · 图层命名 · MD3 规格对照

---

### sketch-mirror — 设计稿手机实时预览工具

在 Sketch 里选中一个 Frame，手机上立刻看到预览，支持 Android 和 iPhone。

**直接告诉 Claude 就能触发，例如：**
- "启动 Mirror"
- "我想在手机上预览设计稿"

**主要功能**
- 选中 Frame 后约 2 秒自动更新
- 适应屏幕宽度 / 1:1 实际像素切换
- Android 自动全屏，无系统栏干扰

**安装步骤**
1. 安装 Node.js（下载 LTS 版本）：https://nodejs.org
2. Sketch 设置里开启 MCP 服务
3. Mac 安装 Tailscale：https://pkgs.tailscale.com/stable/#macos （或官网下载）
4. 手机安装 Tailscale：App Store (美区) / Google Play 搜索「Tailscale」，登同一账号
5. 登录 https://login.tailscale.com/admin/dns ，开启「HTTPS Certificates」（首次必做，只需一次）
6. 下载工具包并解压，双击「启动 Mirror.command」，扫描终端里的二维码连接

**下载**：https://github.com/velyoo/sketch-mirror/releases/latest

**平台支持**
- Android：Chrome 扫码直接用，点击屏幕自动全屏
- iPhone：Safari 扫码，可添加到主屏幕作为 PWA 使用

---

### sketch-translate-ui — Sketch 一键翻译插件

将设计稿英文文本一键翻译为中文，或切换为其他语言检查多语言布局适配性。基于豆包 API，无需代理。

**安装**

**[⬇️ 下载 TranslateUI.sketchplugin.zip](https://github.com/velyoo/claude-skills/releases/latest)**

1. 下载上方 zip，解压后双击 `TranslateUI.sketchplugin` 安装

**使用**
- 选中画板，菜单 **Plugins → Translate UI → 汉化选中画板**（`Ctrl+Shift+T`）
- 首次运行填入豆包 API Key 和 Endpoint ID，之后自动记住
- 多语言压测：`Ctrl+Shift+L`，选目标语言（德/俄/西/葡/印尼），检查文本膨胀后的布局溢出

**获取 API Key（首次需要完成以下前置步骤）**

1. 注册 [火山引擎](https://console.volcengine.com) 并完成**实名认证**（个人或企业均可）
2. 在控制台搜索「方舟」，进入**火山方舟大模型服务平台**，手动**开通服务**（首次需申请，审核较快）
3. 进入**费用中心**充值账户余额，余额为 0 时 API 调用会直接报错（按 Token 计费，日常用量极少，充 ¥10 够用很久）
4. 进入 **方舟 → 在线推理** → 新建接入点，选择 Doubao 模型，创建后获得 `ep-xxx` 格式的接入点 ID
5. 进入 **方舟 → API Key 管理** → 新建 Key，复制备用

> 如果接入点创建时提示没有模型权限，需要在**模型广场**里找到对应模型单独申请开通。

---

> 需要 [Claude Code](https://claude.ai/claude-code) + [Sketch MCP 插件](https://github.com/sketch-hq/sketch-mcp)
