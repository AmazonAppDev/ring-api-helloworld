#!/usr/bin/env python3
"""Open a WHEP live view session from your terminal, without a browser.

The web app negotiates live view inside the browser. This script does the same three HTTP
steps directly, so you can inspect the SDP answer, see which codecs and ICE candidates the
device offers, and close the session cleanly:

    POST /v1/devices/{id}/media/streaming/whep/sessions   (SDP offer -> SDP answer)
    -> Location: the session URL
    DELETE <session URL>                                  (always close it)

With --frames it also receives the media with aiortc and reports the resolution and frame
rate you actually get, which the SDP answer alone does not tell you.
"""

import argparse
import asyncio
import json
import sys
import time
import urllib.parse

import requests

API_BASE = "https://api.amazonvision.com"
SDP = "application/sdp"
FINGERPRINT = ":".join(["AB"] * 32)

# A minimal recvonly video offer: enough to negotiate and inspect the answer.
# Use --frames when you want a real WebRTC client to receive the media.
MINIMAL_OFFER = (
    "v=0\r\n"
    "o=- 0 2 IN IP4 127.0.0.1\r\n"
    "s=-\r\n"
    "t=0 0\r\n"
    "a=group:BUNDLE 0\r\n"
    "m=video 9 UDP/TLS/RTP/SAVPF 96\r\n"
    "c=IN IP4 0.0.0.0\r\n"
    "a=rtcp:9 IN IP4 0.0.0.0\r\n"
    "a=ice-ufrag:helloworld\r\n"
    "a=ice-pwd:helloworldhelloworldhello\r\n"
    f"a=fingerprint:sha-256 {FINGERPRINT}\r\n"
    "a=setup:actpass\r\n"
    "a=mid:0\r\n"
    "a=recvonly\r\n"
    "a=rtcp-mux\r\n"
    "a=rtpmap:96 H264/90000\r\n"
)


def first_device(token):
    """Discover the first accessible device, so --device-id is optional."""
    response = requests.get(f"{API_BASE}/v1/devices",
                            headers={"Authorization": f"Bearer {token}"}, timeout=10)
    response.raise_for_status()
    devices = response.json().get("data", [])
    if not devices:
        sys.exit("No devices found for this token.")
    device = devices[0]
    name = device.get("attributes", {}).get("name", "Unknown")
    print(f"Using device: {name} ({device['id']})")
    return device["id"]


def sessions_url(device_id):
    return f"{API_BASE}/v1/devices/{urllib.parse.quote(device_id)}/media/streaming/whep/sessions"


def open_session(token, device_id, offer):
    """POST the SDP offer and return (answer, session_url)."""
    url = sessions_url(device_id)
    print(f"\n-> POST {url}")
    print("  curl -X POST '" + url + "'"
          " -H 'Authorization: Bearer $TOKEN'"
          " -H 'Content-Type: application/sdp'"
          " --data-binary @offer.sdp\n")

    response = requests.post(url, data=offer.encode(), timeout=15, headers={
        "Authorization": f"Bearer {token}", "Content-Type": SDP, "Accept": SDP})
    if response.status_code >= 400:
        sys.exit(f"Ring refused the session ({response.status_code}): {response.text[:200]}")

    location = response.headers.get("Location", "")
    resolved = urllib.parse.urljoin(url, location) if location else ""
    print(f"Status: {response.status_code}")
    print(f"Session URL: {resolved or '(no Location header)'}")
    return response.text, resolved


def close_session(token, url):
    """Always close the session: an abandoned one keeps counting against your account."""
    if not url:
        return
    response = requests.delete(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    print(f"-> DELETE session -> {response.status_code}")


def describe(answer):
    """Summarise what the device is offering, straight from the SDP answer."""
    codecs = [line.split(" ", 1)[1] for line in answer.splitlines() if line.startswith("a=rtpmap:")]
    candidates = [line for line in answer.splitlines() if line.startswith("a=candidate:")]
    print("\nCodecs offered: " + (", ".join(codecs) or "none"))
    print(f"ICE candidates: {len(candidates)}")
    for candidate in candidates[:4]:
        print(f"  {candidate}")


def receive_frames(token, device_id, count):
    """Receive real media with aiortc and report resolution and frame rate."""
    try:
        from aiortc import RTCPeerConnection, RTCSessionDescription
    except ImportError:
        sys.exit("--frames needs aiortc and av: pip install aiortc av")

    async def run():
        connection = RTCPeerConnection()
        connection.addTransceiver("video", direction="recvonly")
        frames = asyncio.Queue()

        @connection.on("track")
        def _on_track(track):
            async def drain():
                while True:
                    try:
                        await frames.put(await track.recv())
                    except Exception:
                        await frames.put(None)
                        return
            asyncio.ensure_future(drain())

        await connection.setLocalDescription(await connection.createOffer())
        answer, url = open_session(token, device_id, connection.localDescription.sdp)
        await connection.setRemoteDescription(RTCSessionDescription(sdp=answer, type="answer"))

        started, seen, size = time.monotonic(), 0, None
        try:
            while seen < count:
                try:
                    frame = await asyncio.wait_for(frames.get(), timeout=10)
                except asyncio.TimeoutError:
                    print("No frame arrived for 10s: the stream stopped.")
                    break
                if frame is None:
                    break
                seen += 1
                size = (frame.width, frame.height)
            elapsed = time.monotonic() - started
            print("\n" + json.dumps({
                "frames": seen,
                "seconds": round(elapsed, 1),
                "resolution": f"{size[0]}x{size[1]}" if size else None,
                "fps": round(seen / elapsed, 1) if elapsed > 0 and seen else 0,
            }, indent=2))
        finally:
            await connection.close()
            close_session(token, url)

    asyncio.run(run())


def main():
    parser = argparse.ArgumentParser(description="Open a WHEP live view session from the terminal")
    parser.add_argument("--token", required=True, help="Ring API access token")
    parser.add_argument("--device-id", help="Device ID (defaults to your first device)")
    parser.add_argument("--frames", type=int, default=0,
                        help="Receive this many frames with aiortc and report resolution and fps")
    parser.add_argument("--print-answer", action="store_true", help="Print the full SDP answer")
    args = parser.parse_args()

    device_id = args.device_id or first_device(args.token)
    if args.frames:
        receive_frames(args.token, device_id, args.frames)
        return

    answer, url = open_session(args.token, device_id, MINIMAL_OFFER)
    describe(answer)
    if args.print_answer:
        print("\nFull SDP answer:\n" + answer)
    close_session(args.token, url)


if __name__ == "__main__":
    main()
