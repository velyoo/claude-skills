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
        if (!target.layer.fixedWidth) {
          target.layer.fixedWidth = true
          target.layer.fixedWidth = false
        }
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
