import React, { useState, useEffect, useCallback } from 'react';
import ApiService from '../services/apiservices';
import emidsLogo from '../white_logo-updated.png';
import CodeEditor from './codeeditor'; // Assuming you have a CodeEditor component

function ProjectSetupPage({ projectDetails, onSave, isEditMode = false }) {
  // Form state
  const [formData, setFormData] = useState({
    projectName: projectDetails?.projectName || '',
    supervisorPrompt: projectDetails?.supervisorPrompt || '',
    finalResponsePrompt: projectDetails?.finalResponsePrompt || '',
    modelProvider: projectDetails?.modelProvider || 'azure-openai',
    apiKey: projectDetails?.apiKey || '',
    apiUrl: projectDetails?.apiUrl || '',
    selectedTemplate: projectDetails?.selectedTemplate || '',
    selectedSubAgents: projectDetails?.selectedSubAgents || []
  });

  // Template management
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentToolType, setAgentToolType] = useState('MCP');
  const [selectedTools, setSelectedTools] = useState([]);
  const [tools, setTools] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [mcpServerConfig, setMcpServerConfig] = useState({
    sql_server: '',
    sql_database: '',
    sql_user: '',
    sql_password: ''
  });
  const [subAgents, setSubAgents] = useState([]);
  const [isCustomWorker, setIsCustomWorker] = useState(false);
  const [agentName, setAgentName] = useState('');
  
  // Load templates on component mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [templatesData, categoriesData] = await Promise.all([
          ApiService.getAgentTemplates(),
          ApiService.getTemplateCategories()
        ]);
        
        setTemplates(templatesData || []);
        setCategories(categoriesData || []);
      } catch (err) {
        console.error('Error loading templates:', err);
        setError('Failed to load templates. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    loadTemplates();
  }, []);
  
  // Handle template selection
  const handleTemplateSelect = async (templateId) => {
    if (templateId === 'custom') {
      // Reset form for custom project
      setFormData(prev => ({
        ...prev,
        selectedTemplate: 'custom',
        projectName: '',
        supervisorPrompt: '',
        finalResponsePrompt: ''
      }));
      return;
    }
    
    if (!templateId) {
      setFormData(prev => ({
        ...prev,
        selectedTemplate: '',
        projectName: '',
        supervisorPrompt: '',
        finalResponsePrompt: ''
      }));
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const selectedTemplate = templates.find(t => t.id === templateId);
      if (!selectedTemplate) return;
      
      // Auto-populate project name and prompts
      const updatedFormData = {
        selectedTemplate: templateId,
        projectName: selectedTemplate.name || '',
        supervisorPrompt: selectedTemplate.orchestrator_prompt || '',
        finalResponsePrompt: selectedTemplate.final_response_prompt || ''
      };
      
      setFormData(prev => ({
        ...prev,
        ...updatedFormData
      }));
      
      // Load sub-agents for the selected template
      try {
        const subAgentsData = await ApiService.getSubAgents(templateId);
        setSubAgents(subAgentsData || []);
      } catch (err) {
        console.error('Error loading sub-agents:', err);
        setSubAgents([]);
      }
      
    } catch (err) {
      console.error('Error loading template details:', err);
      setError('Failed to load template details. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle worker template selection
  const handleWorkerTemplateSelect = (selectedId) => {
    if (selectedId === 'custom') {
      setIsCustomWorker(true);
      setAgentName('');
      setAgentPrompt('');
    } else {
      setIsCustomWorker(false);
      const selectedTemplate = subAgents.find(t => t.id === selectedId);
      if (selectedTemplate) {
        setAgentName(selectedTemplate.name);
        setAgentPrompt(selectedTemplate.worker_prompt || '');
      }
    }
  };
  
  // Handle custom worker name change
  const handleCustomWorkerNameChange = (e) => {
    setAgentName(e.target.value);
  };
  
  // Handle MCP config changes
  const handleMCPConfigChange = (field, value) => {
    setMcpServerConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Handle tool selection
  const handleRemoveTool = (toolToRemove) => {
    setSelectedTools(prev => prev.filter(tool => tool.id !== toolToRemove.id));
  };
  
  // Get unique template names (without categories)
  const templateOptions = React.useMemo(() => {
    if (!Array.isArray(templates)) return [];
    
    // Create a map to ensure unique template names
    const uniqueTemplates = new Map();
    templates.forEach(template => {
      if (template.name && !uniqueTemplates.has(template.name)) {
        uniqueTemplates.set(template.name, template);
      }
    });
    
    return Array.from(uniqueTemplates.values());
  }, [templates]);
  
  // Get the currently selected template
  const selectedTemplate = React.useMemo(() => {
    if (!formData.selectedTemplate || formData.selectedTemplate === 'custom') return null;
    return templates.find(t => t.id === formData.selectedTemplate);
  }, [formData.selectedTemplate, templates]);
  
  // Get sub-agents for the selected template
  const subAgentOptions = React.useMemo(() => {
    if (!Array.isArray(subAgents)) return [];
    return subAgents.map(agent => ({
      id: agent.id,
      name: agent.name,
      prompt: agent.worker_prompt || ''
    }));
  }, [subAgents]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
    
    // If template select changed, handle template selection
    if (name === 'selectedTemplate') {
      handleTemplateSelect(value);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  // Define model providers
  const modelProviders = [
    { value: 'azure-openai', label: 'Azure OpenAI' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'google-gemini', label: 'Google Gemini' },
    { value: 'anthropic', label: 'Anthropic Claude' }
  ];

  // Add CSS animation for spinner
  const spinnerStyle = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  return (
    <div className="app-container">
      <style>{spinnerStyle}</style>
      <header style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
        padding: '0.75rem 2rem',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.5rem 0.75rem 0.5rem 0.5rem',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.2s ease'
          }}>
            <img
              src={emidsLogo}
              alt="EMIDS Logo"
              style={{
                height: '36px',
                width: 'auto',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25))',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            />
          </div>
        </div>

        <h1 style={{
          margin: 0,
          fontSize: '1.5rem',
          fontWeight: '700',
          letterSpacing: '0.5px',
          color: '#ffffff',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
          textAlign: 'center',
          justifySelf: 'center'
        }}>
          Agent As Code
        </h1>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => onSave && onSave({ ...formData, navigateToDashboard: true })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              color: 'white',
              fontWeight: '500',
              fontSize: '0.9375rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backdropFilter: 'blur(4px)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Dashboard
          </button>
        </div>
      </header>

      <div style={{
        padding: '1rem 2rem 2rem',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        flex: '1',
        overflowY: 'auto'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          padding: '2.5rem',
          marginBottom: '2rem',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            padding: '0 1rem'
          }}>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: '#1f2937',
              marginBottom: '0.75rem',
              lineHeight: '1.2'
            }}>Project Setup</h1>
            <p style={{
              fontSize: '1.125rem',
              color: '#6b7280',
              marginBottom: '0',
              lineHeight: '1.6'
            }}>Configure your Multi-Agent AI project settings and prompts</p>
            <div style={{
              height: '4px',
              width: '80px',
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              margin: '1.5rem auto 0',
              borderRadius: '2px',
              opacity: '0.8'
            }}></div>
          </div>

          <form onSubmit={handleSubmit} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem'
          }}>
            {/* Template Selection Section */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#1a202c',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                Agent Template
              </h2>
              
              {loading ? (
                <div style={{ textAlign: 'center', padding: '1rem' }}>Loading templates...</div>
              ) : error ? (
                <div style={{ color: '#e53e3e', padding: '1rem', background: '#fff5f5', borderRadius: '0.5rem' }}>
                  {error}
                </div>
              ) : (
                <>
                  {/* Template Selector */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor="templateSelect" style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: '#4a5568'
                    }}>
                      Select a template
                    </label>
                    <select
                      id="templateSelect"
                      value={formData.selectedTemplate}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #d1d5db',
                        fontSize: '0.875rem',
                        color: '#1f2937',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                        ':focus': {
                          borderColor: '#3b82f6',
                          boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.5)'
                        }
                      }}
                    >
                      <option value="">-- Select a template --</option>
                      {templateOptions.map(template => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                      <option value="custom">-- Create Custom --</option>
                    </select>
                  </div>
                  
                  {/* Sub-agents will be added in the MiddlePane after project creation */}
                </>
              )}
            </div>
            
            {/* Project Information Section */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              <h3 style={{
                margin: '0 0 1.5rem 0',
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <div style={{
                  background: '#3b82f6',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </div>
                Project Information
              </h3>
              
              <div style={{
                display: 'grid',
                gap: '1.25rem',
                maxWidth: '800px'
              }}>
                <div>
                  <label htmlFor="projectName" style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: '#475569',
                    fontSize: '0.9375rem',
                    textAlign: 'left'
                  }}>Project Name</label>
                  <div style={{
                    position: 'relative',
                    borderRadius: '0.5rem',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="text"
                      id="projectName"
                      name="projectName"
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem 0.75rem 2.5rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.9375rem',
                        color: '#1e293b',
                        backgroundColor: 'white',
                        transition: 'all 0.2s',
                        boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6';
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1), inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)';
                      }}
                      value={formData.projectName}
                      onChange={handleChange}
                      required
                      placeholder="Enter your project name"
                    />
                    <div style={{
                      position: 'absolute',
                      left: '1rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#94a3b8',
                      pointerEvents: 'none'
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Prompts Section - Side by Side */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1.5rem',
              marginBottom: '1rem'
            }}>
              {/* Orchestrator Prompt */}
              <div style={{
                background: 'white',
                borderRadius: '0.75rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
                overflow: 'hidden',
                transition: 'all 0.2s',
                ':hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }
              }}>
                <div style={{
                  background: 'linear-gradient(to right, #f0f9ff, #e0f2fe)',
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid #e0f2fe',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <div style={{
                    background: '#0ea5e9',
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '0.75rem',
                    flexShrink: 0
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  </div>
                  <h4 style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#0369a1'
                  }}>Orchestrator Prompt</h4>
                </div>
                <div style={{ padding: '1.25rem' }}>
                  <div style={{
                    position: 'relative',
                    borderRadius: '0.5rem',
                    overflow: 'hidden'
                  }}>
                    <textarea
                      id="supervisorPrompt"
                      name="supervisorPrompt"
                      style={{
                        width: '100%',
                        minHeight: '200px',
                        padding: '0.875rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.9375rem',
                        lineHeight: '1.5',
                        color: '#334155',
                        backgroundColor: '#f8fafc',
                        transition: 'all 0.2s',
                        resize: 'vertical',
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#0ea5e9';
                        e.target.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.1), inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)';
                        e.target.style.backgroundColor = 'white';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)';
                        e.target.style.backgroundColor = '#f8fafc';
                      }}
                      placeholder="Define how the orchestrator should manage the workflow..."
                      rows="6"
                      value={formData.supervisorPrompt}
                      onChange={handleChange}
                      required
                    ></textarea>
                    <div style={{
                      position: 'absolute',
                      bottom: '0.75rem',
                      right: '0.75rem',
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      backgroundColor: 'rgba(248, 250, 252, 0.8)',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '4px',
                      pointerEvents: 'none'
                    }}>
                      {formData.supervisorPrompt.length} characters
                    </div>
                  </div>
                </div>
              </div>

              {/* Final Response Prompt */}
              <div style={{
                background: 'white',
                borderRadius: '0.75rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
                overflow: 'hidden',
                transition: 'all 0.2s',
                ':hover': {
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }
              }}>
                <div style={{
                  background: 'linear-gradient(to right, #f5f3ff, #ede9fe)',
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid #ede9fe',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  <div style={{
                    background: '#8b5cf6',
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '0.75rem',
                    flexShrink: 0
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <h4 style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#6d28d9'
                  }}>Final Response Prompt</h4>
                </div>
                <div style={{ padding: '1.25rem' }}>
                  <div style={{
                    position: 'relative',
                    borderRadius: '0.5rem',
                    overflow: 'hidden'
                  }}>
                    <textarea
                      id="finalResponsePrompt"
                      name="finalResponsePrompt"
                      style={{
                        width: '100%',
                        minHeight: '200px',
                        padding: '0.875rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.9375rem',
                        lineHeight: '1.5',
                        color: '#334155',
                        backgroundColor: '#f8fafc',
                        transition: 'all 0.2s',
                        resize: 'vertical',
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#8b5cf6';
                        e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1), inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)';
                        e.target.style.backgroundColor = 'white';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.03)';
                        e.target.style.backgroundColor = '#f8fafc';
                      }}
                      placeholder="Define how the final response should be formatted..."
                      rows="6"
                      value={formData.finalResponsePrompt}
                      onChange={handleChange}
                      required
                    ></textarea>
                    <div style={{
                      position: 'absolute',
                      bottom: '0.75rem',
                      right: '0.75rem',
                      fontSize: '0.75rem',
                      color: '#94a3b8',
                      backgroundColor: 'rgba(248, 250, 252, 0.8)',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '4px',
                      pointerEvents: 'none'
                    }}>
                      {formData.finalResponsePrompt.length} characters
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Selection Section */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              <h3 style={{
                margin: '0 0 1.5rem 0',
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <div style={{
                  background: '#8b5cf6',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.29 7 12 12 20.71 7"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                </div>
                Model Selection
              </h3>
              <div style={{
                display: 'grid',
                gap: '1.25rem',
                maxWidth: '800px'
              }}>
                <div>
                  <label htmlFor="modelProvider" style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: '#475569',
                    fontSize: '0.9375rem',
                    textAlign: 'left'
                  }}>Select Model</label>
                  <div className="select-wrapper">
                    <select
                      id="modelProvider"
                      name="modelProvider"
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.9375rem',
                        color: '#1e293b',
                        backgroundColor: 'white',
                        appearance: 'none',
                        backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%2394a3b8\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")',
                        backgroundPosition: 'right 0.75rem center',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: '1.25em 1.25em',
                        paddingRight: '2.5rem',
                        transition: 'all 0.2s',
                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#8b5cf6';
                        e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.03)';
                      }}
                      value={formData.modelProvider}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select Model</option>
                      {modelProviders.map(provider => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* API Configuration Section */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#1e293b',
                margin: '0 0 1.5rem 0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <div style={{
                  background: '#8b5cf6',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.29 7 12 12 20.71 7"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                </div>
                API Configuration
              </h3>
              <div style={{
                display: 'grid',
                gap: '1.25rem',
                maxWidth: '800px'
              }}>
                <div>
                  <label htmlFor="apiKey" style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: '#475569',
                    fontSize: '0.9375rem',
                    textAlign: 'left'
                  }}>API Key</label>
                  <input
                    type="password"
                    id="apiKey"
                    name="apiKey"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '0.9375rem',
                      color: '#1e293b',
                      backgroundColor: 'white',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#8b5cf6';
                      e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e2e8f0';
                      e.target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.03)';
                    }}
                    value={formData.apiKey}
                    onChange={handleChange}
                    required
                    placeholder={`Enter your ${formData.modelProvider || 'API'} key`}
                  />
                </div>

                <div>
                  <label htmlFor="apiUrl" style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '500',
                    color: '#475569',
                    fontSize: '0.9375rem',
                    textAlign: 'left'
                  }}>API Endpoint URL</label>
                <input
                  type="text"
                  id="apiUrl"
                  name="apiUrl"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    color: '#111827',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                  value={formData.apiUrl}
                  onChange={handleChange}
                  placeholder={`Enter the ${formData.modelProvider} endpoint URL (if required)`}
                />
              </div>
            </div>
          </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: '2rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid #e5e7eb'
            }}>
              <button
                type="submit"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.3), 0 2px 4px -1px rgba(59, 130, 246, 0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                }}
              >
                Save Configuration
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ProjectSetupPage;