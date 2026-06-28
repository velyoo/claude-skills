// Translate UI v1.1 — 豆包 API 英→中一键汉化 + 多语言压测
// 汉化: Ctrl+Shift+T  |  多语言压测: Ctrl+Shift+L

var DEFAULTS_KEY  = 'TranslateUI_ApiKey'
var DEFAULTS_EP   = 'TranslateUI_Endpoint'
var DEFAULT_MODEL = 'doubao-pro-32k'
var DOUBAO_URL    = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

// ─── 汉化选中画板 ──────────────────────────────────────────────────────────────

var onRun = function(context) {
  var sketch = require('sketch')
  var sel    = sketch.getSelectedDocument().selectedLayers.layers
  if (sel.length === 0) { sketch.UI.message('请先选择画板或图层'); return }

  var cfg = getOrPromptConfig()
  if (!cfg) return

  var col = collectTexts(sel)
  if (col.texts.length === 0) { sketch.UI.message('未找到英文文字'); return }

  sketch.UI.message('翻译中…')
  NSRunLoop.currentRunLoop().runMode_beforeDate(NSDefaultRunLoopMode, NSDate.dateWithTimeIntervalSinceNow(0.1))

  var result = callDoubao(cfg.apiKey, cfg.model, col.texts, 'Simplified Chinese')
  if (!result.ok) { sketch.UI.alert('翻译失败', result.error); return }

  var count = applyTranslations(col.textMap, col.texts, result.data)
  sketch.UI.message('✅ 已汉化 ' + count + ' 处（共识别 ' + col.texts.length + ' 条唯一文本）')
}

// ─── 多语言适配压测 ────────────────────────────────────────────────────────────

var STRESS_LANGS = [
  { label: '🇩🇪 德语  German        (+30~40%)', name: 'German' },
  { label: '🇷🇺 俄语  Russian       (+25~35%)', name: 'Russian' },
  { label: '🇪🇸 西班牙语  Spanish   (+20~30%)', name: 'Spanish (Latin America)' },
  { label: '🇧🇷 葡萄牙语  Portuguese(+15~25%)', name: 'Brazilian Portuguese' },
  { label: '🇮🇩 印尼语  Indonesian  (+10~20%)', name: 'Indonesian' },
]

var onStressTest = function(context) {
  var sketch = require('sketch')
  var sel    = sketch.getSelectedDocument().selectedLayers.layers
  if (sel.length === 0) { sketch.UI.message('请先选择画板或图层'); return }

  var cfg = getOrPromptConfig()
  if (!cfg) return

  var alert = NSAlert.alloc().init()
  alert.setMessageText('多语言适配压测')
  alert.setInformativeText('将英文文本翻译为目标语言，检查布局在文本膨胀下的适配情况')
  alert.addButtonWithTitle('翻译')
  alert.addButtonWithTitle('取消')

  var popup = NSPopUpButton.alloc().initWithFrame_pullsDown(NSMakeRect(0, 0, 340, 26), false)
  for (var li = 0; li < STRESS_LANGS.length; li++) {
    popup.addItemWithTitle(STRESS_LANGS[li].label)
  }
  alert.setAccessoryView(popup)
  if (alert.runModal() !== NSAlertFirstButtonReturn) return

  var lang = STRESS_LANGS[popup.indexOfSelectedItem()]
  var col  = collectTexts(sel)
  if (col.texts.length === 0) { sketch.UI.message('未找到英文文字'); return }

  sketch.UI.message('翻译为 ' + lang.name + ' 中…')
  NSRunLoop.currentRunLoop().runMode_beforeDate(NSDefaultRunLoopMode, NSDate.dateWithTimeIntervalSinceNow(0.1))

  var result = callDoubao(cfg.apiKey, cfg.model, col.texts, lang.name)
  if (!result.ok) { sketch.UI.alert('翻译失败', result.error); return }

  var count = applyTranslations(col.textMap, col.texts, result.data)
  sketch.UI.message('✅ 已翻译为 ' + lang.name + '，共 ' + count + ' 处 — 注意检查溢出图层')
}

