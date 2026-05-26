import {
  useState, useEffect, useCallback, useRef,
  CSSProperties, WheelEvent, MouseEvent, TouchEvent, PointerEvent,
} from "react";

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_USER   = "trieu-dev";
const DEFAULT_REPO   = "ielts-practice";
const DEFAULT_BRANCH = "main";

const READING_PARTS   = [2, 3, 5, 6, 8] as const;
const LISTENING_PARTS = [1, 2, 3, 4]    as const;
const TOTAL_TESTS     = 8;
const STORAGE_KEY     = "ielts_used_tests";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Config  { user: string; repo: string; branch: string; }
interface Part    { id: string; test: number; part: number; url: string; answerKey: string; }
interface Session { reading: Part[]; listening: Part[]; }
type SectionKey   = "reading" | "listening";
type ToolType     = "pen" | "circle" | "text" | "eraser";

interface Point   { x: number; y: number; }

interface Annotation {
  id:       string;
  tool:     ToolType;
  color:    string;
  size:     number;
  // pen / eraser
  points?:  Point[];
  // circle
  start?:   Point;
  end?:     Point;
  // text
  pos?:     Point;
  text?:    string;
}

// ── LocalStorage ──────────────────────────────────────────────────────────────
function loadUsed(): number[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as number[]; }
  catch { return []; }
}
function saveUsed(used: number[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(used));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSession(user: string, repo: string, branch: string): Session {
  const base = `https://raw.githubusercontent.com/${user}/${repo}/${branch}`;
  const rTests = shuffle(Array.from({ length: TOTAL_TESTS }, (_, i) => i + 1));
  const lTests = shuffle(Array.from({ length: TOTAL_TESTS }, (_, i) => i + 1));
  return {
    reading:   READING_PARTS.map((p, i)  => ({ id:`r-t${rTests[i]}-p${p}`, test:rTests[i], part:p, url:`${base}/reading/test${rTests[i]}-part${p}.png`,   answerKey:`${base}/reading/test${rTests[i]}-part${p}-key.png`   })),
    listening: LISTENING_PARTS.map((p, i) => ({ id:`l-t${lTests[i]}-p${p}`, test:lTests[i], part:p, url:`${base}/listening/test${lTests[i]}-part${p}.png`, answerKey:`${base}/listening/test${lTests[i]}-part${p}-key.png` })),
  };
}

function uid(): string { return Math.random().toString(36).slice(2); }

// ── Canvas renderer ───────────────────────────────────────────────────────────
function redraw(canvas: HTMLCanvasElement, annotations: Annotation[], draft: Annotation | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  [...annotations, ...(draft ? [draft] : [])].forEach(ann => renderAnnotation(ctx, ann));
}

function renderAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation): void {
  ctx.save();
  ctx.strokeStyle = ann.tool === "eraser" ? "rgba(0,0,0,0)" : ann.color;
  ctx.fillStyle   = ann.color;
  ctx.lineWidth   = ann.size;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  if (ann.tool === "eraser" && ann.points?.length) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = ann.size * 3;
    ctx.beginPath();
    ann.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

  } else if (ann.tool === "pen" && ann.points?.length) {
    ctx.beginPath();
    ann.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

  } else if (ann.tool === "circle" && ann.start && ann.end) {
    const cx = (ann.start.x + ann.end.x) / 2;
    const cy = (ann.start.y + ann.end.y) / 2;
    const rx = Math.abs(ann.end.x - ann.start.x) / 2;
    const ry = Math.abs(ann.end.y - ann.start.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

  } else if (ann.tool === "text" && ann.pos && ann.text) {
    ctx.font      = `bold ${ann.size * 8}px 'DM Mono', monospace`;
    ctx.fillStyle = ann.color;
    ctx.fillText(ann.text, ann.pos.x, ann.pos.y);
  }
  ctx.restore();
}

