import React, { useEffect, useState, useRef } from 'react';
import { Cpu, Zap } from 'lucide-react';
import Logo from './logo.png';
import AgentIcon from './agents.png';
import './LoadingScreen.css';

const LoadingScreen = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const [isTransferring, setIsTransferring] = useState(false);
  const [steps, setSteps] = useState([]);
  const animationRef = useRef(null);

  // Initial + Final steps
  const initialSteps = [
    { text: 'Project creation and configuration...' },
    { text: 'Fetching required packages' },
    { text: 'All dependencies installed' },
  ];

  const finalSteps = [
    { text: 'Project Created Successfully' },
  ];

  // Tips to show while loading
  const loadingTips = [
    'Agents are being optimized for maximum performance',
    'Your AI assistant is learning and adapting',
    'Preparing advanced capabilities',
    'Loading specialized knowledge bases',
    'Setting up secure communication channels',
    'Optimizing response generation',
    'Enhancing natural language understanding',
  ];

  const [currentTip, setCurrentTip] = useState(loadingTips[0]);

  // Setup step logic
  useEffect(() => {
    setSteps(initialSteps); // start with initial steps
  }, []);

  // Handle the transfer animation and step progression
  useEffect(() => {
    let stepTimer;
    let tipTimer;

    const nextStep = () => {
      setCurrentStep((prev) => {
        const next = prev + 1;

        if (next >= steps.length) {
          if (loopCount < 2) {
            // loop initial steps 3 times total
            setLoopCount((c) => c + 1);
            setSteps(initialSteps);
            return 0;
          } else {
            // after 3 loops, show final steps permanently
            setSteps(finalSteps);
            return 0;
          }
        }
        return next;
      });

      // Trigger transfer animation
      setIsTransferring(true);
      setTimeout(() => setIsTransferring(false), 1500);
    };

    // Step change every 2.5s
    stepTimer = setInterval(nextStep, 2500);

    // Tip change every 5s
    tipTimer = setInterval(() => {
      setCurrentTip((prevTip) => {
        const currentIndex = loadingTips.indexOf(prevTip);
        const nextIndex = (currentIndex + 1) % loadingTips.length;
        return loadingTips[nextIndex];
      });
    }, 5000);

    // Initial transfer animation
    const initialTransfer = setTimeout(() => {
      setIsTransferring(true);
      setTimeout(() => setIsTransferring(false), 1500);
    }, 500);

    return () => {
      clearInterval(stepTimer);
      clearInterval(tipTimer);
      clearTimeout(initialTransfer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [steps, loopCount]);

  return (
    <div className="agent-loading-screen">
      <div className="loading-container">
        <div className="logo-container">
          <div className="icon-container">
            {/* Left EMIDS Logo */}
            <div className={`agent-icon-container ${isTransferring ? 'pulse' : ''}`}>
              <img src={Logo} alt="EMIDS" className="emids-logo" />
            </div>

            {/* Transfer animation */}
            <div className="transfer-animation">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`data-packet ${isTransferring ? 'transferring' : ''}`}
                  style={{ '--delay': `${i * 0.2}s` }}
                >
                  <div className="packet-inner" />
                </div>
              ))}
            </div>

            {/* Right Agent Icon */}
            <div className={`agent-icon-container ${isTransferring ? 'pulse' : ''}`}>
              <img src={AgentIcon} alt="Agent" className="agent-icon" />
            </div>
          </div>

          <div className="glow-effect"></div>
        </div>

        <div className="loading-content">
          <div className="loading-text">
            <h2>
              {steps[currentStep]?.text || ''}
            </h2>

            <div className="progress-container">
              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{
                    width: `${((currentStep + 1) / steps.length) * 100}%`,
                    transition: 'width 0.5s ease-in-out',
                  }}
                >
                  <div className="progress-glow"></div>
                </div>
                <div className="progress-steps">
                  {steps.map((_, index) => (
                    <div
                      key={index}
                      className={`progress-step ${index <= currentStep ? 'active' : ''}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="loading-tip">
            <Zap className="tip-icon" size={18} />
            <span>{currentTip}</span>
          </div>

          <div className="status-bar">
            <div className="status-item">
              <Cpu size={16} />
              <span>Project set up and configuration....</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
