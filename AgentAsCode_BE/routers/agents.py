# # routers/agent.py
# from fastapi import APIRouter, Depends, HTTPException
# from sqlalchemy.orm import Session
# from schemas import AgentCreate, AgentCodeUpdate,AgentPromptUpdate
# from models import Agent, AgentTool, CodeVersion, Project, Tool
# from database import get_db
# from generator import generate_agent_files, update_supervisor_and_maintainer, append_to_supervisor_prompt
# import uuid
# from datetime import datetime

# router = APIRouter(prefix="/admin", tags=["Agents"])

# @router.post("/create_agent")
# def create_agent(data: AgentCreate, db: Session = Depends(get_db)):

#     project = db.query(Project).filter(Project.id == data.project_id).first()
#     if not project:
#         raise HTTPException(status_code=404, detail="Project not found")

#     agent_id = uuid.uuid4()
#     project_path = f"./project/{data.project_id}"
#     agent_url = generate_agent_files(project_path,data)
#     update_supervisor_and_maintainer(project_path)
#     append_to_supervisor_prompt(project_path,data.agent_name)
#     new_agent = Agent(
#         id=agent_id,
#         project_id=data.project_id,
#         name=data.agent_name,
#         prompt=data.agent_prompt,
#         blob_url= str(data.project_id) + agent_url,
#         status="active"
#     )
#     db.add(new_agent)

#     for idx, tool_id in enumerate(data.tools_id_selected):
#         db.add(AgentTool(agent_id=agent_id, tool_id=tool_id, order=idx + 1))

#     db.add(CodeVersion(
#         id=uuid.uuid4(),
#         agent_id=agent_id,
#         version=1,
#         code_blob_url=new_agent.blob_url,
#         updated_by="system",
#         updated_at=datetime.utcnow(),
#         notes="Initial generation"
#     ))

#     db.commit()
#     return {"agent_id": str(agent_id), "message": "Agent created and code generated successfully"}


# @router.get("/get_agent_code/{agent_id}")
# def get_agent_code(agent_id: str, db: Session = Depends(get_db)):
#     agent = db.query(Agent).filter(Agent.id == agent_id).first()
#     if not agent:
#         raise HTTPException(status_code=404, detail="Agent not found")
#     return {"agent_id": agent_id, "code": f"# Code content from {agent.blob_url} (simulated)"}

# @router.get("/get_agents/{project_id}")
# def get_agents(project_id: str, db: Session = Depends(get_db)):
#     agents = db.query(Agent).filter(Agent.project_id == project_id).all()
#     if not agents:
#         raise HTTPException(status_code=404, detail="No agents found for this project")
#     return agents


# @router.put("/update_agent_prompt")
# def update_agent_prompt(data: AgentPromptUpdate, db: Session = Depends(get_db)):
#     agent = db.query(Agent).filter(Agent.id == data.agent_id).first()
#     if not agent:
#         raise HTTPException(status_code=404, detail="Agent not found")

#     # Update the agent prompt
#     agent.prompt = data.agent_prompt
#     agent.updated_at = datetime.utcnow()

#     # Update the tools associated with the agent
#     # First, remove existing tools
#     db.query(AgentTool).filter(AgentTool.agent_id == data.agent_id).delete()

#     # Then add the new tools with updated order
#     for idx, tool_id in enumerate(data.tools_id_selected):
#         db.add(AgentTool(agent_id=data.agent_id, tool_id=tool_id, order=idx + 1))

#     db.commit()
#     return {"message": "Agent prompt updated successfully"}


# @router.put("/update_agent_code")
# def update_agent_code(data: AgentCodeUpdate, db: Session = Depends(get_db)):
#     agent = db.query(Agent).filter(Agent.id == data.agent_id).first()
#     if not agent:
#         raise HTTPException(status_code=404, detail="Agent not found")

#     existing_versions = db.query(CodeVersion).filter(CodeVersion.agent_id == data.agent_id).count()
#     new_version = existing_versions + 1
#     new_blob_url = f"https://blobstorage/agent_{data.agent_id}_v{new_version}.py"