// ── Annotation Canvas ─────────────────────────────────────────────────────────
interface AnnotationCanvasProps {
  annotations:    Annotation[];
  onAdd:          (ann: Annotation) => void;
  tool:           ToolType;
  color:          string;
  size:           number;
  pendingText:    string;   // keep as string — "yes" | ""
  onRequestText:  (pos: Point) => void;
  zoom:           number;
  offset:         Point;
}

function AnnotationCanvas({ annotations, onAdd, tool, color, size, pendingText, onRequestText }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef  = useRef<Annotation | null>(null);
  const drawing   = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      redraw(canvas, annotations, draftRef.current);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) redraw(canvas, annotations, draftRef.current);
  }, [annotations]);

  // Raw pixel position relative to canvas element — no zoom math
  function toCanvas(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (tool === "text") {
      onRequestText(toCanvas(e));
      return;
    }
    drawing.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const pt = toCanvas(e);
    draftRef.current = { id: uid(), tool, color, size, points: [pt], start: pt, end: pt };
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !draftRef.current) return;
    const pt = toCanvas(e);
    const d  = draftRef.current;
    if (d.tool === "pen" || d.tool === "eraser") d.points = [...(d.points ?? []), pt];
    else d.end = pt;
    draftRef.current = { ...d };
    const canvas = canvasRef.current;
    if (canvas) redraw(canvas, annotations, draftRef.current);
  }

  function onPointerUp() {
    if (!drawing.current || !draftRef.current) return;
    drawing.current = false;
    onAdd(draftRef.current);
    draftRef.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position:      "absolute", inset: 0,
        width:         "100%",     height: "100%",
        cursor:        tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair",
        touchAction:   "none",
        pointerEvents: pendingText ? "none" : "all",
      }}
    />
  );
}

// ── Text Input Overlay ────────────────────────────────────────────────────────
interface TextInputProps {
  pos:      Point;
  color:    string;
  size:     number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

function TextInput({ pos, color, size, onCommit, onCancel }: TextInputProps) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 50);
  }, []);

  return (
    <div style={{
      position:      "absolute",
      left:          pos.x,
      top:           pos.y,
      zIndex:        30,
      pointerEvents: "all",
      transform:     "translate(0, -50%)", // vertically center on click point
    }}>
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === "Enter" && val.trim()) onCommit(val.trim());
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => {
          if (val.trim()) onCommit(val.trim());
          else onCancel();
        }}
        style={{
          background:   "rgba(0,0,0,0.75)",
          border:       `2px solid ${color}`,
          borderRadius: 4,
          padding:      "3px 8px",
          color,
          outline:      "none",
          fontFamily:   "'DM Mono', monospace",
          fontSize:     size * 6,
          minWidth:     140,
          boxShadow:    `0 0 0 3px ${color}33`,
          whiteSpace:   "nowrap",
        }}
        placeholder="Type then Enter ↵"
      />
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
const COLORS = ["#FF4444","#FFB800","#44DD88","#4488FF","#CC44FF","#ffffff"];
const SIZES  = [1, 2, 4];

interface ToolbarProps {
  tool:      ToolType;
  color:     string;
  size:      number;
  canUndo:   boolean;
  onTool:    (t: ToolType) => void;
  onColor:   (c: string)   => void;
  onSize:    (s: number)   => void;
  onUndo:    () => void;
  onClear:   () => void;
}

