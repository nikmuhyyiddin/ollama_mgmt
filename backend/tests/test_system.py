def test_system_snapshot_returns_valid_schema(client):
    resp = client.get("/api/system/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "timestamp" in data
    assert "cpu" in data
    assert "memory" in data
    assert "disks" in data
    assert isinstance(data["disks"], list)


def test_system_cpu_fields(client):
    resp = client.get("/api/system/stats")
    cpu = resp.json()["cpu"]
    for field in ("percent", "count", "load_avg_1", "load_avg_5", "load_avg_15"):
        assert field in cpu


def test_system_memory_fields(client):
    resp = client.get("/api/system/stats")
    mem = resp.json()["memory"]
    for field in ("used_mb", "total_mb", "percent", "swap_used_mb", "swap_total_mb"):
        assert field in mem
    assert mem["total_mb"] >= mem["used_mb"] >= 0


def test_system_disk_entries_have_required_fields(client):
    resp = client.get("/api/system/stats")
    for disk in resp.json()["disks"]:
        for field in ("path", "used_gb", "total_gb", "percent"):
            assert field in disk