// ─── 重置配置 ──────────────────────────────────────────────────────────────────

var onResetConfig = function(context) {
  var defaults = NSUserDefaults.standardUserDefaults()
  defaults.removeObjectForKey(DEFAULTS_KEY)
  defaults.removeObjectForKey(DEFAULTS_EP)
  defaults.synchronize()
  var sketch = require('sketch')
  sketch.UI.message('配置已清除，下次运行时重新填写')
}

// ─── 配置管理 ──────────────────────────────────────────────────────────────────

function getOrPromptConfig() {
  var defaults = NSUserDefaults.standardUserDefaults()
  var apiKey   = (defaults.stringForKey(DEFAULTS_KEY) || '') + ''
  var model    = (defaults.stringForKey(DEFAULTS_EP)  || '') + ''
  if (!model || model.length < 4) model = DEFAULT_MODEL

  if (apiKey.length < 8) {
    var cfg = showConfigDialog(apiKey, model)
    if (!cfg) return null
    defaults.setObject_forKey(cfg.apiKey, DEFAULTS_KEY)
    defaults.setObject_forKey(cfg.model,  DEFAULTS_EP)
    defaults.synchronize()
    return cfg
  }
  return { apiKey: apiKey, model: model }
}

function showConfigDialog(curKey, curModel) {
  var alert = NSAlert.alloc().init()
  alert.setMessageText('配置豆包 API')
  alert.setInformativeText('在火山引擎控制台 > 方舟 > API Key 处获取')
  alert.addButtonWithTitle('确认')
  alert.addButtonWithTitle('取消')

  var view     = NSView.alloc().initWithFrame(NSMakeRect(0, 0, 340, 60))
  var keyFld   = NSTextField.alloc().initWithFrame(NSMakeRect(0, 34, 340, 24))
  keyFld.setPlaceholderString('API Key')
  if (curKey) keyFld.setStringValue(curKey)

  var modelFld = NSTextField.alloc().initWithFrame(NSMakeRect(0, 4, 340, 24))
  modelFld.setPlaceholderString('模型 ID 或 ep-xxx（默认 doubao-pro-32k）')
  if (curModel && curModel !== DEFAULT_MODEL) modelFld.setStringValue(curModel)

  view.addSubview(keyFld)
  view.addSubview(modelFld)
  alert.setAccessoryView(view)
  alert.window().setInitialFirstResponder(keyFld)

  if (alert.runModal() !== NSAlertFirstButtonReturn) return null
  var m = (modelFld.stringValue() || '') + ''
  return {
    apiKey: (keyFld.stringValue() || '') + '',
    model:  m.length > 3 ? m : DEFAULT_MODEL
  }
}

// ─── 公共：收集文字 ────────────────────────────────────────────────────────────

function collectTexts(sel) {
  var texts   = []
  var textMap = {}

  function walk(layer) {
    if (layer.type === 'SymbolInstance') {
      var overrides = layer.overrides
      if (overrides) {
        for (var i = 0; i < overrides.length; i++) {
          var o = overrides[i]
          if (o.property === 'stringValue' && o.value && /[a-zA-Z]/.test(o.value)) {
            var ov = o.value + ''
            if (!textMap[ov]) { textMap[ov] = []; texts.push(ov) }
            textMap[ov].push({ kind: 'override', layer: layer, oid: o.id })
          }
        }
      }
      return
    }
    if (layer.type === 'Text' && layer.text && /[a-zA-Z]/.test(layer.text)) {
      var t = layer.text + ''
      if (!textMap[t]) { textMap[t] = []; texts.push(t) }
      textMap[t].push({ kind: 'text', layer: layer })
    }
    if (layer.layers) {
      var ch = layer.layers
      for (var j = 0; j < ch.length; j++) walk(ch[j])
    }
  }

  for (var k = 0; k < sel.length; k++) walk(sel[k])
  return { texts: texts, textMap: textMap }
}

