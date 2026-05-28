#!/usr/bin/env python3
"""Get your Ring user profile (Account ID, name, email)."""

import argparse
import json
import requests

API_BASE = "https://api.amazonvision.com"


def get_user_profile(token):
    """Get the authenticated user's profile."""
    url = f"{API_BASE}/v1/users/me"
    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n→ GET {url}")
    print(f'  curl -X GET "{url}" \\')
    print(f'    -H "Authorization: Bearer $TOKEN"\n')

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    data = response.json()
    attrs = data.get("data", {}).get("attributes", {})
    account_id = data.get("data", {}).get("id", "Unknown")

    print(f"Account ID: {account_id}")
    print(f"Name: {attrs.get('first_name', '')} {attrs.get('last_name', '')}")
    print(f"Email: {attrs.get('email', 'N/A')}")

    print(f"\nFull response:\n{json.dumps(data, indent=2)}")
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get Ring user profile")
    parser.add_argument("--token", required=True, help="Ring API access token")
    args = parser.parse_args()
    get_user_profile(args.token)
