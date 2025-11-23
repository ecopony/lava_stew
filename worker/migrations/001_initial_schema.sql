-- ABOUTME: Creates initial database schema with PostGIS support
-- ABOUTME: Sets up conversations, messages, and geo_features tables with spatial indexes

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Conversations table
-- Uses UUID for internal identity, session_key for API/session tracking
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_session_key ON conversations(session_key);
CREATE INDEX idx_conversations_created ON conversations(created_at DESC);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sequence_number INTEGER NOT NULL,
  UNIQUE(conversation_id, sequence_number)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, sequence_number);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- Geographic features table
-- Validates that the PostGIS geometry type matches the feature_type column
CREATE TABLE geo_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL CHECK (feature_type IN ('marker', 'line', 'polygon')),
  geometry GEOMETRY(Geometry, 4326) NOT NULL,
  properties JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT check_geometry_matches_type CHECK (
    (feature_type = 'marker' AND GeometryType(geometry) = 'POINT') OR
    (feature_type = 'line' AND GeometryType(geometry) = 'LINESTRING') OR
    (feature_type = 'polygon' AND GeometryType(geometry) = 'POLYGON')
  )
);

CREATE INDEX idx_geo_features_message ON geo_features(message_id);
CREATE INDEX idx_geo_features_geometry ON geo_features USING GIST(geometry);
