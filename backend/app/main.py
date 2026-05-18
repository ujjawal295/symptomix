from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os, json
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = FastAPI(title="Symptomix")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ── schemas ───────────────────────────────────────────────────────────────────
class Message(BaseModel):
    role: str
    content: str

class SymptomRequest(BaseModel):
    message: str
    conversation_history: List[Message] = []
    language: Optional[str] = "english"

# ── emergency keywords ────────────────────────────────────────────────────────
EMERGENCY_WORDS = [
    "chest pain", "cannot breathe", "can't breathe", "difficulty breathing",
    "shortness of breath", "heart attack", "stroke", "unconscious",
    "seizure", "severe bleeding", "overdose", "suicidal", "kill myself",
    "heart is racing", "collapsed", "fainted",
]

# ── system prompt (multi-turn aware) ─────────────────────────────────────────
SYSTEM_PROMPT = """
You are a clinical triage assistant. Your goal is to accurately assess symptom urgency.

STRICT RULES:
1. Respond ONLY in valid JSON. No text outside JSON ever.
2. For vague or incomplete symptoms, ALWAYS ask 1 follow-up question before triaging.
3. You need AT LEAST these details before final triage:
   - Severity (mild / moderate / severe)
   - Duration (how long)
   - Any associated symptoms (fever, nausea, etc.)
4. If any of the above is missing from the conversation, set needs_more_info=true and ask for it.
5. Once you have enough context (2+ exchanges), provide the final triage.
6. Never diagnose. Only assess urgency.

TRIAGE LEVELS:
- red:   Life-threatening. ER immediately.
- amber: See a doctor within 24-48 hours.
- green: Monitor at home safely.

QUICK REPLY CHIPS:
When asking a follow-up, suggest 2-4 quick answer options the user can tap.
Put them in the quick_replies array as short strings (under 20 chars each).

RESPONSE FORMAT (always return exactly this JSON):
{
  "triage_level": "red" | "amber" | "green",
  "confidence": 0.0 to 1.0,
  "conditions": ["max 3 general conditions"],
  "advice": "clear 2-3 sentence advice",
  "follow_up_question": "ONE specific question to ask, or null",
  "quick_replies": ["option1", "option2", "option3"],
  "needs_more_info": true | false
}

EXAMPLES:

User says "I have a headache" (vague, missing severity/duration):
{
  "triage_level": "green",
  "confidence": 0.4,
  "conditions": [],
  "advice": "",
  "follow_up_question": "How severe is your headache and how long have you had it?",
  "quick_replies": ["Mild, few hours", "Moderate, since morning", "Severe, sudden onset", "Worst of my life"],
  "needs_more_info": true
}

User says "I have a fever" (vague):
{
  "triage_level": "amber",
  "confidence": 0.5,
  "conditions": [],
  "advice": "",
  "follow_up_question": "What is your temperature and how many days have you had the fever?",
  "quick_replies": ["Below 100°F, 1 day", "100-102°F, 2 days", "Above 103°F, 3+ days"],
  "needs_more_info": true
}

User says "Moderate headache since morning, no other symptoms" (enough info):
{
  "triage_level": "green",
  "confidence": 0.85,
  "conditions": ["tension headache", "dehydration", "eye strain"],
  "advice": "Rest in a quiet room and drink plenty of water. Take paracetamol if needed. If the headache worsens or you develop vision changes, see a doctor.",
  "follow_up_question": null,
  "quick_replies": [],
  "needs_more_info": false
}
"""

# ── chat endpoint ─────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "running", "service": "Symptom Triage AI"}

@app.post("/api/triage/chat")
def chat(req: SymptomRequest):
    msg_lower = req.message.lower()

    # Stage 1: Emergency bypass
    if any(kw in msg_lower for kw in EMERGENCY_WORDS):
        return {
            "reply": "🚨 This sounds like a medical emergency. Call 112 immediately or go to the nearest ER. Do not wait.",
            "triage": {
                "triage_level": "red",
                "confidence": 1.0,
                "conditions": ["potential medical emergency"],
                "advice": "Call 112 or go to the nearest Emergency Room immediately.",
                "follow_up_question": None,
                "quick_replies": [],
                "needs_more_info": False,
                "emergency_override": True,
            },
            "session_id": "emergency"
        }

    # Stage 2: Build conversation for Groq
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in req.conversation_history:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": req.message})

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,
            max_tokens=600,
            response_format={"type": "json_object"},
        )

        raw  = response.choices[0].message.content
        data = json.loads(raw)

        needs_more   = data.get("needs_more_info", False)
        follow_up    = data.get("follow_up_question")
        quick_replies = data.get("quick_replies", [])
        reply        = follow_up if needs_more and follow_up else data.get("advice", "")

        return {
            "reply": reply,
            "quick_replies": quick_replies if needs_more else [],
            "triage": None if needs_more else {
                "triage_level":       data.get("triage_level", "amber"),
                "confidence":         float(data.get("confidence", 0.7)),
                "conditions":         data.get("conditions", []),
                "advice":             data.get("advice", ""),
                "follow_up_question": follow_up,
                "quick_replies":      [],
                "needs_more_info":    False,
                "emergency_override": False,
            },
            "session_id": "session-1"
        }

    except Exception as e:
        print(f"LLM error: {e}")
        return {
            "reply": "I couldn't analyze your symptoms right now. Please consult a doctor if concerned.",
            "quick_replies": [],
            "triage": {
                "triage_level": "amber",
                "confidence": 0.5,
                "conditions": [],
                "advice": "Please consult a doctor if you are concerned.",
                "follow_up_question": None,
                "quick_replies": [],
                "needs_more_info": False,
                "emergency_override": False,
            },
            "session_id": "error"
        }
