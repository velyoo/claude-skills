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
  _hasRunTranslation = true
  sketch.UI.message('✅ 已汉化 ' + count + ' 处（共识别 ' + col.texts.length + ' 条唯一文本）')
}

// ─── 多语言适配压测 ────────────────────────────────────────────────────────────

var STRESS_LANGS = [
  { label: '🇩🇪 德语  German        (+30~40%)', name: 'German' },
  { label: '🇷🇺 俄语  Russian       (+25~35%)', name: 'Russian' },
  { label: '🇪🇸 西班牙语  Spanish   (+20~30%)', name: 'Spanish (Latin America)' },
  { label: '🇧🇷 葡萄牙语  Portuguese(+15~25%)', name: 'Brazilian Portuguese' },
  { label: '🇮🇩 印尼语  Indonesian  (+10~20%)', name: 'Indonesian' },
  { label: '✏️  自定义语言…',                   name: null },
]

var LANG_MAP = {
  '中文': 'Simplified Chinese', '简中': 'Simplified Chinese', '简体中文': 'Simplified Chinese',
  '繁中': 'Traditional Chinese', '繁体中文': 'Traditional Chinese',
  '英语': 'English', '英文': 'English',
  '德语': 'German',
  '俄语': 'Russian',
  '西班牙语': 'Spanish (Latin America)',
  '葡萄牙语': 'Brazilian Portuguese', '巴西葡萄牙语': 'Brazilian Portuguese',
  '印尼语': 'Indonesian', '印度尼西亚语': 'Indonesian',
  '印地语': 'Hindi', '北印度语': 'Hindi', '印度语': 'Hindi',
  '泰语': 'Thai',
  '日语': 'Japanese', '日文': 'Japanese',
  '韩语': 'Korean', '朝鲜语': 'Korean', '韩文': 'Korean',
  '法语': 'French', '法文': 'French',
  '意大利语': 'Italian',
  '荷兰语': 'Dutch',
  '波兰语': 'Polish',
  '土耳其语': 'Turkish',
  '越南语': 'Vietnamese',
  '马来语': 'Malay',
  '菲律宾语': 'Filipino', '他加禄语': 'Tagalog',
  '阿拉伯语': 'Arabic',
  '希伯来语': 'Hebrew',
  '希腊语': 'Greek',
  '乌克兰语': 'Ukrainian',
  '瑞典语': 'Swedish',
  '挪威语': 'Norwegian',
  '丹麦语': 'Danish',
  '芬兰语': 'Finnish',
  '捷克语': 'Czech',
  '罗马尼亚语': 'Romanian',
  '匈牙利语': 'Hungarian',
  '斯瓦希里语': 'Swahili',
  '缅甸语': 'Burmese',
  '高棉语': 'Khmer', '柬埔寨语': 'Khmer',
  '波斯语': 'Persian', '法尔西语': 'Persian',
  '乌尔都语': 'Urdu',
  '孟加拉语': 'Bengali',
}

function resolveLanguage(input) {
  var s = input.trim()
  return LANG_MAP[s] || s  // 查不到就原样透传（英文输入直接用）
}

