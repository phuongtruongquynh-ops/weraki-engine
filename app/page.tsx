"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────
type CaseData = Record<string, string | undefined>;

type Workstream = {
  num: string;
  name: string;
  objective: string;
  keyQuestion: string;
  whyMatters: string;
  owner: string;
  timeline: string;
  supports: string;
  because: string;
};

// ─────────────────────────────────────────
// BASIC STYLES (FIX TYPESCRIPT ERROR)
// ─────────────────────────────────────────
const inp: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 5,
  color: "#d4cfc8",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const lbl: CSSProperties = {
  fontSize: 10,
  color: "#8a8480",
  marginBottom: 6,
};

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export default function Page() {
  // FORM
  const [form, setForm] = useState({
    sector: "",
    scale: "",
    brief: "",
  });

  // STATE
  const [caseData, setCaseData] = useState<CaseData>({});
  const [wsCards, setWsCards] = useState<Workstream[]>([]);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  // ───────────────────────────────────────
  // MOCK API (để tránh lỗi fetch lúc build)
  // ───────────────────────────────────────
  const fakeWorkstreams = (): Workstream[] => [
    {
      num: "1",
      name: "REVENUE BREAK",
      objective: "Find revenue leak",
      keyQuestion: "Where is money lost?",
      whyMatters: "Core mismatch",
      owner: "CEO",
      timeline: "2w",
      supports: "A",
      because: "Fix revenue first",
    },
  ];

  // ───────────────────────────────────────
  // ACTION
  // ───────────────────────────────────────
  const generateWorkstreams = () => {
    setLoadingTab("workstreams");

    setTimeout(() => {
      setWsCards(fakeWorkstreams());
      setCaseData((p) => ({ ...p, workstreams: "done" }));
      setLoadingTab(null);
    }, 800);
  };

  const handleTabClick = (tabId: string) => {
    if (tabId === "workstreams" && !caseData.workstreams) {
      generateWorkstreams();
    }
  };

  // ───────────────────────────────────────
  // UI
  // ───────────────────────────────────────
  return (
    <div style={{ padding: 40 }}>
      <h2>Weraki Engine (Clean Build)</h2>

      {/* INPUT */}
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Sector</label>
        <select
          value={form.sector}
          onChange={(e) =>
            setForm((f) => ({ ...f, sector: e.target.value }))
          }
          style={inp}
        >
          <option value="">Select...</option>
          <option value="retail">Retail</option>
        </select>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Problem</label>
        <textarea
          value={form.brief}
          onChange={(e) =>
            setForm((f) => ({ ...f, brief: e.target.value }))
          }
          style={{ ...inp, minHeight: 80 }}
        />
      </div>

      <button onClick={() => handleTabClick("workstreams")}>
        Generate Workstreams
      </button>

      {/* LOADING */}
      {loadingTab && <p>Loading...</p>}

      {/* RESULT */}
      {wsCards.map((ws) => (
        <div
          key={ws.num}
          style={{
            border: "1px solid #333",
            padding: 12,
            marginTop: 12,
          }}
        >
          <b>{ws.name}</b>
          <div>{ws.objective}</div>
        </div>
      ))}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
