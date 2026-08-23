"""
LLM integration for the clinic app.

Two prompts are used, exactly as specified in the project brief:

1. Pre-visit summary (run on the patient's submitted symptoms):
   "Analyse these symptoms and return: urgency level (Low / Medium / High),
    chief complaint, and three suggested questions for the doctor.
    Symptoms: <symptoms>"

2. Post-visit summary (run on the doctor's clinical notes + prescription):
   "Convert these clinical notes into a patient-friendly summary with
    medication schedule and follow-up steps: <notes>"

Both prompts additionally instruct the model to answer in strict JSON so the
response can be parsed deterministically. If USE_MOCK_LLM=true (the default,
so the app runs with no API key), a lightweight keyword-based mock stands in
for the real model. If the real call is enabled and it fails or returns
unparseable output, we fall back to a safe default and mark llm_failed=True
rather than raising - a summary must never block a booking or a visit.
"""
import json
import re
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from ..config import settings

PRE_VISIT_SYSTEM = (
    "You are a clinical intake assistant. You never diagnose. "
    "Respond ONLY with minified JSON, no markdown, no commentary, matching this shape: "
    '{"urgency_level": "Low|Medium|High", "chief_complaint": "string", '
    '"suggested_questions": ["string", "string", "string"]}'
)

POST_VISIT_SYSTEM = (
    "You rewrite clinical notes into plain language for patients. "
    "Respond ONLY with minified JSON, no markdown, no commentary, matching this shape: "
    '{"patient_summary_text": "string", '
    '"medication_schedule": [{"medication": "string", "dosage": "string", "frequency": "string"}], '
    '"follow_up_steps": "string"}'
)


class LLMError(Exception):
    pass


def _extract_json(text: str) -> dict:
    """Best-effort extraction of a JSON object even if the model adds stray text."""
    text = text.strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise LLMError(f"No JSON object found in LLM response: {text[:200]}")
    return json.loads(match.group(0))


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(LLMError),
)
def _call_anthropic(system: str, user_prompt: str) -> dict:
    try:
        import anthropic
    except ImportError as e:
        raise LLMError(f"anthropic package not installed: {e}")

    if not settings.anthropic_api_key:
        raise LLMError("ANTHROPIC_API_KEY not configured")

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=600,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = "".join(block.text for block in response.content if block.type == "text")
        return _extract_json(text)
    except Exception as e:  # network errors, rate limits, parse errors, etc.
        raise LLMError(str(e))


def _mock_pre_visit(symptoms_text: str) -> dict:
    text = symptoms_text.lower()
    high_flags = ["chest pain", "shortness of breath", "severe bleeding", "unconscious",
                  "suicidal", "stroke", "seizure", "can't breathe"]
    medium_flags = ["fever", "vomiting", "persistent", "severe pain", "dizziness"]
    if any(f in text for f in high_flags):
        urgency = "High"
    elif any(f in text for f in medium_flags):
        urgency = "Medium"
    else:
        urgency = "Low"

    chief = symptoms_text.strip().split(".")[0][:140] or "General symptoms reported"
    return {
        "urgency_level": urgency,
        "chief_complaint": chief,
        "suggested_questions": [
            "When did these symptoms first start, and have they changed over time?",
            "Have you taken any medication or home remedy for this already?",
            "Do you have any relevant medical history or allergies I should know about?",
        ],
    }


def _mock_post_visit(clinical_notes: str, prescription_text: str) -> dict:
    meds = []
    for line in prescription_text.splitlines():
        line = line.strip(" -\t")
        if not line:
            continue
        parts = re.split(r",|;", line)
        meds.append({
            "medication": parts[0].strip() if parts else line,
            "dosage": parts[1].strip() if len(parts) > 1 else "As directed",
            "frequency": parts[2].strip() if len(parts) > 2 else "Once daily",
        })
    if not meds:
        meds = [{"medication": "As discussed with your doctor", "dosage": "-", "frequency": "-"}]

    return {
        "patient_summary_text": (
            "Here's a plain-language summary of your visit: "
            + clinical_notes.strip().replace("\n", " ")[:400]
        ),
        "medication_schedule": meds,
        "follow_up_steps": "Follow the medication schedule above and contact the clinic if symptoms "
                            "worsen or don't improve within a few days.",
    }


def generate_pre_visit_summary(symptoms_text: str) -> dict:
    """Returns dict with urgency_level, chief_complaint, suggested_questions, llm_failed, raw."""
    if settings.use_mock_llm:
        data = _mock_pre_visit(symptoms_text)
        return {**data, "llm_failed": False, "raw": json.dumps(data)}

    prompt = f"Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: {symptoms_text}"
    try:
        data = _call_anthropic(PRE_VISIT_SYSTEM, prompt)
        return {
            "urgency_level": data.get("urgency_level", "Medium"),
            "chief_complaint": data.get("chief_complaint", symptoms_text[:140]),
            "suggested_questions": data.get("suggested_questions", [])[:3],
            "llm_failed": False,
            "raw": json.dumps(data),
        }
    except Exception as e:
        # Graceful degradation: doctor still gets a usable (conservative) summary.
        fallback = _mock_pre_visit(symptoms_text)
        return {**fallback, "llm_failed": True, "raw": f"LLM_ERROR: {e}"}


def generate_post_visit_summary(clinical_notes: str, prescription_text: str) -> dict:
    if settings.use_mock_llm:
        data = _mock_post_visit(clinical_notes, prescription_text)
        return {**data, "llm_failed": False, "raw": json.dumps(data)}

    prompt = f"Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: {clinical_notes}\n\nPrescription: {prescription_text}"
    try:
        data = _call_anthropic(POST_VISIT_SYSTEM, prompt)
        return {
            "patient_summary_text": data.get("patient_summary_text", ""),
            "medication_schedule": data.get("medication_schedule", []),
            "follow_up_steps": data.get("follow_up_steps", ""),
            "llm_failed": False,
            "raw": json.dumps(data),
        }
    except Exception as e:
        fallback = _mock_post_visit(clinical_notes, prescription_text)
        return {**fallback, "llm_failed": True, "raw": f"LLM_ERROR: {e}"}
