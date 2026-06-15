---
name: design-audit
description: This skill should be used when the user asks to audit, review, or check a design in Sketch or Figma — including requests like "设计走查", "检查布局", "审查设计", "帮我看下设计", "check the design", "design review", "design QA", "design checklist". Covers layout grid, pixel alignment, text style, contrast, color variables, and icon/illustration consistency. Supports two data paths: Sketch MCP (run_code) and Figma REST API (curl + Python).
---

# Design Audit — Sketch MCP / Figma REST API Live Checker

> **走查路径选择：**
> - **Sketch**：用 `mcp__sketch__run_code` 执行 Phase 0 + Phase 1 脚本
> - **Figma**：用 REST API（`~/.figma_token`）+ Python 脚本采集数据，截图用 `mcp__claude_ai_Figma__get_screenshot`

## Audit Scope

- **有选中图层** → 审查选中的图层；**无选中** → 审查当前页面全部顶层 Frame
- 运行前确认："正在审查选中的 N 个图层 / 当前页面全部 Frame"

---

## Phase 0 — Auto-Rename Generic Layers

**必须先于数据采集执行**，将 Sketch 自动生成的通用名替换为语义化名称，确保报告中的层名可被识别。

**通用名范围（英文 + 中文均需检测）：**
- 英文：`Stack` `Group` `Rectangle` `Oval` `Path` `Shape` `Combined Shape` `Line` `Slice` `Frame` `Image` `Layer` `Bitmap` `Text` `Vector` `Mask`
- 中文：`编组` `路径` `矩形` `椭圆形` `蒙版` `层叠` `图层` `位图` `切片` `形状` `线段`
- 语义过宽（脚本无法自动处理，报告中列出供人工确认）：`info` `container` `group` `item` `content`（单独出现无修饰语时）

```js
const sketch=require('sketch');const doc=sketch.getSelectedDocument();const sel=doc.selectedLayers.layers;const scope=sel.length>0?sel:doc.selectedPage.canvasLevelFrames;const GENERIC_NAME_RE=/^(Stack|Group|Rectangle|Oval|Path|Shape|Combined Shape|Line|Slice|Frame|Image|Layer|Bitmap|Text|Vector|Mask|编组|路径|矩形|椭圆形|蒙版|层叠|图层|位图|切片|形状|线段)(\s+\d+)?$/i;const VAGUE_NAME_RE=/^(info|container|group|item|content)$/i;function getAllTexts(layer,depth,arr){if(!arr)arr=[];if(layer.hidden||arr.length>=6)return arr;if(layer.type==='Text'&&layer.text&&layer.text.trim())arr.push(layer.text.trim());const ch=layer.type==='SymbolInstance'?(layer.expandedLayers||[]):(layer.layers||[]);if((depth||0)<4)ch.forEach(c=>getAllTexts(c,(depth||0)+1,arr));return arr;}function hasDescendantText(layer,name){const ch=(layer.type==='SymbolInstance'?(layer.expandedLayers||[]):(layer.layers||[]));for(const c of ch){if(c.type==='Text'&&c.name===name)return true;if(hasDescendantText(c,name))return true;}return false;}function inferName(layer){if(layer.type==='Text')return null;const f=layer.frame;const w=Math.round(f.width),h=Math.round(f.height);const texts=getAllTexts(layer,0);const ch=(layer.type==='SymbolInstance'?(layer.expandedLayers||[]):(layer.layers||[])).filter(c=>!c.hidden);const hasImage=ch.some(c=>c.type==='Image'||(c.layers&&c.layers.some(l=>l.type==='Image')));if(texts.some(t=>/^\d{4}-\d{2}-\d{2}$/.test(t)))return 'date-divider';if(texts.some(t=>/^(Video|Image|Tools?|Settings?|Home|Profile|Search|Explore|Notifications?)$/i.test(t))&&texts.length>=3)return 'nav-tabs';if(w<=32&&h<=32&&ch.length<=3)return 'icon-btn';if(w>=280&&h>=50&&h<=130&&(hasImage||texts.some(t=>/\d+:\d+/.test(t))))return 'video-item';if(w>=280&&h<=50&&texts.length>=2)return 'file-info-row';if(w>=280&&h<=50)return 'row';if(w<=130&&h<=50&&texts[0]&&texts[0].length<=15)return texts[0].replace(/[^\w\u4e00-\u9fa5]/g,'-').toLowerCase().replace(/^-+|-+$/g,'');if(texts[0]&&texts[0].length<=20)return texts[0].replace(/[^\w\u4e00-\u9fa5]/g,'-').toLowerCase().replace(/^-+|-+$/g,'');return null;}const renamed=[];const vagueNames=[];const nameCount={};function getUniqName(base){nameCount[base]=(nameCount[base]||0)+1;return nameCount[base]===1?base:base+'-'+(nameCount[base]-1);}function traverse(layer){if(layer.hidden)return;if(GENERIC_NAME_RE.test(layer.name)&&layer.type!=='ShapePath'){const newBase=inferName(layer);if(newBase){const safeBase=hasDescendantText(layer,newBase)?newBase+'-container':newBase;const newName=getUniqName(safeBase);if(newName&&newName!==layer.name){renamed.push({old:layer.name,new:newName});layer.name=newName;}}}else if(VAGUE_NAME_RE.test(layer.name)){vagueNames.push({name:layer.name,type:layer.type});}const ch=layer.type==='SymbolInstance'?(layer.expandedLayers||[]):(layer.layers||[]);ch.forEach(traverse);}scope.forEach(traverse);console.log(JSON.stringify({total:renamed.length,renamed:renamed,vagueNames:vagueNames},null,2));
```

重命名后简要汇报："已自动重命名 N 个图层"；若有语义过宽的名称，列出请用户确认，随后继续 Phase 1。

**推断不确定时保留原名**：`inferName` 无法识别语义时返回 `null`，跳过重命名，保留 `Stack`/`编组` 等原名——原名至少有类型信息，强行改成坐标名（如 `group-352x468`）更难识别。

---

## Phase 1-Figma — Data Audit（Figma REST API 路径）

当用户提供 Figma 链接时，用以下 Python 脚本替代 Sketch run_code。从 URL 中提取 `fileKey` 和 `nodeId`（`-` 转 `:`），然后：

```bash
TOKEN=$(cat ~/.figma_token | tr -d '\n')
curl -s "https://api.figma.com/v1/files/{fileKey}/nodes?ids={nodeId}&geometry=paths" \
  -H "X-Figma-Token: $TOKEN" -o /tmp/figma_node.json
```

