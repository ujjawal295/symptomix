import { useState, useRef, useEffect } from "react";
import {
  FaHeartbeat, FaRobot, FaShieldAlt, FaNotesMedical,
  FaMicrophone, FaPaperPlane, FaExclamationTriangle,
  FaMapMarkerAlt, FaPhone, FaDirections, FaFilePdf,
  FaHistory, FaLanguage, FaTrash, FaTimes,
} from "react-icons/fa";
import { jsPDF } from "jspdf";
import "./App.css";

// ─── constants ────────────────────────────────────────────────────────────────
const TRIAGE_META = {
  red:   { label: "EMERGENCY",    sub: "Seek immediate care", color: "#ff4757", glow: "#ff475733" },
  amber: { label: "SEE A DOCTOR", sub: "Within 24–48 hours",  color: "#ffa502", glow: "#ffa50233" },
  green: { label: "MONITOR HOME", sub: "Rest & observe",      color: "#2ed573", glow: "#2ed57333" },
};

const QUICK_SYMPTOMS = [
  "I have a headache", "I have a fever", "I have a cough",
  "I have stomach pain", "I feel dizzy", "I have body aches",
  "I have a sore throat", "I feel nauseous",
];

// ─── helpers ──────────────────────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^\d+\.\s+/gm, "• ")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function saveSession(session) {
  try {
    const existing = JSON.parse(localStorage.getItem("triage_sessions") || "[]");
    existing.unshift(session);
    localStorage.setItem("triage_sessions", JSON.stringify(existing.slice(0, 20)));
  } catch (_) {}
}

function loadSessions() {
  try { return JSON.parse(localStorage.getItem("triage_sessions") || "[]"); }
  catch (_) { return []; }
}

function clearSessions() {
  localStorage.removeItem("triage_sessions");
}

