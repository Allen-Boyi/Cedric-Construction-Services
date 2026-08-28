import os
from groq import Groq
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import uvicorn
import sys

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
allowed_origin = os.getenv("ALLOWED_ORIGIN", "*")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

SYSTEM_INSTRUCTIONS = (
    "You are Tatenda, a professional support consultant for Cedric Construction. "
    "Expertise: Tiling, flooring, and general construction. "
    "Tone: Friendly, helpful, and concise. "
    "Goal: Answer questions about services. If they want a quote, tell them to use the 'Get a Free Quote' button. "
    "Location: Wallacedene, Kraaifontein, Cape Town, South Africa, and surrounding areas. https://maps.google.com/?q=Wallacedene,Kraaifontein,Cape+Town,South+Africa. "
    "Contact: https://wa.me/27849614552, Phone +27849614552"
)

def ask_tatenda(user_message: str) -> str:
    response = client.chat.completions.create(
        model="llama-3.3-70b-specdec",  # Updated to valid Groq Llama 3.3 model name
        messages=[
            {"role": "system", "content": SYSTEM_INSTRUCTIONS},
            {"role": "user", "content": user_message}
        ],
        temperature=0.7,
        max_completion_tokens=1024,
    )
    return response.choices[0].message.content

@app.post("/api/chat")
async def chat_with_tatenda(request: ChatRequest):
    try:
        reply = ask_tatenda(request.message)
        print(f"\n[API] User: {request.message}")
        print(f"[API] Tatenda: {reply}")
        return {"response": reply}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Tatenda is offline.")

def run_terminal_test():
    print("\n--- Tatenda Terminal Test (Groq) ---")
    while True:
        user_input = input("You: ").strip()
        if not user_input:
            continue
        if user_input.lower() in ['exit', 'quit']:
            break
        try:
            reply = ask_tatenda(user_input)
            print(f"Tatenda: {reply}\n")
        except Exception as e:
            print(f"[Error] {e}\n")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        run_terminal_test()
    else:
        uvicorn.run("index:app", host="0.0.0.0", port=8000, reload=True)
