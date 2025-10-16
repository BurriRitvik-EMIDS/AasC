# routers/project.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import shutil
import logging
from schemas import ProjectCreate, ProjectUpdate
from models import Project, Agent, CodeVersion, AgentTool
from database import get_db
from generator import generate_project_files

import uuid

# Import running_projects from deploy module to check project status
from routers.deploy import running_projects

router = APIRouter(prefix="/admin", tags=["Projects"])

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_available_port(db: Session) -> int:
    """Generate a unique 4-digit port number that's not already in use."""
    import random
    while True:
        port = random.randint(1000, 9999)
        # Check if port is already in use by another project
        existing_project = db.query(Project).filter(
            Project.port_number == port).first()
        if not existing_project:
            return port


@router.post("/create_project")
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    project_id = uuid.uuid4()

    # Generate a unique port number if not provided
    port_number = data.port_number
    if port_number is None:
        port_number = get_available_port(db)
    else:
        # Check if the provided port is already in use
        existing_project = db.query(Project).filter(
            Project.port_number == port_number).first()
        if existing_project:
            raise HTTPException(
                status_code=400,
                detail=f"Port number {port_number} is already in use by another project"
            )

    # Create project base directory if it doesn't exist
    project_base = "./project"
    if not os.path.exists(project_base):
        os.makedirs(project_base)
    
    # Create project directory with UUID
    project_path = os.path.join(project_base, str(project_id))
    if not os.path.exists(project_path):
        os.makedirs(project_path)
    
    # Generate project files in the UUID directory
    generate_project_files(project_path, data)
    new_project = Project(
        id=project_id,
        name=data.project_name,
        description=data.project_description,
        supervisor_prompt=data.supervisor_prompt,
        final_response_prompt=data.final_response_prompt,
        platform=data.platform,
        azure_openai_key=data.azure_openai_key,
        azure_openai_url=data.azure_openai_url,
        port_number=port_number
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return {"project_id": str(new_project.id), "message": "Project created successfully"}


@router.get("/get_projects")
def get_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).all()
    if not projects:
        raise HTTPException(status_code=404, detail="No projects found")
    return projects


@router.get("/get_project/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/update_project/{project_id}")
def update_project(project_id: str, data: ProjectUpdate, db: Session = Depends(get_db)):
    """
    Update project settings by project ID.
    Only updates fields that are provided in the request body.
    """
    try:
        logger.info(f"Attempting to update project: {project_id}")

        # Validate project ID format and convert to UUID
        try:
            project_uuid = uuid.UUID(project_id)
        except ValueError:
            logger.warning(f"Invalid project ID format: {project_id}")
            raise HTTPException(
                status_code=400, detail="Invalid project ID format")

        # Check if project exists
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            logger.warning(f"Project not found: {project_id}")
            raise HTTPException(status_code=404, detail="Project not found")

        # Check if project is currently running - prevent updates to critical fields
        if project_id in running_projects:
            # Allow updates to non-critical fields only
            if data.port_number is not None and data.port_number != project.port_number:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot change port number while project is running. Please stop the project first."
                )

        # Check if new port number is already in use (if port_number is being updated)
        if data.port_number is not None and data.port_number != project.port_number:
            existing_project = db.query(Project).filter(
                Project.port_number == data.port_number,
                Project.id != project_uuid
            ).first()
            if existing_project:
                raise HTTPException(
                    status_code=400,
                    detail=f"Port number {data.port_number} is already in use by another project"
                )

        # Update only the fields that are provided
        update_data = data.dict(exclude_unset=True)
        for field, value in update_data.items():
            if field == "project_name":
                project.name = value
            elif field == "project_description":
                project.description = value
            elif field == "supervisor_prompt":
                project.supervisor_prompt = value
            elif field == "final_response_prompt":
                project.final_response_prompt = value
            elif field == "platform":
                project.platform = value
            elif field == "azure_openai_key":
                project.azure_openai_key = value
            elif field == "azure_openai_url":
                project.azure_openai_url = value
            elif field == "port_number":
                project.port_number = value

        # Commit the changes
        db.commit()
        db.refresh(project)

        logger.info(f"Successfully updated project: {project_id}")
        return {
            "message": "Project updated successfully",
            "project_id": project_id,
            "updated_fields": list(update_data.keys())
        }

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error updating project {project_id}: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error occurred while updating project: {str(e)}"
        )


