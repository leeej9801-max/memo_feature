
import uuid
from typing import List, Annotated
import operator
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

class MemoState(TypedDict):
    messages: list
    context: dict
    agent_trace: Annotated[list, operator.add]

def context_node(state: MemoState):
    print("In context_node")
    return {"agent_trace": ["context"]}

def get_memo_graph():
    workflow = StateGraph(MemoState)
    workflow.add_node("context_node", context_node)
    workflow.add_edge(START, "context_node")
    workflow.add_edge("context_node", END)
    return workflow.compile()

try:
    graph = get_memo_graph()
    state = {"messages": [], "context": {"row_id": str(uuid.uuid4())}, "agent_trace": []}
    output = graph.invoke(state)
    print("Graph execution successful:", output)
except Exception as e:
    print("Graph execution failed:", str(e))
