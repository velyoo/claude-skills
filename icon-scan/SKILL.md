---
name: icon-scan
description: This skill should be used when the user asks to scan, collect, or organize icons from a Sketch file — including requests like「整理图标」「扫描图标」「图标规范」「提取图标」「生成图标展示」「icon scan」. Scans all pages for pure-vector layers, deduplicates Symbol masters vs instances, excludes canvas-floating drafts, confirms via screenshot, then renders a gray-background grid display.
---

# Icon Scan Skill

扫描 Sketch 文件中所有图标，去重、排废稿，生成灰底网格展示。  
目标页面：「图标」页（不存在则用第一页）；Symbols 页和图标页本身均不扫描。

---

## 整体流程

1. **清空图标页**：删除上次渲染结果
2. **建 masterMap**：从 Symbols 页读取 SymbolMaster 的标准尺寸
3. **扫描**：递归遍历设计页，两套策略（SymbolInstance / Group）
4. **去重 + 密度过滤**：Symbol 按 symbolId 取 master 尺寸；Group 按规范化名字保留最小实例，同时过滤名字-尺寸密度不匹配的噪音
5. **尺寸分桶**：按 `Math.round(max(w,h)/4)*4` 分桶，≥44px 或孤立 ≥28px → 合并入插画组
6. **渲染**：小图标按分桶独立灰底行排列；插画组内再按尺寸细分，共享一个灰底背景

---

## 完整脚本（v10，扫描 + 渲染一次调用）

