# main.py
from fastapi import FastAPI, HTTPException, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from routers import projects, tools, agents, deploy, chat, agent_templates, evaluation
from database import get_db
from models import Project, Agent
import uuid
import httpx
import asyncio

try:
    from fastmcp import Client as McpClient
except Exception as e:
    print(f"Warning: fastmcp not available: {e}")
    McpClient = None

app = FastAPI(
    title="Agent as Code Platform",
    description="API platform for managing agent creation and deployment",
    version="1.0.0"
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "*",  # Allow all headers
        "Content-Type",
        "Authorization",
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Headers",
        "Access-Control-Allow-Methods"
    ],
    expose_headers=["*"],
    max_age=600,  # Cache preflight request for 10 minutes
)

# Include routers
app.include_router(projects.router)
app.include_router(tools.router)
app.include_router(agents.router)
app.include_router(deploy.router)
app.include_router(agent_templates.router, prefix="/api")

# Include chat router with both /chat and /api/projects prefixes
app.include_router(chat.main_router)

# Include evaluation router
app.include_router(evaluation.router)


@app.get("/")
def read_root():
    return {"message": "Welcome to Agent as Code API"}


@app.get("/project/{project_id}")
async def get_agent_response(
    project_id: str,
    message: str = Query(..., description="The message to send to the agent"),
    session_id: str = Query(
        None, description="Optional session ID for conversation tracking"),
    db: Session = Depends(get_db)
):
    """
    Get agent's response for a specific project.
    This endpoint is accessible at: /project/{project_id}?message=your_message&session_id=optional_session_id
    """
    try:
        # Validate project_id format
        try:
            project_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid project ID format")

        # Check if project exists
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Process the message using the chat router's functionality
        from routers.chat import process_chat_message

        response = await process_chat_message(
            project_id=project_id,
            message=message,
            session_id=session_id,
            db=db
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}"
        )


