import os
from google.adk.agents import Agent
from typing import Dict, Any

# Import tools
from google.adk.tools.mcp_tool import MCPToolset, StdioConnectionParams, StreamableHTTPConnectionParams
# 

def create_agent() -> Agent:
    """Create and configure the ediqualitychecker agent."""
    return Agent(
        name="ediqualitychecker",
        model="gemini-2.0-flash",
        description="""Check EDI 837 files for formatting, data, and compliance errors. Identify missing, incorrect, or out-of-range fields; output a problem checklist with suggested fixes.""",
        instruction="""Check EDI 837 files for formatting, data, and compliance errors. Identify missing, incorrect, or out-of-range fields; output a problem checklist with suggested fixes.""",
        tools=[MCPToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="http://localhost:8001/mcp/"
        )
    )]
    )

# Create the agent instance
ediqualitychecker_agent = create_agent()