```js
const sketch=require('sketch')
const doc=sketch.getSelectedDocument()
// ★ 安全检查：必须有「图标」页才能继续，绝对不能回退到 pages[0]（可能是 Symbols 页）
const iconPage=doc.pages.find(p=>p.name==='图标')
if(!iconPage){throw new Error('未找到「图标」页，请先新建该页面再运行')}

// ── 清空图标页（ObjC 原生循环，比 JS 层快） ───────────────────────
const nativePg=iconPage._object
for(let i=nativePg.layers().count()-1;i>=0;i--)
  nativePg.layers().objectAtIndex_(i).removeFromParent()

// ── 建 masterMap：从 Symbols 页取每个 SymbolMaster 的标准尺寸 ────
const masterMap={}
doc.pages.find(p=>p.name==='Symbols')
  ?.layers.forEach(l=>{if(l.type==='SymbolMaster')masterMap[l.symbolId]=l})

const MAX=96
const VT=new Set(['ShapePath','Path','Shape','Combined Shape','Vector','BooleanOperation'])

function hasText(l){if(l.type==='Text')return true;return(l.layers||[]).some(hasText)}

// Group：所有子层必须是矢量（无 Text、无 SymbolInstance）
function isPVG(l){
  if(hasText(l))return false
  const ch=l.layers||[]
  if(!ch.length)return false
  function av(x){
    if(VT.has(x.type))return true
    if(x.type==='Group')return(x.layers||[]).length>0&&x.layers.every(av)
    return false
  }
  return ch.every(av)
}

// 尺寸合理：max≤96，宽高比≤1.5
function isSz(w,h){
  const mx=Math.max(w,h),mn=Math.min(w,h)
  return mx<=MAX&&mx/mn<=1.5
}

// 密度匹配：若名字含 -NNpx/-NNdp，实际尺寸不能超过 2× 命名尺寸
// 作用：排除 `-24px` 图标被以 72px（3× 密度）放置在高密度画板的噪音
function isDensityOk(name,w,h){
  const m=name.match(/[-_](\d+)(px|dp)/i)
  if(!m)return true
  return Math.max(w,h)<=parseInt(m[1])*2
}

const all=[]

function scan(l,inAB,d){
  if(l.hidden||d>14)return
  const inAB2=inAB||l.type==='Artboard'||l.type==='Frame'
  const w=Math.round(l.frame.width),h=Math.round(l.frame.height)

  // SymbolInstance：用 masterMap 取标准尺寸，不检查内部结构
  if(l.type==='SymbolInstance'&&inAB2&&l.name&&l.name.trim().length>1){
    const m=masterMap[l.symbolId]
    const mw=m?Math.round(m.frame.width):w
    const mh=m?Math.round(m.frame.height):h
    if(isSz(mw,mh)){
      all.push({name:l.name,w:mw,h:mh,type:'symbol',symbolId:l.symbolId,_layer:l})
      return
    }
  }

  // Group：纯矢量结构 + 名称 + 尺寸 + 密度匹配
  if(l.type==='Group'&&inAB2&&isSz(w,h)&&l.name&&l.name.trim().length>1
     &&isPVG(l)&&isDensityOk(l.name,w,h)){
    all.push({name:l.name,w,h,type:'group',_layer:l})
    return
  }

  // 继续往下（SymbolInstance 用 expandedLayers 展开）
  ;(l.type==='SymbolInstance'?(l.expandedLayers||[]):(l.layers||[]))
    .forEach(c=>scan(c,inAB2,d+1))
}

// 跳过 Symbols 页和图标页本身
doc.pages.forEach(p=>{
  if(p.name==='Symbols'||p===iconPage)return
  p.layers.forEach(l=>scan(l,false,0))
})

// ── 去重 ─────────────────────────────────────────────────────────
// Symbol：按 symbolId，所有实例共用 master 尺寸，取 first-seen
// Group：按规范化名字，保留最小实例（最小 = 最接近实际 UI 用途的尺寸）
function normName(n){
  return n.replace(/\s*(备份|Copy|副本)\s*\d*$/i,'').replace(/\s+\d+$/,'').trim()
}
const bySid={},byNorm={}
all.forEach(c=>{
  const sz=Math.max(c.w,c.h)
  if(c.type==='symbol'&&c.symbolId){
    if(!bySid[c.symbolId])bySid[c.symbolId]=c          // 取 first-seen
  }else if(c.type==='group'){
    const k=normName(c.name)
    if(!byNorm[k]||sz<Math.max(byNorm[k].w,byNorm[k].h))
      byNorm[k]=c                                        // 保留最小实例
  }
})
const icons=[...Object.values(bySid),...Object.values(byNorm)]

// ── 尺寸分桶：步长 4px ────────────────────────────────────────────
icons.forEach(ic=>{ic._sz=Math.round(Math.max(ic.w,ic.h)/4)*4})
icons.sort((a,b)=>a._sz-b._sz)

const tempG={}
icons.forEach(ic=>{if(!tempG[ic._sz])tempG[ic._sz]=[];tempG[ic._sz].push(ic)})

const szGroups=[],illustItems=[]
Object.keys(tempG).map(Number).sort((a,b)=>a-b).forEach(sz=>{
  const g=tempG[sz]
  // ≥44px 归插画；或孤立且 ≥28px 也归插画
  if(sz>=44||(g.length<=1&&sz>=28))illustItems.push(...g)
  else szGroups.push({sz,items:g})
})
if(illustItems.length>0)szGroups.push({sz:-1,items:illustItems,isIllust:true})

// ── 渲染 ─────────────────────────────────────────────────────────
const COL=15,PAD=4,GAP=4,BG='#D8D8D8',startX=80
let curY=0
const created=[]
doc.selectedPage=iconPage

function placeIcon(icon,ox,oy,exact){
  if(exact){
    // 插画：duplicate + 只改 x/y，不改 w/h（保留原始尺寸）
    try{const cl=icon._layer.duplicate();cl.parent=iconPage;cl.frame.x=ox;cl.frame.y=oy;created.push(cl)}catch(e){}
  }else if(icon.type==='symbol'){
    // Symbol：new SymbolInstance at master size（比 duplicate 快得多）
    try{created.push(new sketch.SymbolInstance({
      parent:iconPage,symbolId:icon.symbolId,
      frame:new sketch.Rectangle(ox,oy,icon.w,icon.h)
    }))}catch(e){}
  }else{
    // Group：duplicate + 只改 x/y，绝对不改 w/h（改了会破坏矢量结构）
    try{const cl=icon._layer.duplicate();cl.parent=iconPage;cl.frame.x=ox;cl.frame.y=oy;created.push(cl)}catch(e){}
  }
}

function renderRows(items,CELL,exact){
  items.forEach((icon,i)=>{
    const col=i%COL,row=Math.floor(i/COL)
    const cx=startX+col*(CELL+GAP),cy=curY+row*(CELL+GAP)
    const ox=cx+Math.round((CELL-icon.w)/2),oy=cy+Math.round((CELL-icon.h)/2)
    placeIcon(icon,ox,oy,exact)
  })
  const rows=Math.ceil(items.length/COL)
  curY+=rows*(CELL+GAP)-GAP+GAP
}

szGroups.forEach(grp=>{
  if(!grp.isIllust){
    // 普通分桶：统一 CELL，单块灰底
    const CELL=grp.sz+PAD*2
    const rows=Math.ceil(grp.items.length/COL)
    const bgW=Math.min(grp.items.length,COL)*(CELL+GAP)-GAP
    const bgH=rows*(CELL+GAP)-GAP
    created.push(new sketch.ShapePath({
      parent:iconPage,
      shapeType:sketch.ShapePath.ShapeType.Rectangle,
      frame:new sketch.Rectangle(startX,curY,bgW,bgH),
      style:{fills:[{color:BG,fillType:'Color'}],borders:[]}
    }))
    renderRows(grp.items,CELL,false)
    curY+=8
  }else{
    // 插画组：统一大格混排，COL=6（不按 _sz 细分，避免每行只有 1-2 个图标）
    const ILLUST_COL=6
    const maxSz=Math.max(...grp.items.map(ic=>ic._sz))
    const CELL=maxSz+PAD*2
    const rows=Math.ceil(grp.items.length/ILLUST_COL)
    const bgW=Math.min(grp.items.length,ILLUST_COL)*(CELL+GAP)-GAP
    const bgH=rows*(CELL+GAP)-GAP
    created.push(new sketch.ShapePath({
      parent:iconPage,
      shapeType:sketch.ShapePath.ShapeType.Rectangle,
      frame:new sketch.Rectangle(startX,curY,bgW,bgH),
      style:{fills:[{color:BG,fillType:'Color'}],borders:[]}
    }))
    grp.items.forEach((icon,i)=>{
      const col=i%ILLUST_COL,row=Math.floor(i/ILLUST_COL)
      const cx=startX+col*(CELL+GAP),cy=curY+row*(CELL+GAP)
      placeIcon(icon,cx+Math.round((CELL-icon.w)/2),cy+Math.round((CELL-icon.h)/2),true)
    })
    curY+=rows*(CELL+GAP)-GAP+GAP+8
  }
})

console.log(JSON.stringify({
  total:icons.length,
  groups:szGroups.map(g=>g.isIllust?'插画:'+g.items.length:g.sz+'px:'+g.items.length),
  layers:created.length
}))
```

