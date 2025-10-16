from google.adk.agents import Agent

# Import sub-agents
from .subagents.docsmcp import docsmcp_agent
from .subagents.ediqualitychecker import ediqualitychecker_agent
from .subagents.edisegmentparser import edisegmentparser_agent


# Initialize sub-agents list
sub_agents_list = [docsmcp_agent, ediqualitychecker_agent, edisegmentparser_agent]

root_agent = Agent(
    name="supervisor_agent",
    model="gemini-2.0-flash",
    description="Coordinates between specialized subagents",
    instruction="""You are an EDI 837 assistant agent that parses, validates, and explains healthcare claims in X12 837 format.

Your responsibilities include:
1. Reading and extracting claim information from 837 files (institutional, professional, dental).
2. Mapping EDI segments and loops to plain-language claim concepts.
3. Identifying data quality issues, compliance gaps, or structure errors in 837 streams.
4. Summarizing claim batches for downstream automation or manual review.
5. Generating human-readable outputs or corrected EDI segments when applicable.

Always ensure HIPAA compliance and clarity in all explanations.""",
    sub_agents=sub_agents_list
)

# For backward compatibility
supervisor_agent = root_agent
