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

  saveOriginals(col.textMap)
  setTranslating(true)
  NSRunLoop.currentRunLoop().runMode_beforeDate(NSDefaultRunLoopMode, NSDate.dateWithTimeIntervalSinceNow(0.05))

  var result = callDoubao(cfg.apiKey, cfg.model, col.texts, 'Simplified Chinese')
  setTranslating(false)
  if (!result.ok) { sketch.UI.alert('翻译失败', result.error); return }
  var count = applyTranslations(col.textMap, col.texts, result.data)
  showRestorePanelIfNeeded()
  _hasRunTranslation = true
  sketch.UI.message('✅ 已汉化 ' + count + ' 处（共识别 ' + col.texts.length + ' 条唯一文本）')
}

// ─── 多语言适配压测 ────────────────────────────────────────────────────────────

var STRESS_LANGS = [
  { label: '🇨🇳  简体中文',          name: 'Simplified Chinese' },
  { label: '🇩🇪  德语   (+30~40%)',  name: 'German' },
  { label: '🇷🇺  俄语   (+25~35%)',  name: 'Russian' },
  { label: '🇪🇸  西班牙语 (+20~30%)', name: 'Spanish (Latin America)' },
  { label: '🇧🇷  葡萄牙语 (+15~25%)', name: 'Brazilian Portuguese' },
  { label: '🇮🇩  印尼语  (+10~20%)', name: 'Indonesian' },
]

// 自定义下拉列表：{ zh: 显示名, en: 传给 API 的英文名 }
var LANG_LIST = [
  { zh: '德语',       en: 'German' },
  { zh: '俄语',       en: 'Russian' },
  { zh: '西班牙语',   en: 'Spanish (Latin America)' },
  { zh: '葡萄牙语',   en: 'Brazilian Portuguese' },
  { zh: '印尼语',     en: 'Indonesian' },
  { zh: '印地语',     en: 'Hindi' },
  { zh: '泰语',       en: 'Thai' },
  { zh: '越南语',     en: 'Vietnamese' },
  { zh: '马来语',     en: 'Malay' },
  { zh: '日语',       en: 'Japanese' },
  { zh: '韩语',       en: 'Korean' },
  { zh: '法语',       en: 'French' },
  { zh: '意大利语',   en: 'Italian' },
  { zh: '荷兰语',     en: 'Dutch' },
  { zh: '波兰语',     en: 'Polish' },
  { zh: '土耳其语',   en: 'Turkish' },
  { zh: '乌克兰语',   en: 'Ukrainian' },
  { zh: '阿拉伯语',   en: 'Arabic' },
  { zh: '希伯来语',   en: 'Hebrew' },
  { zh: '菲律宾语',   en: 'Filipino' },
  { zh: '缅甸语',     en: 'Burmese' },
  { zh: '高棉语',     en: 'Khmer' },
  { zh: '波斯语',     en: 'Persian' },
  { zh: '乌尔都语',   en: 'Urdu' },
  { zh: '孟加拉语',   en: 'Bengali' },
  { zh: '希腊语',     en: 'Greek' },
  { zh: '瑞典语',     en: 'Swedish' },
  { zh: '挪威语',     en: 'Norwegian' },
  { zh: '丹麦语',     en: 'Danish' },
  { zh: '芬兰语',     en: 'Finnish' },
  { zh: '捷克语',     en: 'Czech' },
  { zh: '罗马尼亚语', en: 'Romanian' },
  { zh: '匈牙利语',   en: 'Hungarian' },
  { zh: '斯瓦希里语', en: 'Swahili' },
]

