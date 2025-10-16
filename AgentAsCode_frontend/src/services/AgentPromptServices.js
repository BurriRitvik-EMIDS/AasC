// src/services/AgentPromptServices.js
const API_BASE_URL = 'http://localhost:8080';

const AgentPromptService = {
  /**
   * Gets a concise description of an agent based on its prompt
   * @param {string} agentName - The name of the agent
   * @param {string} agentPrompt - The agent's prompt
   * @returns {Promise<string>} - A concise description of what the agent does
   */
  getAgentDescription: async (agentName, agentPrompt) => {
    try {
      console.log(`Getting description for agent: ${agentName}`);
      
      const response = await fetch(`${API_BASE_URL}/admin/get_agent_description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_name: agentName,
          agent_prompt: agentPrompt
        }),
      });

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.error('Agent description generation error:', errorText);
        } catch (e) {
          console.error('Failed to get error text', e);
        }
        throw new Error(`Error generating agent description: ${response.status} ${response.statusText || errorText}`);
      }

      const result = await response.json();
      console.log('Agent description generated:', result);
      return result.description || `handles tasks related to ${agentName}`;
    } catch (error) {
      console.error('Failed to get agent description:', error);
      // Provide a fallback description
      return `handles tasks related to ${agentName}`;
    }
  },

  /**
   * Updates the supervisor prompt with the agent description
   * @param {string} projectId - The project ID
   * @param {string} agentName - The name of the agent
   * @param {string} agentDescription - The description of the agent
   * @returns {Promise<object>} - The updated supervisor prompt
   */
  updateSupervisorPrompt: async (projectId, agentName, agentDescription) => {
    try {
      console.log(`Updating supervisor prompt for project ${projectId} with agent ${agentName}`);
      
      const response = await fetch(`${API_BASE_URL}/admin/update_supervisor_prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          agent_name: agentName,
          agent_description: agentDescription
        }),
      });

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.error('Supervisor prompt update error:', errorText);
        } catch (e) {
          console.error('Failed to get error text', e);
        }
        throw new Error(`Error updating supervisor prompt: ${response.status} ${response.statusText || errorText}`);
      }

      const result = await response.json();
      console.log('Supervisor prompt updated:', result);
      return result;
    } catch (error) {
      console.error('Failed to update supervisor prompt:', error);
      throw error;
    }
  },

  /**
   * Gets the current supervisor prompt for a project
   * @param {string} projectId - The project ID
   * @returns {Promise<string>} - The supervisor prompt
   */
  getSupervisorPrompt: async (projectId) => {
    try {
      console.log(`Getting supervisor prompt for project ${projectId}`);
      
      const response = await fetch(`${API_BASE_URL}/admin/get_supervisor_prompt?project_id=${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.error('Get supervisor prompt error:', errorText);
        } catch (e) {
          console.error('Failed to get error text', e);
        }
        throw new Error(`Error getting supervisor prompt: ${response.status} ${response.statusText || errorText}`);
      }

      const result = await response.json();
      console.log('Supervisor prompt retrieved:', result);
      return result.prompt || '';
    } catch (error) {
      console.error('Failed to get supervisor prompt:', error);
      return '';
    }
  }
};

export default AgentPromptService;