```python
# /tmp/figma_audit.py — 保存后 python3 /tmp/figma_audit.py 运行
import json, sys

with open('/tmp/figma_node.json') as f:
    data = json.load(f)

NODE_ID = "替换为实际nodeId"  # 如 "16281:14315"
if 'err' in data: print('ERROR:', data['err']); sys.exit(1)

node = data['nodes'][NODE_ID]['document']

STANDARD_SIZES = {(360,800),(375,667),(375,812),(390,844),(393,852),(414,896),(428,926),(412,915),(384,853),(360,780)}
BUTTON_HEIGHT_WL = {36,40,44,48,52,56}  # 视觉容器高度；40dp 为 MD3 标准，48dp 为含触控区的整体 Frame
GENERIC_RE = {'Stack','Group','Rectangle','Oval','Path','Shape','Combined Shape','Line','Slice','Frame','Image','Layer','Bitmap','Text','Vector','Mask'}

results = dict(pixel=[], grid=[], texts=[], lh_issues=[], tiny_text=[], colors=[], btn_issues=[], generic_names=[])

def is_system_bar(n):
    nm = n.get('name','').lower()
    return any(k in nm for k in ['status bar','status_bar','statusbar','状态栏','navigation bar','nav bar','navbar'])

def is_icon_container(n):
    bb = n.get('absoluteBoundingBox') or {}
    w,h = bb.get('width',999), bb.get('height',999)
    return w<=24 and h<=24 and abs(w-h)<=4 and n.get('type') in ('GROUP','INSTANCE','COMPONENT','FRAME')

def is_std_size(w,h): return (round(w),round(h)) in STANDARD_SIZES

def is_button_like(n):
    bb = n.get('absoluteBoundingBox') or {}
    h = round(bb.get('height',0))
    if h < 36 or h > 56: return False
    fills = [f for f in n.get('fills',[]) if f.get('visible',True) and f.get('type')=='SOLID']
    strokes = [s for s in n.get('strokes',[]) if s.get('visible',True)]
    cr = n.get('cornerRadius',0) or 0
    return (fills or strokes) and cr > 0

def color_hex(c):
    if not c: return None
    r,g,b,a = round(c.get('r',0)*255), round(c.get('g',0)*255), round(c.get('b',0)*255), c.get('a',1)
    return f'#{r:02x}{g:02x}{b:02x}' + (f'{round(a*255):02x}' if a < 0.99 else '')

def traverse(n, flags=None):
    if flags is None: flags = {}
    if not n.get('visible', True): return
    if flags.get('skip_all'): return

    t = n.get('type','')
    name = n.get('name','?')
    bb = n.get('absoluteBoundingBox') or {}
    x,y,w,h = bb.get('x',0), bb.get('y',0), bb.get('width',0), bb.get('height',0)

    child_flags = dict(flags)
    if is_system_bar(n): child_flags['skip_all'] = True; return
    if is_icon_container(n): child_flags['skip_icon'] = True

    skip_icon = flags.get('skip_icon', False)
    in_al = flags.get('in_auto_layout', False)

    base = name.rstrip('0123456789 ')
    if base in GENERIC_RE and t not in ('VECTOR','BOOLEAN_OPERATION'):
        results['generic_names'].append(f'{name} ({t})')

    if not skip_icon:
        checks = [(w,'w'),(h,'h')]
        if not in_al: checks = [(x,'x'),(y,'y')] + checks
        for v,lbl in checks:
            if round(v*10) % 10 != 0:
                results['pixel'].append({'name':name,'val':f'{lbl}={v:.2f}'})

    if not skip_icon and not is_std_size(w,h):
        checks = [(w,'w'),(h,'h')]
        if not in_al: checks = [(x,'x'),(y,'y')] + checks
        for v,lbl in checks:
            if round(v) % 4 != 0:
                results['grid'].append({'name':name,'val':f'{lbl}={round(v)}'})

    if not skip_icon and is_button_like(n):
        bh = round(h)
        if bh not in BUTTON_HEIGHT_WL:
            results['btn_issues'].append({'name':name,'h':bh})

    if t == 'TEXT' and not skip_icon:
        style = n.get('style',{})
        fs = style.get('fontSize',0)
        lh = style.get('lineHeightPx')
        lh_unit = style.get('lineHeightUnit','')
        chars = n.get('characters','')[:40]
        fills = n.get('fills',[])
        color = color_hex(fills[0].get('color')) if fills else None
        bound_fill = bool(n.get('boundVariables',{}).get('fills'))
        results['texts'].append({'name':name,'chars':chars,'fs':fs,'lh':lh,'color':color,'bound':bound_fill})

        if lh_unit == 'AUTO' or lh is None:
            results['lh_issues'].append({'name':name,'fs':fs,'lh':'auto','chars':chars[:20]})
        elif lh < fs:
            results['lh_issues'].append({'name':name,'fs':fs,'lh':lh,'issue':'lh<fs','chars':chars[:20]})
        elif round(lh*2) % 2 != 0:
            results['lh_issues'].append({'name':name,'fs':fs,'lh':lh,'issue':'odd','chars':chars[:20]})
        elif not (1.1 <= lh/fs <= 2.2):
            results['lh_issues'].append({'name':name,'fs':fs,'lh':lh,'issue':'ratio out of range','chars':chars[:20]})
        if fs <= 9: results['tiny_text'].append({'name':name,'fs':fs,'chars':chars[:20]})
        if color and not bound_fill and not n.get('styles',{}).get('fill'):
            results['colors'].append({'name':name,'slot':'text','color':color})

    elif t != 'TEXT' and not skip_icon and t not in ('VECTOR','BOOLEAN_OPERATION'):
        for i,fill in enumerate(n.get('fills',[])):
            if not fill.get('visible',True) or fill.get('type')!='SOLID': continue
            if bool(n.get('boundVariables',{}).get('fills')) or n.get('styles',{}).get('fill'): continue
            c = color_hex(fill.get('color'))
            if c: results['colors'].append({'name':name,'slot':f'fill-{i}','color':c})

    child_al = n.get('layoutMode') in ('HORIZONTAL','VERTICAL')
    for child in n.get('children',[]):
        cf = dict(child_flags)
        if child_al: cf['in_auto_layout'] = True
        traverse(child, cf)

traverse(node)
font_sizes = sorted(set(t['fs'] for t in results['texts']), reverse=True)
print(json.dumps({
    'frame': node['name'],
    'summary': {
        'pixel_issues': len(results['pixel']), 'grid_issues': len(results['grid']),
        'text_layers': len(results['texts']), 'lh_issues': len(results['lh_issues']),
        'tiny_text': len(results['tiny_text']), 'unbound_colors': len(results['colors']),
        'btn_issues': len(results['btn_issues']), 'generic_names': len(results['generic_names']),
        'font_sizes': font_sizes,
    },
    'pixel_issues': results['pixel'][:20], 'grid_issues': results['grid'][:20],
    'lh_issues': results['lh_issues'][:20], 'tiny_text': results['tiny_text'],
    'btn_issues': results['btn_issues'], 'generic_names': results['generic_names'][:20],
    'unbound_colors': results['colors'][:20], 'text_layers': results['texts'],
}, indent=2, ensure_ascii=False))
```

**Figma 特有豁免规则：**
- `boundVariables.fills` 存在 → 颜色已绑定变量，不报告
- `styles.fill` 存在 → 已引用 Shared Style，不报告
- `layoutPositioning == 'AUTO'` 或 `layoutMode` 存在 → auto-layout 子层，x/y 豁免 4pt
- Instance 节点正常递归（含 `children`），但不展开 Figma 组件内部的 master

---

## Phase 1 — Data Audit（Sketch 路径）

Run via `mcp__sketch__run_code`:

