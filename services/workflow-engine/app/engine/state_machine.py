"""
Lightweight deterministic state machine.
A workflow graph is {nodes: [...], edges: [...]} where each node has:
  id, type, label, config
Node types: start | task | gateway | timer | agent_step | esign | integration | logic | end

Edges: {id, source, target, condition?}
  condition on gateway edges: "approved" | "rejected" | "default"
"""
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

NODE_TYPES = {"start", "task", "gateway", "timer", "agent_step", "esign", "integration", "logic", "end"}


def validate_graph(graph: dict) -> list[str]:
    """Return list of validation errors (empty = valid)."""
    errors = []
    nodes = {n["id"]: n for n in graph.get("nodes", [])}
    edges = graph.get("edges", [])

    if not any(n["type"] == "start" for n in nodes.values()):
        errors.append("Graph must have exactly one 'start' node")
    if not any(n["type"] == "end" for n in nodes.values()):
        errors.append("Graph must have at least one 'end' node")

    node_ids = set(nodes.keys())
    for e in edges:
        if e["source"] not in node_ids:
            errors.append(f"Edge {e['id']} references unknown source {e['source']}")
        if e["target"] not in node_ids:
            errors.append(f"Edge {e['id']} references unknown target {e['target']}")

    for n in nodes.values():
        if n["type"] not in NODE_TYPES:
            errors.append(f"Node {n['id']} has unknown type {n['type']}")

    return errors


def get_start_node(graph: dict) -> dict | None:
    for n in graph.get("nodes", []):
        if n["type"] == "start":
            return n
    return None


def get_outgoing_edges(graph: dict, node_id: str, condition: str | None = None) -> list[dict]:
    edges = [e for e in graph.get("edges", []) if e["source"] == node_id]
    if condition:
        matching = [e for e in edges if e.get("condition") == condition]
        if matching:
            return matching
        # fall back to default edge
        return [e for e in edges if e.get("condition") == "default" or not e.get("condition")]
    return edges


def get_node(graph: dict, node_id: str) -> dict | None:
    for n in graph.get("nodes", []):
        if n["id"] == node_id:
            return n
    return None


def advance(graph: dict, current_node_id: str, signal: str | None = None) -> str | None:
    """Return the next node_id after current_node given a signal/condition."""
    edges = get_outgoing_edges(graph, current_node_id, signal)
    if not edges:
        return None
    return edges[0]["target"]
