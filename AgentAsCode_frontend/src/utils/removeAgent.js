// removeAgent.js - Utility script for handling agent removal
import ApiService from '../services/apiservices';

/**
 * Handles the complete agent removal process with confirmation
 * @param {string} agentId - The ID of the agent to remove
 * @param {string} agentName - The name of the agent for confirmation dialog
 * @param {Function} onSuccess - Callback function to execute on successful removal
 * @param {Function} onError - Callback function to execute on error
 */
export const handleAgentRemoval = async (agentId, agentName, onSuccess, onError) => {
  try {
    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete the agent "${agentName}"?\n\n` +
      `This action will permanently remove:\n` +
      `• The agent and all its configurations\n` +
      `• All associated tools and prompts\n` +
      `• All agent data from the project\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmed) {
      console.log('Agent deletion cancelled by user');
      return false;
    }

    console.log(`Starting deletion process for agent: ${agentName} (ID: ${agentId})`);
    
    // Call the API to delete the agent
    const result = await ApiService.deleteAgent(agentId);
    
    console.log('Agent deletion successful:', result);
    
    // Execute success callback if provided
    if (onSuccess && typeof onSuccess === 'function') {
      onSuccess(result);
    }
    
    return true;
    
  } catch (error) {
    console.error('Agent deletion failed:', error);
    
    // Show user-friendly error message
    const errorMessage = error.message || 'An unknown error occurred';
    alert(`Failed to delete agent "${agentName}": ${errorMessage}`);
    
    // Execute error callback if provided
    if (onError && typeof onError === 'function') {
      onError(error);
    }
    
    return false;
  }
};

/**
 * Validates if an agent can be safely removed
 * @param {Object} agent - The agent object to validate
 * @returns {Object} - Validation result with isValid boolean and message
 */
export const validateAgentRemoval = (agent) => {
  if (!agent) {
    return {
      isValid: false,
      message: 'Agent data is missing'
    };
  }

  if (!agent.id) {
    return {
      isValid: false,
      message: 'Agent ID is missing'
    };
  }

  // Add any additional validation logic here
  // For example, check if agent is currently running or has dependencies

  return {
    isValid: true,
    message: 'Agent can be safely removed'
  };
};

/**
 * Batch removal of multiple agents
 * @param {Array} agents - Array of agent objects to remove
 * @param {Function} onProgress - Callback for progress updates
 * @param {Function} onComplete - Callback when all removals are complete
 */
export const handleBatchAgentRemoval = async (agents, onProgress, onComplete) => {
  const results = [];
  const total = agents.length;
  
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    
    try {
      // Validate agent before removal
      const validation = validateAgentRemoval(agent);
      if (!validation.isValid) {
        results.push({
          agent: agent,
          success: false,
          error: validation.message
        });
        continue;
      }
      
      // Remove agent
      const success = await handleAgentRemoval(
        agent.id, 
        agent.name,
        null, // No individual success callback for batch
        null  // No individual error callback for batch
      );
      
      results.push({
        agent: agent,
        success: success,
        error: success ? null : 'Removal failed'
      });
      
    } catch (error) {
      results.push({
        agent: agent,
        success: false,
        error: error.message
      });
    }
    
    // Report progress
    if (onProgress && typeof onProgress === 'function') {
      onProgress(i + 1, total, results[results.length - 1]);
    }
  }
  
  // Report completion
  if (onComplete && typeof onComplete === 'function') {
    onComplete(results);
  }
  
  return results;
};

export default {
  handleAgentRemoval,
  validateAgentRemoval,
  handleBatchAgentRemoval
};