// ─── 公共：应用翻译 ────────────────────────────────────────────────────────────

function applyTranslations(textMap, texts, tr) {
  var count = 0
  for (var ti = 0; ti < texts.length; ti++) {
    var orig       = texts[ti]
    var translated = tr[orig]
    if (!translated) continue
    var targets = textMap[orig]
    for (var mi = 0; mi < targets.length; mi++) {
      var target = targets[mi]
      if (target.kind === 'text') {
        target.layer.text = translated
        count++
      } else {
        var ovs = target.layer.overrides
        for (var oi = 0; oi < ovs.length; oi++) {
          if (ovs[oi].id === target.oid) {
            var nv = translated
            if (nv) { ovs[oi].value = nv; count++ }
            break
          }
        }
      }
    }
  }
  return count
}

// ─── 图层自动命名（规则推断，无需 API）────────────────────────────────────────────

var onRenameLayer = function(context) {
  var sketch = require('sketch')
  var sel = sketch.getSelectedDocument().selectedLayers.layers
  if (sel.length === 0) { sketch.UI.message('请先选择要命名的图层'); return }

  var nameCount = {}
  function getUniqName(base) {
    nameCount[base] = (nameCount[base] || 0) + 1
    return nameCount[base] === 1 ? base : base + '-' + (nameCount[base] - 1)
  }

  function getAllTexts(layer, depth, arr) {
    if (layer.hidden || arr.length >= 6) return arr
    if (layer.type === 'Text' && layer.text) {
      var t = (layer.text + '').trim()
      if (t.length > 0) arr.push(t)
    }
    if (layer.type !== 'SymbolInstance' && depth < 4) {
      var ch = layer.layers || []
      // 从末尾向前遍历：Sketch 数组顺序是渲染顺序（底层在前），逆序可先取到视觉上靠前的图层
      for (var i = ch.length - 1; i >= 0; i--) getAllTexts(ch[i], depth + 1, arr)
    }
    return arr
  }

  function hasDescendantNamed(layer, name) {
    if (layer.type === 'SymbolInstance') return false
    var ch = layer.layers || []
    for (var i = 0; i < ch.length; i++) {
      if (ch[i].name === name) return true
      if (hasDescendantNamed(ch[i], name)) return true
    }
    return false
  }

  function toKebab(t) {
    return (t + '').replace(/[^\w一-龥]/g, '-').toLowerCase().replace(/^-+|-+$/g, '')
  }

  function inferName(layer) {
    if (layer.type === 'Text') return null
    var f = layer.frame
    var w = Math.round(f.width), h = Math.round(f.height)
    var texts = getAllTexts(layer, 0, [])
    var ch = layer.type === 'SymbolInstance' ? [] : (layer.layers || [])
    var visibleCh = []
    for (var vi = 0; vi < ch.length; vi++) { if (!ch[vi].hidden) visibleCh.push(ch[vi]) }
    var hasImage = false
    for (var ii = 0; ii < visibleCh.length; ii++) {
      if (visibleCh[ii].type === 'Image') { hasImage = true; break }
      var sub = visibleCh[ii].layers || []
      for (var si = 0; si < sub.length; si++) { if (sub[si].type === 'Image') { hasImage = true; break } }
      if (hasImage) break
    }

    // 日期分割线
    for (var di = 0; di < texts.length; di++) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(texts[di])) return 'date-divider'
    }
    // 底部导航 Tab（宽 ≥200，h ≤72，≥3 子项，每项有图标+文本，不依赖关键词）
    if (w >= 200 && h <= 72 && visibleCh.length >= 3) {
      var tabLike = true
      for (var ti = 0; ti < visibleCh.length; ti++) {
        var tSub = visibleCh[ti].type === 'SymbolInstance' ? [] : (visibleCh[ti].layers || []).filter(function(l) { return !l.hidden })
        var tabHasText = false, tabHasIcon = false
        for (var ts = 0; ts < tSub.length; ts++) {
          if (tSub[ts].type === 'Text') tabHasText = true
          if (tSub[ts].type === 'SymbolInstance') tabHasIcon = true
          if (!tabHasIcon && tSub[ts].type !== 'Text') {
            var tsub2 = tSub[ts].layers || []
            for (var ts2 = 0; ts2 < tsub2.length; ts2++) {
              if (tsub2[ts2].type === 'SymbolInstance') { tabHasIcon = true; break }
            }
          }
        }
        if (!tabHasText || !tabHasIcon) { tabLike = false; break }
      }
      if (tabLike) return 'nav-tabs'
    }
    // 图标按钮（小方块 ≤32px）
    if (w <= 32 && h <= 32 && visibleCh.length <= 3) return 'icon-btn'
    // 图标背景容器（40-64px 正方形，单个图标 Symbol，无文本）
    if (w >= 40 && w <= 64 && Math.abs(w - h) <= 8 && visibleCh.length === 1 && visibleCh[0].type === 'SymbolInstance' && texts.length === 0) return 'icon-bg'
    // 视频列表项
    var hasRatio = false
    for (var ri = 0; ri < texts.length; ri++) { if (/\d+:\d+/.test(texts[ri])) { hasRatio = true; break } }
    if (w >= 280 && h >= 50 && h <= 130 && (hasImage || hasRatio)) return 'video-item'
    // 图标格（所有直接子行 h 80-130 且每行有 ≥2 子项，代表 icon+label 行结构）
    if (w >= 200 && h > 80 && visibleCh.length >= 2) {
      var allIconRows = true
      for (var ig = 0; ig < visibleCh.length; ig++) {
        var igH = Math.round(visibleCh[ig].frame.height)
        var igSub = visibleCh[ig].type === 'SymbolInstance' ? [] : (visibleCh[ig].layers || [])
        if (igH < 80 || igH > 130 || igSub.length < 2) { allIconRows = false; break }
      }
      if (allIconRows) return 'icon-grid'
    }
    // 设置区（薄 header h 20-48 + 正文子层内含 ≥3 子行，不依赖文本）
    if (w >= 200 && h > 80 && visibleCh.length >= 2) {
      var hasThinHdr = false, hasRichBody = false
      for (var ss = 0; ss < visibleCh.length; ss++) {
        var ssh = Math.round(visibleCh[ss].frame.height)
        if (ssh >= 20 && ssh <= 48) { hasThinHdr = true; continue }
        if (ssh > 48) {
          var bodySub = visibleCh[ss].type === 'SymbolInstance' ? [] : (visibleCh[ss].layers || []).filter(function(l) { return !l.hidden })
          for (var bs = 0; bs < bodySub.length; bs++) {
            var innerSub = bodySub[bs].type === 'SymbolInstance' ? [] : (bodySub[bs].layers || []).filter(function(l) { return !l.hidden })
            if (innerSub.length >= 3) { hasRichBody = true; break }
          }
        }
      }
      if (hasThinHdr && hasRichBody) return 'settings-section'
    }
    // 列表容器（3 个以上相似高度的子行 → 命名为 list-container，不用子层文本）
    if (w >= 200 && h > 80) {
      var rowLikeCount = 0
      for (var rk = 0; rk < visibleCh.length; rk++) {
        var cf = visibleCh[rk].frame
        var ch2 = Math.round(cf.height)
        if (ch2 >= 36 && ch2 <= 80) rowLikeCount++
      }
      if (rowLikeCount >= 3) return 'list-container'
    }
    // 设置行 / 列表行（宽，带文字标签）
    if (w >= 200 && h >= 36 && h <= 80 && texts.length >= 1 && texts[0].length <= 20) {
      return 'row-' + toKebab(texts[0])
    }
    // 宽行（无短文本）
    if (w >= 280 && h <= 80 && texts.length >= 2) return 'list-row'
    if (w >= 280 && h <= 80) return 'row'
    // 小组件（宽 ≤ 130，有短标签，且文本唯一）
    if (w <= 130 && h <= 50 && texts.length === 1 && texts[0].length <= 15) return toKebab(texts[0])
    return null
  }

  var GENERIC_RE = /^(Stack|Group|Rectangle|Oval|Path|Shape|Combined Shape|Line|Slice|Frame|Image|Layer|Bitmap|Text|Vector|Mask|编组|路径|矩形|椭圆形|蒙版|层叠|图层|位图|切片|形状|线段)(\s*\d+)?$/i
  var renamed = 0

  function renameTraverse(layer) {
    if (layer.hidden) return
    if (GENERIC_RE.test(layer.name) && layer.type !== 'ShapePath') {
      var newBase = inferName(layer)
      if (newBase) {
        var safeName = hasDescendantNamed(layer, newBase) ? newBase + '-wrap' : newBase
        var newName = getUniqName(safeName)
        if (newName !== layer.name) { layer.name = newName; renamed++ }
      }
    }
    if (layer.type === 'SymbolInstance') return
    var ch = layer.layers || []
    for (var i = 0; i < ch.length; i++) renameTraverse(ch[i])
  }

  for (var i = 0; i < sel.length; i++) renameTraverse(sel[i])
  sketch.UI.message(renamed > 0 ? ('已重命名 ' + renamed + ' 个图层') : '没有找到需要重命名的通用图层名')
}

