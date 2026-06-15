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

### sketch-mirror — 手机实时预览

将 Sketch 设计稿实时镜像到手机，无需导出即可在真机上预览。

**直接告诉 Claude 就能触发，例如：**
- "启动 Mirror"
- "我想在手机上预览设计稿"

**安装前需要准备：**
- Mac 安装 [Node.js](https://nodejs.org)（LTS 版本）
- Mac 和手机都安装 [Tailscale](https://tailscale.com) 并登录同一账号
- 向管理员索取 `sketch-mirror.zip` 服务器包
- Sketch 设置里开启 MCP 开关

Claude 会一步步引导完成配置，按提示操作即可。

---

> 需要 [Claude Code](https://claude.ai/claude-code) + [Sketch MCP 插件](https://github.com/sketch-hq/sketch-mcp)
