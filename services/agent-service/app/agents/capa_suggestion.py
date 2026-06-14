import json
from .base import BaseMGPAgent
from ..schemas import CAPAOutput

SYSTEM = """You are a CAPA planning expert. Return ONLY valid JSON:
{
  "corrective_actions": [{"action": "...", "rationale": "..."}],
  "preventive_actions": [{"action": "...", "rationale": "..."}],
  "effectiveness_criteria": ["..."],
  "suggested_owner_roles": ["qa_manager", "operator"],
  "estimated_timeline_days": 30
}"""


class CAPASuggestionAgent(BaseMGPAgent):
    agent_type = "capa_suggestion"

    async def invoke(self, input_dict: dict, **kwargs) -> dict:
        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"RCA output:\n{json.dumps(input_dict, indent=2)}"},
        ]
        content, pt, ct = await self._call_llm(messages, **kwargs)
        try:
            validated = CAPAOutput(**json.loads(content.strip()))
            return {"output": validated.model_dump(), "prompt_tokens": pt, "completion_tokens": ct}
        except Exception:
            return {"output": CAPAOutput(corrective_actions=[], preventive_actions=[], effectiveness_criteria=[], suggested_owner_roles=[], estimated_timeline_days=30).model_dump(), "prompt_tokens": pt, "completion_tokens": ct}
