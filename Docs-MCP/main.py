"""
main.py - Single agent with all MCP tools
Run with: python main.py
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
import os
from dotenv import load_dotenv

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.agents import Agent
from google.adk.tools.mcp_tool import MCPToolset, StreamableHTTPConnectionParams
from google.genai.types import Content, Part

# Load environment variables
load_dotenv()

app = FastAPI(title="Docs-MCP Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_service = InMemorySessionService()
toolset: MCPToolset | None = None
runner: Runner | None = None


def init_runner():
    global toolset, runner
    if runner is not None:
        return runner

    # Check for API key
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Missing Google API key! Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable.\n"
            "Get your key from: https://aistudio.google.com/apikey"
        )

    toolset = MCPToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="http://localhost:8009/mcp"
        )
    )

    agent = Agent(
        name="docs_mcp_agent",
        model="gemini-2.0-flash",
        description="Docs-MCP assistant with access to all documentation tools",
        instruction="""
        You are the Docs-MCP assistant with access to all MCP tools.
        
        Available tools:
        - scrape_docs(project, library, url, version?, content_type='docs', maxPages=50?, maxDepth=2?, scope='subpages'?, followRedirects=True?)
          - The 'url' argument can be a web URL (https://...), or a local file/folder path using the 'file://' protocol (e.g., file:///path/to/file.txt or file:///path/to/folder).
          - You are allowed and encouraged to use 'file://' for reading local files and folders, just as you would scrape a website.
          - Do NOT reject 'file://' arguments; process them as valid sources.
        - search_docs(project, library, query, version?, content_type='docs', limit=5?)
        - list_projects()
        - check_project(project)
        - list_libraries(project?)
        - find_version(project, library, content_type='docs', targetVersion?)
        - remove_docs(project, library, version?, content_type='docs')
        - fetch_url(url, project, content_type='docs', followRedirects=True?)
        - detailed_stats(project?, library?, version?)
        
        IMPORTANT BEHAVIOR:
        - For fetch_url requests: Return ONLY the raw markdown content from the tool, without any additional text, commentary, or explanation.
        - For all other tools: Return the tool result clearly formatted.
        - For any user request mentioning a local file, folder, or 'file://', you must call scrape_docs with the given file/folder path.
        - Return the backend tool's result, do not refuse or apologize for local file access.
        - Only apologize if the actual backend returns an error.
        
        When the user asks to "Fetch content from [URL]" or similar:
        1. Call fetch_url with the provided URL
        2. Return ONLY the exact output from the tool, nothing else
        3. Do NOT add phrases like "Here is the content" or "I have included"
        4. Do NOT wrap the content in explanations
        
        For other requests, call the appropriate tool and present results in a clear, user-friendly format.
        """,
        tools=[toolset],
    )

    runner = Runner(
        app_name="docs_mcp_agent",
        agent=agent,
        session_service=session_service,
    )

    return runner


class QueryRequest(BaseModel):
    query: str
    user_id: str = "default_user"
    session_id: str = "default_session"


@app.get("/")
async def health():
    return {"status": "ok", "message": "Docs-MCP Agent API"}


@app.post("/query")
async def query_agent(request: QueryRequest):
    """Single endpoint - agent decides which tool to use"""
    init_runner()

    try:
        user_id = request.user_id
        session_id = request.session_id

        # Ensure session exists
        existing = await session_service.get_session(
            app_name="docs_mcp_agent",
            user_id=user_id,
            session_id=session_id,
        )
        if existing is None:
            await session_service.create_session(
                app_name="docs_mcp_agent",
                user_id=user_id,
                session_id=session_id,
            )

        content = Content(role="user", parts=[Part(text=request.query)])

        result_text = None
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                try:
                    result_text = event.content.parts[0].text
                except Exception:
                    result_text = str(event.content.parts[0])

        if not result_text:
            return JSONResponse(status_code=404, content={"error": "No response from agent"})

        return JSONResponse(status_code=200, content={"result": result_text})

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("🚀 Starting Docs-MCP Agent API on http://localhost:8002")
    print("📚 Make sure MCP Server is running on http://localhost:8009")
    print("\n✨ Single agent with all tools - just send natural language queries!")

    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
