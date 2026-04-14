from settings import settings
from src.save_image import save_graph_image
from langchain_ollama import ChatOllama
import logging
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import create_react_agent
from langgraph_swarm import create_handoff_tool, create_swarm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

llm = ChatOllama(
  model=settings.ollama_model_name,
  base_url=settings.ollama_base_url,
)

# def search(query: str) -> dict:
#   """Search the web for a query.

#   Args:
#     query: query string
#   """
#   return None

# def find_emotion(situation: str, emotion: str) -> dict:
#   """If the user makes emotional, Separate the problem situation from the user’s emotions.

#   Args:
#     situation: problem situation string
#     emotion: user's emotion string
#   """
#   return None
def search(query: str) -> dict:
    """[Tagent 도구] 사용자의 발언에서 논리적 오류를 'AI가 직접' 분석합니다."""
    
    # 함수 내부에서 다시 AI에게 물어보는 로직을 넣습니다.
    analysis_prompt = f"다음 문장에서 논리적 오류나 객관적 사실만 추출해줘: {query}"
    
    # 여기서 llm은 전역 변수로 선언된 것을 사용하거나 함수 안에서 새로 만듭니다.
    response = llm.invoke(analysis_prompt) 
    
    logger.info(f"--- [T-AI 내부 분석 중] ---")
    
    return {
        "fact_check": response.content, # AI가 분석한 실제 내용이 들어감
        "status": "T-AI 분석 완료"
    }

def find_emotion(situation: str, emotion: str) -> dict:
    """[Fagent 도구] 전달받은 상황과 감정을 'AI가 직접' 심리학적으로 해석합니다."""
    
    psychology_prompt = f"상황: {situation}, 감정: {emotion}. 이 상태를 심리학적으로 분석해줘."
    response = llm.invoke(psychology_prompt)
    
    logger.info(f"--- [F-AI 내부 분석 중] ---")
    
    return {
        "psychological_analysis": response.content, # AI의 심리학적 해석이 들어감
        "status": "F-AI 분석 완료"
    }

t_agent = create_react_agent(
  llm,
  [search, create_handoff_tool(agent_name="Fagent", description="사용자가 감정적이거나 자학적인 발언을 하는 경우, Fagent로 이관하십시오.")],
  prompt="당신은 MBTI에서 T 기능을 담당하는 에이전트입니다. 질문에 합리적이고 논리적으로 답변해야 합니다.",
  name="Tagent",
)

f_agent = create_react_agent(
  llm,
  [find_emotion, create_handoff_tool(agent_name="Tagent", description="사용자가 질문을 하거나 해결책을 필요로 하는 경우, Tagent로 연결하세요. Tagent가 합리적이고 논리적인 답변을 제공할 수 있습니다.")],
  prompt="당신은 MBTI에서 F 기능을 담당하는 에이전트입니다. 질문에 공감하고 감정적으로 답변해야 합니다.",
  name="Fagent",
)

def run():
  try:
    checkpointer = InMemorySaver()
    workflow = create_swarm(
        [t_agent, f_agent],
        default_active_agent="Fagent"
    )
    graph = workflow.compile(checkpointer=checkpointer)
    save_graph_image(graph)

    config = {"configurable": {"thread_id": "test_session_123"}}
    while True:
      try:
        user_input = input("🧑‍💻 User: ")
        if user_input.lower() in ["quit", "exit", "q"]:
          logger.info("Goodbye!")
          break

        turn = graph.invoke(
          {"messages": [{"role": "user", "content": user_input}]},
          config,
        )
        messages = turn['messages']
        last_message = messages[-1]
        logger.info(last_message.content)
      except:
        break
  except Exception as e:
    logger.error(f"실행 중 오류 발생: {str(e)}")

if __name__ == "__main__":
  run()
