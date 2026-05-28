#!/usr/bin/env python3
"""List all Ring devices accessible with your token."""

import argparse
import json
import requests

API_BASE = "https://api.amazonvision.com"


def list_devices(token):
    """List all accessible devices."""
    url = f"{API_BASE}/v1/devices"
    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n→ GET {url}")
    print(f'  curl -X GET "{url}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN"\n')

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    data = response.json()
    devices = data.get("data", [])

    print(f"Found {len(devices)} device(s):\n")
    for device in devices:
        name = device.get("attributes", {}).get("name", "Unknown")
        print(f"  • {name} (ID: {device['id']})")

    print(f"\nFull response:\n{json.dumps(data, indent=2)}")
    return devices


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="List all Ring devices")
    parser.add_argument("--token", required=True, help="Ring API access token")
    args = parser.parse_args()
    list_devices(args.token)
