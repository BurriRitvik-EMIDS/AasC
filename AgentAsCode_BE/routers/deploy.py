from fastapi import APIRouter, Depends, HTTPException
from azure_blob_uploader import upload_folder_to_blob, get_blob, list_blob_files,upload_blob
from schemas import DownloadRequest,DeployAgentRequest
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session
from models import Project
from database import get_db
import os
from fastapi import UploadFile, File
import subprocess
import signal
import uuid

router = APIRouter(
    prefix="/deploy",
    tags=["Deployment"]
)
running_projects = {} 

@router.post("/agents")
def deploy_agents(request: DeployAgentRequest):
    project_root = rf"./project/{request.project_id}"  # Your project root

    try:
        upload_folder_to_blob(local_folder_path=project_root, blob_folder_path=request.project_id)
        return {"message": "Agents successfully deployed to Azure Blob Storage."}
    except Exception as e:
        return {"error": str(e)}
    
@router.post("/start_project")
def start_agents(request: DeployAgentRequest, db: Session = Depends(get_db)):
    project_root = rf"./project/{request.project_id}"  # Your project root

    try:
        # Get project details to get the port number
        project_uuid = uuid.UUID(request.project_id)
        project = db.query(Project).filter(Project.id == project_uuid).first()
        
        if not project:
            return {"error": f"Project {request.project_id} not found"}
        
        # Check if project is already running
        if request.project_id in running_projects:
            return {
                "message": f"Project {request.project_id} is already running",
                "pid": running_projects[request.project_id],
                "port": project.port_number
            }
        
        # Resolve main.py path (we won't rewrite it; we'll pass PORT via env)
        main_py_path = os.path.join(project_root, "main.py")
        
        # Check if main.py exists
        if not os.path.exists(main_py_path):
            return {"error": f"main.py not found in {project_root}"}
        
        # Check if google-adk module already exists
        google_adk_path = os.path.join(project_root, "google", "adk")
        if not os.path.exists(google_adk_path):
            print(f"[DEBUG] Creating working google-adk module...")
            try:
                from generator import create_working_google_adk_module
                create_working_google_adk_module(project_root)
                print(f"[DEBUG] Successfully created working google-adk module")
            except Exception as e:
                return {
                    "error": f"Error creating google-adk module: {str(e)}",
                    "project_id": request.project_id,
                    "port": project.port_number
                }
        else:
            print(f"[DEBUG] Using existing google-adk module at {google_adk_path}")
        
        # Install other dependencies from requirements.txt
        requirements_path = os.path.join(project_root, "requirements.txt")
        if os.path.exists(requirements_path):
            print(f"[DEBUG] Installing other dependencies from requirements.txt...")
            try:
                install_result = subprocess.run(
                    ["python", "-m", "pip", "install", "-r", "requirements.txt", "--force-reinstall"],
                    cwd=project_root,
                    capture_output=True,
                    text=True,
                    timeout=300  # 5 minutes timeout for installation
                )
                
                if install_result.returncode == 0:
                    print(f"[DEBUG] Successfully installed all dependencies")
                else:
                    print(f"[WARNING] Some dependencies failed to install: {install_result.stderr}")
                    
            except subprocess.TimeoutExpired:
                print(f"[WARNING] Dependency installation timed out")
            except Exception as e:
                print(f"[WARNING] Error installing dependencies: {str(e)}")
        
        # Verify google-adk module is now available
        try:
            # Test the import from the project directory
            test_code = f"""
import sys
import os
sys.path.insert(0, '{project_root}')
sys.path.insert(0, '.')
print(f"Python path: {{sys.path[:3]}}")
print(f"Current directory: {{os.getcwd()}}")
print(f"Project root: {project_root}")
import google.adk.agents
print('google-adk.agents is available')
"""
            test_result = subprocess.run(
                ["python", "-c", test_code],
                cwd=project_root,
                capture_output=True,
                text=True,
                timeout=10
            )
            if test_result.returncode == 0:
                print(f"[DEBUG] google-adk verification successful: {test_result.stdout.strip()}")
            else:
                print(f"[WARNING] google-adk verification failed (but continuing anyway):")
                print(f"[WARNING] Return code: {test_result.returncode}")
                print(f"[WARNING] STDOUT: {test_result.stdout}")
                print(f"[WARNING] STDERR: {test_result.stderr}")
                print(f"[WARNING] Module files should still work if created correctly")
        except Exception as e:
            print(f"[WARNING] Exception during google-adk verification (continuing anyway): {str(e)}")
        
        # Regenerate project files with real google-adk (no mock)
        print(f"[DEBUG] Regenerating project files with real google-adk...")
        try:
            from generator import regenerate_project_with_real_adk
            regenerate_project_with_real_adk(project_root, project)
            print(f"[DEBUG] Successfully regenerated project files with real google-adk")
        except Exception as regen_error:
            print(f"[WARNING] Failed to regenerate project files: {str(regen_error)}")
        
        # Verify project structure
        print(f"[DEBUG] Verifying project structure...")
        main_py_exists = os.path.exists(os.path.join(project_root, "main.py"))
        google_adk_exists = os.path.exists(os.path.join(project_root, "google", "adk", "agents.py"))
        supervisor_exists = os.path.exists(os.path.join(project_root, "Supervisor", "agent.py"))
        
        print(f"[DEBUG] main.py exists: {main_py_exists}")
        print(f"[DEBUG] google/adk/agents.py exists: {google_adk_exists}")
        print(f"[DEBUG] Supervisor/agent.py exists: {supervisor_exists}")
        
        if not all([main_py_exists, google_adk_exists, supervisor_exists]):
            return {
                "error": f"Project structure incomplete. main.py: {main_py_exists}, google.adk: {google_adk_exists}, supervisor: {supervisor_exists}",
                "project_id": request.project_id,
                "port": project.port_number
            }
        
        print(f"[DEBUG] Starting project {request.project_id} on port {project.port_number}")
        print(f"[DEBUG] Project root: {project_root}")
        print(f"[DEBUG] Main.py path: {main_py_path}")
        
        # Run the main.py file in a new subprocess with better error handling
        try:
            print(f"[DEBUG] About to start subprocess: python main.py")
            print(f"[DEBUG] Working directory: {project_root}")
            
            # Ensure the subprocess receives the correct PORT for this project
            env = os.environ.copy()
            env["PORT"] = str(project.port_number)

            process = subprocess.Popen(
                ["python", "main.py"],
                cwd=project_root,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            print(f"[DEBUG] Subprocess created with PID: {process.pid}")
            
            # Give the process a moment to start
            import time
            time.sleep(3)  # Increased wait time
            
            # Check if process is still running
            poll_result = process.poll()
            print(f"[DEBUG] Process poll result: {poll_result}")
            
            if poll_result is not None:
                # Process has already terminated, get the error
                stdout, stderr = process.communicate()
                error_details = {
                    "error": f"Project failed to start. Exit code: {process.returncode}",
                    "stdout": stdout,
                    "stderr": stderr,
                    "project_id": request.project_id,
                    "port": project.port_number
                }
                print(f"[ERROR] Project {request.project_id} failed to start:")
                print(f"[ERROR] Exit code: {process.returncode}")
                print(f"[ERROR] STDOUT: {stdout}")
                print(f"[ERROR] STDERR: {stderr}")
                return error_details
            
            running_projects[request.project_id] = process.pid
            
            print(f"[DEBUG] Successfully started project {request.project_id} with PID {process.pid}")
            print(f"[DEBUG] Project should be available at http://localhost:{project.port_number}")

            return {
                "message": f"Started project {request.project_id} on port {project.port_number}",
                "pid": process.pid,
                "port": project.port_number,
                "url": f"http://localhost:{project.port_number}",
                "status": "running"
            }
        except Exception as subprocess_error:
            return {"error": f"Failed to start subprocess: {str(subprocess_error)}"}
    except Exception as e:
        return {"error": str(e)}
    
@router.get("/running_projects")
def get_running_projects():
    """
    Get all currently running projects.
    """
    return {
        "running_projects": running_projects,
        "count": len(running_projects)
    }

@router.get("/project_status/{project_id}")
def get_project_status(project_id: str, db: Session = Depends(get_db)):
    """
    Get the status of a specific project.
    """
    try:
        # Get project details
        project_uuid = uuid.UUID(project_id)
        project = db.query(Project).filter(Project.id == project_uuid).first()
        
        if not project:
            return {"error": f"Project {project_id} not found"}
        
        # Check if project is in running_projects
        if project_id in running_projects:
            pid = running_projects[project_id]
            
            # Check if the process is actually still running
            try:
                import psutil
                if psutil.pid_exists(pid):
                    return {
                        "status": "running",
                        "pid": pid,
                        "port": project.port_number,
                        "url": f"http://localhost:{project.port_number}"
                    }
                else:
                    # Process is dead, remove from running_projects
                    del running_projects[project_id]
                    return {
                        "status": "stopped",
                        "message": "Process was terminated externally"
                    }
            except ImportError:
                # psutil not available, assume it's running if in the dict
                return {
                    "status": "running",
                    "pid": pid,
                    "port": project.port_number,
                    "url": f"http://localhost:{project.port_number}"
                }
        else:
            return {
                "status": "stopped",
                "port": project.port_number
            }
            
    except Exception as e:
        return {"error": str(e)}

@router.post("/stop_project")
def stop_agents(request: DeployAgentRequest):
    pid = running_projects.get(request.project_id)
    if not pid:
        return {"error": f"No running process found for {request.project_id}"}
    
    try:
        os.kill(pid, signal.SIGTERM)
        del running_projects[request.project_id]
        return {"message": f"Stopped project {request.project_id} (PID: {pid})"}
    except ProcessLookupError:
        return {"error": f"Process {pid} not found"}
    except Exception as e:
        return {"error": str(e)}    

@router.post("/test_project_connection/{project_id}")
async def test_project_connection(project_id: str, db: Session = Depends(get_db)):
    """
    Test if a deployed project is responding on its assigned port.
    """
    try:
        # Get project details
        project_uuid = uuid.UUID(project_id)
        project = db.query(Project).filter(Project.id == project_uuid).first()
        
        if not project:
            return {"error": f"Project {project_id} not found"}
        
        # Test connection to the project
        import httpx
        project_url = f"http://localhost:{project.port_number}"
        
        async with httpx.AsyncClient() as client:
            try:
                # Test health endpoint
                health_response = await client.get(f"{project_url}/health", timeout=5.0)
                if health_response.status_code == 200:
                    health_data = health_response.json()
                    
                    # Test a simple query
                    query_response = await client.post(
                        f"{project_url}/agents/supervisor/query",
                        json={"message": "Hello, are you working?", "session_id": "test"},
                        timeout=10.0
                    )
                    
                    return {
                        "status": "connected",
                        "port": project.port_number,
                        "health": health_data,
                        "query_test": {
                            "status_code": query_response.status_code,
                            "response": query_response.json() if query_response.status_code == 200 else query_response.text
                        }
                    }
                else:
                    return {
                        "status": "health_check_failed",
                        "port": project.port_number,
                        "health_status_code": health_response.status_code
                    }
            except httpx.RequestError as e:
                return {
                    "status": "connection_failed",
                    "port": project.port_number,
                    "error": str(e)
                }
    except Exception as e:
        return {"error": str(e)}

@router.post("/download")
async def download_file(request: DownloadRequest):
    blob_name = request.blob_name
    response = get_blob(blob_name)
    return response

@router.post("/upload")
async def upload_file(request: DownloadRequest, file: UploadFile = File(...)):
    response = upload_blob(file.file, request.blob_name)
    return {"message": "File uploaded successfully!"}

@router.get("/list-blobs")
async def list_blobs():
    blob_list = list_blob_files()
    return {"blobs": blob_list}


@router.post("/chatbot/{project_id}")
def deploy_chatbot(project_id: str, db: Session = Depends(get_db)):
    """
    Deploy a chatbot interface for the specified project.
    Creates HTML/CSS/JS files and starts a web server on port 3000.
    """
    try:
        # Validate project ID format
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project_root = f"./project/{project_id}"
    chatbot_dir = f"{project_root}/chatbot"
    
    # Create chatbot directory
    os.makedirs(chatbot_dir, exist_ok=True)
    
    # Generate chatbot files
    generate_chatbot_files(chatbot_dir, project_id, project.name)
    
    # Start the chatbot server
    try:
        # Check if already running
        if f"{project_id}_chatbot" in running_projects:
            return {
                "message": f"Chatbot already running for project {project_id}",
                "url": f"http://localhost:3000/deploy/{project_id}",
                "pid": running_projects[f"{project_id}_chatbot"]
            }
        
        # Start new chatbot server
        process = subprocess.Popen(
            ["python", "-m", "http.server", "3000"],
            cwd=chatbot_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        running_projects[f"{project_id}_chatbot"] = process.pid
        
        return {
            "message": f"Chatbot deployed successfully for project {project_id}",
            "url": f"http://localhost:3000/deploy/{project_id}",
            "pid": process.pid
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start chatbot server: {str(e)}")


@router.get("/{project_id}")
def get_chatbot_interface(project_id: str, db: Session = Depends(get_db)):
    """
    Serve the chatbot interface HTML for the specified project.
    """
    try:
        # Validate project ID format
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
    
    # Check if project exists
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    chatbot_file = f"./project/{project_id}/chatbot/index.html"
    
    if not os.path.exists(chatbot_file):
        raise HTTPException(status_code=404, detail="Chatbot interface not deployed yet")
    
    with open(chatbot_file, "r", encoding="utf-8") as f:
        html_content = f.read()
    
    return HTMLResponse(content=html_content)


@router.post("/stop_chatbot/{project_id}")
def stop_chatbot(project_id: str):
    """
    Stop the chatbot server for the specified project.
    """
    chatbot_key = f"{project_id}_chatbot"
    pid = running_projects.get(chatbot_key)
    
    if not pid:
        raise HTTPException(status_code=404, detail=f"No running chatbot found for project {project_id}")
    
    try:
        os.kill(pid, signal.SIGTERM)
        del running_projects[chatbot_key]
        return {"message": f"Stopped chatbot for project {project_id} (PID: {pid})"}
    except ProcessLookupError:
        raise HTTPException(status_code=404, detail=f"Chatbot process {pid} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop chatbot: {str(e)}")


def generate_chatbot_files(chatbot_dir: str, project_id: str, project_name: str):
    """
    Generate HTML, CSS, and JS files for the chatbot interface.
    """
    
    # HTML Template
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{project_name} - AI Agent Chatbot</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="chatbot-container">
        <div class="chatbot-header">
            <h1>{project_name}</h1>
            <p>AI Agent Assistant</p>
            <div class="status-indicator">
                <span class="status-dot"></span>
                <span id="status-text">Online</span>
            </div>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="message bot-message">
                <div class="message-content">
                    <p>Hello! I'm your AI assistant for {project_name}. How can I help you today?</p>
                </div>
                <div class="message-time">Just now</div>
            </div>
        </div>
        
        <div class="chat-input-container">
            <div class="input-wrapper">
                <input type="text" id="userInput" placeholder="Type your message here..." maxlength="500">
                <button id="sendButton" onclick="sendMessage()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22,2 15,22 11,13 2,9"></polygon>
                    </svg>
                </button>
            </div>
            <div class="input-info">
                <span id="charCount">0/500</span>
            </div>
        </div>
    </div>
    
    <script src="script.js"></script>
</body>
</html>"""

    # CSS Template
    css_content = """* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

.chatbot-container {
    width: 100%;
    max-width: 800px;
    height: 600px;
    background: white;
    border-radius: 20px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.chatbot-header {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    padding: 20px;
    text-align: center;
    position: relative;
}

.chatbot-header h1 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 5px;
}

.chatbot-header p {
    opacity: 0.9;
    font-size: 14px;
}

.status-indicator {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
}

.status-dot {
    width: 8px;
    height: 8px;
    background: #10b981;
    border-radius: 50%;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.chat-messages {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    background: #f8fafc;
}

.message {
    margin-bottom: 20px;
    animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.message-content {
    max-width: 70%;
    padding: 12px 16px;
    border-radius: 18px;
    word-wrap: break-word;
}

.bot-message .message-content {
    background: #e5e7eb;
    color: #374151;
    margin-right: auto;
}

.user-message {
    text-align: right;
}

.user-message .message-content {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    margin-left: auto;
}

.message-time {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 4px;
    padding: 0 16px;
}

.user-message .message-time {
    text-align: right;
}

.chat-input-container {
    padding: 20px;
    background: white;
    border-top: 1px solid #e5e7eb;
}

.input-wrapper {
    display: flex;
    gap: 12px;
    align-items: center;
}

#userInput {
    flex: 1;
    padding: 12px 16px;
    border: 2px solid #e5e7eb;
    border-radius: 25px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.3s ease;
}

#userInput:focus {
    border-color: #4f46e5;
}

#sendButton {
    width: 44px;
    height: 44px;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
}

#sendButton:hover {
    transform: scale(1.05);
}

#sendButton:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
}

