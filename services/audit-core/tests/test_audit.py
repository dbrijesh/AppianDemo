import pytest
from datetime import datetime, timezone

pytestmark = pytest.mark.asyncio


async def _post(client, **kwargs):
    body = {
        "entity_type": kwargs.get("entity_type", "MR"),
        "entity_id": kwargs.get("entity_id", "MR-001"),
        "action": kwargs.get("action", "created"),
        "actor_id": "user-1",
        "actor_email": "admin@mgp.local",
        "payload": {"note": "test"},
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }
    return await client.post("/v1/events", json=body)


async def test_create_event(client):
    r = await _post(client)
    assert r.status_code == 201
    data = r.json()
    assert data["event_hash"]
    assert data["previous_hash"] is None


async def test_chain_grows(client):
    await _post(client)
    await _post(client)
    r = await _post(client)
    data = r.json()
    assert data["previous_hash"] is not None


async def test_chain_verify_valid(client):
    for _ in range(5):
        await _post(client)
    r = await client.get("/v1/chain/verify")
    assert r.status_code == 200
    assert r.json()["valid"] is True
    assert r.json()["checked"] == 5


async def test_list_events(client):
    await _post(client, entity_type="CERT", entity_id="CERT-001")
    await _post(client, entity_type="MR", entity_id="MR-001")
    r = await client.get("/v1/events?entity_type=CERT")
    assert r.json()["total"] == 1


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
