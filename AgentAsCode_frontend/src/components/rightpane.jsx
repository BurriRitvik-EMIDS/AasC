import React, { useState, useEffect } from 'react';
import './styles.css';

function RightPane({ projectDetails, onSave, onLogout, isLoading, onOpenKnowledgeBase }) {
  // Create state to track edited values, accounting for new model selection
  const [editedDetails, setEditedDetails] = useState({
    projectName: projectDetails.projectName || '',
    supervisorPrompt: projectDetails.supervisorPrompt || '',
    finalResponsePrompt: projectDetails.finalResponsePrompt || '',
    modelProvider: projectDetails.modelProvider || 'azure-openai',
    apiKey: projectDetails.apiKey || '',
    apiUrl: projectDetails.apiUrl || ''
  });

  // Update state when projectDetails changes
  useEffect(() => {
    setEditedDetails({
      projectName: projectDetails.projectName || '',
      supervisorPrompt: projectDetails.supervisorPrompt || '',
      finalResponsePrompt: projectDetails.finalResponsePrompt || '',
      modelProvider: projectDetails.modelProvider || 'azure-openai',
      apiKey: projectDetails.apiKey || '',
      apiUrl: projectDetails.apiUrl || ''
    });
  }, [projectDetails]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedDetails(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    // Call the onSave function passed from App.js
    if (typeof onSave === 'function') {
      await onSave(editedDetails);
    }
    console.log('Project settings updated with ID:', projectDetails.id);
    console.log('Updated settings:', editedDetails);
  };

  // Define model providers
  const modelProviders = [
    { value: 'azure-openai', label: 'Azure OpenAI' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'google-gemini', label: 'Google Gemini' },
    { value: 'anthropic', label: 'Anthropic Claude' }
  ];

  return (
    <div className="right-pane">
      {/* Logout button positioned absolutely in the top-right corner */}
      <button
        className="logout-button"
        onClick={onLogout}
      >
        Logout
      </button>

      <h2 className="pane-title">Project Settings</h2>

      <div className="settings-section">
        <h3 className="section-title">Knowledge Base Configuration</h3>
        <div className="form-group">
          <label>Manage project documentation and knowledge sources</label>
        </div>
        <div className="form-actions">
          <button
            className="save-button"
            onClick={onOpenKnowledgeBase}
            disabled={isLoading}
          >
            {isLoading ? 'Opening...' : 'Open Knowledge Base'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="section-title">Project Information</h3>
        <div className="form-group">
          <label>Project Name</label>
          <input
            type="text"
            name="projectName"
            value={editedDetails.projectName}
            onChange={handleChange}
          />
        </div>

        {/* Supervisor Prompt Section with Dynamic Agents Description */}
        <div className="form-group supervisor-prompt-container">
          <label>Orchestrator</label>
          <div className="supervisor-prompt-info">
          </div>
          <textarea
            name="supervisorPrompt"
            value={editedDetails.supervisorPrompt}
            onChange={handleChange}
            className="supervisor-prompt-textarea"
            readOnly={true} // Make it read-only since it's dynamically updated
          />
        </div>

        <div className="form-group">
          <label>Final Response Prompt</label>
          <textarea
            name="finalResponsePrompt"
            value={editedDetails.finalResponsePrompt}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="settings-section">
        <h3 className="section-title">AI Model Configuration</h3>

        <div className="form-group">
          <label>Select Model</label>
          <div className="select-wrapper">
            <select
              name="modelProvider"
              className="model-select"
              value={editedDetails.modelProvider}
              onChange={handleChange}
            >
              {modelProviders.map(provider => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>API Key</label>
          <input
            type="password"
            name="apiKey"
            value={editedDetails.apiKey}
            onChange={handleChange}
            placeholder={`Enter your ${editedDetails.modelProvider} API key`}
          />
        </div>

        <div className="form-group">
          <label>API Endpoint URL</label>
          <input
            type="text"
            name="apiUrl"
            value={editedDetails.apiUrl}
            onChange={handleChange}
            placeholder={`Enter the ${editedDetails.modelProvider} endpoint URL`}
          />
        </div>

        <div className="form-actions">
          <button
            className="save-button"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RightPane;