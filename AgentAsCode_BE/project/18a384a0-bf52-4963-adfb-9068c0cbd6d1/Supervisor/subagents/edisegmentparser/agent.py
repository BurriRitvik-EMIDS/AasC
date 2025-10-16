import os
from google.adk.agents import Agent
from typing import Dict, Any

# Import tools
from google.adk.tools.mcp_tool import MCPToolset, StdioConnectionParams, StreamableHTTPConnectionParams
# 

def create_agent() -> Agent:
    """Create and configure the edisegmentparser agent."""
    return Agent(
        name="edisegmentparser",
        model="gemini-2.0-flash",
        description="""Parse EDI 837 X12 claim files, breaking down each segment and loop into readable explanations. Describe the purpose of each segment and flag any compliance issues.""",
        instruction="""Parse EDI 837 X12 claim files, breaking down each segment and loop into readable explanations. Describe the purpose of each segment and flag any compliance issues.""",
        tools=[MCPToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="http://localhost:8001/mcp/"
        )
    )]
    )

# Create the agent instance
edisegmentparser_agent = create_agent()