```js
const sketch=require('sketch');const doc=sketch.getSelectedDocument();const sel=doc.selectedLayers.layers;const scope=sel.length>0?sel:doc.selectedPage.canvasLevelFrames;const STANDARD_SIZES=[[384,853],[360,800],[375,667],[375,812],[390,844],[393,852],[414,896],[428,926],[412,915],[360,780]];function isStdSize(w,h){return STANDARD_SIZES.some(([sw,sh])=>sw===w&&sh===h);}function isValidLH(fs,lh){if(lh===null||lh===undefined)return null;if(lh<fs)return false;if(Math.round(lh)%2!==0)return false;const ratio=lh/fs;return ratio>=1.1&&ratio<=2.2;}function isStatusBar(layer){return /status.?bar|状态栏/i.test(layer.name);}function isIconContainer(layer){const w=layer.frame.width,h=layer.frame.height;return(layer.type==='Group'||layer.type==='SymbolInstance')&&w<=24&&h<=24&&Math.abs(w-h)<=4;}function isIllustrationGroup(layer){if(layer.type==='SymbolInstance')return false;const w=layer.frame.width,h=layer.frame.height;if(w<=24&&h<=24)return false;const ch=layer.layers||[];if(ch.length===0)return false;const ILLUS=new Set(['ShapePath','Path','Shape','Combined Shape','Vector']);function allPaths(l){if(ILLUS.has(l.type))return true;if(l.type==='Group')return(l.layers||[]).length>0&&(l.layers||[]).every(allPaths);return false;}return ch.every(allPaths);}function traverse(layer,cb,depth,flags,pW,pH){if(layer.hidden)return;cb(layer,depth||0,flags||{},pW||0,pH||0);if(layer.type==='SymbolInstance')return;const childFlags=Object.assign({},flags||{});if(!childFlags.skipAll&&isStatusBar(layer))childFlags.skipAll=true;if(!childFlags.skipIconChecks&&isIconContainer(layer))childFlags.skipIconChecks=true;if(!childFlags.skipIllustration&&!childFlags.skipIconChecks&&isIllustrationGroup(layer))childFlags.skipIllustration=true;const _pf=layer.frame;(layer.layers||[]).forEach(l=>traverse(l,cb,(depth||0)+1,childFlags,_pf.width,_pf.height));}const docSwatches=(doc.swatches||[]).map(s=>({name:s.name,color:s.color}));const GENERIC_NAME_RE=/^(Stack|Group|Rectangle|Oval|Path|Shape|Combined Shape|Line|Slice|Frame|Image|Layer|Bitmap|Text|Vector|Mask)(\s+\d+)?$/i;const BUTTON_HEIGHT_WHITELIST=new Set([36,40,44,48,52,56]);function hasTextDescendant(layer,maxDepth){if(maxDepth<=0)return false;const ch=layer.type==='SymbolInstance'?(layer.expandedLayers||[]):(layer.layers||[]);return ch.some(c=>c.type==='Text'||hasTextDescendant(c,maxDepth-1));}function isButtonLike(layer){const h=Math.round(layer.frame.height);if(h<36||h>56)return false;const style=layer.style;if(!style)return false;const hasFill=(style.fills||[]).some(f=>f.enabled);const hasBorder=(style.borders||[]).some(b=>b.enabled);if(!hasFill&&!hasBorder)return false;const radii=style.corners?style.corners.radii:null;const maxRadius=radii?Math.max(...radii):(style.borderRadius||0);if(maxRadius<=0)return false;return hasTextDescendant(layer,3);}function isHugWidth(layer){if(layer.type==='Text')return!layer.fixedWidth;if(!hasTextDescendant(layer,2))return false;try{const nl=layer._object;if(typeof nl.hasFixedWidth==='function')return!nl.hasFixedWidth();}catch(e){}return false;}const r={pixelIssues:[],gridIssues:[],textLayers:[],lineHeightIssues:[],tinyText:[],colorIssues:[],variableMatches:[],stackedOpacity:[],genericNames:[],buttonIssues:[],cornerIssues:[]};scope.forEach(root=>{traverse(root,(layer,depth,flags,pW,pH)=>{if(flags.skipAll)return;const f=layer.frame,nm=layer.name,ab=root.name,id=layer.id;const vals=[f.x,f.y,f.width,f.height];if(GENERIC_NAME_RE.test(nm)&&layer.type!=='ShapePath')r.genericNames.push({frame:ab,id,name:nm,type:layer.type,x:Math.round(f.x),y:Math.round(f.y)});if(!flags.skipIconChecks&&isButtonLike(layer)){const h=Math.round(f.height);if(!BUTTON_HEIGHT_WHITELIST.has(h))r.buttonIssues.push({frame:ab,id,name:nm,h,issue:`高度 ${h}dp 不在白名单`});}if(!flags.skipIconChecks&&!flags.skipIllustration&&layer.style&&layer.type!=='Text'){const _w=Math.round(f.width),_h=Math.round(f.height);const _ft=Math.min(_w,_h)*0.45;const _crs=layer.style.corners?layer.style.corners.radii:null;if(_crs){const _bad=_crs.filter(rv=>rv>0&&rv<_ft&&Math.round(rv)%4!==0);if(_bad.length)r.cornerIssues.push({frame:ab,id,name:nm,radii:_crs.map(v=>Math.round(v)),issue:_bad.map(v=>Math.round(v)).join('/')+'非4倍数'});}else{const _br=layer.style.borderRadius||0;if(_br>0&&_br<_ft&&Math.round(_br)%4!==0)r.cornerIssues.push({frame:ab,id,name:nm,radius:Math.round(_br),issue:Math.round(_br)+'非4倍数'});}}const isStackChild=!!(layer.parent&&layer.parent.stackLayout);if(!flags.skipIconChecks&&!flags.skipIllustration&&!isStackChild){if(vals.some(v=>Math.round(v*100)%100!==0))r.pixelIssues.push({frame:ab,id,name:nm,x:f.x,y:f.y,w:f.width,h:f.height});}if(!flags.skipIconChecks&&!flags.skipIllustration){const w=Math.round(f.width),h=Math.round(f.height);const _rm=pW>0?Math.round(pW-f.x-f.width):-1;const _bm=pH>0?Math.round(pH-f.y-f.height):-1;const xOk=Math.round(f.x)%4===0||(_rm>=0&&_rm%4===0);const yOk=Math.round(f.y)%4===0||(_bm>=0&&_bm%4===0);if(layer.type==='Text'&&!layer.fixedWidth){if(!isStackChild&&!isStdSize(w,h)){if(!xOk||!yOk)r.gridIssues.push({frame:ab,id,name:nm,x:Math.round(f.x),y:Math.round(f.y),w,h,note:'auto-text-xy'});}}else{const xyExempt=isStackChild;const isHugText=xyExempt&&layer.type!=='Text'&&hasTextDescendant(layer,2);if(!isStdSize(w,h)){if(xyExempt){const checkVals=isHugText?[f.height]:[f.width,f.height];if(checkVals.some(v=>Math.round(v)%4!==0))r.gridIssues.push({frame:ab,id,name:nm,x:Math.round(f.x),y:Math.round(f.y),w,h,xyExempt});}else{const wOk=w%4===0||isHugWidth(layer);const hOk=h%4===0;if(!xOk||!yOk||!wOk||!hOk)r.gridIssues.push({frame:ab,id,name:nm,x:Math.round(f.x),y:Math.round(f.y),w,h,xyExempt});}}}}if(layer.type==='Text'){const s=layer.style,fs=s.fontSize,lh=s.lineHeight;if(!s.textSwatch){const tcMatch=docSwatches.find(sw=>sw.color===s.textColor);if(tcMatch)r.variableMatches.push({frame:ab,id,name:nm,slot:'textColor',color:s.textColor,suggestedVar:tcMatch.name});else r.colorIssues.push({frame:ab,id,name:nm,slot:'textColor',color:s.textColor});}if(!flags.skipIconChecks){r.textLayers.push({frame:ab,id,name:nm,preview:(layer.text||'').substring(0,40),fontSize:fs,lineHeight:lh,colorVar:s.textSwatch?s.textSwatch.name:null,sharedStyle:layer.sharedStyle?layer.sharedStyle.name:null});const lhValid=isValidLH(fs,lh);if(lhValid===null)r.lineHeightIssues.push({frame:ab,id,name:nm,fontSize:fs,lineHeight:'auto(null)',preview:(layer.text||'').substring(0,20)});else if(!lhValid)r.lineHeightIssues.push({frame:ab,id,name:nm,fontSize:fs,lineHeight:lh,preview:(layer.text||'').substring(0,20)});if(fs<=9)r.tinyText.push({frame:ab,id,name:nm,fontSize:fs,preview:(layer.text||'').substring(0,20)});}}if(layer.style){const layerOpacity=layer.style.opacity!==undefined?layer.style.opacity:1;const skipColorCheck=flags.skipIconChecks||flags.skipIllustration;(layer.style.fills||[]).forEach((fill,i)=>{if(!fill.enabled||(fill.fillType!==0&&fill.fillType!=='Color'))return;const hex=fill.color||'#000000ff';if(layerOpacity<1&&parseInt(hex.slice(7,9),16)/255<1)r.stackedOpacity.push({frame:ab,id,name:nm,slot:'fill-'+i,layerOpacity,fillColor:hex});if(!fill.swatch&&!skipColorCheck){const match=docSwatches.find(s=>s.color===hex);if(match)r.variableMatches.push({frame:ab,id,name:nm,slot:'fill-'+i,color:hex,suggestedVar:match.name});else r.colorIssues.push({frame:ab,id,name:nm,slot:'fill-'+i,color:hex});}});(layer.style.borders||[]).forEach((border,i)=>{if(!border.enabled||border.swatch||skipColorCheck)return;const match=docSwatches.find(s=>s.color===border.color);if(match)r.variableMatches.push({frame:ab,id,name:nm,slot:'border-'+i,color:border.color,suggestedVar:match.name});else r.colorIssues.push({frame:ab,id,name:nm,slot:'border-'+i,color:border.color});});if(layer.type==='Text'&&layerOpacity<1){const tc=layer.style.textColor||'';if(tc.length===9&&parseInt(tc.slice(7,9),16)/255<1)r.stackedOpacity.push({frame:ab,id,name:nm,type:'text',layerOpacity,textColor:tc});}}});});const fontSizes=[...new Set(r.textLayers.map(t=>t.fontSize))].sort((a,b)=>b-a);console.log(JSON.stringify({scope:scope.map(f=>({name:f.name,w:Math.round(f.frame.width),h:Math.round(f.frame.height)})),summary:{pixelIssueCount:r.pixelIssues.length,gridIssueCount:r.gridIssues.length,textLayerCount:r.textLayers.length,lineHeightIssueCount:r.lineHeightIssues.length,tinyTextCount:r.tinyText.length,hardCodedColorCount:r.colorIssues.length,variableMatchCount:r.variableMatches.length,stackedOpacityCount:r.stackedOpacity.length,genericNameCount:r.genericNames.length,buttonIssueCount:r.buttonIssues.length,cornerIssueCount:r.cornerIssues.length,uniqueFontSizes:fontSizes},pixelIssues:r.pixelIssues,gridIssues:r.gridIssues,lineHeightIssues:r.lineHeightIssues,tinyText:r.tinyText,hardCodedColors:r.colorIssues,variableMatches:r.variableMatches,stackedOpacity:r.stackedOpacity,genericNames:r.genericNames,buttonIssues:r.buttonIssues,cornerIssues:r.cornerIssues,textLayers:r.textLayers},null,2));
```