.input-info {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
}

#charCount {
    font-size: 11px;
    color: #9ca3af;
}

.typing-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 12px 16px;
    background: #e5e7eb;
    border-radius: 18px;
    max-width: 70%;
    margin-bottom: 20px;
}

.typing-dot {
    width: 6px;
    height: 6px;
    background: #9ca3af;
    border-radius: 50%;
    animation: typing 1.4s infinite;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-10px); }
}

/* Scrollbar Styling */
.chat-messages::-webkit-scrollbar {
    width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
    background: #f1f5f9;
}

.chat-messages::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
}

/* Responsive Design */
@media (max-width: 768px) {
    body {
        padding: 10px;
    }
    
    .chatbot-container {
        height: 100vh;
        border-radius: 0;
    }
    
    .chatbot-header {
        padding: 15px;
    }
    
    .chatbot-header h1 {
        font-size: 20px;
    }
    
    .message-content {
        max-width: 85%;
    }
}"""

    # JavaScript Template
    js_content = f"""const PROJECT_ID = '{project_id}';
const API_BASE_URL = 'http://localhost:8000';

let isTyping = false;

// Initialize the chatbot
document.addEventListener('DOMContentLoaded', function() {{
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const charCount = document.getElementById('charCount');
    
    // Handle Enter key press
    userInput.addEventListener('keypress', function(e) {{
        if (e.key === 'Enter' && !e.shiftKey) {{
            e.preventDefault();
            sendMessage();
        }}
    }});
    
    // Handle character count
    userInput.addEventListener('input', function() {{
        const count = userInput.value.length;
        charCount.textContent = `${{count}}/500`;
        
        if (count > 450) {{
            charCount.style.color = '#ef4444';
        }} else {{
            charCount.style.color = '#9ca3af';
        }}
    }});
    
    // Auto-focus on input
    userInput.focus();
}});