@app.api_route(
    "/api/projects/{project_id}/agents/{agent_name}",
    methods=["GET", "POST", "OPTIONS"],
    tags=["Agents"]
)
async def handle_agent_request(
    project_id: str,
    agent_name: str,
    request: Request = None,
    message: str = Query(..., description="The message to send to the agent"),
    session_id: str = Query(
        None, description="Optional session ID for conversation tracking"),
    db: Session = Depends(get_db)
):
    """
    Handle agent requests with support for GET, POST, and OPTIONS methods.

    This endpoint forwards requests to the appropriate agent in the specified project.
    It first tries to connect to the agent directly, and falls back to the general
    query endpoint if needed.

    Args:
        project_id: The UUID of the project
        agent_name: The name of the agent to query
        request: The FastAPI Request object
        message: The message to send to the agent
        session_id: Optional session ID for conversation tracking
        db: Database session

    Returns:
        dict: Response containing the agent's reply and metadata
    """
    print(
        f"[DEBUG] Received {request.method} request to /api/projects/{project_id}/agents/{agent_name}")
    print(f"[DEBUG] Query params: message={message}, session_id={session_id}")

    # Handle OPTIONS request (CORS preflight)
    if request.method == "OPTIONS":
        from fastapi.responses import JSONResponse
        response = JSONResponse(
            content={"message": "CORS preflight"},
            status_code=200
        )
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    # Handle GET/POST request
    try:
        # Validate project ID format
        try:
            project_uuid = uuid.UUID(project_id)
        except ValueError as e:
            error_msg = f"Invalid project ID format: {project_id}"
            print(f"[ERROR] {error_msg}")
            raise HTTPException(
                status_code=400,
                detail=error_msg
            )

        # Get project and agent details
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            error_msg = f"Project with ID {project_id} not found"
            print(f"[ERROR] {error_msg}")
            raise HTTPException(
                status_code=404,
                detail=error_msg
            )

        # Log the request details
        print(f"[DEBUG] Project found: {project.name}")
        print(f"[DEBUG] Looking for agent: {agent_name}")

        # Generate a session ID if none provided
        if not session_id:
            session_id = str(uuid.uuid4())
            print(f"[DEBUG] Generated new session ID: {session_id}")

        # Forward the request to the deployed project's API
        try:
            project_url = f"http://localhost:8000/project/{project_id}"
            print(
                f"[DEBUG] Attempting to connect to project at: {project_url}")

            # Check if the project is running
            from routers.deploy import running_projects
            print(f"[DEBUG] Running projects: {running_projects}")

            if project_id not in running_projects:
                error_msg = f"Project '{project.name}' is not currently running. Please start it first."
                print(f"[ERROR] {error_msg}")
                return {
                    "response": error_msg,
                    "agent_used": "system",
                    "session_id": session_id,
                    "project_id": project_id,
                    "status": "project_not_running"
                }

            # Get the agent details
            agent = db.query(Agent).filter(
                Agent.project_id == project_uuid,
                Agent.name == agent_name
            ).first()

            if not agent:
                error_msg = f"Agent '{agent_name}' not found in project '{project.name}'"
                print(f"[ERROR] {error_msg}")
                raise HTTPException(
                    status_code=404,
                    detail=error_msg
                )

            print(f"[DEBUG] Found agent: {agent_name}")

            async with httpx.AsyncClient() as client:
                # Try the direct agent endpoint first
                print(f"[DEBUG] Attempting to connect to agent: {agent_name}")

                try:
                    # Try the direct agent endpoint
                    response = await client.post(
                        f"{project_url}/agents/{agent_name}/query",
                        json={
                            "message": message,
                            "session_id": session_id
                        },
                        timeout=30.0
                    )
                    print(
                        f"[DEBUG] Direct agent response status: {response.status_code}")

                    if response.status_code != 200:
                        # If direct agent endpoint fails, try the general query endpoint
                        print(
                            "[DEBUG] Direct agent endpoint failed, trying general query endpoint")
                        response = await client.post(
                            f"{project_url}/query",
                            json={
                                "message": message,
                                "target_agent": agent_name,
                                "session_id": session_id
                            },
                            timeout=30.0
                        )
                        print(
                            f"[DEBUG] General query response status: {response.status_code}")

                    if response.status_code == 200:
                        result = response.json()
                        print(
                            f"[DEBUG] Successfully got response from agent: {result}")
                        return {
                            "response": result.get("response", "No response from agent"),
                            "agent_used": agent_name,
                            "session_id": result.get("session_id", session_id),
                            "project_id": project_id,
                            "status": "success"
                        }
                    else:
                        error_msg = f"Error from agent API (HTTP {response.status_code}): {response.text}"
                        print(f"[ERROR] {error_msg}")
                        raise HTTPException(
                            status_code=response.status_code,
                            detail=error_msg
                        )

                except httpx.HTTPStatusError as e:
                    error_msg = f"HTTP error from agent API: {str(e)}"
                    print(f"[ERROR] {error_msg}")
                    raise HTTPException(
                        status_code=e.response.status_code if e.response else 500,
                        detail=error_msg
                    )

        except httpx.RequestError as e:
            error_msg = f"Failed to connect to project API: {str(e)}"
            print(f"[ERROR] {error_msg}")
            raise HTTPException(
                status_code=503,
                detail=error_msg
            )

    except Exception as e:
        print(f"[ERROR] Unexpected error in handle_agent_request: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

# Project details endpoint


@app.get("/api/projects/{project_id}/")
async def get_project_details(
    project_id: str,
    db: Session = Depends(get_db)
):
    """
    Get details for a specific project by ID
    """
    try:
        # Validate project_id format
        try:
            uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid project ID format")

        # Query the project from database
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get all agents for this project
        agents = db.query(Agent).filter(Agent.project_id == project_id).all()

        # Format the response
        return {
            "id": str(project.id),
            "name": project.name,
            "description": project.description,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            "agent_count": len(agents),
            "agents": [{
                "id": str(agent.id),
                "name": agent.name,
                "status": agent.status,
                "created_at": agent.created_at.isoformat() if agent.created_at else None,
                "updated_at": agent.updated_at.isoformat() if agent.updated_at else None
            } for agent in agents]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Debug endpoint to list all routes


@app.get("/api/routes")
async def list_routes():
    """List all registered API routes"""
    routes = []
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            routes.append({
                "path": route.path,
                "methods": sorted(list(route.methods)) if hasattr(route, "methods") else [],
                "name": route.name if hasattr(route, "name") else "",
                "endpoint": str(route.endpoint) if hasattr(route, "endpoint") else ""
            })
    return {"routes": routes}


@app.get("/fetchtools")
async def fetch_tools(mcp_url: str = Query(..., description="MCP server URL, e.g. http://localhost:8001/mcp")):
    """
    Fetch available tools from an MCP server using the fastmcp client.
    Based on the MCP protocol implementation.
    """
    if McpClient is None:
        raise HTTPException(
            status_code=500,
            detail="fastmcp is not installed. Please install it with: pip install fastmcp"
        )

    try:
        # Normalize URL
        if not mcp_url.startswith(('http://', 'https://')):
            mcp_url = f"http://{mcp_url}"

        # Connect to MCP server and fetch tools
        async with McpClient(mcp_url) as client:
            # Test connection
            await client.ping()

            # List available tools
            tools = await client.list_tools()

            # Format tools for response
            tool_summaries = []
            for tool in tools:
                tool_info = {
                    "name": tool.name,
                    "description": tool.description if hasattr(tool, 'description') else "",
                    "inputs": {}
                }

                # Extract input schema if available
                if hasattr(tool, 'inputSchema') and tool.inputSchema and "properties" in tool.inputSchema:
                    inputs = tool.inputSchema["properties"]
                    for key, schema in inputs.items():
                        type_ = schema.get("type", "unknown")
                        tool_info["inputs"][key] = type_

                tool_summaries.append(tool_info)

            return {
                "status": "success",
                "tools": tool_summaries,
                "count": len(tool_summaries)
            }

    except Exception as e:
        error_message = str(e)
        print(f"Error fetching MCP tools: {error_message}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch MCP tools: {error_message}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
