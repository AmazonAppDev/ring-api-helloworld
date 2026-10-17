#!/usr/bin/env python3
"""Download an MP4 clip from a Ring device, retrying while the recording is still processing (416/425)."""

import argparse
import time

import requests

from media_helpers import API_BASE, download_clip


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
    parser = argparse.ArgumentParser(description="Download a Ring device clip")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    parser.add_argument("--timestamp", type=int, help="Clip start, epoch ms (default: 60 s ago)")
    parser.add_argument("--seconds", type=int, default=20, help="Clip length (max 900)")
    parser.add_argument("--max-wait", type=int, default=120, help="Seconds to keep retrying 416/425")
    parser.add_argument("--out", default="clip.mp4", help="Output file")
    args = parser.parse_args()
    device_id = _resolve_device_id(args.token, args.device_id)

    start = args.timestamp or int(time.time() * 1000) - 60_000
    url = f"{API_BASE}/v1/devices/{device_id}/media/video/download"
    print(f"\n→ POST {url}  (retries on 416 MEDIA_NOT_FOUND / 425 RECORDING_NOT_READY)")
    print(f'  curl -X POST "{url}" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d \'{{"timestamp": {start}, "duration": {args.seconds * 1000}}}\' -o clip.mp4\n')

    data, attempts = download_clip(requests.Session(), args.token, device_id, start, args.seconds * 1000, max_wait_s=args.max_wait)
    with open(args.out, "wb") as f:
        f.write(data)
    print(f"Saved {len(data)} bytes to {args.out} after {attempts} attempt(s)")


if __name__ == "__main__":
    main()
