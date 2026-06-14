"""Natural-language → SQL agent. Only executes SELECT statements."""
import json
import re
import sqlite3
import time
import asyncio
import logging
import httpx
from typing import Any

logger = logging.getLogger(__name__)

DB_SCHEMA = """
You have read-only access to the following SQLite databases via ATTACH:

-- Main agent-service database (default schema)
CREATE TABLE agent_traces (
  id TEXT PRIMARY KEY, trace_id TEXT, agent_type TEXT,
  workflow_instance_id TEXT, input_hash TEXT, prompt_summary TEXT,
  output TEXT, prompt_tokens INTEGER, completion_tokens INTEGER,
  model TEXT, steps TEXT, invoked_at DATETIME, duration_ms INTEGER
);

-- identity schema: tables prefixed with identity.
CREATE TABLE identity.users (
  id TEXT PRIMARY KEY, email TEXT, full_name TEXT,
  is_active INTEGER, created_at DATETIME
  -- hashed_password column exists but is excluded for security
);
CREATE TABLE identity.roles (id TEXT PRIMARY KEY, name TEXT, description TEXT);
CREATE TABLE identity.user_roles (user_id TEXT, role_id TEXT);

-- workflow schema: tables prefixed with workflow.
CREATE TABLE workflow.workflow_definitions (
  id TEXT PRIMARY KEY, name TEXT, slug TEXT, version INTEGER,
  is_active INTEGER, description TEXT, created_by TEXT,
  created_at DATETIME, updated_at DATETIME
);
CREATE TABLE workflow.workflow_instances (
  id TEXT PRIMARY KEY, definition_id TEXT, definition_slug TEXT,
  definition_version INTEGER, status TEXT, current_node_id TEXT,
  context TEXT,  -- JSON text; use json_extract(context, '$.key') to access fields
  started_by_id TEXT, started_by_email TEXT,
  started_at DATETIME, completed_at DATETIME,
  entity_type TEXT, entity_id TEXT
);
CREATE TABLE workflow.workflow_history (
  id TEXT PRIMARY KEY, instance_id TEXT, node_id TEXT,
  node_type TEXT, node_label TEXT,
  action TEXT, actor_id TEXT, actor_email TEXT,
  occurred_at DATETIME, payload TEXT
);

-- tasks schema: tables prefixed with tasks.
CREATE TABLE tasks.tasks (
  id TEXT PRIMARY KEY, workflow_instance_id TEXT, node_id TEXT,
  title TEXT, description TEXT, assigned_role TEXT,
  assigned_user_id TEXT, assigned_user_email TEXT,
  priority TEXT, status TEXT,  -- status: open|claimed|completed|cancelled|escalated
  form_schema TEXT, form_data TEXT,
  sla_hours INTEGER, due_at DATETIME,
  created_at DATETIME, claimed_at DATETIME, completed_at DATETIME,
  completion_signal TEXT, escalated INTEGER, comments TEXT
);

-- audit schema: tables prefixed with audit.
CREATE TABLE audit.audit_events (
  id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT,
  action TEXT, actor_id TEXT, actor_email TEXT,
  occurred_at DATETIME, created_at DATETIME,
  event_hash TEXT, previous_hash TEXT,
  payload TEXT, workflow_instance_id TEXT
);
"""

SYSTEM_PROMPT = f"""You are a SQL expert assistant for the MGP Manufacturing Governance Platform.
Your job is to translate natural language questions into safe SQLite SELECT queries.

{DB_SCHEMA}

Rules:
- Return ONLY a JSON object with two fields: "sql" and "explanation"
- "sql": a valid SQLite SELECT statement. Use schema prefix for non-default tables (e.g. identity.users, workflow.workflow_instances, tasks.tasks, audit.audit_events)
- "explanation": a plain English explanation of what the query does and a brief summary of the expected results
- ONLY SELECT statements are allowed — no INSERT, UPDATE, DELETE, DROP, CREATE, ATTACH, or PRAGMA
- Always add LIMIT to prevent huge result sets (max 100 rows)
- Use strftime for date formatting when helpful
- The context JSON column in workflow_instances contains JSON text — use json_extract() to access fields
- Do not include markdown code fences in the JSON
- Example response: {{"sql": "SELECT COUNT(*) as total FROM tasks.tasks WHERE status='open'", "explanation": "Counts all open tasks in the system."}}
"""


