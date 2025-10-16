import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Code, Database, Cpu, Settings, Zap } from 'lucide-react';
import whiteLogo from '../white_logo-updated.png';
import ApiService from '../services/apiservices';

const CreateProjectPage = () => {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setIsCreating(true);
      const response = await ApiService.createProject({
        name: projectName,
        description: description.trim() || 'No description provided',
      });
      
      if (response.id) {
        navigate('/projects');
      }
    } catch (err) {
      setError('Failed to create project. Please try again.');
      console.error('Error creating project:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const features = [
    {
      icon: <Sparkles className="feature-icon" />,
      title: 'AI-Powered',
      description: 'Leverage advanced AI to automate and optimize your workflows.'
    },
    {
      icon: <Code className="feature-icon" />,
      title: 'Code Generation',
      description: 'Generate high-quality code with intelligent suggestions.'
    },
    {
      icon: <Database className="feature-icon" />,
      title: 'Data Integration',
      description: 'Seamlessly connect with various data sources and APIs.'
    }
  ];

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    header: {
      background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
      padding: '1rem 2rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    },
    logoContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
    },
    logo: {
      height: '40px',
      filter: 'brightness(0) invert(1)', // Make logo white
    },
    headerTitle: {
      color: 'white',
      fontSize: '1.5rem',
      fontWeight: '600',
      margin: 0,
    },
    main: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '2rem 1rem',
    },
    backButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      background: 'transparent',
      border: 'none',
      color: '#4b5563',
      cursor: 'pointer',
      fontSize: '1rem',
      marginBottom: '1.5rem',
      padding: '0.5rem 0',
    },
    title: {
      fontSize: '2rem',
      fontWeight: '700',
      color: '#1f2937',
      marginBottom: '1.5rem',
    },
    card: {
      background: 'white',
      borderRadius: '0.75rem',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      padding: '2rem',
      marginBottom: '2rem',
    },
    formGroup: {
      marginBottom: '1.5rem',
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '500',
      color: '#374151',
    },
    input: {
      width: '100%',
      padding: '0.75rem 1rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.5rem',
      fontSize: '1rem',
      color: '#111827',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    },
    textarea: {
      width: '100%',
      minHeight: '120px',
      padding: '0.75rem 1rem',
      border: '1px solid #d1d5db',
      borderRadius: '0.5rem',
      fontSize: '1rem',
      color: '#111827',
      resize: 'vertical',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    },
    inputFocus: {
      outline: 'none',
      borderColor: '#3b82f6',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.2)',
    },
    errorText: {
      color: '#dc2626',
      fontSize: '0.875rem',
      marginTop: '0.5rem',
    },
    buttonGroup: {
      display: 'flex',
      gap: '1rem',
      marginTop: '2rem',
    },
    button: {
      padding: '0.75rem 1.5rem',
      borderRadius: '0.5rem',
      fontSize: '1rem',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
    },
    primaryButton: {
      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      color: 'white',
      border: 'none',
    },
    primaryButtonHover: {
      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3), 0 2px 4px -1px rgba(59, 130, 246, 0.2)',
    },
    secondaryButton: {
      background: 'white',
      color: '#4b5563',
      border: '1px solid #d1d5db',
    },
    secondaryButtonHover: {
      background: '#f9fafb',
      borderColor: '#9ca3af',
    },
    featuresGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '1.5rem',
      marginTop: '2rem',
    },
    featureCard: {
      background: 'white',
      borderRadius: '0.75rem',
      padding: '1.5rem',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      transition: 'transform 0.2s, box-shadow 0.2s',
      border: '1px solid #e5e7eb',
    },
    featureCardHover: {
      transform: 'translateY(-2px)',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    },
    featureIcon: {
      width: '2.5rem',
      height: '2.5rem',
      borderRadius: '0.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '1rem',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
      color: '#0369a1',
    },
    featureTitle: {
      fontSize: '1.125rem',
      fontWeight: '600',
      color: '#1f2937',
      marginBottom: '0.5rem',
    },
    featureDescription: {
      color: '#6b7280',
      fontSize: '0.9375rem',
      lineHeight: '1.5',
    },
    loadingSpinner: {
      border: '3px solid rgba(0, 0, 0, 0.1)',
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      borderTopColor: '#3b82f6',
      animation: 'spin 1s ease-in-out infinite',
      marginRight: '0.5rem',
    },
    '@keyframes spin': {
      to: { transform: 'rotate(360deg)' },
    },
  };

  // Add hover effects
  const [isHovered, setIsHovered] = useState({
    primary: false,
    secondary: false,
    features: Array(features.length).fill(false),
  });

  const handleFeatureHover = (index, isHovering) => {
    const newHoveredFeatures = [...isHovered.features];
    newHoveredFeatures[index] = isHovering;
    setIsHovered({
      ...isHovered,
      features: newHoveredFeatures,
    });
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logoContainer}>
          <img src={whiteLogo} alt="Agent As Code" style={styles.logo} />
        </div>
        <h1 style={styles.headerTitle}>Create New Project</h1>
        <div style={{ width: '40px' }}></div> {/* Spacer for flex alignment */}
      </header>

      <main style={styles.main}>
        <button 
          style={styles.backButton}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={18} />
          Back to Projects
        </button>

        <h1 style={styles.title}>Create a New Project</h1>
        
        <div style={styles.card}>
          <form onSubmit={handleSubmit}>
            <div style={styles.formGroup}>
              <label htmlFor="projectName" style={styles.label}>
                Project Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
                style={styles.input}
                onFocus={(e) => e.target.style = { ...styles.input, ...styles.inputFocus }}
                onBlur={(e) => e.target.style = styles.input}
              />
              {error && <p style={styles.errorText}>{error}</p>}
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="description" style={styles.label}>
                Description (Optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your project..."
                style={styles.textarea}
                onFocus={(e) => e.target.style = { ...styles.textarea, ...styles.inputFocus }}
                onBlur={(e) => e.target.style = styles.textarea}
              />
            </div>

            <div style={styles.buttonGroup}>
              <button
                type="submit"
                style={{
                  ...styles.button,
                  ...styles.primaryButton,
                  ...(isHovered.primary ? styles.primaryButtonHover : {}),
                }}
                onMouseEnter={() => setIsHovered({ ...isHovered, primary: true })}
                onMouseLeave={() => setIsHovered({ ...isHovered, primary: false })}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <span style={styles.loadingSpinner}></span>
                    Creating...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Create Project
                  </>
                )}
              </button>
              <button
                type="button"
                style={{
                  ...styles.button,
                  ...styles.secondaryButton,
                  ...(isHovered.secondary ? styles.secondaryButtonHover : {}),
                }}
                onMouseEnter={() => setIsHovered({ ...isHovered, secondary: true })}
                onMouseLeave={() => setIsHovered({ ...isHovered, secondary: false })}
                onClick={() => navigate(-1)}
                disabled={isCreating}
              >
                <ArrowLeft size={18} />
                Cancel
              </button>
            </div>
          </form>
        </div>

        <h2 style={{ ...styles.title, fontSize: '1.5rem', marginTop: '3rem', marginBottom: '1rem' }}>
          What you'll get with your project
        </h2>
        
        <div style={styles.featuresGrid}>
          {features.map((feature, index) => (
            <div
              key={index}
              style={{
                ...styles.featureCard,
                ...(isHovered.features[index] ? styles.featureCardHover : {}),
              }}
              onMouseEnter={() => handleFeatureHover(index, true)}
              onMouseLeave={() => handleFeatureHover(index, false)}
            >
              <div style={styles.featureIcon}>
                {React.cloneElement(feature.icon, { size: 20 })}
              </div>
              <h3 style={styles.featureTitle}>{feature.title}</h3>
              <p style={styles.featureDescription}>{feature.description}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default CreateProjectPage;
