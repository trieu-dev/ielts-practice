import { useState, useEffect, useCallback, CSSProperties, WheelEvent, MouseEvent, TouchEvent } from "react";

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_USER   = "trieu-dev";
const DEFAULT_REPO   = "ielts-practice";
const DEFAULT_BRANCH = "main";

const READING_PARTS   = [2, 3, 5, 6, 8] as const;  // Section 1 – 5 parts
const LISTENING_PARTS = [1, 2, 3, 4]    as const;   // Section 2 – 4 parts
const TOTAL_TESTS     = 8;
const STORAGE_KEY     = "ielts_used_tests";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Config {
  user:   string;
  repo:   string;
  branch: string;
}

interface Part {
  id:        string;
  test:      number;
  part:      number;
  url:       string;
  answerKey: string;
}

interface Session {
  reading:   Part[];
  listening: Part[];
}

type SectionKey = "reading" | "listening";

interface ConfigField {
  label:       string;
  key:         keyof Config;
  placeholder: string;
}

// ── Combination tracking (localStorage) ───────────────────────────────────────
function loadUsed(): number[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as number[]; }
  catch { return []; }
}

function saveUsed(used: number[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(used));
}

/** Returns a test number that hasn't been used yet. Resets when all 8 are done. */
function pickNextTest(): number {
  const all  = Array.from({ length: TOTAL_TESTS }, (_, i) => i + 1);
  let used   = loadUsed();

  const remaining = all.filter((t) => !used.includes(t));

  if (remaining.length === 0) {
    saveUsed([]);
    return pickNextTest();
  }

  const picked = remaining[Math.floor(Math.random() * remaining.length)];
  saveUsed([...used, picked]);
  return picked;
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

  const testsForReading   = shuffle(Array.from({ length: TOTAL_TESTS }, (_, i) => i + 1));
  const testsForListening = shuffle(Array.from({ length: TOTAL_TESTS }, (_, i) => i + 1));

  const reading: Part[] = READING_PARTS.map((p, i) => {
    const t = testsForReading[i];
    return {
      id:        `r-t${t}-p${p}`,
      test:      t,
      part:      p,
      url:       `${base}/reading/test${t}-part${p}.png`,
      answerKey: `${base}/reading/test${t}-part${p}-key.png`,
    };
  });

  const listening: Part[] = LISTENING_PARTS.map((p, i) => {
    const t = testsForListening[i];
    return {
      id:        `l-t${t}-p${p}`,
      test:      t,
      part:      p,
      url:       `${base}/listening/test${t}-part${p}.png`,
      answerKey: `${base}/listening/test${t}-part${p}-key.png`,
    };
  });

  return { reading, listening };
}

// ── Sub-components ────────────────────────────────────────────────────────────
interface ProgressDotsProps {
  total:   number;
  current: number;
}

function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width:        i === current ? 24 : 8,
          height:       8,
          borderRadius: 4,
          background:   i === current ? "#C8A96E" : i < current ? "#5a4a35" : "#2a2318",
          transition:   "all 0.3s ease",
        }} />
      ))}
    </div>
  );
}

interface ImageCardProps {
  item:          Part;
  showKey:       boolean;
  onToggleKey:   () => void;
  onImageError:  () => void;
  imgError:      boolean;
}

