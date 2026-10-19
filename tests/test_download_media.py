#!/usr/bin/env python3
"""Tests for scripts/download_media.py; stdlib unittest + mock only."""

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# The scripts print Unicode arrows like the repo's other examples.
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import time  # noqa: E402

import download_media  # noqa: E402

NOW_MS = int(time.time() * 1000)


def _response(status, body=b"", headers=None):
    response = MagicMock()
    response.status_code = status
    response.content = body
    response.headers = headers or {}
    response.raise_for_status.return_value = None
    return response


class DownloadSnapshotTest(unittest.TestCase):
    def setUp(self):
        import tempfile

        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.out = Path(self._dir.name)

    @patch("download_media.requests.get")
    @patch("download_media.requests.post")
    def test_303_fetches_presigned_url_without_token(self, post, get):
        post.return_value = _response(303, headers={"location": "https://cdn.example.com/x.jpg"})
        get.return_value = _response(200, body=b"jpeg-bytes")

        path = download_media.download_snapshot("SECRET", "dev1", 1000, self.out)

        self.assertTrue(path.read_bytes() == b"jpeg-bytes")
        get.assert_called_once_with("https://cdn.example.com/x.jpg")
        # The call carries no headers at all, so the token cannot leak.
        self.assertEqual(get.call_args.kwargs, {})
        _, kwargs = post.call_args
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer SECRET")
        self.assertFalse(kwargs["allow_redirects"])

    @patch("download_media.requests.get")
    @patch("download_media.requests.post")
    def test_snapshot_404_returns_none(self, post, get):
        post.return_value = _response(404)
        self.assertIsNone(
            download_media.download_snapshot("t", "dev1", 1000, self.out)
        )
        get.assert_not_called()

    @patch("download_media.requests.get")
    @patch("download_media.requests.post")
    def test_snapshot_post_422_returns_none_without_get(self, post, get):
        # Playground: GRECO_NO_VALID_KEY on a frame it cannot decrypt.
        post.return_value = _response(422)
        self.assertIsNone(
            download_media.download_snapshot("t", "dev1", 1000, self.out)
        )
        get.assert_not_called()

    @patch("download_media.requests.get")
    @patch("download_media.requests.post")
    def test_snapshot_presigned_422_returns_none_no_file(self, post, get):
        post.return_value = _response(
            303, headers={"location": "https://cdn.example.com/x.jpg"}
        )
        get.return_value = _response(422)
        self.assertIsNone(
            download_media.download_snapshot("t", "dev1", 1000, self.out)
        )
        self.assertEqual(list(self.out.iterdir()), [])


class DownloadClipTest(unittest.TestCase):
    def setUp(self):
        import tempfile

        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.out = Path(self._dir.name)

    @patch("download_media.requests.post")
    def test_206_partial_saves_and_reports_length(self, post):
        post.return_value = _response(
            206, body=b"half", headers={"x-media-length": "8"}
        )
        path = download_media.download_clip("t", "dev1", NOW_MS - 1000, NOW_MS, self.out)
        self.assertEqual(path.read_bytes(), b"half")

    @patch("download_media.time.sleep")
    @patch("download_media.requests.post")
    def test_416_then_200_retries(self, post, sleep):
        post.side_effect = [
            _response(416),
            _response(200, body=b"clip"),
        ]
        path = download_media.download_clip("t", "dev1", NOW_MS - 1000, NOW_MS, self.out)
        self.assertEqual(post.call_count, 2)
        sleep.assert_called_once_with(5)
        self.assertEqual(path.read_bytes(), b"clip")

    @patch("download_media.time.sleep")
    @patch("download_media.requests.post")
    def test_retry_exhaustion_returns_none(self, post, sleep):
        post.return_value = _response(425)
        result = download_media.download_clip("t", "dev1", NOW_MS - 1000, NOW_MS, self.out)
        self.assertIsNone(result)
        self.assertEqual(post.call_count, len(download_media.CLIP_RETRY_SECONDS) + 1)

    @patch("download_media.requests.get")
    @patch("download_media.requests.post")
    def test_clip_303_follows_presigned_without_headers(self, post, get):
        post.return_value = _response(
            303, headers={"location": "https://cdn.example.com/clip.mp4"}
        )
        get.return_value = _response(200, body=b"clip-bytes")

        path = download_media.download_clip("t", "dev1", 1000, 2000, self.out)

        self.assertEqual(path.read_bytes(), b"clip-bytes")
        get.assert_called_once_with("https://cdn.example.com/clip.mp4")
        _, kwargs = post.call_args
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer t")
        self.assertFalse(kwargs["allow_redirects"])

    @patch("download_media.requests.post")
    def test_clip_post_422_returns_none_no_retries(self, post):
        post.return_value = _response(422)
        self.assertIsNone(
            download_media.download_clip("t", "dev1", 1000, 2000, self.out)
        )
        post.assert_called_once()

    @patch("download_media.time.sleep")
    @patch("download_media.requests.post")
    def test_429_honours_retry_after_once(self, post, sleep):
        post.side_effect = [
            _response(429, headers={"retry-after": "7"}),
            _response(200, body=b"clip"),
        ]
        path = download_media.download_clip("t", "dev1", NOW_MS - 1000, NOW_MS, self.out)
        sleep.assert_called_once_with(7)
        self.assertEqual(post.call_count, 2)
        self.assertEqual(path.read_bytes(), b"clip")


class PickEventTest(unittest.TestCase):
    events = [
        {"id": "e2", "attributes": {"start": 2000, "end": 4000}},
        {"id": "e1", "attributes": {"start": 1000, "end": 3000}},
    ]

    def test_latest_is_first_event(self):
        self.assertEqual(download_media.pick_event(self.events, None)["id"], "e2")

    def test_event_id_lookup(self):
        self.assertEqual(download_media.pick_event(self.events, "e1")["id"], "e1")


if __name__ == "__main__":
    unittest.main()
