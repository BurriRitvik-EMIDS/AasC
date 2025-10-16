from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part
from dotenv import load_dotenv
import json
import os
import sys
import uuid
import asyncio
import traceback
from fastapi import FastAPI, Request
from pydantic import BaseModel
from Supervisor.agent import root_agent
from google.adk.agents import LlmAgent
from google.genai.types import Content, Part
from fastapi.responses import StreamingResponse, JSONResponse
import asyncio
import json
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
import os
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv()

# Add current directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Initialize FastAPI app with CORS
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

session_service = InMemorySessionService()
runner: Runner | None = None


def init_runner():
    global runner
    if runner is not None:
        return runner
    
    agent = root_agent
    runner = Runner(
        app_name="Agent-As-Code",
        agent=agent,
        session_service=session_service,
    )
    return runner


class MessageRequest(BaseModel):
    payload: str


class MemberRequest(BaseModel):
    member_id: str


# Deryption Keys
key = os.getenv('AES_KEY')
iv = os.getenv('AES_IV').encode('utf-8')


def decrypt(enc, key, iv):
    enc = base64.b64decode(enc)
    cipher = AES.new(key.encode('utf-8'), AES.MODE_CBC, iv)
    return unpad(cipher.decrypt(enc), 16)


@app.post("/query")
async def chat(req: MessageRequest):
    init_runner()
    """
    Main query endpoint that processes user messages through the agent.
    """
    decrypted_message = decrypt(req.payload, key, iv).decode('utf-8')
    # data = json.loads(req.payload) if isinstance(
    #     req.payload, str) else req.payload
    data = json.loads(decrypted_message)
    print(data)
    session = await session_service.get_session(
        app_name="Agent-As-Code",
        user_id=data.get("thread_id"),
        session_id=data.get("thread_id")
    )
    if session is None:
        session = await session_service.create_session(
            app_name="Agent-As-Code",
            user_id=data.get("thread_id"),
            session_id=data.get("thread_id")
        )

    # Prepare message
    new_message = Content(role="user", parts=[Part(text=data["message"])])
    # new_message = Content(role="user", parts=[Part(text=decrypted_message)])

    async def event_generator():
        async for event in runner.run_async(
            user_id=data.get("thread_id"),
            session_id=data.get("thread_id"),
            new_message=new_message
        ):
            # Convert event to text-based JSON for streaming
            message = {
                "role": event.author,
                "content": event.content.parts[0].text,
                "image": None,
                "usage_metadata": None,
                "llm_source": "unknown",
                "data_source": "unknown"
            }
            print(message)
            # yield f"data: {json.dumps(message)}\n"
            yield json.dumps(message) + "\n"
            await asyncio.sleep(0.01)  # Small delay to allow streaming

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    # Get port from environment variable or use default
    port = int(os.getenv("PORT", 8987))

    print(f"[INFO] Starting Agent API on port {port}")
    print(f"[INFO] Root agent loaded: {root_agent is not None}")

    # Run the FastAPI app
    import uvicorn
    init_runner()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,  # Enable auto-reload in development
        log_level="info"
    )
