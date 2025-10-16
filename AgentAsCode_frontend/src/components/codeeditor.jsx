// src/components/codeeditor.js
import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import BlobStorageService from '../services/blobstorage';
import ApiService from '../services/apiservices';
import './styles.css';

function CodeViewer({ item, type, onSave, projectId, onEditPrompt }) {
  // State to track edited code
  const [editedCode, setEditedCode] = useState(item?.code || '# No code available');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewCode, setPreviewCode] = useState('');
  const [viewingBlobCode, setViewingBlobCode] = useState(false);

  // Update code when item changes
  useEffect(() => {
    if (item) {
      setEditedCode(item.code || '# No code available');
      setViewingBlobCode(false);
    }
  }, [item]);

  if (!item) {
    return (
      <div className="middle-pane">
      </div>
    );
  }

  const handleEditorChange = (value) => {
    setEditedCode(value);
  };

  const handleSaveCode = async () => {
    // Call the onSave prop with updated item
    const updatedItem = {
      ...item,
      code: editedCode
    };
    
    try {
      setIsLoading(true);
      await onSave(type, updatedItem);
      setIsEditing(false);
      
      // If we were viewing blob code, update the preview mode
      if (viewingBlobCode) {
        setPreviewCode(editedCode);
        setViewingBlobCode(false);
        setIsPreviewMode(true);
      }
    } catch (err) {
      setError(`Failed to save code: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Direct blob storage access through backend API
  const handleViewBlobCode = async () => {
    if (!projectId) {
      setError("Cannot view code: Missing project ID");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Determine the type folder name (agents or tools)
      const typeFolder = type === 'agent' ? 'agents' : 'tools';
      
      // Generate the blob name for the file
      const blobName = BlobStorageService.generateBlobName(
        projectId,
        typeFolder,
        item.name
      );
      
      console.log(`Fetching blob code from: ${blobName}`);
      
      // Directly use BlobStorageService to get the code content
      // This avoids CORS by using the same API endpoint structure
      try {
        // First try to get code content using BlobStorageService
        const blobCode = await BlobStorageService.getCodeContent(blobName);
        
        // Update the editor with the blob code
        setEditedCode(blobCode);
        setPreviewCode(blobCode);
        setViewingBlobCode(true);
        setIsPreviewMode(true);
        
        console.log('Blob code loaded successfully');
      } catch (blobError) {
        console.warn('Failed to get code from blob, trying API fallback:', blobError);
        
        // Fallback to API endpoints
        if (type === 'agent' && item.id) {
          const result = await ApiService.getAgentCode(item.id);
          // Use the code from API
          setEditedCode(result.code);
          setPreviewCode(result.code);
          setViewingBlobCode(true);
          setIsPreviewMode(true);
        } else if (type === 'tool' && item.id) {
          const result = await ApiService.getToolCode(item.id);
          // Use the code from API
          setEditedCode(result.code);
          setPreviewCode(result.code);
          setViewingBlobCode(true);
          setIsPreviewMode(true);
        } else {
          throw new Error('Failed to load code from blob storage or API');
        }
      }
    } catch (err) {
      console.error('Error fetching code:', err);
      setError(`Failed to fetch code: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCode = async () => {
    if (!projectId) {
      setError("Cannot download code: Missing project ID");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Determine the type folder name (agents or tools)
      const typeFolder = type === 'agent' ? 'agents' : 'tools';
      
      // Generate the blob name for the file
      const blobName = BlobStorageService.generateBlobName(
        projectId,
        typeFolder,
        item.name
      );
      
      console.log(`Downloading file: ${blobName}`);
      
      // Use the BlobStorageService to download the file
      const result = await BlobStorageService.downloadCode(blobName);
      
      if (result) {
        console.log('Code downloaded successfully');
      } else {
        setError('Download failed. File may not exist yet. Try saving or deploying first.');
      }
    } catch (err) {
      setError(`Failed to download code: ${err.message}`);
      console.error('Error downloading code:', err);
      
      // Fallback to downloading the current code
      try {
        // Create a file download using the browser
        const fileName = `${item.name}.py`;
        const codeToDownload = isEditing ? editedCode : (viewingBlobCode ? previewCode : item.code || '# No code available');
        const blob = new Blob([codeToDownload], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setError(null); // Clear error since we managed to download
        console.log('Fallback download successful');
      } catch (downloadErr) {
        console.error('Even fallback download failed:', downloadErr);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeployCode = async () => {
    if (!projectId) {
      setError("Cannot deploy code: Missing project ID");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // First, ensure the code is saved
      if (isEditing) {
        const updatedItem = {
          ...item,
          code: editedCode
        };
        await onSave(type, updatedItem);
        setIsEditing(false);
      }
      
      // Deploy to blob storage
      const result = await BlobStorageService.deployProject(projectId);
      
      console.log('Deployment result:', result);
      
      if (result.simulated) {
        // If it's a simulated response
        alert('Deployment successful (simulation mode)');
      } else {
        // If it's a real response
        alert('Code deployed successfully!');
      }
    } catch (err) {
      setError(`Failed to deploy code: ${err.message}`);
      console.error('Error deploying code:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine what tools or parameters to show
  const getItemDetails = () => {
    if (type === 'agent') {
      return item.tools || 'No tools selected';
    } else {
      // For tools, show appropriate parameters based on tool_type
      if (item.toolType === 'mcp') {
        return `API URL: ${item.apiUrl || 'Not specified'}`;
      } else {
        return item.parameters || 'No parameters';
      }
    }
  };

  return (
    <div className="middle-pane">
      <h2 className="pane-title">
        {type === 'agent' ? 'Agent Details' : 'Tool Details'}
        {viewingBlobCode && <span className="viewing-blob-tag">Blob Storage</span>}
        {isPreviewMode && !viewingBlobCode && <span className="preview-tag">Preview Mode</span>}
      </h2>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      
      {isLoading && <div className="loading-indicator">Processing...</div>}
      
      <div className="details-container">
        <div className="detail-item">
          <strong>{type === 'agent' ? 'Agent Name:' : 'Tool Name:'}</strong>
          <span>{item.name}</span>
        </div>
        
        <div className="detail-item">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <strong>{type === 'agent' ? 'Prompt:' : 'Description:'}</strong>
            {type === 'agent' && (
              <button 
                className="editor-button prompt-edit-button"
                onClick={() => onEditPrompt && onEditPrompt(item)}
                disabled={isLoading}
                style={{ marginLeft: '10px' }}
              >
                Edit
              </button>
            )}
          </div>
          <p className="detail-text">{type === 'agent' ? item.prompt : (item.description || item.tool_prompt)}</p>
        </div>
        
        <div className="detail-item">
          <strong>{type === 'agent' ? 'Tools:' : 'Parameters:'}</strong>
          <span>{getItemDetails()}</span>
        </div>
        
        <div className="form-group">
          <div className="code-header">
            <strong>
              {type === 'agent' ? 'Agent Code:' : 'Tool Implementation:'}
            </strong>
            <div className="code-actions">
              <button 
                className="editor-button"
                onClick={() => setIsEditing(!isEditing)}
                disabled={isLoading}
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </button>
              <button 
                className="editor-button view-button"
                onClick={handleViewBlobCode}
                disabled={isLoading}
              >
                View Code
              </button>
              <button 
                className="editor-button download-button"
                onClick={handleDownloadCode}
                disabled={isLoading}
              >
                Download
              </button>
            </div>
          </div>
          <div className="code-editor-container">
            <Editor
              height="300px"
              width="100%"
              language="python"
              value={isEditing ? editedCode : (viewingBlobCode ? previewCode : item.code || '# No code available')}
              theme="vs-dark"
              onChange={handleEditorChange}
              options={{
                readOnly: !isEditing,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                automaticLayout: true,
              }}
            />
          </div>
          {isEditing && (
            <div className="form-actions">
              <button 
                className="save-button"
                onClick={handleSaveCode}
                disabled={isLoading}
              >
                Save Code
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CodeViewer;