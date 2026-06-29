def test_analytics_summary_returns_schema(client, auth_headers):
    resp = client.get("/api/analytics/summary", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    for key in ["total_requests", "avg_latency_ms", "p95_latency_ms",
                "success_count", "error_count", "distinct_ips", "top_models"]:
        assert key in data, f"Missing key: {key}"


def test_analytics_summary_token_totals(client, auth_headers):
    """Token columns logged by the proxy must roll up into summary totals."""
    from backend.db.database import get_db
    with get_db() as db:
        db.execute(
            """INSERT INTO request_logs (ip, model, prompt_tokens, completion_tokens, latency_ms, status)
               VALUES ('1.2.3.4', 'tok-test:latest', 100, 250, 12, '200')"""
        )
    data = client.get("/api/analytics/summary?days=1", headers=auth_headers).json()
    assert data["total_prompt_tokens"] >= 100
    assert data["total_completion_tokens"] >= 250
    assert data["total_tokens"] == data["total_prompt_tokens"] + data["total_completion_tokens"]
    m = next(x for x in data["top_models"] if x["model"] == "tok-test:latest")
    assert m["total_tokens"] == m["prompt_tokens"] + m["completion_tokens"] >= 350


def test_analytics_summary_default_zero(client, auth_headers):
    """With an empty DB the counters should be 0, not errors."""
    resp = client.get("/api/analytics/summary?days=1", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_requests"] >= 0


def test_analytics_timeseries(client, auth_headers):
    resp = client.get("/api/analytics/timeseries?days=7", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_analytics_heatmap(client, auth_headers):
    resp = client.get("/api/analytics/heatmap?days=7", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    for row in data:
        assert "dow" in row and "hour" in row and "count" in row
        assert 0 <= row["dow"] <= 6
        assert 0 <= row["hour"] <= 23


def test_analytics_latency_by_model(client, auth_headers):
    resp = client.get("/api/analytics/latency-by-model?days=7", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_analytics_query_logs(client, auth_headers):
    resp = client.get("/api/logs?limit=10", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "logs" in data
    assert isinstance(data["logs"], list)


def test_analytics_days_validation(client, auth_headers):
    # days < 1 should fail validation (ge=1)
    resp = client.get("/api/analytics/summary?days=0", headers=auth_headers)
    assert resp.status_code == 422

    # days > 90 should fail validation (le=90)
    resp = client.get("/api/analytics/summary?days=100", headers=auth_headers)
    assert resp.status_code == 422


def test_analytics_require_auth(client):
    for endpoint in ["/api/analytics/summary", "/api/analytics/timeseries",
                     "/api/analytics/heatmap", "/api/logs"]:
        resp = client.get(endpoint)
        assert resp.status_code == 401, f"Expected 401 on {endpoint}"
