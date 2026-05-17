#!/usr/bin/env python3
# ABOUTME: Unit tests for fetch_transit_osm.py script.
# ABOUTME: Stubs HTTP requests to Overpass API for isolated testing.

import unittest
import json
from unittest.mock import patch, Mock
from io import StringIO

import fetch_transit_osm


class TestFetchTransitOSM(unittest.TestCase):

    def setUp(self):
        self.sleep_patcher = patch('overpass_client.time.sleep')
        self.sleep_patcher.start()

    def tearDown(self):
        self.sleep_patcher.stop()

    def test_missing_arguments(self):
        """Should exit with error when arguments are missing"""
        with patch('sys.argv', ['fetch_transit_osm.py']):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    fetch_transit_osm.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)

    @patch('overpass_client.requests.post')
    def test_successful_transit_fetch(self, mock_post):
        """Should return GeoJSON with transit stops"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "elements": [
                {
                    "type": "node",
                    "id": 456,
                    "lat": 47.6097,
                    "lon": -122.3331,
                    "tags": {
                        "highway": "bus_stop",
                        "name": "Pike Street & 1st Ave",
                        "operator": "King County Metro"
                    }
                },
                {
                    "type": "node",
                    "id": 789,
                    "lat": 47.6110,
                    "lon": -122.3340,
                    "tags": {
                        "railway": "station",
                        "name": "Westlake Station"
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

        with patch('sys.argv', ['fetch_transit_osm.py', json.dumps(args)]):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                with self.assertRaises(SystemExit) as cm:
                    fetch_transit_osm.main()

                self.assertEqual(cm.exception.code, 0)
                output = json.loads(mock_stdout.getvalue())

                self.assertEqual(output["type"], "FeatureCollection")
                self.assertEqual(len(output["features"]), 2)

                # Check first feature (bus stop)
                bus_stop = output["features"][0]
                self.assertEqual(bus_stop["properties"]["transit_type"], "bus_stop")
                self.assertEqual(bus_stop["properties"]["name"], "Pike Street & 1st Ave")

                # Check second feature (station)
                station = output["features"][1]
                self.assertEqual(station["properties"]["transit_type"], "station")

    @patch('overpass_client.requests.post')
    def test_empty_results(self, mock_post):
        """Should return empty FeatureCollection when no transit found"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"elements": []}
        mock_post.return_value = mock_response

        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "radius_meters": 1000
        }

        with patch('sys.argv', ['fetch_transit_osm.py', json.dumps(args)]):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                with self.assertRaises(SystemExit) as cm:
                    fetch_transit_osm.main()

                self.assertEqual(cm.exception.code, 0)
                output = json.loads(mock_stdout.getvalue())
                self.assertEqual(len(output["features"]), 0)


if __name__ == "__main__":
    unittest.main()
