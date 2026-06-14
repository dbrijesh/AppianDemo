"""
SpiffWorkflow 1.2.x-backed workflow executor.

Public API is identical to executor.py so service.py can swap imports with
a single line change.

Execution model
───────────────
• WorkflowInstance.context stores JSON:
    {
      "_spiff": "<serialize_json output>",   # full SpiffWorkflow state
      "_payload": {<accumulated signal data>} # user-facing context
    }

• On start  : build BpmnWorkflow from graph→BPMN, do_engine_steps(),
              dispatch first ready userTask to task-service, persist state.
• On signal : deserialise, complete the current ready task with signal data,
              do_engine_steps(), dispatch next task, persist updated state.

Node-ID mapping
───────────────
In SpiffWorkflow 1.2.x, task_spec.name equals the BPMN element's id
attribute.  Our converter assigns id=<mgp_node_id>, so
task_spec.name == mgp_node_id always holds.

Fallback
────────
If SpiffWorkflow (or lxml) is not installed the module falls back
transparently to the legacy executor.py.
"""
from __future__ import annotations

import json
import logging
import httpx
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import WorkflowInstance, WorkflowHistory
from . import state_machine as sm
from .bpmn_converter import graph_to_lxml, _PROCESS_ID

logger = logging.getLogger(__name__)

# ── Optional SpiffWorkflow import ───────────────────────────────────────────
try:
    from SpiffWorkflow.bpmn.parser.BpmnParser import BpmnParser
    from SpiffWorkflow.bpmn.workflow import BpmnWorkflow
    from SpiffWorkflow.bpmn.serializer.workflow import BpmnWorkflowSerializer
    _SPIFF_AVAILABLE = True
except ImportError:
    _SPIFF_AVAILABLE = False
    logger.warning("SpiffWorkflow not installed — using legacy executor")


# ── SpiffWorkflow helpers ────────────────────────────────────────────────────

def _parse_workflow(graph: dict) -> "BpmnWorkflow":
    """Build a fresh BpmnWorkflow from an MGP graph dict."""
    root = graph_to_lxml(graph)
    parser = BpmnParser()
    parser.add_bpmn_xml(root, filename="mgp.bpmn")
    spec = parser.get_spec(_PROCESS_ID)
    subproc = parser.get_subprocess_specs(_PROCESS_ID)
    return BpmnWorkflow(spec, subprocess_specs=subproc)


_serializer = None


def _get_serializer() -> "BpmnWorkflowSerializer":
    global _serializer
    if _serializer is None:
        _serializer = BpmnWorkflowSerializer()
    return _serializer


def _serialize(workflow: "BpmnWorkflow", user_payload: dict) -> str:
    spiff_json = _get_serializer().serialize_json(workflow)
    return json.dumps({"_spiff": spiff_json, "_payload": user_payload})


def _deserialize(context_json: str, graph: dict) -> tuple["BpmnWorkflow", dict]:
    """Return (workflow, user_payload).  Re-parses graph if stored state is absent."""
    ctx = json.loads(context_json) if context_json else {}
    user_payload = ctx.get("_payload", {})
    spiff_json = ctx.get("_spiff")
    if spiff_json:
        try:
            workflow = _get_serializer().deserialize_json(spiff_json)
            return workflow, user_payload
        except Exception as exc:
            logger.warning("spiff_deserialize_failed — rebuilding: %s", exc)
    return _parse_workflow(graph), user_payload


def _node_id(task) -> str:
    """Return the MGP node id for a SpiffWorkflow task."""
    return task.task_spec.name


# ── Shared helpers (identical to executor.py) ────────────────────────────────

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