---

## 导出截图（单独调用）

```js
const sketch=require('sketch')
const doc=sketch.getSelectedDocument()
const pg=doc.pages.find(p=>p.name==='图标')||doc.pages[0]
doc.selectedPage=pg
const layers=pg.layers.slice()
if(!layers.length){console.log('no layers');return}
const g=new sketch.Group({parent:pg,name:'__tmp__',layers})
g.adjustToFit()
sketch.export(g,{formats:'png',output:'/private/tmp/icon_export',scales:'1','save-for-web':true})
g.layers.slice().forEach(l=>{l.parent=pg})
g.remove()
console.log('exported')
```

然后用 `Read` 读取 `/private/tmp/icon_export/__tmp__.png` 给用户确认。

---

## 关键规则速查

| 场景 | 正确做法 |
|---|---|
| Symbol 渲染 | `new sketch.SymbolInstance({symbolId, frame})` — 用 master 尺寸，比 duplicate 快得多 |
| Group 渲染 | `duplicate()` 后只改 `frame.x/y`，**绝对不改 frame.width/height** |
| 清空图标页 | ObjC 原生反向循环 `nativePg.layers().objectAtIndex_(i).removeFromParent()` |
| Symbol 尺寸 | 从 `masterMap[symbolId]` 取，不用 instance.frame（instance 可能被缩放） |
| Group 去重策略 | 保留最小实例（最接近实际 UI 使用尺寸） |
| 密度噪音 | 名字含 `-NNpx/-NNdp` 且实际尺寸 > 2× 命名尺寸 → 跳过 |
| 插画阈值 | `_sz >= 44`，或孤立且 `_sz >= 28` |
| 扫描排除 | Symbols 页 + 图标页本身均不扫 |

---

## 注意事项

- **不做名称过滤**（`Rectangle`/`Group 1` 里可能藏真图标）；结构 + 尺寸 + 密度检验才是可靠判断
- Group dedup 保留「最小」：同一命名图标若在不同密度画板各出现一次，最小的才是 1× 标准尺寸
- Symbol dedup 取 first-seen：所有实例共用同一 master 尺寸，先后无差别
- `s.points = s.points.map(...)` **禁用**，会把 ShapePath frame 重置为 1×1
- 图标页超过 400 个时 duplicate 会超时 → Symbol 一律用 `new SymbolInstance()`，只有 Group 才 duplicate

---

## 实测教训（InShot 视频组文件，2026-06-25）

**Group dedup 之前保留「最大」→ 改为保留「最小」**  
原因：`round-videocam-24px` 在 Edit Video 等高密度画板里以 72px 使用，
保留最大导致所有 -24px Group 都以 72px 出现在图标集里，视觉混乱。  
改为保留最小后，72px 的高密度版本被丢弃，留下 24px 的标准版本。

**密度不匹配的极端情况：`round-arrow_back-24px` 全文件只有 72px 实例**  
该图标从未以 24px 放置在任何设计画板（设计师只在 3× 密度画板里用它）。  
最小实例仍是 72px，进了插画组。  
→ `isDensityOk` 过滤解决：名字说 24px，实际 72px > 24×2=48 → 跳过，从图标集移除。  
（这类图标的正确版本只存在于 Symbol master 内部，不独立出现在设计页。）

**Symbol 尺寸之前用 instance.frame → 改为用 masterMap**  
SymbolInstance.frame 会随画板缩放，同一 Symbol 在不同画板尺寸各异。  
改用 masterMap 后，所有实例统一取 master 的原始尺寸。

**插画组内用统一大 CELL → 改为按子分组用各自 CELL**  
原因：插画组里既有 44px 图标也有 96px 插画，用最大 CELL 时小图标看起来极小，比例失调。  
改为每个 _sz 子组用 `CELL = sz + 8px padding`，视觉更均衡。

**初版（v6）5409 个候选噪音分析**  
- 状态栏（360×24）、导航条（412×24）也是纯矢量 → 加 mx/mn≤1.5 宽高比过滤
- Artboard 内大量嵌套纯矢量子组 → 加 MAX_DEPTH=14 + 必须在 Artboard 内（inArtboard flag）
- SymbolInstance 被 isPureVectorGroup 误判为 false → 两套策略分离，SymbolInstance 不检查内部结构
