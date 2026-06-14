import uuid
import re
import json
import time
import logging
import hashlib
import httpx
from datetime import datetime, timezone
from collections import defaultdict
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from .models import AgentTrace, AgentPipeline
from .schemas import AgentInvokeRequest, PipelineCreate, PipelineUpdate
from .agents.deviation_triage import DeviationTriageAgent
from .agents.rca_drafting import RCADraftingAgent
from .agents.capa_suggestion import CAPASuggestionAgent
from .agents.batch_anomaly import BatchAnomalyAgent
from .agents.cert_review import CertificateReviewAgent

logger = logging.getLogger(__name__)

AGENT_REGISTRY = {
    "deviation_triage": DeviationTriageAgent,
    "rca_drafting": RCADraftingAgent,
    "capa_suggestion": CAPASuggestionAgent,
    "batch_anomaly": BatchAnomalyAgent,
    "cert_review": CertificateReviewAgent,
}


# ── Pipeline CRUD ──────────────────────────────────────────────────────────────

async def create_pipeline(db: AsyncSession, data: PipelineCreate) -> AgentPipeline:
    p = AgentPipeline(name=data.name, description=data.description, pipeline=json.dumps(data.pipeline))
    db.add(p)
    await db.flush()
    return p


async def list_pipelines(db: AsyncSession) -> list[AgentPipeline]:
    result = await db.execute(select(AgentPipeline).order_by(desc(AgentPipeline.created_at)))
    return list(result.scalars().all())


async def get_pipeline(db: AsyncSession, pipeline_id: str) -> AgentPipeline | None:
    result = await db.execute(select(AgentPipeline).where(AgentPipeline.id == pipeline_id))
    return result.scalar_one_or_none()


async def update_pipeline(db: AsyncSession, p: AgentPipeline, data: PipelineUpdate) -> AgentPipeline:
    if data.name is not None:
        p.name = data.name
    if data.description is not None:
        p.description = data.description
    if data.pipeline is not None:
        p.pipeline = json.dumps(data.pipeline)
    await db.flush()
    return p


async def delete_pipeline(db: AsyncSession, p: AgentPipeline) -> None:
    await db.delete(p)
    await db.flush()


# ── Pipeline executor ──────────────────────────────────────────────────────────

async def _llm_call(messages: list, llm_url: str, model: str) -> tuple[str, int, int]:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{llm_url.rstrip('/')}/v1/completions", json={
            "model": model, "messages": messages, "caller_service": "agent:pipeline",
        })
        r.raise_for_status()
        data = r.json()
    return data["content"], data["prompt_tokens"], data["completion_tokens"]


async def _execute_node(node: dict, ctx: dict, llm_url: str, model: str) -> dict:
    t = node.get("type", "")
    cfg = node.get("config", {})

    if t == "ap_input":
        pass

    elif t == "ap_prompt":
        template = cfg.get("template", "")
        rendered = re.sub(r"\{\{(\w+)\}\}", lambda m: str(ctx.get(m.group(1), f"{{{{{m.group(1)}}}}}")), template)
        msgs = []
        sys_msg = cfg.get("system_message", "").strip()
        if sys_msg:
            msgs.append({"role": "system", "content": sys_msg})
        msgs.append({"role": cfg.get("role", "user"), "content": rendered})
        ctx["__messages__"] = msgs

    elif t == "ap_llm":
        messages = ctx.get("__messages__", [])
        content, pt, ct = await _llm_call(messages, llm_url, model)
        ctx[cfg.get("output_key", "llm_response")] = content
        ctx["__pt__"] = ctx.get("__pt__", 0) + pt
        ctx["__ct__"] = ctx.get("__ct__", 0) + ct

    elif t == "ap_extract":
        text = str(ctx.get(cfg.get("source_key", "llm_response"), ""))
        out_key = cfg.get("output_key", "extracted")
        mode = cfg.get("mode", "json")
        if mode == "json":
            m = re.search(r"\{.*\}", text, re.DOTALL)
            try:
                ctx[out_key] = json.loads(m.group()) if m else {"raw": text}
            except json.JSONDecodeError:
                ctx[out_key] = {"raw": text}
        elif mode == "field":
            src = ctx.get(cfg.get("source_key", "llm_response"))
            ctx[out_key] = src.get(cfg.get("field", "")) if isinstance(src, dict) else text
        else:
            ctx[out_key] = text

    elif t == "ap_condition":
        try:
            ctx["condition_result"] = bool(eval(cfg.get("expression", "True"), {"__builtins__": {}}, ctx))
        except Exception:
            ctx["condition_result"] = False

    elif t == "ap_output":
        mappings = cfg.get("mappings", [])
        if mappings:
            out: dict = {}
            for mapping in mappings:
                val = ctx.get(mapping.get("from", ""))
                if isinstance(val, dict):
                    out.update(val)
                elif val is not None:
                    out[mapping.get("to") or mapping.get("from", "")] = val
            ctx["__output__"] = out
        else:
            ctx["__output__"] = {k: v for k, v in ctx.items() if not k.startswith("__") and k != "condition_result"}

    elif t == "ap_http":
        url = re.sub(r"\{\{(\w+)\}\}", lambda m: str(ctx.get(m.group(1), "")), cfg.get("url", ""))
        method = cfg.get("method", "GET").upper()
        output_key = cfg.get("output_key", "http_response")
        body_template = cfg.get("body_template", "")
        rendered_body = re.sub(r"\{\{(\w+)\}\}", lambda m: str(ctx.get(m.group(1), "")), body_template)
        headers = {k: str(v) for k, v in cfg.get("headers", {}).items()}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                if method in ("POST", "PUT", "PATCH"):
                    try:
                        body_json = json.loads(rendered_body) if rendered_body else {}
                        r = await client.request(method, url, json=body_json, headers=headers)
                    except json.JSONDecodeError:
                        r = await client.request(method, url, content=rendered_body, headers=headers)
                else:
                    r = await client.request(method, url, headers=headers)
            try:
                ctx[output_key] = r.json()
            except Exception:
                ctx[output_key] = r.text
        except Exception as exc:
            ctx[output_key] = {"error": str(exc)}

    elif t == "ap_transform":
        expression = cfg.get("expression", "")
        output_key = cfg.get("output_key", "transformed")
        safe_builtins = {"len": len, "str": str, "int": int, "float": float,
                         "list": list, "dict": dict, "json": json, "bool": bool,
                         "round": round, "min": min, "max": max}
        try:
            ctx[output_key] = eval(expression, {"__builtins__": safe_builtins}, dict(ctx))
        except Exception as exc:
            ctx[output_key] = {"error": str(exc)}

    return ctx


