import React, { useState, useEffect } from 'react';
import { BarChart3, CheckCircle, XCircle, AlertCircle, Loader } from 'lucide-react';
import ApiService from '../services/apiservices';
import styles from './EvaluationMetrics.module.css';

function EvaluationMetrics({ projectId, sessionId, messages, onEvaluationComplete }) {
    const [availableMetrics, setAvailableMetrics] = useState({
        coherence: 'Measures how logically consistent the response is',
        confidence_score: 'Confidence level of the response',
        relevance: 'How relevant the response is to the query',
        completeness: 'Whether the response fully addresses the query',
        consistency: 'Consistency with previous responses'
    });
    const [selectedMetrics, setSelectedMetrics] = useState([]);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [evaluationResults, setEvaluationResults] = useState(null);
    const [error, setError] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        // Load available metrics from API if needed
        const loadMetrics = async () => {
            try {
                const response = await ApiService.getAvailableMetrics();
                if (response && response.available_metrics) {
                    setAvailableMetrics(response.available_metrics);
                }
            } catch (err) {
                console.error('Failed to load metrics:', err);
                // Use default metrics if API fails
            }
        };
        loadMetrics();
    }, []);

    const handleMetricToggle = (metric) => {
        setSelectedMetrics(prev =>
            prev.includes(metric)
                ? prev.filter(m => m !== metric)
                : [...prev, metric]
        );
    };

    const handleEvaluate = async () => {
        if (selectedMetrics.length === 0) {
            setError('Please select at least one metric to evaluate');
            return;
        }

        setIsEvaluating(true);
        setError(null);

        try {
            // Get the last agent message
            const agentMessages = messages.filter(m => m.type === 'agent');
            if (agentMessages.length === 0) {
                throw new Error('No agent messages to evaluate');
            }

            const lastMessage = agentMessages[agentMessages.length - 1];
            const previousMessages = agentMessages.slice(0, -1).map(m => m.content);

            const results = await ApiService.evaluateResponse(
                projectId,
                sessionId,
                selectedMetrics,
                lastMessage.content,
                previousMessages
            );

            setEvaluationResults({
                ...results,
                final_response: lastMessage.content,
                ground_truth: previousMessages
            });

            if (onEvaluationComplete) {
                onEvaluationComplete(results);
            }
        } catch (err) {
            console.error('Evaluation failed:', err);
            setError('Failed to evaluate response. Please try again.');
        } finally {
            setIsEvaluating(false);
        }
    };

    const getScoreColor = (score) => {
        if (score >= 0.8) return '#10b981'; // Green
        if (score >= 0.6) return '#f59e0b'; // Yellow
        return '#ef4444'; // Red
    };

    const getScoreIcon = (score) => {
        if (score >= 0.8) return <CheckCircle size={16} className="text-green-500" />;
        if (score >= 0.6) return <AlertCircle size={16} className="text-yellow-500" />;
        return <XCircle size={16} className="text-red-500" />;
    };

    return (
        <div className={styles.evaluationContainer}>
            <div
                className={styles.header}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={styles.headerContent}>
                    <BarChart3 size={20} className={styles.headerIcon} />
                    <span className={styles.headerText}>Evaluation Metrics</span>
                    {selectedMetrics.length > 0 && (
                        <span className={styles.metricCount}>
                            {selectedMetrics.length} selected
                        </span>
                    )}
                </div>
                <div className={`${styles.arrow} ${isExpanded ? styles.arrowUp : ''}`}>
                    ▼
                </div>
            </div>

            {isExpanded && (
                <div className={styles.content}>
                    {/* Metrics Selection */}
                    <div className={styles.section}>
                        <h4>Select Metrics to Evaluate:</h4>
                        <div className={styles.metricsGrid}>
                            {Object.entries(availableMetrics).map(([metric, description]) => (
                                <label
                                    key={metric}
                                    className={`${styles.metricItem} ${selectedMetrics.includes(metric) ? styles.metricItemSelected : ''
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedMetrics.includes(metric)}
                                        onChange={() => handleMetricToggle(metric)}
                                        className={styles.metricCheckbox}
                                    />
                                    <div className={styles.metricInfo}>
                                        <div className={styles.metricName}>
                                            {metric.replace('_', ' ').toUpperCase()}
                                        </div>
                                        <div className={styles.metricDescription}>
                                            {description}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Evaluate Button */}
                    <button
                        onClick={handleEvaluate}
                        disabled={isEvaluating || selectedMetrics.length === 0}
                        className={`${styles.evaluateButton} ${selectedMetrics.length === 0 ? styles.disabled : ''
                            }`}
                    >
                        {isEvaluating ? (
                            <>
                                <Loader size={16} className={styles.spinner} />
                                Evaluating...
                            </>
                        ) : (
                            <>
                                <BarChart3 size={16} />
                                Evaluate Response
                            </>
                        )}
                    </button>

                    {/* Error Display */}
                    {error && (
                        <div className={styles.error}>
                            {error}
                        </div>
                    )}

                    {/* Results */}
                    {evaluationResults && (
                        <div className={styles.results}>
                            <h4>Evaluation Results</h4>

                            <div className={styles.responsePreview}>
                                <div className={styles.sectionTitle}>Response:</div>
                                <div className={styles.responseText}>
                                    {evaluationResults.final_response || 'No response content'}
                                </div>
                            </div>

                            <div className={styles.metricsResults}>
                                {Object.entries(evaluationResults.evaluation_results || {}).map(([metric, score]) => (
                                    <div key={metric} className={styles.metricResult}>
                                        <div className={styles.metricHeader}>
                                            {getScoreIcon(score)}
                                            <span className={styles.metricName}>
                                                {metric.replace('_', ' ').toUpperCase()}
                                            </span>
                                        </div>
                                        <div className={styles.scoreContainer}>
                                            <div
                                                className={styles.scoreBar}
                                                style={{
                                                    width: `${score * 100}%`,
                                                    backgroundColor: getScoreColor(score)
                                                }}
                                            />
                                        </div>
                                        <span className={styles.scoreValue} style={{ color: getScoreColor(score) }}>
                                            {(score * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {evaluationResults.ground_truth?.length > 0 && (
                                <div className={styles.groundTruth}>
                                    <div className={styles.sectionTitle}>
                                        Ground Truth ({evaluationResults.ground_truth.length} previous responses):
                                    </div>
                                    <div className={styles.groundTruthList}>
                                        {evaluationResults.ground_truth.map((response, index) => (
                                            <div key={index} className={styles.groundTruthItem}>
                                                {response.substring(0, 100)}{response.length > 100 ? '...' : ''}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default EvaluationMetrics;
