import json
from .base import BaseMGPAgent
from ..schemas import BatchAnomalyOutput

SYSTEM = """You are a batch record quality reviewer. Analyze the batch data and return ONLY valid JSON:
{
  "anomalies_detected": [{"field": "...", "value": "...", "concern": "..."}],
  "risk_level": "high|medium|low|none",
  "summary": "...",
  "recommended_actions": ["..."]
}"""


class BatchAnomalyAgent(BaseMGPAgent):
    agent_type = "batch_anomaly"

    async def invoke(self, input_dict: dict, **kwargs) -> dict:
        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Batch record:\n{json.dumps(input_dict, indent=2)}"},
        ]
        content, pt, ct = await self._call_llm(messages, **kwargs)
        try:
            validated = BatchAnomalyOutput(**json.loads(content.strip()))
            return {"output": validated.model_dump(), "prompt_tokens": pt, "completion_tokens": ct}
        except Exception:
            return {"output": BatchAnomalyOutput(anomalies_detected=[], risk_level="low", summary="Parse error", recommended_actions=[]).model_dump(), "prompt_tokens": pt, "completion_tokens": ct}
