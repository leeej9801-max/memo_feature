from settings import settings
from src.save_image import save_graph_image
from langchain_ollama import ChatOllama
import logging
from typing import Literal
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

llm = ChatOllama(
  model=settings.ollama_model_name,
  base_url=settings.ollama_base_url,
)

# 1. 상수 및 LLM 설정
SUPERVISOR = "supervisor"
COLLECTOR = "collector"
ANALYST = "analyst"

# 2. 에이전트 노드: 데이터 수집가
def collector_node(state: MessagesState) -> Command[Literal["supervisor"]]:
    logger.info("--- [Collector] 작업 중 ---")
    messages = [{"role": "system", "content": "당신은 데이터 수집 전문가입니다."}] + state["messages"]
    response = llm.invoke(messages)
    # 작업 완료 후 반드시 Supervisor에게 돌아가 판단을 받습니다.
    return Command(update={"messages": [response]}, goto=SUPERVISOR)

# 3. 에이전트 노드: 분석가
def analyst_node(state: MessagesState) -> Command[Literal["supervisor"]]:
    logger.info("--- [Analyst] 작업 중 ---")
    messages = [{"role": "system", "content": "당신은 데이터 분석 전문가입니다."}] + state["messages"]
    response = llm.invoke(messages)
    return Command(update={"messages": [response]}, goto=SUPERVISOR)

# 4. 관리자 노드: Supervisor
def supervisor_node(state: MessagesState) -> Command[Literal["collector", "analyst", "__end__"]]:
    logger.info("--- [Supervisor] 다음 단계 결정 중 ---")
    
    # 관리자용 프롬프트: 다음에 누가 일을 해야 할지 결정
    options = [COLLECTOR, ANALYST, "FINISH"]
    system_prompt = (
        f"당신은 팀의 관리자입니다. 사용자의 요청을 해결하기 위해 다음 중 누구에게 일을 시킬지 결정하세요: {options}. "
        "모든 작업이 완료되었다면 'FINISH'라고 답하세요. "
        "오직 다음 작업자의 이름만 출력하세요."
    )
    
    messages = [{"role": "system", "content": system_prompt}] + state["messages"]
    decision = llm.invoke(messages).content.strip()

    # 결정에 따른 라우팅
    if "FINISH" in decision.upper():
        return Command(goto=END)
    elif COLLECTOR in decision.lower():
        return Command(goto=COLLECTOR)
    elif ANALYST in decision.lower():
        return Command(goto=ANALYST)
    else:
        # 모호할 경우 종료하거나 기본값 지정
        return Command(goto=END)

# 5. 그래프 빌드 및 실행
def run():
  try:
    workflow = StateGraph(MessagesState)

    # 노드 추가
    workflow.add_node(SUPERVISOR, supervisor_node)
    workflow.add_node(COLLECTOR, collector_node)
    workflow.add_node(ANALYST, analyst_node)

    # 시작점 설정: 항상 관리자가 먼저 판단
    workflow.add_edge(START, SUPERVISOR)

    # 체크포인트 및 컴파일
    memory = MemorySaver()
    graph = workflow.compile(checkpointer=memory)
    save_graph_image(graph)

    # 실행 테스트
    config = {"configurable": {"thread_id": "test_session_123"}}
    inputs = {"messages": [HumanMessage(content="최신 인공지능 트렌드에 대해서 요약해줘")]}
    for event in graph.stream(inputs, config, stream_mode="values"):
      if "messages" in event:
        last_msg = event["messages"][-1]
        logger.info(f"[{last_msg.type}]: {last_msg.content[:50]}...")
  except Exception as e:
    logger.error(f"실행 중 오류 발생: {str(e)}")

if __name__ == "__main__":
  run()
