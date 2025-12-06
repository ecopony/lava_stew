// ABOUTME: State for the map visualization.
// ABOUTME: Contains geographic features and view configuration.

import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/geo_feature.dart';

class MapState {
  final List<GeoFeature> features;
  final MapController mapController;
  final double zoom;
  final LatLng center;
  final bool autoFrameEnabled;
  final LatLngBounds? conversationBounds;

  MapState({
    this.features = const [],
    MapController? mapController,
    this.zoom = 5.0,
    this.center = const LatLng(37.7749, -122.4194), // San Francisco
    this.autoFrameEnabled = true,
    this.conversationBounds,
  }) : mapController = mapController ?? MapController();

  MapState copyWith({
    List<GeoFeature>? features,
    MapController? mapController,
    double? zoom,
    LatLng? center,
    bool? autoFrameEnabled,
    LatLngBounds? conversationBounds,
  }) {
    return MapState(
      features: features ?? this.features,
      mapController: mapController ?? this.mapController,
      zoom: zoom ?? this.zoom,
      center: center ?? this.center,
      autoFrameEnabled: autoFrameEnabled ?? this.autoFrameEnabled,
      conversationBounds: conversationBounds ?? this.conversationBounds,
    );
  }
}
