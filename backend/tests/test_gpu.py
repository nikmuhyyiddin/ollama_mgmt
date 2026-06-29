def test_gpu_snapshot_returns_valid_schema(client):
    resp = client.get("/api/gpu/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "gpus" in data
    assert "timestamp" in data
    assert isinstance(data["gpus"], list)


def test_gpu_snapshot_fallback_when_no_nvml(client):
    """Server must not crash if pynvml is unavailable or returns no GPUs."""
    resp = client.get("/api/gpu/stats")
    assert resp.status_code == 200


def test_gpu_each_entry_has_required_fields(client):
    resp = client.get("/api/gpu/stats")
    for gpu in resp.json()["gpus"]:
        assert "id" in gpu
        assert "name" in gpu
        assert "vram_used_mb" in gpu
        assert "vram_total_mb" in gpu
        assert "utilization_pct" in gpu
        assert "temperature_c" in gpu