function Toolbar({ tool, color, size, canUndo, onTool, onColor, onSize, onUndo, onClear }: ToolbarProps) {
  const tools: { key: ToolType; label: string }[] = [
    { key:"pen",    label:"✏️" },
    { key:"circle", label:"⭕" },
    { key:"text",   label:"T" },
    { key:"eraser", label:"◻" },
  ];
  return (
    <div style={{
      display:"flex", alignItems:"center", flexWrap:"wrap", gap:8,
      padding:"8px 16px", background:"#180f08", borderBottom:"1px solid #2a2318",
    }}>
      {/* Tools */}
      <div style={{ display:"flex", gap:4 }}>
        {tools.map(t => (
          <button key={t.key} onClick={() => onTool(t.key)} title={t.key} style={{
            width:32, height:32, borderRadius:6, border:"1px solid " + (tool===t.key?"#C8A96E":"#3a3020"),
            background: tool===t.key ? "#C8A96E22" : "transparent",
            color: tool===t.key ? "#C8A96E" : "#8a7a65",
            cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily:"'DM Mono', monospace", fontWeight:700,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ width:1, height:24, background:"#2a2318" }} />

      {/* Colors */}
      <div style={{ display:"flex", gap:4 }}>
        {COLORS.map(c => (
          <button key={c} onClick={() => onColor(c)} style={{
            width:20, height:20, borderRadius:"50%", border:"2px solid " + (color===c?"#fff":"transparent"),
            background:c, cursor:"pointer", padding:0, outline:"none",
            boxShadow: color===c ? "0 0 0 1px #000" : "none",
          }} />
        ))}
      </div>

      <div style={{ width:1, height:24, background:"#2a2318" }} />

      {/* Size */}
      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
        {SIZES.map(s => (
          <button key={s} onClick={() => onSize(s)} style={{
            width:28, height:28, borderRadius:6,
            border:"1px solid " + (size===s?"#C8A96E":"#3a3020"),
            background: size===s ? "#C8A96E22" : "transparent",
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <div style={{ width:s*3+4, height:s*3+4, borderRadius:"50%", background: size===s?"#C8A96E":"#5a4a35" }} />
          </button>
        ))}
      </div>

      <div style={{ width:1, height:24, background:"#2a2318" }} />

      {/* Undo / Clear */}
      <button onClick={onUndo} disabled={!canUndo} style={toolActionBtn(!canUndo)}>↩ Undo</button>
      <button onClick={onClear} style={toolActionBtn(false)}>🗑 Clear</button>
    </div>
  );
}

function toolActionBtn(disabled: boolean): CSSProperties {
  return {
    background:"transparent", border:"1px solid " + (disabled?"#2a2318":"#3a3020"),
    borderRadius:6, padding:"4px 10px", color: disabled?"#2a2318":"#8a7a65",
    cursor: disabled?"not-allowed":"pointer", fontSize:11,
    fontFamily:"'DM Mono', monospace",
  };
}

// ── Image Card ────────────────────────────────────────────────────────────────
interface ImageCardProps {
  item:            Part;
  showKey:         boolean;
  onToggleKey:     () => void;
  onImageError:    () => void;
  imgError:        boolean;
  annotations:     Annotation[];
  onAddAnnotation: (ann: Annotation) => void;
  onUndo:          () => void;
  onClear:         () => void;
}

function ImageCard({ item, showKey, onToggleKey, onImageError, imgError, annotations, onAddAnnotation, onUndo, onClear }: ImageCardProps) {
  const [keyError,     setKeyError]     = useState(false);
  const [zoom,         setZoom]         = useState(1);
  const [offset,       setOffset]       = useState<Point>({ x:0, y:0 });
  const [dragging,     setDragging]     = useState(false);
  const [dragStart,    setDragStart]    = useState<Point>({ x:0, y:0 });
  const [lastDist,     setLastDist]     = useState<number|null>(null);
  const [tool,         setTool]         = useState<ToolType>("pen");
  const [color,        setColor]        = useState("#FF4444");
  const [size,         setSize]         = useState(2);
  const [textPending,  setTextPending]  = useState<Point|null>(null);

  const resetZoom = () => { setZoom(1); setOffset({ x:0, y:0 }); };
  const zoomIn    = () => setZoom(z => Math.min(z+0.25, 4));
  const zoomOut   = () => setZoom(z => { const n=Math.max(z-0.25,1); if(n===1) setOffset({x:0,y:0}); return n; });

  const onWheel = (e: WheelEvent<HTMLDivElement>) => { e.preventDefault(); e.deltaY<0?zoomIn():zoomOut(); };
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (tool !== "pen" && tool !== "eraser" && tool !== "circle") return; // canvas handles drawing
    if (zoom<=1) return;
    setDragging(true);
    setDragStart({ x:e.clientX-offset.x, y:e.clientY-offset.y });
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => { if(!dragging) return; setOffset({ x:e.clientX-dragStart.x, y:e.clientY-dragStart.y }); };
  const onMouseUp   = () => setDragging(false);

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length===2) { const dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY; setLastDist(Math.hypot(dx,dy)); }
  };
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length===2) {
      const dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY, dist=Math.hypot(dx,dy);
      if (lastDist!==null) setZoom(z=>Math.min(Math.max(z+(dist-lastDist)*0.01,1),4));
      setLastDist(dist);
    }
  };

  const imgStyle: CSSProperties = {
    maxWidth:"100%", maxHeight:600, borderRadius:8, objectFit:"contain",
    boxShadow:"0 4px 20px rgba(0,0,0,0.4)",
    transform:`scale(${zoom}) translate(${offset.x/zoom}px,${offset.y/zoom}px)`,
    transformOrigin:"center center",
    transition: dragging?"none":"transform 0.15s ease",
    display:"block",
  };

  const handleAddAnnotation = (ann: Annotation) => {
    onAddAnnotation(ann);
  };

  const handleTextCommit = (text: string) => {
    if (!textPending) return;
    onAddAnnotation({ id:uid(), tool:"text", color, size, pos:textPending, text });
    setTextPending(null);
  };

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ background:"#1a1510", border:"1px solid #3a3020", borderRadius:16, overflow:"hidden", boxShadow:"0 8px 40px rgba(0,0,0,0.5)" }}>

      {/* Card header */}
      <div style={{ padding:"14px 20px", background:"#201a12", borderBottom:"1px solid #3a3020", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Tag color="#C8A96E">Test {item.test}</Tag>
          <Tag color="#8a7a65">Part {item.part}</Tag>
        </div>
        <button onClick={onToggleKey} style={{
          background:showKey?"#C8A96E":"transparent", border:"1px solid "+(showKey?"#C8A96E":"#5a4a35"),
          borderRadius:8, padding:"6px 14px", fontSize:12,
          color:showKey?"#1a1510":"#C8A96E", cursor:"pointer",
          fontFamily:"'DM Mono', monospace", transition:"all 0.2s", fontWeight:showKey?700:400,
        }}>{showKey ? "◀ Question" : "Answer Key ▶"}</button>
      </div>

      {/* Toolbar */}
      <Toolbar
        tool={tool} color={color} size={size} canUndo={annotations.length>0}
        onTool={setTool} onColor={setColor} onSize={setSize}
        onUndo={onUndo} onClear={onClear}
      />

      {/* Zoom bar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 20px", background:"#180f08", borderBottom:"1px solid #2a2318" }}>
        <button onClick={zoomOut} disabled={zoom<=1} style={zoomBtnStyle(zoom<=1)}>－</button>
        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:12, color:"#8a7a65", minWidth:48, textAlign:"center" }}>{Math.round(zoom*100)}%</div>
        <button onClick={zoomIn}  disabled={zoom>=4} style={zoomBtnStyle(zoom>=4)}>＋</button>
        <button onClick={resetZoom} style={{ marginLeft:4, background:"transparent", border:"1px solid #3a3020", borderRadius:6, padding:"4px 10px", color:"#5a4a35", cursor:"pointer", fontSize:11, fontFamily:"'DM Mono', monospace" }}>Reset</button>
        {zoom>1 && <span style={{ fontSize:11, color:"#3a3020", fontFamily:"'DM Mono', monospace", marginLeft:4 }}>scroll or drag to pan</span>}
      </div>

      {/* Image + canvas area */}
      
      <div
        ref={containerRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => setLastDist(null)}
        style={{
          minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, background: "#100e0a", overflow: "hidden",
          position: "relative",
          cursor: tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair",
          userSelect: "none",
        }}
      >
        {/* Image */}
        {!showKey ? (
          imgError
            ? <ImageError url={item.url} icon="🖼" label="Image not found" />
            : <img src={item.url} alt={`Test ${item.test} Part ${item.part}`} onError={onImageError} style={imgStyle} draggable={false} />
        ) : (
          keyError
            ? <ImageError url={`test${item.test}-part${item.part}-key.png`} icon="🔑" label="No answer key image found" />
            : <img src={item.answerKey} alt={`Key`} onError={()=>setKeyError(true)} style={imgStyle} draggable={false} />
        )}

        {/* Annotation canvas — only on question side */}
        {!showKey && !imgError && (
          <AnnotationCanvas
            annotations={annotations}
            onAdd={handleAddAnnotation}
            tool={tool} color={color} size={size}
            pendingText={textPending ? "yes" : ""}
            onRequestText={(pos) => setTextPending(pos)}
            zoom={zoom} offset={offset}
          />
        )}

        {/* Text input overlay — positioned in raw container px, not canvas coords */}
        {textPending && !showKey && (
          <TextInput
            pos={textPending}
            color={color}
            size={size}
            onCommit={handleTextCommit}
            onCancel={() => setTextPending(null)}
          />
        )}
      </div>

      {/* Annotation count badge */}
      {annotations.length > 0 && (
        <div style={{ padding:"6px 16px", background:"#180f08", borderTop:"1px solid #2a2318", fontSize:11, color:"#5a4a35", fontFamily:"'DM Mono', monospace" }}>
          ✏️ {annotations.length} annotation{annotations.length>1?"s":""} on this part
        </div>
      )}
    </div>
  );
}

