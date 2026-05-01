export async function POST(req: Request) {
  try {
    const { caseInput } = await req.json();

    if (!caseInput || caseInput.trim().length < 20) {
      return Response.json(
        { error: "Case input is too short." },
        { status: 400 }
      );
    }

    const MASTER_PROMPT = `
You are a senior MBB consultant acting as the Weraki Strategy Engine.

Your job is NOT to answer the stated problem.
Your job is to:
1) Reframe the problem correctly
2) Identify structural mismatches
3) Force a strategic decision
4) Build a full case structure via WORKSTREAMS
5) Decompose each workstream into BA TASKS

INPUT CASE:
${caseInput}

OUTPUT STRUCTURE STRICTLY:

## 1. REFRAME
They think:
But actually:
Because:

## 2. MISMATCH
List concrete mismatches:
→ Structure ≠ State
→ Strategy ≠ Execution
→ Model ≠ Market

## 3. MODEL AUDIT
Revenue:
Scale:
Cost:

## 4. FAILURE PATH
If [core issue] is not fixed → [specific consequence] within [timeframe].

## 5. THE DECISION
They must choose:
→ Option A: [Name] — [implication]
→ Option B: [Name] — [implication]
The trade-off:

## 6. WORKSTREAMS

Design EXACTLY 4 workstreams.

For EACH workstream:

WORKSTREAM [N]: [NAME IN ALL CAPS]

Objective:
Hypothesis:
Why this matters:
Owner:
Timeline:

BA TASKS:
- Task 1
- Task 2
- Task 3
- Task 4

DECISION LINK:
Supports: Option A / Option B / Both
Because:

RULES:
- No generic consulting language
- No filler
- Every workstream must be distinct
- BA tasks must be concrete and executable
- Must force a real strategic decision
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a senior MBB consultant. Be sharp, structured, non-generic, and decision-driven.",
          },
          {
            role: "user",
            content: MASTER_PROMPT,
          },
        ],
        temperature: 0.3,
        max_tokens: 2200,
      }),
    });

    const data = await res.json();

    return Response.json({
      text: data.choices?.[0]?.message?.content || "",
    });
  } catch (error) {
    return Response.json(
      { error: "AI request failed." },
      { status: 500 }
    );
  }
}