// ─── 豆包 API 调用 ─────────────────────────────────────────────────────────────

function callDoubao(apiKey, model, texts, langName) {
  var userMsg = 'Translate these English UI strings to ' + langName + '.\n'
              + 'Return ONLY a valid JSON object mapping each original string to its translation.\n'
              + 'Keep UI labels concise. No markdown, no explanation.\n\n'
              + JSON.stringify(texts)

  var body = JSON.stringify({
    model: model,
    messages: [
      { role: 'system', content: 'You are a professional UI localization assistant. Output ONLY raw JSON.' },
      { role: 'user',   content: userMsg }
    ],
    temperature: 0.1
  })

  var request = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(DOUBAO_URL))
  request.setHTTPMethod('POST')
  request.setValue_forHTTPHeaderField('application/json', 'Content-Type')
  request.setValue_forHTTPHeaderField('Bearer ' + apiKey, 'Authorization')
  request.setTimeoutInterval(30)
  request.setHTTPBody(NSString.stringWithString(body).dataUsingEncoding(NSUTF8StringEncoding))

  var respPtr = MOPointer.alloc().init()
  var errPtr  = MOPointer.alloc().init()
  var data    = NSURLConnection.sendSynchronousRequest_returningResponse_error(request, respPtr, errPtr)

  if (!data) {
    var errMsg = errPtr.value() ? (errPtr.value().localizedDescription() + '') : '无法连接到服务器'
    return { ok: false, error: errMsg }
  }

  var raw = (NSString.alloc().initWithData_encoding(data, NSUTF8StringEncoding) || '') + ''
  var parsed
  try { parsed = JSON.parse(raw) } catch(e) {
    return { ok: false, error: '响应解析失败：' + raw.slice(0, 200) }
  }

  if (parsed.error) {
    return { ok: false, error: 'API 错误：' + (parsed.error.message || JSON.stringify(parsed.error)) }
  }
  if (!parsed.choices || !parsed.choices[0]) {
    return { ok: false, error: '响应格式异常：' + raw.slice(0, 300) }
  }

  var content = (parsed.choices[0].message.content || '') + ''
  content = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()

  try {
    return { ok: true, data: JSON.parse(content) }
  } catch(e) {
    return { ok: false, error: '翻译结果解析失败：' + content.slice(0, 200) }
  }
}

