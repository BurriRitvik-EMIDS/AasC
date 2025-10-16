from fastapi import APIRouter, Depends, HTTPException, Request, APIRouter, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models import Project, Agent
from database import get_db
import uuid
import subprocess
import os
import json
import asyncio
import httpx
from typing import Optional

router = APIRouter(prefix="/chat", tags=["Chat"])
api_router = APIRouter(prefix="/api/projects", tags=["API"])

# Register the main router under both /chat and /api/projects
main_router = APIRouter()
main_router.include_router(router, prefix="/chat")
main_router.include_router(api_router, prefix="")


class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    agent_used: str
    session_id: str
    project_id: str
    status: Optional[str] = None


async def process_chat_message(
    project_id: str,
    message: str,
    session_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Process a chat message and return the response.

    Args:
        project_id: The UUID of the project
        message: The user's message
        session_id: Optional session ID for conversation tracking
        db: Database session

    Returns:
        dict: Response containing the agent's reply and metadata
    """
    try:
        # Validate project ID format
        try:
            project_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid project ID format. Please provide a valid UUID."
            )

        # Get project details
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            raise HTTPException(
                status_code=404,
                detail=f"Project with ID {project_id} not found."
            )

        print(f"[DEBUG] Processing message for project: {project.name}")
        print(f"[DEBUG] Message: {message}")
        print(f"[DEBUG] Session ID: {session_id}")

        # Generate a new session ID if none provided
        if not session_id:
            session_id = str(uuid.uuid4())
            print(f"[DEBUG] Generated new session ID: {session_id}")

        # Check if project is running
        from routers.deploy import running_projects
        if project_id not in running_projects:
            agents = db.query(Agent).filter(
                Agent.project_id == project_uuid).all()
            agent_list = ", ".join(
                [agent.name for agent in agents]) if agents else "No agents"

            return {
                "response": f"Project '{project.name}' is not currently running. Please start it first.\nAvailable agents: {agent_list}",
                "agent_used": "system",
                "session_id": session_id,
                "project_id": project_id,
                "status": "project_not_running"
            }

        # Get all agents for this project with their roles
        agents = db.query(Agent).filter(Agent.project_id == project_uuid).all()

        # Create a mapping of agent names to their roles
        agent_roles = {
            agent.name.lower(): agent.role or agent.name for agent in agents}

        # Get the supervisor agent
        supervisor = next(
            (agent for agent in agents if agent.name.lower() == "supervisor"), None)

        if not supervisor:
            raise HTTPException(
                status_code=500,
                detail="Supervisor agent not found for this project"
            )

        # Forward the request to the supervisor agent
        try:
            # Connect to the running project on its assigned port
            project_port = project.port_number or 8001  # Use project's assigned port
            project_url = f"http://localhost:{project_port}"

            print(f"[DEBUG] Connecting to project at: {project_url}")

            # Determine a target subagent if available (first non-supervisor agent)
            target_agent_name = None
            try:
                subagent = db.query(Agent).filter(
                    Agent.project_id == project_uuid,
                    Agent.name != "supervisor"
                ).first()
                if subagent:
                    target_agent_name = subagent.name.lower()
            except Exception:
                target_agent_name = None

            async with httpx.AsyncClient() as client:
                # Try the direct agent endpoint first
                response = await client.post(
                    f"{project_url}/agents/supervisor/query",
                    json={
                        "message": message,
                        **({"target_agent": target_agent_name} if target_agent_name else {}),
                        "session_id": session_id
                    },
                    timeout=30.0
                )

                if response.status_code == 200:
                    result = response.json()

                    # Extract all agents involved in processing
                    agents_involved = set()
                    agent_response = result.get("agent_used", "supervisor")
                    agents_involved.add(agent_response)

                    # Check for subagents in the response
                    subagents_used = result.get("subagents_used", [])
                    if isinstance(subagents_used, list):
                        agents_involved.update(subagents_used)

                    # Get roles for all involved agents
                    roles_involved = [
                        agent_roles.get(agent.lower(), agent.title())
                        for agent in agents_involved
                        if agent.lower() in agent_roles
                    ]

                    return {
                        "response": result.get("response", "No response from agent"),
                        "agent_used": agent_response,
                        "session_id": session_id,
                        "project_id": project_id,
                        "status": "success",
                        "metadata": {
                            "roles": list(roles_involved),
                            "subagents_used": subagents_used,
                            "agent_chain": list(agents_involved)
                        }
                    }
                else:
                    error_msg = f"Error from agent API: {response.text}"
                    print(f"[ERROR] {error_msg}")
                    raise HTTPException(
                        status_code=response.status_code,
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
        error_msg = f"Error processing chat message: {str(e)}"
        print(f"[ERROR] {error_msg}")
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )


@router.post("/{project_id}", response_model=ChatResponse)
async def chat_with_agent_post(
    project_id: str,
    chat_message: ChatMessage,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Chat with an agent in the specified project (POST endpoint).
    """
    result = await process_chat_message(
        project_id=project_id,
        message=chat_message.message,
        session_id=chat_message.session_id,
        db=db
    )
    return ChatResponse(**result, project_id=project_id)


@router.get("/{project_id}", response_model=ChatResponse)
async def chat_with_agent_get(
    project_id: str,
    message: str,
    session_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Chat with an agent in the specified project (GET endpoint).
    This is provided for compatibility with some frontend implementations.
    """
    result = await process_chat_message(
        project_id=project_id,
        message=message,
        session_id=session_id,
        db=db
    )
    return ChatResponse(**result, project_id=project_id)


@router.get("/deploy/chat", response_model=ChatResponse)
async def legacy_chat_endpoint(
    message: str,
    project_id: str,
    session_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Legacy chat endpoint for backward compatibility.
    """
    result = await process_chat_message(
        project_id=project_id,
        message=message,
        session_id=session_id,
        db=db
    )
    return ChatResponse(**result, project_id=project_id)


@api_router.post("/{project_id}/chat", response_model=ChatResponse, tags=["Chat"])
async def api_chat_endpoint(
    project_id: str,
    message: str = Query(..., description="The message to send to the agent"),
    session_id: Optional[str] = Query(
        None, description="Optional session ID for conversation tracking"),
    db: Session = Depends(get_db)
):
    """
    Main chat endpoint for the API (matches frontend expectations).
    This endpoint is available at /api/projects/{project_id}/chat
    """
    result = await process_chat_message(
        project_id=project_id,
        message=message,
        session_id=session_id,
        db=db
    )
    return ChatResponse(**result, project_id=project_id)


@api_router.get("/{project_id}/chat", response_model=ChatResponse, tags=["Chat"])
async def api_chat_endpoint_get(
    project_id: str,
    message: str = Query(..., description="The message to send to the agent"),
    session_id: Optional[str] = Query(
        None, description="Optional session ID for conversation tracking"),
    db: Session = Depends(get_db)
):
    """
    GET version of the chat endpoint for the API.
    """
    result = await process_chat_message(
        project_id=project_id,
        message=message,
        session_id=session_id,
        db=db
    )
    return ChatResponse(**result, project_id=project_id)

    # Check if project is running
    from routers.deploy import running_projects
    if project_id not in running_projects:
        agents = db.query(Agent).filter(Agent.project_id == project_uuid).all()
        agent_list = ", ".join(
            [agent.name for agent in agents]) if agents else "No agents"

        return ChatResponse(
            response=f"Project is not currently running. Please start the project first. Available agents: {agent_list}",
            agent_used="system",
            session_id=chat_message.session_id or str(uuid.uuid4())
        )

    try:
        # Forward the request to the deployed project's API
        project_url = f"http://localhost:8000/project/{project_id}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{project_url}/query",
                json={"message": chat_message.message},
                timeout=30.0
            )

            if response.status_code == 200:
                result = response.json()
                return ChatResponse(
                    response=result.get("response", "No response from agent"),
                    agent_used=result.get("agent_used", "unknown"),
                    session_id=chat_message.session_id or str(uuid.uuid4())
                )
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Error from project API: {response.text}"
                )

    except httpx.RequestError as e:
        return ChatResponse(
            response=f"Error connecting to project API: {str(e)}",
            agent_used="system",
            session_id=chat_message.session_id or str(uuid.uuid4())
        )
    except Exception as e:
        return ChatResponse(
            response=f"An error occurred: {str(e)}",
            agent_used="system",
            session_id=chat_message.session_id or str(uuid.uuid4())
        )


