-- Enable UUID extension if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- Table: agent_tools
-- =========================
CREATE TABLE IF NOT EXISTS agent_tools (
    agent_id UUID NOT NULL,
    tool_id UUID NOT NULL,
    "order" INTEGER
);

-- =========================
-- Table: agents
-- =========================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID,
    name VARCHAR NOT NULL,
    prompt TEXT,
    blob_url TEXT,
    status VARCHAR DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Table: chat_messages
-- =========================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID,
    message_type VARCHAR NOT NULL,
    content TEXT NOT NULL,
    agent_name VARCHAR,
    message_metadata TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Table: chat_sessions
-- =========================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID,
    session_id VARCHAR NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Table: code_versions
-- =========================
CREATE TABLE IF NOT EXISTS code_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID,
    version INTEGER,
    code_blob_url TEXT,
    updated_by VARCHAR,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- =========================
-- Table: evaluation_metrics
-- =========================
CREATE TABLE IF NOT EXISTS evaluation_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID,
    session_id VARCHAR NOT NULL,
    final_response_id UUID,
    selected_metrics TEXT,
    evaluation_results TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Table: projects
-- =========================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR NOT NULL,
    description TEXT,
    supervisor_prompt TEXT,
    final_response_prompt TEXT,
    platform VARCHAR,
    azure_openai_key TEXT,
    azure_openai_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    port_number INTEGER NOT NULL DEFAULT (1000 + ((random() * 8999)::INTEGER))
);

-- =========================
-- Table: tool_create
-- =========================
CREATE TABLE IF NOT EXISTS tool_create (
    project_id UUID NOT NULL,
    tool_type VARCHAR NOT NULL,
    tool_name VARCHAR NOT NULL,
    selected_mcp_server VARCHAR,
    mcp_server_config JSONB,
    api_url TEXT,
    api_key TEXT,
    mcp_url TEXT,
    tool_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    mssql_server_config JSONB
);

-- =========================
-- Table: tools
-- =========================
CREATE TABLE IF NOT EXISTS tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID,
    tool_type VARCHAR,
    name VARCHAR NOT NULL,
    blob_url TEXT,
    api_url TEXT,
    api_key TEXT,
    tool_prompt TEXT,
    mcp_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
