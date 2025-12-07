// ABOUTME: BLoC for managing map visualization state.
// ABOUTME: Handles adding/removing geographic features and map operations.

import 'package:bloc/bloc.dart';
import 'package:flutter_map/flutter_map.dart' hide MapEvent;
import 'package:latlong2/latlong.dart';

import '../models/geo_feature.dart';
import 'map_event.dart';
import 'map_state.dart';

// Auto-frame thresholds
const double _singlePointThreshold = 0.0001; // ~11 meters at equator
const double _singlePointPadding = 0.02; // ~2km view for single points
const double _normalBoundsPadding = 0.25; // 25% padding for feature collections
const double _viewAdjustmentThreshold =
    0.3; // Adjust if new features extend >30% beyond current view
const double _minRangeForCalculation = 0.000001; // Prevent division by zero

class MapBloc extends Bloc<MapEvent, MapState> {
  MapBloc() : super(MapState()) {
    on<AddGeoFeature>(_onAddGeoFeature);
    on<RemoveGeoFeature>(_onRemoveGeoFeature);
    on<ClearMap>(_onClearMap);
    on<ZoomIn>(_onZoomIn);
    on<ZoomOut>(_onZoomOut);
    on<SetZoom>(_onSetZoom);
    on<UpdateMapPosition>(_onUpdateMapPosition);
    on<DisableAutoFrame>(_onDisableAutoFrame);
    on<EnableAutoFrame>(_onEnableAutoFrame);
  }

  void _onAddGeoFeature(AddGeoFeature event, Emitter<MapState> emit) {
    final updatedFeatures = [...state.features, event.feature];
    final allPoints = _extractPointsFromFeatures(updatedFeatures);
    final newPoints = _extractPointsFromGeometry(event.feature.geometry);

    _handleAutoFrame(
      emit: emit,
      updatedFeatures: updatedFeatures,
      allPoints: allPoints,
      newPoints: newPoints,
    );
  }

  void _onRemoveGeoFeature(RemoveGeoFeature event, Emitter<MapState> emit) {
    final updatedFeatures =
        state.features.where((f) => f.id != event.featureId).toList();

    emit(state.copyWith(features: updatedFeatures));
  }

  void _handleAutoFrame({
    required Emitter<MapState> emit,
    required List<GeoFeature> updatedFeatures,
    required List<LatLng> allPoints,
    required List<LatLng> newPoints,
  }) {
    if (!state.autoFrameEnabled || newPoints.isEmpty) {
      emit(state.copyWith(features: updatedFeatures));
      return;
    }

    final allBounds = _calculateBoundsFromPoints(allPoints);
    final newBounds = _calculateBoundsFromPoints(newPoints);

    if (allBounds == null || newBounds == null) {
      emit(state.copyWith(features: updatedFeatures));
      return;
    }

    // Adjust camera if: (1) first features in conversation, or (2) new features significantly outside current view
    MapCamera? camera;
    if (state.conversationBounds == null) {
      camera = _fitBounds(allBounds);
    } else if (_shouldAdjustView(newBounds)) {
      camera = _fitBounds(allBounds);
    }

    emit(state.copyWith(
      features: updatedFeatures,
      conversationBounds: allBounds,
      center: camera?.center ?? state.center,
      zoom: camera?.zoom ?? state.zoom,
    ));
  }

  void _onClearMap(ClearMap event, Emitter<MapState> emit) {
    emit(MapState());
  }

  void _onZoomIn(ZoomIn event, Emitter<MapState> emit) {
    final newZoom = state.zoom + 1.0;
    try {
      state.mapController.move(state.center, newZoom);
    } catch (e) {
      // Map controller may not be ready yet; state will be applied when widget renders
    }
    emit(state.copyWith(
      zoom: newZoom,
      autoFrameEnabled: false,
    ));
  }

  void _onZoomOut(ZoomOut event, Emitter<MapState> emit) {
    final newZoom = state.zoom - 1.0;
    try {
      state.mapController.move(state.center, newZoom);
    } catch (e) {
      // Map controller may not be ready yet; state will be applied when widget renders
    }
    emit(state.copyWith(
      zoom: newZoom,
      autoFrameEnabled: false,
    ));
  }

  void _onSetZoom(SetZoom event, Emitter<MapState> emit) {
    try {
      state.mapController.move(state.center, event.zoom);
    } catch (e) {
      // Map controller may not be ready yet; state will be applied when widget renders
    }
    emit(state.copyWith(zoom: event.zoom));
  }

  void _onUpdateMapPosition(UpdateMapPosition event, Emitter<MapState> emit) {
    emit(state.copyWith(
      center: event.center,
      zoom: event.zoom,
    ));
  }

  List<LatLng> _extractPointsFromFeatures(List<GeoFeature> features) {
    final points = <LatLng>[];
    for (final feature in features) {
      points.addAll(_extractPointsFromGeometry(feature.geometry));
    }
    return points;
  }

