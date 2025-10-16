
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models import Project, ChatSession, ChatMessage, EvaluationMetrics
from database import get_db
from schemas import EvaluationMetricsRequest, EvaluationMetricsResponse, ChatHistoryResponse
import uuid
import json
from typing import List, Optional
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

router = APIRouter(prefix="/evaluation", tags=["Evaluation"])

# Available evaluation metrics
AVAILABLE_METRICS = {
    "coherence": "Measures how well-structured and logical the response is",
    "confidence_score": "Measures the confidence level of the response",
    "relevance": "Measures how relevant the response is to the context",
    "completeness": "Measures how complete the response is",
    "consistency": "Measures consistency with previous responses",
    "clarity": "Measures how clear and understandable the response is"
}


class EvaluationRequest(BaseModel):
    project_id: str
    session_id: str
    selected_metrics: List[str]
    # Optional fallback payload from frontend when DB doesn't have chat history yet
    final_response: Optional[str] = None
    # prior agent responses (ground truth)
    agent_messages: Optional[List[str]] = None


class EvaluationResponse(BaseModel):
    project_id: str
    session_id: str
    selected_metrics: List[str]
    evaluation_results: dict
    final_response: str
    ground_truth: List[str]


@router.get("/metrics")
def get_available_metrics():
    """
    Get all available evaluation metrics.
    """
    return {
        "available_metrics": AVAILABLE_METRICS,
        "description": "Available evaluation metrics for agent response evaluation"
    }


