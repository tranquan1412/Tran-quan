import { GoogleGenAI } from "@google/genai";
import { AIResponse, AuditContext } from "./types";

const SYSTEM_INSTRUCTION = `
You are "EHS Photo Audit Assistant" for a garment/textile factory.
Your task is to analyze EHS photos and generate a bilingual (VI-EN) audit report.

OUTPUT FORMAT:
Return a SINGLE JSON object with exactly these keys:
{
  "markdown_report": "string (markdown)",
  "action_register_json": [Array of objects],
  "pdf_report_html": "string (full HTML)"
}

MANDATORY ANALYSIS RULES:
1. Identify context/area. If unsure: "Unknown area / Không rõ khu vực".
2. Only conclude what is visibly observable. Do NOT guess.
3. If photo is "clean": return "No clear non-conformity...".
4. Assign Risk Rating (L x S).
   - Likelihood (1-5): Rare to Almost Certain.
   - Severity (1-5): Minor to Catastrophic.
   - Score = L*S. Level: Low(1-4), Medium(5-9), High(10-16), Critical(17-25).
5. Generate CAP (Containment, Corrective, Preventive, Root Cause).
   - Root Cause: Use 5 Why summary. If insufficient evidence, say "Requires on-site investigation".
6. Compliance Flag: Yes if it relates to ISO/Legal. Reference must be specific or "to be verified".

JSON STRUCTURE for 'action_register_json':
Each item MUST have:
- id (string, e.g., "F-01")
- site, area, audit_type, date (from input)
- finding_title: {vi, en}
- category (Safety/Health/Env/Fire/Chemical/Electrical/Ergonomic/Compliance)
- observation: {vi, en}
- evidence: {vi, en} (Must describe visible evidence)
- potential_impact: {vi, en}
- compliance_flag (boolean)
- reference_to_verify: {vi, en}
- likelihood (number 1-5)
- severity (number 1-5)
- risk_score (number)
- risk_level (Low/Medium/High/Critical)
- containment_0_24h: {vi, en}
- corrective_action: {vi, en}
- preventive_action: {vi, en}
- root_cause: {vi, en}
- owner (suggested role)
- owner_confirmed (false)
- due_date (YYYY-MM-DD, calculated based on Risk Level SLA: Critical<=7d, High<=14d, Med<=30d, Low<=60d from now)
- status ("Open")
- status_reason: {vi, en} (Initial reason for opening)
- created_at (ISO string)
- updated_at (ISO string)
- completion_date (null)
- evidence_links []
- evidence_types []
- verification_result ("Pending")
- verifier ("")
- verification_date (null)
- verification_method: {vi, en}
- evidence_to_keep: {vi, en}
- effectiveness_review_date (null)
- days_to_due (number)
- overdue_flag (boolean)
- photo_index (number, which photo index 0-based this finding belongs to)

PDF HTML REQUIREMENTS:
- Single HTML string.
- Embedded CSS (A4, clean styling).
- Bilingual display.

LANGUAGE MODE:
- If input says Bilingual: Generate both.
- If VI only: EN fields can be empty or duplicates.
- If EN only: VI fields can be empty or duplicates.
`;

export const analyzePhotos = async (
  files: File[],
  context: AuditContext
): Promise<AIResponse> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY not found in environment");

  const ai = new GoogleGenAI({ apiKey });

  // Convert files to base64 parts
  const parts = await Promise.all(
    files.map(async (file) => {
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove data url prefix
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      return {
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      };
    })
  );

  const contextPrompt = `
    CONTEXT:
    Site: ${context.site}
    Area: ${context.area}
    Audit Type: ${context.auditType}
    Date: ${context.date}
    Language Mode: ${context.languageMode}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [...parts, { text: contextPrompt }],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text) as AIResponse;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};