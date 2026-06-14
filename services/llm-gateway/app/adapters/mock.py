"""Mock LLM adapter — returns realistic-looking responses for demo/development.
Used when LLM_ADAPTER=mock in .env.local (no Ollama or vLLM needed).
"""
import json
import re
from ..schemas import CompletionRequest, CompletionResponse


# Canned responses keyed by caller_service prefix
_CERT_REVIEW = {
    "risk_score": 3,
    "risk_level": "low",
    "compliance_checklist": [
        {"item": "ISO 9001 scope definition", "status": "pass", "note": "Scope clearly defined for production line A"},
        {"item": "Quality manual version control", "status": "pass", "note": "Manual v3 submitted and current"},
        {"item": "Organizational chart", "status": "pass", "note": "Org chart uploaded, reporting lines clear"},
        {"item": "Management representative designation", "status": "review", "note": "Confirm designation in quality manual"},
        {"item": "Internal audit schedule", "status": "review", "note": "Not included in submitted documents"}
    ],
    "missing_documents": ["Internal audit schedule", "Previous certification record (if applicable)"],
    "recommendation": "approve",
    "recommendation_rationale": "Application is substantially complete with all primary documents present. Minor items (audit schedule, management rep designation) can be addressed during onsite audit.",
    "summary": "ISO 9001 certificate application from QA department is well-prepared. Low risk. Three core documents submitted. Two administrative items noted for follow-up but do not block approval."
}

_DEVIATION_TRIAGE = {
    "severity": "major",
    "risk_category": "product_quality",
    "immediate_action": "quarantine_affected_batch",
    "rca_required": True,
    "capa_required": True,
    "regulatory_notification": False,
    "summary": "Deviation requires immediate batch quarantine and root cause analysis. No regulatory notification required at this stage."
}

_DEFAULT = {
    "content": "Analysis complete. Please review the attached assessment.",
    "confidence": 0.85
}


class MockAdapter:
    """Returns pre-canned JSON responses based on the caller_service field."""

    async def complete(self, body: CompletionRequest) -> CompletionResponse:
        caller = body.caller_service or ""
        messages = body.messages or []

        # Pick response template based on caller or message content
        if "cert_review" in caller:
            response_data = _CERT_REVIEW
        elif "deviation_triage" in caller or "triage" in caller:
            response_data = _DEVIATION_TRIAGE
        else:
            # Generic: echo the last user message back as a summarized response
            last_user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
            response_data = {**_DEFAULT, "input_summary": last_user[:100]}

        content = json.dumps(response_data)
        pt = sum(len(m.get("content", "").split()) for m in messages)
        ct = len(content.split())
        return CompletionResponse(
            content=content,
            model=body.model or "mock-llm",
            prompt_tokens=pt,
            completion_tokens=ct,
            total_tokens=pt + ct,
        )

    async def list_models(self) -> list[str]:
        return ["mock-llm", "llama3.2", "mistral"]