---

## Phase 2 — Visual Review

调用 `mcp__sketch__get_selection_as_image` 截图，目检以下项：
- 布局亲密性 / 优先级突出
- 文本对比度（白底深色 OK；浅灰底+中灰字 WARN；彩色背景+白字需核查）
- 文案简洁度、多语言扩展空间
- **文案拼写**：逐一核查所有可见文字，检查单词拼写错误、多余字母、缺字母（如 `Roboto` 应为 `Robot`）；专有名词、品牌名除外
- 图标识别性、笔触填充统一、与邻近文字协调
- 插图风格一致、颜色有意义
- 颜色主次是否合理

---

## Phase 3 — Checklist Rules

### 命名规范

| 检查项 | 数据来源 | 判定规则 |
|--------|----------|----------|
| 图层命名语义化 | `genericNames` | Phase 0 已自动修复；剩余无法识别的**不报告**（影响不大，不产生 ⚠️） |

通用名（含空格+数字变体，英文+中文均检测）：
- 英文：`Stack` `Group` `Rectangle` `Oval` `Path` `Shape` `Combined Shape` `Line` `Slice` `Frame` `Image` `Layer` `Bitmap` `Text` `Vector` `Mask`
- 中文：`编组` `路径` `矩形` `椭圆形` `蒙版` `层叠` `图层` `位图` `切片` `形状` `线段`

ShapePath 类型豁免。语义过宽名（`info` `container` `group` `item` `content` 单独出现时）不自动重命名，在报告中列出供人工确认。

### 布局

| 检查项 | 数据来源 | 判定规则 |
|--------|----------|----------|
| 同级元素亲密性 / 优先级突出 | 视觉 | 截图目检 |
| 4pt 网格 | `gridIssues` | 0→PASS；1–5→WARN；>5→FAIL |
| 像素对齐 | `pixelIssues` | 0→PASS；任意非整数→FAIL |
| 按钮高度 | `buttonIssues` | 0→PASS；>0→WARN（高度不在白名单 {36/40/44/48/52/56}） |
| 圆角规范 | `cornerIssues` | 0→PASS；>0→WARN（圆角值非4倍数；全圆豁免，即 radius≥min(w,h)×0.45） |

4pt 网格：坐标/尺寸须为 4 的倍数（0/4/8/12/16/20/24/32…），12、20、36 等均合规。豁免：标准画板顶层尺寸（384×853、360×800）、图标内部路径（≤24px 正方形容器的所有子层）、**插图内部路径**（见下方说明）、**Auto-layout 子层的 x/y**（Stack 子层坐标由引擎推算，不纳入 4pt 检查；仅检查手工设置的 w/h、gap 值）。

额外豁免情形（坐标为计算结果，非手工指定间距）：

