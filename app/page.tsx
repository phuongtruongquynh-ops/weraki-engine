"use client";
import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PROMPTS
// ─────────────────────────────────────────────────────────────────────────────
const DIAGNOSIS_PROMPT = `You are the Weraki Strategy Engine — a senior strategic advisor who diagnoses business problems with surgical precision.
You do NOT solve the problem the client states. You reveal WHY they are framing it wrong, the structural mismatch underneath, and the decision they are actually avoiding.

THE WERAKI METHOD:
STEP 1 — REFRAME: Identify the misunderstanding.
STEP 2 — MISMATCH SCAN: Check Structure≠State, Strategy≠Execution, Model≠Market
STEP 3 — MODEL LAYER: Revenue validity, scale breaks, cost alignment
STEP 4 — FAILURE PATH: "If X is not fixed → Y will happen within Z."
STEP 5 — THE DECISION: Force a choice between exactly two options. Name them.

OUTPUT FORMAT (use EXACTLY these bold headers):

**REFRAME**
They think: [mental model]
But actually: [real problem]
Because: [root mechanism]

**MISMATCH**
[Active mismatches — specific. Use "→" on each line]

**MODEL AUDIT**
Revenue: [validity]
Scale: [what breaks]
Cost: [alignment]

**FAILURE PATH**
If [thing] is not addressed → [mechanism] within [timeframe].

**THE DECISION**
They must choose:
→ Option A: [name] — [implication]
→ Option B: [name] — [implication]
The trade-off: [one sentence]

TONE: Sharp. Direct. No filler. No hedging. Only clarity.`;
const withDecisionLock = (decisionText: string, modulePrompt: string) =>
  `${modulePrompt}
═══════════════════════════════
DECISION LOCK — MANDATORY
═══════════════════════════════
The case Decision is:
${decisionText}

Every single output block MUST end with:
**DECISION LINK**
Supports: [Option A / Option B / Both]
Because: [one sentence connecting this output to the decision trade-off]`;

