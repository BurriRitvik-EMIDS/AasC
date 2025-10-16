from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import json

from database import Base


class Project(Base):
    __tablename__ = 'projects'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    supervisor_prompt = Column(Text)
    final_response_prompt = Column(Text)
    platform = Column(String(50))
    azure_openai_key = Column(Text)
    azure_openai_url = Column(Text)
    port_number = Column(Integer, unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    agents = relationship('Agent', back_populates='project')
    tools = relationship('Tool', back_populates='project')


class Agent(Base):
    __tablename__ = 'agents'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey('projects.id'))
    name = Column(String(255), nullable=False)
    prompt = Column(Text)
    blob_url = Column(Text)
    status = Column(String(50), default='active')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship('Project', back_populates='agents')
    code_versions = relationship('CodeVersion', back_populates='agent')
    tools = relationship('AgentTool', back_populates='agent')


class Tool(Base):
    __tablename__ = 'tools'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey(
        'projects.id'), nullable=False)
    tool_type = Column(String(50))  # MCP or Custom
    name = Column(String(255), nullable=False)
    # selected_mcp_server = Column(String(255))
    blob_url = Column(Text)
    api_url = Column(Text, nullable=True)
    api_key = Column(Text, nullable=True)
    mcp_url = Column(Text, nullable=True)
    tool_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship('Project', back_populates='tools')
    agents = relationship('AgentTool', back_populates='tool')


class AgentTool(Base):
    __tablename__ = 'agent_tools'

    agent_id = Column(UUID(as_uuid=True), ForeignKey(
        'agents.id'), primary_key=True)
    tool_id = Column(UUID(as_uuid=True), ForeignKey(
        'tools.id'), primary_key=True)
    order = Column(Integer)

    agent = relationship('Agent', back_populates='tools')
    tool = relationship('Tool', back_populates='agents')


class CodeVersion(Base):
    __tablename__ = 'code_versions'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey('agents.id'))
    version = Column(Integer)
    code_blob_url = Column(Text)
    updated_by = Column(String(255))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text)

    agent = relationship('Agent', back_populates='code_versions')


class ChatSession(Base):
    __tablename__ = 'chat_sessions'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey('projects.id'))
    session_id = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship('Project')
    messages = relationship('ChatMessage', back_populates='session')


class ChatMessage(Base):
    __tablename__ = 'chat_messages'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey('chat_sessions.id'))
    message_type = Column(String(50), nullable=False)  # 'user' or 'agent'
    content = Column(Text, nullable=False)
    agent_name = Column(String(255))
    message_metadata = Column(Text)  # JSON string for additional data
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship('ChatSession', back_populates='messages')


class EvaluationMetrics(Base):
    __tablename__ = 'evaluation_metrics'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey('projects.id'))
    session_id = Column(String(255), nullable=False)
    final_response_id = Column(
        UUID(as_uuid=True), ForeignKey('chat_messages.id'))
    selected_metrics = Column(Text)  # JSON string of selected metrics
    evaluation_results = Column(Text)  # JSON string of evaluation results
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship('Project')
    final_response = relationship('ChatMessage')