- **Auto-layout 均分子层的小数坐标**：Stack 容器将宽度等分给多个子层时（如 330÷3=110.33），子层的 x/width 为小数，属布局引擎行为，**豁免像素对齐和 4pt 检查**。判定：`layer.parent?.stackLayout` 存在。
- **包含文字的 hug 宽度容器**：包含文字子层的 Group/SymbolInstance，若宽度由文字内容驱动（`!hasFixedWidth()`），**豁免宽度的 4pt 检查**；高度仍正常检查。分两类：① Stack 子层：判定 `isStackChild && !isText && hasTextDescendant(layer, 2)`，典型场景 badge 容器、标签组；② 非 stack 子层（如 FAB 按钮、文字驱动宽度的按钮）：判定 `!hasFixedWidth() && hasTextDescendant(layer, 2)`，文字长度不可能总是 4 倍数，不应被报告。
- **右/底对齐图层的 x/y 坐标**：对非 stack 子层，采用双边检测——`x` 和右边距（`parentW - x - w`）只需其中一个为 4 的倍数即通过；`y` 和底边距同理。右对齐/底对齐图层（如 FAB：right=24、bottom=36）不会因衍生坐标被误报。
- **文案驱动宽度的工具栏/Tab 项**：工具栏图标+标签组合项、Tab 项等，即便文字层 `fixedWidth=true`，宽度也是按文案手工对齐而非间距 token，其容器宽度豁免 4pt 检查。
- **居中元素的 x/y**：通过 auto-layout 或居中对齐定位的图层（如页面水平居中的说明文字），其 x/y 由引擎推算，豁免 4pt；自身 w/h 仍须检查。
- **底部弹窗 / 浮层容器的 Y 坐标**：当浮层容器的 Y ≈ 画板高度 − 容器高度时，该 Y 值由内容高度决定，不是间距 token，豁免 4pt 检查。判定方式：`artboardH − layerY − layerH ≤ 8`。
- **组件内部居中对齐的子层**：在 Symbol 或 Group 组件内部，通过水平/垂直居中对齐定位的子层，其坐标由 `(parentSize − selfSize) / 2` 运算得出，可能产生非 4pt 值，豁免检查。**前提**：组件容器本身须 4pt 合规，子层自身的宽高也须合规。

> **注意**：若某图层的非 4pt 坐标是因为手工对齐到另一元素的中心（而非引擎居中），不属于豁免情形，建议将两者编入同一 Stack 容器并设置居中对齐，让布局引擎接管位置。

### 文本

| 检查项 | 数据来源 | 判定规则 |
|--------|----------|----------|
| 行高收敛 | `lineHeightIssues` | 0→PASS；有违规→FAIL |
| 字号收敛 | `uniqueFontSizes` | >6 档→WARN；含≤9px→WARN |
| 极小字号 | `tinyText` | ≤9px→WARN，需设计师确认 |
| 文案拼写 | 视觉 | 截图目检；单词错误→WARN；专有名词/品牌名豁免 |
| 文本层级 / 对比度 / 文案 / 多语言 | 视觉 | 截图目检 |

行高规则：被 2 整除；lh/fs 比值 1.1–2.2；lh < fs→FAIL；lh=null(auto)→WARN。示例：14px→20px/24px 合规，19px/21px/26px 违规。

**豁免规则：**
- **Symbol 实例内部**：遍历遇到 SymbolInstance 即停止递归，不检查其内部子层。只检查 Symbol 实例本身的坐标/尺寸。switch 内部 Rectangle、导航栏 Symbol 内部 Bar 等均不拆出来报告。
- **图标内部路径**：父容器为近似正方形且 ≤24px 的 Group/Symbol，其内部子层豁免像素对齐、4pt 网格、行高、极小字号检查，且不计入字号收敛统计；文字颜色变量仍正常检查
- **插图内部路径**：插图（>24px 的装饰性图形/illustration 区域）内部矢量子层，豁免 4pt 网格和像素对齐检查。**豁免的问题不在报告中出现**（不写"X 处豁免"）。**例外：Line（线条）图层不豁免像素对齐**——半像素线条会模糊，必须为整数坐标。
- **插图颜色**：插图内部颜色可以硬编码，不需要绑定变量，报告中不提示
- **状态栏**：名称含 `Status Bar`/`状态栏` 的组件，其所有内部子层跳过全部规范检查；**命名须规范，否则无法被识别**
- **Stack 居中奇数宽子层**：Stack 自动居中奇数宽度子层时产生的 ±0.5px，像素对齐豁免
- **占位/广告区域**：走查前主动询问是否有需豁免区域，在报告中注明
- **示例/预览内容层**：样式编辑器等场景中展示给用户预览的 canvas 文字（非 UI chrome），行高、字号、颜色规范不适用

对比度参考：白底深色字 OK；#F5F5F5+#666 约 3.9:1 WARN；彩色背景+白字按饱和度判断。需精确值时运行：
```js
const sketch = require('sketch');
function lum(hex){const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;return [r,g,b].map(c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)).reduce((a,v,i)=>a+v*[0.2126,0.7152,0.0722][i],0);}
function cr(fg,bg){const l1=lum(fg),l2=lum(bg);return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2);}
console.log('contrast:', cr('#FFFFFF','#0055CC'), '(AA>=4.5)');
```

多语言：文本容器预留 20–40% 扩展空间；fixedWidth 按钮翻译后注意溢出，参考 `i18n-layout` skill。

### 图标

| 检查项 | 数据来源 | 判定规则 |
|--------|----------|----------|
| 易于识别 / 与邻近文本协调 | 视觉 | 截图目检 |
| 尺寸/笔触/填充统一 | 视觉 + 按需运行脚本 | 截图目检 |
| 像素对齐 | `pixelIssues` | 图标内部路径已豁免，仅报告图标容器本身 |

图标尺寸脚本（按需）：
```js
const sketch = require('sketch');
const sel = sketch.getSelectedDocument().selectedLayers.layers;
const icons = [];
function traverse(l){if(l.hidden)return;const f=l.frame;if(Math.abs(f.width-f.height)<=2&&f.width>=16&&f.width<=48)icons.push({name:l.name,size:Math.round(f.width),type:l.type});(l.layers||[]).forEach(traverse);}
sel.forEach(traverse);
console.log(JSON.stringify({iconCount:icons.length,uniqueSizes:[...new Set(icons.map(i=>i.size))].sort((a,b)=>a-b),icons:icons.slice(0,30)},null,2));
```

### 插图

全部依赖视觉目检（风格一致、颜色有意义）。插图来源查询：
```js
const sketch = require('sketch');
sketch.getSelectedDocument().selectedLayers.layers.forEach(l=>{if(l.sharedStyle)console.log(l.name,'→',l.sharedStyle.name,'|',l.sharedStyle.getLibrary()?.name||'local');});
```

### 颜色

| 检查项 | 数据来源 | 判定规则 |
|--------|----------|----------|
| 禁止堆叠透明度 | `stackedOpacity` | >0→**FAIL**（必须修复） |
| 可替换变量的 UI 硬编码颜色 | `variableMatches` | >0→可直接绑定，无需用户确认 |
| 无对应变量的 UI 硬编码颜色 | `hardCodedColors` | >0→WARN，需核查是否新增 token |
| 主色/辅色使用合理 | 视觉 | 截图目检 |

