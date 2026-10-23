#!/usr/bin/env python3
"""Describe a Ring doorbell frame with Claude on Amazon Bedrock.

Turns a frame from your Ring camera into structured JSON (is there a person, a
package, a vehicle, what is happening) that your code can act on.

Where to get a frame:
  - Take a screenshot of the live view in this repo's web app (Step 3), or
  - Save frames from a WHEP live view session with aiortc.
The Playground sandbox doesn't record, so media download returns 416 there.

Needs AWS credentials (`aws configure` or `aws login`) with access to an
Anthropic Claude model in Amazon Bedrock. The default is Claude Haiku 4.5, which
is fast and cheap enough to run on every frame.
"""

import argparse
import json
import sys
from pathlib import Path

import boto3

DEFAULT_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

ACTIVITIES = [
    "none", "delivery", "package_pickup", "visitor_at_door", "resident_leaving",
    "resident_returning", "passerby", "vehicle", "animal", "other",
]

# A forced tool call makes the model return JSON that matches this schema,
# instead of free text you would have to parse.
REPORT_TOOL = {
    "toolSpec": {
        "name": "report_frame",
        "description": "Report what the doorbell camera sees in this frame.",
        "inputSchema": {"json": {
            "type": "object",
            "properties": {
                "description": {"type": "string", "description": "One plain sentence about the scene."},
                "person": {"type": "boolean"},
                "package": {"type": "boolean", "description": "A parcel or box is visible."},
                "vehicle": {"type": "boolean"},
                "activity": {"type": "string", "enum": ACTIVITIES},
                "concern": {"type": "string", "description": "Anything unusual, or an empty string."},
            },
            "required": ["description", "person", "package", "vehicle", "activity", "concern"],
        }},
    }
}

SYSTEM = (
    "You look at single frames from a Ring video doorbell at someone's front door. "
    "Report only what is visible. Do not guess identities."
)


def describe_frame(image_path, model_id=DEFAULT_MODEL, region="us-east-1"):
    """Send one frame to Bedrock and return the structured report as a dict."""
    path = Path(image_path)
    image_format = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png"}.get(path.suffix.lower().lstrip("."))
    if not image_format:
        sys.exit("Use a .jpg or .png frame")

    print(f"\n→ Bedrock Converse ({model_id}, {region})")
    print(f"  image: {path} ({path.stat().st_size // 1024} KB)\n")

    client = boto3.client("bedrock-runtime", region_name=region)
    response = client.converse(
        modelId=model_id,
        system=[{"text": SYSTEM}],
        messages=[{"role": "user", "content": [
            {"image": {"format": image_format, "source": {"bytes": path.read_bytes()}}},
            {"text": "Report this frame."},
        ]}],
        toolConfig={"tools": [REPORT_TOOL], "toolChoice": {"tool": {"name": "report_frame"}}},
        inferenceConfig={"maxTokens": 400, "temperature": 0},
    )

    for block in response["output"]["message"]["content"]:
        if "toolUse" in block:
            report = block["toolUse"]["input"]
            usage = response["usage"]
            print(json.dumps(report, indent=2))
            print(f"\n({usage['inputTokens']} input + {usage['outputTokens']} output tokens, "
                  f"{response['metrics']['latencyMs']} ms)")
            return report
    sys.exit("The model did not return a report")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Describe a Ring doorbell frame with Claude on Amazon Bedrock")
    parser.add_argument("--image", required=True, help="Path to a .jpg or .png frame from your Ring camera")
    parser.add_argument("--model-id", default=DEFAULT_MODEL, help="Bedrock model or inference profile ID")
    parser.add_argument("--region", default="us-east-1", help="AWS region with Bedrock access")
    args = parser.parse_args()
    describe_frame(args.image, args.model_id, args.region)