@router.delete("/delete_project/{project_id}")
def delete_project_by_path(project_id: str, db: Session = Depends(get_db)):
    """
    Delete a project by project ID from URL path.
    Prevents deletion if project is currently running.
    """
    try:
        logger.info(f"Attempting to delete project: {project_id}")

        # Validate project ID format and convert to UUID
        try:
            project_uuid = uuid.UUID(project_id)
        except ValueError:
            logger.warning(f"Invalid project ID format: {project_id}")
            raise HTTPException(
                status_code=400, detail="Invalid project ID format")

        # Check if project exists
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            logger.warning(f"Project not found: {project_id}")
            raise HTTPException(status_code=404, detail="Project not found")

        # Check if project is currently running
        if project_id in running_projects:
            logger.warning(f"Cannot delete running project: {project_id}")
            raise HTTPException(
                status_code=400,
                detail="Cannot delete project that is currently running. Please stop the project first."
            )

        # Delete related records in correct order (due to foreign key constraints)
        # First, get all agents for this project
        agents = db.query(Agent).filter(Agent.project_id == project_uuid).all()

        # Delete code versions for each agent
        for agent in agents:
            code_versions = db.query(CodeVersion).filter(
                CodeVersion.agent_id == agent.id).all()
            for cv in code_versions:
                db.delete(cv)

            # Delete agent tools for each agent
            agent_tools = db.query(AgentTool).filter(
                AgentTool.agent_id == agent.id).all()
            for at in agent_tools:
                db.delete(at)

        # Delete agents
        for agent in agents:
            db.delete(agent)

        # Delete the project
        db.delete(project)
        db.commit()

        # Delete project files from filesystem
        project_path = f"./project/{project_id}"
        if os.path.exists(project_path):
            shutil.rmtree(project_path)
            logger.info(f"Deleted project files at: {project_path}")

        logger.info(f"Successfully deleted project: {project_id}")
        return {"message": "Project deleted successfully", "project_id": project_id}

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error deleting project {project_id}: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Internal server error occurred while deleting project: {str(e)}")


@router.post("/delete_project")
def delete_project_by_body(request_data: dict, db: Session = Depends(get_db)):
    """
    Delete a project by project ID from request body.
    Expects: {"project_id": "<uuid>"}
    Prevents deletion if project is currently running.
    """
    try:
        # Extract project_id from request body
        project_id = request_data.get("project_id")
        if not project_id:
            logger.warning("Missing project_id in request body")
            raise HTTPException(
                status_code=400, detail="Missing project_id in request body")

        logger.info(f"Attempting to delete project: {project_id}")

        # Validate project ID format and convert to UUID
        try:
            project_uuid = uuid.UUID(project_id)
        except ValueError:
            logger.warning(f"Invalid project ID format: {project_id}")
            raise HTTPException(
                status_code=400, detail="Invalid project ID format")

        # Check if project exists
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            logger.warning(f"Project not found: {project_id}")
            raise HTTPException(status_code=404, detail="Project not found")

        # Check if project is currently running
        if project_id in running_projects:
            logger.warning(f"Cannot delete running project: {project_id}")
            raise HTTPException(
                status_code=400,
                detail="Cannot delete project that is currently running. Please stop the project first."
            )

        # Delete related records in correct order (due to foreign key constraints)
        # First, get all agents for this project
        agents = db.query(Agent).filter(Agent.project_id == project_uuid).all()

        # Delete code versions for each agent
        for agent in agents:
            code_versions = db.query(CodeVersion).filter(
                CodeVersion.agent_id == agent.id).all()
            for cv in code_versions:
                db.delete(cv)

            # Delete agent tools for each agent
            agent_tools = db.query(AgentTool).filter(
                AgentTool.agent_id == agent.id).all()
            for at in agent_tools:
                db.delete(at)

        # Delete agents
        for agent in agents:
            db.delete(agent)

        # Delete the project
        db.delete(project)
        db.commit()

        # Delete project files from filesystem
        project_path = f"./project/{project_id}"
        if os.path.exists(project_path):
            shutil.rmtree(project_path)
            logger.info(f"Deleted project files at: {project_path}")

        logger.info(f"Successfully deleted project: {project_id}")
        return {"message": "Project deleted successfully", "project_id": project_id}

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error deleting project {project_id}: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Internal server error occurred while deleting project: {str(e)}")