// 别名映射，处理手动输入的各种写法
var LANG_MAP = {
  '中文': 'Simplified Chinese', '简中': 'Simplified Chinese', '简体中文': 'Simplified Chinese',
  '繁中': 'Traditional Chinese', '繁体中文': 'Traditional Chinese',
  '英语': 'English', '英文': 'English',
  '印度语': 'Hindi', '北印度语': 'Hindi',
  '日文': 'Japanese', '韩文': 'Korean', '朝鲜语': 'Korean',
  '法文': 'French', '巴西葡萄牙语': 'Brazilian Portuguese',
  '印度尼西亚语': 'Indonesian', '他加禄语': 'Tagalog',
  '柬埔寨语': 'Khmer', '法尔西语': 'Persian',
}

function resolveLanguage(input) {
  var s = input.trim()
  for (var i = 0; i < LANG_LIST.length; i++) {
    if (LANG_LIST[i].zh === s) return LANG_LIST[i].en
  }
  return LANG_MAP[s] || s  // 别名查不到就原样透传（英文输入直接用）
}

var onStressTest = function(context) { onShowPanel(context) }

// ─── 还原英文原文 ──────────────────────────────────────────────────────────────

var onRestoreEnglish = function(context) {
  var sketch   = require('sketch')
  var Settings = sketch.Settings
  var sel      = sketch.getSelectedDocument().selectedLayers.layers
  if (sel.length === 0) { sketch.UI.message('请先选择画板或图层'); return }

  var count = 0
  function walk(layer) {
    if (layer.type === 'SymbolInstance') {
      var saved = Settings.layerSettingForKey(layer, 'original_en_overrides') || {}
      var ovs   = layer.overrides || []
      for (var i = 0; i < ovs.length; i++) {
        if (ovs[i].property !== 'stringValue') continue
        var orig = saved[ovs[i].id + '']
        if (orig) { ovs[i].value = orig; count++ }
      }
      return
    }
    if (layer.type === 'Text') {
      var orig = Settings.layerSettingForKey(layer, 'original_en')
      if (orig) { layer.text = orig; count++ }
    }
    if (layer.layers) {
      var ch = layer.layers
      for (var j = 0; j < ch.length; j++) walk(ch[j])
    }
  }
  for (var k = 0; k < sel.length; k++) walk(sel[k])
  sketch.UI.message(count > 0
    ? ('✅ 已还原 ' + count + ' 处英文原文')
    : '未找到已保存的原始英文（请先执行汉化）')
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

// ─── 公共：保存原始英文到图层 userData ────────────────────────────────────────

function saveOriginals(textMap) {
  var Settings = require('sketch').Settings
  for (var text in textMap) {
    var targets = textMap[text]
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i]
      if (t.kind === 'text') {
        Settings.setLayerSettingForKey(t.layer, 'original_en', text)
      } else {
        var saved = Settings.layerSettingForKey(t.layer, 'original_en_overrides') || {}
        saved[t.oid + ''] = text
        Settings.setLayerSettingForKey(t.layer, 'original_en_overrides', saved)
      }
    }
  }
}

// ─── 公共：收集文字（压测用，优先读 userData 原始英文）──────────────────────────

function collectTextsForStress(sel) {
  var Settings = require('sketch').Settings
  var texts   = []
  var textMap = {}

  function add(key, entry) {
    if (!textMap[key]) { textMap[key] = []; texts.push(key) }
    textMap[key].push(entry)
  }

  function walk(layer) {
    if (layer.type === 'SymbolInstance') {
      var overrides = layer.overrides
      if (overrides) {
        var saved = Settings.layerSettingForKey(layer, 'original_en_overrides') || {}
        for (var i = 0; i < overrides.length; i++) {
          var o = overrides[i]
          if (o.property !== 'stringValue') continue
          var key = saved[o.id + ''] || (/[a-zA-Z]/.test(o.value + '') ? (o.value + '') : null)
          if (key) add(key, { kind: 'override', layer: layer, oid: o.id })
        }
      }
      return
    }
    if (layer.type === 'Text' && layer.text) {
      var savedEn = Settings.layerSettingForKey(layer, 'original_en')
      var key = savedEn || (/[a-zA-Z]/.test(layer.text + '') ? (layer.text + '') : null)
      if (key) add(key, { kind: 'text', layer: layer })
    }
    if (layer.layers) {
      var ch = layer.layers
      for (var j = 0; j < ch.length; j++) walk(ch[j])
    }
  }

  for (var k = 0; k < sel.length; k++) walk(sel[k])
  return { texts: texts, textMap: textMap }
}

