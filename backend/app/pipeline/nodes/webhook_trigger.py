from app.pipeline.state import PipelineState


def webhook_trigger(state: PipelineState) -> PipelineState:
    # stub: raw_payload already set by caller from Razorpay payment.dispute.created
    return state
