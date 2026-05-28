#!/usr/bin/env python3
"""Get event history (motion, doorbell, live view) for a Ring device."""

import argparse
import json
import requests

API_BASE = "https://api.amazonvision.com"


def get_event_history(token, device_id, event_types=None):
    """Get event history for a device."""
    url = f"{API_BASE}/v1/history/devices/{device_id}/events"
    headers = {"Authorization": f"Bearer {token}"}
    params = {}
    if event_types:
        params["event_types"] = event_types

    print(f"\n→ GET {url}")
    curl_params = f'?event_types={event_types}' if event_types else ''
    print(f'  curl -X GET "{url}{curl_params}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN"\n')

    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()

    data = response.json()
    events = data.get("data", [])

    print(f"Found {len(events)} event(s):\n")
    for event in events:
        attrs = event.get("attributes", {})
        event_type = attrs.get("event_type", "unknown")
        start = attrs.get("start", "")
        print(f"  • {event_type} (start: {start})")

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
    parser = argparse.ArgumentParser(description="Get Ring device event history")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (auto-discovered if not provided)")
    parser.add_argument("--event-types", help="Filter by event types (comma-separated, e.g. motion.human,ding)")
    args = parser.parse_args()
    resolved_id = _resolve_device_id(args.token, args.device_id)
    get_event_history(args.token, resolved_id, args.event_types)
