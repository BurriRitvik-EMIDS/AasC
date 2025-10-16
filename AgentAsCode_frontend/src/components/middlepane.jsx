import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import './styles.css';
import CodeEditor from './codeeditor';
import { useDroppable } from '@dnd-kit/core';
import ApiService from '../services/apiservices';

const MiddlePane = forwardRef(function MiddlePane({ section, onSave, existingTools = [], selectedAgent = null, onUpdateAgentPrompt, rootAgentTemplateId = null }, ref) {
  const [agentName, setAgentName] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [tools, setTools] = useState('');
  const [selectedTools, setSelectedTools] = useState([]);
  const [codeSnippet, setCodeSnippet] = useState('// Write your code here');

  // State for tool configuration
  const [toolType, setToolType] = useState('mcp');
  const [apiUrl, setApiUrl] = useState('');
  const [apiInput, setApiInput] = useState('');
  const [toolName, setToolName] = useState('');
  const [toolPrompt, setToolPrompt] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpTools, setMcpTools] = useState([]);
  const [loadingMcpTools, setLoadingMcpTools] = useState(false);
  const [mcpToolsError, setMcpToolsError] = useState('');
  const [selectedMcpTool, setSelectedMcpTool] = useState('');
  const [selectedMcpTools, setSelectedMcpTools] = useState([]);
  const [mcpFetchTimeout, setMcpFetchTimeout] = useState(null);

  // For MCP server type selection
  const [selectedMcpServer, setSelectedMcpServer] = useState('');

  // For MCP server configuration - MSSQL only
  const [mcpServerConfig, setMcpServerConfig] = useState({
    sql_server: '',
    sql_database: '',
    sql_user: '',
    sql_password: ''
  });

  // State for edit mode
  const [isEditMode, setIsEditMode] = useState(false);

  // State for agent tool type - Default to Custom for compatibility with backend
  const [agentToolType, setAgentToolType] = useState('Custom');

  // State for sub-agent templates
  const [subAgentTemplates, setSubAgentTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [templateCategories, setTemplateCategories] = useState([]);

  // Set up droppable area for tools
  const { setNodeRef, isOver } = useDroppable({
    id: 'agent-tools-dropzone',
    disabled: section !== 'agents'
  });

  // Load sub-agent templates when component mounts or project changes
  useEffect(() => {
    const loadSubAgents = async () => {
      try {
        setLoadingTemplates(true);
        setSubAgentTemplates([]);
        setSelectedTemplate('');

        // Use rootAgentTemplateId if provided, otherwise fall back to project template ID
        const templateId = rootAgentTemplateId || window.currentProject?.templateId;
        if (!templateId) {
          console.log('Missing template ID');
          return;
        }

        console.log(`Loading sub-agents for template: ${templateId}`);

        try {
          const response = await ApiService.getSubAgents(templateId);
          const subAgents = response[templateId] || [];

          if (subAgents.length === 0) {
            console.warn(`No sub-agents found for template: ${templateId}`);
            setSubAgentTemplates([]);
            return;
          }

          const mappedTemplates = subAgents.map(agent => ({
            ...agent,
            id: agent.id || `agent_${Math.random().toString(36).substr(2, 9)}`,
            templateId: templateId,
            name: agent.name || 'Unnamed Agent',
            worker_prompt: agent.worker_prompt || agent.prompt || '',
            description: agent.description || 'No description available',
            isProjectSpecific: false
          }));

          console.log('Mapped sub-agents:', mappedTemplates);
          setSubAgentTemplates(mappedTemplates);

        } catch (error) {
          console.error('Error loading sub-agents:', error);
          console.error('Error details:', error.message);

          // If it's a 404 error, it means no subagents exist for this template
          if (error.message && error.message.includes('404')) {
            console.warn(`Template '${templateId}' has no subagents defined`);
          }

          setSubAgentTemplates([]);
        }
      } catch (error) {
        console.error('Error in loadSubAgents:', error);
        setSubAgentTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
    };

    // Load sub-agents when the component mounts or when the project/rootAgentTemplateId changes
    const templateId = rootAgentTemplateId || window.currentProject?.templateId;
    if (templateId) {
      loadSubAgents();
    } else {
      setSubAgentTemplates([]);
    }
  }, [rootAgentTemplateId, window.currentProject?.templateId]);

  // Handle template selection
  const handleTemplateSelect = (e) => {
    const templateId = e.target.value;
    setSelectedTemplate(templateId);

    if (templateId === 'custom') {
      // Reset to empty values for custom worker
      setAgentName('');
      setAgentPrompt('');
    } else if (templateId) {
      // Find the selected template and update form fields
      const selected = subAgentTemplates.find(t => t.id === templateId);
      if (selected) {
        setAgentName(selected.name);
        setAgentPrompt(selected.worker_prompt || '');
      }
    } else {
      // No template selected
      setAgentName('');
      setAgentPrompt('');
    }
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    addToolToSelection: (tool) => {
      // Check if tool is already added
      if (!selectedTools.some(t => t.id === tool.id)) {
        const updatedTools = [...selectedTools, tool];
        setSelectedTools(updatedTools);

        // Update tools string
        const toolsString = updatedTools.map(t => t.name).join(', ');
        setTools(toolsString);
      }
    },
    getSelectedTools: () => selectedTools,
    setSelectedTools: (tools) => setSelectedTools(tools),
    setEditMode: (agent) => {
      // Set form to edit mode with the agent data
      setIsEditMode(true);
      setAgentName(agent.name);
      setAgentPrompt(agent.prompt);
      setAgentToolType(agent.toolType || 'Custom'); // Set the tool type from the agent

      // Set selected tools if available
      if (agent.tools) {
        let toolsArray = [];
        if (typeof agent.tools === 'string') {
          toolsArray = agent.tools.split(',').map(t => t.trim());
        } else if (Array.isArray(agent.tools)) {
          toolsArray = agent.tools.map(t => typeof t === 'object' ? t.name : t);
        }

        const matchedTools = existingTools.filter(tool =>
          toolsArray.includes(tool.name)
        );

        setSelectedTools(matchedTools);
        setTools(Array.isArray(agent.tools)
          ? agent.tools.map(t => typeof t === 'object' ? t.name : t).join(', ')
          : agent.tools
        );
      }
    }
  }));

  // Update based on selected tools
  useEffect(() => {
    // Convert selected tools array to comma-separated string
    const toolsString = selectedTools.map(tool => tool.name).join(', ');
    setTools(toolsString);
  }, [selectedTools]);

  // Reset fields when section changes
  useEffect(() => {
    setAgentName('');
    setAgentPrompt('');
    setTools('');
    setSelectedTools([]);
    setCodeSnippet('// Write your code here');
    setToolType('mcp');
    setAgentToolType('Custom'); // Reset agent tool type to Custom
    setApiUrl('');
    setApiInput('');
    setToolName('');
    setToolPrompt('');
    setMcpUrl('');
    setMcpTools([]);
    setLoadingMcpTools(false);
    setMcpToolsError('');
    setSelectedMcpTool('');
    setIsEditMode(false);
    setSelectedMcpServer(''); // Reset selected server type
    setMcpServerConfig({
      sql_server: '',
      sql_database: '',
      sql_user: '',
      sql_password: ''
    });
  }, [section]);

  // Update form when selectedAgent changes
  useEffect(() => {
    if (selectedAgent && section === 'agents') {
      setAgentName(selectedAgent.name);
      setAgentPrompt(selectedAgent.prompt);
      setAgentToolType(selectedAgent.toolType || 'Custom'); // Set the tool type from the agent

      // Set selected tools if available
      if (selectedAgent.tools) {
        let toolsArray = [];
        if (typeof selectedAgent.tools === 'string') {
          toolsArray = selectedAgent.tools.split(',').map(t => t.trim());
        } else if (Array.isArray(selectedAgent.tools)) {
          toolsArray = selectedAgent.tools.map(t => typeof t === 'object' ? t.name : t);
        }

        const matchedTools = existingTools.filter(tool =>
          toolsArray.includes(tool.name)
        );

        setSelectedTools(matchedTools);
        setTools(toolsArray.join(', '));
      }
      setIsEditMode(true);
    }
  }, [selectedAgent, section, existingTools]);

  const handleRemoveTool = (toolToRemove) => {
    setSelectedTools(selectedTools.filter(tool => tool.id !== toolToRemove.id));
  };

  const handleSave = async (e) => {
    e.preventDefault();

    try {
      if (section === 'agents') {
        // Input validation
        if (!agentName.trim()) {
          alert('Agent name is required');
          return;
        }

        if (!agentPrompt.trim()) {
          alert('Agent prompt is required');
          return;
        }

        if (isEditMode && selectedAgent) {
          // Update existing agent's prompt
          onUpdateAgentPrompt({
            id: selectedAgent.id,
            name: agentName,
            prompt: agentPrompt,
            tools: selectedTools,
            toolsArray: selectedTools.map(tool => tool.name),
            selectedToolIds: selectedTools.map(tool => tool.id),
            toolType: agentToolType // Include tool type in update
          });
        } else {
          // Process tools from input field if any
          const toolsArray = tools.trim()
            ? tools.split(',').map(t => t.trim())
            : [];

          // Combine manually entered tools with drag & dropped tools
          const allTools = [...selectedTools];

          // Add any manually entered tools that aren't already included
          toolsArray.forEach(toolName => {
            if (!allTools.some(t => t.name === toolName)) {
              allTools.push({ name: toolName });
            }
          });

          // Create new agent with tools
          const newItem = {
            type: section,
            name: agentName,
            prompt: agentPrompt,
            tools: tools,
            toolsArray: toolsArray,
            selectedToolIds: selectedTools.map(tool => tool.id),
            code: codeSnippet,
            toolType: agentToolType // Include tool type in new agent
          };

          console.log('Saving agent with toolType:', agentToolType);
          onSave(newItem);
        }
      } else if (section === 'tools') {
        // Input validation for tools
        if (toolType === 'custom' && !toolName.trim()) {
          alert('Tool name is required for custom tools');
          return;
        }

        if (toolType === 'mcp') {
          // MCP server type is now optional
          // No validation for selectedMcpServer

          // MCP Tool Link functionality has been removed

          // Validate MCP URL is provided
          if (!mcpUrl || !mcpUrl.trim()) {
            alert('MCP URL is required');
            return;
          }

          // Validate MCP configuration if MSSQL is selected
          if (selectedMcpServer === 'MSSQL' &&
            (!mcpServerConfig.sql_server.trim() ||
              !mcpServerConfig.sql_database.trim() ||
              !mcpServerConfig.sql_user.trim() ||
              !mcpServerConfig.sql_password.trim())) {
            alert('All SQL server configuration fields are required');
            return;
          }
        }

        // Create tool based on selected tool type
        const newItem = {
          type: section,
          toolType: toolType,
          name: toolType === 'mcp' ? `sql_tool` : toolName,  // Use sql_tool for MCP tools
          toolName: toolType === 'mcp' ? `sql_tool` : toolName,
          prompt: toolType === 'mcp' ? '' : toolPrompt,
          toolPrompt: toolType === 'mcp' ? '' : toolPrompt,
          tools: '',
          apiUrl: toolType === 'mcp' ? apiUrl : '',
          apiInput: toolType === 'mcp' ? apiInput : '',
          mcpUrl: toolType === 'mcp' ? mcpUrl : '',
          selectedMcpTool: toolType === 'mcp' ? selectedMcpTool : '',
          mcpToolDetails: toolType === 'mcp' && selectedMcpTool ? mcpTools.find(t => t.id === selectedMcpTool) : null,
          code: codeSnippet,
          // Add MCP specific fields - always MSSQL
          selected_mcp_server: toolType === 'mcp' ? selectedMcpServer : '',
          mcp_server_config: toolType === 'mcp' && selectedMcpServer === 'MSSQL' ? mcpServerConfig : {}
        };

        onSave(newItem);
      }
    } catch (error) {
      console.error('Error in handleSave:', error);
      alert('An error occurred while saving: ' + error.message);
    }
  };

  const handleCancel = () => {
    // Reset the form
    setAgentName('');
    setAgentPrompt('');
    setTools('');
    setSelectedTools([]);
    setCodeSnippet('// Write your code here');
    setIsEditMode(false);
    setAgentToolType('Custom');
    setMcpUrl('');
    setMcpTools([]);
    setLoadingMcpTools(false);
    setMcpToolsError('');
    setSelectedMcpTool('');
    setSelectedMcpServer('');
    setMcpServerConfig({
      sql_server: '',
      sql_database: '',
      sql_user: '',
      sql_password: ''
    });
  };

  // Handle MCP config change
  const handleMCPConfigChange = (field, value) => {
    setMcpServerConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Fetch MCP tools from the provided URL
  const fetchMcpTools = async (url) => {
    if (!url) {
      setMcpTools([]);
      setSelectedMcpTools([]);
      return;
    }

    try {
      // Normalize URL
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http')) {
        normalizedUrl = `http://${normalizedUrl}`;
      }

      // Remove any trailing slashes
      normalizedUrl = normalizedUrl.replace(/\/+$/, '');

      // Ensure we have the /mcp endpoint
      if (!normalizedUrl.endsWith('/mcp')) {
        normalizedUrl = `${normalizedUrl}/mcp`;
      }

      console.log(`Fetching MCP tools from: ${normalizedUrl}`);

      const response = await fetch(normalizedUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response from MCP server:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle SSE (Server-Sent Events) response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let tools = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6)); // Remove 'data: ' prefix
              if (data.tools && Array.isArray(data.tools)) {
                tools = [...tools, ...data.tools];
              } else if (Array.isArray(data)) {
                tools = [...tools, ...data];
              }
            } catch (e) {
              console.warn('Failed to parse MCP tool data:', e);
            }
          }
        }
      }

      console.log('Fetched MCP tools:', tools);
      setMcpTools(tools);

      // If we have tools, select them by default
      if (tools.length > 0) {
        setSelectedMcpTools(tools.map(tool => ({
          id: tool.id || tool.name,
          name: tool.name || 'Unnamed Tool',
          description: tool.description || 'No description available'
        })));
      }

    } catch (error) {
      console.error('Error fetching MCP tools:', error);
      setMcpTools([]);
      setSelectedMcpTools([]);
    }
  };

  // Handle MCP URL change with debouncing
  const handleMcpUrlChange = (url) => {
    setMcpUrl(url);

    // Clear previous timeout
    if (mcpFetchTimeout) {
      clearTimeout(mcpFetchTimeout);
    }

    // If URL is empty, clear tools
    if (!url) {
      setMcpTools([]);
      setSelectedMcpTools([]);
      return;
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      fetchMcpTools(url);
    }, 1000); // 1 second debounce

    setMcpFetchTimeout(timeoutId);
  };

  // Group templates by category
  const templatesByCategory = subAgentTemplates.reduce((groups, template) => {
    const category = template.category || 'Uncategorized';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(template);
    return groups;
  }, {});

  // Get unique categories
  const categories = Object.keys(templatesByCategory).sort();

  // Render agent form with tool drop area
  const renderAgentForm = () => (
    <>
      {/* Worker Template Selection */}
      {!isEditMode && (
        <div className="form-group">
          <label>Worker Template</label>
          <div className="template-selector">
            <select
              value={selectedTemplate}
              onChange={handleTemplateSelect}
              className="form-control"
              style={{ marginBottom: '1rem' }}
              disabled={isEditMode || loadingTemplates}
            >
              <option value="">-- Select a worker template --</option>
              <option value="custom">-- Create Custom Worker --</option>

              {categories.map((category) => {
                const templates = templatesByCategory[category] || [];
                if (templates.length === 0) return null;

                return (
                  <optgroup key={category} label={category}>
                    {templates.map((template) => (
                      <option
                        key={`${template.templateId}-${template.id}`}
                        value={template.id}
                        data-category={category}
                      >
                        {template.name} - {template.description}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>

            {loadingTemplates && (
              <div className="loading-text">
                <i className="fas fa-spinner fa-spin"></i> Loading worker templates...
              </div>
            )}

            {!loadingTemplates && subAgentTemplates.length === 0 && (
              <div className="alert alert-info" style={{ marginTop: '10px' }}>
                <i className="fas fa-info-circle"></i> No worker templates available for this project type. You can create a custom worker instead.
              </div>
            )}
          </div>

          {/* Template Preview */}
          {selectedTemplate && selectedTemplate !== 'custom' && (
            <div className="template-preview" style={{
              marginTop: '15px',
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              borderLeft: '4px solid #007bff',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
              <h6 style={{ marginTop: 0, color: '#007bff' }}>Template Preview</h6>
              <div style={{ marginBottom: '10px' }}>
                <strong>Name:</strong> {agentName}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Category:</strong> {subAgentTemplates.find(t => t.id === selectedTemplate)?.category || 'Uncategorized'}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Description:</strong> {subAgentTemplates.find(t => t.id === selectedTemplate)?.description || 'No description available'}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="form-group">
        <label>Worker Name</label>
        <input
          id="agentName"
          type="text"
          value={agentName}
          placeholder="Enter worker name..."
          onChange={(e) => setAgentName(e.target.value)}
          required
          disabled={isEditMode}
        />
      </div>

      <div className="form-group">
        <label>Tool Type</label>
        <div className="tool-type-selector">
          <div
            className={`tool-type-option ${agentToolType === 'MCP' ? 'selected' : ''}`}
            onClick={() => setAgentToolType('MCP')}
          >
            MCP
          </div>
          <div
            className={`tool-type-option ${agentToolType === 'Custom' ? 'selected' : ''}`}
            onClick={() => setAgentToolType('Custom')}
          >
            Custom
          </div>
        </div>
      </div>

      <div className="form-group">
        <label>Worker Profile</label>
        <textarea
          id="agentPrompt"
          value={agentPrompt}
          placeholder="Enter worker profile..."
          onChange={(e) => setAgentPrompt(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label>Selected Tools</label>
        <div
          ref={setNodeRef}
          className={`selected-tools-container ${isOver ? 'drop-active' : ''}`}
        >
          {selectedTools.length > 0 ? (
            <div className="selected-tools-list">
              {selectedTools.map((tool, index) => (
                <div key={tool.id || index} className="selected-tool-item">
                  <span>{tool.name}</span>
                  <button
                    type="button"
                    className="remove-tool-btn"
                    onClick={() => handleRemoveTool(tool)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="drop-placeholder">
              Drop tools here or enter manually below
            </div>
          )}
        </div>

        <input
          id="tools"
          type="text"
          value={tools}
          placeholder="Or enter tools manually"
          onChange={(e) => setTools(e.target.value)}
        />
      </div>

      {!isEditMode && (
        <div className="form-group">
          <CodeEditor
            language="javascript"
            value={codeSnippet}
            onChange={setCodeSnippet}
          />
        </div>
      )}
    </>
  );

  // Render MSSQL configuration
  const renderMSSQLConfig = () => (
    <div className="mcp-config-section">
      <h3>MSSQL Configuration</h3>
      <div className="form-group">
        <label>SQL Server</label>
        <input
          type="text"
          value={mcpServerConfig.sql_server}
          placeholder="Enter SQL server hostname..."
          onChange={(e) => handleMCPConfigChange('sql_server', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>SQL Database</label>
        <input
          type="text"
          value={mcpServerConfig.sql_database}
          placeholder="Enter SQL database name..."
          onChange={(e) => handleMCPConfigChange('sql_database', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>SQL User</label>
        <input
          type="text"
          value={mcpServerConfig.sql_user}
          placeholder="Enter SQL username..."
          onChange={(e) => handleMCPConfigChange('sql_user', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>SQL Password</label>
        <input
          type="password"
          value={mcpServerConfig.sql_password}
          placeholder="Enter SQL password..."
          onChange={(e) => handleMCPConfigChange('sql_password', e.target.value)}
        />
      </div>

      {/* MCP Tools Display Section */}
      {mcpUrl && (
        <div className="mcp-tools-section">
          <div className="form-group">
            <label>Available MCP Tools</label>

            {loadingMcpTools && (
              <div className="mcp-tools-loading">
                <div className="loading-spinner-small"></div>
                <span>Fetching tools from MCP server...</span>
              </div>
            )}

            {mcpToolsError && (
              <div className="mcp-tools-error">
                <span className="error-icon">⚠️</span>
                <span>{mcpToolsError}</span>
              </div>
            )}

            {!loadingMcpTools && !mcpToolsError && mcpTools.length > 0 && (
              <>
                <div className="mcp-tools-list">
                  {mcpTools.map((tool) => (
                    <div
                      key={tool.id}
                      className={`mcp-tool-item ${selectedMcpTool === tool.id ? 'selected' : ''}`}
                      onClick={() => setSelectedMcpTool(selectedMcpTool === tool.id ? '' : tool.id)}
                    >
                      <div className="mcp-tool-header">
                        <span className="mcp-tool-name">{tool.name}</span>
                        <span className="mcp-tool-type">{tool.type}</span>
                      </div>
                      <div className="mcp-tool-description">{tool.description}</div>
                    </div>
                  ))}
                </div>

                <small className="field-hint">
                  Click on a tool to select it. Found {mcpTools.length} tool{mcpTools.length !== 1 ? 's' : ''} available.
                </small>
              </>
            )}

            {!loadingMcpTools && !mcpToolsError && mcpTools.length === 0 && mcpUrl && (
              <div className="mcp-tools-empty">
                <span>No tools found at this MCP server URL</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Render tool form
  const renderToolForm = () => (
    <>
      <div className="form-group">
        <label>Tool Type</label>
        <div className="tool-type-selector">
          <div
            className={`tool-type-option ${toolType === 'mcp' ? 'selected' : ''}`}
            onClick={() => setToolType('mcp')}
          >
            MCP
          </div>
          <div
            className={`tool-type-option ${toolType === 'custom' ? 'selected' : ''}`}
            onClick={() => setToolType('custom')}
          >
            Custom Tool using LLM
          </div>
        </div>
      </div>

      {toolType === 'mcp' ? (
        <>
          {/* MCP Server Type Dropdown */}
          <div className="form-group">
            <label>MCP Server Type</label>
            <div className="server-type-dropdown">
              <select
                value={selectedMcpServer}
                onChange={(e) => setSelectedMcpServer(e.target.value)}
              >
                <option value="">Select Server Type</option>
                <option value="MSSQL">MSSQL</option>
              </select>
            </div>
          </div>

          {/* MCP Server URL - Single Source of Truth */}
          <div className="form-group">
            <label className="input-label">MCP Server URL</label>
            <div className="input-wrapper">
              <input
                type="url"
                value={mcpUrl}
                className="form-input"
                placeholder="Enter MCP server URL (e.g., http://localhost:8000/mcp)"
                onChange={(e) => handleMcpUrlChange(e.target.value)}
                aria-label="MCP Server URL"
                required
              />
            </div>
            <small className="field-hint">
              Enter the base URL of your MCP server (e.g., http://localhost:8000/mcp)
            </small>
          </div>

          {/* Only show config when MSSQL is selected */}
          {selectedMcpServer === 'MSSQL' && (
            <>
              {renderMSSQLConfig()}

              <div className="form-group">
                <label>API URL (Optional)</label>
                <input
                  type="text"
                  value={apiUrl}
                  placeholder="Enter API URL..."
                  onChange={(e) => setApiUrl(e.target.value)}
                />
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="form-group">
            <label>Tool Name</label>
            <input
              type="text"
              value={toolName}
              placeholder="Enter tool name..."
              onChange={(e) => setToolName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Tool Prompt</label>
            <textarea
              value={toolPrompt}
              placeholder="Enter tool prompt for LLM..."
              onChange={(e) => setToolPrompt(e.target.value)}
              required
            />
          </div>
        </>
      )}

      <div className="form-group">
        <CodeEditor
          language="javascript"
          value={codeSnippet}
          onChange={setCodeSnippet}
        />
      </div>
    </>
  );

  return (
    <div className="middle-pane">
      <h2 className="pane-title">Multi Agent AI</h2>

      <h3 className="section-title">
        {section === 'agents'
          ? isEditMode
            ? 'Edit Agent Prompt'
            : 'Agent Configuration'
          : 'Tool Configuration'}
      </h3>

      <form onSubmit={handleSave}>
        {section === 'agents' ? renderAgentForm() : renderToolForm()}

        <div className="form-actions">
          <button type="submit" className="save-button">
            {isEditMode ? 'Update' : 'Save'}
          </button>

          {isEditMode && (
            <button
              type="button"
              className="cancel-button"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

export default MiddlePane;