def _extract_sql_and_explanation(raw: str) -> tuple[str, str]:
    """Parse LLM response to get SQL and explanation."""
    raw = raw.strip()
    # Try to parse as JSON directly
    try:
        obj = json.loads(raw)
        return obj.get("sql", ""), obj.get("explanation", "")
    except json.JSONDecodeError:
        pass
    # Try to find JSON block in the text
    m = re.search(r'\{[^{}]*"sql"[^{}]*\}', raw, re.DOTALL)
    if m:
        try:
            obj = json.loads(m.group())
            return obj.get("sql", ""), obj.get("explanation", "")
        except json.JSONDecodeError:
            pass
    # Fall back: extract SQL from code fence or raw text
    code_m = re.search(r'```(?:sql)?\s*(SELECT.*?)```', raw, re.DOTALL | re.IGNORECASE)
    if code_m:
        return code_m.group(1).strip(), raw
    return raw.strip(), ""


def _is_safe_sql(sql: str) -> bool:
    """Ensure only SELECT statements are executed."""
    stripped = sql.strip().upper()
    if not stripped.startswith("SELECT"):
        return False
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
                 "ATTACH", "DETACH", "PRAGMA", "VACUUM", "EXEC"]
    for keyword in forbidden:
        # Check for keyword outside of string literals (simple check)
        if re.search(rf'\b{keyword}\b', stripped):
            return False
    return True


def _run_query(
    own_db_path: str,
    cross_db_paths: dict[str, str],
    sql: str,
    max_rows: int,
) -> tuple[list[str], list[list[Any]], int]:
    """Execute query synchronously using sqlite3 with ATTACH."""
    con = sqlite3.connect(own_db_path, uri=False)
    con.row_factory = sqlite3.Row
    try:
        for name, path in cross_db_paths.items():
            try:
                con.execute(f"ATTACH DATABASE ? AS {name}", (path,))
            except sqlite3.OperationalError:
                logger.warning("Could not attach DB %s at %s", name, path)

        # Enforce row limit
        limited_sql = sql.rstrip(";")
        if "LIMIT" not in limited_sql.upper():
            limited_sql = f"{limited_sql} LIMIT {max_rows}"

        cur = con.execute(limited_sql)
        rows_raw = cur.fetchmany(max_rows)
        columns = [d[0] for d in cur.description] if cur.description else []
        rows = [list(row) for row in rows_raw]
        return columns, rows, len(rows)
    finally:
        con.close()


async def db_query(
    question: str,
    max_rows: int,
    llm_gateway_url: str,
    model: str,
    own_db_path: str,
    cross_db_paths: dict[str, str],
) -> dict[str, Any]:
    """Main entry: NL question → SQL → execute → return result dict."""
    import os as _os
    own_db_path = _os.path.abspath(own_db_path)
    cross_db_paths = {k: _os.path.abspath(v) for k, v in cross_db_paths.items()}

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]
    body = {
        "model": model,
        "messages": messages,
        "caller_service": "agent:db_query",
        "max_tokens": 512,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{llm_gateway_url.rstrip('/')}/v1/completions", json=body)
        r.raise_for_status()
        data = r.json()

    raw_content = data.get("content", "")
    sql, explanation = _extract_sql_and_explanation(raw_content)

    if not sql:
        return {
            "sql": "", "columns": [], "rows": [], "row_count": 0,
            "execution_ms": 0, "explanation": "",
            "error": "LLM did not return a SQL query. Please rephrase your question.",
        }

    if not _is_safe_sql(sql):
        return {
            "sql": sql, "columns": [], "rows": [], "row_count": 0,
            "execution_ms": 0,
            "explanation": explanation,
            "error": "Generated query is not a SELECT statement and was blocked for safety.",
        }

    t0 = time.perf_counter()
    try:
        loop = asyncio.get_event_loop()
        columns, rows, row_count = await loop.run_in_executor(
            None, _run_query, own_db_path, cross_db_paths, sql, max_rows
        )
        execution_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "sql": sql, "columns": columns, "rows": rows,
            "row_count": row_count, "execution_ms": execution_ms,
            "explanation": explanation, "error": None,
        }
    except sqlite3.Error as exc:
        execution_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "sql": sql, "columns": [], "rows": [], "row_count": 0,
            "execution_ms": execution_ms, "explanation": explanation,
            "error": f"SQL error: {exc}",
        }