async function sendMessage() {{
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();
    
    if (!message || isTyping) return;
    
    // Add user message to chat
    addMessage(message, 'user');
    userInput.value = '';
    document.getElementById('charCount').textContent = '0/500';
    
    // Show typing indicator
    showTypingIndicator();
    
    try {{
        // Send message to backend
        const response = await fetch(`${{API_BASE_URL}}/chat/${{PROJECT_ID}}`, {{
            method: 'POST',
            headers: {{
                'Content-Type': 'application/json',
            }},
            body: JSON.stringify({{
                message: message,
                project_id: PROJECT_ID
            }})
        }});
        
        const data = await response.json();
        
        // Hide typing indicator
        hideTypingIndicator();
        
        if (response.ok) {{
            // Add bot response to chat
            addMessage(data.response || 'I apologize, but I encountered an issue processing your request.', 'bot');
        }} else {{
            addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }}
    }} catch (error) {{
        console.error('Error sending message:', error);
        hideTypingIndicator();
        addMessage('Sorry, I cannot connect to the server right now. Please try again later.', 'bot');
    }}
}}

function addMessage(content, sender) {{
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${{sender}}-message`;
    
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {{hour: '2-digit', minute:'2-digit'}});
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <p>${{content}}</p>
        </div>
        <div class="message-time">${{timeString}}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}}

function showTypingIndicator() {{
    if (isTyping) return;
    
    isTyping = true;
    const chatMessages = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typingIndicator';
    
    typingDiv.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Disable send button
    document.getElementById('sendButton').disabled = true;
}}

function hideTypingIndicator() {{
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {{
        typingIndicator.remove();
    }}
    isTyping = false;
    
    // Enable send button
    document.getElementById('sendButton').disabled = false;
}}

// Update status indicator
function updateStatus(online = true) {{
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');
    
    if (online) {{
        statusDot.style.background = '#10b981';
        statusText.textContent = 'Online';
    }} else {{
        statusDot.style.background = '#ef4444';
        statusText.textContent = 'Offline';
    }}
}}

// Check connection status periodically
setInterval(async () => {{
    try {{
        const response = await fetch(`${{API_BASE_URL}}/health`);
        updateStatus(response.ok);
    }} catch (error) {{
        updateStatus(false);
    }}
}}, 30000); // Check every 30 seconds"""

    # Write files
    with open(f"{chatbot_dir}/index.html", "w", encoding="utf-8") as f:
        f.write(html_content)
    
    with open(f"{chatbot_dir}/style.css", "w", encoding="utf-8") as f:
        f.write(css_content)
    
    with open(f"{chatbot_dir}/script.js", "w", encoding="utf-8") as f:
        f.write(js_content)
