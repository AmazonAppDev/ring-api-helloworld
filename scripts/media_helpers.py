"""Helpers for Ring media downloads (snapshots and clips).

These encode two behaviours from the Ring Partner API docs that are easy to get wrong:

* Image snapshots: ``POST /v1/devices/{id}/media/image/download`` answers ``303 See Other`` with a
  pre-signed ``Location``. Fetch that URL *without* the bearer token (it is pre-signed, and sending
  the token to a third-party host would leak it).
* Media clips: ``POST /v1/devices/{id}/media/video/download`` can answer ``416 MEDIA_NOT_FOUND`` or
  ``425 RECORDING_NOT_READY`` while a recording is still being processed. Retry the same request
  for about two minutes after the range ends.
"""

import time

API_BASE = "https://api.amazonvision.com"
RETRYABLE_CLIP_STATUSES = (416, 425)


class RingMediaError(Exception):
    def __init__(self, status, detail):
        super().__init__(f"Ring API {status}: {detail}")
        self.status = status
        self.detail = detail


def _detail(response):
    try:
        errors = response.json().get("errors") or [{}]
        return errors[0].get("detail") or errors[0].get("code") or response.text
    except ValueError:
        return response.text


def snapshot_body(timestamp_ms=None, start_ms=None, end_ms=None, width=1920, height=1080):
    """Request body for an image snapshot. Use either timestamp_ms, or start_ms (+ optional end_ms)."""
    if timestamp_ms is not None:
        body = {"type": "at_timestamp", "timestamp": int(timestamp_ms)}
    elif start_ms is not None:
        body = {"type": "latest_in_range", "start_timestamp": int(start_ms)}
        if end_ms is not None:
            body["end_timestamp"] = int(end_ms)
    else:
        raise ValueError("pass timestamp_ms or start_ms")
    # 1920x1080 keeps Ring's fixed-size watermark small relative to the frame.
    body["image_options"] = {"format": "jpeg", "resolution": {"width": width, "height": height}}
    return body


def download_snapshot(session, token, device_id, body, api_base=API_BASE):
    """Return (bytes, content_type, media_timestamp) for a snapshot, following the 303 redirect."""
    url = f"{api_base}/v1/devices/{device_id}/media/image/download"
    response = session.post(
        url,
        json=body,
        headers={"Authorization": f"Bearer {token}"},
        allow_redirects=False,
    )
    if response.status_code != 303:
        raise RingMediaError(response.status_code, _detail(response))
    location = response.headers.get("Location")
    if not location:
        raise RingMediaError(502, "303 without a Location header")
    # Pre-signed URL: no Authorization header.
    image = session.get(location)
    if image.status_code != 200:
        raise RingMediaError(image.status_code, "pre-signed snapshot URL failed")
    media_ts = response.headers.get("X-Media-Timestamp")
    return image.content, image.headers.get("Content-Type", "image/jpeg"), int(media_ts) if media_ts else None


def download_clip(session, token, device_id, timestamp_ms, duration_ms, max_wait_s=120, poll_s=10, sleep=time.sleep, clock=time.monotonic, api_base=API_BASE):
    """Return MP4 bytes for a clip, retrying 416/425 until max_wait_s has passed."""
    url = f"{api_base}/v1/devices/{device_id}/media/video/download"
    body = {"timestamp": int(timestamp_ms), "duration": min(int(duration_ms), 900000), "video_options": {"codec": "avc"}}
    deadline = clock() + max_wait_s
    attempts = 0
    while True:
        attempts += 1
        response = session.post(url, json=body, headers={"Authorization": f"Bearer {token}"}, allow_redirects=False)
        if response.status_code in (301, 302) and response.headers.get("Location"):
            redirected = session.get(response.headers["Location"])
            if redirected.status_code == 200:
                return redirected.content, attempts
            raise RingMediaError(redirected.status_code, "clip redirect failed")
        if response.status_code in (200, 206):
            return response.content, attempts
        if response.status_code in RETRYABLE_CLIP_STATUSES and clock() < deadline:
            sleep(poll_s)
            continue
        raise RingMediaError(response.status_code, _detail(response))
