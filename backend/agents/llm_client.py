import os
import requests
from langchain_ollama import ChatOllama

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://192.168.0.105:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma3:4b")

llm = ChatOllama(
    model=LLM_MODEL,
    base_url=OLLAMA_BASE_URL,
    timeout=30,
)

def check_ollama_health():
    """Ollama 상태 체크. 모델이 로드 가능한지 확인합니다."""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        if resp.status_code == 200:
            models = resp.json().get("models", [])
            model_names = [m.get("name") for m in models]
            if not any(LLM_MODEL in m for m in model_names):
                return False, f"{LLM_MODEL} 모델이 Ollama에 설치되어 있지 않습니다. 설치된 모델: {model_names}"
            return True, "OK"
        return False, f"Ollama endpoint /api/tags returned {resp.status_code}"
    except Exception as e:
        return False, f"Ollama 연결 실패: {str(e)}"
