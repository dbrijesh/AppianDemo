import json
from .base import BaseMGPAgent
from ..schemas import RCAOutput

SYSTEM = """You are a root cause analysis expert in GxP manufacturing. Return ONLY valid JSON:
{
  "root_cause": "...",
  "contributing_factors": ["..."],
  "evidence_referenced": ["..."],
  "confidence": "high|medium|low",
  "draft_text": "Full RCA narrative paragraph..."
}"""


class RCADraftingAgent(BaseMGPAgent):
    agent_type = "rca_drafting"

    async def invoke(self, input_dict: dict, **kwargs) -> dict:
        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Deviation details:\n{json.dumps(input_dict, indent=2)}"},
        ]
        content, pt, ct = await self._call_llm(messages, **kwargs)
        try:
            validated = RCAOutput(**json.loads(content.strip()))
            return {"output": validated.model_dump(), "prompt_tokens": pt, "completion_tokens": ct}
        except Exception:
            return {"output": RCAOutput(root_cause="Parse error", contributing_factors=[], evidence_referenced=[], confidence="low", draft_text=content).model_dump(), "prompt_tokens": pt, "completion_tokens": ct}