var onStressTest = function(context) {
  var sketch = require('sketch')
  var sel    = sketch.getSelectedDocument().selectedLayers.layers
  if (sel.length === 0) { sketch.UI.message('请先选择画板或图层'); return }

  var cfg = getOrPromptConfig()
  if (!cfg) return

  if (!_panel || !_panel.isVisible()) {
    var coscript = COScript.currentCOScript()
    coscript.setShouldKeepAround_(true)
    _stressCOS = coscript
  }

  var W = 340, H = 300
  var dlg = NSPanel.alloc().initWithContentRect_styleMask_backing_defer_(
    NSMakeRect(0, 0, W, H), 3, 2, false
  )
  dlg.setTitle_('切换语言预览')
  if (_panel && _panel.isVisible()) {
    var pf = _panel.frame()
    var dlgY = pf.origin.y + pf.size.height - H
    var screenFrame = NSScreen.mainScreen().visibleFrame()
    if (dlgY < screenFrame.origin.y) dlgY = screenFrame.origin.y
    dlg.setFrameOrigin_(NSMakePoint(pf.origin.x + pf.size.width + 8, dlgY))
  } else {
    dlg.center()
  }
  dlg.setReleasedWhenClosed_(false)
  dlg.setFloatingPanel_(true)

  var cv = dlg.contentView()

  var desc = NSTextField.alloc().initWithFrame_(NSMakeRect(16, H - 48, W - 32, 28))
  desc.setStringValue_('选择目标语言，检查布局在文本膨胀下的适配情况')
  desc.setBezeled_(false)
  desc.setDrawsBackground_(false)
  desc.setEditable_(false)
  desc.setSelectable_(false)
  cv.addSubview_(desc)

  var cellProto = NSButtonCell.alloc().init()
  cellProto.setButtonType_(4) // NSButtonTypeRadio
  var matrixH = STRESS_LANGS.length * 26  // 6 * 26 = 156
  var matrix = NSMatrix.alloc().initWithFrame_mode_prototype_numberOfRows_numberOfColumns_(
    NSMakeRect(16, H - 60 - matrixH, W - 32, matrixH),
    0, // NSRadioModeMatrix
    cellProto,
    STRESS_LANGS.length,
    1
  )
  matrix.setCellSize_(NSMakeSize(W - 32, 26))
  matrix.setIntercellSpacing_(NSMakeSize(0, 0))
  for (var li = 0; li < STRESS_LANGS.length; li++) {
    matrix.cellAtRow_column_(li, 0).setTitle_(STRESS_LANGS[li].label)
  }
  matrix.selectCellAtRow_column_(0, 0)
  cv.addSubview_(matrix)

  var customFld = NSTextField.alloc().initWithFrame_(NSMakeRect(16, 52, W - 32, 24))
  customFld.setPlaceholderString_('自定义语言（英文名），如 Thai、Arabic、Japanese…')
  cv.addSubview_(customFld)

  var cancelBtn = NSButton.alloc().initWithFrame_(NSMakeRect(W - 212, 16, 80, 28))
  cancelBtn.setTitle_('取消')
  cancelBtn.setBezelStyle_(1)
  cancelBtn.setCOSJSTargetFunction(function() { dlg.orderOut_(null) })
  cancelBtn.setAction_('callAction:')
  cv.addSubview_(cancelBtn)

  var okBtn = NSButton.alloc().initWithFrame_(NSMakeRect(W - 124, 16, 108, 28))
  okBtn.setTitle_('翻译')
  okBtn.setBezelStyle_(1)
  okBtn.setCOSJSTargetFunction(function() {
    dlg.orderOut_(null)
    var row  = matrix.selectedRow()
    var lang
    if (row === STRESS_LANGS.length - 1) {
      var customName = (customFld.stringValue() + '').trim()
      if (!customName) { sketch.UI.message('请在输入框填写目标语言名称'); return }
      lang = { label: customName, name: resolveLanguage(customName) }
    } else {
      lang = STRESS_LANGS[row]
    }
    var col  = collectTextsForStress(sel)
    if (col.texts.length === 0) { sketch.UI.message('未找到英文文字（请先运行汉化存入原文）'); return }
    setTranslating(true)
    NSRunLoop.currentRunLoop().runMode_beforeDate(NSDefaultRunLoopMode, NSDate.dateWithTimeIntervalSinceNow(0.05))
    var result = callDoubao(cfg.apiKey, cfg.model, col.texts, lang.name)
    setTranslating(false)
    if (!result.ok) { sketch.UI.alert('翻译失败', result.error); return }
    var count    = applyTranslations(col.textMap, col.texts, result.data)
    var overflow = findOverflow(sel)
    if (overflow.length > 0) {
      try { for (var oi = 0; oi < overflow.length; oi++) overflow[oi].selected = true } catch(e) {}
      sketch.UI.message('✅ ' + lang.name + ' · ' + count + ' 处已翻译 · ⚠️ ' + overflow.length + ' 处溢出已选中')
    } else {
      sketch.UI.message('✅ 已翻译为 ' + lang.name + '，共 ' + count + ' 处 — 无溢出 ✓')
    }
  })
  okBtn.setAction_('callAction:')
  cv.addSubview_(okBtn)

  var dlgCloseBtn = dlg.standardWindowButton_(0)
  if (dlgCloseBtn) {
    dlgCloseBtn.setCOSJSTargetFunction(function() {
      _stressDlg = null
      dlg.orderOut_(null)
    })
    dlgCloseBtn.setAction_('callAction:')
  }

  dlg.makeKeyAndOrderFront_(null)
  _stressDlg = dlg
}

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
var _stressDlg          = null
var _stressCOS          = null
var _hasRunTranslation  = false  // 汉化成功一次后为 true，才显示"还原英文"按钮

