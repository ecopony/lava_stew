// ABOUTME: Geographic feature model supporting GeoJSON geometry types.
// ABOUTME: Extracted from tool results and displayed on the map.

sealed class GeoJSONGeometry {
  String get type;

  Map<String, dynamic> toJson();

  static GeoJSONGeometry fromJson(Map<String, dynamic> json) {
    final type = json['type'] as String;
    switch (type) {
      case 'Point':
        return GeoJSONPoint.fromJson(json);
      case 'LineString':
        return GeoJSONLineString.fromJson(json);
      case 'Polygon':
        return GeoJSONPolygon.fromJson(json);
      default:
        throw ArgumentError('Unknown geometry type: $type');
    }
  }
}

class GeoJSONPoint extends GeoJSONGeometry {
  @override
  final String type = 'Point';

  /// [longitude, latitude]
  final List<double> coordinates;

  GeoJSONPoint({required this.coordinates});

  factory GeoJSONPoint.fromJson(Map<String, dynamic> json) {
    final coords = json['coordinates'] as List<dynamic>;
    return GeoJSONPoint(
      coordinates: [(coords[0] as num).toDouble(), (coords[1] as num).toDouble()],
    );
  }

  @override
  Map<String, dynamic> toJson() => {'type': type, 'coordinates': coordinates};

  double get longitude => coordinates[0];
  double get latitude => coordinates[1];
}

class GeoJSONLineString extends GeoJSONGeometry {
  @override
  final String type = 'LineString';

  /// List of [longitude, latitude] pairs
  final List<List<double>> coordinates;

  GeoJSONLineString({required this.coordinates});

  factory GeoJSONLineString.fromJson(Map<String, dynamic> json) {
    final coords = json['coordinates'] as List<dynamic>;
    return GeoJSONLineString(
      coordinates: coords.map((c) {
        final pair = c as List<dynamic>;
        return [(pair[0] as num).toDouble(), (pair[1] as num).toDouble()];
      }).toList(),
    );
  }

  @override
  Map<String, dynamic> toJson() => {'type': type, 'coordinates': coordinates};
}

class GeoJSONPolygon extends GeoJSONGeometry {
  @override
  final String type = 'Polygon';

  /// List of rings, each ring is a list of [longitude, latitude] pairs
  /// First ring is exterior, subsequent rings are holes
  final List<List<List<double>>> coordinates;

  GeoJSONPolygon({required this.coordinates});

  factory GeoJSONPolygon.fromJson(Map<String, dynamic> json) {
    final coords = json['coordinates'] as List<dynamic>;
    return GeoJSONPolygon(
      coordinates: coords.map((ring) {
        final ringList = ring as List<dynamic>;
        return ringList.map((c) {
          final pair = c as List<dynamic>;
          return [(pair[0] as num).toDouble(), (pair[1] as num).toDouble()];
        }).toList();
      }).toList(),
    );
  }

  @override
  Map<String, dynamic> toJson() => {'type': type, 'coordinates': coordinates};
}

class GeoFeatureProperties {
  final String? label;
  final String? featureCategory;
  final Map<String, dynamic> extra;

  GeoFeatureProperties({
    this.label,
    this.featureCategory,
    this.extra = const {},
  });

  factory GeoFeatureProperties.fromJson(Map<String, dynamic> json) {
    final extra = Map<String, dynamic>.from(json);
    extra.remove('label');
    extra.remove('featureCategory');
    return GeoFeatureProperties(
      label: json['label'] as String?,
      featureCategory: json['featureCategory'] as String?,
      extra: extra,
    );
  }

  Map<String, dynamic> toJson() => {
        if (label != null) 'label': label,
        if (featureCategory != null) 'featureCategory': featureCategory,
        ...extra,
      };

  /// Get any additional property by key
  dynamic operator [](String key) => extra[key];
}

class GeoFeature {
  final String id;
  final GeoJSONGeometry geometry;
  final GeoFeatureProperties properties;

  GeoFeature({
    required this.id,
    required this.geometry,
    required this.properties,
  });

  factory GeoFeature.fromJson(Map<String, dynamic> json) {
    final geometryJson = json['geometry'] as Map<String, dynamic>?;
    final propertiesJson =
        (json['properties'] as Map<String, dynamic>?) ?? {};

    // Handle legacy format with lat/lon at top level
    if (geometryJson == null &&
        json.containsKey('lat') &&
        json.containsKey('lon')) {
      return GeoFeature(
        id: json['id'] as String,
        geometry: GeoJSONPoint(
          coordinates: [
            (json['lon'] as num).toDouble(),
            (json['lat'] as num).toDouble(),
          ],
        ),
        properties: GeoFeatureProperties(
          label: json['label'] as String?,
        ),
      );
    }

    return GeoFeature(
      id: json['id'] as String,
      geometry: geometryJson != null
          ? GeoJSONGeometry.fromJson(geometryJson)
          : GeoJSONPoint(coordinates: [0, 0]),
      properties: GeoFeatureProperties.fromJson(propertiesJson),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'geometry': geometry.toJson(),
        'properties': properties.toJson(),
      };
}
