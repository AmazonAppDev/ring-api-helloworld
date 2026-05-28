#!/usr/bin/env python3
"""Get the location (country/state) of a Ring device."""

import argparse
import json
import requests

API_BASE = "https://api.amazonvision.com"


def get_device_location(token, device_id):
    """Get device location."""
    url = f"{API_BASE}/v1/devices/{device_id}/location"
    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n→ GET {url}")
    print(f'  curl -X GET "{url}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN"\n')

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    data = response.json()
    attrs = data.get("data", {}).get("attributes", {})
    country = attrs.get("country", "Unknown")
    state = attrs.get("state", "")

    location = f"{state}, {country}" if state else country
    print(f"Device location: {location}")
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
    parser = argparse.ArgumentParser(description="Get Ring device location")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    args = parser.parse_args()
    resolved_id = _resolve_device_id(args.token, args.device_id)
    get_device_location(args.token, resolved_id)
