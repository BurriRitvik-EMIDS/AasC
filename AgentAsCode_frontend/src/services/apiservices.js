// src/services/apiservices.js
const API_BASE_URL = 'http://localhost:8080';

// Encrypt text with AES-CBC and return base64
async function encryptAesCbcBase64(plainText) {
  const keyString = process.env.REACT_APP_AES_KEY;
  const ivString = process.env.REACT_APP_AES_IV;

  if (!keyString || !ivString) {
    throw new Error('Missing REACT_APP_AES_KEY or REACT_APP_AES_IV');
  }

  const enc = new TextEncoder();
  const keyData = enc.encode(keyString);
  const ivData = enc.encode(ivString);

  // Import as raw key (expects 16/24/32 bytes). If longer, slice to 32 bytes.
  const normalizedKey = keyData.length > 32 ? keyData.slice(0, 32) : keyData;
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    normalizedKey,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: ivData },
    cryptoKey,
    enc.encode(plainText)
  );

  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(cipherBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const ApiService = {
  // MCP Tools
  fetchMcpTools: async (mcpUrl) => {
    try {
      if (!mcpUrl || typeof mcpUrl !== 'string' || !mcpUrl.trim()) {
        throw new Error('Invalid MCP URL provided');
      }

      const encodedUrl = encodeURIComponent(mcpUrl.trim());
      const response = await fetch(`${API_BASE_URL}/fetchtools?mcp_url=${encodedUrl}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch MCP tools: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // Validate response format
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from server');
      }

      return {
        tools: Array.isArray(data.tools) ? data.tools : [],
        count: typeof data.count === 'number' ? data.count : 0
      };
    } catch (error) {
      console.error('Error in fetchMcpTools:', error);
      throw error;
    }
  },

  // Projects
  createProject: async (projectData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/create_project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_name: projectData.projectName,
          project_description: projectData.projectDescription || "",
          supervisor_prompt: projectData.supervisorPrompt,
          final_response_prompt: projectData.finalResponsePrompt,
          platform: "Azure", // As specified in the Swagger
          azure_openai_key: projectData.apiKey,
          azure_openai_url: projectData.apiUrl
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Project creation error response:', errorText);
        throw new Error(`Error creating project: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Project created successfully:', result);
      return result;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  },

  getProjects: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/get_projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error getting projects: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get projects:', error);
      throw error;
    }
  },

  getProject: async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/get_project/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error getting project: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get project:', error);
      throw error;
    }
  },

  updateProject: async (projectId, projectData) => {
    try {
      console.log('Updating project with ID:', projectId, 'Data:', projectData);

      // Build a partial payload with only provided fields (avoid sending undefined)
      const payload = {};
      if (projectData.projectName !== undefined) payload.project_name = projectData.projectName;
      if (projectData.projectDescription !== undefined) payload.project_description = projectData.projectDescription || "";
      if (projectData.supervisorPrompt !== undefined) payload.supervisor_prompt = projectData.supervisorPrompt;
      if (projectData.finalResponsePrompt !== undefined) payload.final_response_prompt = projectData.finalResponsePrompt;
      if (projectData.modelProvider !== undefined) {
        payload.platform = projectData.modelProvider === 'azure-openai' ? 'Azure' : projectData.modelProvider;
      }
      if (projectData.apiKey !== undefined) payload.azure_openai_key = projectData.apiKey;
      if (projectData.apiUrl !== undefined) payload.azure_openai_url = projectData.apiUrl;
      if (projectData.portNumber !== undefined) payload.port_number = projectData.portNumber;

      const response = await fetch(`${API_BASE_URL}/admin/update_project/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Project update error response:', errorText);
        throw new Error(`Error updating project: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Project updated successfully:', result);
      return result;
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  },

  // Agents
  createAgent: async (agentData) => {
    try {
      console.log('Creating agent with input data:', agentData);

      // Ensure toolIds is an array
      if (!agentData.toolIds || !Array.isArray(agentData.toolIds)) {
        console.warn('No tool IDs provided or invalid format, defaulting to empty array');
        agentData.toolIds = [];
      }

      // Make sure all tool IDs are properly formatted strings
      const toolsIdSelected = agentData.toolIds.map(id => {
        if (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return id;
        }
        if (id && id.id) {
          return id.id;
        }
        return String(id);
      });

      // Create default tools_selected to avoid IndexError in the backend
      const toolsSelected = toolsIdSelected.length > 0 ? ['default_tool'] : ['default_tool'];

      // Create the payload matching exactly what the backend expects
      const payload = {
        project_id: agentData.projectId,
        agent_name: agentData.name,
        agent_prompt: agentData.prompt,
        tools_selected: toolsSelected, // Required by backend, provide at least one value
        tool_type: agentData.toolType || 'Custom', // Default to Custom if not provided
        tools_id_selected: toolsIdSelected
      };

      console.log('Sending agent creation payload:', payload);

      const response = await fetch(`${API_BASE_URL}/admin/create_agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorData = null;
        try {
          errorData = await response.json();
          console.error('Agent creation error response:', errorData);
        } catch (e) {
          console.error('Failed to parse error response as JSON:', e);
          try {
            const errorText = await response.text();
            console.error('Error response text:', errorText);
          } catch (textError) {
            console.error('Failed to get error text', textError);
          }
        }

        throw new Error(`Error creating agent: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Agent creation successful:', result);
      return result;
    } catch (error) {
      console.error('Failed to create agent:', error);
      throw error;
    }
  },

  getAgents: async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/get_agents/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error getting agents: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get agents:', error);
      throw error;
    }
  },

  // Add this missing method
  getAgentsByProject: async (projectId) => {
    try {
      console.log(`Fetching agents for project ${projectId}...`);
      const response = await fetch(`${API_BASE_URL}/admin/get_agents/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`Error getting agents: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      console.log('Agents response:', data);

      // Handle different response formats
      if (Array.isArray(data)) {
        return data;
      } else if (data && data.agents) {
        return data.agents;
      } else if (data && data.data) {
        return Array.isArray(data.data) ? data.data : [];
      }

      console.warn('Unexpected agents response format:', data);
      return [];
    } catch (error) {
      console.error('Failed to get agents by project:', error);
      return [];
    }
  },

  getAgentCode: async (agentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/get_agent_code/${agentId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Agent code error response:', errorText);
        throw new Error(`Error getting agent code: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to get agent code:', error);
      throw error;
    }
  },

  updateAgentCode: async (agentId, code) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/update_agent_code`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agentId,
          new_code: code,
          notes: "Updated via UI"
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Agent code update error response:', errorText);
        throw new Error(`Error updating agent code: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to update agent code:', error);
      throw error;
    }
  },

  updateAgentPrompt: async (agentData) => {
    try {
      console.log('Updating agent prompt:', agentData);

      // Format the tools array into the format required by backend
      const toolsIdSelected = agentData.tools
        ? agentData.tools.map(tool => tool.id || tool)
        : [];

      const payload = {
        agent_id: agentData.id,
        agent_prompt: agentData.prompt,
        tools_id_selected: toolsIdSelected,
        tools_selected: ['default_tool']
      };

      console.log('Updating agent prompt with payload:', payload);

      const response = await fetch(`${API_BASE_URL}/admin/update_agent_prompt`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Agent prompt update error response:', errorData);
        throw new Error(`Error updating agent prompt: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to update agent prompt:', error);
      throw error;
    }
  },

  deleteAgent: async (agentId) => {
    try {
      console.log(`Attempting to delete agent with ID: ${agentId}`);

      // Try the first approach: POST with agent_id in body (similar to project deletion pattern)
      let response = await fetch(`${API_BASE_URL}/admin/delete_agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agent_id: agentId }),
      });

      // If that fails with 404, try DELETE with agent_id in URL
      if (!response.ok && response.status === 404) {
        console.log('POST method failed, trying DELETE method...');
        response = await fetch(`${API_BASE_URL}/admin/delete_agent/${agentId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      // If still failing, try alternative endpoint patterns
      if (!response.ok && response.status === 404) {
        console.log('Standard endpoints failed, trying alternative patterns...');

        // Try with different endpoint structure
        response = await fetch(`${API_BASE_URL}/admin/agents/${agentId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Agent deletion error response:', errorText);
        console.error('Response status:', response.status);
        console.error('Response statusText:', response.statusText);

        if (response.status === 404) {
          throw new Error(`Delete endpoint not found. The backend may not support agent deletion yet.`);
        }

        throw new Error(`Error deleting agent: ${response.statusText || errorText}`);
      }

      const result = await response.json();
      console.log('Agent deleted successfully:', result);
      return result;
    } catch (error) {
      console.error('Failed to delete agent:', error);
      throw error;
    }
  },

  // Tools
  createTool: async (toolData) => {
    try {
      console.log('Creating tool with data:', toolData);

      if (!toolData.name) {
        console.error('Tool name cannot be empty');
        throw new Error('Tool name cannot be empty');
      }

      // Prepare MCP server config with empty strings for missing fields
      let mcpConfig = {};
      if (toolData.toolType === 'mcp' && toolData.mcp_server_config) {
        const config = toolData.mcp_server_config;
        mcpConfig = {
          sql_server: config.sql_server || '',
          sql_database: config.sql_database || '',
          sql_user: config.sql_user || '',
          sql_password: config.sql_password || ''
        };
      }

      const payload = {
        project_id: toolData.projectId,
        tool_type: toolData.toolType || 'custom',
        tool_name: toolData.name,
        selected_mcp_server: toolData.toolType === 'mcp' ? 'MSSQL' : '',
        mcp_server_config: toolData.toolType === 'mcp' ? mcpConfig : {},
        api_url: toolData.apiUrl || '',
        api_key: toolData.apiKey || '',
        tool_prompt: toolData.prompt || '',
        mcp_url: toolData.mcpUrl || ''
      };

      console.log('Sending tool creation payload:', payload);

      const response = await fetch(`${API_BASE_URL}/admin/create_tool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorText = '';
        try {
          const errorData = await response.json();
          console.error('Tool creation error response:', errorData);
          errorText = JSON.stringify(errorData);
        } catch (e) {
          console.error('Failed to parse error response as JSON:', e);
          try {
            errorText = await response.text();
            console.error('Error response text:', errorText);
          } catch (textError) {
            console.error('Failed to get error text', textError);
          }
        }
        throw new Error(`Error creating tool: ${response.statusText || errorText}`);
      }

      const result = await response.json();
      console.log('Tool creation successful:', result);
      return result;
    } catch (error) {
      console.error('Failed to create tool:', error);
      throw error;
    }
  },

  getTools: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/get_tools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error getting tools: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get tools:', error);
      throw error;
    }
  },

  // Add this missing method
  getToolsByProject: async (projectId) => {
    try {
      console.log(`Fetching tools for project ${projectId}...`);
      const response = await fetch(`${API_BASE_URL}/admin/get_tools/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`Error getting tools: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      console.log('Tools response:', data);

      // Handle different response formats
      if (Array.isArray(data)) {
        return data;
      } else if (data && data.tools) {
        return data.tools;
      } else if (data && data.data) {
        return Array.isArray(data.data) ? data.data : [];
      }

      console.warn('Unexpected tools response format:', data);
      return [];
    } catch (error) {
      console.error('Failed to get tools by project:', error);
      return [];
    }
  },

  getTool: async (toolId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/get_tool/${toolId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error getting tool: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get tool:', error);
      throw error;
    }
  },

  getToolCode: async (toolId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/get_tool_code/${toolId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Tool code error response:', errorText);
        throw new Error(`Error getting tool code: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to get tool code:', error);
      throw error;
    }
  },

  deleteTool: async (projectId, toolId) => {
    try {
      console.log(`Attempting to delete tool with ID: ${toolId} from project: ${projectId}`);

      // First try: DELETE request to /admin/delete_tool/{tool_id}
      let response = await fetch(`${API_BASE_URL}/admin/delete_tool/${toolId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // If that fails with 404, try POST with tool_id in body
      if (!response.ok && response.status === 404) {
        console.log('DELETE method failed, trying POST method...');
        response = await fetch(`${API_BASE_URL}/admin/delete_tool`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tool_id: toolId }),
        });
      }

      // If still failing, try with project_id in the URL
      if (!response.ok && response.status === 404) {
        console.log('Standard endpoints failed, trying with project_id...');
        response = await fetch(`${API_BASE_URL}/admin/projects/${projectId}/tools/${toolId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Tool deletion error response:', errorText);
        console.error('Response status:', response.status);
        console.error('Response statusText:', response.statusText);

        if (response.status === 404) {
          throw new Error(`Delete endpoint not found. The backend may not support tool deletion yet.`);
        }

        throw new Error(`Error deleting tool: ${response.statusText || errorText}`);
      }

      const result = await response.json();
      console.log('Tool deleted successfully:', result);
      return result;
    } catch (error) {
      console.error('Failed to delete tool:', error);
      throw error;
    }
  },

  startProject: async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/deploy/start_project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
      });
      if (!response.ok) throw new Error('Failed to start project');
      return await response.json();
    } catch (error) {
      console.error('Failed to start project:', error);
      throw error;
    }
  },

  stopProject: async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/deploy/stop_project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
      });
      if (!response.ok) throw new Error('Failed to stop project');
      return await response.json();
    } catch (error) {
      console.error('Failed to stop project:', error);
      throw error;
    }
  },

  deleteProject: async (projectId) => {
    try {
      console.log(`Attempting to delete project with ID: ${projectId}`);

      // Try the first approach: POST with project_id in body (similar to start/stop)
      let response = await fetch(`${API_BASE_URL}/admin/delete_project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ project_id: projectId }),
      });

      // If that fails with 404, try DELETE with project_id in URL
      if (!response.ok && response.status === 404) {
        console.log('POST method failed, trying DELETE method...');
        response = await fetch(`${API_BASE_URL}/admin/delete_project/${projectId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      // If still failing, try alternative endpoint patterns
      if (!response.ok && response.status === 404) {
        console.log('Standard endpoints failed, trying alternative patterns...');

        // Try with different endpoint structure
        response = await fetch(`${API_BASE_URL}/admin/projects/${projectId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Project deletion error response:', errorText);
        console.error('Response status:', response.status);
        console.error('Response statusText:', response.statusText);

        if (response.status === 404) {
          throw new Error(`Delete endpoint not found. The backend may not support project deletion yet.`);
        }

        throw new Error(`Error deleting project: ${response.statusText || errorText}`);
      }

      const result = await response.json();
      console.log('Project deleted successfully:', result);
      return result;
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  },

  // Agent Templates
  getAgentTemplates: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/agent_templates`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error fetching agent templates:', errorText);
        throw new Error(`Failed to fetch agent templates: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error in getAgentTemplates:', error);
      throw error;
    }
  },

  getTemplateCategories: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/agent_templates/categories`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error fetching template categories:', errorText);
        throw new Error(`Failed to fetch template categories: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      // Ensure we return an array of categories
      return Array.isArray(data.categories) ? data.categories : [];
    } catch (error) {
      console.error('Error in getTemplateCategories:', error);
      throw error;
    }
  },

  getSubAgents: async (templateId) => {
    try {
      console.log(`Fetching sub-agents for template: ${templateId}`);

      // First, get the sub-agents for the template
      const subAgentsResponse = await fetch(`${API_BASE_URL}/api/admin/agent_templates_subagents/${templateId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!subAgentsResponse.ok) {
        const errorText = await subAgentsResponse.text();
        console.error(`Error fetching sub-agents for template ${templateId}:`, errorText);
        return {
          [templateId]: [],
          templateGroups: []
        };
      }

      // Get the sub-template groups
      const groupsResponse = await fetch(`${API_BASE_URL}/api/admin/agent_templates/categories`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      const subAgents = await subAgentsResponse.json();
      const templateGroups = groupsResponse.ok ? await groupsResponse.json() : [];

      // Format the response to include both sub-agents and template groups
      const result = {
        [templateId]: subAgents.map(agent => ({
          id: agent.id || agent.name?.toLowerCase().replace(/\s+/g, '_'),
          name: agent.name || 'Unnamed Agent',
          description: agent.description || 'No description available',
          worker_prompt: agent.worker_prompt || agent.prompt || '',
          templateId: templateId,
          category: agent.category || 'Uncategorized'
        })),
        templateGroups: templateGroups.categories || []
      };

      console.log(`Found ${subAgents.length} sub-agents and ${result.templateGroups.length} template groups for template ${templateId}`);
      return result;
    } catch (error) {
      console.error('Error in getSubAgents:', error);
      // Return empty result on error to prevent UI breakage
      return { [templateId]: [] };
    }
  },

  // Chat methods
  clearSession: async (projectId, sessionId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/clear_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to clear session');
      }

      return await response.json();
    } catch (error) {
      console.error('Error clearing session:', error);
      throw error;
    }
  },

  sendChatMessage: async (projectId, message, sessionId = null) => {
    try {
      // First get project details to get the dynamic port
      const project = await ApiService.getProject(projectId);
      const projectPort = project.port_number || 4304; // fallback to default

      console.log(`Sending chat message to project ${projectId} on port ${projectPort}`);

      const threadId = sessionId || `session_${Date.now()}`;
      const payloadObj = { thread_id: threadId, message };
      const encrypted = await encryptAesCbcBase64(JSON.stringify(payloadObj));

      const response = await fetch(`http://localhost:${projectPort}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: encrypted })
      });

      if (!response.ok && response.status !== 200) {
        const errorText = await response.text();
        console.error('Chat message error response:', errorText);
        throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
      }

      // Handle server-sent text/event-stream style (newline-delimited JSON)
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let lastMessage = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            lastMessage = parsed;
          } catch (e) {
            console.warn('Failed to parse streamed line:', trimmed);
          }
        }
      }

      if (!lastMessage) {
        throw new Error('No response received from stream');
      }
      return lastMessage;
    } catch (error) {
      console.error('Failed to send chat message:', error);
      throw error;
    }
  },

  // Evaluation Metrics API calls
  getAvailableMetrics: async () => {
    try {
      const response = await fetch('http://localhost:8080/evaluation/metrics', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get available metrics:', error);
      throw error;
    }
  },

  getChatHistory: async (projectId, sessionId) => {
    try {
      const response = await fetch(`http://localhost:8080/evaluation/chat-history/${projectId}/${sessionId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch chat history: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get chat history:', error);
      throw error;
    }
  },

  evaluateResponse: async (projectId, sessionId, selectedMetrics, finalResponse = null, priorAgentMessages = null) => {
    try {
      const response = await fetch('http://localhost:8080/evaluation/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          session_id: sessionId,
          selected_metrics: selectedMetrics,
          final_response: finalResponse,
          agent_messages: priorAgentMessages
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to evaluate response: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to evaluate response:', error);
      throw error;
    }
  },

  // Debug methods to help troubleshoot deployment issues
  getRunningProjects: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/deploy/running_projects`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get running projects: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get running projects:', error);
      throw error;
    }
  },

  getProjectStatus: async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/deploy/project_status/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get project status: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get project status:', error);
      throw error;
    }
  },
};

export default ApiService;