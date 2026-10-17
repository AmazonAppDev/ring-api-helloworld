#!/usr/bin/env python3
"""Download a still image from a Ring device (handles the 303 -> pre-signed URL flow)."""

import argparse
import json
import time

import requests

from media_helpers import API_BASE, download_snapshot, snapshot_body


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
    parser = argparse.ArgumentParser(description="Download a Ring device snapshot")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    parser.add_argument("--timestamp", type=int, help="Epoch ms of the frame (at_timestamp)")
    parser.add_argument("--minutes", type=int, default=10, help="Otherwise: latest frame in the last N minutes")
    parser.add_argument("--out", default="snapshot.jpg", help="Output file")
    args = parser.parse_args()
    device_id = _resolve_device_id(args.token, args.device_id)

    if args.timestamp:
        body = snapshot_body(timestamp_ms=args.timestamp)
    else:
        now = int(time.time() * 1000)
        body = snapshot_body(start_ms=now - args.minutes * 60_000, end_ms=now)

    url = f"{API_BASE}/v1/devices/{device_id}/media/image/download"
    print(f"\n→ POST {url}  (expects 303 + pre-signed Location)")
    print(f'  curl -i -X POST "{url}" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d \'{json.dumps(body)}\'\n')

    data, content_type, media_ts = download_snapshot(requests.Session(), args.token, device_id, body)
    with open(args.out, "wb") as f:
        f.write(data)
    print(f"Saved {len(data)} bytes ({content_type}) to {args.out}; media timestamp: {media_ts}")


if __name__ == "__main__":
    main()
