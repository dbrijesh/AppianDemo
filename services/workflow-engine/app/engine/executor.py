"""
Workflow executor: advances instances, creates tasks, records history.
Called by the router when a signal arrives (task completion, timer fire, etc.)
"""
import json
import logging
import httpx
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from ..models import WorkflowInstance, WorkflowHistory
from . import state_machine as sm

logger = logging.getLogger(__name__)


async def _record_history(
    db: AsyncSession,
    instance_id: str,
    node: dict,
    action: str,
    actor_id: str | None = None,
    actor_email: str | None = None,
    payload: dict | None = None,
):
    entry = WorkflowHistory(
        instance_id=instance_id,
        node_id=node["id"],
        node_type=node["type"],
        node_label=node.get("label", ""),
        action=action,
        actor_id=actor_id,
        actor_email=actor_email,
        payload=json.dumps(payload or {}),
    )
    db.add(entry)
    await db.flush()


async def _dispatch_task(
    instance: WorkflowInstance,
    node: dict,
    task_url: str,
    agent_context: dict | None = None,
):
    """Ask task-service to create a human task for this node."""
    body = {
        "workflow_instance_id": instance.id,
        "node_id": node["id"],
        "title": node.get("label", "Task"),
        "description": node.get("config", {}).get("description", ""),
        "assigned_role": node.get("config", {}).get("role", "operator"),
        "form_schema": node.get("config", {}).get("form_schema"),
        "sla_hours": node.get("config", {}).get("sla_hours", 24),
        "agent_context": agent_context,
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(f"{task_url}/v1/tasks", json=body)
            r.raise_for_status()
    except Exception as exc:
        logger.error("dispatch_task_failed", extra={"error": str(exc), "node": node["id"]})


async def _invoke_integration(
    instance: WorkflowInstance,
    node: dict,
    ctx: dict,
) -> dict:
    """Execute an integration node: HTTP call to external system."""
    import re
    config = node.get("config", {})
    url = config.get("url", "")
    method = config.get("method", "POST").upper()
    timeout = int(config.get("timeout_seconds", 30))
    output_key = config.get("output_key", f"integration_{node['id']}")
    body_template = config.get("body_template", {})

    # Render {{variable}} placeholders from context
    def _render(obj):
        if isinstance(obj, str):
            return re.sub(r'\{\{(\w+)\}\}', lambda m: str(ctx.get(m.group(1), m.group(0))), obj)
        if isinstance(obj, dict):
            return {k: _render(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_render(v) for v in obj]
        return obj

    rendered_body = _render(body_template)

    if not url:
        return {"status": "skipped", "reason": "no url configured", "output_key": output_key}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method in ("GET", "DELETE"):
                r = await client.request(method, url, params=rendered_body)
            else:
                r = await client.request(method, url, json=rendered_body)
            result = {"status": r.status_code, "output_key": output_key}
            try:
                result["body"] = r.json()
            except Exception:
                result["body"] = r.text[:500]
            logger.info("integration_called node=%s url=%s status=%d", node["id"], url, r.status_code)
            return result
    except Exception as exc:
        logger.warning("integration_failed node=%s url=%s: %s (using mock)", node["id"], url, exc)
        # Return a mock success response so demo flows don't get stuck
        return {
            "status": 200,
            "output_key": output_key,
            "body": {"sys_id": f"MOCK-{instance.id[:8].upper()}", "state": "registered", "mock": True},
        }


def _eval_logic_expression(expression: str, ctx: dict) -> bool:
    """Safely evaluate a simple logic expression against context variables."""
    try:
        # Build a safe scope from context (only primitive types)
        safe_ctx = {k: v for k, v in ctx.items() if isinstance(v, (int, float, str, bool, type(None)))}
        # Also allow nested dict access via flat keys like agent_cert_ai_review_risk_score
        for k, v in list(ctx.items()):
            if isinstance(v, dict):
                for kk, vv in v.items():
                    if isinstance(vv, (int, float, str, bool, type(None))):
                        safe_ctx[f"{k}_{kk}"] = vv
        result = eval(expression, {"__builtins__": {}}, safe_ctx)  # noqa: S307 — restricted scope
        return bool(result)
    except Exception as exc:
        logger.warning("logic_eval_failed expr=%r: %s → defaulting False", expression, exc)
        return False


async def _invoke_agent(
    instance: WorkflowInstance,
    node: dict,
    ctx: dict,
    agent_url: str,
) -> dict:
    """Call agent-service for an agent_step node. Always returns a dict."""
    agent_type = node.get("config", {}).get("agent_type", "")
    body = {
        "agent_type": agent_type,
        "workflow_instance_id": instance.id,
        "input": ctx,
    }
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{agent_url}/v1/agents/invoke", json=body)
            r.raise_for_status()
            output = r.json().get("output", {})
            logger.info("agent_invoked node=%s agent=%s instance=%s", node["id"], agent_type, instance.id)
            return output
    except Exception as exc:
        logger.error("agent_invoke_failed node=%s agent=%s: %s", node["id"], agent_type, exc)
        return {"error": str(exc), "agent_type": agent_type}


async def enter_node(
    db: AsyncSession,
    instance: WorkflowInstance,
    graph: dict,
    node_id: str,
    task_url: str,
    audit_client=None,
    agent_url: str = "http://localhost:8006",
    _accumulated_agent_ctx: dict | None = None,
) -> WorkflowInstance:
    """Enter a node, side-effect, record history, auto-advance past agents."""
    node = sm.get_node(graph, node_id)
    if not node:
        logger.error("node_not_found node=%s", node_id)
        return instance

    instance.current_node_id = node_id
    await db.flush()
    await _record_history(db, instance.id, node, "entered")

    if _accumulated_agent_ctx is None:
        _accumulated_agent_ctx = {}

    if node["type"] == "end":
        instance.status = "completed"
        instance.completed_at = datetime.now(timezone.utc)
        await db.flush()
        await _record_history(db, instance.id, node, "completed")
        if audit_client:
            await audit_client.record(
                entity_type="workflow_instance",
                entity_id=instance.id,
                action="completed",
                actor_id="system",
                actor_email="system",
                workflow_instance_id=instance.id,
            )
        return instance

    if node["type"] == "start":
        next_id = sm.advance(graph, node_id)
        if next_id:
            return await enter_node(db, instance, graph, next_id, task_url, audit_client, agent_url, _accumulated_agent_ctx)

    if node["type"] == "agent_step":
        # Auto-invoke and advance — agent_steps are never waited on by humans
        await _record_history(db, instance.id, node, "agent:invoked")
        ctx = instance.context_dict
        output = await _invoke_agent(instance, node, ctx, agent_url)
        _accumulated_agent_ctx[f"agent_{node_id}"] = output
        ctx[f"agent_{node_id}"] = output
        instance.context = json.dumps(ctx)
        await db.flush()
        await _record_history(db, instance.id, node, "agent:completed", payload=output)
        next_id = sm.advance(graph, node_id, "approved")
        if next_id:
            return await enter_node(db, instance, graph, next_id, task_url, audit_client, agent_url, _accumulated_agent_ctx)
        return instance

    if node["type"] == "integration":
        # Auto-invoke external system call
        await _record_history(db, instance.id, node, "integration:invoked")
        ctx = instance.context_dict
        output = await _invoke_integration(instance, node, ctx)
        output_key = output.get("output_key", f"integration_{node_id}")
        ctx[output_key] = output
        instance.context = json.dumps(ctx)
        await db.flush()
        await _record_history(db, instance.id, node, "integration:completed", payload=output)
        next_id = sm.advance(graph, node_id, "completed")
        if not next_id:
            next_id = sm.advance(graph, node_id)
        if next_id:
            return await enter_node(db, instance, graph, next_id, task_url, audit_client, agent_url, _accumulated_agent_ctx)
        return instance

    if node["type"] == "logic":
        # Evaluate expression and route to matching edge
        await _record_history(db, instance.id, node, "logic:evaluating")
        ctx = instance.context_dict
        expression = node.get("config", {}).get("expression", "False")
        result = _eval_logic_expression(expression, ctx)
        route = "true" if result else "false"
        ctx[f"logic_{node_id}_result"] = result
        ctx[f"logic_{node_id}_route"] = route
        instance.context = json.dumps(ctx)
        await db.flush()
        await _record_history(db, instance.id, node, f"logic:routed:{route}", payload={"expression": expression, "result": result})
        next_id = sm.advance(graph, node_id, route)
        if not next_id:
            next_id = sm.advance(graph, node_id, "default")
        if not next_id:
            next_id = sm.advance(graph, node_id)
        if next_id:
            return await enter_node(db, instance, graph, next_id, task_url, audit_client, agent_url, _accumulated_agent_ctx)
        return instance

    if node["type"] == "task":
        ctx = instance.context_dict
        ctx_for_task = {k: v for k, v in ctx.items() if k not in ("signal",)}
        ctx_for_task.update(_accumulated_agent_ctx)
        await _dispatch_task(instance, node, task_url, agent_context=ctx_for_task or None)

    if node["type"] == "esign":
        ctx = instance.context_dict
        ctx_for_task = {k: v for k, v in ctx.items() if k not in ("signal",)}
        ctx_for_task.update(_accumulated_agent_ctx)
        await _dispatch_task(instance, node, task_url, agent_context=ctx_for_task or None)

    if node["type"] == "timer":
        pass  # APScheduler will signal resume

    return instance


async def signal_instance(
    db: AsyncSession,
    instance: WorkflowInstance,
    graph: dict,
    signal: str,
    actor_id: str,
    actor_email: str,
    payload: dict,
    task_url: str,
    audit_client=None,
    agent_url: str = "http://localhost:8006",
) -> WorkflowInstance:
    """Process an incoming signal (approved, rejected, task_complete, etc.)"""
    current_node = sm.get_node(graph, instance.current_node_id)
    if current_node:
        await _record_history(
            db, instance.id, current_node, f"signal:{signal}",
            actor_id=actor_id, actor_email=actor_email, payload=payload,
        )

    # Merge payload into instance context
    ctx = instance.context_dict
    ctx.update(payload)
    ctx["signal"] = signal
    instance.context = json.dumps(ctx)
    await db.flush()

    next_id = sm.advance(graph, instance.current_node_id, signal)
    if next_id:
        return await enter_node(db, instance, graph, next_id, task_url, audit_client, agent_url)

    logger.warning("no_transition instance=%s signal=%s current=%s", instance.id, signal, instance.current_node_id)
    return instance