def execute_agent_system(project_root: str, user_message: str):
    """
    This function is no longer used. Kept for backward compatibility.
    All processing is now done through process_query_directly().
    """
    return {
        "status": "error",
        "response": "This execution method is no longer supported. Please use direct processing instead.",
        "agent_used": "system"
    }


@router.get("/health")
def health_check():
    """
    Health check endpoint for the chat system.
    """
    return {"status": "healthy", "service": "chat"}


@router.get("/agents/{project_id}")
def get_project_agents(project_id: str, db: Session = Depends(get_db)):
    """
    Get all agents for a specific project.
    """
    try:
        # Validate project ID format
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid project ID format")

    # Check if project exists
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get project agents
    agents = db.query(Agent).filter(Agent.project_id == project_uuid).all()

    return {
        "project_id": project_id,
        "project_name": project.name,
        "agents": [
            {
                "id": str(agent.id),
                "name": agent.name,
                "status": agent.status
            }
            for agent in agents
        ]
    }


@router.get("/test/{project_id}")
def test_agent_import(project_id: str, db: Session = Depends(get_db)):
    """
    Test if agents can be imported for a project.
    """
    try:
        # Validate project ID format
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid project ID format")

    # Check if project exists
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_root = f"./project/{project_id}"

    # Test basic imports
    test_script = f'''
import sys
import os
import json
sys.path.append(os.getcwd())

results = {{}}

# Test 1: Check if google.adk can be imported
try:
    import google.adk.agents
    results["google_adk"] = "SUCCESS"
except ImportError as e:
    results["google_adk"] = f"FAILED: {{str(e)}}"

# Test 2: Check if .env exists
results["env_file"] = "EXISTS" if os.path.exists('.env') else "MISSING"

# Test 3: Check if supervisor agent can be imported
try:
    from Supervisor.agent import root_agent
    results["supervisor_import"] = "SUCCESS"
    results["supervisor_type"] = str(type(root_agent))
except ImportError as e:
    results["supervisor_import"] = f"FAILED: {{str(e)}}"
except Exception as e:
    results["supervisor_import"] = f"ERROR: {{str(e)}}"

# Test 4: Check project structure
structure = {{
    "supervisor_dir": os.path.exists("Supervisor"),
    "supervisor_agent_py": os.path.exists("Supervisor/agent.py"),
    "supervisor_init_py": os.path.exists("Supervisor/__init__.py"),
    "prompts_dir": os.path.exists("Supervisor/prompts"),
    "subagents_dir": os.path.exists("Supervisor/subagents")
}}
results["structure"] = structure

print(json.dumps(results, indent=2))
'''

    # Write and execute test script
    script_path = f"{project_root}/test_import.py"
    try:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(test_script)

        # Execute the test script
        process = subprocess.run(
            ["python", "test_import.py"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10
        )

        # Clean up
        if os.path.exists(script_path):
            os.remove(script_path)

        if process.returncode == 0:
            try:
                results = json.loads(process.stdout)
                return {
                    "project_id": project_id,
                    "test_results": results,
                    "stderr": process.stderr if process.stderr else None
                }
            except json.JSONDecodeError:
                return {
                    "project_id": project_id,
                    "test_results": "JSON_PARSE_ERROR",
                    "stdout": process.stdout,
                    "stderr": process.stderr
                }
        else:
            return {
                "project_id": project_id,
                "test_results": "EXECUTION_FAILED",
                "stdout": process.stdout,
                "stderr": process.stderr,
                "return_code": process.returncode
            }

    except Exception as e:
        # Clean up on error
        if os.path.exists(script_path):
            os.remove(script_path)
        return {
            "project_id": project_id,
            "test_results": "EXCEPTION",
            "error": str(e)
        }


def generate_fallback_response(user_message: str, agents: list):
    """
    Generate a fallback response when agents are not working properly.
    """
    agent_names = [agent.name for agent in agents] if agents else []

    # Simple keyword-based responses
    message_lower = user_message.lower()

    if any(word in message_lower for word in ['hello', 'hi', 'hey', 'greetings']):
        if agent_names:
            return f"Hello! I'm having trouble connecting to the agents right now, but I can see you have these agents available: {', '.join(agent_names)}. Please try again in a moment."
        else:
            return "Hello! I'm having trouble connecting to the agents right now. Please ensure agents are created and deployed for this project."

    elif any(word in message_lower for word in ['help', 'what', 'how', 'can you']):
        if agent_names:
            return f"I'm currently experiencing technical difficulties connecting to the agents. Your project has these agents: {', '.join(agent_names)}. Please try redeploying the project or contact support."
        else:
            return "I'm currently experiencing technical difficulties. It looks like no agents are set up for this project yet. Please create and deploy some agents first."


@router.get("/debug/{project_id}")
def debug_project_structure(project_id: str, db: Session = Depends(get_db)):
    """
{{ ... }}
    """
    try:
        # Validate project ID format
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid project ID format")

    # Check if project exists
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_root = f"./project/{project_id}"

    # Check various files and directories
    structure_check = {
        "project_root_exists": os.path.exists(project_root),
        "main_py_exists": os.path.exists(f"{project_root}/main.py"),
        "supervisor_dir_exists": os.path.exists(f"{project_root}/Supervisor"),
        "supervisor_agent_exists": os.path.exists(f"{project_root}/Supervisor/agent.py"),
        "supervisor_init_exists": os.path.exists(f"{project_root}/Supervisor/__init__.py"),
        "prompts_dir_exists": os.path.exists(f"{project_root}/Supervisor/prompts"),
        "system_instruction_exists": os.path.exists(f"{project_root}/Supervisor/prompts/system_instruction.py"),
        "subagents_dir_exists": os.path.exists(f"{project_root}/Supervisor/subagents"),
        "subagents_init_exists": os.path.exists(f"{project_root}/Supervisor/subagents/__init__.py"),
    }

    # List subagent directories
    subagents = []
    subagents_path = f"{project_root}/Supervisor/subagents"
    if os.path.exists(subagents_path):
        for item in os.listdir(subagents_path):
            item_path = os.path.join(subagents_path, item)
            if os.path.isdir(item_path) and not item.startswith('__'):
                subagents.append({
                    "name": item,
                    "agent_py_exists": os.path.exists(f"{item_path}/agent.py"),
                    "init_py_exists": os.path.exists(f"{item_path}/__init__.py")
                })

    # Get database agents
    db_agents = db.query(Agent).filter(Agent.project_id == project_uuid).all()

    return {
        "project_id": project_id,
        "project_name": project.name,
        "project_root": project_root,
        "structure_check": structure_check,
        "subagents_on_filesystem": subagents,
        "agents_in_database": [
            {
                "id": str(agent.id),
                "name": agent.name,
                "status": agent.status
            }
            for agent in db_agents
        ]
    }
