#!/usr/bin/env python3
"""Download a snapshot and a video clip for one event from a Ring device."""

import argparse
import time
from pathlib import Path

import requests

API_BASE = "https://api.amazonvision.com"

# Media Clips docs: a clip is ready only after the requested range has
# finished uploading, signalled by 416 or 425. Retry on a capped schedule
# (5, 10, 20, then 30 seconds) and stop 2 minutes after the range ends.
CLIP_RETRY_SECONDS = (5, 10, 20, 30, 30, 30)
CLIP_DEADLINE_AFTER_END_S = 120

# 422 shows up live on the Ring Playground: GRECO_NO_VALID_KEY marks one
# frame that cannot be decrypted. It is per frame, so report and skip.
NO_MEDIA = (404, 422)


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def list_events(token, device_id):
    """Get the newest page of event history for a device."""
    url = f"{API_BASE}/v1/history/devices/{device_id}/events"
    response = requests.get(url, headers=_headers(token))
    response.raise_for_status()
    return response.json().get("data", [])


def pick_event(events, event_id):
    """One event by id, or the newest one (history comes newest-first)."""
    if event_id is None:
        if not events:
            raise SystemExit("No events found for this device.")
        return events[0]
    for event in events:
        if event["id"] == event_id:
            return event
    raise SystemExit(f"Event {event_id} not found in the latest history page.")


def _fetch_presigned(response, what):
    """Follow a 303 to the pre-signed URL WITHOUT the bearer token and
    return the bytes, or None when that one frame has no media."""
    location = response.headers.get("location")
    if not location:
        raise SystemExit("303 without a Location header; nothing to download.")

    # No Authorization header here: the pre-signed host must never see it.
    media = requests.get(location)
    if media.status_code in NO_MEDIA:
        if media.status_code == 422:
            print(f"  The frame could not be decrypted (422); no {what} for that moment.")
        else:
            print(f"  No {what} for that moment ({media.status_code}).")
        return None
    media.raise_for_status()
    return media.content


def download_snapshot(token, device_id, at_ms, out_dir):
    """Snapshot at one moment. POST answers 303; the pre-signed URL that
    Location points at must be fetched WITHOUT the bearer token."""
    url = f"{API_BASE}/v1/devices/{device_id}/media/image/download"
    body = {
        "type": "at_timestamp",
        "timestamp": at_ms,
        "image_options": {"format": "jpeg"},
    }

    print(f"\n→ POST {url}  (303 to a pre-signed URL)")
    print(f'  curl -X POST "{url}" \\\n    -H "Authorization: Bearer $TOKEN" \\')
    print(f'    -H "Content-Type: application/json" \\\n    -d \'{body}\'\n')

    response = requests.post(
        url, headers=_headers(token), json=body, allow_redirects=False
    )
    if response.status_code in NO_MEDIA:
        print(f"  No snapshot available for that moment ({response.status_code}).")
        return None
    if response.status_code != 303:
        response.raise_for_status()

    image = _fetch_presigned(response, "snapshot")
    if image is None:
        return None

    path = out_dir / f"snapshot_{device_id}_{at_ms}.jpg"
    path.write_bytes(image)
    print(f"  Saved snapshot -> {path} ({len(image)} bytes)")
    return path


def download_clip(token, device_id, start_ms, end_ms, out_dir):
    """Video clip for [start_ms, end_ms]: 200 inline, 206 partial, or 303
    to a pre-signed URL (the Playground answers this way). 416/425 mean
    the clip is still uploading; retry on the schedule."""
    url = f"{API_BASE}/v1/devices/{device_id}/media/video/download"
    body = {"timestamp": start_ms, "duration": end_ms - start_ms}
    deadline = end_ms // 1000 + CLIP_DEADLINE_AFTER_END_S

    print(f"\n→ POST {url}  (200 full, 206 partial, 303 pre-signed, 416/425 = still uploading)")
    print(f'  curl -X POST "{url}" \\\n    -H "Authorization: Bearer $TOKEN" \\')
    print(f'    -H "Content-Type: application/json" \\\n    -d \'{body}\'\n')

    for delay in (*CLIP_RETRY_SECONDS, None):
        response = requests.post(
            url, headers=_headers(token), json=body, allow_redirects=False
        )
        # Rate limit: the API sends Retry-After on 429; honour it once.
        if response.status_code == 429 and "retry-after" in response.headers:
            wait = int(response.headers["retry-after"])
            print(f"  Rate limited; waiting {wait}s per Retry-After.")
            time.sleep(wait)
            response = requests.post(
                url, headers=_headers(token), json=body, allow_redirects=False
            )
        path = out_dir / f"clip_{device_id}_{start_ms}.mp4"
        if response.status_code in (200, 206):
            partial = response.status_code == 206
            expected = response.headers.get("x-media-length")
            path.write_bytes(response.content)
            extra = f" (partial, expected {expected} bytes)" if partial else ""
            print(f"  Saved clip -> {path} ({len(response.content)} bytes){extra}")
            return path
        if response.status_code == 303:
            clip = _fetch_presigned(response, "clip")
            if clip is None:
                return None
            path.write_bytes(clip)
            print(f"  Saved clip -> {path} ({len(clip)} bytes)")
            return path
        if response.status_code in NO_MEDIA:
            print(f"  No clip available for that range ({response.status_code}).")
            return None
        if response.status_code not in (416, 425):
            response.raise_for_status()
        if delay is None or time.time() > deadline:
            break
        print(f"  Clip still uploading ({response.status_code}); retrying in {delay}s.")
        time.sleep(delay)

    print("  Clip never finished uploading within the retry window.")
    return None


def _resolve_device_id(token, device_id):
    """Auto-discover first device if no device_id provided."""
    if device_id:
        return device_id
    from list_devices import list_devices

    devices = list_devices(token)
    if not devices:
        raise SystemExit("No devices found. Cannot auto-discover device ID.")
    return devices[0]["id"]


def main():
    parser = argparse.ArgumentParser(
        description="Download a snapshot and clip for one Ring device event"
    )
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--event-id", help="Event ID from event_history.py")
    group.add_argument("--latest", action="store_true", help="Use the newest event")
    parser.add_argument(
        "--out", default=".", help="Directory for downloaded files (default: current)"
    )
    args = parser.parse_args()

    device_id = _resolve_device_id(args.token, args.device_id)
    event = pick_event(list_events(args.token, device_id), args.event_id)
    attrs = event.get("attributes", {})
    start_ms = int(attrs.get("start", 0))
    end_ms = int(attrs.get("end", 0)) or start_ms
    print(f"Event {event['id']} ({attrs.get('event_type', 'unknown')}): {start_ms} to {end_ms}")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    download_snapshot(args.token, device_id, start_ms, out_dir)
    download_clip(args.token, device_id, start_ms, end_ms, out_dir)


if __name__ == "__main__":
    main()
