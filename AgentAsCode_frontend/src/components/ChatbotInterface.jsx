import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ChatInterface.module.css';
import { Send, User, AlertTriangle, Settings, RefreshCw, Clock, Cpu, BarChart2, Upload, StopCircle } from 'lucide-react';
import ApiService from '../services/apiservices';
import whiteLogo from '../white_logo-updated.png';
import emidsLogo from '../emidslogo.png';
import EvaluationMetrics from './EvaluationMetrics';

// Generate a unique session ID or get existing one from localStorage
const getOrCreateSessionId = (projectId) => {
    const key = `chat_session_${projectId}`;
    let sessionId = localStorage.getItem(key);

    if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem(key, sessionId);
    }

    return sessionId;
};

// Clear session from localStorage
const clearSession = (projectId) => {
    const key = `chat_session_${projectId}`;
    localStorage.removeItem(key);
};

function ChatbotInterface({ projectId }) {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [projectInfo, setProjectInfo] = useState(null);
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId, setSessionId] = useState('');
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const [evaluationResults, setEvaluationResults] = useState(null);

    // Custom Pre component with copy button
    const CodeBlockWithCopy = ({ children, ...props }) => {
        const [copied, setCopied] = useState(false);
        const codeRef = useRef(null);

        const handleCopy = () => {
            const codeText = codeRef.current?.textContent || '';
            navigator.clipboard.writeText(codeText).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
            });
        };

        return (
            <div className={styles.codeBlockWrapper}>
                <pre ref={codeRef} className={styles.mdPre} {...props}>
                    {children}
                </pre>
                <button
                    onClick={handleCopy}
                    className={styles.copyButton}
                    title={copied ? 'Copied!' : 'Copy code'}
                    aria-label="Copy code to clipboard"
                >
                    {copied ? (
                        <span className={styles.copyButtonText}>✓ Copied</span>
                    ) : (
                        <span className={styles.copyButtonText}>Copy</span>
                    )}
                </button>
            </div>
        );
    };

    // Format message content with ReactMarkdown for clean rendering
    const formatMessageContent = (content) => {
        if (typeof content !== 'string') return content;

        return (
            <div className={styles.markdownContent}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        // Custom renderers for better styling
                        h1: ({ node, ...props }) => <h1 className={styles.mdH1} {...props} />,
                        h2: ({ node, ...props }) => <h2 className={styles.mdH2} {...props} />,
                        h3: ({ node, ...props }) => <h3 className={styles.mdH3} {...props} />,
                        h4: ({ node, ...props }) => <h4 className={styles.mdH4} {...props} />,
                        p: ({ node, ...props }) => <p className={styles.mdParagraph} {...props} />,
                        ul: ({ node, ...props }) => <ul className={styles.mdList} {...props} />,
                        ol: ({ node, ...props }) => <ol className={styles.mdOrderedList} {...props} />,
                        li: ({ node, ...props }) => <li className={styles.mdListItem} {...props} />,
                        code: ({ node, inline, ...props }) =>
                            inline ?
                                <code className={styles.mdInlineCode} {...props} /> :
                                <code className={styles.mdCodeBlock} {...props} />,
                        pre: CodeBlockWithCopy,
                        a: ({ node, ...props }) => <a className={styles.mdLink} target="_blank" rel="noopener noreferrer" {...props} />,
                        blockquote: ({ node, ...props }) => <blockquote className={styles.mdBlockquote} {...props} />,
                        table: ({ node, ...props }) => <table className={styles.mdTable} {...props} />,
                        th: ({ node, ...props }) => <th className={styles.mdTableHeader} {...props} />,
                        td: ({ node, ...props }) => <td className={styles.mdTableCell} {...props} />,
                        strong: ({ node, ...props }) => <strong className={styles.mdBold} {...props} />,
                        em: ({ node, ...props }) => <em className={styles.mdItalic} {...props} />,
                    }}
                >
                    {content}
                </ReactMarkdown>
            </div>
        );
    };

    const handleEvaluationComplete = (results) => {
        setEvaluationResults(results);
        console.log('Evaluation completed:', results);
    };

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // Load project information and check health when component mounts or projectId changes
    const loadProjectInfo = useCallback(async () => {
        if (!projectId) return;

        try {
            const projectDetails = await ApiService.getProject(projectId);
            const projectData = {
                id: projectId,
                name: projectDetails.name || `Project ${projectId}`,
                status: projectDetails.status || 'unknown',
                port: projectDetails.port_number || 3000
            };
            setProjectInfo(projectData);
            setIsConnected(true);

            // Initialize or get session ID
            const newSessionId = getOrCreateSessionId(projectId);
            setSessionId(newSessionId);

            // Add welcome message
            setMessages(prev => {
                if (prev.length === 0) {
                    return [{
                        id: Date.now(),
                        type: 'system',
                        content: `Welcome to the AI Agent Chat Interface for Project ${projectId}. Ready to connect to port ${projectData.port}.`,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }];
                }
                return prev;
            });
        } catch (error) {
            console.error('Error loading project info:', error);
            setProjectInfo({
                id: projectId,
                name: `Project ${projectId}`,
                status: 'error',
                port: 'unknown'
            });
            setIsConnected(false);
        }
    }, [projectId]);

    // Initialize component
    useEffect(() => {
        loadProjectInfo();
        inputRef.current?.focus();
    }, [loadProjectInfo]);

    // Auto-scroll when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const sendMessage = async () => {
        if ((!inputMessage.trim() && uploadedFiles.length === 0) || isLoading || !sessionId) return;

        const messageContent = inputMessage.trim();
        const filesToSend = [...uploadedFiles];

        // Create user message with file info
        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: messageContent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            files: filesToSend.map(f => ({
                name: f.name,
                size: f.size,
                type: f.type || f.file.type || 'application/octet-stream'
            }))
        };

        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setUploadedFiles([]);
        setIsLoading(true);
        setIsTyping(true);

        try {
            // Prepare form data for file upload
            const formData = new FormData();

            // Add files to form data
            filesToSend.forEach(fileObj => {
                formData.append('files', fileObj.file);
            });

            // Add text message to form data if it exists
            if (messageContent) {
                formData.append('message', messageContent);
            }

            // Add session ID
            formData.append('sessionId', sessionId);

            // Send the message with files to the server
            const responseData = await ApiService.sendChatMessage(
                projectId,
                messageContent,
                sessionId,
                filesToSend
            );

            const agentMessage = {
                id: Date.now() + 1,
                type: 'agent',
                content: responseData.content || responseData.response || responseData.message || 'No response from agent',
                agent_name: responseData.agent_name || 'Supervisor Agent',
                role: responseData.role || responseData.agent_name || 'agent',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                metadata: {
                    processing_time: responseData.processing_time,
                    subagents_used: responseData.subagents_used || [],
                    confidence: responseData.confidence,
                    session_id: responseData.session_id
                }
            };

            // Add files to the agent response if any files were processed
            if (responseData.files && responseData.files.length > 0) {
                agentMessage.files = responseData.files;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
            setMessages(prev => [...prev, agentMessage]);

            if (!isConnected) {
                setIsConnected(true);
            }
        } catch (error) {
            console.error('Error communicating with supervisor agent:', error);
            let errorMessage = 'Failed to connect to project agent. ';

            if (error.message.includes('Chat request failed')) {
                errorMessage = `Chat request failed. The project agent on port ${projectInfo?.port || 'unknown'} is not responding. Please check:\n• Project is deployed and running\n• Agent is properly configured\n• Port ${projectInfo?.port || 'unknown'} is accessible`;
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage = `Cannot connect to project on port ${projectInfo?.port || 'unknown'}. Please check:\n• Project is deployed and running\n• No firewall blocking port ${projectInfo?.port || 'unknown'}\n• Backend deployment service is working`;
            } else {
                errorMessage += error.message;
            }

            const errorMessageObj = {
                id: Date.now() + 1,
                type: 'error',
                content: errorMessage,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            setMessages(prev => [...prev, errorMessageObj]);
            setIsConnected(false);
        } finally {
            setIsLoading(false);
            setIsTyping(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (inputMessage.trim() && !isLoading && isConnected) {
                sendMessage();
            }
        }
    };

    const handleInputChange = (e) => {
        setInputMessage(e.target.value);
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            // Reset file input
            e.target.value = '';

            // Add new files to the uploaded files list
            const newFiles = files.map(file => ({
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                file,
                name: file.name,
                size: file.size,
                type: file.type || file.name.split('.').pop().toUpperCase()
            }));

            setUploadedFiles(prev => [...prev, ...newFiles]);
        }
    };

    const removeFile = (fileId) => {
        setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    };

    const clearChat = async () => {
        try {
            // Show loading state
            setIsProcessing(true);

            // Clear the session on the backend if sessionId exists
            if (sessionId) {
                try {
                    await ApiService.clearSession(projectId, sessionId);
                } catch (err) {
                    console.warn('Failed to clear server session, continuing with local clear:', err);
                    // Continue with local clear even if server clear fails
                }
            }

            // Clear local session
            clearSession(projectId);

            // Generate a new session ID
            const newSessionId = getOrCreateSessionId(projectId);
            setSessionId(newSessionId);

            // Reset messages to just show a system message
            setMessages([{
                id: Date.now(),
                type: 'system',
                content: 'Chat cleared. New session started.',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);

            // Focus the input field
            inputRef.current?.focus();

        } catch (error) {
            console.error('Error clearing session:', error);
            // Show error message to user
            setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                type: 'error',
                content: 'Failed to clear chat. Please try again.',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
        } finally {
            // Always reset processing state
            setIsProcessing(false);
        }
    };

    const renderMetadata = (metadata) => {
        if (!metadata) return null;

        const items = [];

        if (metadata.processing_time) {
            items.push({
                icon: <Clock size={12} />,
                text: `${metadata.processing_time}ms`
            });
        }

        if (metadata.subagents_used?.length > 0) {
            items.push({
                icon: <Cpu size={12} />,
                text: metadata.subagents_used.join(', ')
            });
        }

        if (metadata.confidence) {
            items.push({
                icon: <BarChart2 size={12} />,
                text: `${Math.round(metadata.confidence * 100)}% confidence`
            });
        }

        return items.map((item, index) => (
            <span key={index} className={styles.metadataItem}>
                {item.icon}
                {item.text}
            </span>
        ));
    };

    const handleStop = async () => {
        if (!projectId) return;
        try {
            setIsProcessing(true);
            try {
                await ApiService.stopProject(projectId);
            } catch (e) {
                // Continue navigation even if backend reports it's already stopped
                console.warn('Stop project failed or already stopped:', e);
            }

            // Clear any local session and navigate back to dashboard
            clearSession(projectId);
            window.location.href = '/';
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className={styles.chatContainer}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerContent}>
                    <div className={styles.logoContainer}>
                        <img src={whiteLogo} alt="EMIDS Logo" className={styles.logo} />
                        <h1 className={styles.appName}>AgentAsCode</h1>
                    </div>
                    <div className={styles.headerInfo}>
                        <h2 className={styles.projectName}>
                            <Settings size={16} />
                            {projectInfo?.name || `Project ${projectId}`}
                        </h2>
                        <div className={styles.projectMeta}>
                            <span>ID: {projectId}</span>
                            {projectInfo?.port && <span>Port: {projectInfo.port}</span>}
                            <span className={`${styles.statusBadge} ${isConnected ? styles.connected : styles.disconnected}`}>
                                <span className={`${styles.statusDot} ${isConnected ? styles.connected : styles.disconnected}`}></span>
                                {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className={styles.buttonGroup}>
                    <button
                        onClick={clearChat}
                        className={`${styles.clearButton} ${isProcessing ? styles.disabled : ''}`}
                        title="Clear chat"
                        disabled={isProcessing}
                    >
                        <RefreshCw size={14} />
                        <span>Clear Chat</span>
                    </button>
                    <div className={styles.divider} />
                    <button
                        onClick={handleStop}
                        className={`${styles.clearButton} ${styles.stopButton} ${isProcessing ? styles.disabled : ''}`}
                        title="Stop project and return to dashboard"
                        disabled={isProcessing}
                    >
                        <StopCircle size={14} />
                        <span>Stop Project</span>
                    </button>
                </div>
            </header>

            {/* Messages Area */}
            <div className={styles.messagesContainer} ref={messagesContainerRef}>
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`${styles.messageWrapper} ${styles[message.type]}`}
                    >
                        <div className={styles.messageBubble}>
                            {(message.role || message.type === 'agent') && (
                                <div className={styles.messageHeader}>
                                    <div className={`${styles.avatar} ${styles[message.type]}`}>
                                        {message.type === 'user' ? (
                                            <User className="lucide lucide-user" size={16} />
                                        ) : message.type === 'agent' ? (
                                            <img src={emidsLogo} alt="EMIDS Agent" className={styles.agentAvatar} />
                                        ) : message.type === 'system' ? (
                                            <Settings size={16} />
                                        ) : (
                                            <AlertTriangle size={16} />
                                        )}
                                    </div>
                                    {message.role && (
                                        <div className={styles.roleContainer}>
                                            {message.role.split(',').map((role, index) => {
                                                const cleanRole = role.replace('role:', '').trim();
                                                return cleanRole ? (
                                                    <span key={index} className={styles.roleName}>
                                                        {cleanRole}
                                                    </span>
                                                ) : null;
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className={styles.messageContentWrapper}>
                                {message.type === 'agent' && (
                                    <div className={styles.agentLogo}>
                                        <img src={emidsLogo} alt="EMIDS Agent" />
                                    </div>
                                )}
                                <div className={styles.messageContent}>
                                    {message.files && message.files.length > 0 && (
                                        <div className={styles.attachedFiles}>
                                            <div className={styles.attachedFilesLabel}>Attached files:</div>
                                            {message.files.map((file, index) => (
                                                <div key={index} className={styles.attachedFile}>
                                                    <span className={styles.fileIcon}>
                                                        {file.type === 'pdf' ? '📄' : '📎'}
                                                    </span>
                                                    <span className={styles.fileName} title={file.name}>
                                                        {file.name}
                                                    </span>
                                                    <span className={styles.fileSize}>
                                                        ({(file.size / 1024).toFixed(1)} KB)
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className={styles.messageText}>
                                        {message.content && formatMessageContent(message.content)}
                                    </div>
                                    {message.metadata && (
                                        <div className={styles.metadata}>
                                            {renderMetadata(message.metadata)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className={styles.messageTime}>
                            {message.timestamp}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className={styles.typingIndicator}>
                        <div className={styles.typingDot}></div>
                        <div className={styles.typingDot}></div>
                        <div className={styles.typingDot}></div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            {/* Evaluation Metrics */}
            {projectId && sessionId && (
                <div className={styles.evaluationContainer}>
                    <EvaluationMetrics
                        projectId={projectId}
                        sessionId={sessionId}
                        messages={messages}
                        onEvaluationComplete={handleEvaluationComplete}
                    />
                </div>
            )}

            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
                <div className={styles.uploadedFilesContainer}>
                    <div className={styles.uploadedFilesList}>
                        {uploadedFiles.map((file) => (
                            <div key={file.id} className={styles.uploadedFile}>
                                <div className={styles.fileIcon}>
                                    {file.type === 'pdf' ? '📄' : '📎'}
                                </div>
                                <div className={styles.fileInfo}>
                                    <div className={styles.fileName} title={file.name}>
                                        {file.name}
                                    </div>
                                    <div className={styles.fileSize}>
                                        {(file.size / 1024).toFixed(1)} KB
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className={styles.removeFileButton}
                                    onClick={() => removeFile(file.id)}
                                    aria-label={`Remove ${file.name}`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className={styles.inputContainer}>
                <div className={styles.inputWrapper}>
                    <textarea
                        ref={inputRef}
                        value={inputMessage}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyPress}
                        placeholder={uploadedFiles.length > 0
                            ? "Ask a question about the uploaded files..."
                            : "Type your message..."}
                        disabled={isLoading || !isConnected}
                        rows={1}
                        className={styles.textarea}
                    />
                    <input
                        type="file"
                        id="file-upload"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        accept="*"
                        disabled={isLoading || !isConnected}
                        multiple
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || !isConnected}
                        className={styles.iconButton}
                        aria-label="Upload file"
                        title="Upload file"
                    >
                        <Upload size={20} />
                    </button>
                    <button
                        type="button"
                        onClick={sendMessage}
                        disabled={isLoading || (!inputMessage.trim() && uploadedFiles.length === 0) || !isConnected}
                        className={styles.sendButton}
                        aria-label="Send message"
                    >
                        {isLoading ? (
                            <RefreshCw size={20} className={styles.sendIcon} />
                        ) : (
                            <Send size={20} className={styles.sendIcon} />
                        )}
                    </button>
                </div>
                <div className={styles.helperText}>
                    {isConnected
                        ? 'Press Enter to send • Shift+Enter for new line'
                        : 'Not connected. Please check your connection and try again.'}
                </div>
            </div>
        </div>
    );
}

export default ChatbotInterface;