// ── Utility components ────────────────────────────────────────────────────────
function zoomBtnStyle(disabled: boolean): CSSProperties {
  return { background:"transparent", border:"1px solid "+(disabled?"#2a2318":"#3a3020"), borderRadius:6, padding:"4px 10px", color:disabled?"#2a2318":"#C8A96E", cursor:disabled?"not-allowed":"pointer", fontSize:16, fontFamily:"'DM Mono', monospace", transition:"all 0.2s" };
}
function btnStyle(border: string, color: string): CSSProperties {
  return { background:"transparent", border:`1px solid ${border}`, borderRadius:8, padding:"8px 16px", color, cursor:"pointer", fontSize:12, fontFamily:"'DM Mono', monospace" };
}
function Tag({ color, children }: { color:string; children:React.ReactNode }) {
  return <div style={{ background:color+"22", border:"1px solid "+color+"55", borderRadius:6, padding:"3px 10px", fontSize:11, color, fontFamily:"'DM Mono', monospace", letterSpacing:1, textTransform:"uppercase" }}>{children}</div>;
}
function ImageError({ icon, label, url }: { icon:string; label:string; url:string }) {
  return (
    <div style={{ textAlign:"center", color:"#5a4a35" }}>
      <div style={{ fontSize:48, marginBottom:12 }}>{icon}</div>
      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13 }}>{label}</div>
      <div style={{ fontSize:11, marginTop:6, color:"#3a3020", maxWidth:280, lineHeight:1.6 }}>{url}</div>
    </div>
  );
}
function ProgressDots({ total, current }: { total:number; current:number }) {
  return (
    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
      {Array.from({ length:total }).map((_,i) => (
        <div key={i} style={{ width:i===current?24:8, height:8, borderRadius:4, background:i===current?"#C8A96E":i<current?"#5a4a35":"#2a2318", transition:"all 0.3s ease" }} />
      ))}
    </div>
  );
}

