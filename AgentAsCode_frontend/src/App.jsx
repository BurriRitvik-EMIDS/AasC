import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import LoadingScreen from './components/LoadingScreen';
import MiddlePane from './components/middlepane';
import LeftPane from './components/leftpane';
import CodeViewer from './components/codeeditor';
import RightPane from './components/rightpane';
import ProjectDashboard from './components/ProjectDashBoard';
import CreateProjectPage from './components/CreateProjectPage';
import ProjectSetupPage from './components/ProjectSetupPage';
import ChatbotInterface from './components/ChatbotInterface';
import KnowledgeBasePage from './components/KnowledgeBasePage';
import Toast from './components/Toast';
import ApiService from './services/apiservices';
import BlobStorageService from './services/blobstorage';
import { DndContext, pointerWithin, DragOverlay } from '@dnd-kit/core';
import './App.css';
import './index.css';

// Import the new AgentPromptService
import AgentPromptService from './services/AgentPromptServices';

function App() {
  // State to track current page - change default to dashboard
  const [currentPage, setCurrentPage] = useState('dashboard');

  // Check if we're on the chatbot route
  const [chatbotProjectId, setChatbotProjectId] = useState(null);

  // Check URL on component mount to see if it's a chatbot route
  useEffect(() => {
    const path = window.location.pathname;
    const deployMatch = path.match(/^\/deploy\/(.+)$/);
    if (deployMatch) {
      const projectId = deployMatch[1];
      setChatbotProjectId(projectId);
      setCurrentPage('chatbot');
    }
  }, []);

  // State for loading indicator
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  // Toast notifications
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    // Auto-hide after 3 seconds
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  // State for selected project ID (for navigation)
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // State for project details
  const [projectDetails, setProjectDetails] = useState({
    id: '',
    projectName: '',
    supervisorPrompt: '',
    finalResponsePrompt: '',
    modelProvider: 'azure-openai',
    apiKey: '',
    apiUrl: ''
  });

  // Initialize agents and tools with empty arrays
  const [agents, setAgents] = useState([]);
  const [tools, setTools] = useState([]);

  // State for middle pane visibility and content
  const [showMiddlePane, setShowMiddlePane] = useState(false);
  const [activeSection, setActiveSection] = useState('');

  // State for selected item
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemType, setSelectedItemType] = useState(null);

  // State for edit mode
  const [selectedAgentForEdit, setSelectedAgentForEdit] = useState(null);

  // State for root agent template ID (for subagent loading)
  const [rootAgentTemplateId, setRootAgentTemplateId] = useState(null);

  // State for drag and drop
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const middlePaneRef = useRef(null);

  // Handle navigation from dashboard
  const handleNavigate = async (page, projectId = null) => {
    setCurrentPage(page);

    if (projectId && page === 'multiAgentUI') {
      setSelectedProjectId(projectId);

      // Load the project details
      try {
        setIsLoading(true);
        // Fetch project details from backend
        const project = await ApiService.getProject(projectId);
        const projectData = {
          id: project.id,
          projectName: project.name,
          supervisorPrompt: project.supervisor_prompt || '',
          finalResponsePrompt: project.final_response_prompt || '',
          modelProvider: project.platform || 'azure-openai',
          apiKey: project.azure_openai_key || '',
          apiUrl: project.azure_openai_url || '',
          templateId: project.template_id || null // Add template ID for subagent loading
        };

        setProjectDetails(projectData);

        // Set global currentProject for components that need it
        window.currentProject = projectData;

        // Fetch agents and tools for this project
        const projectAgents = await ApiService.getAgentsByProject(projectId);
        const projectTools = await ApiService.getToolsByProject(projectId);

        setAgents(projectAgents || []);
        setTools(projectTools || []);
      } catch (error) {
        console.error('Failed to load project:', error);
        setError('Failed to load project: ' + error.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Handle create new project from dashboard
  const handleCreateNewProject = () => {
    setCurrentPage('projectSetup');
    // Reset project details for new project
    setProjectDetails({
      id: '',
      projectName: '',
      supervisorPrompt: '',
      finalResponsePrompt: '',
      modelProvider: 'azure-openai',
      apiKey: '',
      apiUrl: ''
    });
  };

  const handleCreateProject = () => {
    // Navigate to project setup page
    setCurrentPage('projectSetup');
  };

  // Handle Save in Project Setup
  const handleSaveProject = async (details) => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if we should navigate to dashboard without saving
      if (details.navigateToDashboard) {
        setCurrentPage('dashboard');
        return;
      }

      // Create project in backend
      const result = await ApiService.createProject(details);

      // Update project details with the returned ID and initial prompts
      const updatedProject = {
        ...details,
        id: result.project_id,
        supervisorPrompt: details.supervisorPrompt || '', // Keep the initial prompt
        finalResponsePrompt: details.finalResponsePrompt || '',
        templateId: details.selectedTemplate || null // Store the selected template ID
      };

      setProjectDetails(updatedProject);

      // Set global currentProject for components that need it
      window.currentProject = updatedProject;
      console.log('Project created with ID:', result.project_id);

      // Navigate to multiAgentUI after successful save
      setCurrentPage('multiAgentUI');
    } catch (error) {
      setError('Failed to create project: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle logout button click
  const handleLogout = () => {
    // Reset project details
    setProjectDetails({
      id: '',
      projectName: '',
      supervisorPrompt: '',
      finalResponsePrompt: '',
      modelProvider: 'azure-openai',
      apiKey: '',
      apiUrl: ''
    });

    // Reset states
    setShowMiddlePane(false);
    setActiveSection('');
    setSelectedItem(null);
    setSelectedItemType(null);
    setAgents([]);
    setTools([]);

    // Navigate back to dashboard
    setCurrentPage('dashboard');
    console.log('User logged out');
  };

  // Open Knowledge Base Configuration page
  const handleOpenKnowledgeBase = () => {
    setCurrentPage('knowledgeBase');
  };

  // Handle plus button click in left pane
  const handlePlusClick = (section, currentProject = null) => {
    setShowMiddlePane(true);
    setActiveSection(section);
    setSelectedItem(null);
    setSelectedItemType(null);
    setSelectedAgentForEdit(null); // Reset edit mode

    // If adding agents and we have a current project with templateId, set it for subagent loading
    if (section === 'agents' && currentProject?.templateId) {
      setRootAgentTemplateId(currentProject.templateId);
    } else {
      setRootAgentTemplateId(null);
    }
  };

  // Handle edit prompt button click
  const handleEditPrompt = (agent) => {
    setShowMiddlePane(true);
    setActiveSection('agents');
    setSelectedAgentForEdit(agent);
    setSelectedItem(null);
    setSelectedItemType(null);
  };

  // Load supervisor prompt when project changes
  useEffect(() => {
    if (projectDetails?.id) {
      // Only load from API if we don't already have a prompt from setup
      if (!projectDetails.supervisorPrompt) {
        const loadSupervisorPrompt = async () => {
          try {
            console.log('Fetching supervisor prompt for project:', projectDetails.id);
            const prompt = await AgentPromptService.getSupervisorPrompt(projectDetails.id);
            console.log('Fetched supervisor prompt:', prompt);
            // Update project details with the fetched supervisor prompt
            setProjectDetails(prevDetails => ({
              ...prevDetails,
              supervisorPrompt: prompt
            }));
          } catch (error) {
            console.error('Failed to load supervisor prompt:', error);
          }
        };

        loadSupervisorPrompt();
      }
    }
  }, [projectDetails.id]);

  // Handle selecting an item from the left pane
  const handleSelectItem = async (type, item) => {
    // Skip if we're currently dragging
    if (isDragging) {
      return;
    }

    try {
      setIsLoading(true);
      console.log(`Selecting ${type} with ID:`, item.id);

      // If it's an agent, fetch the code from backend
      if (type === 'agent' && item.id) {
        console.log('Fetching agent code...');
        try {
          const codeData = await ApiService.getAgentCode(item.id);
          console.log('Agent code received:', codeData);
          item.code = codeData.code; // Update with actual code
        } catch (agentError) {
          console.error('Error fetching agent code:', agentError);
          // Use placeholder code if we can't fetch it
          item.code = `# Failed to fetch code for agent ${item.name}\n# Error: ${agentError.message}`;
        }
      }

      // If it's a tool, fetch the tool details and code
      if (type === 'tool' && item.id) {
        console.log('Fetching tool code...');
        try {
          const codeData = await ApiService.getToolCode(item.id);
          console.log('Tool code received:', codeData);
          item.code = codeData.code; // Update with actual code
        } catch (toolError) {
          console.error('Error fetching tool code:', toolError);
          // Use placeholder code if we can't fetch it
          item.code = `# Failed to fetch code for tool ${item.name}\n# Error: ${toolError.message}`;
        }
      }

      // If it's an MCP tool from fetched tools, display details without code
      if (type === 'mcp-tool') {
        console.log('Selected MCP tool:', item);
        // Format the tool details as readable text
        let mcpToolDetails = `MCP Tool Details\n\n`;
        mcpToolDetails += `Name: ${item.name || 'N/A'}\n\n`;
        mcpToolDetails += `Description:\n${item.description || 'No description available'}\n\n`;

        mcpToolDetails += `Input Parameters:\n`;
        if (item.inputs && Object.keys(item.inputs).length > 0) {
          Object.entries(item.inputs).forEach(([key, type]) => {
            mcpToolDetails += `  - ${key}: ${type}\n`;
          });
        } else {
          mcpToolDetails += `  No parameters\n`;
        }

        item.code = mcpToolDetails;
      }

      // Set the selected item and type
      setSelectedItem(item);
      setSelectedItemType(type);

      // Make sure we hide the middle pane to show the code viewer
      setShowMiddlePane(false);
      setSelectedAgentForEdit(null); // Reset edit mode
    } catch (error) {
      console.error('Error fetching item details:', error);
      setError('Failed to fetch item details: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle deleting agent
  const handleDeleteAgent = async (agentId) => {
    try {
      setIsLoading(true);
      setError(null);

      console.log(`Deleting agent with ID: ${agentId}`);

      // Remove agent from local state immediately for better UX
      const agentToDelete = agents.find(agent => agent.id === agentId);
      setAgents(prevAgents => prevAgents.filter(agent => agent.id !== agentId));

      // If the deleted agent was selected, clear the selection
      if (selectedItem && selectedItem.id === agentId) {
        setSelectedItem(null);
        setSelectedItemType(null);
      }

      // If the deleted agent was being edited, close the middle pane
      if (selectedAgentForEdit && selectedAgentForEdit.id === agentId) {
        setSelectedAgentForEdit(null);
        setShowMiddlePane(false);
      }

      console.log(`Agent ${agentToDelete?.name || agentId} removed from UI`);

    } catch (error) {
      console.error('Error handling agent deletion:', error);
      // Refresh agents list to ensure consistency
      try {
        const projectAgents = await ApiService.getAgentsByProject(selectedProjectId);
        setAgents(projectAgents || []);
      } catch (refreshError) {
        console.error('Failed to refresh agents list:', refreshError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle updating agent prompt - FIXED version
  const handleUpdateAgentPrompt = async (updatedAgent) => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Updating agent prompt:', updatedAgent);

      // Call the API to update agent prompt
      await ApiService.updateAgentPrompt(updatedAgent);

      // Ensure tools is a string, not an object
      let toolsString = '';
      if (updatedAgent.tools) {
        if (Array.isArray(updatedAgent.tools)) {
          toolsString = updatedAgent.tools.map(tool => {
            return typeof tool === 'object' ? tool.name : String(tool);
          }).join(', ');
        } else if (typeof updatedAgent.tools === 'object') {
          toolsString = Object.values(updatedAgent.tools)
            .map(t => typeof t === 'object' ? t.name : String(t))
            .join(', ');
        } else {
          toolsString = String(updatedAgent.tools);
        }
      }

      // Create a cleaned version of the agent
      const cleanedAgent = {
        id: updatedAgent.id,
        name: String(updatedAgent.name),
        prompt: String(updatedAgent.prompt),
        tools: toolsString,
        toolType: String(updatedAgent.toolType || 'Custom')
      };

      // Update agents state
      const updatedAgents = agents.map(agent => {
        if (agent.id === updatedAgent.id) {
          return cleanedAgent;
        }
        return agent;
      });

      setAgents(updatedAgents);
      console.log('Agent prompt updated successfully');

      // Deploy to blob storage after updating
      try {
        await BlobStorageService.deployProject(projectDetails.id);
      } catch (deployError) {
        console.warn('Failed to deploy to blob storage:', deployError);
        // Continue anyway since we've already updated the database
      }

      // Get agent description and update supervisor prompt
      try {
        const description = await AgentPromptService.getAgentDescription(cleanedAgent.name, cleanedAgent.prompt);
        console.log(`Generated description for ${cleanedAgent.name}:`, description);

        // Update supervisor prompt with this agent's description
        const updatedPrompt = await AgentPromptService.updateSupervisorPrompt(
          projectDetails.id,
          cleanedAgent.name,
          description
        );

        // Update the supervisor prompt in the UI
        setProjectDetails(prevDetails => ({
          ...prevDetails,
          supervisorPrompt: updatedPrompt.prompt || prevDetails.supervisorPrompt
        }));
      } catch (promptError) {
        console.error('Failed to update supervisor prompt:', promptError);
        // Continue anyway as this is not critical
      }

      // Hide the middle pane
      setShowMiddlePane(false);
      setSelectedAgentForEdit(null);

      // If this agent was selected, update the selected item too
      if (selectedItem && selectedItem.id === updatedAgent.id) {
        setSelectedItem({
          ...cleanedAgent,
          code: selectedItem.code // Preserve the code
        });
      }
    } catch (error) {
      console.error('Error updating agent prompt:', error);
      setError('Failed to update agent prompt: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle saving new agents or tools
  const handleSaveItem = async (newItem) => {
    try {
      setIsLoading(true);
      setError(null);

      if (activeSection === 'agents') {
        // Process tool IDs from tool names
        const toolIds = [];

        // If the agent specifies tools, process them
        if (newItem.toolsArray && newItem.toolsArray.length > 0) {
          console.log('Processing tools for agent:', newItem.toolsArray);

          for (const toolName of newItem.toolsArray) {
            // Check if tool exists
            const existingTool = tools.find(t => t.name.toLowerCase() === toolName.toLowerCase());

            if (existingTool) {
              console.log(`Using existing tool: ${toolName} with ID: ${existingTool.id}`);
              toolIds.push(existingTool.id);
            } else {
              console.log(`Creating new tool: ${toolName}`);
              // Create new tool in backend
              const toolData = {
                projectId: projectDetails.id, // Add project ID
                toolType: 'custom',
                name: toolName, // Using consistent name property
                prompt: `Default configuration for ${toolName}`,
                selected_mcp_server: '', // Use empty string, not null
                mcp_server_config: {} // Use empty object, not null
              };

              try {
                const result = await ApiService.createTool(toolData);
                console.log(`Tool created with ID: ${result.tool_id}`);

                // Add the new tool to our state
                const newTool = {
                  id: result.tool_id,
                  name: toolName,
                  toolType: 'custom',
                  tool_type: 'custom', // Added tool_type property
                  description: `Default configuration for ${toolName}`,
                  parameters: '',
                  code: `# Default code for ${toolName}\ndef execute(params):\n    # Implement ${toolName} functionality\n    return { "success": True }`,
                  projectId: projectDetails.id
                };

                setTools(prevTools => [...prevTools, newTool]);
                toolIds.push(result.tool_id);
              } catch (toolError) {
                console.error(`Failed to create tool ${toolName}:`, toolError);
                // Continue with other tools
              }
            }
          }
        }

        console.log(`Creating agent with name: ${newItem.name} and tools: ${JSON.stringify(toolIds)}`);

        // Create agent in backend with the required tool_type field
        const agentData = {
          projectId: projectDetails.id,
          name: newItem.name,
          prompt: newItem.prompt,
          toolIds: toolIds, // The ApiService will map this to tools_id_selected
          code: newItem.code || '# New Agent Code',
          toolType: newItem.toolType || 'Custom' // Make sure to include toolType
        };

        console.log('Creating agent with data:', agentData);
        const result = await ApiService.createAgent(agentData);
        console.log('Agent created:', result);

        // Generate the blob name for this agent
        const blobName = BlobStorageService.generateBlobName(
          projectDetails.id,
          'agents',
          newItem.name
        );

        // Ensure tools is a string, not an object
        let toolsString = '';
        if (newItem.tools) {
          if (Array.isArray(newItem.tools)) {
            toolsString = newItem.tools.map(tool => {
              return typeof tool === 'object' ? tool.name : String(tool);
            }).join(', ');
          } else if (typeof newItem.tools === 'object') {
            toolsString = Object.values(newItem.tools)
              .map(t => typeof t === 'object' ? t.name : String(t))
              .join(', ');
          } else {
            toolsString = String(newItem.tools);
          }
        }

        // Add the agent to state with properly formatted data
        const newAgent = {
          id: result.agent_id,
          name: String(newItem.name),
          prompt: String(newItem.prompt),
          tools: toolsString,
          code: newItem.code || '# New Agent Code',
          projectId: projectDetails.id,
          blob_url: blobName, // Store the blob URL for later use
          toolType: String(newItem.toolType || 'Custom') // Store the tool type
        };

        setAgents(prevAgents => [...prevAgents, newAgent]);

        // *** IMPORTANT FIX: Deploy to blob storage after creating an agent ***
        try {
          console.log('Deploying agents to blob storage after creation...');
          const deployResult = await BlobStorageService.deployProject(projectDetails.id);
          console.log('Deployment result after agent creation:', deployResult);
        } catch (deployError) {
          console.error('Failed to deploy agents to blob storage:', deployError);
          // Continue anyway since we've already created the agent in the database
        }

        // Get agent description and update supervisor prompt
        try {
          const description = await AgentPromptService.getAgentDescription(newAgent.name, newAgent.prompt);
          console.log(`Generated description for ${newAgent.name}:`, description);

          // Update supervisor prompt with this agent's description
          const updatedPrompt = await AgentPromptService.updateSupervisorPrompt(
            projectDetails.id,
            newAgent.name,
            description
          );

          // Update the supervisor prompt in the UI
          setProjectDetails(prevDetails => ({
            ...prevDetails,
            supervisorPrompt: updatedPrompt.prompt || prevDetails.supervisorPrompt
          }));
        } catch (promptError) {
          console.error('Failed to update supervisor prompt:', promptError);
          // Continue anyway as this is not critical
        }

      } else if (activeSection === 'tools') {
        console.log('Creating tool:', newItem);

        // Prepare tool data based on tool type
        let toolData;

        if (newItem.toolType === 'mcp') {
          // Keep existing MCP tool logic
          if (!newItem.mcp_server_config) {
            throw new Error('Missing SQL server configuration');
          }

          toolData = {
            projectId: projectDetails.id,
            toolType: 'mcp',
            name: newItem.name || 'sql_tool',
            selected_mcp_server: 'MSSQL',
            mcp_server_config: newItem.mcp_server_config,
            apiUrl: newItem.apiUrl || '',
            apiKey: '',
            prompt: newItem.toolPrompt || newItem.prompt || ''
          };
        } else {
          // For custom tools, make sure to send empty string values instead of null
          // to avoid validation errors in the backend
          const toolName = newItem.name || newItem.toolName;

          // Validate name exists
          if (!toolName || toolName.trim() === '') {
            throw new Error('Tool name cannot be empty for custom tools');
          }

          toolData = {
            projectId: projectDetails.id,
            toolType: 'custom',
            name: toolName,
            selected_mcp_server: '', // Use empty string, not null
            mcp_server_config: {}, // Use empty object, not null
            apiUrl: newItem.apiUrl || '',
            apiKey: '',
            prompt: newItem.toolPrompt || newItem.prompt || ''
          };
        }

        console.log('Sending tool data to API:', toolData);
        const result = await ApiService.createTool(toolData);
        console.log('Tool created:', result);

        // Generate the blob name for this tool
        const blobName = BlobStorageService.generateBlobName(
          projectDetails.id,
          'tools',
          toolData.name
        );

        // Add the tool to state
        const newTool = {
          id: result.tool_id,
          toolType: toolData.toolType,
          tool_type: toolData.toolType, // Added tool_type property
          name: toolData.name,
          code: newItem.code || '# New Tool Code',
          projectId: projectDetails.id,
          blob_url: blobName, // Store the blob URL for later use
          // Include conditional properties based on tool type
          ...(toolData.toolType === 'mcp' ? {
            selected_mcp_server: toolData.selected_mcp_server,
            mcp_server_config: toolData.mcp_server_config
          } : {
            description: toolData.prompt || '',
            parameters: newItem.tools || ''
          })
        };

        setTools(prevTools => [...prevTools, newTool]);

        // After creating a tool, deploy to blob storage
        try {
          console.log('Deploying to blob storage...');
          const deployResult = await BlobStorageService.deployProject(projectDetails.id);
          console.log('Blob deployment result:', deployResult);
        } catch (deployError) {
          console.warn('Failed to deploy to blob storage:', deployError);
          // Continue anyway since we've already created the item in the database
        }
      }
    } catch (error) {
      console.error('Error saving item:', error);
      let errorMsg = 'Failed to save: ' + error.message;

      // Try to provide more helpful error messages
      if (error.message.includes('422')) {
        errorMsg += ' (Validation error - check console for details)';
      } else if (error.message.includes('500')) {
        errorMsg += ' (Server error - check backend logs)';
      } else if (error.message.includes('fetch')) {
        errorMsg += ' (Network error - check if backend is running)';
      }

      setError(errorMsg);
    } finally {
      setIsLoading(false);
      setShowMiddlePane(false);
    }
  };

  // Handle saving edited code
  const handleSaveCode = async (type, updatedItem) => {
    try {
      setIsLoading(true);

      if (type === 'agent') {
        // Update agent code in backend
        await ApiService.updateAgentCode(updatedItem.id, updatedItem.code);

        // Update the agent in the agents array
        const updatedAgents = agents.map(agent =>
          agent.id === updatedItem.id ? updatedItem : agent
        );
        setAgents(updatedAgents);

        // After updating the code, optionally deploy to blob storage
        try {
          await BlobStorageService.deployProject(projectDetails.id);
        } catch (deployError) {
          console.warn('Failed to deploy to blob storage:', deployError);
          // Continue anyway since we've already updated the database
        }

      } else if (type === 'tool') {
        // For tools, we might need a similar endpoint
        // For now, just update local state
        const updatedTools = tools.map(tool =>
          tool.id === updatedItem.id ? updatedItem : tool
        );
        setTools(updatedTools);

        // After updating the code, optionally deploy to blob storage
        try {
          await BlobStorageService.deployProject(projectDetails.id);
        } catch (deployError) {
          console.warn('Failed to deploy to blob storage:', deployError);
          // Continue anyway since we've already updated the local state
        }
      }
    } catch (error) {
      console.error('Error updating code:', error);
      setError('Failed to update code: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle updating project settings from RightPane
  const handleUpdateProjectSettings = async (updatedSettings) => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('Updating project settings for ID:', projectDetails.id);
      console.log('Updated settings:', updatedSettings);

      // Call the API to update project settings
      await ApiService.updateProject(projectDetails.id, updatedSettings);

      // Update local state with the new settings
      const updatedProject = {
        ...projectDetails,
        ...updatedSettings
      };

      setProjectDetails(updatedProject);
      console.log('Project settings updated successfully');
      showToast('Project settings updated successfully', 'success');

    } catch (error) {
      console.error('Error updating project settings:', error);
      setError('Failed to update project settings: ' + error.message);
      showToast('Failed to update project settings', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle drag start
  const handleDragStart = (event) => {
    const { active } = event;
    setIsDragging(true);

    const toolId = active.id.toString();

    // Find the tool that's being dragged
    const draggedTool = tools.find(tool =>
      tool.id && toolId === `tool-${tool.id}`
    );

    if (draggedTool) {
      setActiveDragItem(draggedTool);
    }
  };

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;

    setActiveDragItem(null);
    setIsDragging(false);

    // Return if dropped outside or if not dropped in the agent tools area
    if (!over || over.id !== 'agent-tools-dropzone') {
      return;
    }

    // Find the tool that was dragged
    const toolId = active.id.toString().replace('tool-', '');
    const draggedTool = tools.find(tool => tool.id.toString() === toolId);

    if (draggedTool && middlePaneRef.current && showMiddlePane && activeSection === 'agents') {
      // Add the tool to the agent's selected tools in the middle pane
      middlePaneRef.current.addToolToSelection(draggedTool);
    }
  };

  // Loading indicator
  if (isLoading) {
    return <LoadingScreen
      message="Preparing Your Workspace"
      subMessage="Loading project resources and configurations..."
    />;
  }

  // Error message
  if (error) {
    return (
      <div className="error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  // Render different pages based on currentPage state
  if (currentPage === 'dashboard') {
    return (
      <ProjectDashboard
        onNavigate={handleNavigate}
        onCreateNewProject={handleCreateNewProject}
      />
    );
  } else if (currentPage === 'createProject') {
    return <CreateProjectPage onCreateProject={handleCreateProject} />;
  } else if (currentPage === 'projectSetup') {
    return (
      <ProjectSetupPage
        projectDetails={projectDetails}
        onSave={handleSaveProject}
        onCancel={() => setCurrentPage('dashboard')} // Add cancel to go back to dashboard
      />
    );
  } else if (currentPage === 'chatbot') {
    // Chatbot Interface
    return <ChatbotInterface projectId={chatbotProjectId} />;
  } else if (currentPage === 'knowledgeBase') {
    return (
      <KnowledgeBasePage onBack={() => setCurrentPage('multiAgentUI')} />
    );
  } else if (currentPage === 'multiAgentUI') {
    // Multi-agent UI
    return (
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        <div className="app-container">
          <div className="panes-container">
            <LeftPane
              agents={agents}
              tools={tools}
              onPlusClick={handlePlusClick}
              onSelectItem={handleSelectItem}
              onDeployAgents={() => BlobStorageService.deployProject(projectDetails.id)}
              onDeleteAgent={handleDeleteAgent}
              projectId={projectDetails.id}
              currentProject={window.currentProject}
            />
            {showMiddlePane ? (
              <MiddlePane
                ref={middlePaneRef}
                section={activeSection}
                onSave={handleSaveItem}
                existingTools={tools}
                selectedAgent={selectedAgentForEdit}
                onUpdateAgentPrompt={handleUpdateAgentPrompt}
                rootAgentTemplateId={rootAgentTemplateId}
              />
            ) : selectedItem ? (
              <CodeViewer
                item={selectedItem}
                type={selectedItemType}
                onSave={handleSaveCode}
                projectId={projectDetails.id}
                onEditPrompt={handleEditPrompt}
              />
            ) : (
              <div className="middle-pane">
                <h2 className="pane-title">Multi Agent AI</h2>
              </div>
            )}
            <RightPane
              projectDetails={projectDetails}
              onSave={handleUpdateProjectSettings}
              onLogout={handleLogout}
              isLoading={isLoading}
              onOpenKnowledgeBase={handleOpenKnowledgeBase}
            />
          </div>
          <DragOverlay>
            {activeDragItem ? (
              <div className="drag-tool-preview">
                {activeDragItem.name}
              </div>
            ) : null}
          </DragOverlay>
        </div>
        <Toast
          message={toast.message}
          type={toast.type}
          visible={toast.visible}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
        />
      </DndContext>
    );
  }
}

export default App;