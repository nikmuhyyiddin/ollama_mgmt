def test_list_rules_empty(client, auth_headers):
    resp = client.get("/api/access/rules", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_add_valid_rule(client, auth_headers):
    resp = client.post(
        "/api/access/rules",
        json={"cidr": "10.0.0.0/8", "action": "allow", "label": "test-lan"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cidr"] == "10.0.0.0/8"
    assert "id" in data
    return data["id"]


def test_list_rules_contains_added(client, auth_headers):
    # Add a rule first
    client.post(
        "/api/access/rules",
        json={"cidr": "192.168.100.0/24", "label": "check-list"},
        headers=auth_headers,
    )
    resp = client.get("/api/access/rules", headers=auth_headers)
    cidrs = [r["cidr"] for r in resp.json()]
    assert "192.168.100.0/24" in cidrs


def test_delete_rule(client, auth_headers):
    # Add then delete
    add_resp = client.post(
        "/api/access/rules",
        json={"cidr": "172.16.99.0/24"},
        headers=auth_headers,
    )
    rule_id = add_resp.json()["id"]
    del_resp = client.delete(f"/api/access/rules/{rule_id}", headers=auth_headers)
    assert del_resp.status_code == 204


def test_invalid_cidr_rejected(client, auth_headers):
    resp = client.post(
        "/api/access/rules",
        json={"cidr": "not-a-cidr"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_rules_require_auth(client):
    resp = client.get("/api/access/rules")
    assert resp.status_code == 401

    resp = client.post("/api/access/rules", json={"cidr": "10.0.0.0/8"})
    assert resp.status_code == 401