const WORKSTREAM_PROMPT = (
  diagnosis: string,
  decision: string,
  override: string = ""
) =>
  withDecisionLock(
    decision,
    `You are the Weraki Strategy Engine. Build case workstreams.
${override ? `\nPARTNER INSTRUCTION: ${override}\n` : ""}
DIAGNOSIS:
${diagnosis}

Design exactly 4 case workstreams. Rules:
- Each solves ONE core part of the problem
- Must reflect the specific decision trade-off
- Links to a specific mismatch or model issue
- No generic workstreams ("stakeholder management" = automatic fail)

Output format for EACH workstream:
**WORKSTREAM [N]: [Name in ALL CAPS]**
Objective: [one sentence — what this solves]
Key question: [single hypothesis-generating question]
Why this matters: [link to diagnosis finding]
Owner: [who runs this — role, not name]
Timeline: [weeks]
**DECISION LINK**
Supports: [Option A / B / Both]
Because: [one sentence]`
  );

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────
async function callClaude(systemPrompt: string, userContent: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await res.json();
  return data.content?.map((b: any) => b.text || "").join("") || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE
// ─────────────────────────────────────────────────────────────────────────────
function extractSection(text: string, key: string) {
  const marker = `**${key}**`;
  const start = text.indexOf(marker);
  if (start === -1) return "";
  const after = text.slice(start + marker.length);
  const nextBold = after.search(/\*\*[A-Z]/);
  return (nextBold === -1 ? after : after.slice(0, nextBold)).trim();
}

function parseDiagnosis(text: string) {
  return ["REFRAME", "MISMATCH", "MODEL AUDIT", "FAILURE PATH", "THE DECISION"]
    .map((k: string) => ({ key: k, content: extractSection(text, k) }))
    .filter((s: { key: string; content: string }) => s.content);
}

function extractDecision(text) { return extractSection(text, "THE DECISION") || text; }

function parseDecisionOptions(text) {
  const aMatch = text.match(/→\s*Option A:\s*([^—\n]+)(?:—\s*([^\n]+))?/i);
  const bMatch = text.match(/→\s*Option B:\s*([^—\n]+)(?:—\s*([^\n]+))?/i);
  const tradeMatch = text.match(/The trade-off:\s*([^\n]+)/i);
  return {
    optionA: aMatch ? { name: aMatch[1].trim(), implication: aMatch[2]?.trim() || "" } : null,
    optionB: bMatch ? { name: bMatch[1].trim(), implication: bMatch[2]?.trim() || "" } : null,
    tradeoff: tradeMatch ? tradeMatch[1].trim() : "",
  };
}

function parseWorkstreams(text: string) {
 const results: any[] = [];
  const regex = /\*\*WORKSTREAM\s+(\d+):\s*([^*]+)\*\*/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const num = match[1], name = match[2].trim();
    const after = text.slice(match.index + match[0].length);
    const nextWS = after.search(/\*\*WORKSTREAM\s+\d+/i);
    const block = (nextWS === -1 ? after : after.slice(0, nextWS)).trim();
    const get = (label) => { const m = block.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i')); return m ? m[1].trim() : ""; };
    const dlBlock = (block.match(/\*\*DECISION LINK\*\*([\s\S]*?)(?=\*\*|$)/i) || [])[1] || "";
    results.push({
      num, name,
      objective: get("Objective"), keyQuestion: get("Key question"),
      whyMatters: get("Why this matters"), owner: get("Owner"), timeline: get("Timeline"),
      supports: (dlBlock.match(/Supports:\s*([^\n]+)/i) || [])[1]?.trim() || "",
      because: (dlBlock.match(/Because:\s*([^\n]+)/i) || [])[1]?.trim() || "",
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const SECTORS = ["Retail / E-commerce","F&B / Restaurant","SaaS / Tech","Manufacturing","Healthcare","Financial Services","Real Estate","Education","Logistics","Professional Services"];
const SCALES = ["Startup (<50)","SME (50–200)","Mid-market (200–1000)","Enterprise (1000+)"];
const URGENCY = ["Acute Crisis","Pressure Building","Proactive Planning"];
const WS_COLORS = ["#c8a96e","#7eb8d4","#a8c8a0","#b8a0d4","#d49070"];

const DIAG_META = {
  REFRAME:        { accent:"#c8a96e", bg:"rgba(200,169,110,0.055)", icon:"⟳" },
  MISMATCH:       { accent:"#e07070", bg:"rgba(224,112,112,0.055)", icon:"≠" },
  "MODEL AUDIT":  { accent:"#7eb8d4", bg:"rgba(126,184,212,0.055)", icon:"◈" },
  "FAILURE PATH": { accent:"#d49070", bg:"rgba(212,144,112,0.055)", icon:"→" },
  "THE DECISION": { accent:"#a8c8a0", bg:"rgba(168,200,160,0.055)", icon:"⚖" },
};

const ALL_TABS = [
  { id:"diagnosis",   label:"DIAGNOSIS",   icon:"◉", color:"#c8a96e" },
  { id:"workstreams", label:"WORKSTREAMS", icon:"◫", color:"#c8a96e" },
  { id:"hypothesis",  label:"HYPOTHESIS",  icon:"≈", color:"#7eb8d4" },
  { id:"killcheck",   label:"KILL CHECK",  icon:"✕", color:"#e07070", isControl:true },
  { id:"analysis",    label:"ANALYSIS",    icon:"◈", color:"#a8c8a0" },
  { id:"tasks",       label:"BA TASKS",    icon:"□", color:"#d4c070" },
  { id:"deck",        label:"DECK",        icon:"▤", color:"#b8a0d4" },
  { id:"caseaudit",   label:"AUDIT",       icon:"⬡", color:"#e07070", isControl:true },
];

// Partner action metadata
const PARTNER_ACTIONS = {
  approve: { label:"APPROVE",    icon:"✓", color:"#a8c8a0", desc:"Accept and proceed" },
  refocus: { label:"REFOCUS",    icon:"↻", color:"#c8a96e", desc:"Redirect with instruction" },
  kill:    { label:"KILL PATH",  icon:"✕", color:"#e07070", desc:"Reject and regenerate" },
};

// G = global design tokens
const G = {
  bg:"#0b0a08", panel:"rgba(255,255,255,0.022)", border:"rgba(255,255,255,0.06)",
  gold:"#c8a96e", text:"#d4cfc8", textMid:"#8a8480", textDim:"#3d3830",
  mono:"'Courier New', monospace", serif:"'Georgia', serif",
};

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER LOG UTILS
// ─────────────────────────────────────────────────────────────────────────────
function makeLogEntry(tabId, action, note = "") {
  return { tabId, action, note, ts: Date.now(), id: Math.random().toString(36).slice(2) };
}

function statusColor(action) {
  return { approve:"#a8c8a0", refocus:"#c8a96e", kill:"#e07070" }[action] || G.textDim;
}

function statusIcon(action) {
  return { approve:"✓", refocus:"↻", kill:"✕" }[action] || "·";
}

// ─────────────────────────────────────────────────────────────────────────────
// SPINNER
// ─────────────────────────────────────────────────────────────────────────────
function Spinner({ label = "PROCESSING", sub = "" }) {
  const [dots, setDots] = useState(0);
  useEffect(() => { const t = setInterval(() => setDots(d => (d + 1) % 4), 500); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign:"center", padding:"72px 0" }}>
      <div style={{ position:"relative", width:44, height:44, margin:"0 auto 22px" }}>
        <div style={{ width:44, height:44, border:"1px solid rgba(200,169,110,0.12)", borderTop:"1px solid #c8a96e", borderRadius:"50%", animation:"wspin 1.1s linear infinite" }}/>
        <div style={{ position:"absolute", inset:8, border:"1px solid rgba(200,169,110,0.06)", borderBottom:"1px solid rgba(200,169,110,0.28)", borderRadius:"50%", animation:"wspin 1.9s linear infinite reverse" }}/>
      </div>
      <div style={{ color:G.gold, fontSize:9, letterSpacing:4, fontFamily:G.mono }}>{label}{".".repeat(dots)}</div>
      {sub && <div style={{ color:G.textDim, fontSize:8, fontFamily:G.mono, letterSpacing:2, marginTop:8 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE STATUS BADGE — sticky indicator on each tab
// ─────────────────────────────────────────────────────────────────────────────
function StatusBadge({ log, compact = false }) {
  if (!log) return null;
  const col = statusColor(log.action);
  const ico = statusIcon(log.action);
  if (compact) return (
    <span style={{ fontSize:7, color:col, marginLeft:3 }}>{ico}</span>
  );
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px",
      background:`${col}10`, border:`1px solid ${col}30`, borderRadius:20,
    }}>
      <span style={{ fontSize:9, color:col }}>{ico}</span>
      <span style={{ fontSize:8, color:col, fontFamily:G.mono, letterSpacing:1.5 }}>
        {log.action.toUpperCase()}
      </span>
      {log.note && (
        <span style={{ fontSize:8, color:`${col}90`, fontFamily:G.serif, fontStyle:"italic", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          — {log.note}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER CONTROL PANEL — the main inline control block per module
// ─────────────────────────────────────────────────────────────────────────────
function PartnerControlPanel({ tabId, currentLog, onAction, disabled }) {
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [hovering, setHovering] = useState(null);
  const noteRef = useRef(null);

  // Reset when tab changes
  useEffect(() => { setSelected(null); setNote(""); setConfirmed(false); }, [tabId]);

  useEffect(() => {
    if (selected && (selected === "kill" || selected === "refocus")) {
      setTimeout(() => noteRef.current?.focus(), 80);
    }
  }, [selected]);

  const confirm = () => {
    if (!selected) return;
    onAction(tabId, selected, note);
    setConfirmed(true);
  };

  const needsNote = selected === "kill" || selected === "refocus";
  const canConfirm = selected && (!needsNote || true); // note optional

  if (confirmed && currentLog) return (
    <div style={{ marginTop:24, animation:"pfadeIn 0.3s ease" }}>
      <div style={{
        padding:"14px 18px", background:`${statusColor(currentLog.action)}08`,
        border:`1px solid ${statusColor(currentLog.action)}25`, borderRadius:7,
        display:"flex", justifyContent:"space-between", alignItems:"center",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14, color:statusColor(currentLog.action) }}>{statusIcon(currentLog.action)}</span>
          <div>
            <div style={{ fontSize:8, letterSpacing:2.5, color:statusColor(currentLog.action), fontFamily:G.mono, marginBottom:3 }}>
              PARTNER: {currentLog.action.toUpperCase()}
            </div>
            {currentLog.note && (
              <div style={{ fontSize:12, color:G.textMid, fontFamily:G.serif, fontStyle:"italic" }}>"{currentLog.note}"</div>
            )}
          </div>
        </div>
        <button onClick={() => { setConfirmed(false); setSelected(null); setNote(""); }}
          style={{ fontSize:8, color:G.textDim, background:"transparent", border:"1px solid rgba(255,255,255,0.07)", borderRadius:3, padding:"4px 10px", cursor:"pointer", fontFamily:G.mono, letterSpacing:2 }}>
          REVISE
        </button>
      </div>
      {(currentLog.action === "kill" || currentLog.action === "refocus") && (
        <div style={{ marginTop:8, fontSize:9, color:G.textDim, fontFamily:G.mono, letterSpacing:1.5 }}>
          ↻ Regenerating with partner instruction...
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      marginTop:28, padding:"20px 22px",
      background:"rgba(0,0,0,0.28)", border:"1px solid rgba(255,255,255,0.055)",
      borderRadius:7, animation:"pfadeIn 0.3s ease",
    }}>
      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background: disabled ? G.textDim : G.gold }}/>
          <span style={{ fontSize:8, letterSpacing:3, color: disabled ? G.textDim : G.gold, fontFamily:G.mono }}>
            PARTNER CONTROL
          </span>
        </div>
        {currentLog && <StatusBadge log={currentLog}/>}
      </div>

      {disabled ? (
        <div style={{ fontSize:11, color:G.textDim, fontFamily:G.mono, letterSpacing:1 }}>
          Generate module output first.
        </div>
      ) : (
        <>
          {/* Action buttons */}
          <div style={{ display:"flex", gap:8, marginBottom:selected ? 16 : 0, flexWrap:"wrap" }}>
            {Object.entries(PARTNER_ACTIONS).map(([id, meta]) => {
              const isActive = selected === id;
              const isHov = hovering === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelected(isActive ? null : id)}
                  onMouseEnter={() => setHovering(id)}
                  onMouseLeave={() => setHovering(null)}
                  style={{
                    padding:"9px 18px", cursor:"pointer", borderRadius:5, fontSize:9,
                    letterSpacing:2, fontFamily:G.mono, fontWeight:700,
                    background: isActive ? `${meta.color}18` : isHov ? `${meta.color}0a` : "transparent",
                    border:`1px solid ${isActive || isHov ? meta.color : "rgba(255,255,255,0.08)"}`,
                    color: isActive ? meta.color : isHov ? meta.color : G.textMid,
                    transition:"all 0.15s",
                  }}
                >
                  <span style={{ marginRight:6 }}>{meta.icon}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Note field for kill / refocus */}
          {selected && needsNote && (
            <div style={{ animation:"pslide 0.25s ease", marginBottom:14 }}>
              <div style={{ fontSize:8, letterSpacing:2, color:G.textDim, fontFamily:G.mono, marginBottom:7 }}>
                {selected === "kill" ? "REASON FOR KILL (optional)" : "REFOCUS INSTRUCTION"}
              </div>
              <textarea
                ref={noteRef}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={
                  selected === "kill"
                    ? "Why is this path wrong? What assumption failed?"
                    : "New direction, constraint, or lens to apply..."
                }
                style={{
                  width:"100%", padding:"10px 14px", background:"rgba(255,255,255,0.025)",
                  border:`1px solid ${statusColor(selected)}30`, borderRadius:5,
                  color:G.text, fontSize:12, lineHeight:1.75, fontFamily:G.serif,
                  resize:"vertical", minHeight:80, outline:"none", boxSizing:"border-box",
                  transition:"border-color 0.2s",
                }}
              />
            </div>
          )}

          {/* Confirm */}
          {selected && (
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <button
                onClick={confirm}
                style={{
                  padding:"9px 22px", cursor:"pointer", borderRadius:5,
                  background:`${statusColor(selected)}14`,
                  border:`1px solid ${statusColor(selected)}`,
                  color:statusColor(selected),
                  fontSize:9, letterSpacing:2.5, fontFamily:G.mono, fontWeight:700,
                }}
              >
                CONFIRM {selected.toUpperCase()} →
              </button>
              <span style={{ fontSize:10, color:G.textDim, fontFamily:G.serif, fontStyle:"italic" }}>
                {PARTNER_ACTIONS[selected]?.desc}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER AUDIT DRAWER — slide-in side panel showing full session log
// ─────────────────────────────────────────────────────────────────────────────
function PartnerDrawer({ log, open, onClose, moduleStatuses }) {
  const approveCount = log.filter(e => e.action === "approve").length;
  const killCount    = log.filter(e => e.action === "kill").length;
  const refocusCount = log.filter(e => e.action === "refocus").length;

  const tabLabel = (id) => ALL_TABS.find(t => t.id === id)?.label || id;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200,
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
        transition:"opacity 0.3s",
      }}/>

      {/* Drawer */}
      <div style={{
        position:"fixed", top:0, right:0, bottom:0, width:380, zIndex:201,
        background:"#0f0e0c", borderLeft:"1px solid rgba(200,169,110,0.12)",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition:"transform 0.35s cubic-bezier(0.4,0,0.2,1)",
        display:"flex", flexDirection:"column", overflowY:"auto",
      }}>
        {/* Drawer header */}
        <div style={{ padding:"20px 24px", borderBottom:"1px solid rgba(255,255,255,0.05)", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:3.5, color:G.gold, fontFamily:G.mono, fontWeight:700 }}>PARTNER AUDIT LOG</div>
            <div style={{ fontSize:10, color:G.textDim, marginTop:3 }}>{log.length} decision{log.length !== 1 ? "s" : ""} recorded</div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.07)", color:G.textMid, padding:"5px 12px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:G.mono }}>✕</button>
        </div>

        {/* Summary row */}
        <div style={{ padding:"16px 24px", borderBottom:"1px solid rgba(255,255,255,0.04)", display:"flex", gap:16, flexShrink:0 }}>
          {[
            { label:"APPROVED", val:approveCount, color:"#a8c8a0" },
            { label:"KILLED",   val:killCount,    color:"#e07070" },
            { label:"REFOCUSED",val:refocusCount, color:"#c8a96e" },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize:18, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:7, letterSpacing:2, color:G.textDim, fontFamily:G.mono }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Module status grid */}
        <div style={{ padding:"16px 24px", borderBottom:"1px solid rgba(255,255,255,0.04)", flexShrink:0 }}>
          <div style={{ fontSize:8, letterSpacing:2.5, color:G.textDim, fontFamily:G.mono, marginBottom:12 }}>MODULE STATUS</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {ALL_TABS.map(t => {
              const entry = moduleStatuses[t.id];
              const col = entry ? statusColor(entry.action) : G.textDim;
              return (
                <div key={t.id} style={{
                  padding:"8px 12px", borderRadius:5,
                  background: entry ? `${col}08` : "rgba(255,255,255,0.02)",
                  border:`1px solid ${entry ? col+"25" : "rgba(255,255,255,0.05)"}`,
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                }}>
                  <div>
                    <div style={{ fontSize:7, letterSpacing:2, color: entry ? col : G.textDim, fontFamily:G.mono }}>{t.label}</div>
                  </div>
                  <span style={{ fontSize:10, color: entry ? col : G.textDim }}>
                    {entry ? statusIcon(entry.action) : "·"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chronological log */}
        <div style={{ padding:"16px 24px", flex:1, overflowY:"auto" }}>
          <div style={{ fontSize:8, letterSpacing:2.5, color:G.textDim, fontFamily:G.mono, marginBottom:14 }}>CHRONOLOGICAL LOG</div>
          {log.length === 0 ? (
            <div style={{ fontSize:11, color:G.textDim, fontFamily:G.serif, fontStyle:"italic" }}>
              No partner decisions recorded yet.
            </div>
          ) : (
            [...log].reverse().map((entry, i) => {
              const col = statusColor(entry.action);
              const time = new Date(entry.ts);
              const timeStr = time.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
              return (
                <div key={entry.id} style={{
                  borderLeft:`2px solid ${col}40`, paddingLeft:14,
                  marginBottom:18, paddingBottom: i < log.length-1 ? 18 : 0,
                  borderBottom: i < log.length-1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <span style={{ fontSize:10, color:col }}>{statusIcon(entry.action)}</span>
                      <span style={{ fontSize:8, letterSpacing:2, color:col, fontFamily:G.mono }}>{entry.action.toUpperCase()}</span>
                      <span style={{ fontSize:8, color:G.textDim, fontFamily:G.mono }}>·</span>
                      <span style={{ fontSize:8, color:G.textMid, fontFamily:G.mono, letterSpacing:1 }}>{tabLabel(entry.tabId)}</span>
                    </div>
                    <span style={{ fontSize:8, color:G.textDim, fontFamily:G.mono }}>{timeStr}</span>
                  </div>
                  {entry.note ? (
                    <div style={{ fontSize:12, color:G.textMid, fontFamily:G.serif, fontStyle:"italic", lineHeight:1.6 }}>"{entry.note}"</div>
                  ) : (
                    <div style={{ fontSize:11, color:G.textDim, fontFamily:G.serif }}>No additional instruction.</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DECISION LOCK BAR
// ─────────────────────────────────────────────────────────────────────────────
function DecisionLockBar({ options }) {
  if (!options?.optionA) return null;
  return (
    <div style={{
      background:"rgba(168,200,160,0.035)", border:"1px solid rgba(168,200,160,0.14)",
      borderRadius:7, padding:"11px 18px", marginBottom:14,
      display:"flex", gap:18, alignItems:"center", flexWrap:"wrap",
    }}>
      <div style={{ fontSize:8, color:"#a8c8a0", letterSpacing:3, fontFamily:G.mono, flexShrink:0 }}>⚖ DECISION LOCK</div>
      {[{label:"A", opt:options.optionA, col:"#7eb8d4"},{label:"B", opt:options.optionB, col:"#b8a0d4"}].map(({label,opt,col}) => (
        <div key={label} style={{ display:"flex", gap:7, alignItems:"center" }}>
          <span style={{ fontSize:8, padding:"2px 7px", background:`${col}12`, border:`1px solid ${col}28`, color:col, borderRadius:3, fontFamily:G.mono, letterSpacing:1 }}>{label}</span>
          <span style={{ fontSize:11, color:`${col}90`, fontFamily:G.serif }}>{opt?.name}</span>
        </div>
      ))}
      {options.tradeoff && (
        <div style={{ marginLeft:"auto", fontSize:10, color:G.textDim, fontFamily:G.serif, fontStyle:"italic", maxWidth:260, textAlign:"right" }}>
          {options.tradeoff}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAG SUB-CARDS
// ─────────────────────────────────────────────────────────────────────────────
function ReframeCard({ content }) {
  const get = (label) => (content.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i')) || [])[1]?.trim() || "";
  const rows = [
    { label:"THEY THINK", value:get("They think"), color:"#6b6560" },
    { label:"BUT ACTUALLY", value:get("But actually"), color:"#c8a96e", large:true },
    { label:"BECAUSE", value:get("Because"), color:"#8a8480" },
  ].filter(r => r.value);
  return (
    <div>{rows.map((r,i) => (
      <div key={i} style={{ marginBottom: i<rows.length-1?18:0 }}>
        <div style={{ fontSize:8, letterSpacing:3, color:G.textDim, fontFamily:G.mono, marginBottom:5 }}>{r.label}</div>
        <div style={{ fontSize:r.large?15:13, color:r.color, lineHeight:1.7, fontFamily:G.serif }}>{r.value}</div>
        {i<rows.length-1 && <div style={{ height:1, background:"rgba(255,255,255,0.04)", marginTop:15 }}/>}
      </div>
    ))}</div>
  );
}

function MismatchCard({ content }) {
  const lines = content.split("\n").map(l=>l.trim()).filter(l=>l);
  return (
    <div>{lines.map((line,i) => {
      const clean = line.replace(/^→\s*/,"");
      const [left,right] = clean.includes("≠") ? clean.split("≠") : clean.includes("→") ? clean.split("→") : [clean,""];
      return (
        <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
          <div style={{ width:3, height:3, borderRadius:"50%", background:"#e07070", flexShrink:0, marginTop:8 }}/>
          <div style={{ fontSize:13, color:G.text, fontFamily:G.serif, lineHeight:1.65 }}>
            {right ? <><span style={{color:"#c4785c"}}>{left.trim()}</span><span style={{color:G.textMid,margin:"0 8px",fontSize:12}}>≠</span><span>{right.trim()}</span></> : <span>{clean}</span>}
          </div>
        </div>
      );
    })}</div>
  );
}

function ModelAuditCard({ content }) {
  const get = (label) => (content.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i')) || [])[1]?.trim() || "";
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
      {[{label:"REVENUE",value:get("Revenue"),color:"#7eb8d4"},{label:"SCALE",value:get("Scale"),color:"#c8a96e"},{label:"COST",value:get("Cost"),color:"#a8c8a0"}].map(r => (
        <div key={r.label} style={{ background:`${r.color}0a`, border:`1px solid ${r.color}20`, borderRadius:5, padding:"13px 15px" }}>
          <div style={{ fontSize:8, letterSpacing:3, color:r.color, fontFamily:G.mono, marginBottom:7 }}>{r.label}</div>
          <div style={{ fontSize:12, color:G.text, lineHeight:1.65, fontFamily:G.serif }}>{r.value||"—"}</div>
        </div>
      ))}
    </div>
  );
}

function FailurePathCard({ content }) {
  const clean = content.replace(/\*\*(.*?)\*\*/g,"$1").trim();
  const idx = clean.indexOf("→");
  const before = idx>-1 ? clean.slice(0,idx).trim() : clean;
  const after  = idx>-1 ? clean.slice(idx+1).trim() : "";
  return (
    <div style={{ borderLeft:"3px solid #e07070", paddingLeft:16 }}>
      <div style={{ fontSize:13, color:"#8a8480", fontFamily:G.serif, lineHeight:1.7, marginBottom:after?12:0 }}>{before}</div>
      {after && <div style={{ fontSize:14, color:"#e07070", fontFamily:G.serif, lineHeight:1.7, fontWeight:600 }}>→ {after}</div>}
    </div>
  );
}

function DecisionCard({ content, onParsed }) {
  const opts = parseDecisionOptions(content);
  useEffect(() => { if (opts.optionA) onParsed?.(opts); }, [content]);
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:13 }}>
        {[{label:"OPTION A",opt:opts.optionA,color:"#7eb8d4"},{label:"OPTION B",opt:opts.optionB,color:"#b8a0d4"}].map(({label,opt,color}) => (
          <div key={label} style={{ background:`${color}08`, border:`1px solid ${color}22`, borderRadius:6, padding:"15px 17px" }}>
            <div style={{ fontSize:8, letterSpacing:3, color, fontFamily:G.mono, marginBottom:7 }}>{label}</div>
            <div style={{ fontSize:14, color, fontFamily:G.serif, fontWeight:600, marginBottom:7 }}>{opt?.name||"—"}</div>
            {opt?.implication && <div style={{ fontSize:12, color:G.textMid, fontFamily:G.serif, lineHeight:1.6 }}>{opt.implication}</div>}
          </div>
        ))}
      </div>
      {opts.tradeoff && (
        <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:5, padding:"11px 15px" }}>
          <span style={{ fontSize:8, letterSpacing:2, color:G.textDim, fontFamily:G.mono }}>THE TRADE-OFF  </span>
          <span style={{ fontSize:13, color:G.text, fontFamily:G.serif }}>{opts.tradeoff}</span>
        </div>
      )}
    </div>
  );
}

function DiagSection({ section, idx, onDecisionParsed }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(()=>setVis(true), idx*110); return ()=>clearTimeout(t); }, [idx]);
  const meta = DIAG_META[section.key] || DIAG_META.REFRAME;
  return (
    <div style={{ opacity:vis?1:0, transition:"opacity 0.4s ease", background:meta.bg, border:`1px solid ${meta.accent}1a`, borderLeft:`3px solid ${meta.accent}`, borderRadius:7, padding:"20px 22px", marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
        <span style={{ color:meta.accent, fontSize:18 }}>{meta.icon}</span>
        <span style={{ color:meta.accent, fontSize:9, fontWeight:700, letterSpacing:3.5, fontFamily:G.mono }}>{section.key}</span>
      </div>
      {section.key==="REFRAME"       && <ReframeCard content={section.content}/>}
      {section.key==="MISMATCH"      && <MismatchCard content={section.content}/>}
      {section.key==="MODEL AUDIT"   && <ModelAuditCard content={section.content}/>}
      {section.key==="FAILURE PATH"  && <FailurePathCard content={section.content}/>}
      {section.key==="THE DECISION"  && <DecisionCard content={section.content} onParsed={onDecisionParsed}/>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKSTREAM CARD
// ─────────────────────────────────────────────────────────────────────────────
function WorkstreamCard({ ws, idx, color, visible }) {
  const supA    = ws.supports?.toLowerCase().includes("option a") || ws.supports?.toLowerCase() === "a";
  const supB    = ws.supports?.toLowerCase().includes("option b") || ws.supports?.toLowerCase() === "b";
  const supBoth = ws.supports?.toLowerCase().includes("both");
  return (
    <div style={{ opacity:visible?1:0, transform:visible?"none":"translateY(14px)", transition:`opacity 0.45s ${idx*0.09}s ease, transform 0.45s ${idx*0.09}s ease`, background:`${color}06`, border:`1px solid ${color}1e`, borderTop:`3px solid ${color}`, borderRadius:7, padding:"22px 24px", marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:17 }}>
        <div>
          <div style={{ fontSize:8, letterSpacing:3, color, fontFamily:G.mono, marginBottom:5 }}>WORKSTREAM {ws.num}</div>
          <div style={{ fontSize:16, color:G.text, fontFamily:G.serif }}>{ws.name}</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {ws.owner && <div style={{ padding:"3px 9px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:20, fontSize:9, color:G.textMid, fontFamily:G.mono }}>{ws.owner}</div>}
          {ws.timeline && <div style={{ padding:"3px 9px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:20, fontSize:9, color:G.textMid, fontFamily:G.mono }}>⏱ {ws.timeline}</div>}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:ws.whyMatters?14:0 }}>
        <div>
          <div style={{ fontSize:8, letterSpacing:2.5, color:G.textDim, fontFamily:G.mono, marginBottom:6 }}>OBJECTIVE</div>
          <div style={{ fontSize:13, color:G.text, fontFamily:G.serif, lineHeight:1.7 }}>{ws.objective||"—"}</div>
        </div>
        <div>
          <div style={{ fontSize:8, letterSpacing:2.5, color:G.textDim, fontFamily:G.mono, marginBottom:6 }}>KEY QUESTION</div>
          <div style={{ fontSize:13, color:G.textMid, fontFamily:G.serif, lineHeight:1.7, fontStyle:"italic" }}>{ws.keyQuestion||"—"}</div>
        </div>
      </div>
      {ws.whyMatters && (
        <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:5, padding:"11px 14px", marginBottom:14 }}>
          <div style={{ fontSize:8, letterSpacing:2.5, color:G.textDim, fontFamily:G.mono, marginBottom:5 }}>WHY THIS MATTERS</div>
          <div style={{ fontSize:12, color:G.textMid, fontFamily:G.serif, lineHeight:1.65 }}>{ws.whyMatters}</div>
        </div>
      )}
      <div style={{ borderTop:`1px solid ${color}20`, paddingTop:13, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", gap:5, alignItems:"center" }}>
          <span style={{ fontSize:8, letterSpacing:2, color:G.textDim, fontFamily:G.mono, marginRight:4 }}>DECISION LINK</span>
          {(supA||supBoth) && <span style={{ fontSize:8, padding:"2px 7px", background:"rgba(126,184,212,0.1)", border:"1px solid rgba(126,184,212,0.28)", color:"#7eb8d4", borderRadius:3, fontFamily:G.mono }}>A</span>}
          {(supB||supBoth) && <span style={{ fontSize:8, padding:"2px 7px", background:"rgba(184,160,212,0.1)", border:"1px solid rgba(184,160,212,0.28)", color:"#b8a0d4", borderRadius:3, fontFamily:G.mono }}>B</span>}
          {supBoth && <span style={{ fontSize:8, padding:"2px 7px", background:"rgba(168,200,160,0.1)", border:"1px solid rgba(168,200,160,0.28)", color:"#a8c8a0", borderRadius:3, fontFamily:G.mono }}>BOTH</span>}
        </div>
        {ws.because && <div style={{ fontSize:11, color:G.textMid, fontFamily:G.serif, fontStyle:"italic", maxWidth:"52%", textAlign:"right" }}>{ws.because}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function WerakiEngine() {
  // ── Phase / nav
  const [phase, setPhase]         = useState("input"); // input|diagloading|diagdone|case
  const [activeTab, setActiveTab] = useState("diagnosis");

  // ── Form
  const [form, setForm] = useState({ sector:"", scale:"", urgency:"", brief:"", symptoms:"", tried:"" });

  // ── Diagnosis
  const [diagRaw, setDiagRaw]           = useState("");
  const [diagParsed, setDiagParsed]     = useState([]);
  const [decisionText, setDecisionText] = useState("");
  const [decisionOptions, setDecisionOptions] = useState(null);

  // ── Case data & workstreams
  const [caseData, setCaseData]   = useState({});   // tabId → raw string
  const [wsCards, setWsCards]     = useState([]);
  const [wsVisible, setWsVisible] = useState(false);
  const [loadingTab, setLoadingTab] = useState(null);
  const [error, setError]         = useState("");

  // ── Partner layer
  const [partnerLog, setPartnerLog]     = useState([]);      // [{tabId, action, note, ts, id}]
  const [moduleStatuses, setModuleStatuses] = useState({}); // tabId → latest log entry
  const [drawerOpen, setDrawerOpen]     = useState(false);

  const valid = form.sector && form.scale && form.brief.trim().length > 30;

  // ── Record partner decision
  const recordPartner = useCallback((tabId, action, note) => {
    const entry = makeLogEntry(tabId, action, note);
    setPartnerLog(p => [...p, entry]);
    setModuleStatuses(s => ({ ...s, [tabId]: entry }));
    if (action === "kill" || action === "refocus") {
      if (tabId === "workstreams") generateWorkstreams(note);
    }
  }, []);

  // ── Diagnose
  const handleDiagnose = async () => {
    if (!valid) return;
    setPhase("diagloading"); setError("");
    try {
      const userContent = [
        `Sector: ${form.sector}`, `Scale: ${form.scale}`, `Urgency: ${form.urgency||"Unspecified"}`,
        `Stated Problem: ${form.brief}`,
        form.symptoms ? `Symptoms: ${form.symptoms}` : "",
        form.tried ? `Already tried: ${form.tried}` : "",
      ].filter(Boolean).join("\n");
      const res = await callClaude(DIAGNOSIS_PROMPT, userContent);
      setDiagRaw(res);
      setDiagParsed(parseDiagnosis(res));
      setDecisionText(extractDecision(res));
      setCaseData({}); setWsCards([]); setPartnerLog([]); setModuleStatuses({});
      setPhase("diagdone"); setActiveTab("diagnosis");
    } catch { setError("API error — check connection."); setPhase("input"); }
  };

  // ── Generate workstreams
  const generateWorkstreams = async (overrideNote = "") => {
    setLoadingTab("workstreams"); setWsCards([]); setWsVisible(false);
    setCaseData(p => ({ ...p, workstreams: undefined }));
    try {
      const result = await callClaude("Follow instructions exactly.", WORKSTREAM_PROMPT(diagRaw, decisionText, overrideNote));
      setCaseData(p => ({ ...p, workstreams: result }));
      const parsed = parseWorkstreams(result);
      setWsCards(parsed);
      setTimeout(() => setWsVisible(true), 60);
    } catch {
      setCaseData(p => ({ ...p, workstreams: "Error generating. Please retry." }));
    }
    setLoadingTab(null);
  };

  // ── Tab click
  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (tabId === "workstreams" && !caseData.workstreams && loadingTab !== "workstreams") {
      generateWorkstreams();
    }
  };

  const enterCase = () => { setPhase("case"); setActiveTab("workstreams"); generateWorkstreams(); };
  const reset = () => {
    setPhase("input"); setForm({ sector:"", scale:"", urgency:"", brief:"", symptoms:"", tried:"" });
    setDiagRaw(""); setDiagParsed([]); setDecisionText(""); setDecisionOptions(null);
    setCaseData({}); setWsCards([]); setPartnerLog([]); setModuleStatuses({}); setError("");
  };

  const completedCount = ALL_TABS.filter(t => caseData[t.id] || (t.id==="diagnosis"&&diagRaw)).length;
  const tab = ALL_TABS.find(t => t.id === activeTab);
  const pendingDecisions = ALL_TABS.filter(t => (caseData[t.id]||t.id==="diagnosis"&&diagRaw) && !moduleStatuses[t.id]).length;

  // ── Input base styles
  const inp = { width:"100%", padding:"10px 14px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:5, color:G.text, fontSize:13, fontFamily:G.serif, outline:"none", boxSizing:"border-box", lineHeight:1.7 };
  const lbl = { display:"block", fontSize:9, letterSpacing:"2.5px", color:G.textDim, fontFamily:G.mono, marginBottom:6, fontWeight:700 };

  return (
    <div style={{ minHeight:"100vh", background:G.bg, color:G.text }}>
      <style>{`
        @keyframes wspin { to { transform:rotate(360deg); } }
        @keyframes wfadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes pfadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes pslide { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
        @keyframes wslideIn { from { opacity:0; transform:translateX(-6px); } to { opacity:1; transform:none; } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(200,169,110,0.18); border-radius:2px; }
        textarea:focus, select:focus { border-color:rgba(200,169,110,0.35) !important; }
      `}</style>

      {/* ─── HEADER ─── */}
      <div style={{ borderBottom:"1px solid rgba(200,169,110,0.08)", padding:"15px 28px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:G.bg, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <div>
            <div style={{ fontSize:11, letterSpacing:5, color:G.gold, fontFamily:G.mono, fontWeight:700 }}>WERAKI</div>
            <div style={{ fontSize:8, color:G.textDim, letterSpacing:2, fontFamily:G.mono }}>STRATEGY ENGINE</div>
          </div>
          {(phase==="diagdone"||phase==="case") && <>
            <div style={{ width:1, height:22, background:"rgba(255,255,255,0.06)" }}/>
            <div style={{ fontSize:9, color:G.textMid, fontFamily:G.mono }}>{form.sector} · {form.scale}</div>
          </>}
          {phase==="case" && (
            <div style={{ display:"flex", gap:5, alignItems:"center", padding:"3px 9px", background:"rgba(168,200,160,0.07)", border:"1px solid rgba(168,200,160,0.18)", borderRadius:20 }}>
              <div style={{ width:4, height:4, borderRadius:"50%", background:"#a8c8a0" }}/>
              <span style={{ fontSize:8, color:"#a8c8a0", fontFamily:G.mono, letterSpacing:2 }}>ACTIVE CASE</span>
            </div>
          )}
        </div>

        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {/* Partner Audit button — shows when there's a log or pending decisions */}
          {phase==="case" && (
            <button onClick={() => setDrawerOpen(true)} style={{
              display:"flex", alignItems:"center", gap:7, padding:"6px 14px",
              background: pendingDecisions>0 ? "rgba(200,169,110,0.1)" : "rgba(255,255,255,0.03)",
              border:`1px solid ${pendingDecisions>0 ? "rgba(200,169,110,0.35)" : "rgba(255,255,255,0.07)"}`,
              color: pendingDecisions>0 ? G.gold : G.textMid,
              borderRadius:5, cursor:"pointer", fontSize:9, letterSpacing:2, fontFamily:G.mono,
            }}>
              <span>◈</span>
              <span>PARTNER LOG</span>
              {partnerLog.length > 0 && (
                <span style={{ background:G.gold, color:"#0b0a08", borderRadius:10, padding:"1px 6px", fontSize:8, fontWeight:700 }}>
                  {partnerLog.length}
                </span>
              )}
              {pendingDecisions > 0 && (
                <span style={{ background:"rgba(224,112,112,0.3)", color:"#e07070", borderRadius:10, padding:"1px 6px", fontSize:8 }}>
                  {pendingDecisions} pending
                </span>
              )}
            </button>
          )}
          {phase !== "input" && (
            <button onClick={reset} style={{ padding:"5px 13px", background:"transparent", border:"1px solid rgba(255,255,255,0.06)", color:G.textMid, borderRadius:4, cursor:"pointer", fontSize:9, letterSpacing:2, fontFamily:G.mono }}>
              NEW CASE
            </button>
          )}
        </div>
      </div>

      {/* ─── PARTNER DRAWER ─── */}
      <PartnerDrawer
        log={partnerLog}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        moduleStatuses={moduleStatuses}
      />

      <div style={{ maxWidth:920, margin:"0 auto", padding:"40px 24px 80px" }}>

        {/* ════ INPUT ════ */}
        {phase==="input" && (
          <div style={{ animation:"wfadeUp 0.5s ease" }}>
            <div style={{ marginBottom:44 }}>
              <div style={{ fontSize:9, letterSpacing:4, color:G.textDim, fontFamily:G.mono, marginBottom:14 }}>CASE INTAKE</div>
              <h1 style={{ fontSize:30, fontWeight:400, color:"#e8e2d8", lineHeight:1.35, margin:"0 0 14px", fontFamily:G.serif }}>
                Don't solve the stated problem.<br/>
                <em style={{ color:G.gold, fontStyle:"normal" }}>Solve the real one.</em>
              </h1>
              <div style={{ height:1, width:80, background:"rgba(200,169,110,0.3)", marginBottom:12 }}/>
              <p style={{ color:G.textDim, fontSize:10, lineHeight:1.8, fontFamily:G.mono, letterSpacing:1 }}>
                Diagnosis → Decision Lock → Workstreams → Partner Control → Hypothesis → Kill Check
              </p>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              <div>
                <label style={lbl}>SECTOR</label>
                <select value={form.sector} onChange={e=>setForm(f=>({...f,sector:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                  <option value="">Select sector...</option>
                  {SECTORS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>COMPANY SCALE</label>
                <select value={form.scale} onChange={e=>setForm(f=>({...f,scale:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                  <option value="">Select scale...</option>
                  {SCALES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>URGENCY LEVEL</label>
              <div style={{ display:"flex", gap:8 }}>
                {URGENCY.map(u=>(
                  <button key={u} onClick={()=>setForm(f=>({...f,urgency:u}))} style={{ padding:"8px 18px", background:form.urgency===u?"rgba(200,169,110,0.1)":"transparent", border:`1px solid ${form.urgency===u?G.gold:"rgba(255,255,255,0.07)"}`, color:form.urgency===u?G.gold:G.textMid, borderRadius:4, cursor:"pointer", fontSize:10, letterSpacing:1.5, fontFamily:G.mono }}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>STATED PROBLEM <span style={{ fontWeight:400, color:G.textDim }}>(min 30 chars)</span></label>
              <textarea value={form.brief} onChange={e=>setForm(f=>({...f,brief:e.target.value}))} placeholder="What is the client telling you is wrong? State it as they would." style={{...inp,minHeight:110,resize:"vertical"}}/>
              <div style={{ fontSize:9, color:form.brief.length>30?"#4a6040":G.textDim, marginTop:4, fontFamily:G.mono }}>{form.brief.length}/30 min</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:32 }}>
              <div>
                <label style={lbl}>SYMPTOMS <span style={{ fontWeight:400 }}>(optional)</span></label>
                <textarea value={form.symptoms} onChange={e=>setForm(f=>({...f,symptoms:e.target.value}))} placeholder="Revenue drop? Margin squeeze? Team friction?" style={{...inp,minHeight:80,resize:"vertical"}}/>
              </div>
              <div>
                <label style={lbl}>WHAT THEY'VE TRIED <span style={{ fontWeight:400 }}>(optional)</span></label>
                <textarea value={form.tried} onChange={e=>setForm(f=>({...f,tried:e.target.value}))} placeholder="Hired consultants? Cut costs? New products?" style={{...inp,minHeight:80,resize:"vertical"}}/>
              </div>
            </div>
            <button onClick={handleDiagnose} disabled={!valid} style={{ width:"100%", padding:"15px 0", background:valid?"rgba(200,169,110,0.09)":"rgba(255,255,255,0.02)", border:`1px solid ${valid?G.gold:"rgba(255,255,255,0.05)"}`, color:valid?G.gold:G.textDim, borderRadius:6, cursor:valid?"pointer":"not-allowed", fontSize:11, letterSpacing:4, fontFamily:G.mono, fontWeight:700 }}>
              RUN DIAGNOSIS →
            </button>
            {error && <div style={{ marginTop:10, color:"#e07070", fontSize:10, fontFamily:G.mono }}>{error}</div>}
          </div>
        )}

        {/* ════ LOADING ════ */}
        {phase==="diagloading" && <Spinner label="DIAGNOSING" sub="REFRAMING → SCANNING MISMATCHES → BUILDING DECISION"/>}

        {/* ════ DIAGNOSIS DONE ════ */}
        {phase==="diagdone" && (
          <div style={{ animation:"wfadeUp 0.4s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div>
                <div style={{ fontSize:9, letterSpacing:3, color:G.gold, fontFamily:G.mono, marginBottom:4 }}>DIAGNOSIS COMPLETE</div>
                <div style={{ fontSize:10, color:G.textDim, fontFamily:G.mono }}>{form.sector} · {form.scale}</div>
              </div>
            </div>
            <div style={{ height:1, background:"linear-gradient(90deg,rgba(200,169,110,0.3),transparent)", marginBottom:18 }}/>
            {diagParsed.map((s,i) => <DiagSection key={s.key} section={s} idx={i} onDecisionParsed={setDecisionOptions}/>)}

            {/* Partner control on diagnosis */}
            <PartnerControlPanel
              tabId="diagnosis"
              currentLog={moduleStatuses["diagnosis"]}
              onAction={recordPartner}
              disabled={false}
            />

            <div style={{ marginTop:24, display:"flex", gap:12 }}>
              <button onClick={enterCase} style={{ flex:1, padding:"14px 0", background:"rgba(168,200,160,0.08)", border:"1px solid rgba(168,200,160,0.28)", color:"#a8c8a0", borderRadius:6, cursor:"pointer", fontSize:11, letterSpacing:4, fontFamily:G.mono, fontWeight:700 }}>
                CONTINUE CASE →
              </button>
              <button onClick={handleDiagnose} style={{ padding:"14px 22px", background:"transparent", border:"1px solid rgba(255,255,255,0.07)", color:G.textMid, borderRadius:6, cursor:"pointer", fontSize:9, letterSpacing:3, fontFamily:G.mono }}>
                REDIAGNOSE
              </button>
            </div>
          </div>
        )}

        {/* ════ CASE UI ════ */}
        {phase==="case" && (
          <div>
            <DecisionLockBar options={decisionOptions}/>

            {/* Diagnosis strip */}
            <div onClick={()=>setPhase("diagdone")} style={{ background:"rgba(200,169,110,0.025)", border:"1px solid rgba(200,169,110,0.09)", borderRadius:5, padding:"10px 16px", marginBottom:14, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:8, color:G.gold, fontFamily:G.mono, letterSpacing:2 }}>← DIAGNOSIS</div>
                {moduleStatuses["diagnosis"] && <StatusBadge log={moduleStatuses["diagnosis"]} compact/>}
              </div>
              <div style={{ fontSize:11, color:"#4a4540", fontFamily:G.serif, maxWidth:"65%", textAlign:"right" }}>
                {diagParsed.find(s=>s.key==="THE DECISION")?.content?.split("\n")?.[0]||""}
              </div>
            </div>

            {/* Tab bar */}
            <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.05)", marginBottom:24, overflowX:"auto" }}>
              {ALL_TABS.map(t => {
                const isActive = activeTab===t.id;
                const isDone = t.id==="diagnosis" ? !!diagRaw : !!caseData[t.id];
                const status = moduleStatuses[t.id];
                return (
                  <button key={t.id} onClick={()=>handleTabClick(t.id)} style={{ padding:"10px 14px", flexShrink:0, background:isActive?`${t.color}10`:"transparent", borderBottom:`2px solid ${isActive?t.color:"transparent"}`, color:isActive?t.color:G.textMid, cursor:"pointer", fontSize:8, letterSpacing:1.5, fontFamily:G.mono, display:"flex", alignItems:"center", gap:5, border:"none", borderBottom:`2px solid ${isActive?t.color:"transparent"}` }}>
                    {t.isControl && <span style={{fontSize:7}}>⬡</span>}
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                    {isDone && !status && <span style={{color:t.color,fontSize:7}}>✓</span>}
                    {status && <span style={{color:statusColor(status.action),fontSize:8}}>{statusIcon(status.action)}</span>}
                    {loadingTab===t.id && <span style={{color:t.color,fontSize:8,animation:"pulse 1s infinite"}}>●</span>}
                  </button>
                );
              })}
            </div>

            {/* ── DIAGNOSIS TAB ── */}
            {activeTab==="diagnosis" && (
              <div style={{ animation:"wslideIn 0.3s ease" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                  <div style={{ fontSize:8, letterSpacing:3, color:G.gold, fontFamily:G.mono }}>DIAGNOSIS</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    {moduleStatuses["diagnosis"] && <StatusBadge log={moduleStatuses["diagnosis"]}/>}
                    <button onClick={handleDiagnose} style={{ padding:"5px 13px", background:"transparent", border:"1px solid rgba(255,255,255,0.07)", color:G.textMid, borderRadius:4, cursor:"pointer", fontSize:8, letterSpacing:2, fontFamily:G.mono }}>REDIAGNOSE</button>
                  </div>
                </div>
                {diagParsed.map((s,i) => <DiagSection key={s.key} section={s} idx={i} onDecisionParsed={setDecisionOptions}/>)}
                <PartnerControlPanel tabId="diagnosis" currentLog={moduleStatuses["diagnosis"]} onAction={recordPartner} disabled={false}/>
              </div>
            )}

            {/* ── WORKSTREAMS TAB ── */}
            {activeTab==="workstreams" && (
              <div style={{ animation:"wslideIn 0.3s ease" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                      <div style={{ fontSize:8, letterSpacing:3, color:G.gold, fontFamily:G.mono }}>WORKSTREAMS</div>
                      {moduleStatuses["workstreams"] && <StatusBadge log={moduleStatuses["workstreams"]}/>}
                    </div>
                    <div style={{ fontSize:10, color:G.textDim }}>Decision → case structure. No generic workstreams.</div>
                  </div>
                  {caseData.workstreams && !loadingTab && (
                    <button onClick={()=>generateWorkstreams()} style={{ padding:"5px 13px", background:"transparent", border:"1px solid rgba(255,255,255,0.07)", color:G.textMid, borderRadius:4, cursor:"pointer", fontSize:8, letterSpacing:2, fontFamily:G.mono }}>REGEN</button>
                  )}
                </div>

                {loadingTab==="workstreams" && <Spinner label="BUILDING WORKSTREAMS" sub="LINKING TO DECISION → MAPPING MISMATCHES"/>}

                {!loadingTab && wsCards.length > 0 && (
                  <>
                    {wsCards.map((ws,i) => <WorkstreamCard key={ws.num} ws={ws} idx={i} color={WS_COLORS[i%WS_COLORS.length]} visible={wsVisible}/>)}
                    <PartnerControlPanel tabId="workstreams" currentLog={moduleStatuses["workstreams"]} onAction={recordPartner} disabled={false}/>
                  </>
                )}

                {!loadingTab && wsCards.length===0 && !caseData.workstreams && (
                  <div style={{ textAlign:"center", padding:"56px 0" }}>
                    <button onClick={()=>generateWorkstreams()} style={{ padding:"12px 28px", background:"rgba(200,169,110,0.08)", border:"1px solid rgba(200,169,110,0.3)", color:G.gold, borderRadius:5, cursor:"pointer", fontSize:10, letterSpacing:3, fontFamily:G.mono, fontWeight:700 }}>GENERATE WORKSTREAMS →</button>
                  </div>
                )}

                {!loadingTab && caseData.workstreams && wsCards.length===0 && (
                  <div style={{ background:G.panel, border:`1px solid ${G.border}`, borderLeft:`3px solid ${G.gold}40`, borderRadius:6, padding:"20px 24px" }}>
                    <div style={{ color:G.text, fontSize:13, lineHeight:1.9, fontFamily:G.serif, whiteSpace:"pre-wrap" }}>{caseData.workstreams.replace(/\*\*(.*?)\*\*/g,"$1")}</div>
                    <PartnerControlPanel tabId="workstreams" currentLog={moduleStatuses["workstreams"]} onAction={recordPartner} disabled={false}/>
                  </div>
                )}
              </div>
            )}

            {/* ── OTHER TABS (placeholder) ── */}
            {activeTab!=="diagnosis" && activeTab!=="workstreams" && (
              <div style={{ animation:"wslideIn 0.3s ease", textAlign:"center", padding:"72px 0" }}>
                <div style={{ fontSize:32, color:G.textDim, marginBottom:14 }}>{tab?.icon}</div>
                <div style={{ fontSize:9, letterSpacing:3, color:G.textDim, fontFamily:G.mono, marginBottom:8 }}>{tab?.label}</div>
                <div style={{ fontSize:11, color:"#242018", fontFamily:G.mono }}>Coming in next build.</div>
              </div>
            )}

            {/* Progress rail */}
            <div style={{ marginTop:48, paddingTop:16, borderTop:"1px solid rgba(255,255,255,0.04)", display:"flex", gap:3, alignItems:"center" }}>
              {ALL_TABS.map(t => {
                const done = t.id==="diagnosis" ? !!diagRaw : !!caseData[t.id];
                const status = moduleStatuses[t.id];
                const barColor = status ? statusColor(status.action) : done ? t.color : "rgba(255,255,255,0.05)";
                return <div key={t.id} title={t.label} style={{ flex:1, height:2, background:barColor, borderRadius:1, transition:"background 0.5s" }}/>;
              })}
              <span style={{ marginLeft:10, fontSize:8, color:G.textDim, fontFamily:G.mono, whiteSpace:"nowrap" }}>{completedCount}/{ALL_TABS.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign:"center", padding:"20px", borderTop:"1px solid rgba(255,255,255,0.03)" }}>
        <span style={{ fontSize:9, color:"#1a1814", fontFamily:G.mono, letterSpacing:2 }}>
          No module runs without the Decision · Weak logic must be eliminated · Human always has final control
        </span>
      </div>
    </div>
  );
}
