// removeProject.js - Utility script for handling project removal
import ApiService from '../services/apiservices';

/**
 * Handles the complete project removal process with confirmation
 * @param {string} projectId - The ID of the project to remove
 * @param {string} projectName - The name of the project for confirmation dialog
 * @param {Function} onSuccess - Callback function to execute on successful removal
 * @param {Function} onError - Callback function to execute on error
 */
export const handleProjectRemoval = async (projectId, projectName, onSuccess, onError) => {
  try {
    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete the project "${projectName}"?\n\n` +
      `This action will permanently remove:\n` +
      `• The project and all its configurations\n` +
      `• All associated agents and tools\n` +
      `• All project data from the database\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmed) {
      console.log('Project deletion cancelled by user');
      return false;
    }

    console.log(`Starting deletion process for project: ${projectName} (ID: ${projectId})`);
    
    // Call the API to delete the project
    const result = await ApiService.deleteProject(projectId);
    
    console.log('Project deletion successful:', result);
    
    // Execute success callback if provided
    if (onSuccess && typeof onSuccess === 'function') {
      onSuccess(result);
    }
    
    return true;
    
  } catch (error) {
    console.error('Project deletion failed:', error);
    
    // Show user-friendly error message
    const errorMessage = error.message || 'An unknown error occurred';
    alert(`Failed to delete project "${projectName}": ${errorMessage}`);
    
    // Execute error callback if provided
    if (onError && typeof onError === 'function') {
      onError(error);
    }
    
    return false;
  }
};

/**
 * Validates if a project can be safely removed
 * @param {Object} project - The project object to validate
 * @returns {Object} - Validation result with isValid boolean and message
 */
export const validateProjectRemoval = (project) => {
  if (!project) {
    return {
      isValid: false,
      message: 'Project data is missing'
    };
  }

  if (!project.id) {
    return {
      isValid: false,
      message: 'Project ID is missing'
    };
  }

  // Check if project is currently running
  if (project.status === 'Running') {
    return {
      isValid: false,
      message: 'Cannot delete a running project. Please stop the project first.'
    };
  }

  return {
    isValid: true,
    message: 'Project can be safely removed'
  };
};

/**
 * Batch removal of multiple projects
 * @param {Array} projects - Array of project objects to remove
 * @param {Function} onProgress - Callback for progress updates
 * @param {Function} onComplete - Callback when all removals are complete
 */
export const handleBatchProjectRemoval = async (projects, onProgress, onComplete) => {
  const results = [];
  const total = projects.length;
  
  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    
    try {
      // Validate project before removal
      const validation = validateProjectRemoval(project);
      if (!validation.isValid) {
        results.push({
          project: project,
          success: false,
          error: validation.message
        });
        continue;
      }
      
      // Remove project
      const success = await handleProjectRemoval(
        project.id, 
        project.name,
        null, // No individual success callback for batch
        null  // No individual error callback for batch
      );
      
      results.push({
        project: project,
        success: success,
        error: success ? null : 'Removal failed'
      });
      
    } catch (error) {
      results.push({
        project: project,
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
  handleProjectRemoval,
  validateProjectRemoval,
  handleBatchProjectRemoval
};
