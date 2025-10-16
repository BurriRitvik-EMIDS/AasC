import os
import sys
from typing import List, Optional, Any

# Try to import google.generativeai, fallback if not available
try:
    import google.generativeai as genai
    GENAI_AVAILABLE = True
    print(f"[INFO] google.generativeai imported successfully")
except ImportError as e:
    print(f"[WARNING] google.generativeai not available: {e}")
    GENAI_AVAILABLE = False
    genai = None

class LlmAgent:
    """
    A working LLM Agent implementation using Google Generative AI with in-memory session support.
    """
    
    def __init__(self, model: str = "gemini-2.0-flash", name: str = "agent", 
                 sub_agents: Optional[List] = None, description: str = "", 
                 instruction: str = "", session_id: str = None, **kwargs):
        self.model = model
        self.name = name
        self.sub_agents = sub_agents or []
        self.description = description
        self.instruction = instruction
        self.session_id = session_id or str(hash(f"{name}_{id(self)}"))
        
        # In-memory session storage
        self._sessions = {}
        self._init_session()
        
        # Configure Google AI
        api_key = os.getenv("GOOGLE_API_KEY")
        if GENAI_AVAILABLE and api_key:
            try:
                genai.configure(api_key=api_key)
                self.client = genai.GenerativeModel(model_name="gemini-1.5-flash")
                self.use_ai = True
                print(f"[INFO] {self.name} initialized with Google AI")
            except Exception as e:
                print(f"[WARNING] Failed to initialize Google AI for {self.name}: {e}")
                self.use_ai = False
        else:
            if not GENAI_AVAILABLE:
                print(f"[WARNING] google.generativeai not available for {self.name}")
            if not api_key:
                print(f"[WARNING] No GOOGLE_API_KEY found for {self.name}")
            print(f"[INFO] {self.name} using fallback responses")
            self.use_ai = False
    
    def _init_session(self):
        """Initialize a new session if it doesn't exist."""
        if self.session_id not in self._sessions:
            self._sessions[self.session_id] = {
                'history': [],
                'context': {},
                'created_at': time.time(),
                'last_accessed': time.time()
            }
    
    def _update_session(self, **updates):
        """Update session data."""
        if self.session_id in self._sessions:
            self._sessions[self.session_id].update(updates)
            self._sessions[self.session_id]['last_accessed'] = time.time()
    
    def get_session_history(self):
        """Get the conversation history for the current session."""
        self._init_session()
        return self._sessions[self.session_id]['history']
    
    def add_to_history(self, role: str, content: str):
        """Add a message to the session history."""
        self._init_session()
        self._sessions[self.session_id]['history'].append({
            'role': role,
            'content': content,
            'timestamp': time.time()
        })
    
    def run(self, message: str) -> str:
        """
        Process a message and return a response, maintaining conversation context.
        """
        try:
            # Add user message to history
            self.add_to_history('user', message)
            
            # Get conversation history
            history = self.get_session_history()
            
            if self.use_ai and hasattr(self, 'client'):
                # Build context from history
                context = "
".join(
                    f"{msg['role'].capitalize()}: {msg['content']}" 
                    for msg in history[-5:]  # Use last 5 messages for context
                )
                
                # Create prompt with context
                prompt = f"""You are {self.name}, an AI agent with the following role:
{self.description}

Instructions: {self.instruction}

Previous conversation context:
{context}

User message: {message}

Please provide a helpful and relevant response based on your role, instructions, and conversation context."""
                
                # Generate response
                response = self.client.generate_content(prompt)
                response_text = response.text.strip()
                
                # Add assistant response to history
                self.add_to_history('assistant', response_text)
                
                return f"[{self.name}]: {response_text}"
            
            elif self.sub_agents:
                # Route to subagents if available
                import random
                selected_agent = random.choice(self.sub_agents)
                
                # Add context to the message
                context = " ".join(msg['content'] for msg in history[-3:])  # Last 3 messages as context
                enhanced_message = f"Context: {context}

Current message: {message}"
                
                if hasattr(selected_agent, '__call__') or hasattr(selected_agent, 'run'):
                    subagent_response = (selected_agent(enhanced_message) 
                                      if hasattr(selected_agent, '__call__') 
                                      else selected_agent.run(enhanced_message))
                    
                    # Add the interaction to history
                    self.add_to_history('system', f"Routed to {getattr(selected_agent, 'name', 'subagent')}")
                    self.add_to_history('assistant', subagent_response)
                    
                    return f"[{self.name}] → {subagent_response}"
                else:
                    error_msg = f"I'm routing your request about '{message}' to my subagents, but they're not properly configured."
                    self.add_to_history('system', error_msg)
                    return f"[{self.name}]: {error_msg}"
            
            else:
                # Fallback response based on instruction and history
                last_message = history[-2]['content'] if len(history) > 1 else message
                response = f"I understand you're asking about '{last_message}'. Based on my role ({self.description}), I would help you with: {self.instruction[:200]}..."
                self.add_to_history('assistant', response)
                return f"[{self.name}]: {response}"
                
        except Exception as e:
            error_msg = f"I encountered an error processing your message: {str(e)}"
            self.add_to_history('system', f"Error: {str(e)}")
            return f"[{self.name}]: {error_msg}"
    
    def __call__(self, message: str) -> str:
        """
        Make the agent callable directly.
        This is the preferred way to use the agent.
        """
        return self.run(message)