注意：**插图颜色可以硬编码**，脚本已跳过插图内部颜色检查（`flags.skipIconChecks`），报告中不出现。UI 层有变量匹配的颜色可直接自动绑定，不需要逐一确认。

堆叠透明度：禁止同时使用「颜色 alpha<1」+「图层 opacity<1」。修复：二选一——透明度烧录进颜色 hex，或颜色不透明+图层 opacity。

---

## Phase 4 — Report Format

**核心规则：只写问题，不写正常项。**

- ❌ 必须修复 / ⚠️ 建议修复 / 🔍 视觉异常（目检发现问题才写，正常则省略）
- **图层引用格式**：`Frame名 → 图层名`，同名图层跨 Frame 时必须加前缀
- **多 Frame**：先输出汇总矩阵，无问题的 Frame 只占一行，不展开
- **单 Frame / 无问题 Frame**：直接 `✅ 全部通过` 一行收尾

```
## 走查报告 — [页面/Frame 名称]

| Frame        | ❌ | ⚠️ | 🔍 |
|--------------|----|----|-----|
| 主页         | 0  | 3  | 1   |
| 轨道-未选中  | 1  | 2  | 0   |
| 轨道-选中    | ✅ |    |     |

---
### 主页
⚠️ Frame名 → 层名  问题描述（坐标/数值）
⚠️ Frame名 → 层名  问题描述
🔍 Frame名 → 层名  视觉异常描述（只在发现问题时才写此行）

### 轨道-未选中
❌ Frame名 → 层名  问题描述
⚠️ Frame名 → 层名  问题描述（加注：数据驱动可豁免？）

---
共 X 项（❌A / ⚠️B / 🔍C）
```

**省略规则汇总：**
- 无问题的 Frame：矩阵中标 ✅，不展开详情
- 🔍 目检行：视觉正常时完全省略，不写"正常""无异常"
- 不写"已通过"列表，通过的分类直接不出现

---

## 报告末尾：一键定位脚本

**每次报告最后必须附上以下脚本**，将报告中所有 ❌/⚠️ 问题图层的 ID 填入 `IDS`（从 Phase 1 JSON 的各 issue 对象中取 `id` 字段），让用户一键选中全部问题层：

```js
const sketch=require('sketch');const doc=sketch.getSelectedDocument();
const IDS=new Set(['/* 替换为实际 ID 列表，逗号分隔字符串 */']);
let n=0;
function sel(l){if(IDS.has(l.id)){l.selected=true;n++;}(l.layers||[]).forEach(sel);}
doc.selectedPage.layers.forEach(l=>{l.selected=false;sel(l);});
console.log(`已选中 ${n} 个问题图层，在图层面板中查看`);
```

**填写规则：**
- 只填 ❌ 和 ⚠️ 问题的 `id`（不含 variableMatches，那些可自动修复）
- 同一图层多种问题只填一次（Set 去重）
- 🔍 视觉异常若能定位到具体图层也可加入

---

## Phase 5 — Selective Fix（审查后可选）

报告输出后询问："需要我帮忙修复哪些？可以说「修复像素对齐」或「全部自动修复」。"

### 可直接修复 — 像素对齐

告知影响范围（层数）并获确认后运行。**自动跳过：状态栏内部、图标内部（≤24px 正方形容器）、Stack 内子层（auto-layout 覆盖坐标，脚本无法修复且属正常行为）**：

```js
const sketch=require('sketch');const doc=sketch.getSelectedDocument();const sel=doc.selectedLayers.layers;const scope=sel.length>0?sel:doc.selectedPage.canvasLevelFrames;
function isStatusBar(l){return /status.?bar|状态栏/i.test(l.name);}
function isIconContainer(l){const w=l.frame.width,h=l.frame.height;return(l.type==='Group'||l.type==='SymbolInstance')&&w<=24&&h<=24&&Math.abs(w-h)<=4;}
function isStackChild(l){return !!(l.parent&&l.parent.stackLayout);}
function traverse(layer,cb,flags){if(layer.hidden)return;cb(layer,flags||{});const cf=Object.assign({},flags||{});if(!cf.skipAll&&isStatusBar(layer))cf.skipAll=true;if(!cf.skipPixel&&isIconContainer(layer))cf.skipPixel=true;const ch=layer.type==='SymbolInstance'?(layer.expandedLayers||[]):(layer.layers||[]);ch.forEach(l=>traverse(l,cb,cf));}
let fixed=0;
scope.forEach(root=>traverse(root,(layer,flags)=>{if(flags.skipAll||flags.skipPixel)return;if(isStackChild(layer))return;const f=layer.frame,rx=Math.round(f.x),ry=Math.round(f.y),rw=Math.round(f.width),rh=Math.round(f.height);if(rx!==f.x||ry!==f.y||rw!==f.width||rh!==f.height){layer.frame={x:rx,y:ry,width:rw,height:rh};fixed++;}}));
console.log(`像素对齐修复完成，共修正 ${fixed} 个图层（已跳过状态栏、图标内部、Stack 子层）`);
```

修复后运行 `mcp__sketch__get_selection_as_image` 确认视觉无异常。

### 可直接修复 — 颜色变量替换

将 `variableMatches` 中的硬编码颜色（fill/border/textColor）批量绑定到文档已有的颜色变量：

```js
const sketch=require('sketch');const doc=sketch.getSelectedDocument();const sel=doc.selectedLayers.layers;const scope=sel.length>0?sel:doc.selectedPage.canvasLevelFrames;
const swatches=doc.swatches||[];
function isStatusBar(l){return /status.?bar|状态栏/i.test(l.name);}
function traverse(layer,cb,flags){if(layer.hidden)return;cb(layer,flags||{});const cf=Object.assign({},flags||{});if(!cf.skipAll&&isStatusBar(layer))cf.skipAll=true;const ch=layer.type==='SymbolInstance'?(layer.expandedLayers||[]):(layer.layers||[]);ch.forEach(l=>traverse(l,cb,cf));}
const matchSwatch=color=>swatches.find(s=>s.color===color);
let fixed=0;
scope.forEach(root=>traverse(root,(layer,flags)=>{
  if(flags.skipAll||!layer.style)return;
  (layer.style.fills||[]).forEach(fill=>{if(!fill.enabled||fill.fillType!==0||fill.swatch)return;const s=matchSwatch(fill.color);if(s){fill.swatch=s;fixed++;}});
  (layer.style.borders||[]).forEach(border=>{if(!border.enabled||border.swatch)return;const s=matchSwatch(border.color);if(s){border.swatch=s;fixed++;}});
  if(layer.type==='Text'&&!layer.style.textSwatch){const s=matchSwatch(layer.style.textColor);if(s){layer.style.textSwatch=s;fixed++;}}
}));
console.log(`颜色变量替换完成，共绑定 ${fixed} 处`);
```

**替换后必须执行补充扫描**，确保无遗漏（历史问题：Group 与内部 Text 层同名时，上方脚本的遍历可能跳过该 Text 层）：

