#!/usr/bin/env python3
# ABOUTME: Unit tests for overpass_client shared HTTP + GeoJSON module.
# ABOUTME: Stubs requests.post and exercises execute(), to_geojson(), and run().

import unittest
import json
from unittest.mock import patch, Mock
from io import StringIO

import requests

import overpass_client


class TestExecute(unittest.TestCase):

    @patch('overpass_client.requests.post')
    def test_returns_json_on_200(self, mock_post):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"elements": []}
        mock_post.return_value = mock_response

        result = overpass_client.execute("[out:json];")

        self.assertEqual(result, {"elements": []})

    @patch('overpass_client.requests.post')
    def test_sends_user_agent_header(self, mock_post):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_post.return_value = mock_response

        overpass_client.execute("[out:json];")

        headers = mock_post.call_args.kwargs["headers"]
        self.assertIn("User-Agent", headers)

    @patch('overpass_client.requests.post')
    def test_raises_rate_limited_on_429(self, mock_post):
        mock_response = Mock()
        mock_response.status_code = 429
        mock_post.return_value = mock_response

        with self.assertRaises(overpass_client.OverpassError) as cm:
            overpass_client.execute("[out:json];")

        self.assertTrue(cm.exception.payload.get("rate_limited"))
        self.assertIn("429", cm.exception.payload["error"])

    @patch('overpass_client.requests.post')
    def test_raises_timeout_on_504(self, mock_post):
        mock_response = Mock()
        mock_response.status_code = 504
        mock_post.return_value = mock_response

        with self.assertRaises(overpass_client.OverpassError) as cm:
            overpass_client.execute("[out:json];")

        self.assertTrue(cm.exception.payload.get("timeout"))
        self.assertIn("504", cm.exception.payload["error"])

    @patch('overpass_client.requests.post')
    def test_raises_generic_error_on_other_non_200(self, mock_post):
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        with self.assertRaises(overpass_client.OverpassError) as cm:
            overpass_client.execute("[out:json];")

        self.assertIn("500", cm.exception.payload["error"])
        self.assertEqual(cm.exception.payload["details"], "Internal Server Error")


class TestToGeoJSON(unittest.TestCase):

    def _identity_properties(self, element, tags):
        return {"osm_id": element["id"]}

    def test_node_becomes_point_feature(self):
        response = {
            "elements": [
                {"type": "node", "id": 1, "lat": 47.6, "lon": -122.3, "tags": {}}
            ]
        }

        result = overpass_client.to_geojson(response, self._identity_properties)

        self.assertEqual(result["type"], "FeatureCollection")
        self.assertEqual(len(result["features"]), 1)
        feature = result["features"][0]
        self.assertEqual(feature["geometry"], {"type": "Point", "coordinates": [-122.3, 47.6]})
        self.assertEqual(feature["properties"], {"osm_id": 1})

    def test_way_with_center_becomes_point_at_center(self):
        response = {
            "elements": [
                {
                    "type": "way",
                    "id": 2,
                    "center": {"lat": 47.61, "lon": -122.31},
                    "tags": {},
                }
            ]
        }

        result = overpass_client.to_geojson(response, self._identity_properties)

        self.assertEqual(result["features"][0]["geometry"]["coordinates"], [-122.31, 47.61])

    def test_way_without_center_is_skipped(self):
        response = {"elements": [{"type": "way", "id": 3, "tags": {}}]}

        result = overpass_client.to_geojson(response, self._identity_properties)

        self.assertEqual(result["features"], [])

    def test_relation_is_skipped(self):
        response = {"elements": [{"type": "relation", "id": 4, "tags": {}}]}

        result = overpass_client.to_geojson(response, self._identity_properties)

        self.assertEqual(result["features"], [])

    def test_build_properties_returning_none_skips_element(self):
        response = {
            "elements": [
                {"type": "node", "id": 5, "lat": 47.6, "lon": -122.3, "tags": {}},
                {"type": "node", "id": 6, "lat": 47.7, "lon": -122.4, "tags": {}},
            ]
        }

        def keep_only_six(element, tags):
            return {"osm_id": element["id"]} if element["id"] == 6 else None

        result = overpass_client.to_geojson(response, keep_only_six)

        self.assertEqual(len(result["features"]), 1)
        self.assertEqual(result["features"][0]["properties"]["osm_id"], 6)

    def test_empty_elements_yields_empty_collection(self):
        result = overpass_client.to_geojson({"elements": []}, self._identity_properties)

        self.assertEqual(result, {"type": "FeatureCollection", "features": []})


class TestRun(unittest.TestCase):

    def setUp(self):
        self.sleep_patcher = patch('overpass_client.time.sleep')
        self.sleep_patcher.start()

    def tearDown(self):
        self.sleep_patcher.stop()

    def _noop_query(self, args):
        return "[out:json];"

    def _noop_properties(self, element, tags):
        return {"osm_id": element["id"]}

    def test_missing_argv_exits_with_usage_error(self):
        with patch('sys.argv', ['script.py']):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    overpass_client.run("script.py", ["lat"], self._noop_query, self._noop_properties)

                self.assertEqual(cm.exception.code, 1)
                error = json.loads(mock_stderr.getvalue())
                self.assertIn("Usage", error["error"])

    def test_invalid_json_exits_with_error(self):
        with patch('sys.argv', ['script.py', 'not-json']):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    overpass_client.run("script.py", ["lat"], self._noop_query, self._noop_properties)

                self.assertEqual(cm.exception.code, 1)
                error = json.loads(mock_stderr.getvalue())
                self.assertIn("Invalid JSON", error["error"])

    def test_missing_required_arg_exits_with_error(self):
        with patch('sys.argv', ['script.py', json.dumps({"lat": 1.0})]):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    overpass_client.run("script.py", ["lat", "lon"], self._noop_query, self._noop_properties)

                self.assertEqual(cm.exception.code, 1)
                error = json.loads(mock_stderr.getvalue())
                self.assertIn("lon", error["error"])

    @patch('overpass_client.requests.post')
    def test_network_error_exits_with_error(self, mock_post):
        mock_post.side_effect = requests.exceptions.ConnectionError("connection refused")

        with patch('sys.argv', ['script.py', json.dumps({"lat": 1.0})]):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    overpass_client.run("script.py", ["lat"], self._noop_query, self._noop_properties)

                self.assertEqual(cm.exception.code, 1)
                error = json.loads(mock_stderr.getvalue())
                self.assertIn("Network error", error["error"])

    @patch('overpass_client.requests.post')
    def test_rate_limit_payload_is_propagated_to_stderr(self, mock_post):
        mock_response = Mock()
        mock_response.status_code = 429
        mock_post.return_value = mock_response

        with patch('sys.argv', ['script.py', json.dumps({"lat": 1.0})]):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    overpass_client.run("script.py", ["lat"], self._noop_query, self._noop_properties)

                self.assertEqual(cm.exception.code, 1)
                error = json.loads(mock_stderr.getvalue())
                self.assertTrue(error.get("rate_limited"))


if __name__ == "__main__":
    unittest.main()