async def _dispatch_task(instance: WorkflowInstance, node: dict, task_url: str, agent_context: dict | None = None):
    """POST to task-service to create a human task for this node."""
    cfg = node.get("config", {})
    desc = cfg.get("description", "") or cfg.get("meaning", "")
    body = {
        "workflow_instance_id": instance.id,
        "node_id": node["id"],
        "title": node.get("label", "Task"),
        "description": desc,
        "assigned_role": cfg.get("role", "operator"),
        "form_schema": cfg.get("form_schema"),
        "sla_hours": cfg.get("sla_hours", 24),
        "agent_context": agent_context or None,
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(f"{task_url}/v1/tasks", json=body)
            r.raise_for_status()
            logger.info("task_dispatched node=%s instance=%s", node["id"], instance.id)
    except Exception as exc:
        logger.error("dispatch_task_failed node=%s: %s", node["id"], exc)


async def _invoke_integration_step(
    instance: WorkflowInstance,
    node: dict,
    user_payload: dict,
) -> dict:
    """Execute an integration node HTTP call."""
    import re
    config = node.get("config", {})
    url = config.get("url", "")
    method = config.get("method", "POST").upper()
    timeout = int(config.get("timeout_seconds", 30))
    output_key = config.get("output_key", f"integration_{node['id']}")
    body_template = config.get("body_template", {})

    def _render(obj):
        if isinstance(obj, str):
            return re.sub(r'\{\{(\w+)\}\}', lambda m: str(user_payload.get(m.group(1), m.group(0))), obj)
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
            return result
    except Exception as exc:
        logger.warning("integration_failed node=%s url=%s: %s (mock)", node["id"], url, exc)
        return {
            "status": 200,
            "output_key": output_key,
            "body": {"sys_id": f"MOCK-{instance.id[:8].upper()}", "state": "registered", "mock": True},
        }


def _eval_logic_expression(expression: str, ctx: dict) -> bool:
    """Safely evaluate a logic expression against context variables."""
    try:
        safe_ctx = {k: v for k, v in ctx.items() if isinstance(v, (int, float, str, bool, type(None)))}
        for k, v in list(ctx.items()):
            if isinstance(v, dict):
                for kk, vv in v.items():
                    if isinstance(vv, (int, float, str, bool, type(None))):
                        safe_ctx[f"{k}_{kk}"] = vv
        return bool(eval(expression, {"__builtins__": {}}, safe_ctx))  # noqa: S307
    except Exception as exc:
        logger.warning("logic_eval_failed expr=%r: %s", expression, exc)
        return False


async def _invoke_agent_step(
    instance: WorkflowInstance,
    node: dict,
    user_payload: dict,
    agent_url: str,
) -> dict:
    """Call agent-service for an agent_step node and return the output dict."""
    agent_type = node.get("config", {}).get("agent_type", "")
    body = {
        "agent_type": agent_type,
        "workflow_instance_id": instance.id,
        "input": user_payload,
    }
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{agent_url}/v1/agents/invoke", json=body)
            r.raise_for_status()
            data = r.json()
            output = data.get("output", {})
            logger.info("agent_step_completed node=%s agent=%s instance=%s", node["id"], agent_type, instance.id)
            return output
    except Exception as exc:
        logger.error("agent_step_failed node=%s agent=%s: %s", node["id"], agent_type, exc)
        return {"error": str(exc), "agent_type": agent_type}


async def _advance_past_agents(
    db,
    instance: WorkflowInstance,
    workflow,
    graph: dict,
    user_payload: dict,
    task_url: str,
    agent_url: str,
    actor_id: str | None = None,
    actor_email: str | None = None,
) -> None:
    """Complete any consecutive agent_step nodes, then dispatch the next human task."""
    accumulated_agent_outputs: dict = {}

    while True:
        if workflow.is_completed():
            instance.status = "completed"
            instance.completed_at = datetime.now(timezone.utc)
            end = sm.get_node(graph, "end")
            if end:
                await _record_history(db, instance.id, end, "completed")
            break

        ready = workflow.get_ready_user_tasks()
        if not ready:
            break

        nid = _node_id(ready[0])
        node = sm.get_node(graph, nid)
        if not node:
            break

        if node["type"] == "agent_step":
            await _record_history(db, instance.id, node, "agent:invoked", actor_id=actor_id, actor_email=actor_email)
            agent_output = await _invoke_agent_step(instance, node, user_payload, agent_url)
            key = f"agent_{nid}"
            user_payload[key] = agent_output
            accumulated_agent_outputs[key] = agent_output
            # Flatten nested keys so logic node expressions like agent_cert_ai_review_risk_score work
            for k, v in agent_output.items():
                if isinstance(v, (int, float, str, bool)):
                    user_payload[f"{key}_{k}"] = v
            user_payload["signal"] = "approved"
            ready[0].set_data(**user_payload)
            workflow.complete_task_from_id(ready[0].id)
            workflow.do_engine_steps()
            await _record_history(db, instance.id, node, "agent:completed", actor_id=actor_id, actor_email=actor_email, payload=agent_output)

        elif node["type"] == "integration":
            await _record_history(db, instance.id, node, "integration:invoked", actor_id=actor_id, actor_email=actor_email)
            int_output = await _invoke_integration_step(instance, node, user_payload)
            output_key = int_output.get("output_key", f"integration_{nid}")
            user_payload[output_key] = int_output
            accumulated_agent_outputs[output_key] = int_output
            user_payload["signal"] = "completed"
            ready[0].set_data(**user_payload)
            workflow.complete_task_from_id(ready[0].id)
            workflow.do_engine_steps()
            await _record_history(db, instance.id, node, "integration:completed", actor_id=actor_id, actor_email=actor_email, payload=int_output)

        elif node["type"] == "logic":
            await _record_history(db, instance.id, node, "logic:evaluating", actor_id=actor_id, actor_email=actor_email)
            expression = node.get("config", {}).get("expression", "False")
            result = _eval_logic_expression(expression, user_payload)
            route = "true" if result else "false"
            user_payload[f"logic_{nid}_result"] = result
            user_payload[f"logic_{nid}_route"] = route
            user_payload["signal"] = route
            ready[0].set_data(**user_payload)
            workflow.complete_task_from_id(ready[0].id)
            workflow.do_engine_steps()
            await _record_history(db, instance.id, node, f"logic:routed:{route}", actor_id=actor_id, actor_email=actor_email, payload={"expression": expression, "result": result})

        else:
            # Human or esign task — dispatch and stop
            instance.current_node_id = nid
            await _record_history(db, instance.id, node, "entered")
            # Include prior form data + agent outputs so operators see full context
            ctx_for_task = {k: v for k, v in user_payload.items() if k not in ("signal", "_spiff")}
            ctx_for_task.update(accumulated_agent_outputs)
            await _dispatch_task(instance, node, task_url, agent_context=ctx_for_task or None)
            break


# ── Public API (same signatures as executor.py) ───────────────────────────────

async def enter_node(
    db: AsyncSession,
    instance: WorkflowInstance,
    graph: dict,
    node_id: str,          # start node id — SpiffWorkflow auto-advances past it
    task_url: str,
    audit_client=None,
    agent_url: str = "http://localhost:8006",
) -> WorkflowInstance:
    """Start the workflow via SpiffWorkflow and dispatch the first human task."""
    if not _SPIFF_AVAILABLE:
        from . import executor as _legacy
        return await _legacy.enter_node(db, instance, graph, node_id, task_url, audit_client, agent_url)

    workflow = _parse_workflow(graph)
    workflow.do_engine_steps()

    # Seed user_payload with any initial context (e.g. fields from the "Add Certificate" modal)
    # so the first human task's agent_context shows the submission data to the operator.
    try:
        import json as _json
        initial = _json.loads(instance.context) if instance.context else {}
        if isinstance(initial, dict) and "_payload" in initial:
            initial = initial["_payload"]
        user_payload: dict = {k: v for k, v in initial.items() if k != "_spiff" and v is not None}
    except Exception:
        user_payload = {}

    await _advance_past_agents(db, instance, workflow, graph, user_payload, task_url, agent_url)

    instance.context = _serialize(workflow, user_payload)
    await db.flush()
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
    """Advance the SpiffWorkflow on an incoming signal."""
    if not _SPIFF_AVAILABLE:
        from . import executor as _legacy
        return await _legacy.signal_instance(
            db, instance, graph, signal, actor_id, actor_email,
            payload, task_url, audit_client, agent_url,
        )

    workflow, user_payload = _deserialize(instance.context, graph)

    # Record signal on current node
    current_node = sm.get_node(graph, instance.current_node_id or "")
    if current_node:
        await _record_history(
            db, instance.id, current_node,
            f"signal:{signal}",
            actor_id=actor_id, actor_email=actor_email, payload=payload,
        )

    # Merge signal + payload into user data
    user_payload.update(payload)
    user_payload["signal"] = signal

    # Find and complete the current ready task
    ready = workflow.get_ready_user_tasks()
    if not ready:
        logger.warning("no_ready_tasks instance=%s signal=%s", instance.id, signal)
        instance.context = _serialize(workflow, user_payload)
        await db.flush()
        return instance

    current_task = ready[0]
    current_task.set_data(**user_payload)
    workflow.complete_task_from_id(current_task.id)
    workflow.do_engine_steps()

    # ── Advance past any consecutive agent_step nodes, then dispatch next human task ──
    await _advance_past_agents(
        db, instance, workflow, graph, user_payload,
        task_url, agent_url, actor_id=actor_id, actor_email=actor_email,
    )

    if instance.status == "completed" and audit_client:
        await audit_client.record(
            entity_type="workflow_instance",
            entity_id=instance.id,
            action="completed",
            actor_id=actor_id,
            actor_email=actor_email,
            workflow_instance_id=instance.id,
            payload={"outcome": signal},
        )

    instance.context = _serialize(workflow, user_payload)
    await db.flush()
    return instance
