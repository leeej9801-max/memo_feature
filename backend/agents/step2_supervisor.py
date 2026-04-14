import logging
import operator
import uuid
import time
from typing import Literal, Dict, Any, List, TypedDict, Annotated, Optional
from langgraph.graph import StateGraph, START, END
import os

from database import SessionLocal
from models import FactCandidate, ApprovalLog, UserAccount, ActionType
from agents.llm_client import llm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- State ---
class MemoState(TypedDict):
    messages: list
    context: dict
    
    actor_context: dict
    fact_context: dict
    thread_history: List[dict]
    
    memo_type: str
    refined_text: str
    
    agent_trace: Annotated[list, operator.add]
    error_stage: str
    error_detail: str
    fallback_used: bool
    
    payload: dict

# --- Nodes ---

def context_node(state: MemoState):
    start_time = time.time()
    db = SessionLocal()
    try:
        row_id = state["context"].get("row_id")
        rid = uuid.UUID(row_id)
        
        # 1. Fetch Fact Context
        fact = db.query(FactCandidate).filter(FactCandidate.id == rid).first()
        fact_info = {
            "metric_id": fact.metric_id if fact else "Unknown",
            "issue_group_code": fact.issue_group_code if fact else "Unknown",
            "department": fact.department.name if fact and fact.department else "Unassigned"
        }
        
        # 2. Fetch Thread History (Recent 3)
        logs = db.query(ApprovalLog).filter(
            ApprovalLog.fact_candidate_id == rid,
            ApprovalLog.action.in_([ActionType.comment, ActionType.request_changes])
        ).order_by(ApprovalLog.logged_at.desc()).limit(3).all()
        history = [{"actor": l.meta_data.get("actor_name", "Unknown") if l.meta_data else "Unknown", "message": l.comment} for l in reversed(logs)]
        
        # 3. Actor Context
        actor = {
            "id": state["context"].get("user_id"),
            "name": state["context"].get("name"),
            "email": state["context"].get("email"),
            "role": state["context"].get("role_code"),
            "company_id": state["context"].get("company_id")
        }
        
        logger.info(f"Context Agent finished in {time.time()-start_time:.2f}s")
        return {
            "fact_context": fact_info,
            "thread_history": history,
            "actor_context": actor,
            "agent_trace": ["context"]
        }
    finally:
        db.close()

def intent_node(state: MemoState):
    start_time = time.time()
    user_prompt = state["messages"][-1]["content"] if state["messages"] else ""
    history_str = "\n".join([f"- {h['actor']}: {h['message']}" for h in state.get("thread_history", [])])
    
    system_prompt = f"""You are a classifier for ESG collaboration.
Metric: {state['fact_context'].get('metric_id')}
Dept: {state['fact_context'].get('department')}
Recent Thread:
{history_str}

Categories: 'comment', 'question', 'evidence_request', 'correction_request'.
Output ONLY the category name."""

    try:
        response = llm.invoke([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
        m_type = response.content.strip().lower()
        matched = "comment"
        for vt in ["comment", "question", "evidence_request", "correction_request"]:
            if vt in m_type: matched = vt; break
        logger.info(f"Intent Agent finished in {time.time()-start_time:.2f}s")
        return {"memo_type": matched, "agent_trace": ["intent"]}
    except Exception as e:
        logger.error(f"Intent Error: {e}")
        return {"memo_type": "comment", "fallback_used": True, "error_stage": "intent", "error_detail": str(e), "agent_trace": ["intent_fallback"]}

def tone_node(state: MemoState):
    start_time = time.time()
    user_prompt = state["messages"][-1]["content"] if state["messages"] else ""
    system_prompt = "Rewrite the input into a professional Korean business sentence for ESG audits. Return ONLY the text."

    try:
        response = llm.invoke([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
        logger.info(f"Tone Agent finished in {time.time()-start_time:.2f}s")
        return {"refined_text": response.content.strip(), "agent_trace": ["tone"]}
    except Exception as e:
        return {"refined_text": user_prompt, "fallback_used": True, "error_stage": "tone", "error_detail": str(e), "agent_trace": ["tone_fallback"]}

def validation_node(state: MemoState):
    """지표와 메시지의 연관성 체크 (Supervisor 역할)"""
    start_time = time.time()
    user_prompt = state["messages"][-1]["content"] if state["messages"] else ""
    metric_id = state.get("fact_context", {}).get("metric_id")
    
    system_prompt = f"""You are an ESG Compliance Supervisor.
Check if the user's message is RELEVANT to the metric [{metric_id}].
If it is totally irrelevant (e.g., 'Hello', 'What's for lunch'), output 'REJECT'.
If it is relevant, output 'PROCEED'. Return ONLY one word."""
    
    try:
        response = llm.invoke([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
        decision = response.content.strip().upper()
        logger.info(f"Validation Agent finished in {time.time()-start_time:.2f}s: {decision}")
        return {"agent_trace": ["validation"], "memo_type": "rejected" if "REJECT" in decision else state.get("memo_type")}
    except Exception as e:
        return {"agent_trace": ["validation_error"]}

def router_node(state: MemoState):
    """Determine next step based on validation"""
    if "rejected" in state.get("memo_type", ""):
        return END
    return "intent_node"

def persist_node(state: MemoState):
    fc = state.get("fact_context", {})
    ac = state.get("actor_context", {})
    
    payload = {
        "raw_prompt": state["messages"][-1]["content"] if state["messages"] else "",
        "refined_message": state.get("refined_text", ""),
        "memo_type": state.get("memo_type", "comment"),
        
        "target_type": "fact_candidate",
        "target_id": state["context"].get("row_id"),
        "row_id": state["context"].get("row_id"),
        "metric_id": fc.get("metric_id"),
        "issue_group_code": fc.get("issue_group_code"),
        
        "company_id": ac.get("company_id"),
        "actor_user_id": ac.get("id"),
        "actor_email": ac.get("email"),
        "actor_name": ac.get("name"),
        "role_code": ac.get("role"),
        
        "agent_trace": state.get("agent_trace", []) + ["persist"],
        "fallback_used": state.get("fallback_used", False),
        "error_stage": state.get("error_stage"),
        "error_detail": state.get("error_detail")
    }
    return {"payload": payload, "agent_trace": ["persist"]}

# --- Construction ---

def get_memo_graph():
    workflow = StateGraph(MemoState)
    
    workflow.add_node("context_node", context_node)
    workflow.add_node("validation_node", validation_node)
    workflow.add_node("intent_node", intent_node)
    workflow.add_node("tone_node", tone_node)
    workflow.add_node("persist_node", persist_node)
    
    workflow.add_edge(START, "context_node")
    workflow.add_edge("context_node", "validation_node")
    
    # Conditional Routing (Supervisor Logic)
    workflow.add_conditional_edges(
        "validation_node",
        router_node,
        {
            "intent_node": "intent_node",
             END: END
        }
    )
    
    # Continue parallel if valid
    workflow.add_edge("intent_node", "tone_node")
    workflow.add_edge("tone_node", "persist_node")
    workflow.add_edge("persist_node", END)
    
    return workflow.compile()
