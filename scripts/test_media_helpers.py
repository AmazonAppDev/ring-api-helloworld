"""Unit tests for media_helpers (stdlib unittest, no network). Run: python -m unittest test_media_helpers"""

import unittest

from media_helpers import RingMediaError, download_clip, download_snapshot, snapshot_body


class FakeResponse:
    def __init__(self, status, content=b"", headers=None, json_body=None, text=""):
        self.status_code = status
        self.content = content
        self.headers = headers or {}
        self._json = json_body
        self.text = text

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json


class FakeSession:
    def __init__(self, posts, gets=None):
        self.posts = list(posts)
        self.gets = list(gets or [])
        self.calls = []

    def post(self, url, json=None, headers=None, allow_redirects=True):
        self.calls.append(("POST", url, dict(headers or {}), json))
        return self.posts.pop(0)

    def get(self, url, headers=None):
        self.calls.append(("GET", url, dict(headers or {}), None))
        return self.gets.pop(0)


class SnapshotTests(unittest.TestCase):
    def test_follows_303_without_leaking_the_token(self):
        session = FakeSession(
            posts=[FakeResponse(303, headers={"Location": "https://s3.example/presigned.jpg", "X-Media-Timestamp": "1700000000000"})],
            gets=[FakeResponse(200, content=b"\xff\xd8jpeg", headers={"Content-Type": "image/jpeg"})],
        )
        data, ctype, ts = download_snapshot(session, "tok", "dev1", snapshot_body(timestamp_ms=1))
        self.assertEqual(data, b"\xff\xd8jpeg")
        self.assertEqual(ctype, "image/jpeg")
        self.assertEqual(ts, 1700000000000)
        method, url, headers, _ = session.calls[1]
        self.assertEqual((method, url), ("GET", "https://s3.example/presigned.jpg"))
        self.assertNotIn("Authorization", headers)

    def test_error_detail_surfaces(self):
        session = FakeSession(posts=[FakeResponse(503, json_body={"errors": [{"code": "DEVICE_OFFLINE", "detail": "Device is offline"}]})])
        with self.assertRaises(RingMediaError) as ctx:
            download_snapshot(session, "tok", "dev1", snapshot_body(start_ms=1))
        self.assertEqual(ctx.exception.status, 503)
        self.assertIn("offline", ctx.exception.detail)

    def test_body_shapes(self):
        self.assertEqual(snapshot_body(timestamp_ms=5)["type"], "at_timestamp")
        latest = snapshot_body(start_ms=1, end_ms=2)
        self.assertEqual((latest["type"], latest["start_timestamp"], latest["end_timestamp"]), ("latest_in_range", 1, 2))
        with self.assertRaises(ValueError):
            snapshot_body()


class ClipTests(unittest.TestCase):
    def test_retries_425_then_succeeds(self):
        session = FakeSession(posts=[FakeResponse(425), FakeResponse(416), FakeResponse(200, content=b"mp4")])
        slept = []
        data, attempts = download_clip(session, "tok", "dev1", 1, 20_000, sleep=slept.append, clock=lambda: 0)
        self.assertEqual((data, attempts), (b"mp4", 3))
        self.assertEqual(slept, [10, 10])

    def test_gives_up_after_max_wait(self):
        session = FakeSession(posts=[FakeResponse(425), FakeResponse(425)])
        times = iter([0, 5, 200])
        with self.assertRaises(RingMediaError) as ctx:
            download_clip(session, "tok", "dev1", 1, 20_000, max_wait_s=120, sleep=lambda s: None, clock=lambda: next(times))
        self.assertEqual(ctx.exception.status, 425)

    def test_caps_duration_at_15_minutes(self):
        session = FakeSession(posts=[FakeResponse(200, content=b"x")])
        download_clip(session, "tok", "dev1", 1, 10_000_000)
        self.assertEqual(session.calls[0][3]["duration"], 900000)

    def test_follows_redirect(self):
        session = FakeSession(posts=[FakeResponse(302, headers={"Location": "https://cdn.example/c.mp4"})], gets=[FakeResponse(200, content=b"mp4")])
        self.assertEqual(download_clip(session, "tok", "dev1", 1, 1000)[0], b"mp4")


if __name__ == "__main__":
    unittest.main()