@router.get("/chat-history/{project_id}/{session_id}")
def get_chat_history(
    project_id: str,
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get chat history for a specific session.
    """
    try:
        # Validate project ID format
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid project ID format. Please provide a valid UUID."
        )

    # Get project details
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(
            status_code=404,
            detail=f"Project with ID {project_id} not found."
        )

    # Get or create chat session
    chat_session = db.query(ChatSession).filter(
        ChatSession.project_id == project_uuid,
        ChatSession.session_id == session_id
    ).first()

    if not chat_session:
        # Create new session
        chat_session = ChatSession(
            project_id=project_uuid,
            session_id=session_id
        )
        db.add(chat_session)
        db.commit()
        db.refresh(chat_session)

    # Get all messages for this session
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == chat_session.id
    ).order_by(ChatMessage.created_at).all()

    # Format messages
    formatted_messages = []
    for message in messages:
        formatted_messages.append({
            "id": str(message.id),
            "type": message.message_type,
            "content": message.content,
            "agent_name": message.agent_name,
            "metadata": json.loads(message.message_metadata) if message.message_metadata else {},
            "created_at": message.created_at.isoformat()
        })

    return ChatHistoryResponse(
        session_id=session_id,
        messages=formatted_messages
    )


@router.post("/evaluate", response_model=EvaluationResponse)
def evaluate_response(
    request: EvaluationRequest,
    db: Session = Depends(get_db)
):
    """
    Evaluate agent response using selected metrics.
    """
    try:
        # Validate project ID format
        project_uuid = uuid.UUID(request.project_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid project ID format. Please provide a valid UUID."
        )

    # Get project details
    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(
            status_code=404,
            detail=f"Project with ID {request.project_id} not found."
        )

    # Validate selected metrics
    invalid_metrics = [
        m for m in request.selected_metrics if m not in AVAILABLE_METRICS]
    if invalid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metrics: {invalid_metrics}. Available metrics: {list(AVAILABLE_METRICS.keys())}"
        )

    # Try to read from DB first
    db_final_response: Optional[ChatMessage] = None
    ground_truth: List[str] = []
    final_response_content: Optional[str] = None

    chat_session = db.query(ChatSession).filter(
        ChatSession.project_id == project_uuid,
        ChatSession.session_id == request.session_id
    ).first()

    if chat_session:
        db_agent_messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == chat_session.id,
            ChatMessage.message_type == 'agent'
        ).order_by(ChatMessage.created_at).all()

        if db_agent_messages:
            db_final_response = db_agent_messages[-1]
            final_response_content = db_final_response.content
            ground_truth = [m.content for m in db_agent_messages[:-1]
                            ] if len(db_agent_messages) > 1 else []

    # If DB doesn't have messages yet, fallback to request payload
    if not final_response_content:
        if not request.final_response:
            raise HTTPException(
                status_code=404,
                detail="No messages found for evaluation. Provide final_response and agent_messages or ensure chat history is stored."
            )
        final_response_content = request.final_response
        ground_truth = request.agent_messages or []

    # Ensure chat session and messages are persisted if missing
    if not chat_session:
        chat_session = ChatSession(
            project_id=project_uuid,
            session_id=request.session_id
        )
        db.add(chat_session)
        db.commit()
        db.refresh(chat_session)

    # If there are no agent messages persisted yet but we have ground truth and final, store them
    existing_count = db.query(ChatMessage).filter(
        ChatMessage.session_id == chat_session.id,
        ChatMessage.message_type == 'agent'
    ).count()

    if existing_count == 0 and (ground_truth or final_response_content):
        try:
            # Insert prior agent messages first
            for content in ground_truth:
                msg = ChatMessage(
                    session_id=chat_session.id,
                    message_type='agent',
                    content=content,
                    agent_name='agent'
                )
                db.add(msg)
            # Insert final response last
            if final_response_content:
                final_msg = ChatMessage(
                    session_id=chat_session.id,
                    message_type='agent',
                    content=final_response_content,
                    agent_name='agent'
                )
                db.add(final_msg)
            db.commit()
            # Update db_final_response handle if we just inserted it
            db_final_response = db.query(ChatMessage).filter(
                ChatMessage.session_id == chat_session.id,
                ChatMessage.message_type == 'agent'
            ).order_by(ChatMessage.created_at).all()
            if db_final_response:
                db_final_response = db_final_response[-1]
        except Exception:
            db.rollback()

    # Perform evaluation
    evaluation_results = {}

    for metric in request.selected_metrics:
        if metric == "coherence":
            evaluation_results[metric] = calculate_coherence(
                final_response_content)
        elif metric == "confidence_score":
            evaluation_results[metric] = calculate_confidence_score(
                final_response_content)
        elif metric == "relevance":
            evaluation_results[metric] = calculate_relevance(
                final_response_content, ground_truth)
        elif metric == "completeness":
            evaluation_results[metric] = calculate_completeness(
                final_response_content)
        elif metric == "consistency":
            evaluation_results[metric] = calculate_consistency(
                final_response_content, ground_truth)
        elif metric == "clarity":
            evaluation_results[metric] = calculate_clarity(
                final_response_content)

    # Save evaluation results
    try:
        evaluation_record = EvaluationMetrics(
            project_id=project_uuid,
            session_id=request.session_id,
            final_response_id=(
                db_final_response.id if db_final_response else None),
            selected_metrics=json.dumps(request.selected_metrics),
            evaluation_results=json.dumps(evaluation_results)
        )
        db.add(evaluation_record)
        db.commit()
    except Exception:
        # If table not present or other persistence issue, continue by returning results
        db.rollback()

    return EvaluationResponse(
        project_id=request.project_id,
        session_id=request.session_id,
        selected_metrics=request.selected_metrics,
        evaluation_results=evaluation_results,
        final_response=final_response_content,
        ground_truth=ground_truth
    )


def calculate_coherence(text: str) -> float:
    """Healthcare context: Clinical logical flow indicators, higher baseline."""
    if not text or not text.strip():
        return 0.0
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if len(sentences) == 1:
        return 0.78
    elif len(sentences) == 0:
        return 0.0

    transition_words = [
        'however', 'therefore', 'furthermore', 'first', 'second', 'third', 'next', 'then', 'finally',
        'moreover', 'in summary', 'in conclusion', 'based on assessment', 'as a result', 'from clinical experience',
        'suggests', 'indicates', 'patient reports', 'diagnosed', 'treated'
    ]
    transition_count = sum(
        1 for word in transition_words if word.lower() in text.lower())
    transition_score = min(1.0, 0.7 + (transition_count * 0.1))
    sentence_lengths = [len(s.split()) for s in sentences]
    avg_length = np.mean(sentence_lengths)
    length_score = 0.85 if avg_length >= 4 else 0.7
    proper_sentences = sum(1 for s in sentences if s and s[0].isupper())
    structure_score = 0.75 + (proper_sentences / len(sentences)) * 0.15
    coherence_score = max(
        0.72, (transition_score * 0.4 + length_score * 0.3 + structure_score * 0.3))
    return round(coherence_score, 3)


def calculate_confidence_score(text: str) -> float:
    """Healthcare context: Factual, guideline-based statements boost score."""
    if not text or not text.strip():
        return 0.0
    base_confidence = 0.75
    confident_words = [
        'definitely', 'confirmed', 'proven', 'established', 'evidence shows', 'guidelines recommend', 'studies indicate',
        'observed', 'diagnosed', 'treated', 'managed', 'successfully', 'negative', 'positive'
    ]
    uncertain_words = [
        'may', 'might', 'could', 'possibly', 'suggests', 'potential', 'uncertain', 'unclear', 'suspected', 'presumed'
    ]
    text_lower = text.lower()
    confident_count = sum(1 for word in confident_words if word in text_lower)
    uncertain_count = sum(1 for word in uncertain_words if word in text_lower)
    if confident_count > 0:
        base_confidence += min(0.2, confident_count * 0.05)
    if uncertain_count > 0:
        base_confidence -= min(0.15, uncertain_count * 0.1)
    definitive_patterns = [r'\bis\s', r'\bare\s', r'\bwill\s', r'\bcan\s', r'\bdoes\s', r'\bhas\s', r'\bhave\s',
                           r'normal', r'abnormal', r'expected']
    definitive_count = sum(
        1 for pattern in definitive_patterns if re.search(pattern, text_lower))
    if definitive_count > 0:
        base_confidence += min(0.1, definitive_count * 0.02)
    return round(min(max(base_confidence, 0.7), 1.0), 3)


def calculate_relevance(text: str, ground_truth: List[str]) -> float:
    """Healthcare context: Medical terms, patient details, higher baseline."""
    if not text or not text.strip():
        return 0.0
    base_relevance = 0.75
    healthcare_keywords = [
        'patient', 'diagnosis', 'treatment', 'symptoms', 'prescription', 'history', 'assessment', 'plan', 'follow-up',
        'laboratory', 'test', 'medication', 'encounter', 'allergy', 'vital signs', 'risk factors', 'impression', 'progress', 'outcome'
    ]
    keyword_bonus = sum(
        1 for kw in healthcare_keywords if kw in text.lower()) * 0.02
    if not ground_truth:
        return min(base_relevance + keyword_bonus, 1.0)
    all_ground_truth = ' '.join(ground_truth)
    try:
        vectorizer = TfidfVectorizer(stop_words='english', ngram_range=(1, 2))
        tfidf_matrix = vectorizer.fit_transform([text, all_ground_truth])
        similarity = cosine_similarity(
            tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        relevance_score = max(
            base_relevance, base_relevance + similarity * 0.25 + keyword_bonus)
    except Exception:
        text_words = set(text.lower().split())
        ground_words = set(all_ground_truth.lower().split())
        stop_words = {'the', 'a', 'an', 'and',
                      'or', 'but', 'is', 'are', 'was', 'were'}
        text_words = text_words - stop_words
        ground_words = ground_words - stop_words
        if ground_words:
            overlap = len(text_words.intersection(ground_words))
            relevance_score = base_relevance + \
                (overlap / len(ground_words)) * 0.2 + keyword_bonus
        else:
            relevance_score = base_relevance + keyword_bonus
    return round(min(relevance_score, 1.0), 3)


def calculate_completeness(text: str) -> float:
    """Healthcare context: SOAP structure and medical info rewarded."""
    if not text or not text.strip():
        return 0.0
    word_count = len(text.split())
    if word_count < 10:
        base_score = 0.5
    elif word_count < 30:
        base_score = 0.7
    elif word_count < 100:
        base_score = 0.85
    else:
        base_score = 0.9
    soap_indicators = ['subjective', 'objective', 'assessment', 'plan']
    completeness_indicators = [
        'diagnosis', 'history', 'physical exam', 'treatment', 'lab results', 'progress', 'recommend', 'monitor', 'follow-up'
    ]
    bonus = sum(1 for ind in soap_indicators if ind in text.lower()) * 0.05 \
        + sum(1 for ind in completeness_indicators if ind in text.lower()) * 0.03
    completeness_score = min(1.0, base_score + bonus)
    return round(completeness_score, 3)


def calculate_consistency(text: str, ground_truth: List[str]) -> float:
    """Healthcare context: Matching clinical findings/conclusions increases score."""
    if not text or not text.strip():
        return 0.0
    base_consistency = 0.8
    if not ground_truth:
        return base_consistency
    try:
        vectorizer = TfidfVectorizer(stop_words='english', ngram_range=(1, 2))
        all_texts = [text] + ground_truth
        tfidf_matrix = vectorizer.fit_transform(all_texts)
        similarities = [cosine_similarity(
            tfidf_matrix[0:1], tfidf_matrix[i:i+1])[0][0] for i in range(1, len(all_texts))]
        avg_similarity = np.mean(similarities) if similarities else 0.5
        consistency_score = max(
            base_consistency, base_consistency + avg_similarity * 0.1)
    except Exception:
        text_words = set(text.lower().split())
        consistency_scores = []
        for gt_text in ground_truth:
            gt_words = set(gt_text.lower().split())
            if gt_words:
                intersection = text_words.intersection(gt_words)
                if intersection:
                    consistency_scores.append(0.8)
                else:
                    consistency_scores.append(0.75)
        consistency_score = np.mean(
            consistency_scores) if consistency_scores else base_consistency
    contradiction_patterns = [
        ('no fever', 'fever'), ('normal', 'abnormal'), ('negative', 'positive'),
        ('improved', 'worsened'), ('no allergy', 'allergy'), ('stable', 'unstable')
    ]
    text_lower = text.lower()
    major_contradiction = False
    for gt_text in ground_truth:
        gt_lower = gt_text.lower()
        for neg, pos in contradiction_patterns:
            if (neg in text_lower and pos in gt_lower) or (pos in text_lower and neg in gt_lower):
                major_contradiction = True
                break
    if major_contradiction:
        consistency_score -= 0.2
    return round(max(min(consistency_score, 1.0), 0.7), 3)


def calculate_clarity(text: str) -> float:
    """Healthcare context: Favors clear, structured clinical language."""
    if not text or not text.strip():
        return 0.0
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences:
        return 0.0
    base_clarity = 0.8
    words = text.split()
    total_words = len(words)
    avg_sentence_length = total_words / len(sentences)
    sentence_score = 0.95 if 8 <= avg_sentence_length <= 30 else 0.8
    structure_indicators = ['assessment:', 'plan:', 'diagnosis:', 'medication:',
                            'history:', 'recommendation:', 'steps:', 'symptoms included', 'vital signs']
    has_structure = any(ind in text.lower() for ind in structure_indicators)
    medical_terms = ['symptoms', 'pain', 'diagnosis', 'follow-up', 'progress',
                     'recommend', 'medication', 'lab results', 'treatment', 'management', 'impression']
    med_term_bonus = sum(
        1 for mt in medical_terms if mt in text.lower()) * 0.015
    proper_sentences = sum(1 for s in sentences if s and s[0].isupper())
    grammar_score = 0.85 + (proper_sentences / len(sentences)) * 0.1
    clarity_score = max(base_clarity, sentence_score * 0.3 + grammar_score *
                        0.3 + (0.92 if has_structure else 0.85) * 0.2 + med_term_bonus)
    return round(min(clarity_score, 1.0), 3)


# Example test
if __name__ == "__main__":
    test_text = """Patient is a 45-year-old male presenting with chest pain. History reveals hypertension. Assessment: possible angina. Plan: order ECG, start aspirin. Follow-up in two days."""
    test_ground = [
        "Patient presents with cardiovascular risk factors.",
        "Plan includes diagnostic workup and preventive interventions."
    ]
    print("Coherence:", calculate_coherence(test_text))
    print("Confidence:", calculate_confidence_score(test_text))
    print("Relevance:", calculate_relevance(test_text, test_ground))
    print("Completeness:", calculate_completeness(test_text))
    print("Consistency:", calculate_consistency(test_text, test_ground))
    print("Clarity:", calculate_clarity(test_text))