function ImageCard({ item, showKey, onToggleKey, onImageError, imgError }: ImageCardProps) {
  const [keyError,  setKeyError]  = useState<boolean>(false);
  const [zoom,      setZoom]      = useState<number>(1);
  const [offset,    setOffset]    = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging,  setDragging]  = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [lastDist,  setLastDist]  = useState<number | null>(null);

  const resetZoom = (): void => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const zoomIn    = (): void => setZoom((z) => Math.min(z + 0.25, 4));
  const zoomOut   = (): void => setZoom((z) => {
    const n = Math.max(z - 0.25, 1);
    if (n === 1) setOffset({ x: 0, y: 0 });
    return n;
  });

  const onWheel = (e: WheelEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  const onMouseDown = (e: MouseEvent<HTMLDivElement>): void => {
    if (zoom <= 1) return;
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const onMouseMove = (e: MouseEvent<HTMLDivElement>): void => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const onMouseUp = (): void => setDragging(false);

  const onTouchStart = (e: TouchEvent<HTMLDivElement>): void => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setLastDist(Math.hypot(dx, dy));
    }
  };

  const onTouchMove = (e: TouchEvent<HTMLDivElement>): void => {
    if (e.touches.length === 2) {
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist !== null) {
        const delta = dist - lastDist;
        setZoom((z) => Math.min(Math.max(z + delta * 0.01, 1), 4));
      }
      setLastDist(dist);
    }
  };

  const imgStyle: CSSProperties = {
    maxWidth:        "100%",
    maxHeight:       600,
    borderRadius:    8,
    objectFit:       "contain",
    boxShadow:       "0 4px 20px rgba(0,0,0,0.4)",
    transform:       `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
    transformOrigin: "center center",
    transition:      dragging ? "none" : "transform 0.15s ease",
  };

  return (
    <div style={{
      background:   "#1a1510",
      border:       "1px solid #3a3020",
      borderRadius: 16,
      overflow:     "hidden",
      boxShadow:    "0 8px 40px rgba(0,0,0,0.5)",
    }}>
      {/* Card header */}
      <div style={{
        padding:        "14px 20px",
        background:     "#201a12",
        borderBottom:   "1px solid #3a3020",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Tag color="#C8A96E">Test {item.test}</Tag>
          <Tag color="#8a7a65">Part {item.part}</Tag>
        </div>
        <button onClick={onToggleKey} style={{
          background:  showKey ? "#C8A96E" : "transparent",
          border:      "1px solid " + (showKey ? "#C8A96E" : "#5a4a35"),
          borderRadius: 8,
          padding:     "6px 14px",
          fontSize:    12,
          color:       showKey ? "#1a1510" : "#C8A96E",
          cursor:      "pointer",
          fontFamily:  "'DM Mono', monospace",
          transition:  "all 0.2s",
          fontWeight:  showKey ? 700 : 400,
        }}>
          {showKey ? "◀ Question" : "Answer Key ▶"}
        </button>
      </div>

      {/* Zoom controls */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 20px", background: "#180f08",
        borderBottom: "1px solid #2a2318",
      }}>
        <button onClick={zoomOut} disabled={zoom <= 1} style={zoomBtnStyle(zoom <= 1)}>－</button>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 12,
          color: "#8a7a65", minWidth: 48, textAlign: "center",
        }}>{Math.round(zoom * 100)}%</div>
        <button onClick={zoomIn} disabled={zoom >= 4} style={zoomBtnStyle(zoom >= 4)}>＋</button>
        <button onClick={resetZoom} style={{
          marginLeft: 4, background: "transparent",
          border: "1px solid #3a3020", borderRadius: 6,
          padding: "4px 10px", color: "#5a4a35",
          cursor: "pointer", fontSize: 11,
          fontFamily: "'DM Mono', monospace",
        }}>Reset</button>
        {zoom > 1 && (
          <span style={{ fontSize: 11, color: "#3a3020", fontFamily: "'DM Mono', monospace", marginLeft: 4 }}>
            drag to pan
          </span>
        )}
      </div>

      {/* Image area */}
      <div
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => setLastDist(null)}
        style={{
          minHeight:      400,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          padding:        24,
          background:     "#100e0a",
          overflow:       "hidden",
          cursor:         zoom > 1 ? (dragging ? "grabbing" : "grab") : "default",
          userSelect:     "none",
        }}
      >
        {!showKey ? (
          imgError
            ? <ImageError url={item.url} icon="🖼" label="Image not found" />
            : <img src={item.url} alt={`Test ${item.test} Part ${item.part}`} onError={onImageError} style={imgStyle} />
        ) : (
          keyError
            ? <ImageError url={`test${item.test}-part${item.part}-key.png`} icon="🔑" label="No answer key image found" />
            : <img src={item.answerKey} alt={`Key Test ${item.test} Part ${item.part}`} onError={() => setKeyError(true)} style={imgStyle} />
        )}
      </div>
    </div>
  );
}

// ── Utility components ────────────────────────────────────────────────────────
function zoomBtnStyle(disabled: boolean): CSSProperties {
  return {
    background:   "transparent",
    border:       "1px solid " + (disabled ? "#2a2318" : "#3a3020"),
    borderRadius: 6,
    padding:      "4px 10px",
    color:        disabled ? "#2a2318" : "#C8A96E",
    cursor:       disabled ? "not-allowed" : "pointer",
    fontSize:     16,
    fontFamily:   "'DM Mono', monospace",
    transition:   "all 0.2s",
  };
}

function btnStyle(border: string, color: string): CSSProperties {
  return {
    background:   "transparent",
    border:       `1px solid ${border}`,
    borderRadius: 8,
    padding:      "8px 16px",
    color,
    cursor:       "pointer",
    fontSize:     12,
    fontFamily:   "'DM Mono', monospace",
  };
}

interface TagProps {
  color:    string;
  children: React.ReactNode;
}

function Tag({ color, children }: TagProps) {
  return (
    <div style={{
      background:    color + "22",
      border:        "1px solid " + color + "55",
      borderRadius:  6,
      padding:       "3px 10px",
      fontSize:      11,
      color,
      fontFamily:    "'DM Mono', monospace",
      letterSpacing: 1,
      textTransform: "uppercase",
    }}>{children}</div>
  );
}

interface ImageErrorProps {
  icon:  string;
  label: string;
  url:   string;
}

function ImageError({ icon, label, url }: ImageErrorProps) {
  return (
    <div style={{ textAlign: "center", color: "#5a4a35" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 11, marginTop: 6, color: "#3a3020", maxWidth: 280, lineHeight: 1.6 }}>{url}</div>
    </div>
  );
}

interface ConfigPanelProps {
  config:   Config;
  onChange: (c: Config) => void;
  onClose:  () => void;
}

function ConfigPanel({ config, onChange, onClose }: ConfigPanelProps) {
  const [local, setLocal] = useState<Config>(config);

  const fields: ConfigField[] = [
    { label: "GitHub Username", key: "user",   placeholder: "e.g. johndoe" },
    { label: "Repository Name", key: "repo",   placeholder: "e.g. ielts-practice" },
    { label: "Branch",          key: "branch", placeholder: "main" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, backdropFilter: "blur(4px)",
    }} onClick={onClose}>
      <div style={{
        background: "#1a1510", border: "1px solid #3a3020",
        borderRadius: 20, padding: 32, width: 420, maxWidth: "90vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#C8A96E", marginBottom: 6 }}>
          Repository Settings
        </div>
        <div style={{ fontSize: 12, color: "#5a4a35", fontFamily: "'DM Mono', monospace", marginBottom: 24 }}>
          Connect your GitHub image repository
        </div>

        {fields.map(({ label, key, placeholder }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#8a7a65", fontFamily: "'DM Mono', monospace", marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>
              {label}
            </div>
            <input
              value={local[key]}
              onChange={(e) => setLocal({ ...local, [key]: e.target.value })}
              placeholder={placeholder}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#100e0a", border: "1px solid #3a3020",
                borderRadius: 8, padding: "10px 14px",
                color: "#e8d8b8", fontSize: 14,
                fontFamily: "'DM Mono', monospace", outline: "none",
              }}
            />
          </div>
        ))}

        <div style={{ fontSize: 11, color: "#3a3020", fontFamily: "'DM Mono', monospace", marginBottom: 20, lineHeight: 1.8, background: "#100e0a", borderRadius: 8, padding: 12 }}>
          raw.githubusercontent.com/<span style={{ color: "#C8A96E" }}>{local.user || "user"}</span>/
          <span style={{ color: "#C8A96E" }}>{local.repo || "repo"}</span>/
          <span style={{ color: "#C8A96E" }}>{local.branch || "main"}</span>/reading/test1-part2.png
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px 0", borderRadius: 10,
            border: "1px solid #3a3020", background: "transparent",
            color: "#5a4a35", cursor: "pointer", fontSize: 13,
            fontFamily: "'DM Mono', monospace",
          }}>Cancel</button>
          <button onClick={() => { onChange(local); onClose(); }} style={{
            flex: 2, padding: "12px 0", borderRadius: 10,
            border: "none", background: "#C8A96E",
            color: "#1a1510", cursor: "pointer", fontSize: 13,
            fontFamily: "'DM Mono', monospace", fontWeight: 700,
          }}>Save & Reload</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function IELTSPractice() {
  const [config,        setConfig]        = useState<Config>({ user: DEFAULT_USER, repo: DEFAULT_REPO, branch: DEFAULT_BRANCH });
  const [showConfig,    setShowConfig]    = useState<boolean>(false);
  const [session,       setSession]       = useState<Session | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("reading");
  const [currentIndex,  setCurrentIndex]  = useState<number>(0);
  const [showKey,       setShowKey]       = useState<boolean>(false);
  const [imgError,      setImgError]      = useState<boolean>(false);
  const [usedCount,     setUsedCount]     = useState<number>(() => loadUsed().length);

  const startSession = useCallback((cfg: Config): void => {
    setSession(buildSession(cfg.user, cfg.repo, cfg.branch));
    setActiveSection("reading");
    setCurrentIndex(0);
    setShowKey(false);
    setImgError(false);
    setUsedCount(loadUsed().length);
  }, []);

  useEffect(() => {
    startSession(config);
  }, [config, startSession]);

  const resetHistory = (): void => {
    saveUsed([]);
    setUsedCount(0);
    startSession(config);
  };

  const currentParts: Part[] = session?.[activeSection] ?? [];
  const currentItem: Part | undefined = currentParts[currentIndex];
  const isFirst   = activeSection === "reading"   && currentIndex === 0;
  const isLast    = activeSection === "listening" && currentIndex === LISTENING_PARTS.length - 1;
  const totalDone = (activeSection === "reading" ? 0 : READING_PARTS.length) + currentIndex;
  const totalParts = READING_PARTS.length + LISTENING_PARTS.length;

  const goNext = (): void => {
    setShowKey(false); setImgError(false);
    if (activeSection === "reading" && currentIndex < READING_PARTS.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (activeSection === "reading") {
      setActiveSection("listening"); setCurrentIndex(0);
    } else if (currentIndex < LISTENING_PARTS.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goPrev = (): void => {
    setShowKey(false); setImgError(false);
    if (activeSection === "listening" && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (activeSection === "listening") {
      setActiveSection("reading"); setCurrentIndex(READING_PARTS.length - 1);
    } else if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const sections: { key: SectionKey; label: string; count: number }[] = [
    { key: "reading",   label: "📖 Reading",   count: READING_PARTS.length },
    { key: "listening", label: "🎧 Listening", count: LISTENING_PARTS.length },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0d0b08", color: "#e8d8b8", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500&family=DM+Mono&display=swap" rel="stylesheet" />

      {showConfig && (
        <ConfigPanel
          config={config}
          onChange={(c) => { setConfig(c); startSession(c); }}
          onClose={() => setShowConfig(false)}
        />
      )}

      {/* ── Header ── */}
      <div style={{
        borderBottom: "1px solid #2a2318", padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#100e0a", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#C8A96E", lineHeight: 1 }}>
            IELTS Practice
          </div>
          <div style={{ fontSize: 11, color: "#5a4a35", fontFamily: "'DM Mono', monospace", marginTop: 2, letterSpacing: 1 }}>
            {session
              ? `RANDOM SESSION · ${READING_PARTS.length + LISTENING_PARTS.length} PARTS`
              : "RANDOM SESSION TRAINER"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={resetHistory}             style={btnStyle("#3a3020", "#8a7a65")}>⟳ Reset History</button>
          <button onClick={() => startSession(config)} style={btnStyle("#3a3020", "#8a7a65")}>↺ New Session</button>
          <button onClick={() => setShowConfig(true)} style={btnStyle("#3a3020", "#8a7a65")}>⚙ Settings</button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── Section tabs ── */}
        {session && (
          <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "#100e0a", borderRadius: 12, border: "1px solid #2a2318", padding: 4 }}>
            {sections.map(({ key, label, count }) => (
              <button key={key}
                onClick={() => { setActiveSection(key); setCurrentIndex(0); setShowKey(false); setImgError(false); }}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 9, border: "none",
                  background: activeSection === key ? "#C8A96E" : "transparent",
                  color:      activeSection === key ? "#1a1510" : "#5a4a35",
                  cursor: "pointer", fontSize: 13, fontWeight: 500,
                  fontFamily: "'DM Mono', monospace", letterSpacing: 1,
                  textTransform: "uppercase", transition: "all 0.2s",
                }}>
                {label} <span style={{ opacity: 0.6 }}>({count})</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Progress dots ── */}
        {session && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <ProgressDots total={currentParts.length} current={currentIndex} />
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#5a4a35" }}>
              {currentIndex + 1} / {currentParts.length} · overall {totalDone + 1} / {totalParts}
            </div>
          </div>
        )}

        {/* ── Main content ── */}
        {!session ? (
          <div style={{ textAlign: "center", padding: "80px 24px", border: "1px dashed #2a2318", borderRadius: 20 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: "#C8A96E", marginBottom: 12 }}>
              Ready to Practice?
            </div>
            <div style={{ color: "#5a4a35", fontSize: 14, marginBottom: 32, lineHeight: 1.7 }}>
              Configure your GitHub repository first,<br />then start a random session.
            </div>
            <button onClick={() => setShowConfig(true)} style={{
              background: "#C8A96E", border: "none", borderRadius: 12,
              padding: "14px 32px", color: "#1a1510", fontSize: 14,
              fontWeight: 700, fontFamily: "'DM Mono', monospace",
              cursor: "pointer", letterSpacing: 1,
            }}>⚙ Configure Repository</button>
          </div>
        ) : currentItem ? (
          <>
            <ImageCard
              item={currentItem}
              showKey={showKey}
              onToggleKey={() => setShowKey(!showKey)}
              onImageError={() => setImgError(true)}
              imgError={imgError}
            />

            {/* Navigation */}
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button onClick={goPrev} disabled={isFirst} style={{
                flex: 1, padding: "14px 0", borderRadius: 12,
                border: "1px solid #3a3020",
                background: isFirst ? "transparent" : "#1a1510",
                color:      isFirst ? "#2a2318"     : "#8a7a65",
                cursor:     isFirst ? "not-allowed"  : "pointer",
                fontSize: 14, fontFamily: "'DM Mono', monospace", transition: "all 0.2s",
              }}>← Previous</button>

              {isLast ? (
                <button onClick={() => startSession(config)} style={{
                  flex: 2, padding: "14px 0", borderRadius: 12,
                  border: "none", background: "#C8A96E",
                  color: "#1a1510", cursor: "pointer",
                  fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                }}>↺ New Session</button>
              ) : (
                <button onClick={goNext} style={{
                  flex: 2, padding: "14px 0", borderRadius: 12,
                  border: "none", background: "#C8A96E",
                  color: "#1a1510", cursor: "pointer",
                  fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                }}>Next →</button>
              )}
            </div>

            {/* Part chips */}
            <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: `repeat(${currentParts.length}, 1fr)`, gap: 8 }}>
              {currentParts.map((part, i) => (
                <button key={part.id}
                  onClick={() => { setCurrentIndex(i); setShowKey(false); setImgError(false); }}
                  style={{
                    padding: "10px 6px", borderRadius: 8,
                    border:     "1px solid " + (i === currentIndex ? "#C8A96E" : "#2a2318"),
                    background: i === currentIndex ? "#C8A96E11" : "transparent",
                    color:      i === currentIndex ? "#C8A96E"   : "#3a3020",
                    cursor: "pointer",
                    fontFamily: "'DM Mono', monospace", transition: "all 0.2s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>T{part.test}</span>
                  <span style={{ fontSize: 13, fontWeight: i === currentIndex ? 700 : 400 }}>P{part.part}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
