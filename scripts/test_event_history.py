"""Offline fixtures for the event-history example; no Ring credentials needed."""

import contextlib
import io
import unittest
from unittest.mock import Mock, patch

import requests
from event_history import API_BASE, get_event_history


PATH = "/v1/history/devices/test-device/events"
NEXT = PATH + "?event_types=motion.human&page%5Bkey%5D=cursor-2"


def response(events, next_link=None, status=200):
    result = Mock(status_code=status)
    result.json.return_value = {
        "data": events,
        "links": {"next": next_link} if next_link else {},
    }
    if status >= 400:
        result.raise_for_status.side_effect = requests.HTTPError(str(status))
    return result


class EventHistoryTests(unittest.TestCase):
    def setUp(self):
        self.output = io.StringIO()
        self.addCleanup(self.output.close)
        redirect = contextlib.redirect_stdout(self.output)
        redirect.__enter__()
        self.addCleanup(redirect.__exit__, None, None, None)

    @patch("event_history.requests.get")
    def test_default_keeps_one_page_and_continuation(self, get):
        get.return_value = response([{"id": "one"}], NEXT)
        result = get_event_history("test-token", "test-device")
        self.assertEqual(get.call_count, 1)
        self.assertEqual(result["links"]["next"], NEXT)
        self.assertIn("links.next is available", self.output.getvalue())
        self.assertNotIn("test-token", self.output.getvalue())

    @patch("event_history.requests.get")
    def test_follows_empty_page_and_preserves_server_filters(self, get):
        get.side_effect = [response([], NEXT), response([{"id": "two"}])]
        result = get_event_history("test-token", "test-device", "motion.human", 3)
        self.assertEqual(result["data"], [{"id": "two"}])
        self.assertEqual(get.call_count, 2)
        self.assertEqual(get.call_args_list[0].kwargs["params"],
                         {"event_types": "motion.human"})
        self.assertEqual(get.call_args_list[1].args[0], API_BASE + NEXT)
        self.assertIsNone(get.call_args_list[1].kwargs["params"])
        self.assertEqual(get.call_args_list[1].kwargs["timeout"], 30)
        self.assertFalse(get.call_args_list[1].kwargs["allow_redirects"])

    @patch("event_history.requests.get")
    def test_page_limit_aggregates_and_retains_last_cursor(self, get):
        next_page = PATH + "?page%5Bkey%5D=cursor-3"
        get.side_effect = [response([{"id": "one"}], NEXT),
                           response([{"id": "two"}], next_page)]
        result = get_event_history("test-token", "test-device", max_pages=2)
        self.assertEqual(result["data"], [{"id": "one"}, {"id": "two"}])
        self.assertEqual(result["links"]["next"], next_page)
        self.assertEqual(get.call_count, 2)

    @patch("event_history.requests.get")
    def test_repeated_cursor_stops_before_third_request(self, get):
        get.side_effect = [response([{"id": "one"}], NEXT), response([], NEXT)]
        result = get_event_history("test-token", "test-device", max_pages=4)
        self.assertEqual(get.call_count, 2)
        self.assertEqual(result["data"], [{"id": "one"}])
        self.assertEqual(result["links"]["next"], NEXT)
        self.assertIn("partial results", self.output.getvalue())
        self.assertNotIn("Stopped after 4", self.output.getvalue())

    @patch("event_history.requests.get")
    def test_equivalent_device_encoding_and_literal_cursor_brackets(self, get):
        device_id = "ava1.ring.device:abc+def="
        link = f"/v1/history/devices/{device_id}/events?page[key]=cursor-2"
        get.side_effect = [response([], link), response([{"id": "two"}])]
        result = get_event_history("test-token", device_id, max_pages=2)
        self.assertIn("ava1.ring.device%3Aabc%2Bdef%3D/events",
                      get.call_args_list[0].args[0])
        self.assertEqual(get.call_args_list[1].args[0],
                         get.call_args_list[0].args[0] + "?page[key]=cursor-2")
        self.assertEqual(result["data"], [{"id": "two"}])

    @patch("event_history.requests.get")
    def test_null_fields_are_empty(self, get):
        get.return_value = response([])
        get.return_value.json.return_value = {"data": None, "links": None}
        result = get_event_history("test-token", "test-device", max_pages=2)
        self.assertEqual(result["data"], [])
        self.assertEqual(get.call_count, 1)

    @patch("event_history.requests.get")
    def test_continuation_stays_on_selected_device_endpoint(self, get):
        for link in ["https://other.example" + PATH, "//other.example" + PATH,
                     "/v1/history/devices/other/events?page[key]=x",
                     "/v1/history/devices/test-device%2Fother/events?page[key]=x",
                     "%2Fv1%2Fhistory%2Fdevices%2Ftest-device%2Fevents?page[key]=x",
                     "\n" + PATH, PATH + "?page[key]=x\t",
                     PATH + "#fragment"]:
            with self.subTest(link=link):
                get.reset_mock()
                get.return_value = response([], link)
                with self.assertRaisesRegex(ValueError, "continuation"):
                    get_event_history("test-token", "test-device", max_pages=2)
                self.assertEqual(get.call_count, 1)

    @patch("event_history.requests.get")
    def test_encoded_leading_slash_cannot_change_token_destination(self, get):
        get.return_value = response([], "%2Fv1%2Fhistory%2Fdevices%2F"
                                   "x@evil.example/events?page[key]=T")
        with self.assertRaisesRegex(ValueError, "continuation"):
            get_event_history("test-token", "x@evil.example", max_pages=2)
        self.assertEqual(get.call_count, 1)
        self.assertEqual(get.call_args.args[0],
                         API_BASE + "/v1/history/devices/x%40evil.example/events")

    @patch("event_history.requests.get")
    def test_later_http_error_is_not_reported_as_complete(self, get):
        get.side_effect = [response([{"id": "one"}], NEXT), response([], status=429)]
        with self.assertRaises(requests.HTTPError):
            get_event_history("test-token", "test-device", max_pages=2)
        self.assertNotIn("Found", self.output.getvalue())

    @patch("event_history.requests.get")
    def test_redirect_is_not_followed(self, get):
        get.return_value = response([], status=302)
        with self.assertRaisesRegex(ValueError, "HTTP 200"):
            get_event_history("test-token", "test-device")
        self.assertEqual(get.call_count, 1)

    @patch("event_history.requests.get")
    def test_invalid_limits_make_no_request(self, get):
        for limit in [0, -1, 1.5, True]:
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                get_event_history("test-token", "test-device", max_pages=limit)
        get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
