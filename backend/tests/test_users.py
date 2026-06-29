def test_list_users_requires_admin(client, auth_headers):
    """Admin can list users."""
    resp = client.get("/api/users", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(u["username"] == "admin" for u in data)


def test_list_users_requires_auth(client):
    resp = client.get("/api/users")
    assert resp.status_code == 401


def test_get_me(client, auth_headers):
    resp = client.get("/api/users/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "admin"
    assert "role" in data


def test_create_user(client, auth_headers):
    resp = client.post(
        "/api/users",
        json={"username": "testviewer", "password": "securepass123", "role": "viewer"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "testviewer"
    assert data["role"] == "viewer"
    return data["id"]


def test_create_user_duplicate_rejected(client, auth_headers):
    # Create first
    client.post("/api/users",
                json={"username": "dupuser", "password": "password123", "role": "viewer"},
                headers=auth_headers)
    # Try to create again
    resp = client.post("/api/users",
                       json={"username": "dupuser", "password": "password123", "role": "viewer"},
                       headers=auth_headers)
    assert resp.status_code == 409


def test_create_user_short_password_rejected(client, auth_headers):
    resp = client.post("/api/users",
                       json={"username": "weakpwuser", "password": "short", "role": "viewer"},
                       headers=auth_headers)
    assert resp.status_code == 422


def test_create_user_invalid_role_rejected(client, auth_headers):
    resp = client.post("/api/users",
                       json={"username": "badrole", "password": "password123", "role": "superuser"},
                       headers=auth_headers)
    assert resp.status_code == 422


def test_delete_user(client, auth_headers):
    # Create a user to delete
    create = client.post("/api/users",
                         json={"username": "todelete", "password": "password123", "role": "viewer"},
                         headers=auth_headers)
    uid = create.json()["id"]
    resp = client.delete(f"/api/users/{uid}", headers=auth_headers)
    assert resp.status_code == 204

    # Confirm gone
    users = client.get("/api/users", headers=auth_headers).json()
    assert not any(u["id"] == uid for u in users)


def test_cannot_delete_self(client, auth_headers):
    me = client.get("/api/users/me", headers=auth_headers).json()
    resp = client.delete(f"/api/users/{me['id']}", headers=auth_headers)
    assert resp.status_code == 400


def test_change_password_wrong_current(client, auth_headers):
    resp = client.put("/api/users/me/password", json={
        "current_password": "wrongpassword",
        "new_password": "newpassword123",
    }, headers=auth_headers)
    assert resp.status_code == 401


def test_change_password_too_short(client, auth_headers):
    resp = client.put("/api/users/me/password", json={
        "current_password": "admin",
        "new_password": "short",
    }, headers=auth_headers)
    assert resp.status_code == 422


def test_users_create_requires_auth(client):
    resp = client.post("/api/users", json={
        "username": "noauth", "password": "password123", "role": "viewer"
    })
    assert resp.status_code == 401
