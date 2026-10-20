#!/usr/bin/env python3
"""Read a Ring sensor's state: flood, freeze, contact, tamper and readings.

Sensors (Flood & Freeze, Contact) report through the same status endpoint as
cameras, but three things about them are easy to get wrong:

1. A sensor that has never checked in reports `reported_at` as the Unix epoch
   (1970-01-01T00:00:00Z), which parses fine and reads as 56 years stale.
   Treat it as "never reported", not as a date.
2. `sensor_reporting_state` reads "active" whether or not the sensor is
   currently reporting, so it is not a liveness check. Use `online` and
   `reported_at` instead.
3. Sensor events (flood_detected, freeze_detected, ...) are not in event
   history. They arrive only as webhooks, so persist each one when it lands.
"""

import argparse
import json
import requests

API_BASE = "https://api.amazonvision.com"
NEVER_REPORTED = "1970-01-01T00:00:00Z"

# (attribute in the status response, field that holds the state, label)
SENSOR_FIELDS = [
    ("flood_detection", "faulted", "Water"),
    ("freeze_detection", "faulted", "Freezing"),
    ("contact_detection", "faulted", "Open"),
    ("tamper_detection", "detected", "Tampered"),
]
# Readings returned directly in /status by the temperature & humidity sensor
# and the air quality monitor (which report no detection attributes).
READINGS = [("temperature", "Temperature", "°C"), ("humidity", "Humidity", "%"),
            ("pm2_5", "PM2.5", ""), ("co", "CO", "")]


def get_sensor_status(token, device_id):
    """Get a sensor's state and explain each field."""
    url = f"{API_BASE}/v1/devices/{device_id}/status"
    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n→ GET {url}")
    print(f'  curl -X GET "{url}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN"\n')

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    data = response.json()
    attrs = data.get("data", {}).get("attributes", {})

    reported_at = attrs.get("reported_at")
    if reported_at == NEVER_REPORTED:
        reported_at = None
    online = attrs.get("online", False)

    print(f"Online:        {'🟢 yes' if online else '🔴 no'}")
    print(f"Last reported: {reported_at or 'never (Ring returned the 1970 epoch)'}")

    found = False
    for attr, field, label in SENSOR_FIELDS:
        if attr in attrs:
            found = True
            state = attrs[attr].get(field)
            print(f"{label + ':':<15}{'⚠️  yes' if state else 'no'}")
    for attr, label, unit in READINGS:
        if attrs.get(attr) is not None:
            found = True
            print(f"{label + ':':<15}{attrs[attr]}{unit}")
    if not found:
        print("No sensor fields in this response: this device is not a sensor.")

    if "sensor_reporting_state" in attrs:
        print("\nNote: sensor_reporting_state is "
              f"\"{attrs['sensor_reporting_state'].get('value')}\" but reads \"active\" either way;"
              " it is not a liveness check.")

    print(f"\nFull response:\n{json.dumps(data, indent=2)}")
    return data


def _resolve_sensor_id(token, device_id):
    """Auto-discover the first sensor if no device_id is provided.

    The device list does not say which devices are sensors, so this checks each
    device's status for a sensor field.
    """
    if device_id:
        return device_id
    from list_devices import list_devices
    devices = list_devices(token)
    headers = {"Authorization": f"Bearer {token}"}
    for device in devices:
        url = f"{API_BASE}/v1/devices/{device['id']}/status"
        attrs = requests.get(url, headers=headers).json().get("data", {}).get("attributes", {})
        if any(attr in attrs for attr, _, _ in SENSOR_FIELDS) or any(
                attrs.get(attr) is not None for attr, _, _ in READINGS):
            return device["id"]
    raise SystemExit("No sensors found. Sensors need the Sensors scope (Early Access).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get a Ring sensor's flood, freeze, contact and tamper state")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Sensor device ID (auto-discovered if not provided)")
    args = parser.parse_args()
    resolved_id = _resolve_sensor_id(args.token, args.device_id)
    get_sensor_status(args.token, resolved_id)