  List<LatLng> _extractPointsFromGeometry(GeoJSONGeometry geometry) {
    switch (geometry) {
      case GeoJSONPoint():
        return [LatLng(geometry.latitude, geometry.longitude)];

      case GeoJSONLineString():
        return geometry.coordinates
            .map((coord) => LatLng(coord[1], coord[0]))
            .toList();

      case GeoJSONPolygon():
        // Use exterior ring (first array) for bounds calculation
        if (geometry.coordinates.isEmpty) return [];
        return geometry.coordinates[0]
            .map((coord) => LatLng(coord[1], coord[0]))
            .toList();
    }
  }

  LatLngBounds? _calculateBoundsFromPoints(List<LatLng> points) {
    if (points.isEmpty) return null;

    double minLat = points.first.latitude;
    double maxLat = points.first.latitude;
    double minLng = points.first.longitude;
    double maxLng = points.first.longitude;

    for (var point in points) {
      minLat = minLat < point.latitude ? minLat : point.latitude;
      maxLat = maxLat > point.latitude ? maxLat : point.latitude;
      minLng = minLng < point.longitude ? minLng : point.longitude;
      maxLng = maxLng > point.longitude ? maxLng : point.longitude;
    }

    return LatLngBounds(
      LatLng(minLat, minLng),
      LatLng(maxLat, maxLng),
    );
  }

  bool _shouldAdjustView(LatLngBounds newFeatureBounds) {
    if (state.conversationBounds == null) return true;

    final currentBounds = state.conversationBounds!;

    // Calculate how much of the new features are outside current bounds
    final newSW = newFeatureBounds.southWest;
    final newNE = newFeatureBounds.northEast;
    final currSW = currentBounds.southWest;
    final currNE = currentBounds.northEast;

    // If new bounds are significantly outside current bounds, adjust
    final latRange = currNE.latitude - currSW.latitude;
    final lngRange = currNE.longitude - currSW.longitude;

    // Guard against division by zero for very small or zero ranges
    // If current view is essentially a point, always adjust when new features are added
    if (latRange.abs() < _minRangeForCalculation ||
        lngRange.abs() < _minRangeForCalculation) {
      return true;
    }

    final latOutside = (newSW.latitude < currSW.latitude
            ? currSW.latitude - newSW.latitude
            : 0) +
        (newNE.latitude > currNE.latitude
            ? newNE.latitude - currNE.latitude
            : 0);
    final lngOutside = (newSW.longitude < currSW.longitude
            ? currSW.longitude - newSW.longitude
            : 0) +
        (newNE.longitude > currNE.longitude
            ? newNE.longitude - currNE.longitude
            : 0);

    // Adjust if new features extend beyond threshold of current view in any direction
    return (latOutside / latRange > _viewAdjustmentThreshold) ||
        (lngOutside / lngRange > _viewAdjustmentThreshold);
  }

  MapCamera? _fitBounds(LatLngBounds bounds) {
    try {
      final latRange = bounds.northEast.latitude - bounds.southWest.latitude;
      final lngRange = bounds.northEast.longitude - bounds.southWest.longitude;

      LatLngBounds paddedBounds;

      if (latRange < _singlePointThreshold &&
          lngRange < _singlePointThreshold) {
        // Single point or very tight cluster - create fixed bounds around it
        final center = LatLng(
          (bounds.northEast.latitude + bounds.southWest.latitude) / 2,
          (bounds.northEast.longitude + bounds.southWest.longitude) / 2,
        );
        paddedBounds = LatLngBounds(
          LatLng(center.latitude - _singlePointPadding,
              center.longitude - _singlePointPadding),
          LatLng(center.latitude + _singlePointPadding,
              center.longitude + _singlePointPadding),
        );
      } else {
        // Normal case - add padding for better visibility
        final latPadding = latRange * _normalBoundsPadding;
        final lngPadding = lngRange * _normalBoundsPadding;

        paddedBounds = LatLngBounds(
          LatLng(bounds.southWest.latitude - latPadding,
              bounds.southWest.longitude - lngPadding),
          LatLng(bounds.northEast.latitude + latPadding,
              bounds.northEast.longitude + lngPadding),
        );
      }

      // Fit camera to the bounds
      state.mapController.fitCamera(
        CameraFit.bounds(bounds: paddedBounds),
      );

      return state.mapController.camera;
    } catch (e) {
      // Map controller may not be ready yet; auto-frame will retry on next feature add
      return null;
    }
  }

  void _onDisableAutoFrame(DisableAutoFrame event, Emitter<MapState> emit) {
    emit(state.copyWith(autoFrameEnabled: false));
  }

  void _onEnableAutoFrame(EnableAutoFrame event, Emitter<MapState> emit) {
    // Recalculate bounds from all current features
    final allPoints = _extractPointsFromFeatures(state.features);
    final conversationBounds = _calculateBoundsFromPoints(allPoints);
    MapCamera? camera;
    if (conversationBounds != null) {
      camera = _fitBounds(conversationBounds);
    }

    emit(state.copyWith(
      autoFrameEnabled: true,
      conversationBounds: conversationBounds,
      center: camera?.center ?? state.center,
      zoom: camera?.zoom ?? state.zoom,
    ));
  }
}
