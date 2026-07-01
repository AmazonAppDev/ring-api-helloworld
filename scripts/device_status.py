#!/usr/bin/env python3
"""Get the online/offline status of a Ring device."""

import argparse
import json
import requests

API_BASE = "https://api.amazonvision.com"


def get_device_status(token, device_id):
    """Get device online/offline status."""
    url = f"{API_BASE}/v1/devices/{device_id}/status"
    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n→ GET {url}")
    print(f'  curl -X GET "{url}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN"\n')

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    data = response.json()
    online = data.get("data", {}).get("attributes", {}).get("online", False)
    print(f"Device status: {'🟢 Online' if online else '🔴 Offline'}")
    print(f"\nFull response:\n{json.dumps(data, indent=2)}")
    return data


def _resolve_device_id(token, device_id):
    """Auto-discover first device if no device_id provided."""
    if device_id:
        return device_id
    from list_devices import list_devices
    devices = list_devices(token)
    if not devices:
        raise SystemExit("No devices found. Cannot auto-discover device ID.")
    return devices[0]["id"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get Ring device status")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    args = parser.parse_args()
    resolved_id = _resolve_device_id(args.token, args.device_id)
    get_device_status(args.token, resolved_id)
