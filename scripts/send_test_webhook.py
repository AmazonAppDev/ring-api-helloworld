#!/usr/bin/env python3
"""Send a signed Ring test webhook (v1.1 payload) to your webhook endpoint.

Ring signs each webhook with your HMAC signing key: X-Signature: sha256=<hex HMAC-SHA256 of the raw body>.
This script builds a v1.1 payload, signs the exact bytes it sends, and posts them, so you can test your
signature check end to end without waiting for a real event.
"""

import argparse
import hashlib
import hmac
import json
import time
import uuid

import requests

EVENT_TYPES = ["motion_detected", "button_press", "device_online", "device_offline", "device_added", "device_removed"]


def build_payload(event_type, device_id, account_id):
    timestamp = int(time.time() * 1000)
    attributes = {"source": device_id, "source_type": "devices", "timestamp": timestamp}
    if event_type == "motion_detected":
        attributes["sub_type"] = "human"
    return {
        "meta": {
            "version": "1.1",
            "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "request_id": str(uuid.uuid4()),
            "account_id": account_id,
        },
        "data": {
            "id": f"{device_id}_{event_type}_{timestamp}",
            "type": event_type,
            "attributes": attributes,
            "relationships": {"devices": {"links": {"self": f"/v1/devices/{device_id}"}}},
        },
    }


def send(url, key, event_type, device_id, account_id):
    raw = json.dumps(build_payload(event_type, device_id, account_id), separators=(",", ":")).encode()
    signature = "sha256=" + hmac.new(key.encode(), raw, hashlib.sha256).hexdigest()

    print(f"\n-> POST {url}")
    print(f"  X-Signature: {signature}")
    print(f"  {raw.decode()}\n")

    response = requests.post(url, data=raw, headers={"Content-Type": "application/json", "X-Signature": signature})
    print(f"<- {response.status_code} {response.text}")
    return response


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Send a signed Ring test webhook")
    parser.add_argument("--url", required=True, help="Your webhook URL, for example http://localhost:3000/api/webhook")
    parser.add_argument("--key", required=True, help="Your HMAC signing key")
    parser.add_argument("--type", default="motion_detected", choices=EVENT_TYPES, help="Event type")
    parser.add_argument("--device-id", default="ava1.ring.device.TEST", help="Device ID to put in the payload")
    parser.add_argument("--account-id", default="ava1.ring.account.TEST", help="Account ID to put in the payload")
    args = parser.parse_args()
    send(args.url, args.key, args.type, args.device_id, args.account_id)
