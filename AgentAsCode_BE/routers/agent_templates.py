from services.github_template_loader import github_loader
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import sys
import os
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('agent_templates.log')
    ]
)
logger = logging.getLogger(__name__)

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

router = APIRouter(prefix="/admin", tags=["Agent Templates"])


class AgentTemplate(BaseModel):
    id: str
    name: str
    agent_name: str
    orchestrator_prompt: str
    final_response_prompt: str
    description: str
    category: str


class SubAgentTemplate(BaseModel):
    id: str
    name: str
    worker_prompt: str
    description: str

# Load templates from GitHub only (no fallback)


def load_templates():
    """Load templates from GitHub repository only"""
    logger.info("Loading templates from GitHub...")
    try:
        template_data = github_loader.load_templates_from_github()
        main_templates = template_data.get("main_templates", [])
        sub_templates = template_data.get("sub_templates", {})

        logger.info(
            f"Loaded {len(main_templates)} main templates and {len(sub_templates)} sub-template groups from GitHub")

        # Log template IDs for debugging
        if main_templates:
            logger.info("Main template IDs: " +
                        ", ".join(t.get('id', 'unknown') for t in main_templates))
        if sub_templates:
            logger.info(
                f"Sub-template groups: {', '.join(sub_templates.keys())}")

        return main_templates, sub_templates

    except Exception as e:
        logger.error(f"Error in load_templates: {str(e)}", exc_info=True)
        raise


# Initialize templates from GitHub only
AGENT_TEMPLATES_HEALTHCARE, SUB_AGENT_TEMPLATES = load_templates()


@router.get("/agent_templates/categories")
async def get_agent_template_categories():
    """
    Get all available agent template categories.
    """
    try:
        categories = list(set(template["category"]
                          for template in AGENT_TEMPLATES_HEALTHCARE))
        return {"categories": sorted(categories)}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching categories: {str(e)}")


@router.get("/agent_templates", response_model=List[AgentTemplate])
async def get_agent_templates():
    """
    Get all available agent templates with their predefined prompts.
    """
    try:
        global AGENT_TEMPLATES_HEALTHCARE

        # Reload templates from GitHub to ensure we have the latest
        try:
            AGENT_TEMPLATES_HEALTHCARE, _ = load_templates()
        except Exception as e:
            logger.error(f"Error refreshing templates: {str(e)}")
            # Continue with existing templates if refresh fails

        if not AGENT_TEMPLATES_HEALTHCARE:
            raise HTTPException(
                status_code=404,
                detail={
                    "message": "No templates available.",
                    "repository": "https://github.com/HLokeshwariEmids/AAC_Templates",
                    "templates_loaded": len(AGENT_TEMPLATES_HEALTHCARE) if AGENT_TEMPLATES_HEALTHCARE else 0,
                    "error": str(e) if 'e' in locals() else None
                }
            )

        logger.info(f"Returning {len(AGENT_TEMPLATES_HEALTHCARE)} templates")
        return [AgentTemplate(**template) for template in AGENT_TEMPLATES_HEALTHCARE]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_agent_templates: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Error fetching agent templates",
                "error": str(e),
                "templates_loaded": len(AGENT_TEMPLATES_HEALTHCARE) if AGENT_TEMPLATES_HEALTHCARE else 0
            }
        )


@router.get("/subagents/{template_id}")
async def get_subagents_simple(template_id: str):
    """
    Get sub-agent templates for a specific template
    """
    if not SUB_AGENT_TEMPLATES:
        raise HTTPException(
            status_code=404, detail="No sub-agent templates available. Please check GitHub repository: https://github.com/HLokeshwariEmids/AAC_Templates")

    if template_id not in SUB_AGENT_TEMPLATES:
        raise HTTPException(
            status_code=404, detail=f"No sub-agents found for template '{template_id}'. Available templates: {list(SUB_AGENT_TEMPLATES.keys())}")

    return SUB_AGENT_TEMPLATES[template_id]


