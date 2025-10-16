# routers/tool.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from schemas import ToolCreate
from models import Tool, Project, AgentTool
from database import get_db
from generator import generate_tool_files
import uuid
import json

router = APIRouter(prefix="/admin", tags=["Tools"])


@router.post("/create_tool")
def create_tool(data: ToolCreate, db: Session = Depends(get_db)):
    # Validate that the project exists
    project = db.query(Project).filter(Project.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tool_id = uuid.uuid4()
    project_path = f"./project/{data.project_id}"
    tool_url = generate_tool_files(project_path, data)
    tool_prompt = data.tool_prompt

    # Handle MCP URL - provide default if not specified for MCP tools
    mcp_url = data.mcp_url
    if data.tool_type.upper() == 'MCP' and not mcp_url:
        # Default MCP server URL for MSSQL MCP server
        mcp_url = "npx @modelcontextprotocol/server-mssql"

    if data.tool_type == 'MCP' and hasattr(data, 'mcp_server_config') and data.mcp_server_config:
        mcp_config_json = json.dumps({
            "selected_mcp_server": "MSSQL",  # Always MSSQL for MCP tools
            "config": data.mcp_server_config
        })
        # If there's already a prompt, append the MCP config
        if tool_prompt:
            tool_prompt = f"{tool_prompt}\n\nMCP_CONFIG: {mcp_config_json}"
        else:
            tool_prompt = f"MCP_CONFIG: {mcp_config_json}"

    tool_type = 'MCP' if data.tool_type.upper() == 'MCP' else 'Custom'
    new_tool = Tool(
        id=tool_id,
        project_id=data.project_id,
        tool_type=tool_type,
        name=data.tool_name,
        blob_url=str(data.project_id) + tool_url,
        api_url=data.api_url,
        api_key=data.api_key,
        mcp_url=mcp_url,
        tool_prompt=tool_prompt
    )

    db.add(new_tool)
    db.commit()
    db.refresh(new_tool)
    return {"tool_id": str(new_tool.id), "message": "Tool created successfully"}


@router.get("/get_tools")
def get_tools(db: Session = Depends(get_db)):
    tools = db.query(Tool).all()
    if not tools:
        raise HTTPException(status_code=404, detail="No tools found")
    return tools


@router.get("/get_tools/{project_id}")
def get_tools_by_project(project_id: str, db: Session = Depends(get_db)):
    # Validate project ID format and convert to UUID
    try:
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid project ID format")

    # Validate project exists
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tools = db.query(Tool).filter(Tool.project_id == project_uuid).all()
    if not tools:
        raise HTTPException(
            status_code=404, detail="No tools found for this project")
    return tools


@router.get("/get_tool/{tool_id}")
def get_tool(tool_id: str, db: Session = Depends(get_db)):
    # Validate tool ID format and convert to UUID
    try:
        tool_uuid = uuid.UUID(tool_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tool ID format")

    tool = db.query(Tool).filter(Tool.id == tool_uuid).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool


@router.get("/get_tool_code/{tool_id}")
def get_tool_code(tool_id: str, db: Session = Depends(get_db)):
    # Validate tool ID format and convert to UUID
    try:
        tool_uuid = uuid.UUID(tool_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tool ID format")

    tool = db.query(Tool).filter(Tool.id == tool_uuid).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return {"tool_id": tool_id, "code": f"# Code content from {tool.blob_url} (simulated)"}


@router.delete("/delete_tool/{tool_id}")
def delete_tool(tool_id: str, db: Session = Depends(get_db)):
    # Validate tool ID format and convert to UUID
    try:
        tool_uuid = uuid.UUID(tool_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tool ID format")

    # Check if tool exists
    tool = db.query(Tool).filter(Tool.id == tool_uuid).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    # First delete all agent_tools associations
    db.query(AgentTool).filter(AgentTool.tool_id == tool_uuid).delete()

    # Then delete the tool
    db.delete(tool)
    db.commit()

    return {"message": "Tool deleted successfully"}
