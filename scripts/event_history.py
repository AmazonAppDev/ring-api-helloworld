#!/usr/bin/env python3
"""Get event history (motion, doorbell, live view) for a Ring device."""

import argparse
import json
from urllib.parse import quote, unquote, urlsplit

import requests

API_BASE = "https://api.amazonvision.com"


def get_event_history(token, device_id, event_types=None, max_pages=1):
    """Get up to max_pages of event history; keep the single-page default."""
    if isinstance(max_pages, bool) or not isinstance(max_pages, int) or max_pages < 1:
        raise ValueError("max_pages must be a positive integer")
    url = f"{API_BASE}/v1/history/devices/{quote(device_id, safe='')}/events"
    headers = {"Authorization": f"Bearer {token}"}
    params = {}
    if event_types:
        params["event_types"] = event_types

    print(f"\n→ GET {url}")
    curl_params = f'?event_types={event_types}' if event_types else ''
    print(f'  curl -X GET "{url}{curl_params}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN"\n')

    endpoint_path = urlsplit(url).path
    events = []
    visited = set()
    repeated = False
    for page in range(max_pages):
        if url in visited:
            repeated = True
            break
        visited.add(url)
        response = requests.get(url, headers=headers, params=params, timeout=30,
                                allow_redirects=False)
        response.raise_for_status()
        if response.status_code != 200:
            raise ValueError("Expected HTTP 200 from Ring event history")
        data = response.json()
        events.extend(data.get("data") or [])
        next_link = (data.get("links") or {}).get("next")
        if not next_link or page + 1 == max_pages:
            break
        # Ring supplies a relative URL containing the original filters and cursor.
        # Keep the bearer token scoped to this device's Ring history endpoint.
        next_parts = urlsplit(next_link)
        if (not next_link.startswith("/") or next_link.startswith("//")
                or any(ord(char) < 32 or ord(char) == 127 for char in next_link)
                or next_parts.scheme or next_parts.netloc or next_parts.fragment
                or unquote(next_parts.path, errors="strict")
                != unquote(endpoint_path, errors="strict")):
            raise ValueError("Unexpected event-history continuation URL")
        # Build from the trusted origin/path, copying only the API's query.
        url = API_BASE + endpoint_path
        if next_parts.query:
            url += "?" + next_parts.query
        params = None

    data = {**data, "data": events}
    if repeated:
        print("Warning: Ring repeated an event-history page; stopped with partial "
              "results. links.next retains the repeated continuation.")
    elif next_link:
        print(f"Stopped after {max_pages} page(s); links.next is available for continuation.")

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
    parser.add_argument("--max-pages", type=int, default=1,
                        help="Maximum number of history pages to fetch (default: 1)")
    args = parser.parse_args()
    if args.max_pages < 1:
        parser.error("--max-pages must be a positive integer")
    resolved_id = _resolve_device_id(args.token, args.device_id)
    get_event_history(args.token, resolved_id, args.event_types, args.max_pages)
