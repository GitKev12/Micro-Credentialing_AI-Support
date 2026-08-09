export function getEnvironmentConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    // gpt-4o-mini is the model this project uses — a decision, not a placeholder
    // waiting to be upgraded. Writing multiple-choice questions from lesson text
    // that is handed to the model in the prompt does not need a larger one, and
    // the account's key reaches only gpt-4o and gpt-4o-mini in any case.
    //
    // If generated questions come out weak, the levers are the prompt and the
    // size of the bank, not the model.
    openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini"
  };
}