@router.get("/agent_templates_subagents/{template_id}", response_model=List[SubAgentTemplate])
async def get_subagents_for_template(template_id: str):
    """
    Get sub-agent templates for a specific main agent template.
    """
    global AGENT_TEMPLATES_HEALTHCARE, SUB_AGENT_TEMPLATES
    
    try:
        logger.info(f"Requesting sub-agents for template: {template_id}")
        logger.info(f"Available templates: {list(SUB_AGENT_TEMPLATES.keys())}")
        logger.info(f"Total sub-templates loaded: {len(SUB_AGENT_TEMPLATES)}")
        
        if template_id not in SUB_AGENT_TEMPLATES:
            # Try to reload templates in case they failed to load initially
            try:
                logger.info("Template not found, attempting to reload from GitHub...")
                AGENT_TEMPLATES_HEALTHCARE, SUB_AGENT_TEMPLATES = load_templates()
                logger.info(f"Reloaded templates. Available: {list(SUB_AGENT_TEMPLATES.keys())}")
            except Exception as reload_error:
                logger.error(f"Failed to reload templates: {reload_error}")
            
            # Check again after reload
            if template_id not in SUB_AGENT_TEMPLATES:
                raise HTTPException(
                    status_code=404, 
                    detail={
                        "message": f"No sub-agents found for template '{template_id}'",
                        "available_templates": list(SUB_AGENT_TEMPLATES.keys()),
                        "total_templates": len(SUB_AGENT_TEMPLATES),
                        "github_repo": "https://github.com/HLokeshwariEmids/AAC_Templates"
                    }
                )

        sub_agents = SUB_AGENT_TEMPLATES[template_id]
        logger.info(f"Found {len(sub_agents)} sub-agents for template '{template_id}'")
        return [SubAgentTemplate(**sub_agent) for sub_agent in sub_agents]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching sub-agents for {template_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Error fetching sub-agents: {str(e)}")


@router.get("/sub_agents/{template_id}", response_model=List[SubAgentTemplate])
async def get_sub_agents_for_template(template_id: str):
    """
    Get sub-agent templates for a specific main agent template.
    """
    try:
        if template_id not in SUB_AGENT_TEMPLATES:
            raise HTTPException(
                status_code=404, detail=f"No sub-agents found for template '{template_id}'")

        sub_agents = SUB_AGENT_TEMPLATES[template_id]
        return [SubAgentTemplate(**sub_agent) for sub_agent in sub_agents]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching sub-agents: {str(e)}")


@router.get("/agent_templates/{template_id}", response_model=AgentTemplate)
async def get_agent_template(template_id: str):
    """
    Get a specific agent template by ID.
    """
    try:
        template = next(
            (t for t in AGENT_TEMPLATES_HEALTHCARE if t["id"] == template_id), None)
        if not template:
            raise HTTPException(
                status_code=404, detail=f"Agent template with ID '{template_id}' not found")

        return AgentTemplate(**template)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching agent template: {str(e)}")


@router.post("/refresh_templates")
async def refresh_templates_from_github():
    """
    Refresh templates from GitHub repository
    """
    global AGENT_TEMPLATES_HEALTHCARE, SUB_AGENT_TEMPLATES

    try:
        # Reload templates from GitHub
        AGENT_TEMPLATES_HEALTHCARE, SUB_AGENT_TEMPLATES = load_templates()

        return {
            "message": "Templates refreshed successfully",
            "main_templates_count": len(AGENT_TEMPLATES_HEALTHCARE),
            "sub_templates_count": sum(len(subs) for subs in SUB_AGENT_TEMPLATES.values()),
            "source": "github"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error refreshing templates: {str(e)}")


@router.get("/template_info")
async def get_template_info():
    """
    Get information about current templates and their source
    """
    return {
        "main_templates_count": len(AGENT_TEMPLATES_HEALTHCARE),
        "sub_templates_count": sum(len(subs) for subs in SUB_AGENT_TEMPLATES.values()),
        "sub_templates_by_main": {k: len(v) for k, v in SUB_AGENT_TEMPLATES.items()},
        "github_repo": "https://github.com/HLokeshwariEmids/AAC_Templates"
    }


@router.get("/test_sub_agents/{template_id}")
async def test_sub_agents(template_id: str):
    """
    Test endpoint for sub-agents
    """
    return {
        "message": f"Testing sub-agents for {template_id}", 
        "available_templates": list(SUB_AGENT_TEMPLATES.keys()),
        "template_exists": template_id in SUB_AGENT_TEMPLATES,
        "sub_agent_count": len(SUB_AGENT_TEMPLATES.get(template_id, [])),
        "total_templates": len(SUB_AGENT_TEMPLATES)
    }

@router.get("/debug/templates")
async def debug_templates():
    """
    Debug endpoint to check template loading status
    """
    return {
        "main_templates": len(AGENT_TEMPLATES_HEALTHCARE),
        "sub_templates": len(SUB_AGENT_TEMPLATES),
        "sub_template_keys": list(SUB_AGENT_TEMPLATES.keys()),
        "main_template_ids": [t.get('id', 'no-id') for t in AGENT_TEMPLATES_HEALTHCARE] if AGENT_TEMPLATES_HEALTHCARE else [],
        "github_repo": "https://github.com/HLokeshwariEmids/AAC_Templates"
    }
