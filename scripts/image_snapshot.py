#!/usr/bin/env python3
"""Download an image snapshot (JPEG or PNG) from a Ring camera."""

import argparse
import json
import time

import requests

API_BASE = "https://api.amazonvision.com"


def get_image_snapshot(token, device_id, output, timestamp_ms=None):
    """Request the snapshot at a moment in time and save it to `output`.

    Body: {"type": "at_timestamp", "timestamp": <epoch ms>}. The API answers 303 with the
    image location on a separate media host; the token is not sent there.
    """
    url = f"{API_BASE}/v1/devices/{device_id}/media/image/download"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    timestamp_ms = timestamp_ms or int(time.time() * 1000) - 5000
    body = {"type": "at_timestamp", "timestamp": timestamp_ms}

    print(f"\n→ POST {url}")
    print(f'  curl -i -X POST "{url}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN" \\')
    print(f'    -H "Content-Type: application/json" \\')
    print(f"    -d '{json.dumps(body)}'\n")

    response = requests.post(url, headers=headers, json=body, allow_redirects=False)
    if response.status_code not in (301, 302, 303, 307, 308):
        print(f"HTTP {response.status_code}: {response.text[:500]}")
        return None
    location = response.headers.get("Location", "")
    print(f"HTTP {response.status_code} → media host {location.split('/')[2] if location else '?'}")

    image = requests.get(location)  # no Authorization header for the media host
    content_type = image.headers.get("Content-Type", "")
    if image.status_code == 416:
        print("No media recorded at that moment (416 MEDIA_NOT_FOUND). Try a time with an event.")
        return None
    if not content_type.startswith("image/"):
        print(f"Expected an image but got HTTP {image.status_code} {content_type}:")
        print(image.text[:500])
        return None

    with open(output, "wb") as handle:
        handle.write(image.content)
    print(f"Saved {len(image.content)} bytes ({content_type}) to {output}")
    return output


def _resolve_device_id(token, device_id):
    if device_id:
        return device_id
    from list_devices import list_devices
    devices = list_devices(token)
    if not devices:
        raise SystemExit("No devices found. Cannot auto-discover device ID.")
    return devices[0]["id"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download a Ring camera image snapshot")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    parser.add_argument("--timestamp-ms", type=int,
                        help="Moment to fetch, epoch milliseconds (default: 5 seconds ago)")
    parser.add_argument("--output", default="snapshot.jpg", help="Where to save the image")
    args = parser.parse_args()
    resolved_id = _resolve_device_id(args.token, args.device_id)
    get_image_snapshot(args.token, resolved_id, args.output, args.timestamp_ms)
