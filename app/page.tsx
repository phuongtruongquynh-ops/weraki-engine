"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

const box: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 20,
  marginTop: 18,
  background: "#fff",
};

const label: CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 8,
  color: "#666",
  fontWeight: 600,
};

const input: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 15,
  boxSizing: "border-box",
};

function extractSection(text: string, title: string) {
  const regex = new RegExp(`##\\s*${title}[\\s\\S]*?(?=\\n##\\s*\\d+\\.|$)`, "i");
  const match = text.match(regex);
  return match ? match[0].trim() : "";
}

function extractWorkstreams(text: string) {
  const section = extractSection(text, "6\\. WORKSTREAMS");
  const matches = section.match(/WORKSTREAM\s+\d+:[\s\S]*?(?=WORKSTREAM\s+\d+:|$)/gi);
  return matches || [];
}

export default function Page() {
  const [caseInput, setCaseInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reframe = extractSection(result, "1\\. REFRAME");
  const mismatch = extractSection(result, "2\\. MISMATCH");
  const modelAudit = extractSection(result, "3\\. MODEL AUDIT");
  const failurePath = extractSection(result, "4\\. FAILURE PATH");
  const decision = extractSection(result, "5\\. THE DECISION");
  const workstreams = extractWorkstreams(result);

  async function runCase() {
    setLoading(true);
    setError("");
    setResult("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caseInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Request failed.");
        return;
      }

      setResult(data.text || "");
    } catch {
      setError("Cannot connect to AI API.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "48px 24px",
        fontFamily: "Georgia, serif",
        background: "#faf8f3",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>Weraki Case Engine</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>
        Diagnosis → Decision → Workstreams → BA Tasks
      </p>

      <section style={box}>
        <label style={label}>CLIENT CASE INPUT</label>
        <textarea
          value={caseInput}
          onChange={(e) => setCaseInput(e.target.value)}
          placeholder="Example: Japanese CVS chain wants to enter Vietnam. Client asks whether the market is attractive and how to structure the feasibility study..."
          style={{
            ...input,
            minHeight: 160,
            resize: "vertical",
            lineHeight: 1.6,
          }}
        />

        <button
          onClick={runCase}
          disabled={loading || caseInput.trim().length < 20}
          style={{
            marginTop: 16,
            padding: "12px 22px",
            borderRadius: 8,
            border: "none",
            background:
              loading || caseInput.trim().length < 20 ? "#ccc" : "#111",
            color: "#fff",
            cursor:
              loading || caseInput.trim().length < 20 ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {loading ? "Running case..." : "Run Weraki Diagnosis"}
        </button>

        {error && (
          <div style={{ marginTop: 12, color: "red", fontSize: 14 }}>
            {error}
          </div>
        )}
      </section>

      {result && (
        <>
          <section style={box}>
            <h2>1. Reframe</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {reframe}
            </pre>
          </section>

          <section style={box}>
            <h2>2. Mismatch</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {mismatch}
            </pre>
          </section>

          <section style={box}>
            <h2>3. Model Audit</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {modelAudit}
            </pre>
          </section>

          <section style={box}>
            <h2>4. Failure Path</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {failurePath}
            </pre>
          </section>

          <section style={{ ...box, border: "2px solid #111" }}>
            <h2>5. The Decision</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {decision}
            </pre>
          </section>

          <section style={box}>
            <h2>6. Workstreams + BA Tasks</h2>

            {workstreams.length > 0 ? (
              workstreams.map((ws, index) => (
                <div
                  key={index}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: 16,
                    marginTop: 14,
                    background: "#fcfcfc",
                  }}
                >
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      margin: 0,
                    }}
                  >
                    {ws}
                  </pre>
                </div>
              ))
            ) : (
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                {extractSection(result, "6\\. WORKSTREAMS")}
              </pre>
            )}
          </section>

          <section style={{ ...box, background: "#111", color: "#fff" }}>
            <h2>Raw Output</h2>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {result}
            </pre>
          </section>
        </>
      )}
    </main>
  );
}