// ─── PDF export ───────────────────────────────────────────────────────────────
function exportPDF(messages, triage, language) {
  const doc = new jsPDF();
  const now = new Date().toLocaleString();

  // header
  doc.setFontSize(20);
  doc.setTextColor(37, 99, 235);
  doc.text("Symptomix — Symptom Assessment Report", 20, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${now}`, 20, 30);
  doc.text("This report is NOT a medical diagnosis. Consult a doctor.", 20, 36);

  // divider
  doc.setDrawColor(226, 232, 240);
  doc.line(20, 40, 190, 40);

  // triage result
  if (triage) {
    const meta = TRIAGE_META[triage.triage_level] || TRIAGE_META.green;
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Triage Result", 20, 52);

    doc.setFontSize(12);
    if (triage.triage_level === "red")        doc.setTextColor(229, 57, 53);
    else if (triage.triage_level === "amber") doc.setTextColor(245, 124, 0);
    else                                       doc.setTextColor(46, 213, 115);
    doc.text(`${meta.label} — ${meta.sub}`, 20, 62);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.text(`Confidence: ${Math.round((triage.confidence || 0) * 100)}%`, 20, 72);

    if (triage.conditions?.length > 0) {
      doc.text(`Possible conditions: ${triage.conditions.join(", ")}`, 20, 82);
    }

    if (triage.advice) {
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      const lines = doc.splitTextToSize(`Advice: ${triage.advice}`, 170);
      doc.text(lines, 20, 94);
    }

    doc.line(20, 110, 190, 110);
  }

  // conversation
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text("Conversation History", 20, 120);

  let y = 132;
  messages.forEach((m) => {
    if (y > 270) { doc.addPage(); y = 20; }
    const prefix = m.type === "user" ? "You: " : "AI:  ";
    doc.setFontSize(9);
    if (m.type === "user") doc.setTextColor(37, 99, 235);
    else doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(prefix + m.text, 170);
    doc.text(lines, 20, y);
    y += lines.length * 5 + 4;
  });

  // footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("Symptomix • Not a substitute for professional medical advice • Emergency: Call 112", 20, 285);

  doc.save(`triage-report-${Date.now()}.pdf`);
}

// ─── ClinicFinder ─────────────────────────────────────────────────────────────
function ClinicFinder() {
  const [status,   setStatus]   = useState("idle");
  const [location, setLocation] = useState(null);
  const [mapSrc,   setMapSrc]   = useState("");

  const findClinics = () => {
    if (!navigator.geolocation) { setStatus("error"); return; }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        let city = "";
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          city = d.address?.city || d.address?.town || d.address?.village || "";
        } catch (_) {}
        setLocation({ lat, lng, city });
        const q = encodeURIComponent(`hospitals near ${lat},${lng}`);
        setMapSrc(`https://maps.google.com/maps?q=${q}&t=&z=14&ie=UTF8&iwloc=&output=embed`);
        setStatus("found");
      },
      () => setStatus("error")
    );
  };

  return (
    <div className="clinic-finder">
      <div className="cf-header">
        <div className="cf-header-icon"><FaMapMarkerAlt /></div>
        <div><div className="cf-title">Nearby Clinics & Hospitals</div><div className="cf-sub">Find emergency care close to you</div></div>
      </div>
      {status === "idle" && <button className="cf-locate-btn" onClick={findClinics}><FaMapMarkerAlt /> Locate Nearest Hospitals</button>}
      {status === "loading" && <div className="cf-loading"><div className="cf-spinner" /><span>Getting your location…</span></div>}
      {status === "error" && (
        <div className="cf-error">
          <p>Location access denied.</p>
          <a href="https://www.google.com/maps/search/hospitals+near+me" target="_blank" rel="noreferrer" className="cf-locate-btn" style={{textDecoration:"none"}}><FaMapMarkerAlt /> Search on Google Maps</a>
        </div>
      )}
      {status === "found" && location && (
        <>
          <div className="cf-location-tag"><FaMapMarkerAlt /><span>{location.city ? `Hospitals near ${location.city}` : `Near you`}</span></div>
          <div className="cf-map-wrap"><iframe title="Nearby Hospitals" src={mapSrc} className="cf-map" allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
          <div className="cf-actions">
            <button className="cf-action-btn cf-directions" onClick={() => window.open(`https://www.google.com/maps/search/hospitals+near+me/@${location.lat},${location.lng},14z`, "_blank")}><FaDirections /> Open in Google Maps</button>
            <a href="tel:112" className="cf-action-btn cf-call"><FaPhone /> Call 112</a>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TriageCard ───────────────────────────────────────────────────────────────
function TriageCard({ triage, onExport }) {
  const meta = TRIAGE_META[triage.triage_level] || TRIAGE_META.green;
  const pct  = Math.round((triage.confidence || 0) * 100);
  const needsClinics = triage.triage_level === "red" || triage.triage_level === "amber";
  return (
    <div className={`triage-card tc-${triage.triage_level}`} style={{ "--clr": meta.color, "--glow": meta.glow }}>
      <div className="tc-top">
        <div className="tc-pulse" />
        <span className="tc-label">{meta.label}</span>
        <span className="tc-sub">{meta.sub}</span>
        <span className="tc-pct" style={{ color: meta.color }}>{pct}%</span>
        {onExport && (
          <button className="tc-pdf-btn" onClick={onExport} title="Download PDF report">
            <FaFilePdf /> PDF
          </button>
        )}
      </div>
      <div className="tc-bar-track"><div className="tc-bar-fill" style={{ width: `${pct}%`, background: meta.color }} /></div>
      {triage.conditions?.length > 0 && (
        <div className="tc-chips">
          <span className="tc-chips-label">Possible:</span>
          {triage.conditions.map((c, i) => <span key={i} className="tc-chip">{c}</span>)}
        </div>
      )}
      {needsClinics && <ClinicFinder />}
    </div>
  );
}

// ─── GatheringBadge ───────────────────────────────────────────────────────────
function GatheringBadge({ step }) {
  const labels = ["", "Gathering symptoms…", "Clarifying details…", "Almost ready…"];
  return (
    <div className="gathering-badge">
      <div className="gathering-dots">
        {[1,2,3].map(i => <span key={i} className={`gdot ${step >= i ? "active" : ""}`} />)}
      </div>
      <span className="gathering-text">{labels[step] || "Gathering…"}</span>
    </div>
  );
}

// ─── ChatMessage ──────────────────────────────────────────────────────────────
function ChatMessage({ msg, onExport }) {
  const isUser = msg.type === "user";
  return (
    <div className={`msg-row ${isUser ? "msg-user" : "msg-ai"}`}>
      {!isUser && <div className="avatar ai-av"><FaRobot /></div>}
      <div className="msg-body">
        {!isUser && msg.isFollowUp && <GatheringBadge step={msg.step || 1} />}
        <div className={`bubble ${isUser ? "b-user" : "b-ai"} ${msg.isFollowUp ? "bubble-followup" : ""}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
        {msg.triage && <TriageCard triage={msg.triage} onExport={onExport} />}
      </div>
      {isUser && <div className="avatar user-av">You</div>}
    </div>
  );
}

// ─── QuickReplies ─────────────────────────────────────────────────────────────
function QuickReplies({ replies, onSelect, disabled }) {
  if (!replies?.length) return null;
  return (
    <div className="quick-replies">
      <span className="qr-label">Quick answers:</span>
      <div className="qr-chips">
        {replies.map((r, i) => <button key={i} className="qr-chip" onClick={() => onSelect(r)} disabled={disabled}>{r}</button>)}
      </div>
    </div>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────
function HistoryPanel({ onClose, onLoad }) {
  const [sessions, setSessions] = useState(loadSessions());

  const handleClear = () => {
    clearSessions();
    setSessions([]);
  };

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={e => e.stopPropagation()}>
        <div className="hp-header">
          <span>Session History</span>
          <div style={{display:"flex", gap:8}}>
            {sessions.length > 0 && <button className="hp-clear" onClick={handleClear}><FaTrash /> Clear all</button>}
            <button className="hp-close" onClick={onClose}><FaTimes /></button>
          </div>
        </div>
        {sessions.length === 0 ? (
          <div className="hp-empty">No past sessions yet.<br/>Complete a triage to save it here.</div>
        ) : (
          <div className="hp-list">
            {sessions.map((s, i) => {
              const meta = TRIAGE_META[s.triageLevel] || TRIAGE_META.green;
              return (
                <div key={i} className="hp-item" onClick={() => { onLoad(s); onClose(); }}>
                  <div className="hp-item-top">
                    <span className="hp-badge" style={{ color: meta.color, borderColor: meta.color + "44", background: meta.color + "11" }}>
                      {meta.label}
                    </span>
                    <span className="hp-date">{s.date}</span>
                  </div>
                  <div className="hp-symptom">{s.firstSymptom}</div>
                  <div className="hp-conditions">{s.conditions?.join(", ") || "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const INIT_MSG = { type: "ai", text: "Hello. I'm **Symptomix**, your AI health assistant.\n\nDescribe your symptoms and I'll ask a few clarifying questions before assessing urgency.", triage: null, isFollowUp: false, step: 0 };

  const [symptoms,     setSymptoms]     = useState("");
  const [messages,     setMessages]     = useState([INIT_MSG]);
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [listening,    setListening]    = useState(false);
  const [emergency,    setEmergency]    = useState(false);
  const [quickReplies, setQuickReplies] = useState([]);
  const [gatherStep,   setGatherStep]   = useState(0);
  const [language,     setLanguage]     = useState("english");   // "english" | "hindi"
  const [showHistory,  setShowHistory]  = useState(false);
  const [lastTriage,   setLastTriage]   = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, quickReplies]);

  // ── voice ──
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported."); return; }
    const r = new SR();
    r.lang = language === "hindi" ? "hi-IN" : "en-US";
    r.continuous = false; r.interimResults = false;
    setListening(true);
    r.start();
    r.onresult = (e) => setSymptoms(e.results[0][0].transcript);
    r.onend    = ()  => setListening(false);
    r.onerror  = ()  => setListening(false);
  };

  // ── send message ──
  const sendMessage = async (text) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setLoading(true);
    setSymptoms("");
    setQuickReplies([]);
    setMessages(prev => [...prev, { type: "user", text: msg, triage: null, isFollowUp: false }]);

    try {
      const res = await fetch("https://symptomix.onrender.com/api/triage/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, conversation_history: history, language }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const reply      = data.reply;
      const triage     = data.triage || null;
      const chips      = data.quick_replies || [];
      const isFollowUp = !triage;
      const newStep    = isFollowUp ? Math.min(gatherStep + 1, 3) : 0;

      if (triage?.emergency_override || triage?.triage_level === "red") setEmergency(true);

      const newHistory = [...history, { role: "user", content: msg }, { role: "assistant", content: reply }];
      setHistory(newHistory);
      setGatherStep(newStep);
      setQuickReplies(chips);

      if (triage) {
        setLastTriage(triage);
        // Save session to localStorage
        const firstUserMsg = [...messages, { type: "user", text: msg }].find(m => m.type === "user");
        saveSession({
          date: new Date().toLocaleString(),
          triageLevel: triage.triage_level,
          firstSymptom: firstUserMsg?.text || msg,
          conditions: triage.conditions,
          advice: triage.advice,
          messages: [...messages, { type: "user", text: msg }, { type: "ai", text: reply, triage }],
        });
      }

      setMessages(prev => [...prev, { type: "ai", text: reply, triage, isFollowUp, step: newStep }]);
    } catch {
      setMessages(prev => [...prev, { type: "ai", text: "⚠️ Cannot reach the backend.\n\nMake sure `uvicorn app.main:app --reload` is running on port 8000.", triage: null, isFollowUp: false, step: 0 }]);
    }
    setLoading(false);
  };

  const analyze = () => sendMessage(symptoms);
  const onKey   = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); analyze(); } };

  const handleExport = () => exportPDF(messages, lastTriage, language);

  const resetChat = () => {
    setMessages([INIT_MSG]);
    setHistory([]);
    setQuickReplies([]);
    setGatherStep(0);
    setLastTriage(null);
    setEmergency(false);
  };

  const loadHistorySession = (session) => {
    setMessages(session.messages || [INIT_MSG]);
    setHistory([]);
    setQuickReplies([]);
    setGatherStep(0);
    setLastTriage(session.triage || null);
  };

  return (
    <div className="shell">
      <div className="orb o1" /><div className="orb o2" /><div className="orb o3" />

      {/* HISTORY PANEL */}
      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} onLoad={loadHistorySession} />}

      {/* EMERGENCY MODAL */}
      {emergency && (
        <div className="em-overlay" onClick={() => setEmergency(false)}>
          <div className="em-box" onClick={e => e.stopPropagation()}>
            <div className="em-icon-ring"><FaExclamationTriangle /></div>
            <h2>Medical Emergency Detected</h2>
            <p>Your symptoms may indicate a life-threatening condition.</p>
            <div className="em-call">📞 Call 112 Immediately</div>
            <p className="em-note">Go to the nearest Emergency Room. Do not wait.</p>
            <button className="em-btn" onClick={() => setEmergency(false)}>I Understand</button>
          </div>
        </div>
      )}

      <div className="layout">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-icon"><FaHeartbeat /></div>
            <div className="brand-text">
              <div className="brand-name">Symptomix</div>
              <div className="brand-sub">AI Health Assistant</div>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-label">TOOLS</div>
            <div className="nav-item active"><FaNotesMedical /><span>Symptom Check</span></div>
            <div className="nav-item" onClick={() => setShowHistory(true)} style={{cursor:"pointer"}}>
              <FaHistory /><span>Session History</span>
            </div>
          </div>

          {/* Language toggle */}
          <div className="lang-section">
            <div className="nav-label">LANGUAGE</div>
            <div className="lang-toggle">
              <button className={`lang-btn ${language === "english" ? "lang-active" : ""}`} onClick={() => setLanguage("english")}>
                🇬🇧 English
              </button>
              <button className={`lang-btn ${language === "hindi" ? "lang-active" : ""}`} onClick={() => setLanguage("hindi")}>
                🇮🇳 हिंदी
              </button>
            </div>
          </div>

          {/* Assessment progress */}
          {gatherStep > 0 && (
            <div className="stage-panel">
              <div className="stage-title">ASSESSMENT PROGRESS</div>
              {[["Symptoms received", 1], ["Details clarified", 2], ["Ready to assess", 3]].map(([label, s]) => (
                <div key={s} className="stage-row">
                  <div className={`stage-dot ${gatherStep >= s ? "s-done" : ""}`} />
                  <span className={gatherStep >= s ? "s-active" : ""}>{label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="legend">
            <div className="legend-title">TRIAGE LEVELS</div>
            <div className="legend-row"><span className="ldot" style={{background:"#ff4757"}}/>Emergency</div>
            <div className="legend-row"><span className="ldot" style={{background:"#ffa502"}}/>See a Doctor</div>
            <div className="legend-row"><span className="ldot" style={{background:"#2ed573"}}/>Monitor Home</div>
          </div>

          <div className="sidebar-foot"><FaShieldAlt /><span>Symptomix is not a substitute for professional medical advice</span></div>
        </aside>

        {/* MAIN */}
        <main className="panel">
          <header className="topbar">
            <span className="topbar-title">Symptomix</span>
            <div style={{display:"flex", gap:10, alignItems:"center"}}>
              {lastTriage && (
                <button className="topbar-btn" onClick={handleExport} title="Export PDF report">
                  <FaFilePdf /> Export PDF
                </button>
              )}
              <button className="topbar-btn" onClick={resetChat} title="New session">
                ↺ New Chat
              </button>
              <div className="online-badge"><span className="live-dot" />AI Online</div>
            </div>
          </header>

          <div className="chat-area">
            {/* Quick symptom chips — show only at start */}
            {messages.length === 1 && !loading && (
              <div className="starter-chips">
                <div className="starter-label">Quick start — tap a symptom:</div>
                <div className="starter-grid">
                  {QUICK_SYMPTOMS.map((s, i) => (
                    <button key={i} className="starter-chip" onClick={() => sendMessage(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <ChatMessage key={i} msg={m} onExport={m.triage ? handleExport : null} />
            ))}

            {loading && (
              <div className="msg-row msg-ai">
                <div className="avatar ai-av"><FaRobot /></div>
                <div className="msg-body">
                  <div className="bubble b-ai typing"><span /><span /><span /></div>
                </div>
              </div>
            )}

            {!loading && quickReplies.length > 0 && (
              <QuickReplies replies={quickReplies} onSelect={sendMessage} disabled={loading} />
            )}

            <div ref={chatEndRef} />
          </div>

          <div className="input-dock">
            {/* Language indicator */}
            <div className="lang-indicator">
              <FaLanguage />
              <span>{language === "hindi" ? "Responding in Hindi (हिंदी)" : "Responding in English"}</span>
            </div>
            <textarea
              rows={2}
              placeholder={language === "hindi" ? "अपने लक्षण बताएं… Enter दबाएं" : "Describe your symptoms… press Enter to send"}
              value={symptoms}
              onChange={e => setSymptoms(e.target.value)}
              onKeyDown={onKey}
              disabled={loading}
            />
            <div className="dock-btns">
              <button className={`btn-mic ${listening ? "mic-active" : ""}`} onClick={startListening} disabled={loading}>
                <FaMicrophone /><span>{listening ? "Listening…" : "Voice"}</span>
              </button>
              <button className="btn-send" onClick={analyze} disabled={loading || !symptoms.trim()}>
                <FaPaperPlane /><span>Analyze</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
