from app.services.llm import ask_llm


def analyze_symptoms(symptoms):

    prompt = f"""
    You are an AI medical assistant.

    Analyze these symptoms:

    {symptoms}

    Give:
    1. Possible condition
    2. Severity
    3. Basic advice

    Keep response short and clear.
    """

    response = ask_llm(prompt)

    return response