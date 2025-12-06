// ABOUTME: Events for map state management.
// ABOUTME: Handle adding/removing geographic features from the map.

import 'package:latlong2/latlong.dart';

import '../models/geo_feature.dart';

abstract class MapEvent {}

class AddGeoFeature extends MapEvent {
  final GeoFeature feature;

  AddGeoFeature(this.feature);
}

class RemoveGeoFeature extends MapEvent {
  final String featureId;

  RemoveGeoFeature(this.featureId);
}

class ClearMap extends MapEvent {}

class ZoomIn extends MapEvent {}

class ZoomOut extends MapEvent {}

class SetZoom extends MapEvent {
  final double zoom;

  SetZoom(this.zoom);
}

class UpdateMapPosition extends MapEvent {
  final LatLng center;
  final double zoom;

  UpdateMapPosition(this.center, this.zoom);
}

class DisableAutoFrame extends MapEvent {}

class EnableAutoFrame extends MapEvent {}
