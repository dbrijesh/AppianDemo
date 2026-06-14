import json
from .base import BaseMGPAgent
from ..schemas import CertReviewOutput

SYSTEM = """You are a GxP regulatory compliance specialist. Analyze the certificate request and return ONLY valid JSON matching this schema:
{
  "risk_score": 1-10,
  "risk_level": "low|medium|high|critical",
  "compliance_checklist": [
    {"item": "...", "status": "pass|fail|review", "note": "..."}
  ],
  "missing_documents": ["..."],
  "recommendation": "approve|reject|request_more_info",
  "recommendation_rationale": "...",
  "summary": "..."
}
Be factual and concise. Do not include any text outside the JSON object."""


class CertificateReviewAgent(BaseMGPAgent):
    agent_type = "cert_review"

    async def invoke(self, input_dict: dict, **kwargs) -> dict:
        cert_type = input_dict.get("cert_type", "Unknown")
        applicant = input_dict.get("applicant_name", input_dict.get("applicant", "Unknown"))
        department = input_dict.get("applicant_department", "")
        scope = input_dict.get("scope_description", input_dict.get("scope", "Not provided"))
        documents = input_dict.get("documents_uploaded", input_dict.get("documents", []))

        doc_list = documents if isinstance(documents, list) else [documents]
        doc_text = "\n".join(f"- {d}" for d in doc_list) if doc_list else "- None uploaded"

        messages = [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Certificate Type: {cert_type}\n"
                    f"Applicant: {applicant}"
                    + (f" ({department})" if department else "")
                    + f"\nScope: {scope}\n"
                    f"Documents submitted:\n{doc_text}"
                ),
            },
        ]

        content, pt, ct = await self._call_llm(
            messages,
            workflow_instance_id=kwargs.get("workflow_instance_id"),
            trace_id=kwargs.get("trace_id"),
        )

        try:
            raw = json.loads(content.strip())
            validated = CertReviewOutput(**raw)
            return {"output": validated.model_dump(), "prompt_tokens": pt, "completion_tokens": ct}
        except Exception as exc:
            return {
                "output": CertReviewOutput(
                    risk_score=5,
                    risk_level="medium",
                    compliance_checklist=[{"item": "Manual review required", "status": "review", "note": str(exc)}],
                    missing_documents=[],
                    recommendation="request_more_info",
                    recommendation_rationale="AI output could not be parsed — manual QA review required.",
                    summary=f"Parse error: {exc}",
                ).model_dump(),
                "prompt_tokens": pt,
                "completion_tokens": ct,
            }
