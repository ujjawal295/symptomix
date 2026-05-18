EMERGENCY_KEYWORDS = [
    "chest pain",
    "difficulty breathing",
    "unconscious",
    "stroke"
]

def check_emergency(symptoms):

    symptoms = symptoms.lower()

    for word in EMERGENCY_KEYWORDS:

        if word in symptoms:
            return True

    return False