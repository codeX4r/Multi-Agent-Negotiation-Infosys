from fastapi import FastAPI

app = FastAPI(
    title="Negotiation Arena API",
    description="AI-driven multi-agent negotiation platform",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "negotiation-arena-api",
    }