interface ConfigField { label:string; key:keyof Config; placeholder:string; }
function ConfigPanel({ config, onChange, onClose }: { config:Config; onChange:(c:Config)=>void; onClose:()=>void }) {
  const [local, setLocal] = useState<Config>(config);
  const fields: ConfigField[] = [
    { label:"GitHub Username", key:"user",   placeholder:"e.g. johndoe" },
    { label:"Repository Name", key:"repo",   placeholder:"e.g. ielts-practice" },
    { label:"Branch",          key:"branch", placeholder:"main" },
  ];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, backdropFilter:"blur(4px)" }} onClick={onClose}>
      <div style={{ background:"#1a1510", border:"1px solid #3a3020", borderRadius:20, padding:32, width:420, maxWidth:"90vw", boxShadow:"0 20px 60px rgba(0,0,0,0.7)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, color:"#C8A96E", marginBottom:6 }}>Repository Settings</div>
        <div style={{ fontSize:12, color:"#5a4a35", fontFamily:"'DM Mono', monospace", marginBottom:24 }}>Connect your GitHub image repository</div>
        {fields.map(({ label, key, placeholder }) => (
          <div key={key} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:"#8a7a65", fontFamily:"'DM Mono', monospace", marginBottom:6, letterSpacing:1, textTransform:"uppercase" }}>{label}</div>
            <input value={local[key]} onChange={e=>setLocal({...local,[key]:e.target.value})} placeholder={placeholder}
              style={{ width:"100%", boxSizing:"border-box", background:"#100e0a", border:"1px solid #3a3020", borderRadius:8, padding:"10px 14px", color:"#e8d8b8", fontSize:14, fontFamily:"'DM Mono', monospace", outline:"none" }} />
          </div>
        ))}
        <div style={{ fontSize:11, color:"#3a3020", fontFamily:"'DM Mono', monospace", marginBottom:20, lineHeight:1.8, background:"#100e0a", borderRadius:8, padding:12 }}>
          raw.githubusercontent.com/<span style={{ color:"#C8A96E" }}>{local.user||"user"}</span>/<span style={{ color:"#C8A96E" }}>{local.repo||"repo"}</span>/<span style={{ color:"#C8A96E" }}>{local.branch||"main"}</span>/reading/test1-part2.png
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"12px 0", borderRadius:10, border:"1px solid #3a3020", background:"transparent", color:"#5a4a35", cursor:"pointer", fontSize:13, fontFamily:"'DM Mono', monospace" }}>Cancel</button>
          <button onClick={()=>{ onChange(local); onClose(); }} style={{ flex:2, padding:"12px 0", borderRadius:10, border:"none", background:"#C8A96E", color:"#1a1510", cursor:"pointer", fontSize:13, fontFamily:"'DM Mono', monospace", fontWeight:700 }}>Save & Reload</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function IELTSPractice() {
  const [config,        setConfig]        = useState<Config>({ user:DEFAULT_USER, repo:DEFAULT_REPO, branch:DEFAULT_BRANCH });
  const [showConfig,    setShowConfig]    = useState<boolean>(false);
  const [session,       setSession]       = useState<Session|null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("reading");
  const [currentIndex,  setCurrentIndex]  = useState<number>(0);
  const [showKey,       setShowKey]       = useState<boolean>(false);
  const [imgError,      setImgError]      = useState<boolean>(false);
  // annotations keyed by part id
  const [annotationMap, setAnnotationMap] = useState<Record<string, Annotation[]>>({});

  const startSession = useCallback((cfg: Config): void => {
    setSession(buildSession(cfg.user, cfg.repo, cfg.branch));
    setActiveSection("reading");
    setCurrentIndex(0);
    setShowKey(false);
    setImgError(false);
    setAnnotationMap({});
  }, []);

  useEffect(() => { startSession(config); }, [config, startSession]);

  const currentParts: Part[]        = session?.[activeSection] ?? [];
  const currentItem: Part|undefined = currentParts[currentIndex];
  const partId = currentItem?.id ?? "";
  const annotations: Annotation[]   = annotationMap[partId] ?? [];

  const addAnnotation = (ann: Annotation) => {
    setAnnotationMap(prev => ({ ...prev, [partId]: [...(prev[partId]??[]), ann] }));
  };
  const undoAnnotation = () => {
    setAnnotationMap(prev => { const arr=[...(prev[partId]??[])]; arr.pop(); return {...prev,[partId]:arr}; });
  };
  const clearAnnotations = () => {
    setAnnotationMap(prev => ({ ...prev, [partId]: [] }));
  };

  const isFirst   = activeSection==="reading"   && currentIndex===0;
  const isLast    = activeSection==="listening" && currentIndex===LISTENING_PARTS.length-1;
  const totalDone = (activeSection==="reading"?0:READING_PARTS.length)+currentIndex;
  const totalParts = READING_PARTS.length+LISTENING_PARTS.length;

  // Count total annotations across all parts for badge
  const totalAnnotations = Object.values(annotationMap).reduce((s,a)=>s+a.length,0);

  const goNext = (): void => {
    setShowKey(false); setImgError(false);
    if (activeSection==="reading" && currentIndex<READING_PARTS.length-1) setCurrentIndex(currentIndex+1);
    else if (activeSection==="reading") { setActiveSection("listening"); setCurrentIndex(0); }
    else if (currentIndex<LISTENING_PARTS.length-1) setCurrentIndex(currentIndex+1);
  };
  const goPrev = (): void => {
    setShowKey(false); setImgError(false);
    if (activeSection==="listening" && currentIndex>0) setCurrentIndex(currentIndex-1);
    else if (activeSection==="listening") { setActiveSection("reading"); setCurrentIndex(READING_PARTS.length-1); }
    else if (currentIndex>0) setCurrentIndex(currentIndex-1);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0d0b08", color:"#e8d8b8", fontFamily:"'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500&family=DM+Mono&display=swap" rel="stylesheet" />

      {showConfig && <ConfigPanel config={config} onChange={c=>{setConfig(c);startSession(c);}} onClose={()=>setShowConfig(false)} />}

      {/* Header */}
      <div style={{ borderBottom:"1px solid #2a2318", padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#100e0a", position:"sticky", top:0, zIndex:10 }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display', serif", fontSize:20, color:"#C8A96E", lineHeight:1 }}>IELTS Practice</div>
          <div style={{ fontSize:11, color:"#5a4a35", fontFamily:"'DM Mono', monospace", marginTop:2, letterSpacing:1 }}>
            {session ? `RANDOM SESSION · ${totalParts} PARTS` : "RANDOM SESSION TRAINER"}
            {totalAnnotations>0 && <span style={{ marginLeft:8, color:"#C8A96E" }}>· ✏️ {totalAnnotations} notes</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>startSession(config)} style={btnStyle("#3a3020","#8a7a65")}>↺ New Session</button>
          <button onClick={()=>setShowConfig(true)}  style={btnStyle("#3a3020","#8a7a65")}>⚙ Settings</button>
        </div>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"24px 16px" }}>

        {/* Section tabs */}
        {session && (
          <div style={{ display:"flex", gap:0, marginBottom:24, background:"#100e0a", borderRadius:12, border:"1px solid #2a2318", padding:4 }}>
            {([["reading","📖 Reading",READING_PARTS.length],["listening","🎧 Listening",LISTENING_PARTS.length]] as const).map(([key,label,count])=>(
              <button key={key} onClick={()=>{ setActiveSection(key); setCurrentIndex(0); setShowKey(false); setImgError(false); }} style={{
                flex:1, padding:"10px 0", borderRadius:9, border:"none",
                background:activeSection===key?"#C8A96E":"transparent",
                color:activeSection===key?"#1a1510":"#5a4a35",
                cursor:"pointer", fontSize:13, fontWeight:500,
                fontFamily:"'DM Mono', monospace", letterSpacing:1, textTransform:"uppercase", transition:"all 0.2s",
              }}>{label} <span style={{ opacity:0.6 }}>({count})</span></button>
            ))}
          </div>
        )}

        {/* Progress */}
        {session && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
            <ProgressDots total={currentParts.length} current={currentIndex} />
            <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, color:"#5a4a35" }}>
              {currentIndex+1} / {currentParts.length} · overall {totalDone+1} / {totalParts}
            </div>
          </div>
        )}

        {/* Main */}
        {!session ? (
          <div style={{ textAlign:"center", padding:"80px 24px", border:"1px dashed #2a2318", borderRadius:20 }}>
            <div style={{ fontFamily:"'Playfair Display', serif", fontSize:32, color:"#C8A96E", marginBottom:12 }}>Ready to Practice?</div>
            <div style={{ color:"#5a4a35", fontSize:14, marginBottom:32, lineHeight:1.7 }}>Configure your GitHub repository first,<br/>then start a random session.</div>
            <button onClick={()=>setShowConfig(true)} style={{ background:"#C8A96E", border:"none", borderRadius:12, padding:"14px 32px", color:"#1a1510", fontSize:14, fontWeight:700, fontFamily:"'DM Mono', monospace", cursor:"pointer", letterSpacing:1 }}>⚙ Configure Repository</button>
          </div>
        ) : currentItem ? (
          <>
            <ImageCard
              item={currentItem} showKey={showKey}
              onToggleKey={()=>setShowKey(!showKey)}
              onImageError={()=>setImgError(true)} imgError={imgError}
              annotations={annotations}
              onAddAnnotation={addAnnotation}
              onUndo={undoAnnotation}
              onClear={clearAnnotations}
            />

            {/* Navigation */}
            <div style={{ display:"flex", gap:12, marginTop:20 }}>
              <button onClick={goPrev} disabled={isFirst} style={{ flex:1, padding:"14px 0", borderRadius:12, border:"1px solid #3a3020", background:isFirst?"transparent":"#1a1510", color:isFirst?"#2a2318":"#8a7a65", cursor:isFirst?"not-allowed":"pointer", fontSize:14, fontFamily:"'DM Mono', monospace", transition:"all 0.2s" }}>← Previous</button>
              {isLast
                ? <button onClick={()=>startSession(config)} style={{ flex:2, padding:"14px 0", borderRadius:12, border:"none", background:"#C8A96E", color:"#1a1510", cursor:"pointer", fontSize:14, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>↺ New Session</button>
                : <button onClick={goNext}                   style={{ flex:2, padding:"14px 0", borderRadius:12, border:"none", background:"#C8A96E", color:"#1a1510", cursor:"pointer", fontSize:14, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>Next →</button>
              }
            </div>

            {/* Part chips */}
            <div style={{ marginTop:24, display:"grid", gridTemplateColumns:`repeat(${currentParts.length},1fr)`, gap:8 }}>
              {currentParts.map((part,i) => {
                const hasNotes = (annotationMap[part.id]?.length??0) > 0;
                return (
                  <button key={part.id} onClick={()=>{ setCurrentIndex(i); setShowKey(false); setImgError(false); }} style={{
                    padding:"10px 6px", borderRadius:8,
                    border:"1px solid "+(i===currentIndex?"#C8A96E":"#2a2318"),
                    background:i===currentIndex?"#C8A96E11":"transparent",
                    color:i===currentIndex?"#C8A96E":"#3a3020",
                    cursor:"pointer", fontFamily:"'DM Mono', monospace", transition:"all 0.2s",
                    display:"flex", flexDirection:"column", alignItems:"center", gap:4, position:"relative",
                  }}>
                    <span style={{ fontSize:11, opacity:0.6 }}>T{part.test}</span>
                    <span style={{ fontSize:13, fontWeight:i===currentIndex?700:400 }}>P{part.part}</span>
                    {hasNotes && <span style={{ position:"absolute", top:4, right:6, fontSize:9, color:"#C8A96E" }}>✏️</span>}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
