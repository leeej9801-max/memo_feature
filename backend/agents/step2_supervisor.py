import logging
from typing import Literal, Dict, Any, List
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

llm = ChatOllama(
  model="gemma2", # Adjust to the default available in user's ollama env, often llama2, llama3 or gemma2
  base_url="http://localhost:11434",
)

def context_node(state: dict) -> Command[Literal["intent_agent"]]:
    logger.info("--- [Context Agent] ---")
    # Context is pre-injected by the router, so we just acknowledge it and pass through.
    trace = state.get("agent_trace", []) + ["context"]
    return Command(update={"agent_trace": trace}, goto="intent_agent")

def intent_node(state: dict) -> Command[Literal["tone_agent"]]:
    logger.info("--- [Intent Agent] ---")
    user_prompt = state["messages"][-1]["content"] if state["messages"] else ""
    messages = [
        {"role": "system", "content": "You are an classifier. Map the message to exactly one of the following: 'comment', 'question', 'evidence_request', 'correction_request'. Output only the category string."},
        {"role": "user", "content": user_prompt}
    ]
    try:
        response = llm.invoke(messages)
        memo_type = response.content.strip().lower()
        
        # Normalizing
        valid_types = ["comment", "question", "evidence_request", "correction_request"]
        matched_type = "comment"
        for v in valid_types:
            if v in memo_type:
                matched_type = v
                break
    except Exception as e:
        logger.error(f"Ollama bypass (Intent): {e}")
        matched_type = "comment"

    trace = state.get("agent_trace", []) + ["intent"]
    return Command(update={"memo_type": matched_type, "agent_trace": trace}, goto="tone_agent")

def tone_node(state: dict) -> Command[Literal["persist_agent"]]:
    logger.info("--- [Tone Agent] ---")
    user_prompt = state["messages"][-1]["content"] if state["messages"] else ""
    messages = [
        {"role": "system", "content": "Rewrite the following input into a polite, professional Korean business sentence. Return only the rewritten Korean text."},
        {"role": "user", "content": user_prompt}
    ]
    try:
        response = llm.invoke(messages)
        refined_text = response.content.strip()
    except Exception as e:
        logger.error(f"Ollama bypass (Tone): {e}")
        refined_text = "[AI 우회 작동 중] " + user_prompt
    
    trace = state.get("agent_trace", []) + ["tone"]
    return Command(update={"refined_text": refined_text, "agent_trace": trace}, goto="persist_agent")

def persist_node(state: dict) -> Command[Literal["__end__"]]:
    logger.info("--- [Persist Agent] ---")
    
    context = state.get("context", {})
    payload = {
        "raw_prompt": state["messages"][-1]["content"] if state["messages"] else "",
        "refined_message": state.get("refined_text", ""),
        "memo_type": state.get("memo_type", "comment"),
        "agent_trace": state.get("agent_trace", []) + ["persist"],
        "row_id": context.get("row_id"),
        "metric_id": context.get("metric_id"),
        "issue_group_code": context.get("issue_group_code")
    }
    return Command(update={"payload": payload}, goto=END)

def get_memo_graph():
    workflow = StateGraph(dict) 
    workflow.add_node("context_agent", context_node)
    workflow.add_node("intent_agent", intent_node)
    workflow.add_node("tone_agent", tone_node)
    workflow.add_node("persist_agent", persist_node)
    
    workflow.add_edge(START, "context_agent")
    
    return workflow.compile()
