export function getEnvironmentConfig() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY || "",
    // gpt-5-mini is the model this project uses — a decision, not a placeholder
    // waiting to be upgraded. The account's key reaches exactly two models,
    // gpt-5-mini and gpt-4o-mini, and this is the chosen one.
    //
    // It is a reasoning model, which the generation path is already shaped for:
    // the call goes through the Responses API and sets neither temperature nor
    // a token cap, both of which the older Chat Completions shape would have
    // had to give up here.
    //
    // If generated questions come out weak, the levers are the prompt and the
    // size of the bank, not the model.
    openAiModel: process.env.OPENAI_MODEL || "gpt-5-mini"
  };
}
