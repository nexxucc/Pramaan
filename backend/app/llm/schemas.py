from pydantic import BaseModel


class ProposalOutput(BaseModel):
    validity_score: float
    draft_response: str
    citations: list[str]
