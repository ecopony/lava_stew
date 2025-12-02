// ABOUTME: Database model for geographic features
// ABOUTME: Stores spatial data using PostGIS geometry types

import { getPool } from "../database.js";
import type { GeoFeature, StoredGeoFeature } from "../types.js";

export async function createGeoFeature(
  messageId: string,
  feature: GeoFeature
): Promise<StoredGeoFeature> {
  const pool = getPool();

  // Convert lat/lon to PostGIS Point geometry
  const result = await pool.query(
    `INSERT INTO geo_features (id, message_id, feature_type, geometry, properties)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6)
     RETURNING id, message_id, feature_type,
               ST_AsGeoJSON(geometry)::json as geometry,
               properties, created_at`,
    [
      feature.id,
      messageId,
      feature.type,
      feature.lon,
      feature.lat,
      JSON.stringify({ label: feature.label }),
    ]
  );

  return result.rows[0];
}

export async function getMessageGeoFeatures(
  messageId: string
): Promise<StoredGeoFeature[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, message_id, feature_type,
            ST_AsGeoJSON(geometry)::json as geometry,
            properties, created_at
     FROM geo_features
     WHERE message_id = $1`,
    [messageId]
  );
  return result.rows;
}

export async function getConversationGeoFeatures(
  conversationId: string
): Promise<StoredGeoFeature[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT gf.id, gf.message_id, gf.feature_type,
            ST_AsGeoJSON(gf.geometry)::json as geometry,
            gf.properties, gf.created_at
     FROM geo_features gf
     JOIN messages m ON gf.message_id = m.id
     WHERE m.conversation_id = $1
     ORDER BY gf.created_at`,
    [conversationId]
  );
  return result.rows;
}

export async function findAndDeleteFeatureByLabel(
  conversationId: string,
  labelQuery: string
): Promise<StoredGeoFeature | null> {
  const pool = getPool();

  // Find features matching the label within this conversation
  const findResult = await pool.query(
    `SELECT gf.id, gf.message_id, gf.feature_type,
            ST_AsGeoJSON(gf.geometry)::json as geometry,
            gf.properties, gf.created_at
     FROM geo_features gf
     JOIN messages m ON gf.message_id = m.id
     WHERE m.conversation_id = $1
       AND gf.properties->>'label' ILIKE $2
     ORDER BY gf.created_at DESC
     LIMIT 1`,
    [conversationId, `%${labelQuery}%`]
  );

  if (findResult.rows.length === 0) {
    return null;
  }

  const feature = findResult.rows[0];

  // Delete the feature
  await pool.query(`DELETE FROM geo_features WHERE id = $1`, [feature.id]);

  return feature;
}