```js
const sketch=require('sketch');const doc=sketch.getSelectedDocument();const swatches=doc.swatches||[];const matchSwatch=color=>swatches.find(s=>s.color===color);const scope=doc.selectedPage.canvasLevelFrames;function traverse(layer,cb){if(layer.hidden)return;cb(layer);const ch=layer.type==='SymbolInstance'?(layer.expandedLayers||[]):(layer.layers||[]);ch.forEach(l=>traverse(l,cb));}let fixed=0;scope.forEach(root=>traverse(root,layer=>{if(layer.type!=='Text'||layer.style.textSwatch)return;const s=matchSwatch(layer.style.textColor);if(s){layer.style.textSwatch=s;fixed++;}}));console.log(fixed>0?`补充修复 ${fixed} 处遗漏`:'无遗漏，全部绑定完成');
```

### 需用户确认才能修复

| 问题 | 询问方式 |
|------|---------|
| 行高不合规 | "「X」14px 行高 21px，改为 20px 还是 24px？" |
| 极小字号 | "「X」8px 是有意的标签样式还是误用？" |
| 硬编码颜色无变量 | "「X」#979899 是新增颜色还是一次性使用可豁免？" |
| 4pt 网格违规 | "「X」x=13 是有意的精细调整吗？" |
| 颜色变量替换（variableMatches） | 自动修复前告知：「共 X 处颜色可绑定到现有变量，将统一替换」 |

每次只修复一类，修完截图确认，再处理下一类。

### 不建议自动修复

布局亲密性 / 文案内容 / 图标视觉重心 / 插图风格 / 颜色主次 — 均需设计师决策。

---

## MD3 Reference — 走查对照规格

截图目检时对照以下 Material Design 3 官方规格，发现偏差在报告中注明。

### Typography（字阶）

| 字阶 | 字号 | 行高 | 字重 | 典型用途 |
|------|------|------|------|---------|
| Display Large | 57sp | 64sp | Regular 400 | 超大展示标题 |
| Display Medium | 45sp | 52sp | Regular 400 | 大展示标题 |
| Display Small | 36sp | 44sp / 48sp | Regular 400 | 小展示标题 |
| Headline Large | 32sp | 40sp | Regular 400 | 页面主标题 |
| Headline Medium | 28sp | 36sp | Regular 400 | 区块标题 |
| Headline Small | 24sp | 32sp（Android 变体 28sp） | Regular 400 | 卡片/弹窗标题 |
| Title Large | 22sp | 28sp | Regular 400 | 顶部栏标题 |
| Title Medium | 16sp | 24sp | Medium 500 | 列表主文字 |
| Title Small | 14sp | 20sp | Medium 500 | 小标题 |
| Body Large | 16sp | 24sp | Regular 400 | 正文主体 |
| Body Medium | 14sp | 20sp | Regular 400 | 正文次级 |
| Body Small | 12sp | 16sp | Regular 400 | 辅助文字 |
| Label Large | 14sp | 20sp | Medium 500 | 按钮/Tab 文字 |
| Label Medium | 12sp | 16sp | Medium 500 | 标签/角标 |
| Label Small | 11sp | 16sp | Medium 500 | 说明极小文字 |

走查时：文本层字号/行高若不在上表中，需在报告中标注「非标准字阶」并指出最近合规值。

---

### Top App Bar（顶部导航栏）

| 属性 | Standard | Medium | Large |
|------|----------|--------|-------|
| 高度 | 64dp | 116dp | 160dp |
| 标题字阶 | Title Large (22/28) | Headline Small (24/32) | Headline Medium (28/36) |
| 标题颜色 | `on-surface` | `on-surface` | `on-surface` |
| 背景色（默认） | `surface` | `surface` | `surface` |
| 背景色（滚动后） | `surface-container` | `surface-container` | `surface-container` |
| 图标触摸区 | 48dp | 48dp | 48dp |
| 图标尺寸 | 24dp | 24dp | 24dp |
| 图标颜色 | `on-surface-variant` | `on-surface-variant` | `on-surface-variant` |
| 水平内边距 | 4dp (两侧) | 4dp | 4dp |

---

### Navigation Bar（底部导航栏）

| 属性 | 规格 |
|------|------|
| 高度 | 80dp |
| 图标尺寸 | 24dp |
| Active indicator | 64×32dp，corner-full，色 `secondary-container` |
| 图标色（激活） | `on-secondary-container` |
| 图标色（未激活） | `on-surface-variant` |
| 标签字阶 | Label Medium — 12sp / 16sp / Medium 500 |
| 标签色（激活） | `on-surface` |
| 标签色（未激活） | `on-surface-variant` |
| 背景色 | `surface-container` |

---

### List Item（列表项）

| 属性 | 规格 |
|------|------|
| 单行高度（标准） | 56dp（上下各 py-8） |
| 单行高度（紧凑 -2 density） | 48dp（上下各 py-4） |
| 单行高度（最紧凑 -4 density） | 40dp（上下 py-0，仅单行纯文字场景）|
| 双行高度 | 72dp |
| 三行高度 | 88dp（正文最多2行）|
| 水平内边距 | 16dp |
| 前置图标尺寸 | 24dp（图标）/ 40dp（头像）/ 56dp（大图） |
| 前置图标色 | `on-surface-variant` |
| 主文字 | Title Medium — 16/24/Medium 500，色 `on-surface` |
| 副文字 | Body Medium — 14/20/Regular，色 `on-surface-variant` |
| 尾部文字 | Label Small — 11/16/Medium，色 `on-surface-variant` |
| 分割线 | 1dp，色 `outline-variant`，左侧缩进 16dp |

---

### Bottom Sheet（底部弹窗）

| 属性 | 规格 |
|------|------|
| 顶部圆角 | 28dp（corner-extra-large），底部无圆角 |
| 顶部内边距 | 16dp |
| 底部内边距 | 48dp（含导航栏安全区）/ 24dp（无导航栏） |
| 内部区块间距 | 24dp |
| 背景色 | `surface` |
| 标题字阶 | Headline Small — 24sp / 28sp（Android）/ Regular 400，色 `on-surface` |
| 拖拽把手 | 32×4dp，圆角 2dp，色 `on-surface-variant`，居中，margin-top 8dp（可选） |

**走查要点：**
- 顶部圆角必须是 28dp，不能用 16dp/12dp
- 底部留白须考虑导航栏高度（80dp），pb-48 是常见安全值
- 内部各区块用 24dp gap 分隔，区块内用 8dp gap

---

### Grouped Card List（分组卡片列表）

底部弹窗内常见的卡片化列表样式（非标准 List Item）：

| 属性 | 规格 |
|------|------|
| 外层容器圆角 | 28dp（corner-extra-large） |
| 内层每项圆角 | 4dp（corner-extra-small） |
| 内层项间距 | 2dp |
| 项背景色 | `surface-container-high` |
| 项水平内边距 | pl-16 / pr-24 |
| 项垂直内边距 | py-16（双行）/ py-12（单行紧凑） |
| 主文字 | Title Small — 14/20/Medium 500，色 `on-surface` |
| 副文字 | Body Small — 12/16/Regular，色 `on-surface-variant` |
| 图标尺寸 | 24dp |
| 图标与文字间距 | 16dp |

**走查要点：**
- 外层 28dp 圆角 + 内层 4dp 圆角是固定组合，不要拆开使用
- 与标准 List Item 的区别：有背景色、有外容器、项间距 2dp

