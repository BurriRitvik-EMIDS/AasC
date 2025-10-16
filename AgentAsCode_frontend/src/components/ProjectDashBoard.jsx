// ProjectDashboard.jsx
import React, { useState, useEffect } from 'react';
import emidsLogo from '../white_logo-updated.png';
import ApiService from '../services/apiservices';
import { handleProjectRemoval, validateProjectRemoval } from '../utils/removeProject';
import './styles.css';

function ProjectDashboard({ onNavigate, onCreateNewProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await ApiService.getProjects();
      console.log('Fetched projects:', response);
      setProjects(response);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartStop = async (projectId, currentStatus) => {
    try {
      console.log(`=== ${currentStatus === 'Running' ? 'STOP' : 'START'} ACTION ===`);
      console.log(`Project ID: ${projectId}`);
      console.log(`Current status: ${currentStatus}`);

      const endpoint = currentStatus === 'Running' ? 'stopProject' : 'startProject';

      // Don't update local state immediately - wait for backend confirmation
      const response = await ApiService[endpoint](projectId);
      console.log('Backend response:', response);

      // Only update if we get a successful response
      if (response && response.status) {
        // Add a small delay to ensure database is updated
        await new Promise(resolve => setTimeout(resolve, 500));

        // Fetch fresh data from backend - this is the source of truth
        await fetchProjects();
      } else {
        throw new Error('Invalid response from server');
      }

    } catch (error) {
      console.error(`Failed to ${currentStatus === 'Running' ? 'stop' : 'start'} project:`, error);
      alert(`Failed to ${currentStatus === 'Running' ? 'stop' : 'start'} project: ${error.message}`);

      // Refresh the data to ensure UI is in sync with backend
      await fetchProjects();
    }
  };

  const handleAddWorkers = (projectId) => {
    onNavigate('multiAgentUI', projectId);
  };

  const handleRemoveProject = async (project) => {
    // Validate if project can be removed
    const validation = validateProjectRemoval(project);
    if (!validation.isValid) {
      alert(validation.message);
      return;
    }

    // Handle project removal with confirmation
    const success = await handleProjectRemoval(
      project.id,
      project.name,
      () => {
        // Success callback - refresh the projects list
        fetchProjects();
      },
      (error) => {
        // Error callback - refresh the projects list to ensure consistency
        fetchProjects();
      }
    );
  };

  return (
    <div className="dashboard-container" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#f8f9fa',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
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
          gap: '1.25rem'
        }}>
          <div
            onClick={() => fetchProjects()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.5rem 0.75rem 0.5rem 0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
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
          padding: '0 1rem'
        }}>
          Agent As Code
        </h1>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onCreateNewProject}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              padding: '0.6rem 1.5rem',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontSize: '0.9375rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>+</span> New Project
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading projects...</p>
          </div>
        ) : (
          <div className="projects-table-container">
            <table className="projects-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Project Name</th>
                  <th>Action</th>
                  <th>Configuration</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="no-projects">No projects found</td>
                  </tr>
                ) : (
                  projects.map((project, index) => (
                    <tr key={project.id}>
                      <td>{index + 1}</td>
                      <td>{project.name}</td>
                      <td>
                        <button
                          className={`action-btn ${(project.status || 'Stopped') === 'Running' ? 'stop' : 'start'}`}
                          onClick={() => handleStartStop(project.id, project.status || 'Stopped')}
                          disabled={loading}
                        >
                          {(project.status || 'Stopped') === 'Running' ? 'Stop' : 'Start'}
                        </button>
                      </td>
                      <td>
                        <button
                          className="action-btn add-workers"
                          onClick={() => handleAddWorkers(project.id)}
                        >
                          Add Workers
                        </button>
                      </td>
                      <td>
                        <button
                          className="action-btn remove"
                          onClick={() => handleRemoveProject(project)}
                          disabled={loading || project.status === 'Running'}
                          title={project.status === 'Running' ? 'Stop the project before removing' : 'Remove this project'}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectDashboard;