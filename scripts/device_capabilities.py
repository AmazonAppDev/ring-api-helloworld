#!/usr/bin/env python3
"""Get the capabilities of a Ring device (video codecs, motion detection, etc.)."""

import argparse
import json
import requests

API_BASE = "https://api.amazonvision.com"


def get_device_capabilities(token, device_id):
    """Get device capabilities."""
    url = f"{API_BASE}/v1/devices/{device_id}/capabilities"
    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n→ GET {url}")
    print(f'  curl -X GET "{url}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN"\n')

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    data = response.json()
    attrs = data.get("data", {}).get("attributes", {})

    if "video" in attrs:
        video = attrs["video"]
        print(f"Video: {video.get('max_resolution', '?')}p, codecs: {video.get('codecs', [])}")
    if "motion_detection" in attrs:
        print(f"Motion Detection: supported")
    if "image_enhancements" in attrs:
        enhancements = attrs["image_enhancements"].get("configurations", [])
        print(f"Image Enhancements: {', '.join(enhancements)}")

    print(f"\nFull response:\n{json.dumps(data, indent=2)}")
    return data


def _resolve_device_id(token, device_id):
    if device_id:
        return device_id
    from list_devices import list_devices
    devices = list_devices(token)
    if not devices:
        raise SystemExit("No devices found.")
    return devices[0]["id"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get Ring device capabilities")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    args = parser.parse_args()
    resolved_id = _resolve_device_id(args.token, args.device_id)
    get_device_capabilities(args.token, resolved_id)
