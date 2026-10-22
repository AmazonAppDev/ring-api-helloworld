#!/usr/bin/env python3
"""Download a JPEG/PNG snapshot from a Ring device, at an event's time or the latest frame.

POST /v1/devices/{id}/media/image/download answers 303 See Other with a pre-signed
Location; the image is fetched from that URL *without* the Bearer token.

Things worth knowing (observed in the Developer Playground):
  * Ask for the resolution explicitly. Without image_options.resolution the API returned
    640x360; with 1920x1080 it returned full HD, where the fixed-size Ring watermark covers
    much less of the frame.
  * Media is only available from when access was granted. With a fresh Playground token,
    earlier timestamps fail (we've seen both 403 TIME_RANGE_NOT_AUTHORIZED and, after the 303,
    416 MEDIA_NOT_FOUND). Trigger an event simulation in the Playground first, then use that
    event's time (--event-time or --from-history).
  * A timestamp with no recording returns 416 MEDIA_NOT_FOUND (sometimes from the pre-signed
    host, after the 303).
  * Without --event-time/--from-history the script asks for the latest frame (latest_in_range).
    In the Playground this intermittently failed on the pre-signed host with
    422 GRECO_NO_VALID_KEY; --from-history is the more reliable choice there.
"""

import argparse
import sys
import time

import requests

API_BASE = "https://api.amazonvision.com"

HINTS = {
    "TIME_RANGE_NOT_AUTHORIZED": "The time is outside the window this token may access (it starts when access was "
    "granted; for Playground tokens, when the token was issued). Simulate an event in the Playground, then use "
    "--from-history.",
    "MEDIA_NOT_FOUND": "No recording exists at that time. Use the start time of an event from event_history.py "
    "(or --from-history).",
    "RECORDING_NOT_READY": "The recording isn't processed yet. Wait a few seconds and retry.",
    "REQUEST_FORBIDDEN": "This token isn't authorized for the device.",
    "GRECO_NO_VALID_KEY": "The latest-frame lookup failed (seen intermittently in the Developer Playground). Use "
    "--from-history or --event-time instead.",
}


def _error_details(response):
    """Return (code, detail) from a JSON:API error body, if there is one."""
    try:
        err = response.json().get("errors", [{}])[0]
        return err.get("code"), err.get("detail")
    except ValueError:
        return None, response.text[:200] or None


def _fail(stage, response):
    code, detail = _error_details(response)
    print(f"\n✗ {stage} failed: HTTP {response.status_code} {code or ''} {detail or ''}".rstrip())
    if code in HINTS:
        print(f"  hint: {HINTS[code]}")
    elif response.status_code == 416:
        print(f"  hint: {HINTS['MEDIA_NOT_FOUND']}")
    elif response.status_code == 401:
        print("  hint: Token expired or invalid. Playground tokens last about 30 minutes.")
    sys.exit(1)


def latest_event_time(token, device_id):
    """Start time (epoch ms) of the newest event in the device's history, or None."""
    url = f"{API_BASE}/v1/history/devices/{device_id}/events"
    response = requests.get(url, headers={"Authorization": f"Bearer {token}"})
    response.raise_for_status()
    events = response.json().get("data", [])
    return events[0]["attributes"]["start"] if events else None


def download_snapshot(token, device_id, timestamp_ms=None, width=1920, height=1080, fmt="jpeg", component_id=None):
    """Download one snapshot. Returns (bytes, headers of the image response)."""
    url = f"{API_BASE}/v1/devices/{device_id}/media/image/download"
    image_options = {"format": fmt, "resolution": {"width": width, "height": height}}
    if timestamp_ms is not None:
        body = {"type": "at_timestamp", "timestamp": int(timestamp_ms), "image_options": image_options}
    else:
        # Latest frame from the last 10 minutes (the window may be at most 24 h).
        now = int(time.time() * 1000)
        body = {"type": "latest_in_range", "start_timestamp": now - 10 * 60 * 1000, "end_timestamp": now, "image_options": image_options}
    if component_id:
        body["components"] = [{"component_id": str(component_id)}]

    print(f"\n→ POST {url}")
    print(f"  body: {body}")
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body,
        allow_redirects=False,  # follow the 303 ourselves, without the Bearer token
    )
    if response.status_code in (302, 303, 307):
        location = response.headers["Location"]
        print(f"  ← {response.status_code} → pre-signed URL (fetched without Authorization)")
        media = requests.get(location)
        if not media.ok:
            _fail("Pre-signed download", media)
    elif response.ok:
        media = response
    else:
        _fail("Snapshot request", response)
        return None, None

    return media.content, media.headers


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download a snapshot from a Ring device")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    when = parser.add_mutually_exclusive_group()
    when.add_argument("--event-time", type=int, help="Epoch ms of the frame (e.g. an event's 'start' + 1000)")
    when.add_argument("--from-history", action="store_true", help="Use the newest event in the device's history")
    parser.add_argument("--width", type=int, default=1920, help="1-1920 (default 1920)")
    parser.add_argument("--height", type=int, default=1080, help="1-1080 (default 1080)")
    parser.add_argument("--format", choices=["jpeg", "png"], default="jpeg")
    parser.add_argument("--component-id", help="Camera module on multi-camera devices")
    parser.add_argument("--out", default="snapshot.jpg", help="Output file (default snapshot.jpg)")
    args = parser.parse_args()

    device_id = args.device_id
    if not device_id:
        from list_devices import list_devices

        devices = list_devices(args.token)
        if not devices:
            raise SystemExit("No devices found.")
        device_id = devices[0]["id"]

    timestamp = args.event_time
    if args.from_history:
        start = latest_event_time(args.token, device_id)
        if start is None:
            raise SystemExit("No events in history yet. Trigger an event simulation in the Playground, then retry.")
        timestamp = start + 1000

    data, headers = download_snapshot(
        args.token, device_id, timestamp, args.width, args.height, args.format, args.component_id
    )
    with open(args.out, "wb") as f:
        f.write(data)
    print(
        f"\n✓ Saved {len(data)} bytes to {args.out} "
        f"({headers.get('Content-Type')}, X-Media-Timestamp={headers.get('X-Media-Timestamp')}, "
        f"X-Media-Origin={headers.get('X-Media-Origin')})"
    )