def _topo_order(nodes: list, edges: list) -> list[str]:
    ids = [n["id"] for n in nodes]
    in_deg: dict[str, int] = {nid: 0 for nid in ids}
    adj: dict[str, list] = {nid: [] for nid in ids}
    for e in edges:
        s, t = e["source"], e["target"]
        if s in adj and t in in_deg:
            adj[s].append(t)
            in_deg[t] += 1
    queue = [nid for nid, d in in_deg.items() if d == 0]
    order: list[str] = []
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for nxt in adj[nid]:
            in_deg[nxt] -= 1
            if in_deg[nxt] == 0:
                queue.append(nxt)
    return order


async def execute_pipeline(graph: dict, input_data: dict, llm_url: str, model: str) -> tuple[dict, int, int]:
    nodes_by_id = {n["id"]: n for n in graph.get("nodes", [])}
    order = _topo_order(graph.get("nodes", []), graph.get("edges", []))
    ctx: dict = dict(input_data)
    for node_id in order:
        node = nodes_by_id.get(node_id)
        if node:
            ctx = await _execute_node(node, ctx, llm_url, model)
    output = ctx.get("__output__", {k: v for k, v in ctx.items() if not k.startswith("__") and k != "condition_result"})
    return output, ctx.get("__pt__", 0), ctx.get("__ct__", 0)


# ── Agent invocation ───────────────────────────────────────────────────────────

async def invoke_agent(
    db: AsyncSession,
    req: AgentInvokeRequest,
    llm_gateway_url: str,
    model: str,
) -> AgentTrace:
    # Replay: if trace_id provided, return logged output without calling model
    if req.replay_trace_id:
        result = await db.execute(
            select(AgentTrace).where(AgentTrace.trace_id == req.replay_trace_id)
        )
        cached = result.scalar_one_or_none()
        if cached:
            logger.info("agent_replay", extra={"trace_id": req.replay_trace_id})
            return cached

    trace_id = str(uuid.uuid4())
    input_hash = hashlib.sha256(json.dumps(req.input, sort_keys=True).encode()).hexdigest()
    t0 = time.perf_counter()

    if req.agent_type.startswith("pipeline:"):
        pipeline_id = req.agent_type.removeprefix("pipeline:")
        pipeline = await get_pipeline(db, pipeline_id)
        if not pipeline:
            raise ValueError(f"Pipeline not found: {pipeline_id}")
        output, pt, ct = await execute_pipeline(pipeline.pipeline_dict, req.input, llm_gateway_url, model)
    else:
        if req.agent_type not in AGENT_REGISTRY:
            raise ValueError(f"Unknown agent type: {req.agent_type}")
        agent_cls = AGENT_REGISTRY[req.agent_type]
        agent = agent_cls(llm_gateway_url=llm_gateway_url, model=model)
        result_dict = await agent.invoke(req.input, workflow_instance_id=req.workflow_instance_id, trace_id=trace_id)
        output = result_dict["output"]
        pt = result_dict.get("prompt_tokens", 0)
        ct = result_dict.get("completion_tokens", 0)

    duration_ms = int((time.perf_counter() - t0) * 1000)

    trace = AgentTrace(
        trace_id=trace_id,
        agent_type=req.agent_type,
        workflow_instance_id=req.workflow_instance_id,
        input_hash=input_hash,
        prompt_summary=str(req.input)[:256],
        output=json.dumps(output),
        prompt_tokens=pt,
        completion_tokens=ct,
        model=model,
        steps=json.dumps([]),
        duration_ms=duration_ms,
    )
    db.add(trace)
    await db.flush()

    logger.info(
        "agent_invoked",
        extra={
            "trace_id": trace_id,
            "agent_type": req.agent_type,
            "tokens": pt + ct,
            "duration_ms": duration_ms,
        },
    )
    return trace


async def get_trace(db: AsyncSession, trace_id: str) -> AgentTrace | None:
    result = await db.execute(select(AgentTrace).where(AgentTrace.trace_id == trace_id))
    return result.scalar_one_or_none()


async def list_traces(
    db: AsyncSession,
    agent_type: str | None = None,
    workflow_instance_id: str | None = None,
    limit: int = 50,
) -> list[AgentTrace]:
    q = select(AgentTrace)
    if agent_type:
        q = q.where(AgentTrace.agent_type == agent_type)
    if workflow_instance_id:
        q = q.where(AgentTrace.workflow_instance_id == workflow_instance_id)
    q = q.order_by(AgentTrace.invoked_at.desc()).limit(limit)
    return list((await db.execute(q)).scalars().all())