#     agent.blob_url = new_blob_url
#     agent.updated_at = datetime.utcnow()

#     db.add(CodeVersion(
#         id=uuid.uuid4(),
#         agent_id=data.agent_id,
#         version=new_version,
#         code_blob_url=new_blob_url,
#         updated_by="user",
#         updated_at=datetime.utcnow(),
#         notes="Manual update"
#     ))

#     db.commit()
#     return {"message": "Agent code updated successfully"}


# routers/agents.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
from schemas import AgentCreate, AgentCodeUpdate, AgentPromptUpdate
from models import Agent, AgentTool, CodeVersion, Project, Tool
from database import get_db
from generator import generate_agent_files, update_supervisor_and_maintainer, append_to_supervisor_prompt, remove_from_supervisor_prompt
import uuid
from datetime import datetime

router = APIRouter(prefix="/admin", tags=["Agents"])

# In-memory tracking of subagent names per project_id
created_agents = {}  # project_id: set of agent names


@router.post("/create_agent")
def create_agent(data: AgentCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    agent_id = uuid.uuid4()
    project_path = f"./project/{data.project_id}"

    agent_name = data.agent_name.lower()

    # Validate selected tool IDs before writing anything to DB
    if data.tools_id_selected:
        rows = db.query(Tool.id).filter(
            Tool.project_id == data.project_id).all()
        valid_ids_set = {str(row[0]) for row in rows}
        invalid_ids = [str(tid) for tid in data.tools_id_selected if str(
            tid) not in valid_ids_set]
        if invalid_ids:
            raise HTTPException(
                status_code=400, detail=f"Invalid tool IDs for this project: {', '.join(invalid_ids)}")

    # Generate filesystem first
    generate_agent_files(project_path, data)

    # Update supervisor files in memory and on disk
    agent_names_set = created_agents.setdefault(str(data.project_id), set())
    agent_names_set.add(agent_name)

    supervisor_name = getattr(project, "supervisor_name", None) or "Supervisor"
    update_supervisor_and_maintainer(
        project_path, supervisor_name, sorted(agent_names_set)
    )
    append_to_supervisor_prompt(project_path, data.agent_name)

    # Prepare DB objects and commit with rollback + filesystem cleanup on failure
    try:
        new_agent = Agent(
            id=agent_id,
            project_id=data.project_id,
            name=data.agent_name,
            prompt=data.agent_prompt,
            blob_url=str(data.project_id) +
            f"/{supervisor_name}/subagents/{agent_name}/agent.py",
            status="active",
        )
        db.add(new_agent)

        for idx, tool_id in enumerate(data.tools_id_selected):
            db.add(AgentTool(agent_id=agent_id, tool_id=tool_id, order=idx + 1))

        db.add(
            CodeVersion(
                id=uuid.uuid4(),
                agent_id=agent_id,
                version=1,
                code_blob_url=new_agent.blob_url,
                updated_by="system",
                updated_at=datetime.utcnow(),
                notes="Initial generation",
            )
        )

        db.commit()
        return {"agent_id": str(agent_id), "message": "Agent created and code generated successfully"}

    except Exception as e:
        db.rollback()
        # Cleanup filesystem artifacts to avoid ghost subagents
        try:
            import shutil
            subagent_path = f"{project_path}/{supervisor_name}/subagents/{agent_name}"
            if os.path.exists(subagent_path):
                shutil.rmtree(subagent_path)
            prompt_path = f"{project_path}/{supervisor_name}/prompts/{agent_name}_instruction.py"
            if os.path.exists(prompt_path):
                os.remove(prompt_path)
            # Rebuild supervisor without this agent
            agent_names_set.discard(agent_name)
            update_supervisor_and_maintainer(
                project_path, supervisor_name, sorted(agent_names_set))
        except Exception:
            pass
        raise HTTPException(
            status_code=500, detail=f"Failed to create agent: {str(e)}")


@router.get("/get_agent_code/{agent_id}")
def get_agent_code(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # The blob_url is in format: "{project_id}/{supervisor_name}/subagents/{agent_name}/agent.py"
    parts = agent.blob_url.split('/')
    if len(parts) < 5:
        raise HTTPException(
            status_code=500, detail=f"Invalid agent blob URL format: {agent.blob_url}")

    project_id = parts[0]
    supervisor_name = parts[1]
    agent_name = parts[3]  # subagents/{agent_name}

    # Construct the file path based on the actual file structure
    file_path = f"./project/{project_id}/{supervisor_name}/subagents/{agent_name}/agent.py"

    try:
        # Read the agent code
        with open(file_path, 'r', encoding='utf-8') as file:
            code_content = file.read()

        return {
            "agent_id": agent_id,
            "agent_name": agent_name,
            "code": code_content
        }
    except FileNotFoundError:
        # Try alternative path format for backward compatibility
        try:
            alt_path = f"./project/{project_id}/agents/{agent_name}/agent.py"
            with open(alt_path, 'r', encoding='utf-8') as file:
                code_content = file.read()
            return {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "code": code_content
            }
        except FileNotFoundError:
            raise HTTPException(
                status_code=404, detail=f"Agent code file not found at: {file_path} or {alt_path}")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error reading agent code: {str(e)}")


@router.get("/get_agents/{project_id}")
def get_agents(project_id: str, db: Session = Depends(get_db)):
    agents = db.query(Agent).filter(Agent.project_id == project_id).all()
    # Return empty list for frontend instead of 404 to reflect state
    return agents or []


@router.put("/update_agent_prompt")
def update_agent_prompt(data: AgentPromptUpdate, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == data.agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.prompt = data.agent_prompt
    agent.updated_at = datetime.utcnow()

    db.query(AgentTool).filter(AgentTool.agent_id == data.agent_id).delete()

    for idx, tool_id in enumerate(data.tools_id_selected):
        db.add(AgentTool(agent_id=data.agent_id, tool_id=tool_id, order=idx + 1))

    db.commit()
    return {"message": "Agent prompt updated successfully"}


@router.put("/update_agent_code")
def update_agent_code(data: AgentCodeUpdate, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == data.agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    existing_versions = db.query(CodeVersion).filter(
        CodeVersion.agent_id == data.agent_id).count()
    new_version = existing_versions + 1
    new_blob_url = f"https://blobstorage/agent_{data.agent_id}_v{new_version}.py"

    agent.blob_url = new_blob_url
    agent.updated_at = datetime.utcnow()

    db.add(CodeVersion(
        id=uuid.uuid4(),
        agent_id=data.agent_id,
        version=new_version,
        code_blob_url=new_blob_url,
        updated_by="user",
        updated_at=datetime.utcnow(),
        notes="Manual update"
    ))

    db.commit()
    return {"message": "Agent code updated successfully"}


@router.delete("/delete_agent/{agent_id}")
def delete_agent_by_path(agent_id: str, db: Session = Depends(get_db)):
    """
    Delete an agent by agent ID from URL path.
    Removes agent from database, filesystem, and updates supervisor configuration.
    """
    try:
        # Validate agent ID format and convert to UUID
        try:
            agent_uuid = uuid.UUID(agent_id)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid agent ID format")

        # Check if agent exists
        agent = db.query(Agent).filter(Agent.id == agent_uuid).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        # Get project information
        project = db.query(Project).filter(
            Project.id == agent.project_id).first()
        if not project:
            raise HTTPException(
                status_code=404, detail="Associated project not found")

        project_path = f"./project/{agent.project_id}"
        supervisor_name = getattr(
            project, "supervisor_name", None) or "Supervisor"
        agent_name = agent.name.lower()

        # Delete related records in correct order (due to foreign key constraints)
        # Delete code versions for this agent
        code_versions = db.query(CodeVersion).filter(
            CodeVersion.agent_id == agent_uuid).all()
        for cv in code_versions:
            db.delete(cv)

        # Delete agent tools for this agent
        agent_tools = db.query(AgentTool).filter(
            AgentTool.agent_id == agent_uuid).all()
        for at in agent_tools:
            db.delete(at)

        # Delete the agent from database
        db.delete(agent)
        db.commit()

        # Remove agent from filesystem
        import shutil
        subagent_path = f"{project_path}/{supervisor_name}/subagents/{agent_name}"
        if os.path.exists(subagent_path):
            shutil.rmtree(subagent_path)

        # Remove agent prompt file
        prompt_path = f"{project_path}/{supervisor_name}/prompts/{agent_name}_instruction.py"
        if os.path.exists(prompt_path):
            os.remove(prompt_path)

        # Update supervisor configuration to remove this agent
        # Get remaining agents for this project
        remaining_agents = db.query(Agent).filter(
            Agent.project_id == agent.project_id).all()
        remaining_agent_names = [a.name.lower() for a in remaining_agents]

        # Update in-memory tracking
        if str(agent.project_id) in created_agents:
            created_agents[str(agent.project_id)].discard(agent_name)

        # Update supervisor and maintainer files
        update_supervisor_and_maintainer(
            project_path, supervisor_name, remaining_agent_names)

        # Remove agent from supervisor prompt
        remove_from_supervisor_prompt(
            project_path, agent_name, supervisor_name)

        return {
            "message": "Agent deleted successfully",
            "agent_id": agent_id,
            "agent_name": agent.name,
            "project_id": str(agent.project_id)
        }

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Internal server error occurred while deleting agent: {str(e)}")


@router.post("/delete_agent")
def delete_agent_by_body(request_data: dict, db: Session = Depends(get_db)):
    """
    Delete an agent by agent ID from request body.
    Expects: {"agent_id": "<uuid>"}
    """
    try:
        # Extract agent_id from request body
        agent_id = request_data.get("agent_id")
        if not agent_id:
            raise HTTPException(
                status_code=400, detail="Missing agent_id in request body")

        # Validate agent ID format and convert to UUID
        try:
            agent_uuid = uuid.UUID(agent_id)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid agent ID format")

        # Check if agent exists
        agent = db.query(Agent).filter(Agent.id == agent_uuid).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

        # Get project information
        project = db.query(Project).filter(
            Project.id == agent.project_id).first()
        if not project:
            raise HTTPException(
                status_code=404, detail="Associated project not found")

        project_path = f"./project/{agent.project_id}"
        supervisor_name = getattr(
            project, "supervisor_name", None) or "Supervisor"
        agent_name = agent.name.lower()

        # Delete related records in correct order (due to foreign key constraints)
        # Delete code versions for this agent
        code_versions = db.query(CodeVersion).filter(
            CodeVersion.agent_id == agent_uuid).all()
        for cv in code_versions:
            db.delete(cv)

        # Delete agent tools for this agent
        agent_tools = db.query(AgentTool).filter(
            AgentTool.agent_id == agent_uuid).all()
        for at in agent_tools:
            db.delete(at)

        # Delete the agent from database
        db.delete(agent)
        db.commit()

        # Remove agent from filesystem
        import shutil
        subagent_path = f"{project_path}/{supervisor_name}/subagents/{agent_name}"
        if os.path.exists(subagent_path):
            shutil.rmtree(subagent_path)

        # Remove agent prompt file
        prompt_path = f"{project_path}/{supervisor_name}/prompts/{agent_name}_instruction.py"
        if os.path.exists(prompt_path):
            os.remove(prompt_path)

        # Update supervisor configuration to remove this agent
        # Get remaining agents for this project
        remaining_agents = db.query(Agent).filter(
            Agent.project_id == agent.project_id).all()
        remaining_agent_names = [a.name.lower() for a in remaining_agents]

        # Update in-memory tracking
        if str(agent.project_id) in created_agents:
            created_agents[str(agent.project_id)].discard(agent_name)

        # Update supervisor and maintainer files
        update_supervisor_and_maintainer(
            project_path, supervisor_name, remaining_agent_names)

        # Remove agent from supervisor prompt
        remove_from_supervisor_prompt(
            project_path, agent_name, supervisor_name)

        return {
            "message": "Agent deleted successfully",
            "agent_id": agent_id,
            "agent_name": agent.name,
            "project_id": str(agent.project_id)
        }

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Internal server error occurred while deleting agent: {str(e)}")
