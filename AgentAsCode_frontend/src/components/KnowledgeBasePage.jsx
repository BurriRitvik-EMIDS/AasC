import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './styles.css';

function KnowledgeBasePage({ onBack }) {
  const API_ENDPOINT = 'http://localhost:8002/query';

  const [activeTool, setActiveTool] = useState('list_projects');
  const [isLoading, setIsLoading] = useState(false);
  const [resultText, setResultText] = useState('');
  const [isMarkdownContent, setIsMarkdownContent] = useState(false);
  const [showRawContent, setShowRawContent] = useState(false);

  // Form states
  const [checkProjectName, setCheckProjectName] = useState('');
  const [listLibrariesProject, setListLibrariesProject] = useState('');
  const [statsProject, setStatsProject] = useState('');
  const [statsLibrary, setStatsLibrary] = useState('');
  const [statsVersion, setStatsVersion] = useState('');
  const [scrapeProject, setScrapeProject] = useState('');
  const [scrapeLibrary, setScrapeLibrary] = useState('');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeVersion, setScrapeVersion] = useState('');
  const [scrapeContentType, setScrapeContentType] = useState('docs');
  const [scrapeMaxPages, setScrapeMaxPages] = useState(50);
  const [scrapeMaxDepth, setScrapeMaxDepth] = useState(2);
  const [scrapeScope, setScrapeScope] = useState('subpages');
  const [searchProject, setSearchProject] = useState('');
  const [searchLibrary, setSearchLibrary] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVersion, setSearchVersion] = useState('');
  const [searchContentType, setSearchContentType] = useState('docs');
  const [searchLimit, setSearchLimit] = useState(5);
  const [versionProject, setVersionProject] = useState('');
  const [versionLibrary, setVersionLibrary] = useState('');
  const [versionContentType, setVersionContentType] = useState('docs');
  const [versionTarget, setVersionTarget] = useState('');
  const [removeProject, setRemoveProject] = useState('');
  const [removeLibrary, setRemoveLibrary] = useState('');
  const [removeVersion, setRemoveVersion] = useState('');
  const [removeContentType, setRemoveContentType] = useState('docs');
  const [fetchUrlInput, setFetchUrlInput] = useState('');
  const [fetchProject, setFetchProject] = useState('');
  const [fetchContentType, setFetchContentType] = useState('docs');

  // Autofill project name fields from the current project context
  useEffect(() => {
    try {
      const current = window.currentProject || {};
      const name = current.projectName || current.project_name || current.name || '';
      if (!name) return;

      // Only prefill if the field is empty, to preserve user edits
      setCheckProjectName(prev => prev || name);
      setListLibrariesProject(prev => prev || name);
      setStatsProject(prev => prev || name);
      setScrapeProject(prev => prev || name);
      setSearchProject(prev => prev || name);
      setVersionProject(prev => prev || name);
      setRemoveProject(prev => prev || name);
      setFetchProject(prev => prev || name);
    } catch (e) {
      // no-op: safe guard in case window is unavailable in some environments
    }
  }, []);

  const sidebarTools = useMemo(() => ([
    {
      group: 'Discovery', items: [
        { id: 'list_projects', label: 'List Projects' },
        { id: 'check_project', label: 'Check Project' },
        { id: 'list_libraries', label: 'List Libraries' },
        { id: 'detailed_stats', label: 'Detailed Stats' }
      ]
    },
    {
      group: 'Indexing', items: [
        { id: 'scrape_docs', label: 'Scrape Docs' },
        { id: 'fetch_url', label: 'Fetch URL' }
      ]
    },
    {
      group: 'Search', items: [
        { id: 'search_docs', label: 'Search Docs' },
        { id: 'find_version', label: 'Find Version' }
      ]
    },
    {
      group: 'Management', items: [
        { id: 'remove_docs', label: 'Remove Docs' }
      ]
    }
  ]), []);

  const buildPromptForTool = (toolName, params) => {
    switch (toolName) {
      case 'list_projects':
        return 'List all projects';
      case 'check_project':
        return `Check if project "${params.project}" exists and show its libraries`;
      case 'list_libraries':
        return params.project ?
          `List all libraries in project "${params.project}"` :
          'List all libraries across all projects';
      case 'detailed_stats': {
        const filters = [];
        if (params.project) filters.push(`project="${params.project}"`);
        if (params.library) filters.push(`library="${params.library}"`);
        if (params.version) filters.push(`version="${params.version}"`);
        return `Show detailed statistics${filters.length > 0 ? ' for ' + filters.join(', ') : ''}`;
      }
      case 'scrape_docs':
        return `Scrape documentation for library "${params.library}" from ${params.url} into project "${params.project}"${params.version ? ` version ${params.version}` : ''}`;
      case 'search_docs':
        return `Search for "${params.query}" in library "${params.library}" of project "${params.project}"${params.version ? ` version ${params.version}` : ''}`;
      case 'find_version':
        return `Find ${params.targetVersion || 'latest'} version of library "${params.library}" in project "${params.project}"`;
      case 'remove_docs':
        return `Remove documentation for library "${params.library}" from project "${params.project}"${params.version ? ` version ${params.version}` : ' (all versions)'}`;
      case 'fetch_url':
        return `Fetch content from ${params.url}`;
      default:
        return JSON.stringify(params);
    }
  };

  // Helper function to detect if content is markdown
  const isMarkdown = (text) => {
    if (!text || typeof text !== 'string') return false;

    // If it's very short (less than 100 chars), probably not markdown content
    if (text.length < 100) return false;

    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s+.+$/m,           // Headings: # Heading
      /\[.+\]\(.+\)/,              // Links: [text](url)
      /```[\s\S]*?```/,            // Code blocks: ```code```
      /^\s*[-*+]\s+.+$/m,          // Unordered lists: - item
      /^\s*\d+\.\s+.+$/m,          // Ordered lists: 1. item
      /^\s*>\s+.+$/m,              // Blockquotes: > quote
      /\*\*[^*]+\*\*/,             // Bold: **text**
      /`[^`]+`/,                   // Inline code: `code`
      /^\s*\|.+\|.+\|$/m,          // Tables: | col | col |
      /^---+$/m,                   // Horizontal rules
      /\n\n/,                      // Multiple line breaks (common in markdown)
    ];

    // Count how many patterns match
    let matchCount = 0;
    for (const pattern of markdownPatterns) {
      if (pattern.test(text)) {
        matchCount++;
      }
    }

    // If at least 1 markdown pattern is found, consider it markdown
    // (lowered threshold for better detection)
    return matchCount >= 1;
  };

  const executeTool = async (toolName, params) => {
    setIsLoading(true);
    setResultText('');
    setIsMarkdownContent(false);
    setShowRawContent(false);
    try {
      const prompt = buildPromptForTool(toolName, params);
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: prompt })
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const result = data.result || JSON.stringify(data, null, 2);
      setResultText(result);

      // Detect if this is markdown content
      if (toolName === 'fetch_url' && result && !result.startsWith('Failed') && !result.startsWith('Error')) {
        // For fetch_url, always try to render as markdown unless it's clearly an error
        setIsMarkdownContent(true);
      }
    } catch (error) {
      setResultText(`Error: ${error.message}\n\nMake sure:\n1. MCP server is running on http://localhost:8009\n2. API server is running: python main.py`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="panes-container" style={{ flexDirection: 'column' }}>
        <div className="middle-pane">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="pane-title" style={{ marginBottom: 0 }}>Knowledge Base Configuration</h2>
            <button className="save-button" onClick={onBack}>Back to Project</button>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              padding: 16,
              borderRadius: 8,
              marginBottom: 16
            }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Docs-MCP Tool Interface</div>
              <div style={{ opacity: 0.9 }}>Scrape, index, search, and manage documentation with MCP tools</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 0, minHeight: 600 }}>
              {/* Sidebar */}
              <div style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', borderRight: 'none', padding: 16 }}>
                {sidebarTools.map(section => (
                  <div key={section.group} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', marginBottom: 8, fontWeight: 600 }}>{section.group}</div>
                    {section.items.map(item => (
                      <button
                        key={item.id}
                        className={`tool-btn ${activeTool === item.id ? 'active' : ''}`}
                        onClick={() => { setActiveTool(item.id); setResultText(''); }}
                        style={{
                          display: 'block', width: '100%', padding: 12, marginBottom: 8,
                          background: activeTool === item.id ? '#667eea' : 'white',
                          color: activeTool === item.id ? 'white' : 'inherit',
                          border: '1px solid #ddd', borderRadius: 6, textAlign: 'left', cursor: 'pointer'
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              {/* Main Area */}
              <div style={{ border: '1px solid #e0e0e0', padding: 20 }}>
                {/* List Projects */}
                {activeTool === 'list_projects' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>📂 List Projects</h3>
                    <p style={{ margin: '12px 0', color: '#666' }}>View all projects and their libraries with statistics.</p>
                    <button className="save-button" onClick={() => executeTool('list_projects', {})}>List All Projects</button>
                  </div>
                )}

                {/* Check Project */}
                {activeTool === 'check_project' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>✅ Check Project</h3>
                    <div className="form-group">
                      <label>Project Name *</label>
                      <input type="text" value={checkProjectName} onChange={e => setCheckProjectName(e.target.value)} placeholder="e.g., MyProject" />
                    </div>
                    <button className="save-button" onClick={() => {
                      if (!checkProjectName) { alert('Please enter a project name'); return; }
                      executeTool('check_project', { project: checkProjectName });
                    }}>Check Project</button>
                  </div>
                )}

                {/* List Libraries */}
                {activeTool === 'list_libraries' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>📚 List Libraries</h3>
                    <div className="form-group">
                      <label>Project Name (optional)</label>
                      <input type="text" value={listLibrariesProject} onChange={e => setListLibrariesProject(e.target.value)} placeholder="Leave empty to see all libraries" />
                      <small>Filter libraries by project or leave empty to see all</small>
                    </div>
                    <button className="save-button" onClick={() => executeTool('list_libraries', listLibrariesProject ? { project: listLibrariesProject } : {})}>List Libraries</button>
                  </div>
                )}

                {/* Detailed Stats */}
                {activeTool === 'detailed_stats' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>📊 Detailed Statistics</h3>
                    <div className="form-group">
                      <label>Project (optional)</label>
                      <input type="text" value={statsProject} onChange={e => setStatsProject(e.target.value)} placeholder="Filter by project" />
                    </div>
                    <div className="form-group">
                      <label>Library (optional)</label>
                      <input type="text" value={statsLibrary} onChange={e => setStatsLibrary(e.target.value)} placeholder="Filter by library" />
                    </div>
                    <div className="form-group">
                      <label>Version (optional)</label>
                      <input type="text" value={statsVersion} onChange={e => setStatsVersion(e.target.value)} placeholder="Filter by version" />
                    </div>
                    <button className="save-button" onClick={() => executeTool('detailed_stats', { project: statsProject || undefined, library: statsLibrary || undefined, version: statsVersion || undefined })}>Get Statistics</button>
                  </div>
                )}

                {/* Scrape Docs */}
                {activeTool === 'scrape_docs' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>🌐 Scrape Documentation</h3>
                    <div className="form-group">
                      <label>Project Name *</label>
                      <input type="text" value={scrapeProject} onChange={e => setScrapeProject(e.target.value)} placeholder="e.g., MyProject" />
                    </div>
                    <div className="form-group">
                      <label>Library Name *</label>
                      <input type="text" value={scrapeLibrary} onChange={e => setScrapeLibrary(e.target.value)} placeholder="e.g., react, fastapi" />
                    </div>
                    <div className="form-group">
                      <label>Documentation URL *</label>
                      <input type="url" value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} placeholder="https://docs.example.com" />
                    </div>
                    <div className="form-group">
                      <label>Version (optional)</label>
                      <input type="text" value={scrapeVersion} onChange={e => setScrapeVersion(e.target.value)} placeholder="e.g., 18.2, 1.0" />
                    </div>
                    <div className="form-group">
                      <label>Content Type</label>
                      <select value={scrapeContentType} onChange={e => setScrapeContentType(e.target.value)}>
                        <option value="docs">docs</option>
                        <option value="api">api</option>
                        <option value="tutorials">tutorials</option>
                        <option value="guides">guides</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Max Pages</label>
                      <input type="number" min="1" value={scrapeMaxPages} onChange={e => setScrapeMaxPages(Number(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>Max Depth</label>
                      <input type="number" min="0" value={scrapeMaxDepth} onChange={e => setScrapeMaxDepth(Number(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>Crawl Scope</label>
                      <select value={scrapeScope} onChange={e => setScrapeScope(e.target.value)}>
                        <option value="subpages">Subpages</option>
                        <option value="hostname">Hostname</option>
                        <option value="domain">Domain</option>
                      </select>
                    </div>
                    <button className="save-button" onClick={() => {
                      if (!scrapeProject || !scrapeLibrary || !scrapeUrl) { alert('Please fill in all required fields'); return; }
                      executeTool('scrape_docs', {
                        project: scrapeProject,
                        library: scrapeLibrary,
                        url: scrapeUrl,
                        version: scrapeVersion || null,
                        content_type: scrapeContentType,
                        maxPages: scrapeMaxPages,
                        maxDepth: scrapeMaxDepth,
                        scope: scrapeScope,
                        followRedirects: true
                      });
                    }}>Start Scraping</button>
                  </div>
                )}

                {/* Search Docs */}
                {activeTool === 'search_docs' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>🔎 Search Documentation</h3>
                    <div className="form-group">
                      <label>Project Name *</label>
                      <input type="text" value={searchProject} onChange={e => setSearchProject(e.target.value)} placeholder="e.g., MyProject" />
                    </div>
                    <div className="form-group">
                      <label>Library Name *</label>
                      <input type="text" value={searchLibrary} onChange={e => setSearchLibrary(e.target.value)} placeholder="e.g., react" />
                    </div>
                    <div className="form-group">
                      <label>Search Query *</label>
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="e.g., authentication middleware" />
                    </div>
                    <div className="form-group">
                      <label>Version (optional)</label>
                      <input type="text" value={searchVersion} onChange={e => setSearchVersion(e.target.value)} placeholder="Specific version to search" />
                    </div>
                    <div className="form-group">
                      <label>Content Type</label>
                      <select value={searchContentType} onChange={e => setSearchContentType(e.target.value)}>
                        <option value="docs">docs</option>
                        <option value="api">api</option>
                        <option value="tutorials">tutorials</option>
                        <option value="guides">guides</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Result Limit</label>
                      <input type="number" min="1" max="20" value={searchLimit} onChange={e => setSearchLimit(Number(e.target.value))} />
                    </div>
                    <button className="save-button" onClick={() => {
                      if (!searchProject || !searchLibrary || !searchQuery) { alert('Please fill in all required fields'); return; }
                      executeTool('search_docs', {
                        project: searchProject,
                        library: searchLibrary,
                        query: searchQuery,
                        version: searchVersion || null,
                        content_type: searchContentType,
                        limit: searchLimit
                      });
                    }}>Search</button>
                  </div>
                )}

                {/* Find Version */}
                {activeTool === 'find_version' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>🏷️ Find Version</h3>
                    <div className="form-group">
                      <label>Project Name *</label>
                      <input type="text" value={versionProject} onChange={e => setVersionProject(e.target.value)} placeholder="e.g., MyProject" />
                    </div>
                    <div className="form-group">
                      <label>Library Name *</label>
                      <input type="text" value={versionLibrary} onChange={e => setVersionLibrary(e.target.value)} placeholder="e.g., react" />
                    </div>
                    <div className="form-group">
                      <label>Content Type</label>
                      <select value={versionContentType} onChange={e => setVersionContentType(e.target.value)}>
                        <option value="docs">docs</option>
                        <option value="api">api</option>
                        <option value="tutorials">tutorials</option>
                        <option value="guides">guides</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Target Version (optional)</label>
                      <input type="text" value={versionTarget} onChange={e => setVersionTarget(e.target.value)} placeholder="e.g., 18.x, latest" />
                    </div>
                    <button className="save-button" onClick={() => {
                      if (!versionProject || !versionLibrary) { alert('Please fill in all required fields'); return; }
                      executeTool('find_version', {
                        project: versionProject,
                        library: versionLibrary,
                        content_type: versionContentType,
                        targetVersion: versionTarget || null
                      });
                    }}>Find Version</button>
                  </div>
                )}

                {/* Remove Docs */}
                {activeTool === 'remove_docs' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>🗑️ Remove Documentation</h3>
                    <div className="form-group">
                      <label>Project Name *</label>
                      <input type="text" value={removeProject} onChange={e => setRemoveProject(e.target.value)} placeholder="e.g., MyProject" />
                    </div>
                    <div className="form-group">
                      <label>Library Name *</label>
                      <input type="text" value={removeLibrary} onChange={e => setRemoveLibrary(e.target.value)} placeholder="e.g., react" />
                    </div>
                    <div className="form-group">
                      <label>Version (optional)</label>
                      <input type="text" value={removeVersion} onChange={e => setRemoveVersion(e.target.value)} placeholder="Remove specific version only" />
                      <small>Leave empty to remove all versions</small>
                    </div>
                    <div className="form-group">
                      <label>Content Type</label>
                      <select value={removeContentType} onChange={e => setRemoveContentType(e.target.value)}>
                        <option value="docs">docs</option>
                        <option value="api">api</option>
                        <option value="tutorials">tutorials</option>
                        <option value="guides">guides</option>
                      </select>
                    </div>
                    <button className="save-button" onClick={() => {
                      if (!removeProject || !removeLibrary) { alert('Please fill in all required fields'); return; }
                      if (!window.confirm('Are you sure you want to remove this documentation?')) { return; }
                      executeTool('remove_docs', {
                        project: removeProject,
                        library: removeLibrary,
                        version: removeVersion || null,
                        content_type: removeContentType
                      });
                    }}>Remove Documentation</button>
                  </div>
                )}

                {/* Fetch URL */}
                {activeTool === 'fetch_url' && (
                  <div>
                    <h3 style={{ marginBottom: 12 }}>🌐 Fetch URL</h3>
                    <div className="form-group">
                      <label>URL *</label>
                      <input type="url" value={fetchUrlInput} onChange={e => setFetchUrlInput(e.target.value)} placeholder="https://example.com" />
                    </div>
                    <div className="form-group">
                      <label>Project Context *</label>
                      <input type="text" value={fetchProject} onChange={e => setFetchProject(e.target.value)} placeholder="e.g., MyProject" />
                    </div>
                    <div className="form-group">
                      <label>Content Type</label>
                      <select value={fetchContentType} onChange={e => setFetchContentType(e.target.value)}>
                        <option value="docs">docs</option>
                        <option value="api">api</option>
                        <option value="tutorials">tutorials</option>
                        <option value="guides">guides</option>
                      </select>
                    </div>
                    <button className="save-button" onClick={() => {
                      if (!fetchUrlInput || !fetchProject) { alert('Please fill in all required fields'); return; }
                      executeTool('fetch_url', {
                        url: fetchUrlInput,
                        project: fetchProject,
                        content_type: fetchContentType,
                        followRedirects: true
                      });
                    }}>Fetch URL</button>
                  </div>
                )}

                {/* Loading */}
                {isLoading && (
                  <div style={{ textAlign: 'center', padding: 20 }}>
                    <div style={{
                      border: '4px solid #f3f3f3',
                      borderTop: '4px solid #667eea',
                      borderRadius: '50%',
                      width: 40,
                      height: 40,
                      margin: '0 auto',
                      animation: 'spin 1s linear infinite'
                    }} />
                    <p style={{ marginTop: 12, color: '#666' }}>Processing request...</p>
                  </div>
                )}

                {/* Result */}
                {resultText && (
                  <div style={{ marginTop: 20, padding: 16, background: '#f8f9fa', borderRadius: 8, borderLeft: '4px solid #667eea' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h4 style={{ margin: 0, color: '#333' }}>📋 Result</h4>
                      {isMarkdownContent && (
                        <button
                          onClick={() => setShowRawContent(!showRawContent)}
                          style={{
                            padding: '6px 12px',
                            background: showRawContent ? '#667eea' : 'white',
                            color: showRawContent ? 'white' : '#667eea',
                            border: '1px solid #667eea',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 500
                          }}
                        >
                          {showRawContent ? '📄 Show Rendered' : '📝 Show Raw'}
                        </button>
                      )}
                    </div>
                    {isMarkdownContent && !showRawContent ? (
                      <div style={{
                        background: 'white',
                        padding: 20,
                        borderRadius: 6,
                        maxHeight: 600,
                        overflowY: 'auto',
                        lineHeight: '1.8',
                        fontSize: 15,
                        color: '#333'
                      }}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ node, ...props }) => <h1 style={{ marginTop: 32, marginBottom: 16, fontSize: 36, fontWeight: 'bold', borderBottom: '2px solid #e0e0e0', paddingBottom: 8 }} {...props} />,
                            h2: ({ node, ...props }) => <h2 style={{ marginTop: 28, marginBottom: 14, fontSize: 28, fontWeight: 'bold', borderBottom: '1px solid #e0e0e0', paddingBottom: 6 }} {...props} />,
                            h3: ({ node, ...props }) => <h3 style={{ marginTop: 24, marginBottom: 12, fontSize: 22, fontWeight: 'bold' }} {...props} />,
                            h4: ({ node, ...props }) => <h4 style={{ marginTop: 20, marginBottom: 10, fontSize: 18, fontWeight: 'bold' }} {...props} />,
                            h5: ({ node, ...props }) => <h5 style={{ marginTop: 16, marginBottom: 8, fontSize: 16, fontWeight: 'bold' }} {...props} />,
                            h6: ({ node, ...props }) => <h6 style={{ marginTop: 14, marginBottom: 6, fontSize: 14, fontWeight: 'bold', color: '#666' }} {...props} />,
                            p: ({ node, ...props }) => <p style={{ marginBottom: 16, lineHeight: '1.8' }} {...props} />,
                            ul: ({ node, ...props }) => <ul style={{ marginBottom: 16, paddingLeft: 28, lineHeight: '1.8' }} {...props} />,
                            ol: ({ node, ...props }) => <ol style={{ marginBottom: 16, paddingLeft: 28, lineHeight: '1.8' }} {...props} />,
                            li: ({ node, ...props }) => <li style={{ marginBottom: 8 }} {...props} />,
                            code: ({ node, inline, ...props }) =>
                              inline ?
                                <code style={{ background: '#f0f0f0', padding: '3px 8px', borderRadius: 4, fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: 14, color: '#d63384' }} {...props} /> :
                                <code style={{ display: 'block', background: '#f8f8f8', padding: 16, borderRadius: 6, fontFamily: 'Consolas, Monaco, "Courier New", monospace', fontSize: 14, overflowX: 'auto', marginBottom: 16, border: '1px solid #e0e0e0', lineHeight: '1.6' }} {...props} />,
                            pre: ({ node, ...props }) => <pre style={{ background: '#f8f8f8', padding: 16, borderRadius: 6, overflowX: 'auto', marginBottom: 16, border: '1px solid #e0e0e0' }} {...props} />,
                            blockquote: ({ node, ...props }) => <blockquote style={{ borderLeft: '4px solid #667eea', paddingLeft: 20, marginLeft: 0, marginBottom: 16, color: '#555', fontStyle: 'italic', background: '#f9f9f9', padding: '12px 20px', borderRadius: 4 }} {...props} />,
                            a: ({ node, ...props }) => <a style={{ color: '#667eea', textDecoration: 'underline', fontWeight: 500 }} target="_blank" rel="noopener noreferrer" {...props} />,
                            table: ({ node, ...props }) => <div style={{ overflowX: 'auto', marginBottom: 16 }}><table style={{ borderCollapse: 'collapse', width: '100%', border: '1px solid #ddd' }} {...props} /></div>,
                            thead: ({ node, ...props }) => <thead style={{ background: '#f5f5f5' }} {...props} />,
                            th: ({ node, ...props }) => <th style={{ border: '1px solid #ddd', padding: 12, textAlign: 'left', fontWeight: 'bold' }} {...props} />,
                            td: ({ node, ...props }) => <td style={{ border: '1px solid #ddd', padding: 12 }} {...props} />,
                            hr: ({ node, ...props }) => <hr style={{ border: 'none', borderTop: '2px solid #e0e0e0', marginTop: 24, marginBottom: 24 }} {...props} />,
                            img: ({ node, ...props }) => <img style={{ maxWidth: '100%', height: 'auto', borderRadius: 6, marginTop: 12, marginBottom: 12 }} {...props} />,
                            strong: ({ node, ...props }) => <strong style={{ fontWeight: 'bold', color: '#222' }} {...props} />,
                            em: ({ node, ...props }) => <em style={{ fontStyle: 'italic', color: '#555' }} {...props} />,
                          }}
                        >
                          {resultText}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <pre style={{ background: 'white', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap', fontFamily: 'Courier New, monospace', fontSize: 14, maxHeight: 400, overflowY: 'auto' }}>{resultText}</pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KnowledgeBasePage;
