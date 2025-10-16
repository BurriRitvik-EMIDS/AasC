import React, { useState, useRef, useEffect } from 'react';
import './styles.css';
import emidsLogo from '../emids-logo.png';
import { useDraggable } from '@dnd-kit/core';
import { handleAgentRemoval, validateAgentRemoval } from '../utils/removeAgent';
import ApiService from '../services/apiservices';

function ToolItem({ tool, index, onSelectItem, onDeleteTool }) {
  // References for tracking drag vs. click
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const dragThreshold = 5; // pixels
  const clickTimeoutRef = useRef(null);
  const [isDragDetected, setIsDragDetected] = useState(false);

  // DnD-kit setup
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tool-${tool.id || index}`,
    data: {
      type: 'tool',
      tool
    }
  });

  // When component unmounts, clear any pending timeouts
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // Create separate handlers for drag vs. click interactions

  // When mouse is pressed down on the tool
  const handleMouseDown = (e) => {
    // Store starting position
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    setIsDragDetected(false);

    // We'll track mouse movement to detect drag
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Prevent default browser behavior
    e.preventDefault();
  };

  // Track mouse movement to detect drag
  const handleMouseMove = (e) => {
    // Calculate distance moved
    const deltaX = Math.abs(e.clientX - dragStartPosRef.current.x);
    const deltaY = Math.abs(e.clientY - dragStartPosRef.current.y);

    // If moved past threshold, consider it a drag
    if (deltaX > dragThreshold || deltaY > dragThreshold) {
      setIsDragDetected(true);
    }
  };

  // Handle delete button click
  const handleDeleteClick = async (e) => {
    e.stopPropagation(); // Prevent triggering the tool selection

    if (window.confirm(`Are you sure you want to delete the tool "${tool.name}"?`)) {
      console.log('Deleting tool:', tool.id);
      if (onDeleteTool) {
        await onDeleteTool(tool.id);
      }
    }
  };

  // When mouse is released
  const handleMouseUp = (e) => {
    // Clean up listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // If no drag was detected, consider it a click
    if (!isDragDetected && !isDragging) {
      console.log('Handling click on tool:', tool.name);
      onSelectItem('tool', tool);
    }

    // Reset drag detection after a short delay
    clickTimeoutRef.current = setTimeout(() => {
      setIsDragDetected(false);
    }, 100);
  };

  // Create a div that serves as a click-only target
  const renderClickableContent = () => (
    <div
      className="click-target"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 'calc(100% - 25px)', // Leave space for drag handle
        height: '100%',
        zIndex: 1,
        cursor: 'pointer'
      }}
      onClick={() => {
        console.log('Direct click on tool name:', tool.name);
        onSelectItem('tool', tool);
      }}
    />
  );

  // Create a drag handle that only responds to drag
  const renderDragHandle = () => (
    <div
      className="drag-handle"
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: '25px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        zIndex: 2,
        touchAction: 'none'
      }}
      {...listeners}
      {...attributes}
    >
      ⠿
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      className={`item tool-item ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'relative',
        borderLeft: '3px solid  #122535',
        backgroundColor: 'white',
        padding: '10px',
        marginBottom: '8px',
        borderRadius: '4px',
        transition: 'all 0.2s ease',
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {/* Clickable area */}
      {renderClickableContent()}

      {/* Content */}
      <div className="item-content" style={{ pointerEvents: 'none', flex: 1 }}>
        <span className="item-name">{tool && tool.name ? String(tool.name) : "Unnamed Tool"}</span>
      </div>

      {/* Delete button */}
      <button
        className="delete-button tool-delete-btn"
        onClick={handleDeleteClick}
        title={`Delete tool: ${tool.name}`}
        style={{
          background: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          margin: '0 5px',
          zIndex: 2,
          pointerEvents: 'auto'
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#dc3545'}
      >
        ×
      </button>

      {/* Drag handle */}
      {renderDragHandle()}
    </div>
  );
}

function AgentItem({ agent, index, isSubagent = false, onSelectItem, onDeleteAgent }) {
  const handleClick = (e) => {
    // Prevent click when clicking on delete button
    if (e.target.closest('.delete-button')) {
      return;
    }
    console.log(`Clicking on agent: ${agent.name} with ID: ${agent.id}`);
    onSelectItem('agent', agent);
  };

  const handleDeleteClick = async (e) => {
    e.stopPropagation(); // Prevent triggering the agent selection

    // Validate if agent can be removed
    const validation = validateAgentRemoval(agent);
    if (!validation.isValid) {
      alert(validation.message);
      return;
    }

    // Handle agent removal with confirmation
    const success = await handleAgentRemoval(
      agent.id,
      agent.name,
      () => {
        // Success callback - notify parent component
        if (onDeleteAgent) {
          onDeleteAgent(agent.id);
        }
      },
      (error) => {
        // Error callback - could refresh or show additional error handling
        console.error('Agent deletion error:', error);
      }
    );
  };

  return (
    <div
      className={`item agent-item ${isSubagent ? 'subagent' : ''}`}
      style={{
        cursor: 'pointer',
        borderLeft: `3px solid ${isSubagent ? '#6c757d' : '#122535'}`,
        backgroundColor: 'white',
        padding: '10px',
        marginBottom: '8px',
        marginLeft: isSubagent ? '20px' : '0',
        borderRadius: '4px',
        transition: 'background-color 0.2s, transform 0.1s',
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
      onClick={handleClick}
    >
      <div className="item-content">
        <span className="item-name">
          {agent && agent.name ? String(agent.name) : "Unnamed Agent"}
        </span>
      </div>

      <button
        className="delete-button agent-delete-btn"
        onClick={handleDeleteClick}
        title={`Delete agent: ${agent.name}`}
        style={{
          background: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          padding: '4px 8px',
          fontSize: '12px',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          marginLeft: '10px',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#c82333'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#dc3545'}
      >
        ×
      </button>
    </div>
  );
}

function LeftPane({ onPlusClick, onSelectItem, agents = [], tools = [], onDeployAgents, onDeleteAgent, onDeleteTool, projectId, onAddTools, currentProject }) {
  // Default to empty arrays if props are undefined
  const agentsList = agents || [];
  const toolsList = tools || [];
  const [isDeploying, setIsDeploying] = useState(false);
  const [mcpUrl, setMcpUrl] = useState('');
  const [isFetchingTools, setIsFetchingTools] = useState(false);
  const [fetchedTools, setFetchedTools] = useState([]);
  const [showFetchedTools, setShowFetchedTools] = useState(false);
  const [isSavingMcp, setIsSavingMcp] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);

  // Function to handle deploy button click
  const handleDeployClick = async () => {
    setIsDeploying(true);
    console.log('Deploying agents...');

    try {
      // First deploy the agents if onDeployAgents is provided
      if (onDeployAgents) {
        try {
          await onDeployAgents();
          console.log('Agents deployed successfully');
        } catch (error) {
          console.error('Failed to deploy agents:', error);
          alert('Failed to deploy agents. Please try again.');
          return;
        }
      }

      // Start the project on its assigned port
      if (projectId) {
        try {
          console.log('Starting project on its assigned port...');
          const startResponse = await ApiService.startProject(projectId);
          console.log('Project started successfully:', startResponse);

          // Get project details to check the port
          const projectDetails = await ApiService.getProject(projectId);
          console.log('Project details after start:', projectDetails);
          const projectPort = projectDetails.port_number || 3000;

          // Check running projects status
          try {
            const runningProjects = await ApiService.getRunningProjects();
            console.log('All running projects:', runningProjects);

            const projectStatus = await ApiService.getProjectStatus(projectId);
            console.log('Project status:', projectStatus);
          } catch (statusError) {
            console.warn('Could not get project status:', statusError);
          }

          console.log(`Waiting for project to start on port ${projectPort}...`);
          await new Promise(resolve => setTimeout(resolve, 5000));

          // Test if the project is actually running
          console.log(`Testing health check at: http://localhost:${projectPort}/health`);
          try {
            const healthCheck = await fetch(`http://localhost:${projectPort}/health`);
            if (healthCheck.ok) {
              const healthData = await healthCheck.json();
              console.log(`✓ Project is running and responding on port ${projectPort}:`, healthData);
            } else {
              console.warn(`⚠ Project started but health check failed on port ${projectPort} (status: ${healthCheck.status})`);
              const responseText = await healthCheck.text();
              console.log('Health check response:', responseText);
            }
          } catch (healthError) {
            console.error(`✗ Project not responding on port ${projectPort}:`, healthError);

            // Try alternative endpoints to debug
            console.log('Testing alternative endpoints...');
            try {
              const rootCheck = await fetch(`http://localhost:${projectPort}/`);
              console.log(`Root endpoint (/) status: ${rootCheck.status}`);
            } catch (rootError) {
              console.log('Root endpoint also failed:', rootError.message);
            }

            try {
              const queryCheck = await fetch(`http://localhost:${projectPort}/agents/supervisor/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'test', session_id: 'test' })
              });
              console.log(`Query endpoint status: ${queryCheck.status}`);
            } catch (queryError) {
              console.log('Query endpoint also failed:', queryError.message);
            }
          }

          // Open chatbot interface in a new tab/window
          const chatbotUrl = `http://localhost:3000/deploy/${projectId}`;
          console.log('Opening chatbot interface at:', chatbotUrl);

          // Open in a new tab
          window.open(chatbotUrl, '_blank');
        } catch (error) {
          console.error('Failed to start project:', error);
          alert(`Failed to start project: ${error.message}`);
          return;
        }
      } else {
        console.warn('No project ID available for deployment');
      }
    } finally {
      setIsDeploying(false);
    }
  };

  // Function to handle agent deletion
  const handleAgentDeletion = (agentId) => {
    console.log(`Agent ${agentId} deleted successfully`);
    // Notify parent component to refresh the agents list
    if (onDeleteAgent) {
      onDeleteAgent(agentId);
    }
  };

  // Function to fetch tools from MCP URL
  const fetchToolsFromMcp = async () => {
    if (!mcpUrl) {
      alert('Please enter a valid MCP URL');
      return;
    }

    setIsFetchingTools(true);
    try {
      // Use API service to fetch MCP tools
      const data = await ApiService.fetchMcpTools(mcpUrl.trim());
      const tools = Array.isArray(data?.tools) ? data.tools : [];

      setFetchedTools(tools);
      setShowFetchedTools(true);
    } catch (error) {
      console.error('Error fetching tools from MCP:', error);
      alert(`Failed to fetch tools: ${error.message}`);
    } finally {
      setIsFetchingTools(false);
    }
  };

  // Function to handle saving MCP tool
  const handleSaveMcpTool = async () => {
    const raw = mcpUrl.trim();
    if (!raw) {
      alert('Please enter a valid MCP URL');
      return;
    }

    setIsSavingMcp(true);
    try {
      let normalizedUrl = raw;
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = `http://${normalizedUrl}`;
      }

      let name = 'MCP Tool';
      try {
        const u = new URL(normalizedUrl);
        name = `MCP: ${u.host}`;
      } catch (_) { }

      const created = await ApiService.createTool({
        projectId,
        toolType: 'mcp',
        name,
        mcpUrl: normalizedUrl,
        mcp_server_config: {}
      });

      if (onAddTools && created) {
        onAddTools([created]);
        setMcpUrl(''); // Clear the input after saving
        setShowFetchedTools(false); // Hide the tools list
        alert('MCP tool saved successfully');
      }
    } catch (err) {
      console.error('Failed to save MCP Tool:', err);
      // alert(`Failed to save MCP Tool: ${err.message}`);
    } finally {
      setIsSavingMcp(false);
    }
  };

  // Function to handle tool click - show details in middle pane
  const handleToolClick = (tool) => {
    setSelectedTool(tool);
    // Pass the tool to the parent component to display in middle pane
    if (onSelectItem) {
      onSelectItem('mcp-tool', tool);
    }
  };

  return (
    <div className="left-pane">
      <div 
        className="left-pane-header"
        onClick={() => {
          // Navigate back to project dashboard
          window.location.href = '/project-dashboard';
        }}
        style={{ cursor: 'pointer' }}
      >
        <img 
          src={emidsLogo} 
          alt="EMIDS Logo" 
          className="emids-logo" 
          style={{ cursor: 'pointer' }}
        />
      </div>

      {/* MCP Tools Section */}
      <div className="section">
        <div className="section-header">
          <h3>MCP Tools</h3>
        </div>
        <div className="section-content" style={{ padding: '10px' }}>
          <div style={{ marginTop: '10px' }}>
            <input
              type="text"
              value={mcpUrl}
              onChange={(e) => setMcpUrl(e.target.value)}
              placeholder="Enter MCP URL"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                marginBottom: '8px'
              }}
            />
            <div style={{ display: 'flex', gap: '5px' }}>
              <button
                onClick={handleSaveMcpTool}
                disabled={isSavingMcp || !mcpUrl.trim()}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: (isSavingMcp || !mcpUrl.trim()) ? 0.6 : 1,
                  pointerEvents: (isSavingMcp || !mcpUrl.trim()) ? 'none' : 'auto',
                  whiteSpace: 'nowrap'
                }}
              >
                {isSavingMcp ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={fetchToolsFromMcp}
                disabled={isFetchingTools || !mcpUrl.trim()}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: (isFetchingTools || !mcpUrl.trim()) ? 0.6 : 1,
                  pointerEvents: (isFetchingTools || !mcpUrl.trim()) ? 'none' : 'auto',
                  whiteSpace: 'nowrap'
                }}
              >
                {isFetchingTools ? 'Fetching...' : 'Fetch Tools'}
              </button>
            </div>
          </div>

          {showFetchedTools && (
            <div style={{ marginTop: '10px' }}>
              <h4>Available Tools ({fetchedTools.length})</h4>
              {fetchedTools.length > 0 ? (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {fetchedTools.map((tool, index) => (
                    <div
                      key={`fetched-${tool.name || index}`}
                      onClick={() => handleToolClick(tool)}
                      style={{
                        padding: '10px',
                        borderBottom: '1px solid #eee',
                        backgroundColor: selectedTool?.name === tool.name ? '#e3f2fd' : '#f9f9f9',
                        marginBottom: '5px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        borderLeft: selectedTool?.name === tool.name ? '3px solid #2196F3' : '3px solid transparent'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedTool?.name !== tool.name) {
                          e.currentTarget.style.backgroundColor = '#f0f0f0';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedTool?.name !== tool.name) {
                          e.currentTarget.style.backgroundColor = '#f9f9f9';
                        }
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {tool.name || `Tool ${index + 1}`}
                      </div>
                      {/* {tool.description && (
                        <div style={{ fontSize: '0.85em', color: '#666' }}>
                          {tool.description.length > 60 
                            ? `${tool.description.substring(0, 57)}...` 
                            : tool.description}
                        </div>
                      )} */}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#666', fontStyle: 'italic', marginTop: '10px' }}>
                  No tools found
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h3>Workers</h3>
          <button
            className="add-button"
            onClick={() => onPlusClick('agents', currentProject)}
          >
            +
          </button>
        </div>
        <div className="section-content">
          {agentsList.length > 0 ? (
            agentsList.map((agent, index) => {
              // Check if this is a subagent (you might need to adjust this condition based on your data structure)
              const isSubagent = agent.is_subagent || agent.parent_agent_id;

              return (
                <AgentItem
                  key={agent.id || index}
                  agent={agent}
                  index={index}
                  isSubagent={isSubagent}
                  onSelectItem={onSelectItem}
                  onDeleteAgent={handleAgentDeletion}
                />
              );
            })
          ) : (
            <div className="empty-message">No workers added yet</div>
          )}
        </div>
      </div>

      {/* <div className="section">
        <div className="section-header">
          <h3>Tools</h3>
          <button
            className="add-button"
            onClick={() => onPlusClick('tools')}
          >
            +
          </button>
        </div>
        <div className="section-content">
          {toolsList.length > 0 ? (
            toolsList.map((tool, index) => (
              <ToolItem
                key={tool.id || index}
                tool={tool}
                index={index}
                onSelectItem={onSelectItem}
                onDeleteTool={onDeleteTool}
              />
            ))
          ) : (
            <div className="empty-message">No tools added yet</div>
          )}
        </div>
      </div> */}

      {/* Deploy Agents Button */}
      <div className="deploy-container">
        <button
          className={`deploy-button ${isDeploying ? 'deploying' : ''}`}
          onClick={handleDeployClick}
          disabled={isDeploying}
        >
          {isDeploying ? (
            <span className="button-content">
              <span className="spinner"></span>
              <span>Deploying...</span>
            </span>
          ) : (
            <span className="button-content">
              <span className="icon">🚀</span>
              <span>Deploy & Start</span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export default LeftPane;