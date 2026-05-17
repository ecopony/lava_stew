#!/usr/bin/env python3
# ABOUTME: Unit tests for fetch_amenities_osm.py script.
# ABOUTME: Stubs HTTP requests to Overpass API for isolated testing.

import unittest
import json
from unittest.mock import patch, Mock
from io import StringIO

import fetch_amenities_osm


class TestFetchAmenitiesOSM(unittest.TestCase):

    def setUp(self):
        self.sleep_patcher = patch('overpass_client.time.sleep')
        self.sleep_patcher.start()

    def tearDown(self):
        self.sleep_patcher.stop()

    def test_missing_arguments(self):
        """Should exit with error when arguments are missing"""
        with patch('sys.argv', ['fetch_amenities_osm.py']):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    fetch_amenities_osm.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)

    @patch('overpass_client.requests.post')
    def test_successful_amenities_fetch(self, mock_post):
        """Should return GeoJSON with parks and attractions"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "elements": [
                {
                    "type": "way",
                    "id": 1001,
                    "center": {"lat": 47.6062, "lon": -122.3321},
                    "tags": {
                        "leisure": "park",
                        "name": "Victor Steinbrueck Park"
                    }
                },
                {
                    "type": "node",
                    "id": 2002,
                    "lat": 47.6097,
                    "lon": -122.3331,
                    "tags": {
                        "tourism": "attraction",
                        "name": "Pike Place Market"
                    }
                }
            ]
        }
        mock_post.return_value = mock_response

        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "radius_meters": 1000
        }

        with patch('sys.argv', ['fetch_amenities_osm.py', json.dumps(args)]):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                with self.assertRaises(SystemExit) as cm:
                    fetch_amenities_osm.main()

                self.assertEqual(cm.exception.code, 0)
                output = json.loads(mock_stdout.getvalue())

                self.assertEqual(output["type"], "FeatureCollection")
                self.assertEqual(len(output["features"]), 2)

                # Check park feature
                park = output["features"][0]
                self.assertEqual(park["properties"]["amenity_type"], "park")
                self.assertEqual(park["properties"]["name"], "Victor Steinbrueck Park")

                # Check attraction feature
                attraction = output["features"][1]
                self.assertEqual(attraction["properties"]["amenity_type"], "attraction")

    @patch('overpass_client.requests.post')
    def test_polygon_features(self, mock_post):
        """Should handle polygon features with center points"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "elements": [
                {
                    "type": "way",
                    "id": 3003,
                    "center": {"lat": 47.6100, "lon": -122.3350},
                    "tags": {
                        "leisure": "playground",
                        "name": "Kids Play Area"
                    }
                }
            ]
        }
        mock_post.return_value = mock_response

        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "radius_meters": 1000
        }

        with patch('sys.argv', ['fetch_amenities_osm.py', json.dumps(args)]):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                with self.assertRaises(SystemExit) as cm:
                    fetch_amenities_osm.main()

                self.assertEqual(cm.exception.code, 0)
                output = json.loads(mock_stdout.getvalue())
                self.assertEqual(len(output["features"]), 1)
                self.assertEqual(output["features"][0]["geometry"]["type"], "Point")


if __name__ == "__main__":
    unittest.main()
