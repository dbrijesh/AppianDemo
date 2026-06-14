import json
from .base import BaseMGPAgent
from ..schemas import DeviationTriageOutput

SYSTEM = """You are a GxP quality specialist. Analyze the deviation and return ONLY valid JSON matching this schema:
{
  "severity": "critical|major|minor",
  "severity_rationale": "...",
  "probable_root_causes": ["..."],
  "recommended_capa_types": ["..."],
  "requires_immediate_action": true|false,
  "summary": "..."
}
Be factual, concise. Do not include any text outside the JSON object."""


class DeviationTriageAgent(BaseMGPAgent):
    agent_type = "deviation_triage"

    async def invoke(self, input_dict: dict, **kwargs) -> dict:
        description = input_dict.get("description", "")
        product = input_dict.get("product", "unknown")
        batch = input_dict.get("batch_id", "unknown")

        messages = [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": f"Deviation in product '{product}', batch '{batch}':\n\n{description}",
            },
        ]

        content, pt, ct = await self._call_llm(
            messages,
            workflow_instance_id=kwargs.get("workflow_instance_id"),
            trace_id=kwargs.get("trace_id"),
        )

        try:
            raw = json.loads(content.strip())
            validated = DeviationTriageOutput(**raw)
            return {"output": validated.model_dump(), "prompt_tokens": pt, "completion_tokens": ct}
        except Exception as exc:
            return {
                "output": DeviationTriageOutput(
                    severity="major",
                    severity_rationale="Parse error — manual review required",
                    probable_root_causes=["Unknown — model output could not be parsed"],
                    recommended_capa_types=["Manual investigation"],
                    requires_immediate_action=True,
                    summary=str(exc),
                ).model_dump(),
                "prompt_tokens": pt,
                "completion_tokens": ct,
            }
