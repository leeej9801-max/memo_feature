from settings import settings
from src.save_image import save_graph_image
from langchain_ollama import ChatOllama
import logging
from typing import Literal
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

# 1. 노드 이름을 상수로 관리하여 오타 방지
AGENT_1 = "agent_1"
AGENT_2 = "agent_2"

# 2. 에이전트 노드 정의 (LLM 호출 포함)
def agent_1(state: MessagesState) -> Command[Literal["agent_2"]]:
  logger.info("--- AGENT 1: LLM 호출 및 데이터 수집 중 ---")
  
  # 시스템 프롬프트나 지시 사항을 추가하여 LLM 호출
  instruction = "당신은 데이터 수집 전문가입니다. 사용자의 요청에 대해 수집 계획을 세워주세요."
  messages = [{"role": "system", "content": instruction}] + state["messages"]
  
  # 실제 LLM 호출
  response = llm.invoke(messages)
  
  return Command(
    update={"messages": [response]}, # 중요: goto 값을 상수로 지정하여 "agent_2"가 전달
    goto=AGENT_2
  )

def agent_2(state: MessagesState) -> Command[Literal["__end__"]]:
  logger.info("--- AGENT 2: LLM 호출 및 분석 중 ---")
  
  # 이전 단계(Agent 1)의 결과를 포함하여 분석 지시
  instruction = "당신은 데이터 분석가입니다. 전달받은 수집 데이터를 바탕으로 심층 분석을 수행하세요."
  messages = [{"role": "system", "content": instruction}] + state["messages"]
  
  # 실제 LLM 호출
  response = llm.invoke(messages)
  
  return Command(
    update={"messages": [response]},
    goto=END
  )

# 3. 실행 함수
def run():
  try:
    # 워크플로우 구성
    workflow = StateGraph(MessagesState)
    workflow.add_node(AGENT_1, agent_1)
    workflow.add_node(AGENT_2, agent_2)
    workflow.add_edge(START, AGENT_1)

    # 체크포인트 및 컴파일
    memory = MemorySaver()
    graph = workflow.compile(checkpointer=memory)
    save_graph_image(graph)

    # 실행 설정
    config = {"configurable": {"thread_id": "test_session_123"}}
    
    # 첫 번째 입력
    inputs = {"messages": [HumanMessage(content="최신 인공지능 트렌드에 대해 조사해줘.")]}
    
    # 스트리밍 실행 및 결과 출력
    for event in graph.stream(inputs, config, stream_mode="values"):
      if "messages" in event and event["messages"]:
        last_msg = event["messages"][-1]
        logger.info(f"\n[{last_msg.type.upper()}]:\n{last_msg.content}\n")
        logger.info("-" * 30)

  except Exception as e:
    logger.error(f"실행 중 오류 발생: {str(e)}")

if __name__ == "__main__":
  run()
