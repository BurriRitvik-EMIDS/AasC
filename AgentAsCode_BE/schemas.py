# schemas.py
from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID

import random


class ProjectCreate(BaseModel):
    project_name: str
    project_description: Optional[str] = None
    supervisor_prompt: str
    final_response_prompt: str
    platform: str = Field(..., example="Azure")
    azure_openai_key: str
    azure_openai_url: str
    port_number: int = Field(
        default_factory=lambda: random.randint(1000, 9999))


class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    project_description: Optional[str] = None
    supervisor_prompt: Optional[str] = None
    final_response_prompt: Optional[str] = None
    platform: Optional[str] = None
    azure_openai_key: Optional[str] = None
    azure_openai_url: Optional[str] = None
    port_number: Optional[int] = None


class ToolCreate(BaseModel):
    project_id: UUID
    tool_type: str  # MCP or Custom
    tool_name: str
    selected_mcp_server: Optional[str] = None
    mcp_server_config: Optional[dict] = None
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    mcp_url: Optional[str] = None
    tool_prompt: Optional[str] = None


class AgentCreate(BaseModel):
    project_id: UUID
    agent_name: str
    agent_prompt: str
    tools_selected: List
    tool_type: str  # MCP or Custom
    tools_id_selected: List[UUID]


class AgentCodeUpdate(BaseModel):
    agent_id: UUID
    new_code: str  # This would be used in real scenario with blob update
    notes: Optional[str] = "Manual update"


class AgentPromptUpdate(BaseModel):
    agent_id: UUID
    agent_prompt: str
    tools_id_selected: List[UUID] = []


class DownloadRequest(BaseModel):
    blob_name: str

# Define the request body schema


class DeployAgentRequest(BaseModel):
    project_id: str


class EvaluationMetricsRequest(BaseModel):
    project_id: str
    session_id: str
    selected_metrics: List[str]


class EvaluationMetricsResponse(BaseModel):
    project_id: str
    session_id: str
    selected_metrics: List[str]
    evaluation_results: dict
    final_response: str
    ground_truth: List[str]


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: List[dict]
