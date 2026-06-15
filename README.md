# claude-skills

InShot 设计组的 Claude Code 技能包，基于 Sketch MCP 的设计工作流提效工具。

## 安装方法

```bash
git clone https://github.com/velyoo/claude-skills.git ~/claude-skills
mkdir -p ~/.claude/skills/design-audit ~/.claude/skills/sketch-mirror
ln -sf ~/claude-skills/design-audit/SKILL.md ~/.claude/skills/design-audit/SKILL.md
ln -sf ~/claude-skills/sketch-mirror/SKILL.md ~/.claude/skills/sketch-mirror/SKILL.md
```

之后更新：

```bash
git -C ~/claude-skills pull
```

## 技能列表

### design-audit — UI 设计走查

自动检查设计稿的规范问题，支持 Sketch 和 Figma。

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

> 需要 [Claude Code](https://claude.ai/claude-code) + [Sketch MCP 插件](https://github.com/sketch-hq/sketch-mcp)