var onShowPanel = function(context) {
  try {
    if (_panel && _panel.isVisible()) {
      _panel.makeKeyAndOrderFront_(null)
      return
    }

    // 释放上一次遗留的 COScript（此处是新调用上下文，释放安全）
    if (_panelCOS) { _panelCOS.setShouldKeepAround_(false); _panelCOS = null }

    var coscript = COScript.currentCOScript()
    coscript.setShouldKeepAround_(true)
    _panelCOS = coscript

    var W = 230, H = _hasRunTranslation ? 170 : 134
    // NSWindowStyleMaskTitled=1, NSWindowStyleMaskClosable=2, NSBackingStoreBuffered=2
    var win = NSPanel.alloc().initWithContentRect_styleMask_backing_defer_(
      NSMakeRect(0, 0, W, H),
      1 | 2,
      2,
      false
    )
    win.setTitle_('Translate UI')
    win.setFloatingPanel_(true)
    win.center()
    win.setReleasedWhenClosed_(false)

    var cv   = win.contentView()
    var btns = [
      ['切换语言预览…', function() { onStressTest({}) }],
      ['汉化选中画板',  function() { onRun({}) }],
    ]
    if (_hasRunTranslation) {
      btns.push(['还原英文', function() { onRestoreEnglish({}) }])
    }
    _panelBtns = []
    var y = H - 52
    for (var i = 0; i < btns.length; i++) {
      var btn = NSButton.alloc().initWithFrame_(NSMakeRect(16, y, W - 32, 28))
      btn.setTitle_(btns[i][0])
      btn.setBezelStyle_(1)
      btn.setCOSJSTargetFunction(btns[i][1])
      btn.setAction_('callAction:')
      cv.addSubview_(btn)
      _panelBtns.push(btn)
      y -= 36
    }

    var spinner = NSProgressIndicator.alloc().initWithFrame_(NSMakeRect(W / 2 - 8, 14, 16, 16))
    spinner.setStyle_(0)  // NSProgressIndicatorStyleSpinning
    spinner.setIndeterminate_(true)
    spinner.setHidden_(true)
    cv.addSubview_(spinner)
    _panelSpinner = spinner

    // 拦截系统关闭按钮，用 orderOut_ 隐藏而非 close，避免 notification block crash
    var closeBtn = win.standardWindowButton_(0)  // NSWindowCloseButton = 0
    if (closeBtn) {
      closeBtn.setCOSJSTargetFunction(function() {
        _panel = null
        _panelBtns = []
        _panelSpinner = null
        win.orderOut_(null)
        // 不在此处释放 _panelCOS：在自身执行栈里 setShouldKeepAround_(false) 会立即回收上下文导致 crash
        // 由下次 onShowPanel 调用（新上下文）安全释放
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