---

### Chips（标签片）

| 属性 | Assist / Filter / Input / Suggestion |
|------|--------------------------------------|
| 高度 | 32dp |
| 圆角 | corner-small — 8dp |
| 标签字阶 | Label Large — 14/20/Medium |
| 水平内边距（无图标） | 左右各 16dp |
| 水平内边距（有前置图标） | 左 8dp / 右 16dp |
| 图标尺寸 | 18dp（前置）/ 18dp（尾部关闭图标）|
| 描边（未选中） | 1dp，色 `outline` |
| 容器色（选中 Filter） | `secondary-container` |
| 文字色（未选中） | `on-surface-variant` |
| 文字色（选中） | `on-secondary-container` |

---

### Tabs（标签页）

| 属性 | Primary Tabs | Secondary Tabs |
|------|-------------|----------------|
| 高度 | 48dp | 48dp |
| 指示条高度 | 3dp（圆角 3dp top）| 2dp |
| 指示条颜色 | `primary` | `primary` |
| 文字字阶 | Title Small — 14/20/Medium | Title Small |
| 文字色（激活） | `primary` | `on-surface` |
| 文字色（未激活） | `on-surface-variant` | `on-surface-variant` |
| 图标尺寸 | 24dp | 24dp |
| 背景色 | `surface` | `surface` |

---

### Switch（开关）

| 属性 | 规格 |
|------|------|
| 触控目标 | 52×48dp（含 track + 外边距）|
| Track（关闭） | 52×32dp，color `surface-container-highest`，描边 2dp `outline` |
| Track（开启） | 52×32dp，color `primary` |
| Thumb（关闭） | 16dp，color `outline` |
| Thumb（开启） | 24dp，color `on-primary` |
| Thumb（带图标） | 24dp，图标 16dp |
| 图标色（开启） | `on-primary-container` |

**走查要点：** 触控区固定 52×48dp；Track 本身 32dp 高居中于触控区；开/关两态 thumb 尺寸不同（16→24dp）。

---

### QS Tile（快捷设置磁贴 — Android System UI）

| 属性 | 规格 |
|------|------|
| 宽度 | 192dp（2×2 网格单元）|
| 高度（折叠） | 60dp |
| 高度（展开含副标题） | 80dp |
| 圆角 | 28dp（corner-extra-large）|
| 图标尺寸 | 24dp |
| 标签字阶 | Body Small — 12/16/Regular |
| 激活色 | `secondary-container` / 图标 `on-secondary-container` |
| 未激活色 | `surface-container-high` / 图标 `on-surface-variant` |
| 不可用色 | `on-surface` 12% 透明 |

**走查要点：** QS Tile 仅出现在系统级 UI 设计稿中；宽度固定 192dp 对应标准 2 列网格；折叠/展开高度差 20dp 来自副标题行（12/16）。

---

### Button（按钮）

所有按钮变体共用属性：

| 属性 | 规格 |
|------|------|
| 容器高度 | **40dp** |
| 圆角 | **全圆角（corner-full）** |
| 字体 | Label Large — 14sp / 20sp / Medium (500) |
| 图标尺寸 | 18dp |
| 图标与文字间距 | 8dp |
| 水平内边距（无图标） | 左右各 24dp |
| 水平内边距（有前置图标） | 左 16dp / 右 24dp |
| 垂直内边距 | 上下各 10dp |

> **Android 触控目标**：视觉容器 40dp，但开发实现须保证触控区 ≥ 48dp（上下各留 4dp 透明区域）。Figma 文件中若看到整体 Frame 为 48dp，内部视觉按钮仍应为 40dp，走查以视觉容器为准。

**Text Button 特殊值**：水平内边距 左右各 12dp（有图标时左 12dp / 右 16dp）

各变体颜色角色：

| 变体 | 容器色 | 文字/图标色 |
|------|--------|------------|
| Filled | `primary` | `on-primary` |
| Outlined | 透明，描边 `outline` 1dp | `primary` |
| Text | 透明，无描边 | `primary` |
| Elevated | `surface-container-low` | `primary` |
| Tonal | `secondary-container` | `on-secondary-container` |
| Surface（Android） | `surface-container-low` | `primary` |

---

### Dialog（对话框）

**容器：**

| 属性 | 规格 |
|------|------|
| 圆角 | **28dp（corner-extra-large）** |
| 最小宽度 | 280dp |
| 最大宽度 | 560dp（或屏宽 − 48dp） |
| 容器色 | `surface-container-high` |
| 阴影层级 | level3（6dp） |
| 遮罩透明度 | 32% |

**内部间距：**

| 区域 | 属性 | 值 |
|------|------|----|
| 图标 | margin-top | 24dp |
| 图标 | 尺寸 | 24dp，色 `secondary` |
| 标题（无图标） | padding-top | 24dp |
| 标题（有图标） | padding-top | 16dp |
| 标题 | padding 水平 | 24dp |
| 正文 | padding-top | 24dp（有标题时为 8dp） |
| 正文 | padding 水平 | 24dp |
| 正文 | padding-bottom | 24dp（有操作按钮时为 8dp） |
| 操作区 | padding 全部 | 上 16dp / 左右 24dp / 下 24dp |
| 操作按钮间距 | gap | **8dp** |

**字体：**

| 角色 | 字阶 | 字号/行高/字重 | 颜色 |
|------|------|---------------|------|
| 标题 | Headline Small | 24sp / 32sp / Regular (400) | `on-surface` |
| 正文 | Body Medium | 14sp / 20sp / Regular (400) | `on-surface-variant` |
| 操作按钮 | Label Large | 14sp / 20sp / Medium (500) | `primary` |

操作按钮：右对齐，使用 Text Button 样式。

---

### Menu（菜单）

**容器：**

| 属性 | 规格 |
|------|------|
| 最小宽度 | 112dp |
| 圆角 | **4dp（corner-extra-small）** |
| 容器色 | `surface-container` |
| 阴影层级 | Level 2（3dp） |
| 上下内边距 | 各 8dp |

**菜单项：**

| 属性 | 规格 |
|------|------|
| 单行高度 | **56dp** |
| 双行高度 | 72dp |
| 三行高度 | 88dp |
| 左右内边距 | 各 16dp |
| 上下内边距 | 各 12dp |
| 图标尺寸 | 24dp |
| 图标与文字间距 | 16dp |
| 图标色 | `on-surface-variant` |

**字体：**

| 角色 | 字阶 | 字号 / 行高 / 字重 | 颜色 |
|------|------|-------------------|------|
| 主文字 | Body Large | 16sp / 24sp / Regular 400 | `on-surface` |
| 副文字 | Body Medium | 14sp / 20sp / Regular 400 | `on-surface-variant` |
| 尾部文字（快捷键等） | Label Small | 11sp / 16sp / Medium 500 | `on-surface-variant` |

**分割线：**

| 属性 | 规格 |
|------|------|
| 粗细 | 1dp |
| 颜色 | `outline-variant` |
| 上下外边距 | 各 8dp |
| 左右缩进 | 各 16dp |

**选中状态：** 容器色 `secondary-container`，文字 / 图标色 `on-secondary-container`