// ─── 公共：收集文字 ────────────────────────────────────────────────────────────

function collectTexts(sel, anyLang) {
  var texts   = []
  var textMap = {}
  var test    = anyLang ? function(t) { return t && t.trim().length > 0 }
                        : function(t) { return /[a-zA-Z]/.test(t) }

  function walk(layer) {
    if (layer.type === 'SymbolInstance') {
      var overrides = layer.overrides
      if (overrides) {
        for (var i = 0; i < overrides.length; i++) {
          var o = overrides[i]
          if (o.property === 'stringValue' && o.value && test(o.value + '')) {
            var ov = o.value + ''
            if (!textMap[ov]) { textMap[ov] = []; texts.push(ov) }
            textMap[ov].push({ kind: 'override', layer: layer, oid: o.id })
          }
        }
      }
      return
    }
    if (layer.type === 'Text' && layer.text && test(layer.text + '')) {
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

// ─── 溢出检测 ──────────────────────────────────────────────────────────────────

function findOverflow(sel) {
  var overflow = []
  function walk(layer) {
    if (layer.type === 'Text') {
      try { if (layer.sketchObject.hasClippedText()) overflow.push(layer) } catch(e) {}
    }
    if (layer.layers) {
      var ch = layer.layers
      for (var j = 0; j < ch.length; j++) walk(ch[j])
    }
  }
  for (var k = 0; k < sel.length; k++) walk(sel[k])
  return overflow
}

function setTranslating(on) {
  for (var i = 0; i < _panelBtns.length; i++) _panelBtns[i].setEnabled_(!on)
  if (_transBgLayer) {
    var col = on
      ? NSColor.colorWithRed_green_blue_alpha_(0.6, 0.6, 0.6, 1.0).CGColor()
      : NSColor.colorWithRed_green_blue_alpha_(0.102, 0.451, 0.910, 1.0).CGColor()
    _transBgLayer.setBackgroundColor_(col)
  }
  if (_transTextLayer) {
    _transTextLayer.setString_(on ? '翻译中…' : '翻译')
  }
  if (_panelSpinner) {
    _panelSpinner.setHidden_(on ? false : true)
    if (on) _panelSpinner.startAnimation_(null)
    else    _panelSpinner.stopAnimation_(null)
  }
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

// ─── 浮动面板 ──────────────────────────────────────────────────────────────────

var _panel              = null
var _panelCOS           = null
var _panelBtns          = []
var _panelSpinner       = null
var _panelRestoreBtn    = null
var _transBgLayer       = null
var _transTextLayer     = null
var _stressDlg          = null
var _stressCOS          = null
var _hasRunTranslation  = false

// 首次翻译成功后调用：扩展面板高度并显示还原按钮
function showRestorePanelIfNeeded() {
  if (!_panel || _hasRunTranslation || !_panelRestoreBtn) return
  var DELTA = 40  // 32px 按钮 + 8px 间距
  var cv    = _panel.contentView()
  var subs  = cv.subviews()
  for (var i = 0; i < subs.count(); i++) {
    var sv = subs.objectAtIndex_(i)
    if (sv === _panelRestoreBtn) continue
    var sf = sv.frame()
    sv.setFrame_(NSMakeRect(sf.origin.x, sf.origin.y + DELTA, sf.size.width, sf.size.height))
  }
  var wf = _panel.frame()
  _panel.setFrame_display_animate_(
    NSMakeRect(wf.origin.x, wf.origin.y - DELTA, wf.size.width, wf.size.height + DELTA),
    true, false
  )
  _panelRestoreBtn.setHidden_(false)
}

var onShowPanel = function(context) {
  try {
    if (_panel && _panel.isVisible()) {
      _panel.makeKeyAndOrderFront_(null)
      return
    }

    if (_panelCOS) { _panelCOS.setShouldKeepAround_(false); _panelCOS = null }
    var coscript = COScript.currentCOScript()
    coscript.setShouldKeepAround_(true)
    _panelCOS = coscript

    // ── 布局常量（从下往上）──
    var W           = 250
    var COMBO_DELTA = 34   // 26px combobox + 8px gap，展开"更多语言"时增加的高度
    var restoreBtnY = 20
    var transBtnY   = _hasRunTranslation ? (restoreBtnY + 32 + 8) : restoreBtnY
    var matrixY     = transBtnY + 34 + 12
    var matrixH     = (STRESS_LANGS.length + 1) * 26
    var descH       = 32
    var H           = matrixY + matrixH + 8 + descH + 12  // 顶部：desc + padding

    var win = NSPanel.alloc().initWithContentRect_styleMask_backing_defer_(
      NSMakeRect(0, 0, W, H), 1|2, 2, false
    )
    win.setTitle_('Babel')
    win.setFloatingPanel_(true)
    win.setBecomesKeyOnlyIfNeeded_(true)
    win.center()
    win.setReleasedWhenClosed_(false)

    var cv = win.contentView()

    // ── 说明文案 ──
    var descY = matrixY + matrixH + 8
    var desc = NSTextField.alloc().initWithFrame_(NSMakeRect(12, descY, W - 24, descH))
    desc.setStringValue_('选择目标语言，检查布局在文本膨胀下的适配情况')
    desc.setFont_(NSFont.systemFontOfSize_(11))
    desc.setBezeled_(false)
    desc.setDrawsBackground_(false)
    desc.setEditable_(false)
    desc.setSelectable_(false)
    desc.setTextColor_(NSColor.secondaryLabelColor())
    cv.addSubview_(desc)

    // ── 语言单选列表 ──
    var cellProto = NSButtonCell.alloc().init()
    cellProto.setButtonType_(4)
    var totalRows = STRESS_LANGS.length + 1
    var matrix = NSMatrix.alloc().initWithFrame_mode_prototype_numberOfRows_numberOfColumns_(
      NSMakeRect(12, matrixY, W - 24, matrixH), 0, cellProto, totalRows, 1
    )
    matrix.setCellSize_(NSMakeSize(W - 24, 26))
    matrix.setIntercellSpacing_(NSMakeSize(0, 0))
    for (var li = 0; li < STRESS_LANGS.length; li++) {
      matrix.cellAtRow_column_(li, 0).setTitle_(STRESS_LANGS[li].label)
    }
    matrix.cellAtRow_column_(STRESS_LANGS.length, 0).setTitle_('🌐  更多语言…')
    matrix.selectCellAtRow_column_(0, 0)
    cv.addSubview_(matrix)

    // ── 更多语言下拉框（默认隐藏，选"更多语言"时展开）──
    var comboY = transBtnY + 34 + 8  // 紧凑 matrixY 与 transBtn 之间
    var zhNames = []
    for (var ci = 0; ci < LANG_LIST.length; ci++) zhNames.push(LANG_LIST[ci].zh)
    var combo = NSComboBox.alloc().initWithFrame_(NSMakeRect(12, comboY, W - 24, 26))
    combo.addItemsWithObjectValues_(zhNames)
    combo.selectItemAtIndex_(0)
    combo.setEditable_(true)
    combo.setCompletes_(true)
    combo.setHidden_(true)
    cv.addSubview_(combo)

    // matrix 选择变化时展开/收起 combo
    var comboExpanded = false
    matrix.setCOSJSTargetFunction(function() {
      var wantExpand = matrix.selectedRow() === STRESS_LANGS.length
      if (wantExpand === comboExpanded) return
      var mf = matrix.frame()
      var wf = _panel.frame()
      if (wantExpand) {
        matrix.setFrame_(NSMakeRect(mf.origin.x, mf.origin.y + COMBO_DELTA, mf.size.width, mf.size.height))
        desc.setFrame_(NSMakeRect(desc.frame().origin.x, desc.frame().origin.y + COMBO_DELTA, desc.frame().size.width, desc.frame().size.height))
        combo.setHidden_(false)
        _panel.setFrame_display_animate_(NSMakeRect(wf.origin.x, wf.origin.y, wf.size.width, wf.size.height + COMBO_DELTA), true, false)
      } else {
        matrix.setFrame_(NSMakeRect(mf.origin.x, mf.origin.y - COMBO_DELTA, mf.size.width, mf.size.height))
        desc.setFrame_(NSMakeRect(desc.frame().origin.x, desc.frame().origin.y - COMBO_DELTA, desc.frame().size.width, desc.frame().size.height))
        combo.setHidden_(true)
        _panel.setFrame_display_animate_(NSMakeRect(wf.origin.x, wf.origin.y, wf.size.width, wf.size.height - COMBO_DELTA), true, false)
      }
      comboExpanded = wantExpand
    })
    matrix.setAction_('callAction:')

    // ── 翻译按钮（蓝色圆角矩形 + 白字）──
    var transCont = NSView.alloc().initWithFrame_(NSMakeRect(12, transBtnY, W - 24, 32))
    var transBg = NSView.alloc().initWithFrame_(NSMakeRect(0, 0, W - 24, 32))
    transBg.setWantsLayer_(true)
    var transBgL = transBg.layer()
    transBgL.setBackgroundColor_(NSColor.colorWithRed_green_blue_alpha_(0.102, 0.451, 0.910, 1.0).CGColor())
    transBgL.setCornerRadius_(6)
    var transTextL = CATextLayer.layer()
    transTextL.setString_('翻译')
    transTextL.setFont_(NSFont.systemFontOfSize_(13))
    transTextL.setFontSize_(13)
    transTextL.setAlignmentMode_('center')
    transTextL.setForegroundColor_(NSColor.whiteColor().CGColor())
    transTextL.setContentsScale_(NSScreen.mainScreen().backingScaleFactor())
    transTextL.setFrame_(NSMakeRect(0, 8, W - 24, 16))
    transBgL.addSublayer_(transTextL)
    _transBgLayer   = transBgL
    _transTextLayer = transTextL
    transCont.addSubview_(transBg)
    var transBtn = NSButton.alloc().initWithFrame_(NSMakeRect(0, 0, W - 24, 32))
    transBtn.setTitle_('')
    transBtn.setBordered_(false)
    transBtn.setTransparent_(true)
    transBtn.setKeyEquivalent_('\r')
    transBtn.setCOSJSTargetFunction(function() {
      var sketch = require('sketch')
      var sel    = sketch.getSelectedDocument().selectedLayers.layers
      if (sel.length === 0) { sketch.UI.message('请先选择画板或图层'); return }
      var cfg = getOrPromptConfig()
      if (!cfg) return
      var row = matrix.selectedRow()
      var enName, label
      if (row < STRESS_LANGS.length) {
        enName = STRESS_LANGS[row].name
        label  = STRESS_LANGS[row].label
      } else {
        var input = (combo.stringValue() + '').trim()
        if (!input) { sketch.UI.message('请从下拉列表选择语言'); return }
        enName = resolveLanguage(input)
        label  = input
      }
      var col = collectTextsForStress(sel)
      if (col.texts.length === 0) col = collectTexts(sel)
      if (col.texts.length === 0) { sketch.UI.message('未找到英文文字'); return }
      saveOriginals(col.textMap)
      setTranslating(true)
      NSRunLoop.currentRunLoop().runMode_beforeDate(NSDefaultRunLoopMode, NSDate.dateWithTimeIntervalSinceNow(0.05))
      var result = callDoubao(cfg.apiKey, cfg.model, col.texts, enName)
      setTranslating(false)
      if (!result.ok) { sketch.UI.alert('翻译失败', result.error); return }
      var count    = applyTranslations(col.textMap, col.texts, result.data)
      showRestorePanelIfNeeded()
      _hasRunTranslation = true
      var overflow = findOverflow(sel)
      if (overflow.length > 0) {
        try { for (var oi = 0; oi < overflow.length; oi++) overflow[oi].selected = true } catch(e) {}
        sketch.UI.message('✅ ' + label + ' · ' + count + ' 处已翻译 · ⚠️ ' + overflow.length + ' 处溢出已选中')
      } else {
        sketch.UI.message('✅ 已翻译为 ' + label + '，共 ' + count + ' 处')
      }
      var mainWin = NSApplication.sharedApplication().mainWindow()
      if (mainWin) mainWin.makeKeyWindow()
    })
    transBtn.setAction_('callAction:')
    transCont.addSubview_(transBtn)
    cv.addSubview_(transCont)
    _panelBtns = [transBtn]

    // ── 还原英文按钮（灰色圆角矩形，翻译后才显示）──
    var restoreCont = NSView.alloc().initWithFrame_(NSMakeRect(12, restoreBtnY, W - 24, 32))
    restoreCont.setHidden_(!_hasRunTranslation)
    var restoreBg = NSView.alloc().initWithFrame_(NSMakeRect(0, 0, W - 24, 32))
    restoreBg.setWantsLayer_(true)
    var restoreBgL = restoreBg.layer()
    restoreBgL.setBackgroundColor_(NSColor.colorWithRed_green_blue_alpha_(0.92, 0.92, 0.92, 1.0).CGColor())
    restoreBgL.setCornerRadius_(6)
    var restoreTextL = CATextLayer.layer()
    restoreTextL.setString_('还原英文')
    restoreTextL.setFont_(NSFont.systemFontOfSize_(13))
    restoreTextL.setFontSize_(13)
    restoreTextL.setAlignmentMode_('center')
    restoreTextL.setForegroundColor_(NSColor.colorWithRed_green_blue_alpha_(0.2, 0.2, 0.2, 1.0).CGColor())
    restoreTextL.setContentsScale_(NSScreen.mainScreen().backingScaleFactor())
    restoreTextL.setFrame_(NSMakeRect(0, 8, W - 24, 16))
    restoreBgL.addSublayer_(restoreTextL)
    restoreCont.addSubview_(restoreBg)
    var restoreBtn = NSButton.alloc().initWithFrame_(NSMakeRect(0, 0, W - 24, 32))
    restoreBtn.setTitle_('')
    restoreBtn.setBordered_(false)
    restoreBtn.setTransparent_(true)
    restoreBtn.setCOSJSTargetFunction(function() { onRestoreEnglish({}) })
    restoreBtn.setAction_('callAction:')
    restoreCont.addSubview_(restoreBtn)
    cv.addSubview_(restoreCont)
    _panelRestoreBtn = restoreCont
    _panelBtns.push(restoreBtn)

    // ── 进度指示器 ──
    var spinner = NSProgressIndicator.alloc().initWithFrame_(
      NSMakeRect(W / 2 - 8, transBtnY + 9, 16, 16)
    )
    spinner.setStyle_(0)
    spinner.setIndeterminate_(true)
    spinner.setHidden_(true)
    cv.addSubview_(spinner)
    _panelSpinner = spinner

    var closeBtn = win.standardWindowButton_(0)
    if (closeBtn) {
      closeBtn.setCOSJSTargetFunction(function() {
        _panel = null; _panelBtns = []; _panelSpinner = null
        win.orderOut_(null)
      })
      closeBtn.setAction_('callAction:')
    }

    win.makeKeyAndOrderFront_(null)
    _panel = win
  } catch(e) {
    var sketch = require('sketch')
    sketch.UI.alert('面板错误', e.message || String(e))
  }
}
