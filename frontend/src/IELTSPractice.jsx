import { useState, useEffect, useCallback } from "react";

const DEFAULT_USER = "trieu-dev";
const DEFAULT_REPO = "ielts-practice";
const DEFAULT_BRANCH = "main";

function buildManifest(user, repo, branch) {
  const base = `https://raw.githubusercontent.com/${user}/${repo}/${branch}`;
  const sections = ["reading", "listening"];
  const manifest = { reading: [], listening: [] };
  sections.forEach((sec) => {
    for (let t = 1; t <= 8; t++) {
      for (let p = 1; p <= 5; p++) {
        manifest[sec].push({
          id: `${sec[0]}${t}p${p}`,
          test: t,
          part: p,
          url: `${base}/${sec}/test${t}-part${p}.png`,
          answerKey: `${base}/${sec}/test${t}-part${p}-key.png`,
        });
      }
    }
  });
  return manifest;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ProgressDots({ total, current }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: i === current ? "#C8A96E" : i < current ? "#5a4a35" : "#2a2318",
            transition: "all 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

function ImageCard({ item, showKey, onToggleKey, onImageError, imgError }) {
  const [keyError, setKeyError] = useState(false);

  return (
    <div
      style={{
        background: "#1a1510",
        border: "1px solid #3a3020",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      }}
    >
      {/* Image header */}
      <div
        style={{
          padding: "14px 20px",
          background: "#201a12",
          borderBottom: "1px solid #3a3020",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "#C8A96E22",
              border: "1px solid #C8A96E55",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 11,
              color: "#C8A96E",
              fontFamily: "'DM Mono', monospace",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Test {item.test}
          </div>
          <div
            style={{
              background: "#ffffff11",
              borderRadius: 6,
              padding: "3px 10px",
              fontSize: 11,
              color: "#8a7a65",
              fontFamily: "'DM Mono', monospace",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Part {item.part}
          </div>
        </div>
        <button
          onClick={onToggleKey}
          style={{
            background: showKey ? "#C8A96E" : "transparent",
            border: "1px solid " + (showKey ? "#C8A96E" : "#5a4a35"),
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            color: showKey ? "#1a1510" : "#C8A96E",
            cursor: "pointer",
            fontFamily: "'DM Mono', monospace",
            letterSpacing: 0.5,
            transition: "all 0.2s",
            fontWeight: showKey ? 700 : 400,
          }}
        >
          {showKey ? "◀ Question" : "Answer Key ▶"}
        </button>
      </div>

      {/* Image area */}
      <div
        style={{
          minHeight: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#100e0a",
        }}
      >
        {!showKey ? (
          imgError ? (
            <div style={{ textAlign: "center", color: "#5a4a35" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🖼</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                Image not found
              </div>
              <div style={{ fontSize: 11, marginTop: 6, color: "#3a3020", maxWidth: 280, lineHeight: 1.6 }}>
                {item.url}
              </div>
            </div>
          ) : (
            <img
              src={item.url}
              alt={`Test ${item.test} Part ${item.part}`}
              onError={onImageError}
              style={{
                maxWidth: "100%",
                maxHeight: 600,
                borderRadius: 8,
                objectFit: "contain",
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }}
            />
          )
        ) : keyError ? (
          <div style={{ textAlign: "center", color: "#5a4a35" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔑</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#8a7a65" }}>
              No answer key image found
            </div>
            <div style={{ fontSize: 11, marginTop: 6, color: "#3a3020", maxWidth: 280, lineHeight: 1.6 }}>
              Expected: test{item.test}-part{item.part}-key.png
            </div>
          </div>
        ) : (
          <img
            src={item.answerKey}
            alt={`Answer Key Test ${item.test} Part ${item.part}`}
            onError={() => setKeyError(true)}
            style={{
              maxWidth: "100%",
              maxHeight: 600,
              borderRadius: 8,
              objectFit: "contain",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            }}
          />
        )}
      </div>
    </div>
  );
}

function ConfigPanel({ config, onChange, onClose }) {
  const [local, setLocal] = useState(config);
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1510", border: "1px solid #3a3020",
          borderRadius: 20, padding: 32, width: 420, maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#C8A96E", marginBottom: 6 }}>
          Repository Settings
        </div>
        <div style={{ fontSize: 12, color: "#5a4a35", fontFamily: "'DM Mono', monospace", marginBottom: 24 }}>
          Connect your GitHub image repository
        </div>

        {[
          { label: "GitHub Username", key: "user", placeholder: "e.g. johndoe" },
          { label: "Repository Name", key: "repo", placeholder: "e.g. ielts-practice" },
          { label: "Branch", key: "branch", placeholder: "main" },
        ].map(({ label, key, placeholder }) => (
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
                fontFamily: "'DM Mono', monospace",
                outline: "none",
              }}
            />
          </div>
        ))}

        <div style={{ fontSize: 11, color: "#3a3020", fontFamily: "'DM Mono', monospace", marginBottom: 20, lineHeight: 1.8, background: "#100e0a", borderRadius: 8, padding: 12 }}>
          raw.githubusercontent.com/<span style={{ color: "#C8A96E" }}>{local.user || "user"}</span>/
          <span style={{ color: "#C8A96E" }}>{local.repo || "repo"}</span>/
          <span style={{ color: "#C8A96E" }}>{local.branch || "main"}</span>/reading/test1-part1.png
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10,
              border: "1px solid #3a3020", background: "transparent",
              color: "#5a4a35", cursor: "pointer", fontSize: 13,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onChange(local); onClose(); }}
            style={{
              flex: 2, padding: "12px 0", borderRadius: 10,
              border: "none", background: "#C8A96E",
              color: "#1a1510", cursor: "pointer", fontSize: 13,
              fontFamily: "'DM Mono', monospace", fontWeight: 700,
            }}
          >
            Save & Reload
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IELTSPractice() {
  const [config, setConfig] = useState({ user: DEFAULT_USER, repo: DEFAULT_REPO, branch: DEFAULT_BRANCH });
  const [showConfig, setShowConfig] = useState(DEFAULT_USER === "YOUR_USERNAME");
  const [session, setSession] = useState(null); // { reading: [], listening: [] }
  const [activeSection, setActiveSection] = useState("reading"); // "reading" | "listening"
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const [imgError, setImgError] = useState(false);

  const startSession = useCallback((cfg) => {
    const manifest = buildManifest(cfg.user, cfg.repo, cfg.branch);
    setSession({
      reading: shuffle(manifest.reading).slice(0, 5),
      listening: shuffle(manifest.listening).slice(0, 5),
    });
    setActiveSection("reading");
    setCurrentIndex(0);
    setShowKey(false);
    setImgError(false);
  }, []);

  useEffect(() => {
    if (config.user !== "YOUR_USERNAME") startSession(config);
  }, [config, startSession]);

  const currentItem = session?.[activeSection]?.[currentIndex];

  const goNext = () => {
    setShowKey(false);
    setImgError(false);
    if (currentIndex < 4) {
      setCurrentIndex(currentIndex + 1);
    } else if (activeSection === "reading") {
      setActiveSection("listening");
      setCurrentIndex(0);
    }
  };

  const goPrev = () => {
    setShowKey(false);
    setImgError(false);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else if (activeSection === "listening") {
      setActiveSection("reading");
      setCurrentIndex(4);
    }
  };

  const isFirst = activeSection === "reading" && currentIndex === 0;
  const isLast = activeSection === "listening" && currentIndex === 4;
  const totalDone = (activeSection === "reading" ? 0 : 5) + currentIndex;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0b08",
      color: "#e8d8b8",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Sans:wght@300;400;500&family=DM+Mono&display=swap" rel="stylesheet" />

      {showConfig && (
        <ConfigPanel
          config={config}
          onChange={(c) => { setConfig(c); startSession(c); }}
          onClose={() => setShowConfig(false)}
        />
      )}

      {/* Header */}
      <div style={{
        borderBottom: "1px solid #2a2318",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#100e0a",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#C8A96E", lineHeight: 1 }}>
            IELTS Practice
          </div>
          <div style={{ fontSize: 11, color: "#5a4a35", fontFamily: "'DM Mono', monospace", marginTop: 2, letterSpacing: 1 }}>
            RANDOM SESSION TRAINER
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => startSession(config)}
            style={{
              background: "transparent", border: "1px solid #3a3020",
              borderRadius: 8, padding: "8px 16px",
              color: "#8a7a65", cursor: "pointer", fontSize: 12,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            ↺ New Session
          </button>
          <button
            onClick={() => setShowConfig(true)}
            style={{
              background: "transparent", border: "1px solid #3a3020",
              borderRadius: 8, padding: "8px 16px",
              color: "#8a7a65", cursor: "pointer", fontSize: 12,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            ⚙ Settings
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>

        {/* Section tabs */}
        {session && (
          <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "#100e0a", borderRadius: 12, border: "1px solid #2a2318", padding: 4 }}>
            {["reading", "listening"].map((sec) => (
              <button
                key={sec}
                onClick={() => { setActiveSection(sec); setCurrentIndex(0); setShowKey(false); setImgError(false); }}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 9,
                  border: "none",
                  background: activeSection === sec ? "#C8A96E" : "transparent",
                  color: activeSection === sec ? "#1a1510" : "#5a4a35",
                  cursor: "pointer", fontSize: 13, fontWeight: 500,
                  fontFamily: "'DM Mono', monospace", letterSpacing: 1,
                  textTransform: "uppercase", transition: "all 0.2s",
                }}
              >
                {sec === "reading" ? "📖 Reading" : "🎧 Listening"}
              </button>
            ))}
          </div>
        )}

        {/* Progress */}
        {session && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <ProgressDots total={5} current={currentIndex} />
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#5a4a35" }}>
              {currentIndex + 1} / 5 &nbsp;·&nbsp; overall {totalDone + 1} / 10
            </div>
          </div>
        )}

        {/* Main content */}
        {!session ? (
          <div style={{
            textAlign: "center", padding: "80px 24px",
            border: "1px dashed #2a2318", borderRadius: 20,
          }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: "#C8A96E", marginBottom: 12 }}>
              Ready to Practice?
            </div>
            <div style={{ color: "#5a4a35", fontSize: 14, marginBottom: 32, lineHeight: 1.7 }}>
              Configure your GitHub repository first,<br />then start a random session.
            </div>
            <button
              onClick={() => setShowConfig(true)}
              style={{
                background: "#C8A96E", border: "none",
                borderRadius: 12, padding: "14px 32px",
                color: "#1a1510", fontSize: 14, fontWeight: 700,
                fontFamily: "'DM Mono', monospace", cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              ⚙ Configure Repository
            </button>
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
              <button
                onClick={goPrev}
                disabled={isFirst}
                style={{
                  flex: 1, padding: "14px 0", borderRadius: 12,
                  border: "1px solid #3a3020",
                  background: isFirst ? "transparent" : "#1a1510",
                  color: isFirst ? "#2a2318" : "#8a7a65",
                  cursor: isFirst ? "not-allowed" : "pointer",
                  fontSize: 14, fontFamily: "'DM Mono', monospace",
                  transition: "all 0.2s",
                }}
              >
                ← Previous
              </button>

              {isLast ? (
                <button
                  onClick={() => startSession(config)}
                  style={{
                    flex: 2, padding: "14px 0", borderRadius: 12,
                    border: "none", background: "#C8A96E",
                    color: "#1a1510", cursor: "pointer",
                    fontSize: 14, fontWeight: 700,
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  ↺ New Session
                </button>
              ) : (
                <button
                  onClick={goNext}
                  style={{
                    flex: 2, padding: "14px 0", borderRadius: 12,
                    border: "none", background: "#C8A96E",
                    color: "#1a1510", cursor: "pointer",
                    fontSize: 14, fontWeight: 700,
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  Next →
                </button>
              )}
            </div>

            {/* Part list sidebar hint */}
            <div style={{
              marginTop: 24,
              display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8,
            }}>
              {session[activeSection].map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => { setCurrentIndex(i); setShowKey(false); setImgError(false); }}
                  style={{
                    padding: "8px 4px", borderRadius: 8,
                    border: "1px solid " + (i === currentIndex ? "#C8A96E" : "#2a2318"),
                    background: i === currentIndex ? "#C8A96E11" : "transparent",
                    color: i === currentIndex ? "#C8A96E" : "#3a3020",
                    cursor: "pointer", fontSize: 11,
                    fontFamily: "'DM Mono', monospace",
                    transition: "all 0.2s",
                  }}
                >
                  T{item.test}·P{item.part}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
