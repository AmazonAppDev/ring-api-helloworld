#!/usr/bin/env python3
"""Interactive Ring API explorer. Call any Ring API with your token."""

import argparse
import sys

from list_devices import list_devices
from device_status import get_device_status, _resolve_device_id
from device_capabilities import get_device_capabilities
from device_location import get_device_location
from device_configurations import get_device_configurations
from event_history import get_event_history
from user_profile import get_user_profile


def main(token):
    print("\n=== Ring API Explorer ===")
    print("Use your token to call any Ring API.\n")

    # Auto-discover device for device-specific APIs
    device_id = None

    while True:
        print("\n1. List Devices")
        print("2. Device Status")
        print("3. Device Capabilities")
        print("4. Device Location")
        print("5. Device Configurations")
        print("6. Event History")
        print("7. User Profile")
        print("8. Run All")
        print("0. Exit")

        choice = input("\nSelect an API to call: ").strip()

        if choice == "0":
            print("Goodbye!")
            sys.exit(0)

        try:
            if choice == "1":
                devices = list_devices(token)
                if devices and not device_id:
                    device_id = devices[0]["id"]
                    print(f"\n  (Using device: {device_id} for subsequent calls)")

            elif choice in ("2", "3", "4", "5", "6"):
                if not device_id:
                    print("\n  Discovering devices first...")
                    devices = list_devices(token)
                    if not devices:
                        print("  No devices found.")
                        continue
                    device_id = devices[0]["id"]
                    print(f"  Using device: {device_id}\n")

                if choice == "2":
                    get_device_status(token, device_id)
                elif choice == "3":
                    get_device_capabilities(token, device_id)
                elif choice == "4":
                    get_device_location(token, device_id)
                elif choice == "5":
                    get_device_configurations(token, device_id)
                elif choice == "6":
                    get_event_history(token, device_id)

            elif choice == "7":
                get_user_profile(token)

            elif choice == "8":
                print("\n--- Running all APIs ---")
                devices = list_devices(token)
                if devices:
                    device_id = devices[0]["id"]
                    get_device_status(token, device_id)
                    get_device_capabilities(token, device_id)
                    get_device_location(token, device_id)
                    get_device_configurations(token, device_id)
                    get_event_history(token, device_id)
                get_user_profile(token)
                print("\n--- All APIs complete ---")

            else:
                print("Invalid choice. Please select 0-8.")

        except Exception as e:
            print(f"\n  Error: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Interactive Ring API Explorer")
    parser.add_argument("--token", required=True, help="Ring API access token")
    args = parser.parse_args()
    main(args.token)
