"""
Convert MGP JSON graph → BPMN 2.0 XML for SpiffWorkflow.

Node type mapping:
  start       → bpmn:startEvent
  end         → bpmn:endEvent
  task        → bpmn:userTask  (role/form_schema via mgp: extension)
  gateway     → bpmn:exclusiveGateway
  agent_step  → bpmn:userTask  (mgp:type="agent_step")
  esign       → bpmn:userTask  (mgp:type="esign")
  timer       → bpmn:userTask  (mgp:type="timer", proper timer support later)

Gateway edges with a condition become conditionExpression elements.
The last outgoing edge of each gateway without a positive condition is
made the gateway default (no conditionExpression, referenced by default=).
"""
from __future__ import annotations

import json
from collections import defaultdict
from lxml import etree as lxml_etree


_BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
_MGP  = "http://mgp.local/ns/1.0"
_PROCESS_ID = "MGPProcess"


def _esc(s: str) -> str:
    """XML-escape a string for use in attributes."""
    return (s.replace("&", "&amp;")
             .replace('"', "&quot;")
             .replace("<", "&lt;")
             .replace(">", "&gt;"))


def _mgp_extension(node_type: str, config: dict) -> str:
    """Return an mgp:config extension element carrying node metadata."""
    data = {"type": node_type}
    if config:
        data.update(config)
    payload = _esc(json.dumps(data))
    return (
        f'<bpmn:extensionElements>'
        f'<mgp:config xmlns:mgp="{_MGP}">{payload}</mgp:config>'
        f'</bpmn:extensionElements>'
    )


def graph_to_bpmn(graph: dict) -> str:
    """Return BPMN 2.0 XML string for the given MGP workflow graph."""
    nodes = {n["id"]: n for n in graph.get("nodes", [])}
    edges = graph.get("edges", [])

    # Build incoming/outgoing edge lists per node
    incoming: dict[str, list[str]] = defaultdict(list)
    outgoing: dict[str, list[str]] = defaultdict(list)
    for e in edges:
        outgoing[e["source"]].append(e["id"])
        incoming[e["target"]].append(e["id"])

    # For each gateway/logic node, decide which outgoing edge is the "default" flow
    gateway_default: dict[str, str] = {}
    for nid, node in nodes.items():
        if node["type"] not in ("gateway", "logic"):
            continue
        out_edges = [e for e in edges if e["source"] == nid]
        if node["type"] == "logic":
            # For logic nodes, false branch is the default fallback
            default_edge = (
                next((e for e in out_edges if e.get("condition") == "false"), None)
                or next((e for e in out_edges if e.get("condition") == "default"), None)
                or (out_edges[-1] if out_edges else None)
            )
        else:
            default_edge = (
                next((e for e in out_edges if not e.get("condition")), None)
                or next((e for e in out_edges if e.get("condition") == "default"), None)
                or (out_edges[-1] if out_edges else None)
            )
        if default_edge:
            gateway_default[nid] = default_edge["id"]

    parts: list[str] = []

    # ── Nodes ──────────────────────────────────────────────────────────────
    for nid, node in nodes.items():
        ntype  = node["type"]
        label  = _esc(node.get("label", nid))
        config = node.get("config", {})

        def _io() -> str:
            inn = "".join(f'<bpmn:incoming>{eid}</bpmn:incoming>' for eid in incoming[nid])
            out = "".join(f'<bpmn:outgoing>{eid}</bpmn:outgoing>' for eid in outgoing[nid])
            return inn + out

        if ntype == "start":
            parts.append(
                f'<bpmn:startEvent id="{nid}" name="{label}">'
                f'{_io()}</bpmn:startEvent>'
            )

        elif ntype == "end":
            parts.append(
                f'<bpmn:endEvent id="{nid}" name="{label}">'
                f'{_io()}</bpmn:endEvent>'
            )

        elif ntype == "gateway":
            default_attr = f' default="{gateway_default[nid]}"' if nid in gateway_default else ""
            parts.append(
                f'<bpmn:exclusiveGateway id="{nid}" name="{label}"{default_attr}>'
                f'{_io()}</bpmn:exclusiveGateway>'
            )

        elif ntype == "integration":
            # integration → userTask with single outgoing edge (auto-executed)
            ext = _mgp_extension(ntype, config)
            parts.append(
                f'<bpmn:userTask id="{nid}" name="{label}">'
                f'{_io()}{ext}</bpmn:userTask>'
            )

        elif ntype == "logic":
            # logic → exclusiveGateway so SpiffWorkflow supports multiple outgoing edges.
            # Executor sets signal="true"|"false"; condition expressions match on that.
            default_attr = f' default="{gateway_default[nid]}"' if nid in gateway_default else ""
            parts.append(
                f'<bpmn:exclusiveGateway id="{nid}" name="{label}"{default_attr}>'
                f'{_io()}</bpmn:exclusiveGateway>'
            )

        else:
            # task / agent_step / esign / timer → all map to userTask
            ext = _mgp_extension(ntype, config)
            parts.append(
                f'<bpmn:userTask id="{nid}" name="{label}">'
                f'{_io()}{ext}</bpmn:userTask>'
            )

    # ── Sequence flows ─────────────────────────────────────────────────────
    for edge in edges:
        src_node = nodes.get(edge["source"])
        is_gateway_default = (
            src_node
            and src_node["type"] == "gateway"
            and gateway_default.get(edge["source"]) == edge["id"]
        )

        condition = edge.get("condition", "")
        src_node = nodes.get(edge["source"], {})
        src_type = src_node.get("type", "")

        if is_gateway_default:
            cond_xml = ""
        elif src_type == "logic" and condition == "true":
            # Use the logic node's Python expression directly as the BPMN condition
            logic_expr = src_node.get("config", {}).get("expression", "False")
            # Flatten nested dict keys so expressions like agent_cert_ai_review_risk_score work
            flatten_prefix = (
                "import json as _j; "
                "[locals().update({f'{k}_{kk}': vv for kk, vv in v.items()}) "
                " for k, v in locals().items() if isinstance(v, dict) and not k.startswith('_')]; "
            )
            cond_xml = f'<bpmn:conditionExpression>{_esc(logic_expr)}</bpmn:conditionExpression>'
        elif src_type == "logic" and condition in ("false", "default"):
            cond_xml = ""  # false / default handled by gateway default attribute
        elif condition and condition not in ("default", "completed"):
            cond_xml = f'<bpmn:conditionExpression>signal == "{_esc(condition)}"</bpmn:conditionExpression>'
        else:
            cond_xml = ""

        parts.append(
            f'<bpmn:sequenceFlow id="{edge["id"]}" '
            f'sourceRef="{edge["source"]}" targetRef="{edge["target"]}">'
            f'{cond_xml}</bpmn:sequenceFlow>'
        )

    process_body = "\n    ".join(parts)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:mgp="{_MGP}"
  id="Definitions_1"
  targetNamespace="http://mgp.local"
  exporter="MGP Platform"
  exporterVersion="1.0">
  <bpmn:process id="{_PROCESS_ID}" isExecutable="true">
    {process_body}
  </bpmn:process>
</bpmn:definitions>"""


def graph_to_lxml(graph: dict):
    """Return an lxml Element tree for the given MGP graph (for SpiffWorkflow parser)."""
    xml_str = graph_to_bpmn(graph)
    return lxml_etree.fromstring(xml_str.encode("utf-8"))
